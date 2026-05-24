import assert from "node:assert/strict";
import test from "node:test";

import { createExplorationProject } from "../research-session.ts";
import { recordPatchReviewVersion } from "./version-history.ts";

test("records impact summary for applied model patches", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究平台佣金与补贴策略",
    now: 1710000000000,
  });

  const nextProject = recordPatchReviewVersion(project, {
    patch: {
      id: "patch-model-impact",
      kind: "model",
      summary: "修改模型假设",
      status: "proposed",
      createdAt: 1710000000001,
      changes: [
        {
          kind: "append",
          path: "hotellingModel.assumptions",
          value: "平台固定成本为非负。",
        },
      ],
    },
    status: "applied",
    now: 1710000000002,
  });
  const event = nextProject.researchSession?.assetVersionHistory?.[0];

  assert.equal(
    event?.impact?.summary,
    "模型设定已变更；后续均衡、性质分析和论文草稿都可能仍然依赖旧模型，需要重新串联。"
  );
  assert.deepEqual(event?.impact?.affectedAssetKinds, [
    "equilibrium",
    "properties",
    "paper",
  ]);
  assert.deepEqual(event?.impact?.reviewFocus, [
    "复核参与者、策略变量、效用函数、利润函数、时序和参数约束。",
    "重新生成符号均衡，避免旧 FOC 或旧闭式解继续进入后续分析。",
    "重新检查性质分析和论文草稿中引用的机制解释是否仍然成立。",
  ]);
  assert.equal(event?.impact?.nextAction, "重新生成符号均衡");
});

test("records impact summary for applied equilibrium and properties patches", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究平台佣金与补贴策略",
    now: 1710000000000,
  });

  const withEquilibrium = recordPatchReviewVersion(project, {
    patch: {
      id: "patch-equilibrium-impact",
      kind: "equilibrium",
      summary: "更新均衡闭式解",
      status: "proposed",
      createdAt: 1710000000001,
      changes: [
        {
          kind: "replace",
          path: "equilibriumResult.closedForm",
          previousValue: "\\tau^*=0",
          value: "\\tau^*=1",
        },
      ],
    },
    status: "applied",
    now: 1710000000002,
  });
  const withProperties = recordPatchReviewVersion(withEquilibrium, {
    patch: {
      id: "patch-properties-impact",
      kind: "properties",
      summary: "更新比较静态命题",
      status: "proposed",
      createdAt: 1710000000003,
      changes: [
        {
          kind: "replace",
          path: "propertyAnalyses",
          value: [],
        },
      ],
    },
    status: "applied",
    now: 1710000000004,
  });
  const [equilibriumEvent, propertiesEvent] =
    withProperties.researchSession?.assetVersionHistory ?? [];

  assert.equal(
    equilibriumEvent?.impact?.summary,
    "均衡结果已变更；依赖旧闭式解或旧存在条件的性质分析和论文命题需要复核。"
  );
  assert.deepEqual(equilibriumEvent?.impact?.affectedAssetKinds, [
    "properties",
    "paper",
  ]);
  assert.equal(equilibriumEvent?.impact?.nextAction, "重新生成性质分析");

  assert.equal(
    propertiesEvent?.impact?.summary,
    "性质分析已变更；论文草稿中的命题、证明草图和经济直觉需要跟随更新。"
  );
  assert.deepEqual(propertiesEvent?.impact?.affectedAssetKinds, ["paper"]);
  assert.equal(propertiesEvent?.impact?.nextAction, "复核或重写论文草稿");
});

test("records low-impact summary for paper updates and rejected patches", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究平台佣金与补贴策略",
    now: 1710000000000,
  });

  const withPaper = recordPatchReviewVersion(project, {
    patch: {
      id: "patch-paper-impact",
      kind: "paper",
      summary: "更新论文草稿",
      status: "proposed",
      createdAt: 1710000000001,
      changes: [
        {
          kind: "replace",
          path: "sections",
          value: [],
        },
      ],
    },
    status: "applied",
    now: 1710000000002,
  });
  const withRejected = recordPatchReviewVersion(withPaper, {
    patch: {
      id: "patch-rejected-impact",
      kind: "model",
      summary: "拒绝模型修改",
      status: "proposed",
      createdAt: 1710000000003,
      changes: [
        {
          kind: "append",
          path: "hotellingModel.assumptions",
          value: "不采用的新假设。",
        },
      ],
    },
    status: "rejected",
    now: 1710000000004,
    rejectionReason: "与研究方向不匹配。",
  });
  const [paperEvent, rejectedEvent] =
    withRejected.researchSession?.assetVersionHistory ?? [];

  assert.equal(
    paperEvent?.impact?.summary,
    "论文草稿已更新；正式模型、均衡和性质分析不受影响，重点复核文字组织、引用和导出。"
  );
  assert.deepEqual(paperEvent?.impact?.affectedAssetKinds, []);
  assert.equal(paperEvent?.impact?.nextAction, "导出或继续改写论文");

  assert.equal(
    rejectedEvent?.impact?.summary,
    "这条修改建议已被拒绝；正式研究资产没有变化，后续流程仍以拒绝前的资产为准。"
  );
  assert.deepEqual(rejectedEvent?.impact?.affectedAssetKinds, []);
  assert.equal(rejectedEvent?.impact?.nextAction, "回到当前阶段继续推进");
});
