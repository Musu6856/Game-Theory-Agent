import test from "node:test";
import assert from "node:assert/strict";

import { checkProviderConnectivity } from "./provider-health.ts";

const baseConfig = {
  apiKey: "sk-test",
  baseUrl: "https://api.example.com/v1",
  model: "mimo-test",
};

test("provider connectivity reports missing server API key without fetching", async () => {
  let called = false;

  const result = await checkProviderConnectivity(
    { ...baseConfig, apiKey: undefined },
    {
      fetch: async () => {
        called = true;
        throw new Error("should not fetch");
      },
    }
  );

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.configured, false);
  assert.equal(result.code, "missing_api_key");
});

test("provider connectivity calls chat completions with a smoke prompt", async () => {
  let requestedUrl = "";
  let requestedBody = {};
  let requestedHeaders = {};

  const result = await checkProviderConnectivity(baseConfig, {
    now: () => 100,
    fetch: async (url, init) => {
      requestedUrl = String(url);
      requestedHeaders = init?.headers ?? {};
      requestedBody = JSON.parse(String(init?.body ?? "{}"));

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "pong" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },
    finalizeNow: () => 142,
  });

  assert.equal(result.ok, true);
  assert.equal(result.configured, true);
  assert.equal(result.code, "connected");
  assert.equal(result.latencyMs, 42);
  assert.equal(requestedUrl, "https://api.example.com/v1/chat/completions");
  assert.equal(requestedHeaders.Authorization, "Bearer sk-test");
  assert.equal(requestedBody.model, "mimo-test");
  assert.equal(requestedBody.stream, false);
  assert.equal(requestedBody.max_tokens, 16);
  assert.equal(requestedBody.messages.at(-1).content, "ping");
});

test("provider connectivity can verify JSON-mode completions for research generation", async () => {
  let requestedBody = {};

  const result = await checkProviderConnectivity(baseConfig, {
    fetch: async (_url, init) => {
      requestedBody = JSON.parse(String(init?.body ?? "{}"));

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    },
    jsonMode: true,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(requestedBody.response_format, { type: "json_object" });
  assert.match(requestedBody.messages.at(-1).content, /json/i);
});

test("provider connectivity reports upstream HTTP errors without leaking secrets", async () => {
  const result = await checkProviderConnectivity(baseConfig, {
    fetch: async () =>
      new Response("bad key sk-should-not-leak", {
        status: 401,
        statusText: "Unauthorized",
      }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.configured, true);
  assert.equal(result.code, "upstream_http_error");
  assert.equal(result.statusCode, 401);
  assert.equal(result.message.includes("sk-should-not-leak"), false);
});

test("provider connectivity gives actionable guidance for authentication errors", async () => {
  const result = await checkProviderConnectivity(
    {
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
    },
    {
      fetch: async () =>
        new Response("unauthorized", {
          status: 401,
          statusText: "Unauthorized",
        }),
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "upstream_http_error");
  assert.match(result.message, /认证失败|API Key/);
  assert.match(result.message, /DeepSeek|api\.deepseek\.com/);
  assert.match(result.message, /HTTP 401/);
});

test("provider connectivity reports invalid completion payloads", async () => {
  const result = await checkProviderConnectivity(baseConfig, {
    fetch: async () =>
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.configured, true);
  assert.equal(result.code, "invalid_response");
});

test("provider connectivity returns unsupported provider without fetching", async () => {
  let called = false;
  const result = await checkProviderConnectivity(
    {
      apiKey: "sk-test",
      baseUrl: "",
      model: "claude-sonnet",
    },
    {
      unsupportedReason: "Only OpenAI-compatible providers are supported here.",
      fetch: async () => {
        called = true;
        throw new Error("should not fetch");
      },
    }
  );

  assert.equal(called, false);
  assert.equal(result.ok, false);
  assert.equal(result.configured, false);
  assert.equal(result.code, "unsupported_provider");
});
