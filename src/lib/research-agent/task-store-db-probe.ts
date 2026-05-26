import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index.ts";
import { agentTasks } from "../../db/schema.ts";
import type { AgentTaskStatus } from "../types";
import {
  appendAgentTaskCheckpoint,
  claimAgentTask,
  completeAgentTask,
  createAgentTask,
  getAgentTask,
} from "./task-store.ts";

export interface AgentTaskStoreDbLifecycleProbeInput {
  idPrefix?: string;
  ownerId?: string;
  projectId?: string;
  now?: number;
}

export interface AgentTaskStoreDbLifecycleProbeResult {
  ok: boolean;
  taskId: string;
  statuses: AgentTaskStatus[];
  checkpointCount: number;
  patchIds: string[];
  mathArtifactIds: string[];
  redactedSecrets: boolean;
  cleanedUp: boolean;
}

const DEFAULT_PROBE_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const PROBE_SECRET = "codex-db-probe-secret";

export async function runAgentTaskStoreDbLifecycleProbe({
  idPrefix = "agent-task-db-probe",
  ownerId,
  projectId = DEFAULT_PROBE_PROJECT_ID,
  now = Date.now(),
}: AgentTaskStoreDbLifecycleProbeInput = {}): Promise<AgentTaskStoreDbLifecycleProbeResult> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }

  const taskId = `${idPrefix}-${crypto.randomUUID()}`;
  const probeOwnerId = ownerId ?? `${idPrefix}-owner`;
  const workerId = `${idPrefix}-worker`;
  let cleanedUp = false;

  try {
    const created = await createAgentTask({
      id: taskId,
      ownerId: probeOwnerId,
      projectId,
      action: "solve_equilibrium",
      input: {
        rawIdea: "database lifecycle probe",
        action: "solve_equilibrium",
        projectId,
        runtimeModelSource: {
          source: "own",
          provider: "openai-compatible",
          apiKey: PROBE_SECRET,
          model: "probe-model",
        },
      },
      now,
      forceLocal: false,
    });

    const claimed = await claimAgentTask({
      id: taskId,
      ownerId: probeOwnerId,
      workerId,
      leaseMs: 60_000,
      now: now + 1_000,
      forceLocal: false,
    });
    if (!claimed) throw new Error("Probe task could not be claimed");

    const checkpointed = await appendAgentTaskCheckpoint({
      id: taskId,
      ownerId: probeOwnerId,
      workerId,
      checkpoint: {
        id: "checkpoint-db-probe",
        stepId: "review-equilibrium",
        status: "completed",
        title: "Persist DB probe checkpoint",
        createdAt: now + 2_000,
        metadata: {
          runId: "agent-run-db-probe",
          mathArtifactId: "artifact-db-probe",
          mathArtifactKind: "solver_attempt",
          mathArtifactSnapshot: {
            status: "passed",
            apiKey: PROBE_SECRET,
          },
        },
      },
      now: now + 2_000,
      forceLocal: false,
    });
    if (!checkpointed) {
      throw new Error("Probe checkpoint could not be persisted");
    }

    const completed = await completeAgentTask({
      id: taskId,
      ownerId: probeOwnerId,
      workerId,
      result: {
        projectId,
        runId: "agent-run-db-probe",
        patchIds: ["patch-db-probe"],
        mathArtifactIds: ["artifact-db-probe"],
        apiKey: PROBE_SECRET,
      },
      now: now + 3_000,
      forceLocal: false,
    });
    if (!completed) throw new Error("Probe task could not be completed");

    const fetched = await getAgentTask(probeOwnerId, taskId, {
      forceLocal: false,
    });
    if (!fetched) throw new Error("Probe task could not be fetched");

    const rawRows = await getDb()
      .select()
      .from(agentTasks)
      .where(
        and(eq(agentTasks.id, taskId), eq(agentTasks.ownerId, probeOwnerId))
      )
      .limit(1);
    const serialized = JSON.stringify([
      created,
      claimed,
      checkpointed,
      completed,
      fetched,
      rawRows,
    ]);

    cleanedUp = await deleteProbeTask(probeOwnerId, taskId);

    return {
      ok: fetched.status === "completed" && fetched.checkpoints.length === 1,
      taskId,
      statuses: [created.status, claimed.status, fetched.status],
      checkpointCount: fetched.checkpoints.length,
      patchIds: getStringList(completed.result, "patchIds"),
      mathArtifactIds: getStringList(completed.result, "mathArtifactIds"),
      redactedSecrets: !serialized.includes(PROBE_SECRET),
      cleanedUp,
    };
  } finally {
    if (!cleanedUp) {
      await deleteProbeTask(probeOwnerId, taskId);
    }
  }
}

async function deleteProbeTask(ownerId: string, taskId: string) {
  const rows = await getDb()
    .delete(agentTasks)
    .where(and(eq(agentTasks.id, taskId), eq(agentTasks.ownerId, ownerId)))
    .returning({ id: agentTasks.id });

  return rows.length > 0;
}

function getStringList(value: unknown, key: string) {
  if (!value || typeof value !== "object") return [];
  const entry = (value as Record<string, unknown>)[key];
  if (!Array.isArray(entry)) return [];
  return entry.filter((item): item is string => typeof item === "string");
}
