import type { AgentTask } from "../types";
import { runAgentTask, type AgentTaskRunRequest } from "./task-runner.ts";
import { listClaimableAgentTasks } from "./task-store.ts";

type AgentTaskWorkerRunTaskInput = Pick<
  AgentTaskRunRequest,
  "id" | "ownerId" | "workerId" | "leaseMs" | "now" | "forceLocal"
>;

type AgentTaskWorkerRunTask = (
  input: AgentTaskWorkerRunTaskInput
) => Promise<AgentTask>;

export interface AgentTaskWorkerBatchInput {
  workerId?: string;
  limit?: number;
  leaseMs?: number;
  now?: number;
  forceLocal?: boolean;
  runTask?: AgentTaskWorkerRunTask;
}

export interface AgentTaskWorkerBatchItem {
  id: string;
  ownerId: string;
  status: AgentTask["status"];
  error?: string;
}

export interface AgentTaskWorkerBatchResult {
  workerId: string;
  attempted: number;
  completed: number;
  failed: number;
  tasks: AgentTaskWorkerBatchItem[];
}

const DEFAULT_WORKER_BATCH_LIMIT = 3;
const DEFAULT_WORKER_LEASE_MS = 10 * 60 * 1000;

export async function runAgentTaskWorkerBatch({
  workerId = `worker-${crypto.randomUUID()}`,
  limit = DEFAULT_WORKER_BATCH_LIMIT,
  leaseMs = DEFAULT_WORKER_LEASE_MS,
  now = Date.now(),
  forceLocal,
  runTask = runAgentTask,
}: AgentTaskWorkerBatchInput = {}): Promise<AgentTaskWorkerBatchResult> {
  const claimableTasks = await listClaimableAgentTasks({
    now,
    limit,
    forceLocal,
  });
  const tasks: AgentTaskWorkerBatchItem[] = [];

  for (const task of claimableTasks) {
    try {
      const result = await runTask({
        id: task.id,
        ownerId: task.ownerId,
        workerId,
        leaseMs,
        now,
        forceLocal,
      });
      tasks.push({
        id: result.id,
        ownerId: result.ownerId,
        status: result.status,
        ...(result.error ? { error: result.error } : {}),
      });
    } catch (error) {
      tasks.push({
        id: task.id,
        ownerId: task.ownerId,
        status: "failed",
        error: error instanceof Error ? error.message : "Agent task failed",
      });
    }
  }

  return {
    workerId,
    attempted: claimableTasks.length,
    completed: tasks.filter((task) => task.status === "completed").length,
    failed: tasks.filter((task) => task.status === "failed").length,
    tasks,
  };
}
