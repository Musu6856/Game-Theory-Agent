import test from "node:test";
import assert from "node:assert/strict";

import {
  createResearchActionClickHandler,
  getResearchAssetsTabForPhase,
  getResearchFlowState,
  getResearchPrimaryAction,
  getResearchModelPrimaryAction,
} from "./research-flow.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generatePropertyAnalysis,
  generateSymbolicEquilibrium,
} from "./research-session.ts";
import { markResearchAssetsStaleAfterModelEdit } from "./research-flow.ts";

test("research flow derives available actions from pending decisions, not message text", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );
  const withoutConfirmationText = {
    ...confirmed,
    researchSession: {
      ...confirmed.researchSession,
      messages: confirmed.researchSession.messages.map((message) =>
        message.content.includes("确认当前模型设定")
          ? { ...message, content: "模型设定通过。" }
          : message
      ),
    },
  };

  const state = getResearchFlowState(withoutConfirmationText);

  assert.equal(state.canConfirmModel, false);
  assert.equal(state.canSolveEquilibrium, true);
  assert.equal(state.canAnalyzeProperties, false);
  assert.equal(state.equilibriumStatusLabel, "等待生成符号均衡推导");
});

test("research flow exposes analysis after symbolic equilibrium even if message copy changes", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    )
  );
  const withoutSolveText = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      messages: solved.researchSession.messages.map((message) =>
        message.content.includes("开始符号均衡求解")
          ? { ...message, content: "生成均衡推导。" }
          : message
      ),
    },
  };

  const state = getResearchFlowState(withoutSolveText);

  assert.equal(state.canConfirmModel, false);
  assert.equal(state.canSolveEquilibrium, false);
  assert.equal(state.canAnalyzeProperties, true);
  assert.equal(state.analysisStatusLabel, "等待生成性质分析");
});

test("research flow does not treat symbolic failure as solved equilibrium", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究商家多归属的外卖平台竞争",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "seller-multihoming-pricing")
  );
  const solved = {
    ...confirmed,
    equilibriumResult: {
      status: "symbolic_failure",
      concept: "隐式系统草稿",
      solvingSteps: ["列出一阶条件。"],
      focs: ["F(z,\\theta)=0"],
      conditions: ["\\det J_zF\\ne0"],
      closedForm: "当前只得到隐式系统草稿，尚未得到闭式均衡解。",
      derivation: "只得到符号推导草稿。",
      code: "print('implicit system')",
      warnings: ["不是闭式均衡。"],
    },
    researchSession: {
      ...confirmed.researchSession,
      phase: "equilibrium",
      assetSummary: {
        ...confirmed.researchSession.assetSummary,
        equilibriumStatus: "symbolic_failure",
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "符号推导草稿已生成。",
        },
      },
    },
  };

  const state = getResearchFlowState(solved);

  assert.equal(solved.equilibriumResult?.status, "symbolic_failure");
  assert.equal(state.canAnalyzeProperties, false);
  assert.equal(state.equilibriumStatusLabel, "未得到闭式均衡");
  assert.equal(state.analysisStatusLabel, "等待闭式均衡完成");
});

test("research flow exposes re-solve action for legacy symbolic failures", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究商家多归属的外卖平台竞争",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "seller-multihoming-pricing")
  );
  const legacyFailure = {
    ...confirmed,
    equilibriumResult: {
      status: "symbolic_failure",
      concept: "隐式系统草稿",
      solvingSteps: ["列出一阶条件。"],
      focs: ["F(z,\\theta)=0"],
      conditions: ["\\det J_zF\\ne0"],
      closedForm: "当前只得到隐式系统草稿，尚未得到闭式均衡解。",
      derivation: "只得到符号推导草稿。",
      code: "print('implicit system')",
      warnings: ["不是闭式均衡。"],
    },
    researchSession: {
      ...confirmed.researchSession,
      phase: "equilibrium",
      assetSummary: {
        ...confirmed.researchSession.assetSummary,
        equilibriumStatus: "symbolic_failure",
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "旧数据里错误地把失败草稿推进到性质分析。",
        },
      },
    },
  };

  const state = getResearchFlowState(legacyFailure);
  const action = getResearchPrimaryAction(state, "equilibrium");

  assert.equal(state.canSolveEquilibrium, true);
  assert.equal(state.canAnalyzeProperties, false);
  assert.equal(action?.kind, "solve_equilibrium");
  assert.equal(state.equilibriumStatusLabel, "未得到闭式均衡");
});

test("research flow does not mark missing property analysis as stale after equilibrium", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    )
  );

  const state = getResearchFlowState({
    ...solved,
    researchSession: solved.researchSession
      ? {
          ...solved.researchSession,
          assetFreshness: {
            model: "fresh",
            equilibrium: "fresh",
            properties: "stale",
          },
        }
      : solved.researchSession,
  });

  assert.equal(state.hasPropertyAnalyses, false);
  assert.equal(state.isPropertyAnalysisStale, false);
  assert.equal(state.analysisStatusLabel, "等待生成性质分析");
});

test("research flow marks completed analysis without pending action", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const analyzed = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      )
    )
  );

  const state = getResearchFlowState(analyzed);

  assert.equal(state.canConfirmModel, false);
  assert.equal(state.canSolveEquilibrium, false);
  assert.equal(state.canAnalyzeProperties, false);
  assert.equal(state.canDraftPaper, true);
  assert.equal(state.analysisStatusLabel, "已生成 3 项草稿");
});

test("research flow opens paper drafting after stable property analysis", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test research idea",
    now: 1710000000000,
  });
  const analyzed = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      )
    )
  );

  const state = getResearchFlowState(analyzed);
  const action = getResearchPrimaryAction(state, "paper");

  assert.equal(state.canDraftPaper, true);
  assert.equal(action?.kind, "draft_paper");
  assert.ok(action?.description);
});

test("research flow blocks property analysis while an equilibrium patch is still pending", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test research idea",
    now: 1710000000000,
  });
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    )
  );
  const withPendingEquilibriumPatch = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      assetPatches: [
        ...(solved.researchSession?.assetPatches ?? []),
        {
          id: "patch-pending-equilibrium",
          kind: "equilibrium",
          summary: "Pending equilibrium review",
          changes: [
            {
              kind: "replace",
              path: "equilibriumResult.closedForm",
              value: "\\tau_A^* = 1",
            },
          ],
          status: "proposed",
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const state = getResearchFlowState(withPendingEquilibriumPatch);

  assert.equal(state.canAnalyzeProperties, false);
});

test("research flow treats pending property patches as not yet completed analysis", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test research idea",
    now: 1710000000000,
  });
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    )
  );
  const withPendingPropertiesPatch = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      phase: "analysis",
      assetSummary: {
        ...solved.researchSession.assetSummary,
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "请先审阅并应用性质分析修改建议。",
        },
      },
      assetPatches: [
        ...(solved.researchSession?.assetPatches ?? []),
        {
          id: "patch-pending-properties",
          kind: "properties",
          summary: "Pending property analysis review",
          changes: [
            {
              kind: "replace",
              path: "propertyAnalyses",
              value: [
                {
                  id: "candidate-property",
                  target: "\\tau_A^*",
                  parameter: "\\alpha_B",
                  operation: "differentiate",
                  symbolicResult:
                    "\\partial \\tau_A^* / \\partial \\alpha_B < 0",
                  signCondition: "q>0",
                  propositionDraft: "命题：网络效应降低佣金。",
                  proofSketch: "对闭式解求导。",
                  intuition: "平台通过低佣金吸引卖方。",
                  warnings: [],
                },
              ],
            },
          ],
          status: "proposed",
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const state = getResearchFlowState(withPendingPropertiesPatch);

  assert.equal(state.hasPropertyAnalyses, false);
  assert.equal(state.canAnalyzeProperties, true);
});

test("research flow keeps the model-tab solve action available after stale model edits", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const analyzed = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      )
    )
  );
  const pendingReSolveProject = {
    ...analyzed,
    researchSession: analyzed.researchSession
      ? {
          ...analyzed.researchSession,
          assetSummary: {
            ...analyzed.researchSession.assetSummary,
            pendingDecision: {
              kind: "solve_equilibrium",
              prompt: "模型已修改，请重新生成符号均衡。",
            },
          },
        }
      : analyzed.researchSession,
  };
  const updated = markResearchAssetsStaleAfterModelEdit({
    ...pendingReSolveProject,
    hotellingModel: pendingReSolveProject.hotellingModel
      ? {
          ...pendingReSolveProject.hotellingModel,
          assumptions: [
            ...pendingReSolveProject.hotellingModel.assumptions,
            "stale after edit",
          ],
        }
      : pendingReSolveProject.hotellingModel,
  });

  const state = getResearchFlowState(updated);

  assert.equal(state.isEquilibriumStale, true);
  assert.equal(state.canSolveEquilibrium, true);
});

test("model tab primary action switches to start symbolic solving after confirmation", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );

  const action = getResearchModelPrimaryAction(getResearchFlowState(confirmed));

  assert.deepEqual(action, {
    kind: "solve_equilibrium",
    label: "开始符号求解",
    description: "模型已确认，可以继续生成符号均衡。",
  });
});

test("research flow maps phases to the matching asset tab", () => {
  assert.equal(getResearchAssetsTabForPhase("direction"), "directions");
  assert.equal(getResearchAssetsTabForPhase("model"), "model");
  assert.equal(getResearchAssetsTabForPhase("equilibrium"), "equilibrium");
  assert.equal(getResearchAssetsTabForPhase("analysis"), "properties");
  assert.equal(getResearchAssetsTabForPhase("paper"), "paper");
});

test("research action click handlers do not forward the React click event", async () => {
  const receivedArgs = [];
  const clickHandler = createResearchActionClickHandler((...args) => {
    receivedArgs.push(...args);
  });

  await clickHandler({ type: "click", currentTarget: "button" });

  assert.deepEqual(receivedArgs, []);
});

test("research primary actions stay consistent across phase surfaces", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test research idea",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );
  const solved = generateSymbolicEquilibrium(confirmed);
  const modelAction = getResearchModelPrimaryAction(
    getResearchFlowState(confirmed)
  );

  assert.deepEqual(
    getResearchPrimaryAction(getResearchFlowState(confirmed), "model"),
    modelAction
  );
  assert.deepEqual(
    getResearchPrimaryAction(getResearchFlowState(confirmed), "equilibrium"),
    modelAction
  );

  const propertiesAction = getResearchPrimaryAction(
    getResearchFlowState(solved),
    "properties"
  );

  assert.equal(propertiesAction?.kind, "analyze_properties");
  assert.ok(propertiesAction?.description);
});

test("model edits mark equilibrium and property assets stale", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const analyzed = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      )
    )
  );
  const updated = markResearchAssetsStaleAfterModelEdit({
    ...analyzed,
    hotellingModel: analyzed.hotellingModel
      ? {
          ...analyzed.hotellingModel,
          assumptions: [...analyzed.hotellingModel.assumptions, "stale after edit"],
        }
      : analyzed.hotellingModel,
  });

  const state = getResearchFlowState(updated);

  assert.equal(state.assetFreshness.model, "fresh");
  assert.equal(state.assetFreshness.equilibrium, "stale");
  assert.equal(state.assetFreshness.properties, "stale");
  assert.equal(state.isEquilibriumStale, true);
  assert.equal(state.isPropertyAnalysisStale, true);
  assert.equal(updated.equilibriumResult?.status, analyzed.equilibriumResult?.status);
  assert.equal(
    updated.propertyAnalyses?.length,
    analyzed.propertyAnalyses?.length
  );
});
