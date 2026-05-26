import { jsonError } from "@/lib/provider";
import { getAgentTask } from "@/lib/research-agent/task-store";
import { getRequestUserId } from "@/lib/server-auth";

type AgentTaskRouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: AgentTaskRouteContext
) {
  try {
    const userId = await getRequestUserId();
    if (!userId) return jsonError("Unauthorized", 401, "unauthorized");

    const { id } = await context.params;
    const task = await getAgentTask(userId, id);
    if (!task) return jsonError("Task not found", 404, "task_not_found");

    return Response.json({ task });
  } catch (error) {
    console.error("Agent task read error:", error);
    return jsonError("Internal server error", 500, "internal_error");
  }
}
