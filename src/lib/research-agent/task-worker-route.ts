import { jsonError } from "../provider.ts";
import { authenticateAgentTaskWorkerRequest } from "./task-worker-auth.ts";
import {
  runAgentTaskWorkerBatch,
  type AgentTaskWorkerBatchInput,
  type AgentTaskWorkerBatchResult,
} from "./task-worker.ts";

type WorkerRouteRunBatch = (
  input: Pick<AgentTaskWorkerBatchInput, "workerId" | "limit" | "leaseMs">
) => Promise<AgentTaskWorkerBatchResult>;

export interface AgentTaskWorkerRouteInput {
  request: Request;
  secret?: string;
  secrets?: Array<string | undefined>;
  createWorkerId?: () => string;
  now?: () => number;
  runBatch?: WorkerRouteRunBatch;
}

const MAX_WORKER_BATCH_LIMIT = 3;
const MAX_WORKER_LEASE_MS = 15 * 60 * 1000;

export async function runAgentTaskWorkerRoute({
  request,
  secret,
  secrets,
  createWorkerId = () => `worker-route-${crypto.randomUUID()}`,
  now = Date.now,
  runBatch = runAgentTaskWorkerBatch,
}: AgentTaskWorkerRouteInput) {
  try {
    const startedAt = now();
    const method = request.method.toUpperCase();
    const auth = authenticateAgentTaskWorkerRequest({
      request,
      secret,
      secrets,
    });
    if (!auth.ok) return jsonError(auth.message, auth.status, auth.code);

    const parsedOptions =
      method === "POST"
        ? await parseWorkerBatchOptions(request)
        : { ok: true as const, options: {} };
    if (!parsedOptions.ok) {
      return jsonError(
        parsedOptions.message,
        parsedOptions.status,
        parsedOptions.code
      );
    }

    const workerId = createWorkerId();
    const batch = await runBatch({
      workerId,
      limit: parsedOptions.options.limit,
      leaseMs: parsedOptions.options.leaseMs,
    });
    const finishedAt = now();

    return Response.json({
      batch,
      worker: {
        id: workerId,
        method,
        trigger: method === "GET" ? "cron" : "manual",
        requestedLimit: parsedOptions.options.limit ?? null,
        requestedLeaseMs: parsedOptions.options.leaseMs ?? null,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - startedAt),
      },
    });
  } catch (error) {
    console.error("Agent task worker error:", error);
    return jsonError("Internal server error", 500, "internal_error");
  }
}

async function parseWorkerBatchOptions(
  request: Request
): Promise<
  | { ok: true; options: { limit?: number; leaseMs?: number } }
  | { ok: false; status: number; code: string; message: string }
> {
  let text = "";
  try {
    text = await request.text();
  } catch {
    return invalidJson();
  }

  if (!text.trim()) return { ok: true, options: {} };

  let body: { limit?: unknown; leaseMs?: unknown };
  try {
    body = JSON.parse(text) as { limit?: unknown; leaseMs?: unknown };
  } catch {
    return invalidJson();
  }

  const limit = parseBoundedPositiveInteger({
    value: body.limit,
    name: "limit",
    max: MAX_WORKER_BATCH_LIMIT,
  });
  if (!limit.ok) return limit;

  const leaseMs = parseBoundedPositiveInteger({
    value: body.leaseMs,
    name: "leaseMs",
    max: MAX_WORKER_LEASE_MS,
  });
  if (!leaseMs.ok) return leaseMs;

  return {
    ok: true,
    options: {
      ...(limit.value ? { limit: limit.value } : {}),
      ...(leaseMs.value ? { leaseMs: leaseMs.value } : {}),
    },
  };
}

function parseBoundedPositiveInteger({
  value,
  name,
  max,
}: {
  value: unknown;
  name: string;
  max: number;
}):
  | { ok: true; value?: number }
  | { ok: false; status: number; code: string; message: string } {
  if (value === undefined || value === null) return { ok: true };
  if (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > max) {
    return {
      ok: false,
      status: 400,
      code: "invalid_worker_options",
      message: `${name} must be an integer between 1 and ${max}`,
    };
  }

  return { ok: true, value: Number(value) };
}

function invalidJson() {
  return {
    ok: false as const,
    status: 400,
    code: "invalid_json",
    message: "Invalid JSON body",
  };
}
