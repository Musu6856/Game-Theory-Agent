import test from "node:test";
import assert from "node:assert/strict";

import { searchPublicWebContext } from "./web-search.ts";

test("Tavily web search prefers remote MCP when configured", async () => {
  const calls = [];
  const results = await searchPublicWebContext(
    "platform subsidies seller multihoming",
    {
      limit: 2,
      mcpUrl: "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-secret",
      callMcpTool: async (url, input) => {
        calls.push({ url: url.toString(), input });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                results: [
                  {
                    title: "MCP seller multihoming result",
                    url: "https://example.com/mcp-multihoming",
                    content: "MCP content about seller multihoming and subsidies.",
                    score: 0.91,
                  },
                ],
              }),
            },
          ],
        };
      },
      fetch: async () => {
        throw new Error("REST fallback should not be called");
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-secret");
  assert.equal(calls[0].input.query, "platform subsidies seller multihoming");
  assert.equal(calls[0].input.max_results, 2);
  assert.equal(calls[0].input.include_answer, undefined);
  assert.equal(calls[0].input.include_images, false);
  assert.equal(calls[0].input.include_raw_content, false);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, "https://example.com/mcp-multihoming");
  assert.match(results[0].relevance, /Tavily MCP score/);
});

test("Tavily web search falls back to REST when remote MCP fails", async () => {
  const restCalls = [];
  const results = await searchPublicWebContext("platform subsidies", {
    limit: 1,
    apiKey: "tvly-rest",
    mcpUrl: "https://mcp.tavily.com/mcp/?tavilyApiKey=tvly-secret",
    callMcpTool: async () => {
      throw new Error("MCP unavailable");
    },
    fetch: async (url, init) => {
      restCalls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          results: [
            {
              title: "REST fallback result",
              url: "https://example.com/rest",
              content: "REST result after MCP failure.",
              score: 0.73,
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },
  });

  assert.equal(restCalls.length, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, "REST fallback result");
});

test("Tavily web search returns concise public web evidence when configured", async () => {
  const calls = [];
  const results = await searchPublicWebContext(
    "platform subsidies seller multihoming",
    {
      limit: 2,
      apiKey: "tvly-test",
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            results: [
              {
                title: "Seller multihoming in platform markets",
                url: "https://example.com/multihoming",
                content: "A public overview of seller multihoming and platform fees.",
                score: 0.89,
              },
              {
                title: "Blocked local result",
                url: "http://localhost/internal",
                content: "Should not be retained.",
                score: 0.9,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      },
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.tavily.com/search");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tvly-test");
  assert.equal(JSON.parse(calls[0].init.body).include_answer, false);
  assert.equal(JSON.parse(calls[0].init.body).include_raw_content, false);
  assert.equal(results.length, 1);
  assert.equal(results[0].sourceType, "web");
  assert.equal(results[0].url, "https://example.com/multihoming");
  assert.match(results[0].relevance, /Tavily score/);
});

test("Tavily web search degrades to no sources when no API key is configured", async () => {
  const previous = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;

  const results = await searchPublicWebContext("platform subsidies", {
    fetch: async () => {
      throw new Error("fetch should not be called");
    },
  });

  assert.deepEqual(results, []);

  if (previous === undefined) {
    delete process.env.TAVILY_API_KEY;
  } else {
    process.env.TAVILY_API_KEY = previous;
  }
});
