import assert from "node:assert/strict";
import test from "node:test";

import {
  sanitizeAgentTaskInput,
  sanitizeRuntimeModelSource,
} from "./task-input.ts";

test("sanitizeAgentTaskInput drops runtime model source for persisted task input", () => {
  const sanitized = sanitizeAgentTaskInput({
    rawIdea: "test idea",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    runtimeModelSource: {
      source: "own",
      provider: "openai-compatible",
      apiKey: "sk-test",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    },
  });

  assert.equal(sanitized?.runtimeModelSource, undefined);
});

test("sanitizeRuntimeModelSource preserves valid transient model source", () => {
  const sanitized = sanitizeRuntimeModelSource({
    source: "own",
    provider: "openai-compatible",
    apiKey: "sk-test",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
  });

  assert.deepEqual(sanitized, {
    source: "own",
    provider: "openai-compatible",
    apiKey: "sk-test",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
  });
});

test("sanitizeRuntimeModelSource drops malformed transient model source", () => {
  const sanitized = sanitizeRuntimeModelSource({
    source: "own",
    provider: "anthropic",
    apiKey: "sk-test",
    model: "claude",
  });

  assert.equal(sanitized, undefined);
});
