import assert from "node:assert/strict";
import test from "node:test";

import { buildPaperSectionReview } from "./paper-section-review.ts";

test("builds section-level review tasks for a drafted paper", () => {
  const review = buildPaperSectionReview({
    project: {
      sections: [
        {
          id: "paper-introduction",
          title: "引言与研究问题",
          content: "本文讨论平台佣金。",
          status: "generated",
        },
        {
          id: "paper-equilibrium",
          title: "均衡分析",
          content: "闭式结果为 tau_A^*=alpha_B/q。",
          status: "generated",
        },
        {
          id: "paper-propositions",
          title: "比较静态与命题",
          content: "命题 1：alpha_B 提高 tau_A。",
          status: "generated",
        },
      ],
      researchSession: {
        assetVersionHistory: [
          {
            id: "version-model",
            assetKind: "model",
            action: "applied_patch",
            patchId: "patch-model",
            summary: "更新模型设定",
            changedPaths: [],
            changes: [],
            changeCount: 0,
            createdAt: 1710000000000,
            impact: {
              summary: "模型设定已变更。",
              affectedAssetKinds: ["equilibrium", "properties", "paper"],
              reviewFocus: ["重算均衡。"],
              nextAction: "重新生成符号均衡",
            },
          },
        ],
      },
    },
  });

  assert.equal(review.status, "review_needed");
  assert.equal(review.tasks.length, 3);
  assert.deepEqual(review.tasks[0]?.dependsOn, ["direction", "evidence"]);
  assert.deepEqual(review.tasks[1]?.dependsOn, ["model", "equilibrium"]);
  assert.equal(review.tasks[1]?.priority, "high");
  assert.match(review.headline, /3 个章节/);
  assert.match(review.nextAction, /优先复核/);
});

test("returns not-ready when no paper sections exist", () => {
  const review = buildPaperSectionReview({ project: { sections: [] } });

  assert.deepEqual(review, {
    status: "not_ready",
    headline: "还没有可复核的论文章节。",
    nextAction: "先基于稳定资产整理论文草稿",
    tasks: [],
  });
});
