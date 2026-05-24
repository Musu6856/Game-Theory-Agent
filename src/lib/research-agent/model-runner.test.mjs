import assert from "node:assert/strict";
import test from "node:test";

import { runModelGenerationAgent } from "./model-runner.ts";
import { applyResearchAssetPatchToProject } from "../research-asset-patch-apply.ts";
import { createExplorationProject } from "../research-session.ts";

test("model generation agent proposes a reviewable model patch with trace", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });
  const candidateModel = {
    symbols: [],
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "平台选择佣金和补贴",
        decisions: ["\\tau_i", "s_i"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + s_A - t_B x",
        notes: "买家选择平台 A 的效用。",
      },
      {
        id: "u-seller-a",
        side: "merchant",
        platform: "A",
        expression: "U_A^S = v_S - \\tau_A q - t_S y",
        notes: "卖家选择平台 A 的效用。",
      },
    ],
    demandDerivation: "由两侧无差异条件推导需求份额。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "佣金收入减补贴成本。",
      },
    ],
    assumptions: ["两平台位于 Hotelling 线段两端。", "买卖双方单归属。"],
    modelSetupDraft: "考虑两个二手交易平台的佣金与补贴竞争。",
  };

  const result = await runModelGenerationAgent(
    {
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      id: "model-agent-test",
      now: 1710000000000,
      buildModel: async () => ({
        project: {
          ...project,
          projectType: "formal",
          refinedIdea: "佣金与补贴竞争",
          hotellingModel: candidateModel,
          researchSession: {
            ...project.researchSession,
            phase: "model",
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-provider-model",
                role: "assistant",
                content: "我先给出一版可求解模型。",
                createdAt: 0,
              },
            ],
            assetSummary: {
              currentDirection: project.researchSession?.directions[0],
              confirmedAssumptions: candidateModel.assumptions,
              utilityFunctions: candidateModel.utilityFunctions.map(
                (entry) => `$${entry.expression}$`
              ),
              equilibriumStatus: "等待模型确认",
              nextActions: ["确认模型设定"],
              pendingDecision: {
                kind: "answer_model_question",
                prompt: "请确认当前模型设定，之后进入符号化均衡求解。",
              },
            },
          },
        },
        usedFallback: false,
        assistantMessage: "我先给出一版可求解模型。",
      }),
    }
  );

  const session = result.project.researchSession;
  const patch = session?.assetPatches?.[0];

  assert.equal(result.usedFallback, false);
  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, true);
  assert.equal(session?.agentRun?.status, "paused");
  assert.equal(session?.phase, "model");
  assert.equal(session?.assetSummary.pendingDecision?.kind, "answer_model_question");
  assert.match(
    session?.assetSummary.pendingDecision?.prompt ?? "",
    /审阅并应用模型修改建议/
  );
  assert.equal(patch?.kind, "model");
  assert.equal(patch?.status, "proposed");
  assert.equal(patch?.changes.some((change) => change.path === "hotellingModel.modelSetupDraft"), true);
  assert.equal(patch?.changes.some((change) => change.path === "hotellingModel.utilityFunctions"), true);
  assert.equal(patch?.changes.some((change) => change.path === "hotellingModel.profitFunctions"), true);
  assert.equal(patch?.changes.some((change) => change.path === "hotellingModel.assumptions"), true);
  assert.equal(
    result.agentRun.trace.some((event) => event.type === "model_result"),
    true
  );
});

test("model generation agent keeps candidate model changes pending until applied", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });
  const candidateModel = {
    symbols: [],
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "平台选择佣金和补贴",
        decisions: ["\\tau_i", "s_i"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + s_A - t_B x",
        notes: "买家选择平台 A 的效用。",
      },
    ],
    demandDerivation: "候选模型需求推导。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "佣金收入减补贴成本。",
      },
    ],
    assumptions: ["候选模型专属假设。"],
    modelSetupDraft: "候选模型专属草稿，应用 patch 前不应覆盖资产。",
  };

  const result = await runModelGenerationAgent(
    {
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      id: "model-agent-pending-test",
      now: 1710000000000,
      buildModel: async () => ({
        project: {
          ...project,
          projectType: "formal",
          refinedIdea: "候选模型方向",
          hotellingModel: candidateModel,
          researchSession: {
            ...project.researchSession,
            phase: "model",
            assetSummary: {
              currentDirection: project.researchSession?.directions[0],
              confirmedAssumptions: candidateModel.assumptions,
              utilityFunctions: candidateModel.utilityFunctions.map(
                (entry) => `$${entry.expression}$`
              ),
              equilibriumStatus: "等待模型确认",
              nextActions: ["确认模型设定"],
              pendingDecision: {
                kind: "answer_model_question",
                prompt: "请确认当前模型设定，之后进入符号化均衡求解。",
              },
            },
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-provider-model",
                role: "assistant",
                content: "我先给出一版候选模型。",
                createdAt: 0,
              },
            ],
          },
        },
        usedFallback: false,
        assistantMessage: "我先给出一版候选模型。",
      }),
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const setupChange = patch?.changes.find(
    (change) => change.path === "hotellingModel.modelSetupDraft"
  );

  assert.ok(result.project.hotellingModel);
  assert.notEqual(
    result.project.hotellingModel?.modelSetupDraft,
    candidateModel.modelSetupDraft
  );
  assert.notDeepEqual(
    result.project.researchSession?.assetSummary.confirmedAssumptions,
    candidateModel.assumptions
  );
  assert.equal(setupChange?.value, candidateModel.modelSetupDraft);

  const applied = applyResearchAssetPatchToProject(result.project, patch, {
    now: 1710000000001,
  });

  assert.equal(
    applied.hotellingModel?.modelSetupDraft,
    candidateModel.modelSetupDraft
  );
  assert.deepEqual(
    applied.researchSession?.assetSummary.confirmedAssumptions,
    candidateModel.assumptions
  );
  assert.deepEqual(applied.researchSession?.assetSummary.utilityFunctions, [
    "$U_A^B = v_B + s_A - t_B x$",
  ]);
  assert.deepEqual(applied.hotellingModel?.timing, candidateModel.timing);
  assert.equal(applied.researchSession?.assetPatches?.[0].status, "applied");
});
