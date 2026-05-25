import type {
  AgentCheckpoint,
  AgentRun,
  AgentRunAction,
  AgentStep,
  AgentTraceEvent,
  EvidencePack,
  EvidenceSource,
  EvidenceSourceType,
} from "../types";

export type {
  AgentCheckpoint,
  AgentRun,
  AgentStep,
  AgentTraceEvent,
  EvidencePack,
  EvidenceSource,
  EvidenceSourceType,
};

export function createAgentRun({
  id,
  action,
  goal,
  now = Date.now(),
  plan,
}: {
  id: string;
  action?: AgentRunAction;
  goal: string;
  now?: number;
  plan: AgentStep[];
}): AgentRun {
  return {
    id,
    action,
    goal,
    status: "running",
    plan,
    checkpoints: [],
    trace: [],
    startedAt: now,
  };
}

export function appendTraceEvent(
  run: AgentRun,
  event: Omit<AgentTraceEvent, "id" | "runId" | "createdAt"> & {
    createdAt?: number;
  },
  now = Date.now()
): AgentRun {
  const nextEvent: AgentTraceEvent = {
    id: `trace-${run.trace.length + 1}`,
    runId: run.id,
    createdAt: event.createdAt ?? now,
    ...event,
  };

  return {
    ...run,
    trace: [...run.trace, nextEvent],
  };
}

export function updateStepStatus(
  run: AgentRun,
  stepId: string,
  status: AgentStep["status"],
  now = Date.now(),
  metadata?: Record<string, unknown>
): AgentRun {
  const step = run.plan.find((item) => item.id === stepId);
  const nextCurrentStepId = status === "running" ? stepId : (
    run.currentStepId === stepId ? undefined : run.currentStepId
  );
  const checkpoint = step
    ? createCheckpoint(run, step, status, now, metadata)
    : undefined;

  return {
    ...run,
    currentStepId: nextCurrentStepId,
    plan: run.plan.map((step) =>
      step.id === stepId ? { ...step, status } : step
    ),
    checkpoints: checkpoint
      ? [...(run.checkpoints ?? []), checkpoint]
      : run.checkpoints,
    ...(status === "failed" ? { status: "failed" as const, completedAt: now } : {}),
  };
}

export function completeAgentRun(run: AgentRun, now = Date.now()): AgentRun {
  const completionCheckpoints = run.plan
    .filter((step) => step.status === "pending" || step.status === "running")
    .map((step, index) =>
      createCheckpoint(run, step, "completed", now, {
        sequenceOffset: index,
        completedByRunFinalization: true,
      })
    );

  return {
    ...run,
    status: "completed",
    currentStepId: undefined,
    completedAt: now,
    checkpoints: [...(run.checkpoints ?? []), ...completionCheckpoints],
    plan: run.plan.map((step) =>
      step.status === "pending" || step.status === "running"
        ? { ...step, status: "completed" }
        : step
    ),
  };
}

function createCheckpoint(
  run: AgentRun,
  step: AgentStep,
  status: AgentStep["status"],
  now: number,
  metadata?: Record<string, unknown>
): AgentCheckpoint {
  return {
    id: `checkpoint-${(run.checkpoints?.length ?? 0) + 1 + getSequenceOffset(metadata)}`,
    runId: run.id,
    stepId: step.id,
    title: step.title,
    status,
    toolName: step.toolName,
    createdAt: now,
    metadata: {
      ...(step.status !== status ? { previousStatus: step.status } : {}),
      ...metadata,
    },
  };
}

function getSequenceOffset(metadata?: Record<string, unknown>) {
  const value = metadata?.sequenceOffset;
  return typeof value === "number" ? value : 0;
}
