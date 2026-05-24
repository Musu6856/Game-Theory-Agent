import assert from "node:assert/strict";
import test from "node:test";

import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
} from "../research-session.ts";
import {
  createRollbackPatchFromVersionEvent,
  proposeRollbackPatchFromVersionEvent,
  recordPatchReviewVersion,
} from "./version-history.ts";

test("records applied asset patch as an auditable version event", () => {
  const project = confirmResearchModel(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "研究二手平台佣金与补贴策略",
        now: 1710000000000,
      }),
      "secondhand-commission-subsidy-hotelling"
    )
  );
  const patch = {
    id: "patch-equilibrium",
    kind: "equilibrium",
    summary: "更新均衡闭式解",
    status: "proposed",
    createdAt: 1710000000001,
    sourceMessageId: "msg-agent",
    changes: [
      {
        kind: "replace",
        path: "equilibriumResult.closedForm",
        value: "\\tau^*=1",
        previousValue: "\\tau^*=0",
        note: "修正闭式解。",
      },
    ],
  };

  const nextProject = recordPatchReviewVersion(project, {
    patch,
    status: "applied",
    now: 1710000000002,
  });
  const event = nextProject.researchSession?.assetVersionHistory?.[0];

  assert.equal(event?.id, "asset-version-patch-equilibrium-applied");
  assert.equal(event?.assetKind, "equilibrium");
  assert.equal(event?.action, "applied_patch");
  assert.equal(event?.patchId, "patch-equilibrium");
  assert.equal(event?.sourceMessageId, "msg-agent");
  assert.equal(event?.summary, "更新均衡闭式解");
  assert.equal(event?.approvedBy, "user");
  assert.deepEqual(event?.changedPaths, ["equilibriumResult.closedForm"]);
  assert.equal(event?.changeCount, 1);
  assert.equal(event?.createdAt, 1710000000002);
  assert.equal(event?.note, "修正闭式解。");
  assert.match(event?.nextRecommendation ?? "", /性质分析/);
  assert.equal(
    event?.impact?.summary,
    "均衡结果已变更；依赖旧闭式解或旧存在条件的性质分析和论文命题需要复核。"
  );
  assert.deepEqual(event?.impact?.affectedAssetKinds, ["properties", "paper"]);
  assert.deepEqual(event?.changes, [
    {
      kind: "replace",
      path: "equilibriumResult.closedForm",
      previousValue: "\\tau^*=0",
      value: "\\tau^*=1",
      note: "修正闭式解。",
    },
  ]);
});

test("records review follow-up guidance for applied model and paper patches", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const modelPatch = {
    id: "patch-model",
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
  };
  const paperPatch = {
    id: "patch-paper",
    kind: "paper",
    summary: "整理论文草稿",
    status: "proposed",
    createdAt: 1710000000002,
    changes: [
      {
        kind: "replace",
        path: "sections",
        value: [],
      },
    ],
  };

  const afterModel = recordPatchReviewVersion(project, {
    patch: modelPatch,
    status: "applied",
    now: 1710000000003,
  });
  const afterPaper = recordPatchReviewVersion(afterModel, {
    patch: paperPatch,
    status: "applied",
    now: 1710000000004,
  });
  const [modelEvent, paperEvent] =
    afterPaper.researchSession?.assetVersionHistory ?? [];

  assert.match(modelEvent?.nextRecommendation ?? "", /重新生成符号均衡/);
  assert.equal(
    modelEvent?.impact?.summary,
    "模型设定已变更；后续均衡、性质分析和论文草稿都可能仍然依赖旧模型，需要重新串联。"
  );
  assert.deepEqual(modelEvent?.impact?.affectedAssetKinds, [
    "equilibrium",
    "properties",
    "paper",
  ]);
  assert.match(paperEvent?.nextRecommendation ?? "", /导出 Markdown|继续改写/);
  assert.equal(
    paperEvent?.impact?.summary,
    "论文草稿已更新；正式模型、均衡和性质分析不受影响，重点复核文字组织、引用和导出。"
  );
  assert.deepEqual(paperEvent?.impact?.affectedAssetKinds, []);
});

test("records rejected asset patch without pretending assets changed", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const patch = {
    id: "patch-model",
    kind: "model",
    summary: "替换模型设定",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "hotellingModel.assumptions",
        value: ["平台单归属"],
      },
    ],
  };

  const nextProject = recordPatchReviewVersion(project, {
    patch,
    status: "rejected",
    now: 1710000000003,
    rejectionReason: "方向不匹配。",
  });
  const event = nextProject.researchSession?.assetVersionHistory?.[0];

  assert.equal(event?.assetKind, "model");
  assert.equal(event?.action, "rejected_patch");
  assert.equal(event?.approvedBy, undefined);
  assert.equal(event?.rejectionReason, "方向不匹配。");
  assert.deepEqual(event?.changedPaths, ["hotellingModel.assumptions"]);
  assert.deepEqual(event?.changes[0]?.value, ["平台单归属"]);
  assert.deepEqual(event?.changes[0]?.previousValue, undefined);
  assert.match(event?.nextRecommendation ?? "", /回到当前阶段/);
  assert.equal(
    event?.impact?.summary,
    "这条修改建议已被拒绝；正式研究资产没有变化，后续流程仍以拒绝前的资产为准。"
  );
  assert.deepEqual(event?.impact?.affectedAssetKinds, []);
});

test("creates a reviewable rollback patch from an applied version event", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const patch = {
    id: "patch-equilibrium",
    kind: "equilibrium",
    summary: "更新均衡闭式解",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "equilibriumResult.closedForm",
        value: "\\tau^*=1",
        previousValue: "\\tau^*=0",
      },
      {
        kind: "append",
        path: "equilibriumResult.conditions",
        value: "q>0",
      },
    ],
  };
  const nextProject = recordPatchReviewVersion(project, {
    patch,
    status: "applied",
    now: 1710000000002,
  });
  const event = nextProject.researchSession?.assetVersionHistory?.[0];

  const rollback = createRollbackPatchFromVersionEvent(event, {
    now: 1710000000003,
    sourceMessageId: "msg-rollback",
  });

  assert.equal(rollback?.id, "patch-rollback-asset-version-patch-equilibrium-applied");
  assert.equal(rollback?.kind, "equilibrium");
  assert.equal(rollback?.status, "proposed");
  assert.match(rollback?.summary ?? "", /回滚/);
  assert.deepEqual(rollback?.changes, [
    {
      kind: "replace",
      path: "equilibriumResult.closedForm",
      value: "\\tau^*=0",
      previousValue: "\\tau^*=1",
      note: "回滚“更新均衡闭式解”的这一处修改。",
    },
    {
      kind: "remove",
      path: "equilibriumResult.conditions",
      value: "q>0",
      previousValue: "q>0",
      note: "回滚“更新均衡闭式解”的这一处新增内容。",
    },
  ]);
});

test("does not create rollback patches for rejected events or missing snapshots", () => {
  assert.equal(
    createRollbackPatchFromVersionEvent({
      id: "asset-version-rejected",
      assetKind: "model",
      action: "rejected_patch",
      patchId: "patch-rejected",
      summary: "未采用模型建议",
      changedPaths: ["hotellingModel.assumptions"],
      changeCount: 1,
      createdAt: 1710000000000,
      changes: [
        {
          kind: "replace",
          path: "hotellingModel.assumptions",
        },
      ],
    }),
    null
  );

  assert.equal(
    createRollbackPatchFromVersionEvent({
      id: "asset-version-no-previous",
      assetKind: "model",
      action: "applied_patch",
      patchId: "patch-no-previous",
      summary: "缺少旧值",
      changedPaths: ["hotellingModel.assumptions"],
      changeCount: 1,
      createdAt: 1710000000000,
      changes: [
        {
          kind: "replace",
          path: "hotellingModel.assumptions",
          value: ["新假设"],
        },
      ],
    }),
    null
  );
});

test("adds rollback patch to the project review queue without changing assets", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const patch = {
    id: "patch-equilibrium",
    kind: "equilibrium",
    summary: "更新均衡闭式解",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "equilibriumResult.closedForm",
        value: "\\tau^*=1",
        previousValue: "\\tau^*=0",
      },
    ],
  };
  const projectWithHistory = recordPatchReviewVersion(project, {
    patch,
    status: "applied",
    now: 1710000000002,
  });
  const eventId =
    projectWithHistory.researchSession?.assetVersionHistory?.[0]?.id ?? "";

  const nextProject = proposeRollbackPatchFromVersionEvent(
    projectWithHistory,
    eventId,
    {
      now: 1710000000003,
    }
  );
  const rollbackPatch = nextProject.researchSession?.assetPatches?.at(-1);

  assert.equal(rollbackPatch?.id, "patch-rollback-asset-version-patch-equilibrium-applied");
  assert.equal(rollbackPatch?.status, "proposed");
  assert.equal(
    nextProject.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
  assert.match(
    nextProject.researchSession?.messages.at(-1)?.content ?? "",
    /回滚建议/
  );
});
