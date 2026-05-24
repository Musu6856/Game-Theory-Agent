import test from "node:test";
import assert from "node:assert/strict";

import { getResearchFeedItems } from "./research-feed.ts";

const baseAssetSummary = {
  confirmedAssumptions: [],
  utilityFunctions: [],
  equilibriumStatus: "等待模型确认",
  nextActions: [],
};

test("research feed keeps model co-creation messages visible in order", () => {
  const session = {
    phase: "model",
    directions: [],
    messages: [
      { id: "u1", role: "user", content: "原始想法", createdAt: 0 },
      { id: "a1", role: "assistant", content: "方向建议", createdAt: 0 },
      {
        id: "u2",
        role: "user",
        content: "请加入验货成本",
        createdAt: 0,
      },
      {
        id: "a2",
        role: "assistant",
        content: "已记录这次模型补充",
        createdAt: 0,
      },
    ],
    assetSummary: baseAssetSummary,
  };

  const items = getResearchFeedItems(session);

  assert.deepEqual(
    items.map((item) => item.message.content),
    ["原始想法", "方向建议", "请加入验货成本", "已记录这次模型补充"]
  );
  assert.deepEqual(
    items.map((item) => item.showDirections),
    [false, true, false, false]
  );
  assert.deepEqual(
    items.map((item) => item.showPhaseAction),
    [false, false, false, true]
  );
});

test("research feed does not show a phase action while choosing directions", () => {
  const session = {
    phase: "direction",
    directions: [],
    messages: [
      { id: "u1", role: "user", content: "原始想法", createdAt: 0 },
      { id: "a1", role: "assistant", content: "方向建议", createdAt: 0 },
    ],
    assetSummary: {
      ...baseAssetSummary,
      equilibriumStatus: "not_started",
    },
  };

  const items = getResearchFeedItems(session);

  assert.deepEqual(
    items.map((item) => item.showDirections),
    [false, true]
  );
  assert.ok(items.every((item) => !item.showPhaseAction));
});
