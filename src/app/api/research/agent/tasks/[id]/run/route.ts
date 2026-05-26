import { jsonError } from "@/lib/provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeRuntimeModelSource } from "@/lib/research-agent/task-input";
import { runAgentTask } from "@/lib/research-agent/task-runner";
import { getRequestUserId } from "@/lib/server-auth";
import type { ModelSourceSettings } from "@/lib/types";

type AgentTaskRunRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: AgentTaskRunRouteContext
) {
  try {
    const userId = await getRequestUserId();
    if (!userId) return jsonError("Unauthorized", 401, "unauthorized");

    const limit = checkRateLimit(userId);
    if (!limit.ok) {
      return jsonError(
        `Too many requests. Try again in ${limit.retryAfter}s.`,
        429,
        "rate_limited"
      );
    }

    const runtimeModelSource = await parseTransientRuntimeModelSource(request);
    if (runtimeModelSource === "invalid_json") {
      return jsonError("Invalid JSON body", 400, "invalid_json");
    }
    if (runtimeModelSource === "invalid_runtime_model_source") {
      return jsonError(
        "Invalid runtime model source",
        400,
        "invalid_runtime_model_source"
      );
    }

    const { id } = await context.params;
    const task = await runAgentTask({
      id,
      ownerId: userId,
      workerId: `route-${crypto.randomUUID()}`,
      runtimeModelSource,
    });

    return Response.json({ task });
  } catch (error) {
    console.error("Agent task run error:", error);
    return jsonError(
      error instanceof Error ? error.message : "Agent task failed",
      500,
      "agent_task_failed"
    );
  }
}

async function parseTransientRuntimeModelSource(
  request: Request
): Promise<ModelSourceSettings | undefined | "invalid_json" | "invalid_runtime_model_source"> {
  let text = "";
  try {
    text = await request.text();
  } catch {
    return "invalid_json";
  }

  if (!text.trim()) return undefined;

  let body: { runtimeModelSource?: unknown };
  try {
    body = JSON.parse(text) as { runtimeModelSource?: unknown };
  } catch {
    return "invalid_json";
  }

  if (!Object.prototype.hasOwnProperty.call(body, "runtimeModelSource")) {
    return undefined;
  }
  if (body.runtimeModelSource === undefined || body.runtimeModelSource === null) {
    return undefined;
  }

  return (
    sanitizeRuntimeModelSource(body.runtimeModelSource) ??
    "invalid_runtime_model_source"
  );
}
