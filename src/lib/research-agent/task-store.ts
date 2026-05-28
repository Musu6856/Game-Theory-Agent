import { and, asc, desc, eq, lte, or, sql } from "drizzle-orm";
import type {
  AgentTask,
  AgentTaskCheckpoint,
  AgentTaskInput,
  AgentTaskResult,
  AgentTaskStatus,
} from "../types";

interface AgentTaskRow {
  id: string;
  ownerId: string;
  projectId: string;
  action: AgentTask["action"];
  status: AgentTaskStatus;
  input: AgentTask["input"];
  checkpoints: AgentTaskCheckpoint[];
  workerId: string | null;
  leaseUntil: Date | null;
  result: unknown;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  failedAt: Date | null;
}

export type LocalAgentTaskStatus = AgentTaskStatus;
export type LocalAgentTaskCheckpoint = AgentTaskCheckpoint;
export type LocalAgentTask = AgentTask;

interface CreateLocalAgentTaskInput {
  id: string;
  ownerId: string;
  projectId: string;
  action: AgentTask["action"];
  input?: AgentTaskInput | Record<string, unknown>;
  now?: number;
}

interface ClaimLocalAgentTaskInput {
  id: string;
  ownerId: string;
  workerId: string;
  leaseUntil: number;
  now?: number;
}

interface RenewLocalAgentTaskLeaseInput {
  id: string;
  ownerId: string;
  workerId: string;
  leaseUntil: number;
  now?: number;
}

interface AppendLocalAgentTaskCheckpointInput {
  id: string;
  ownerId: string;
  workerId?: string;
  checkpoint: LocalAgentTaskCheckpoint;
  now?: number;
}

interface CompleteLocalAgentTaskInput {
  id: string;
  ownerId: string;
  workerId?: string;
  result?: AgentTaskResult | unknown;
  now?: number;
}

interface FailLocalAgentTaskInput {
  id: string;
  ownerId: string;
  workerId?: string;
  error: string;
  now?: number;
}

const localTasksByOwner = new Map<string, LocalAgentTask[]>();
const TASK_DB_RETRY_DELAYS_MS = [200, 800];

type StoreModeInput = {
  forceLocal?: boolean;
};

type ClaimableAgentTaskListInput = StoreModeInput & {
  now?: number;
  limit?: number;
};

type CreateAgentTaskInput = CreateLocalAgentTaskInput & StoreModeInput;

type ClaimAgentTaskInput = Omit<ClaimLocalAgentTaskInput, "leaseUntil"> &
  StoreModeInput & {
    leaseMs: number;
  };

type RenewAgentTaskLeaseInput = Omit<
  RenewLocalAgentTaskLeaseInput,
  "leaseUntil"
> &
  StoreModeInput & {
    leaseMs: number;
  };

type AppendAgentTaskCheckpointInput =
  AppendLocalAgentTaskCheckpointInput & StoreModeInput;

type CompleteAgentTaskInput = CompleteLocalAgentTaskInput & StoreModeInput;

type FailAgentTaskInput = FailLocalAgentTaskInput & StoreModeInput;

export function createLocalAgentTask({
  id,
  ownerId,
  projectId,
  action,
  input = {},
  now = Date.now(),
}: CreateLocalAgentTaskInput) {
  const task: LocalAgentTask = {
    id,
    ownerId,
    projectId,
    action,
    status: "queued",
    input: stripSensitiveTaskValue(input) as AgentTask["input"],
    checkpoints: [],
    createdAt: now,
    updatedAt: now,
  };

  const current = localTasksByOwner.get(ownerId) ?? [];
  localTasksByOwner.set(ownerId, [
    task,
    ...current.filter((item) => item.id !== id),
  ]);
  return task;
}

export async function createAgentTask(input: CreateAgentTaskInput) {
  if (shouldUseLocalAgentTaskStore(input)) {
    return createLocalAgentTask(input);
  }

  const { getDb, agentTasks } = await getTaskDb();
  const now = input.now ?? Date.now();
  const [row] = await runTaskDbOperationWithRetry(() =>
    getDb()
      .insert(agentTasks)
      .values({
        id: input.id,
        ownerId: input.ownerId,
        projectId: input.projectId,
        action: input.action,
        status: "queued",
        input: stripSensitiveTaskValue(input.input ?? {}) as AgentTask["input"],
        checkpoints: [],
        createdAt: new Date(now),
        updatedAt: new Date(now),
      })
      .returning()
  );

  return agentTaskFromRow(row);
}

export function claimLocalAgentTask({
  id,
  ownerId,
  workerId,
  leaseUntil,
  now = Date.now(),
}: ClaimLocalAgentTaskInput) {
  return updateLocalAgentTask(ownerId, id, (task) => {
    if (!canClaimTask(task, now)) return null;

    return {
      ...task,
      status: "running",
      workerId,
      leaseUntil,
      updatedAt: now,
    };
  });
}

export async function claimAgentTask({
  leaseMs,
  forceLocal,
  ...input
}: ClaimAgentTaskInput) {
  const now = input.now ?? Date.now();

  if (shouldUseLocalAgentTaskStore({ forceLocal })) {
    return claimLocalAgentTask({
      ...input,
      leaseUntil: now + leaseMs,
      now,
    });
  }

  const { getDb, agentTasks } = await getTaskDb();
  const [row] = await runTaskDbOperationWithRetry(() =>
    getDb()
      .update(agentTasks)
      .set({
        status: "running",
        workerId: input.workerId,
        leaseUntil: new Date(now + leaseMs),
        updatedAt: new Date(now),
      })
      .where(
        and(
          eq(agentTasks.id, input.id),
          eq(agentTasks.ownerId, input.ownerId),
          or(
            eq(agentTasks.status, "queued"),
            and(
              eq(agentTasks.status, "running"),
              lte(agentTasks.leaseUntil, new Date(now))
            )
          )
        )
      )
      .returning()
  );

  return row ? agentTaskFromRow(row) : null;
}

export function renewLocalAgentTaskLease({
  id,
  ownerId,
  workerId,
  leaseUntil,
  now = Date.now(),
}: RenewLocalAgentTaskLeaseInput) {
  return updateLocalAgentTask(ownerId, id, (task) => {
    if (task.status !== "running" || task.workerId !== workerId) return null;

    return {
      ...task,
      leaseUntil,
      updatedAt: now,
    };
  });
}

export async function renewAgentTaskLease({
  leaseMs,
  forceLocal,
  ...input
}: RenewAgentTaskLeaseInput) {
  const now = input.now ?? Date.now();

  if (shouldUseLocalAgentTaskStore({ forceLocal })) {
    return renewLocalAgentTaskLease({
      ...input,
      leaseUntil: now + leaseMs,
      now,
    });
  }

  const { getDb, agentTasks } = await getTaskDb();
  const [row] = await runTaskDbOperationWithRetry(() =>
    getDb()
      .update(agentTasks)
      .set({
        leaseUntil: new Date(now + leaseMs),
        updatedAt: new Date(now),
      })
      .where(
        and(
          eq(agentTasks.id, input.id),
          eq(agentTasks.ownerId, input.ownerId),
          eq(agentTasks.workerId, input.workerId),
          eq(agentTasks.status, "running")
        )
      )
      .returning()
  );

  return row ? agentTaskFromRow(row) : null;
}

export function appendLocalAgentTaskCheckpoint({
  id,
  ownerId,
  workerId,
  checkpoint,
  now = Date.now(),
}: AppendLocalAgentTaskCheckpointInput) {
  return updateLocalAgentTask(ownerId, id, (task) => {
    if (!canMutateTaskAsWorker(task, workerId)) return null;
    return {
      ...task,
      checkpoints: [
        ...task.checkpoints,
        stripSensitiveTaskValue(checkpoint) as AgentTaskCheckpoint,
      ],
      updatedAt: now,
    };
  });
}

export async function appendAgentTaskCheckpoint({
  forceLocal,
  ...input
}: AppendAgentTaskCheckpointInput) {
  if (shouldUseLocalAgentTaskStore({ forceLocal })) {
    return appendLocalAgentTaskCheckpoint(input);
  }

  const current = await getAgentTask(input.ownerId, input.id);
  if (!current) return null;
  if (!canMutateTaskAsWorker(current, input.workerId)) return null;

  const { getDb, agentTasks } = await getTaskDb();
  const now = input.now ?? Date.now();
  const checkpoints = [
    ...current.checkpoints,
    stripSensitiveTaskValue(input.checkpoint) as AgentTaskCheckpoint,
  ];
  const [row] = await runTaskDbOperationWithRetry(() =>
    getDb()
      .update(agentTasks)
      .set({
        checkpoints: asJsonb(checkpoints),
        updatedAt: new Date(now),
      })
      .where(
        and(
          eq(agentTasks.id, input.id),
          eq(agentTasks.ownerId, input.ownerId),
          ...(input.workerId ? [eq(agentTasks.workerId, input.workerId)] : [])
        )
      )
      .returning()
  );

  return row ? agentTaskFromRow(row) : null;
}

export function completeLocalAgentTask({
  id,
  ownerId,
  workerId,
  result,
  now = Date.now(),
}: CompleteLocalAgentTaskInput) {
  return updateLocalAgentTask(ownerId, id, (task) => {
    if (!canMutateTaskAsWorker(task, workerId)) return null;
    return {
      ...task,
      status: "completed",
      result: stripSensitiveTaskValue(result),
      leaseUntil: undefined,
      updatedAt: now,
      completedAt: now,
    };
  });
}

export async function completeAgentTask({
  forceLocal,
  ...input
}: CompleteAgentTaskInput) {
  if (shouldUseLocalAgentTaskStore({ forceLocal })) {
    return completeLocalAgentTask(input);
  }

  const { getDb, agentTasks } = await getTaskDb();
  const now = input.now ?? Date.now();
  const [row] = await runTaskDbOperationWithRetry(() =>
    getDb()
      .update(agentTasks)
      .set({
        status: "completed",
        result: asJsonb(stripSensitiveTaskValue(input.result)),
        leaseUntil: null,
        updatedAt: new Date(now),
        completedAt: new Date(now),
      })
      .where(
        and(
          eq(agentTasks.id, input.id),
          eq(agentTasks.ownerId, input.ownerId),
          ...(input.workerId ? [eq(agentTasks.workerId, input.workerId)] : [])
        )
      )
      .returning()
  );

  return row ? agentTaskFromRow(row) : null;
}

export function failLocalAgentTask({
  id,
  ownerId,
  workerId,
  error,
  now = Date.now(),
}: FailLocalAgentTaskInput) {
  return updateLocalAgentTask(ownerId, id, (task) => {
    if (!canMutateTaskAsWorker(task, workerId)) return null;
    return {
      ...task,
      status: "failed",
      error,
      leaseUntil: undefined,
      updatedAt: now,
      failedAt: now,
    };
  });
}

export async function failAgentTask({
  forceLocal,
  ...input
}: FailAgentTaskInput) {
  if (shouldUseLocalAgentTaskStore({ forceLocal })) {
    return failLocalAgentTask(input);
  }

  const { getDb, agentTasks } = await getTaskDb();
  const now = input.now ?? Date.now();
  const [row] = await runTaskDbOperationWithRetry(() =>
    getDb()
      .update(agentTasks)
      .set({
        status: "failed",
        error: input.error,
        leaseUntil: null,
        updatedAt: new Date(now),
        failedAt: new Date(now),
      })
      .where(
        and(
          eq(agentTasks.id, input.id),
          eq(agentTasks.ownerId, input.ownerId),
          ...(input.workerId ? [eq(agentTasks.workerId, input.workerId)] : [])
        )
      )
      .returning()
  );

  return row ? agentTaskFromRow(row) : null;
}

export function getLocalAgentTask(ownerId: string, id: string) {
  return (
    localTasksByOwner.get(ownerId)?.find((task) => task.id === id) ?? null
  );
}

export async function getAgentTask(
  ownerId: string,
  id: string,
  options: StoreModeInput = {}
) {
  if (shouldUseLocalAgentTaskStore(options)) {
    return getLocalAgentTask(ownerId, id);
  }

  const { getDb, agentTasks } = await getTaskDb();
  const [row] = await runTaskDbOperationWithRetry(() =>
    getDb()
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.id, id), eq(agentTasks.ownerId, ownerId)))
      .limit(1)
  );

  return row ? agentTaskFromRow(row) : null;
}

export function listLocalAgentTasksForProject(
  ownerId: string,
  projectId: string
) {
  return [...(localTasksByOwner.get(ownerId) ?? [])]
    .filter((task) => task.projectId === projectId)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function listAgentTasksForProject(
  ownerId: string,
  projectId: string,
  options: StoreModeInput = {}
) {
  if (shouldUseLocalAgentTaskStore(options)) {
    return listLocalAgentTasksForProject(ownerId, projectId);
  }

  const { getDb, agentTasks } = await getTaskDb();
  const rows = await runTaskDbOperationWithRetry(() =>
    getDb()
      .select()
      .from(agentTasks)
      .where(and(eq(agentTasks.ownerId, ownerId), eq(agentTasks.projectId, projectId)))
      .orderBy(desc(agentTasks.createdAt))
  );

  return rows.map(agentTaskFromRow);
}

export function listLocalClaimableAgentTasks({
  now = Date.now(),
  limit,
}: ClaimableAgentTaskListInput = {}) {
  return applyTaskListLimit(
    [...localTasksByOwner.values()]
      .flat()
      .filter((task) => canClaimTask(task, now))
      .sort((left, right) => left.createdAt - right.createdAt),
    limit
  );
}

export async function listClaimableAgentTasks({
  now = Date.now(),
  limit,
  forceLocal,
}: ClaimableAgentTaskListInput = {}) {
  if (shouldUseLocalAgentTaskStore({ forceLocal })) {
    return listLocalClaimableAgentTasks({ now, limit });
  }

  const { getDb, agentTasks } = await getTaskDb();
  const query = getDb()
    .select()
    .from(agentTasks)
    .where(
      or(
        eq(agentTasks.status, "queued"),
        and(
          eq(agentTasks.status, "running"),
          lte(agentTasks.leaseUntil, new Date(now))
        )
      )
    )
    .orderBy(asc(agentTasks.createdAt));
  const rows = await runTaskDbOperationWithRetry(() =>
    typeof limit === "number" && limit >= 0
      ? query.limit(Math.floor(limit))
      : query
  );

  return rows.map(agentTaskFromRow);
}

export function clearLocalAgentTaskStore() {
  localTasksByOwner.clear();
}

function updateLocalAgentTask(
  ownerId: string,
  id: string,
  update: (task: LocalAgentTask) => LocalAgentTask | null
) {
  const current = localTasksByOwner.get(ownerId) ?? [];
  const index = current.findIndex((task) => task.id === id);
  if (index === -1) return null;

  const nextTask = update(current[index]);
  if (!nextTask) return null;

  const next = current.map((task, taskIndex) =>
    taskIndex === index ? nextTask : task
  );
  localTasksByOwner.set(ownerId, next);
  return nextTask;
}

function canClaimTask(task: LocalAgentTask, now: number) {
  if (task.status === "queued") return true;
  if (task.status !== "running") return false;
  return typeof task.leaseUntil === "number" && task.leaseUntil <= now;
}

function canMutateTaskAsWorker(task: AgentTask, workerId?: string) {
  return !workerId || task.workerId === workerId;
}

function applyTaskListLimit<T>(items: T[], limit?: number) {
  if (typeof limit !== "number") return items;
  if (limit <= 0) return [];
  return items.slice(0, Math.floor(limit));
}

export async function runTaskDbOperationWithRetry<T>(
  operation: () => Promise<T>,
  { retryDelaysMs = TASK_DB_RETRY_DELAYS_MS }: { retryDelaysMs?: number[] } = {}
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retryDelaysMs.length || !isTransientTaskDbError(error)) {
        throw error;
      }
      const delayMs = retryDelaysMs[attempt];
      if (delayMs > 0) await delay(delayMs);
    }
  }

  throw lastError;
}

export function agentTaskFromRow(row: AgentTaskRow): AgentTask {
  return redactAgentTaskForOutput({
    id: row.id,
    ownerId: row.ownerId,
    projectId: row.projectId,
    action: row.action,
    status: row.status,
    input: row.input,
    checkpoints: row.checkpoints,
    workerId: row.workerId ?? undefined,
    leaseUntil: toTimestamp(row.leaseUntil),
    result: row.result ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    completedAt: toTimestamp(row.completedAt),
    failedAt: toTimestamp(row.failedAt),
  });
}

function redactAgentTaskForOutput(task: AgentTask): AgentTask {
  return {
    ...task,
    input: stripSensitiveTaskValue(task.input) as AgentTask["input"],
    checkpoints: stripSensitiveTaskValue(task.checkpoints) as AgentTaskCheckpoint[],
    result: stripSensitiveTaskValue(task.result),
  };
}

function stripSensitiveTaskValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitiveTaskValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveTaskKey(key))
      .map(([key, entry]) => [key, stripSensitiveTaskValue(entry)])
  );
}

function isSensitiveTaskKey(key: string) {
  const normalized = key.toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return (
    compact === "runtimemodelsource" ||
    compact === "authorization" ||
    compact === "apikey" ||
    compact === "xapikey" ||
    compact.endsWith("apikey") ||
    compact === "token" ||
    compact.endsWith("token") ||
    compact === "secret" ||
    compact.endsWith("secret") ||
    compact.includes("secretkey")
  );
}

function shouldUseLocalAgentTaskStore({ forceLocal }: StoreModeInput = {}) {
  return (
    forceLocal === true ||
    (process.env.NODE_ENV === "development" && !process.env.DATABASE_URL)
  );
}

function asJsonb(value: unknown) {
  return sql`${JSON.stringify(value ?? null)}::jsonb`;
}

function toTimestamp(value: Date | null | undefined) {
  return value ? value.getTime() : undefined;
}

function isTransientTaskDbError(error: unknown) {
  return collectErrorText(error).some((text) => {
    const normalized = text.toLowerCase();
    return (
      normalized.includes("fetch failed") ||
      normalized.includes("econnreset") ||
      normalized.includes("etimedout") ||
      normalized.includes("eai_again") ||
      normalized.includes("und_err_socket") ||
      normalized.includes("socket disconnected") ||
      normalized.includes("client network socket disconnected") ||
      normalized.includes("connection terminated") ||
      normalized.includes("connection timeout") ||
      normalized.includes("error connecting to database")
    );
  });
}

function collectErrorText(error: unknown) {
  const details: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      details.push(current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === "object" && "cause" in current) {
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    if (typeof current === "string") details.push(current);
    break;
  }

  return details;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTaskDb() {
  const [{ getDb }, { agentTasks }] = await Promise.all([
    import("../../db/index.ts"),
    import("../../db/schema.ts"),
  ]);

  return { getDb, agentTasks };
}
