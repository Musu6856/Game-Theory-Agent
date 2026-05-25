import type {
  AgentRun,
  ResearchAssetPatch,
  ResearchProject,
  ResearchSession,
} from "../types";
import {
  appendTraceEvent,
  updateStepStatus,
} from "./state.ts";

export type ProposedPatchStepResult = {
  agentRun: AgentRun;
  patch: ResearchAssetPatch;
  reused: boolean;
};

export function recordProposedPatchStep({
  agentRun,
  project,
  patch,
  stepId,
  now,
  message,
  changedPaths,
}: {
  agentRun: AgentRun;
  project: Pick<ResearchProject, "researchSession">;
  patch: ResearchAssetPatch;
  stepId: string;
  now: number;
  message: string;
  changedPaths?: string[];
}): ProposedPatchStepResult {
  const existingPatch = findReusableProposedPatch({
    session: project.researchSession,
    patch,
    run: agentRun,
    stepId,
  });
  const finalPatch = existingPatch ?? patch;
  const reused = Boolean(existingPatch);

  let nextRun = updateStepStatus(agentRun, stepId, "running", now);
  nextRun = appendTraceEvent(
    nextRun,
    {
      stepId,
      type: "tool_result",
      message: reused
        ? "Reused the existing reviewable patch for this resumed Agent step."
        : message,
      metadata: {
        patchId: finalPatch.id,
        changeCount: finalPatch.changes.length,
        ...(changedPaths ? { changedPaths } : {}),
        ...(reused ? { reusedPatchId: finalPatch.id } : {}),
      },
    },
    now
  );
  nextRun = updateStepStatus(nextRun, stepId, "completed", now, {
    patchId: finalPatch.id,
    patchKind: finalPatch.kind,
    changedPaths: changedPaths ?? finalPatch.changes.map((change) => change.path),
    stopReason: "approval_required",
    reusedPatch: reused,
  });

  return {
    agentRun: nextRun,
    patch: finalPatch,
    reused,
  };
}

export function appendOrReplaceProposedPatch(
  patches: ResearchAssetPatch[],
  patch: ResearchAssetPatch
) {
  return [
    ...patches.filter((item) => item.id !== patch.id),
    patch,
  ];
}

function findReusableProposedPatch({
  session,
  patch,
  run,
  stepId,
}: {
  session?: ResearchSession;
  patch: ResearchAssetPatch;
  run: AgentRun;
  stepId: string;
}) {
  const checkpointPatchId = session?.agentRunHistory
    ?.findLast?.((item) => item.id === run.id)
    ?.checkpoints?.findLast?.(
      (checkpoint) =>
        checkpoint.stepId === stepId &&
        checkpoint.status === "completed" &&
        typeof checkpoint.metadata?.patchId === "string"
    )
    ?.metadata?.patchId;
  const fallbackPatchId = session?.agentRun?.id === run.id
    ? session.agentRun.checkpoints
        ?.filter(
          (checkpoint) =>
            checkpoint.stepId === stepId &&
            checkpoint.status === "completed" &&
            typeof checkpoint.metadata?.patchId === "string"
        )
        .at(-1)?.metadata?.patchId
    : undefined;
  const patchId = typeof checkpointPatchId === "string"
    ? checkpointPatchId
    : typeof fallbackPatchId === "string"
      ? fallbackPatchId
      : undefined;

  if (patchId) {
    const byCheckpoint = session?.assetPatches?.find(
      (item) => item.id === patchId && item.status === "proposed"
    );
    if (byCheckpoint) return byCheckpoint;
  }

  if (!isResumedRun(run)) return undefined;

  return session?.assetPatches?.find(
    (item) =>
      item.status === "proposed" &&
      item.kind === patch.kind &&
      haveSamePatchShape(item, patch)
  );
}

function isResumedRun(run: AgentRun) {
  return (
    run.trace.some((event) => typeof event.metadata?.resumedFromRunId === "string") ||
    (run.checkpoints ?? []).some(
      (checkpoint) =>
        typeof checkpoint.metadata?.resumedFromCheckpointId === "string"
    )
  );
}

function haveSamePatchShape(left: ResearchAssetPatch, right: ResearchAssetPatch) {
  if (left.changes.length !== right.changes.length) return false;

  return left.changes.every((change, index) => {
    const other = right.changes[index];
    return Boolean(
      other &&
        change.kind === other.kind &&
        change.path === other.path
    );
  });
}
