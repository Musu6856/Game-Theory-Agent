export type TavilyMcpHealthCode =
  | "connected"
  | "missing_mcp_url"
  | "invalid_mcp_url"
  | "missing_search_tool"
  | "connection_failed";

export type TavilyMcpHealthResult = {
  ok: boolean;
  configured: boolean;
  code: TavilyMcpHealthCode;
  message: string;
  endpoint: string;
  tools: string[];
  hasSearchTool: boolean;
  latencyMs?: number;
};

type TavilyMcpHealthOptions = {
  mcpUrl?: string;
  listTools?: (url: URL) => Promise<string[]>;
  now?: () => number;
  afterConnect?: () => number;
};

export async function checkTavilyMcpHealth(
  options: TavilyMcpHealthOptions = {}
): Promise<TavilyMcpHealthResult> {
  const mcpUrl = options.mcpUrl ?? process.env.TAVILY_MCP_URL ?? "";

  if (!mcpUrl.trim()) {
    return {
      ok: false,
      configured: false,
      code: "missing_mcp_url",
      message: "TAVILY_MCP_URL is not configured.",
      endpoint: "",
      tools: [],
      hasSearchTool: false,
    };
  }

  let url: URL;
  try {
    url = new URL(mcpUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Only http and https MCP URLs are allowed.");
    }
  } catch {
    return {
      ok: false,
      configured: true,
      code: "invalid_mcp_url",
      message: "TAVILY_MCP_URL is not a valid public MCP URL.",
      endpoint: "<invalid>",
      tools: [],
      hasSearchTool: false,
    };
  }

  const start = options.now?.() ?? Date.now();
  const endpoint = redactMcpEndpoint(url);

  try {
    const tools = await (options.listTools ?? listTavilyMcpTools)(url);
    const latencyMs = (options.afterConnect?.() ?? Date.now()) - start;
    const hasSearchTool = tools.includes("tavily_search");
    return {
      ok: hasSearchTool,
      configured: true,
      code: hasSearchTool ? "connected" : "missing_search_tool",
      message: hasSearchTool
        ? "Tavily MCP connected and tavily_search is available."
        : "Tavily MCP connected, but tavily_search was not found.",
      endpoint,
      tools,
      hasSearchTool,
      latencyMs,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      code: "connection_failed",
      message: `Tavily MCP connection failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      endpoint,
      tools: [],
      hasSearchTool: false,
    };
  }
}

export function redactMcpEndpoint(url: URL) {
  const redacted = new URL(url.toString());
  for (const key of Array.from(redacted.searchParams.keys())) {
    if (/key|token|secret/i.test(key)) {
      redacted.searchParams.set(key, "<redacted>");
    }
  }
  return redacted.toString();
}

async function listTavilyMcpTools(url: URL): Promise<string[]> {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
  ]);
  const client = new Client({
    name: "paperforge-agent-health",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(url);

  try {
    await client.connect(transport);
    const result = await client.listTools();
    return (result.tools ?? [])
      .map((tool) => tool.name)
      .filter((name): name is string => typeof name === "string")
      .sort((a, b) => a.localeCompare(b));
  } finally {
    await client.close();
  }
}
