import test from "node:test";
import assert from "node:assert/strict";
import {
  MODEL_SOURCE_CONFIGURED_KEY,
  MODEL_SOURCE_CONFIGURED_EVENT,
  MODEL_SOURCE_STORAGE_KEY,
  getStartResearchDestination,
  getRuntimeModelSourceSettings,
  getModelSourceMetadata,
  hasCompletedModelSourceSetup,
  markModelSourceSetupCompleted,
  normalizeModelSourceSettings,
  parseStoredModelSourceSettings,
} from "./model-source.ts";

test("normalizes PaperForge managed model settings", () => {
  const settings = normalizeModelSourceSettings({ source: "paperforge" });

  assert.equal(settings.source, "paperforge");
  assert.equal(settings.apiKey, undefined);
  assert.equal(settings.baseUrl, undefined);
  assert.deepEqual(getModelSourceMetadata(settings), {
    source: "paperforge",
  });
});

test("normalizes own OpenAI model settings and redacts API key from metadata", () => {
  const settings = normalizeModelSourceSettings({
    source: "own",
    provider: "openai",
    apiKey: " sk-live-secret ",
    model: " gpt-4.1 ",
  });
  const metadata = getModelSourceMetadata(settings);

  assert.equal(settings.source, "own");
  assert.equal(settings.provider, "openai");
  assert.equal(settings.apiKey, "sk-live-secret");
  assert.equal(settings.model, "gpt-4.1");
  assert.equal(metadata.hasBrowserApiKey, true);
  assert.equal("apiKey" in metadata, false);
  assert.deepEqual(metadata, {
    source: "own",
    provider: "openai",
    model: "gpt-4.1",
    hasBrowserApiKey: true,
  });
});

test("normalizes OpenAI-compatible providers with trimmed endpoint metadata", () => {
  const openaiCompatible = normalizeModelSourceSettings({
    source: "own",
    provider: "openai-compatible",
    apiKey: " local-key ",
    baseUrl: " https://models.example.com/v1/ ",
    model: " qwen-plus ",
  });

  assert.deepEqual(getModelSourceMetadata(openaiCompatible), {
    source: "own",
    provider: "openai-compatible",
    baseUrl: "https://models.example.com/v1",
    model: "qwen-plus",
    hasBrowserApiKey: true,
  });
});

test("rejects unsupported Anthropic model source settings", () => {
  assert.throws(
    () =>
      normalizeModelSourceSettings({
        source: "own",
        provider: "anthropic",
        apiKey: "anthropic-key",
        model: "claude-sonnet",
      }),
    /provider/i
  );

  assert.throws(
    () =>
      normalizeModelSourceSettings({
        source: "own",
        provider: "anthropic-compatible",
        apiKey: "anthropic-key",
        baseUrl: "https://anthropic.example.com",
        model: "claude-compatible",
      }),
    /provider/i
  );
});

test("rejects own model settings without browser API key", () => {
  assert.throws(
    () =>
      normalizeModelSourceSettings({
        source: "own",
        provider: "openai",
        apiKey: "",
        model: "gpt-4.1",
      }),
    /API key/
  );
});

test("rejects unsafe own model base URLs before they reach the server", () => {
  assert.throws(
    () =>
      normalizeModelSourceSettings({
        source: "own",
        provider: "openai-compatible",
        apiKey: "local-key",
        baseUrl: "http://127.0.0.1:11434/v1",
        model: "qwen",
      }),
    /Base URL|HTTPS|localhost|private/i
  );
});

test("uses a stable browser-local storage key", () => {
  assert.equal(MODEL_SOURCE_STORAGE_KEY, "paperforge:model-source:v1");
  assert.equal(
    MODEL_SOURCE_CONFIGURED_KEY,
    "paperforge:model-source-configured:v1"
  );
  assert.equal(
    MODEL_SOURCE_CONFIGURED_EVENT,
    "paperforge:model-source-setup-change"
  );
});

test("parses stored model settings and falls back to PaperForge when invalid", () => {
  assert.deepEqual(parseStoredModelSourceSettings(null), {
    source: "paperforge",
  });
  assert.deepEqual(parseStoredModelSourceSettings("{broken json"), {
    source: "paperforge",
  });
  assert.deepEqual(
    parseStoredModelSourceSettings(
      JSON.stringify({
        source: "own",
        provider: "openai-compatible",
        apiKey: " browser-only-key ",
        baseUrl: " https://api.deepseek.com/v1/ ",
        model: " deepseek-chat ",
      })
    ),
    {
      source: "own",
      provider: "openai-compatible",
      apiKey: "browser-only-key",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    }
  );
});

test("treats model source setup as complete only after explicit onboarding", () => {
  assert.equal(hasCompletedModelSourceSetup(null), false);
  assert.equal(hasCompletedModelSourceSetup(""), false);
  assert.equal(hasCompletedModelSourceSetup("false"), false);
  assert.equal(hasCompletedModelSourceSetup("1"), true);
  assert.equal(hasCompletedModelSourceSetup("true"), true);
});

test("routes returning users directly to workspace and first-time users to launch", () => {
  assert.equal(getStartResearchDestination({ setupCompleted: false }), "/launch");
  assert.equal(getStartResearchDestination({ setupCompleted: true }), "/research");
  assert.equal(
    getStartResearchDestination({
      setupCompleted: false,
      hasExistingProjects: true,
    }),
    "/research"
  );
});

test("marks model source setup as completed in caller-provided storage", () => {
  const values = new Map();
  const storage = {
    setItem(key, value) {
      values.set(key, value);
    },
  };

  markModelSourceSetupCompleted(storage);

  assert.equal(values.get(MODEL_SOURCE_CONFIGURED_KEY), "1");
});

test("runtime model source sends own browser key only for the active request", () => {
  const ownSettings = getRuntimeModelSourceSettings({
    source: "own",
    provider: "openai-compatible",
    apiKey: " local-key ",
    baseUrl: " https://api.deepseek.com/ ",
    model: " deepseek-v4-flash ",
  });

  assert.deepEqual(ownSettings, {
    source: "own",
    provider: "openai-compatible",
    apiKey: "local-key",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
  });
  assert.equal(getRuntimeModelSourceSettings({ source: "paperforge" }), undefined);
});
