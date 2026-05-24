import assert from "node:assert/strict";
import test from "node:test";

import { buildVersionReviewSummary } from "./version-review-summary.ts";

test("summarizes version review impact by priority and affected assets", () => {
  const summary = buildVersionReviewSummary([
    createVersionEvent({
      id: "version-paper",
      assetKind: "paper",
      summary: "应用论文草稿",
      createdAt: 1710000000001,
      impact: {
        summary: "论文草稿已更新；正式模型、均衡和性质分析不受影响。",
        affectedAssetKinds: [],
        reviewFocus: ["复核章节结构。"],
        nextAction: "导出或继续改写论文",
      },
    }),
    createVersionEvent({
      id: "version-model",
      assetKind: "model",
      summary: "应用模型设定",
      createdAt: 1710000000003,
      impact: {
        summary: "模型设定已变更；后续均衡、性质分析和论文草稿都可能仍然依赖旧模型。",
        affectedAssetKinds: ["equilibrium", "properties", "paper"],
        reviewFocus: ["重新生成符号均衡。"],
        nextAction: "重新生成符号均衡",
      },
    }),
    createVersionEvent({
      id: "version-equilibrium",
      assetKind: "equilibrium",
      summary: "应用均衡结果",
      createdAt: 1710000000002,
      impact: {
        summary: "均衡结果已变更；性质分析和论文命题需要复核。",
        affectedAssetKinds: ["properties", "paper"],
        reviewFocus: ["复核闭式解。"],
        nextAction: "重新生成性质分析",
      },
    }),
  ]);

  assert.equal(summary.totalEventCount, 3);
  assert.equal(summary.reviewItemCount, 3);
  assert.equal(summary.highestPriority, "high");
  assert.deepEqual(summary.affectedAssetKinds, [
    "equilibrium",
    "properties",
    "paper",
  ]);
  assert.equal(summary.latestNextAction, "重新生成符号均衡");
  assert.equal(
    summary.latestImpactSummary,
    "模型设定已变更；后续均衡、性质分析和论文草稿都可能仍然依赖旧模型。"
  );
  assert.deepEqual(
    summary.reviewItems.map((item) => item.eventId),
    ["version-model", "version-equilibrium", "version-paper"]
  );
  assert.equal(summary.reviewItems[0]?.priority, "high");
});

test("returns an empty summary for projects without version history", () => {
  const summary = buildVersionReviewSummary([]);

  assert.deepEqual(summary, {
    totalEventCount: 0,
    reviewItemCount: 0,
    highestPriority: "none",
    affectedAssetKinds: [],
    reviewItems: [],
  });
});

test("keeps rejected patch events as low-priority review context", () => {
  const summary = buildVersionReviewSummary([
    createVersionEvent({
      id: "version-rejected",
      action: "rejected_patch",
      assetKind: "model",
      summary: "拒绝模型修改",
      createdAt: 1710000000005,
      impact: {
        summary: "这条修改建议已被拒绝；正式研究资产没有变化。",
        affectedAssetKinds: [],
        reviewFocus: ["确认拒绝原因是否仍然成立。"],
        nextAction: "回到当前阶段继续推进",
      },
    }),
  ]);

  assert.equal(summary.highestPriority, "low");
  assert.equal(summary.latestNextAction, "回到当前阶段继续推进");
  assert.equal(summary.reviewItems[0]?.priority, "low");
  assert.deepEqual(summary.reviewItems[0]?.affectedAssetKinds, []);
});

function createVersionEvent({
  id,
  action = "applied_patch",
  assetKind,
  summary,
  createdAt,
  impact,
}) {
  return {
    id,
    assetKind,
    action,
    patchId: `patch-${id}`,
    summary,
    changedPaths: [],
    changes: [],
    changeCount: 0,
    createdAt,
    impact,
  };
}
