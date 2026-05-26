import { jsonError } from "@/lib/provider";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  createAgentTask,
  listAgentTasksForProject,
} from "@/lib/research-agent/task-store";
import { hasAgentTaskProjectAccess } from "@/lib/research-agent/task-creation";
import { sanitizeAgentTaskInput } from "@/lib/research-agent/task-input";
import { getRequestUserId } from "@/lib/server-auth";
import { getProjectForOwner } from "@/lib/server-project-store";
import type { AgentTaskInput } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const userId = await getRequestUserId();
    if (!userId) return jsonError("Unauthorized", 401, "unauthorized");

    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) {
      return jsonError("projectId is required", 400, "missing_project_id");
    }

    const tasks = await listAgentTasksForProject(userId, projectId);
    return Response.json({ tasks });
  } catch (error) {
    console.error("Agent task list error:", error);
    return jsonError("Internal server error", 500, "internal_error");
  }
}

export async function POST(request: Request) {
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

    let body: { input?: AgentTaskInput };
    try {
      body = (await request.json()) as { input?: AgentTaskInput };
    } catch {
      return jsonError("Invalid JSON body", 400, "invalid_json");
    }

    const input = sanitizeAgentTaskInput(body.input);
    if (!input) {
      return jsonError("Invalid agent task input", 400, "invalid_task_input");
    }

    const hasProjectAccess = await hasAgentTaskProjectAccess({
      ownerId: userId,
      projectId: input.projectId,
      getProject: getProjectForOwner,
    });
    if (!hasProjectAccess) {
      return jsonError("Project not found", 404, "project_not_found");
    }

    const task = await createAgentTask({
      id: `task-${crypto.randomUUID()}`,
      ownerId: userId,
      projectId: input.projectId,
      action: input.action,
      input,
    });

    return Response.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Agent task create error:", error);
    return jsonError("Internal server error", 500, "internal_error");
  }
}
