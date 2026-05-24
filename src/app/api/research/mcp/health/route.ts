import { jsonError } from "@/lib/provider";
import { getRequestUserId } from "@/lib/server-auth";
import { checkTavilyMcpHealth } from "@/lib/research-agent/tools/mcp-health";

export async function GET() {
  const userId = await getRequestUserId();

  if (!userId) {
    return jsonError("Unauthorized", 401, "unauthorized");
  }

  return Response.json(await checkTavilyMcpHealth());
}
