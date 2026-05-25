import { createInitialResearchSession } from "../research-session.ts";
import type {
  AgentRun,
  ResearchProject,
} from "../types";
import type {
  SafeContinuationPlan,
  SafeContinuationStep,
} from "./controller.ts";
import {
  appendTraceEvent,
  createAgentRun,
  updateStepStatus,
} from "./state.ts";

const MAX_AGENT_RUN_HISTORY = 20;

export type SafeContinuationTraceInput = {
  plan: SafeContinuationPlan;
  executedSteps: SafeContinuationStep[];
  finalPlan: SafeContinuationPlan;
  now?: number;
};

export function appendAgentRunToProject(
  project: ResearchProject,
  agentRun: AgentRun
): ResearchProject {
  const session =
    project.researchSession ?? createInitialResearchSession(project.rawIdea);
  const previousRuns = session.agentRunHistory ?? (
    session.agentRun ? [session.agentRun] : []
  );
  const nextHistory = [
    ...previousRuns.filter((run) => run.id !== agentRun.id),
    agentRun,
  ].slice(-MAX_AGENT_RUN_HISTORY);

  return {
    ...project,
    researchSession: {
      ...session,
      agentRun,
      agentRunHistory: nextHistory,
    },
  };
}

export function appendSafeContinuationTrace(
  project: ResearchProject,
  {
    plan,
    executedSteps,
    finalPlan,
    now = Date.now(),
  }: SafeContinuationTraceInput
): ResearchProject {
  const runStatus = getControllerRunStatus(finalPlan);
  let run = createAgentRun({
    id: `agent-controller-${now}`,
    action: "safe_continue",
    goal: "推进到下一个审核点",
    now,
    plan: [
      {
        id: "safe-continuation",
        kind: "reflection",
        title: plan.title,
        status: "pending",
      },
    ],
  });

  run = updateStepStatus(run, "safe-continuation", "running", now);

  run = appendTraceEvent(
    run,
    {
      type: "plan_created",
      message: "记录本次安全连续推进计划。",
      metadata: {
        plannedSteps: plan.steps.map(formatSafeContinuationStep),
        targetTab: plan.targetTab,
        initialStatus: plan.status,
        initialStopReason: plan.stopReason,
      },
    },
    now
  );

  if (executedSteps.length > 0) {
    run = appendTraceEvent(
      run,
      {
        stepId: "safe-continuation",
        type: "tool_result",
        message: "已执行安全连续推进步骤。",
        metadata: {
          executedSteps: executedSteps.map(formatSafeContinuationStep),
        },
      },
      now
    );
  }

  run = appendTraceEvent(
    run,
    {
      stepId: "safe-continuation",
      type: finalPlan.status === "blocked" ? "fallback" : "tool_result",
      message: getSafeContinuationStopMessage(finalPlan),
      metadata: {
        executedSteps: executedSteps.map(formatSafeContinuationStep),
        finalStatus: finalPlan.status,
        finalStopReason: finalPlan.stopReason,
        blockerKind: finalPlan.blocker?.kind,
        targetTab: finalPlan.targetTab,
      },
    },
    now
  );

  run = updateStepStatus(
    run,
    "safe-continuation",
    runStatus === "completed" ? "completed" : "skipped",
    now
  );

  run = {
    ...run,
    status: runStatus,
    currentStepId: undefined,
    pauseReason: getSafeContinuationPauseReason(finalPlan),
    requiresApproval: finalPlan.status !== "complete",
    completedAt: now,
  };

  return appendAgentRunToProject(project, run);
}

function formatSafeContinuationStep(step: SafeContinuationStep) {
  return {
    kind: step.kind,
    agentAction: step.agentAction,
    targetTab: step.targetTab,
    label: step.label,
  };
}

function getControllerRunStatus(
  finalPlan: SafeContinuationPlan
): AgentRun["status"] {
  if (finalPlan.status === "complete") return "completed";
  return "paused";
}

function getSafeContinuationPauseReason(plan: SafeContinuationPlan) {
  if (plan.status === "complete") return undefined;
  return plan.blocker?.description ?? plan.reason;
}

function getSafeContinuationStopMessage(plan: SafeContinuationPlan) {
  switch (plan.stopReason) {
    case "approval_required":
      return "已停在下一个需要人工审核的位置。";
    case "manual_choice_required":
      return "已停下等待用户选择研究方向。";
    case "complete":
      return "当前研究闭环已经完成。";
    case "blocked":
      return "连续推进被当前阻塞项暂停。";
    default:
      return plan.reason;
  }
}
