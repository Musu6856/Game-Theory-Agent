import type {
  AgentCheckpoint,
  AgentRun,
  AgentRunAction,
  AgentStep,
  ResearchProject,
} from "../types";
import {
  appendTraceEvent,
  createAgentRun,
  updateStepStatus,
} from "./state.ts";

export type AgentResumeRequest = {
  runId: string;
  checkpointId?: string;
};

export type CreateResumableRunInput = {
  project: ResearchProject;
  resume?: AgentResumeRequest;
  fallback: {
    id: string;
    action?: AgentRunAction;
    goal: string;
    now: number;
    plan: AgentStep[];
  };
};

export function createResumableAgentRun({
  project,
  resume,
  fallback,
}: CreateResumableRunInput): AgentRun {
  const run = resume?.runId
    ? getLatestAgentRunById(project, resume.runId)
    : undefined;

  if (!run) {
    return createAgentRun(fallback);
  }

  return createResumeRun({
    run,
    checkpointId: resume?.checkpointId,
    now: fallback.now,
    fallbackPlan: fallback.plan,
  });
}

export function createResumeRun({
  run,
  checkpointId,
  now,
  fallbackPlan,
}: {
  run: AgentRun;
  checkpointId?: string;
  now?: number;
  fallbackPlan?: AgentStep[];
}): AgentRun {
  const resumeCheckpoint =
    findResumeCheckpoint(run, checkpointId) ??
    getLatestCheckpoint(run, ["failed", "running"]);
  const resumeStepId =
    resumeCheckpoint?.stepId ??
    run.currentStepId ??
    run.plan.find((step) => step.status === "failed")?.id ??
    run.plan.find((step) => step.status === "running")?.id;
  const plan = run.plan.length > 0 ? run.plan : (fallbackPlan ?? []);
  const baseRun: AgentRun = {
    ...run,
    status: "running",
    plan: plan.map((step) =>
      step.id === resumeStepId
        ? { ...step, status: "pending" }
        : step.status === "running" || step.status === "failed"
          ? { ...step, status: "pending" }
          : step
    ),
    currentStepId: undefined,
    pauseReason: undefined,
    requiresApproval: false,
    completedAt: undefined,
  };

  const tracedRun = appendTraceEvent(
    baseRun,
    {
      stepId: resumeStepId,
      type: "fallback",
      message: resumeCheckpoint
        ? `从检查点“${resumeCheckpoint.title}”恢复 Agent 执行。`
        : "恢复 Agent 执行。",
      metadata: {
        resumedFromRunId: run.id,
        resumedFromCheckpointId: resumeCheckpoint?.id,
        resumedFromStepId: resumeStepId,
      },
    },
    now
  );

  return resumeStepId
    ? updateStepStatusWithResumeMetadata(
        tracedRun,
        resumeStepId,
        "running",
        now,
        {
          resumedFromCheckpointId: resumeCheckpoint?.id,
          resumedFromStepId: resumeStepId,
        }
      )
    : tracedRun;
}

export function getLatestAgentRunById(
  project: Pick<ResearchProject, "researchSession"> | null | undefined,
  runId: string
) {
  const history = project?.researchSession?.agentRunHistory ?? [];
  const runFromHistory = history.findLast?.((run) => run.id === runId) ??
    [...history].reverse().find((run) => run.id === runId);
  if (runFromHistory) return runFromHistory;

  const current = project?.researchSession?.agentRun;
  return current?.id === runId ? current : undefined;
}

export function shouldSkipCompletedStep(run: AgentRun, stepId: string) {
  const resumeStepId = getResumeStepId(run);
  if (!resumeStepId || resumeStepId === stepId) return false;

  const step = run.plan.find((item) => item.id === stepId);
  if (step?.status !== "completed") return false;

  return run.plan.findIndex((item) => item.id === stepId) <
    run.plan.findIndex((item) => item.id === resumeStepId);
}

function updateStepStatusWithResumeMetadata(
  run: AgentRun,
  stepId: string,
  status: AgentStep["status"],
  now: number | undefined,
  metadata: Record<string, unknown>
) {
  const updated = updateStepStatus(run, stepId, status, now);
  const checkpoints = updated.checkpoints ?? [];
  const last = checkpoints.at(-1);
  if (!last || last.stepId !== stepId || last.status !== status) {
    return updated;
  }

  return {
    ...updated,
    checkpoints: [
      ...checkpoints.slice(0, -1),
      {
        ...last,
        metadata: {
          ...last.metadata,
          ...metadata,
        },
      },
    ],
  };
}

function findResumeCheckpoint(run: AgentRun, checkpointId?: string) {
  if (!checkpointId) return undefined;
  return run.checkpoints?.find((checkpoint) => checkpoint.id === checkpointId);
}

function getLatestCheckpoint(
  run: AgentRun,
  statuses: AgentCheckpoint["status"][]
) {
  return (run.checkpoints ?? [])
    .filter((checkpoint) => statuses.includes(checkpoint.status))
    .at(-1);
}

function getResumeStepId(run: AgentRun) {
  const checkpoint = getLatestCheckpoint(run, ["running"]);
  const resumedFromStepId = checkpoint?.metadata?.resumedFromStepId;
  return typeof resumedFromStepId === "string"
    ? resumedFromStepId
    : checkpoint?.stepId ?? run.currentStepId;
}
