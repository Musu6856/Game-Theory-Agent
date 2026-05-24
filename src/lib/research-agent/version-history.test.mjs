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
