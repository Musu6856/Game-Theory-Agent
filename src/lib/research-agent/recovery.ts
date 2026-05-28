import type {
  AgentCheckpoint,
  AgentRun,
  ResearchAssetKind,
  ResearchProject,
} from "../types";
import {
  planSafeContinuation,
  recommendNextAgentStep,
  type AgentExecutableAction,
  type NextAgentRecommendation,
} from "./controller.ts";
import type { ResearchAssetsTab } from "../research-flow.ts";

export type AgentRecoveryActionKind =
  | AgentExecutableAction
  | "confirm_model"
  | "safe_continue";

export type AgentRecoverySuggestion = {
  status: "retryable" | "continuable" | "review_required";
  title: string;
  reason: string;
  targetTab: ResearchAssetsTab;
  actionKind?: AgentRecoveryActionKind;
  runId: string;
  checkpoint?: AgentCheckpoint;
};

export function getAgentRecoverySuggestion(
  project?: ResearchProject | null
): AgentRecoverySuggestion | null {
  const run = getLatestRecoverableRun(project);
  if (!project || !run) return null;

  const pendingPatch = project.researchSession?.assetPatches?.find(
    (patch) => patch.status === "proposed"
  );
  if (pendingPatch) {
    return {
      status: "review_required",
      title: "先处理上次暂停的审核点",
      reason:
        "上次 Agent 已经停在待审核修改建议处。请先应用或拒绝这条建议，再继续推进。",
      targetTab: getTabForPatchKind(pendingPatch.kind),
      runId: run.id,
      checkpoint: getLatestCheckpoint(run),
    };
  }

  if (isStaleRecoverableRun(project, run)) {
    return null;
  }

  if (run.status === "failed") {
    return createRetrySuggestion(project, run);
  }

  if (run.status === "paused" || run.status === "running") {
    return createContinuationSuggestion(project, run);
  }

  return null;
}

function isStaleRecoverableRun(project: ResearchProject, run: AgentRun) {
  if (run.requiresApproval && hasPatchDecisionAfterRun(project, run)) {
    return true;
  }

  if (run.status !== "running") {
    return false;
  }

  const hasActiveCheckpoint = Boolean(
    getLatestCheckpointsByStep(run).some(
      (checkpoint) => checkpoint.status === "running"
    )
  );
  const hasActiveStep = Boolean(
    run.currentStepId || run.plan.some((step) => step.status === "running")
  );

  return !hasActiveCheckpoint && !hasActiveStep;
}

function getLatestCheckpointsByStep(run: AgentRun) {
  const byStepId = new Map<string, AgentCheckpoint>();
  for (const checkpoint of run.checkpoints ?? []) {
    byStepId.set(checkpoint.stepId, checkpoint);
  }
  return [...byStepId.values()];
}

function hasPatchDecisionAfterRun(project: ResearchProject, run: AgentRun) {
  const runTime = run.completedAt ?? run.startedAt;
  return Boolean(
    project.researchSession?.assetVersionHistory?.some(
      (event) =>
        (event.action === "applied_patch" || event.action === "rejected_patch") &&
        event.createdAt >= runTime
    )
  );
}

function getLatestRecoverableRun(project?: ResearchProject | null) {
  const history = project?.researchSession?.agentRunHistory ?? [];
  const latest = history.at(-1) ?? project?.researchSession?.agentRun;
  if (!latest) return null;
  return latest.status === "failed" ||
    latest.status === "paused" ||
    latest.status === "running"
    ? latest
    : null;
}

function createRetrySuggestion(
  project: ResearchProject,
  run: AgentRun
): AgentRecoverySuggestion | null {
  const recommendation = recommendNextAgentStep(project);
  const actionKind = getRecoveryActionKind(recommendation);
  if (!actionKind) return null;

  return {
    status: "retryable",
    title: "重试上次中断的 Agent 步骤",
    reason: getRetryReason(recommendation, run),
    targetTab: recommendation.targetTab,
    actionKind,
    runId: run.id,
    checkpoint: getLatestCheckpoint(run, ["failed", "running"]),
  };
}

function createContinuationSuggestion(
  project: ResearchProject,
  run: AgentRun
): AgentRecoverySuggestion | null {
  const plan = planSafeContinuation(project);
  if (plan.status !== "ready" || plan.steps.length === 0) {
    return null;
  }

  return {
    status: "continuable",
    title:
      run.status === "running"
        ? "恢复未完成的 Agent 推进"
        : "继续上次暂停的 Agent 推进",
    reason:
      run.pauseReason ??
      "可以按当前资产状态继续推进，并在下一个需要人工审核的位置停下。",
    targetTab: plan.targetTab,
    actionKind: "safe_continue",
    runId: run.id,
    checkpoint: getLatestCheckpoint(run, ["running", "completed"]),
  };
}

function getRecoveryActionKind(
  recommendation: NextAgentRecommendation
): AgentRecoveryActionKind | null {
  if (recommendation.status !== "ready" || !recommendation.action) {
    return null;
  }

  if (recommendation.action.kind === "choose_direction") {
    return null;
  }

  if (recommendation.action.kind === "confirm_model") {
    return "confirm_model";
  }

  return recommendation.action.agentAction ?? null;
}

function getRetryReason(
  recommendation: NextAgentRecommendation,
  run: AgentRun
) {
  const checkpoint = getLatestCheckpoint(run, ["failed"]);
  const failedStep = run.plan.find((step) => step.status === "failed");
  const stepTitle = checkpoint?.title ?? failedStep?.title;
  const stepText = stepTitle
    ? `上次失败在检查点“${stepTitle}”。`
    : "";
  return `${stepText}${recommendation.reason}`;
}

function getLatestCheckpoint(
  run: AgentRun,
  statuses?: AgentCheckpoint["status"][]
) {
  const checkpoints = run.checkpoints ?? [];
  const matched = statuses
    ? checkpoints.filter((checkpoint) => statuses.includes(checkpoint.status))
    : checkpoints;
  return matched.at(-1);
}

function getTabForPatchKind(kind: ResearchAssetKind): ResearchAssetsTab {
  switch (kind) {
    case "model":
      return "model";
    case "equilibrium":
      return "equilibrium";
    case "properties":
      return "properties";
    case "paper":
      return "paper";
  }
}
