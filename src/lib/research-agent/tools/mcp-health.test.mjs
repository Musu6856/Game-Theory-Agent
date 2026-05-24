import test from "node:test";
import assert from "node:assert/strict";

import { checkTavilyMcpHealth } from "./mcp-health.ts";

test("MCP health reports missing configuration without calling tools", async () => {
  const result = await checkTavilyMcpHealth({
    mcpUrl: "",
    listTools: async () => {
      throw new Error("listTools should not be called");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.configured, false);
  assert.equal(result.code, "missing_mcp_url");
  assert.equal(result.endpoint, "");
  assert.deepEqual(result.tools, []);
});

test("MCP health lists Tavily tools and redacts the endpoint", async () => {
  const result = await checkTavilyMcpHealth({
    now: () => 1000,
    mcpUrl: "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-secret",
    listTools: async (url) => {
      assert.equal(
        url.toString(),
        "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-secret"
      );
      return ["tavily_search", "tavily_extract", "tavily_crawl"];
    },
    afterConnect: () => 1042,
  });

  assert.equal(result.ok, true);
  assert.equal(result.configured, true);
  assert.equal(result.code, "connected");
  assert.equal(
    result.endpoint,
    "https://mcp.tavily.com/mcp/?tavilyApiKey=%3Credacted%3E"
  );
  assert.deepEqual(result.tools, [
    "tavily_search",
    "tavily_extract",
    "tavily_crawl",
  ]);
  assert.equal(result.hasSearchTool, true);
  assert.equal(result.latencyMs, 42);
});

test("MCP health distinguishes invalid URLs from connection failures", async () => {
  const invalid = await checkTavilyMcpHealth({
    mcpUrl: "not a url",
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "invalid_mcp_url");
  assert.equal(invalid.endpoint, "<invalid>");

  const failed = await checkTavilyMcpHealth({
    mcpUrl: "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-secret",
    listTools: async () => {
      throw new Error("schema mismatch");
    },
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.configured, true);
  assert.equal(failed.code, "connection_failed");
  assert.equal(failed.message.includes("schema mismatch"), true);
  assert.equal(failed.endpoint.includes("tvly-secret"), false);
});
