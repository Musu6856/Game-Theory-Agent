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
import { applyResearchAssetPatchToProject } from "./research-asset-patch-apply.ts";
import { recommendNextAgentStep } from "./research-agent/controller.ts";

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
    ),
    { acceptDefaultFallbackScope: true }
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
    ),
    { acceptDefaultFallbackScope: true }
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
      ),
      { acceptDefaultFallbackScope: true }
    )
  );

  const state = getResearchFlowState(analyzed);

  assert.equal(state.canConfirmModel, false);
  assert.equal(state.canSolveEquilibrium, false);
  assert.equal(state.canAnalyzeProperties, false);
  assert.equal(state.canDraftPaper, true);
  assert.equal(state.analysisStatusLabel, "已生成 3 项草稿");
});

test("research flow exposes re-analysis when prior properties are stale", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test research idea",
    now: 1710000000000,
  });
  const analyzed = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      ),
      { acceptDefaultFallbackScope: true }
    )
  );
  const staleAfterNewEquilibrium = {
    ...analyzed,
    researchSession: {
      ...analyzed.researchSession,
      phase: "analysis",
      assetFreshness: {
        ...(analyzed.researchSession.assetFreshness ?? {}),
        equilibrium: "fresh",
        properties: "stale",
      },
      assetSummary: {
        ...analyzed.researchSession.assetSummary,
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "Equilibrium changed; regenerate property analysis.",
        },
      },
    },
  };

  const state = getResearchFlowState(staleAfterNewEquilibrium);
  const action = getResearchPrimaryAction(state, "properties");

  assert.equal(state.hasPropertyAnalyses, true);
  assert.equal(state.isPropertyAnalysisStale, true);
  assert.equal(state.canAnalyzeProperties, true);
  assert.equal(action?.kind, "analyze_properties");
  assert.equal(state.canDraftPaper, false);
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
      ),
      { acceptDefaultFallbackScope: true }
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
    ),
    { acceptDefaultFallbackScope: true }
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

  assert.equal(state.canSolveEquilibrium, false);
  assert.equal(state.canAnalyzeProperties, false);
});

test("research flow blocks duplicate generation while a property patch is still pending", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test research idea",
    now: 1710000000000,
  });
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    ),
    { acceptDefaultFallbackScope: true }
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
  assert.equal(state.canAnalyzeProperties, false);
  assert.equal(
    getResearchPrimaryAction(state, "properties"),
    null
  );
});

test("research flow blocks re-solving while an equilibrium patch is pending review", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test research idea",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );
  const withPendingEquilibriumPatch = {
    ...confirmed,
    researchSession: {
      ...confirmed.researchSession,
      assetPatches: [
        ...(confirmed.researchSession?.assetPatches ?? []),
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

  assert.equal(state.canSolveEquilibrium, false);
  assert.equal(getResearchPrimaryAction(state, "equilibrium"), null);
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
      ),
      { acceptDefaultFallbackScope: true }
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

test("research flow does not label first equilibrium generation as stale", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究外卖平台定价策略",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );
  const staleWithoutPriorEquilibrium = {
    ...confirmed,
    researchSession: {
      ...confirmed.researchSession,
      assetFreshness: {
        ...confirmed.researchSession.assetFreshness,
        equilibrium: "stale",
      },
    },
  };

  const state = getResearchFlowState(staleWithoutPriorEquilibrium);

  assert.equal(
    staleWithoutPriorEquilibrium.equilibriumResult?.status,
    "needs_revision"
  );
  assert.equal(state.canSolveEquilibrium, true);
  assert.equal(state.isEquilibriumStale, false);
  assert.equal(state.equilibriumStatusLabel, "等待生成符号均衡推导");
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
  const solved = generateSymbolicEquilibrium(confirmed, {
    acceptDefaultFallbackScope: true,
  });
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

test("main chain acceptance states advance only after applying review patches", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );

  assert.equal(getResearchFlowState(confirmed).canSolveEquilibrium, true);
  assert.equal(
    recommendNextAgentStep(confirmed).action?.kind,
    "solve_equilibrium"
  );

  const equilibriumPatch = {
    id: "patch-main-chain-equilibrium",
    kind: "equilibrium",
    summary: "应用一版可用均衡",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "equilibriumResult",
        value: {
          status: "solved",
          concept: "主链路验收均衡",
          solvingSteps: ["写出利润函数", "列出 FOC", "联立求解"],
          focs: ["2*tau_A-alpha_B=0"],
          conditions: ["alpha_B>0", "Second-order condition: Hessian is negative definite."],
          closedForm: "tau_A^*=alpha_B/2",
          derivation: "由 FOC 直接得到。Hessian negative definite, so the candidate is a local maximum.",
          code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
          warnings: [],
        },
      },
    ],
  };
  const withEquilibriumPatch = {
    ...confirmed,
    researchSession: {
      ...confirmed.researchSession,
      assetPatches: [
        ...(confirmed.researchSession?.assetPatches ?? []),
        equilibriumPatch,
      ],
    },
  };

  assert.equal(getResearchFlowState(withEquilibriumPatch).canSolveEquilibrium, false);
  assert.equal(getResearchFlowState(withEquilibriumPatch).canAnalyzeProperties, false);
  assert.equal(recommendNextAgentStep(withEquilibriumPatch).status, "blocked");

  const afterEquilibrium = applyResearchAssetPatchToProject(
    withEquilibriumPatch,
    equilibriumPatch,
    { now: 1710000000002 }
  );

  assert.equal(afterEquilibrium.equilibriumResult?.status, "solved");
  assert.equal(getResearchFlowState(afterEquilibrium).canAnalyzeProperties, true);
  assert.equal(
    recommendNextAgentStep(afterEquilibrium).action?.kind,
    "analyze_properties"
  );

  const propertiesPatch = {
    id: "patch-main-chain-properties",
    kind: "properties",
    summary: "应用性质分析",
    status: "proposed",
    createdAt: 1710000000003,
    changes: [
      {
        kind: "replace",
        path: "propertyAnalyses",
        value: [
          {
            id: "prop-alpha",
            target: "tau_A^*",
            parameter: "alpha_B",
            operation: "differentiate",
            symbolicResult: "d tau_A^*/d alpha_B = 1/2",
            signCondition: "为正",
            propositionDraft: "命题：alpha_B 提高会提高 tau_A^*。",
            proofSketch: "对闭式解求导。",
            intuition: "参数上升推高最优佣金。",
            warnings: [],
          },
          {
            id: "prop-q",
            target: "tau_A^*",
            parameter: "q",
            operation: "differentiate",
            symbolicResult: "d tau_A^*/d q = 0",
            signCondition: "为零",
            propositionDraft: "命题：该简化闭式解不受 q 影响。",
            proofSketch: "表达式中没有 q。",
            intuition: "简化模型已经约化。",
            warnings: [],
          },
          {
            id: "prop-condition",
            target: "existence",
            parameter: "alpha_B",
            operation: "threshold",
            symbolicResult: "alpha_B>0",
            signCondition: "阈值条件",
            propositionDraft: "命题：内点解需要正网络效应参数。",
            proofSketch: "由存在条件直接得到。",
            intuition: "参数边界决定适用范围。",
            warnings: [],
          },
        ],
      },
    ],
  };
  const withPropertiesPatch = {
    ...afterEquilibrium,
    researchSession: {
      ...afterEquilibrium.researchSession,
      assetPatches: [
        ...(afterEquilibrium.researchSession?.assetPatches ?? []),
        propertiesPatch,
      ],
    },
  };

  assert.equal(getResearchFlowState(withPropertiesPatch).canAnalyzeProperties, false);
  assert.equal(getResearchFlowState(withPropertiesPatch).canDraftPaper, false);
  assert.equal(recommendNextAgentStep(withPropertiesPatch).status, "blocked");

  const afterProperties = applyResearchAssetPatchToProject(
    withPropertiesPatch,
    propertiesPatch,
    { now: 1710000000004 }
  );

  assert.equal(afterProperties.propertyAnalyses?.length, 3);
  assert.equal(getResearchFlowState(afterProperties).canDraftPaper, true);
  assert.equal(recommendNextAgentStep(afterProperties).action?.kind, "draft_paper");

  const paperPatch = {
    id: "patch-main-chain-paper",
    kind: "paper",
    summary: "应用论文草稿",
    status: "proposed",
    createdAt: 1710000000005,
    changes: [
      {
        kind: "replace",
        path: "sections",
        value: [
          {
            id: "paper-introduction",
            title: "引言",
            content: "主链路验收论文草稿。",
            status: "generated",
          },
        ],
      },
    ],
  };
  const afterPaper = applyResearchAssetPatchToProject(
    {
      ...afterProperties,
      researchSession: {
        ...afterProperties.researchSession,
        assetPatches: [
          ...(afterProperties.researchSession?.assetPatches ?? []),
          paperPatch,
        ],
      },
    },
    paperPatch,
    { now: 1710000000006 }
  );

  assert.equal(afterPaper.sections.length, 1);
  assert.equal(recommendNextAgentStep(afterPaper).status, "complete");
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
      ),
      { acceptDefaultFallbackScope: true }
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
