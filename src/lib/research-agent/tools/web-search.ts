import type { EvidenceCandidate } from "./evidence-pack.ts";
import { isPublicHttpUrl } from "../guards.ts";

type WebSearchOptions = {
  limit?: number;
  apiKey?: string;
  mcpUrl?: string;
  callMcpTool?: TavilyMcpToolCaller;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type TavilyMcpToolCaller = (
  url: URL,
  input: TavilyMcpSearchInput
) => Promise<unknown>;

type TavilySearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
};

type TavilySearchBaseInput = {
  query: string;
  max_results: number;
  search_depth: "basic";
  include_images: false;
  include_raw_content: false;
};

type TavilyMcpSearchInput = TavilySearchBaseInput;

type TavilyRestSearchInput = TavilySearchBaseInput & {
  include_answer: false;
};

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_LIMIT = 5;

export async function searchPublicWebContext(
  query: string,
  options: WebSearchOptions = {}
): Promise<EvidenceCandidate[]> {
  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
  const mcpUrl = options.mcpUrl ?? process.env.TAVILY_MCP_URL;

  if (mcpUrl) {
    try {
      const result = await (options.callMcpTool ?? callTavilyMcpTool)(
        new URL(mcpUrl),
        createTavilyMcpSearchInput(query, limit)
      );
      const sources = parseTavilySearchResult(result, "mcp");
      if (sources.length > 0) return sources;
    } catch {
      // Fall back to REST API key path so a transient MCP failure does not block the agent run.
    }
  }

  const apiKey = options.apiKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const fetchImpl = options.fetch ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );
  const input = createTavilyRestSearchInput(query, limit);

  try {
    const response = await fetchImpl(TAVILY_SEARCH_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error(`Tavily search failed with ${response.status}`);
    }

    return parseTavilySearchResult(await response.json(), "rest");
  } finally {
    clearTimeout(timeout);
  }
}

function createTavilyMcpSearchInput(
  query: string,
  maxResults: number
): TavilyMcpSearchInput {
  return {
    query,
    max_results: maxResults,
    search_depth: "basic",
    include_images: false,
    include_raw_content: false,
  };
}

function createTavilyRestSearchInput(
  query: string,
  maxResults: number
): TavilyRestSearchInput {
  return {
    ...createTavilyMcpSearchInput(query, maxResults),
    include_answer: false,
  };
}

async function callTavilyMcpTool(
  url: URL,
  input: TavilyMcpSearchInput
): Promise<unknown> {
  const [{ Client }, { StreamableHTTPClientTransport }] = await Promise.all([
    import("@modelcontextprotocol/sdk/client/index.js"),
    import("@modelcontextprotocol/sdk/client/streamableHttp.js"),
  ]);
  const client = new Client({
    name: "paperforge-agent",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(url);

  try {
    await client.connect(transport);
    return await client.callTool({
      name: "tavily_search",
      arguments: input,
    });
  } finally {
    await client.close();
  }
}

function parseTavilySearchResult(
  raw: unknown,
  source: "mcp" | "rest"
): EvidenceCandidate[] {
  const response = extractTavilySearchResponse(raw);

  return (response.results ?? []).flatMap((item) => {
    const title = item.title?.trim();
    const url = item.url?.trim();
    const snippet = item.content?.replace(/\s+/g, " ").trim();

    if (!title || !url || !snippet || !isPublicHttpUrl(url)) return [];

    return [
      {
        title,
        url,
        sourceType: "web" as const,
        snippet,
        relevance:
          typeof item.score === "number"
            ? `Tavily ${source === "mcp" ? "MCP " : ""}score ${item.score}; public web context for the research idea.`
            : `Tavily ${source === "mcp" ? "MCP " : ""}public web context for the research idea.`,
      },
    ];
  });
}

function extractTavilySearchResponse(raw: unknown): TavilySearchResponse {
  if (isTavilySearchResponse(raw)) return raw;

  const content = (raw as { content?: unknown })?.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      const text = (item as { type?: unknown; text?: unknown })?.text;
      if (typeof text !== "string") continue;
      const parsed = parseMaybeJson(text);
      if (isTavilySearchResponse(parsed)) return parsed;
    }
  }

  return {};
}

function parseMaybeJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isTavilySearchResponse(value: unknown): value is TavilySearchResponse {
  return typeof value === "object" && value !== null && Array.isArray((value as TavilySearchResponse).results);
}

function clampLimit(limit: number) {
  return Math.min(Math.max(Math.trunc(limit), 1), 10);
}
