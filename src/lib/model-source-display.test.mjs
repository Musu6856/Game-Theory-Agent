import test from "node:test";
import assert from "node:assert/strict";

import { describeModelSourceForUi } from "./model-source-display.ts";

test("describes own OpenAI-compatible model source with model and endpoint", () => {
  const summary = describeModelSourceForUi({
    source: "own",
    provider: "openai-compatible",
    apiKey: "sk-test",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com/v1",
  });

  assert.equal(summary.label, "自有模型：deepseek-chat");
  assert.equal(summary.detail, "OpenAI-compatible · api.deepseek.com · API key 已保存在浏览器");
});

test("describes default model source from latest provider health result", () => {
  const summary = describeModelSourceForUi(
    { source: "paperforge" },
    {
      ok: true,
      configured: true,
      code: "connected",
      message: "默认模型连通正常。",
      provider: {
        model: "deepseek-v4-flash",
        baseUrl: "https://api.deepseek.com",
      },
    }
  );

  assert.equal(summary.label, "默认模型：deepseek-v4-flash");
  assert.equal(summary.detail, "api.deepseek.com · 已检测可用");
});

test("describes default model source before health check without guessing provider", () => {
  const summary = describeModelSourceForUi({ source: "paperforge" });

  assert.equal(summary.label, "默认模型：待检测");
  assert.match(summary.detail, /检测连通/);
});
