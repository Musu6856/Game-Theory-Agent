import assert from "node:assert/strict";
import test from "node:test";

import { planSafeContinuation, recommendNextAgentStep } from "./controller.ts";

test("recommendNextAgentStep routes high-impact version review to the actionable asset", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "研究平台佣金",
    refinedIdea: "平台佣金与补贴",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: createEquilibrium(),
    propertyAnalyses: [createProperty("p1"), createProperty("p2"), createProperty("p3")],
    researchSession: {
      phase: "paper",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
      },
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
          createdAt: 1710000000001,
          impact: {
            summary: "模型设定已变更。",
            affectedAssetKinds: ["equilibrium", "properties", "paper"],
            reviewFocus: ["重算均衡。"],
            nextAction: "重新生成符号均衡",
          },
        },
      ],
    },
  });

  assert.equal(recommendation.status, "blocked");
  assert.equal(recommendation.targetTab, "equilibrium");
  assert.equal(recommendation.blocker?.kind, "version_review");
  assert.match(recommendation.reason, /版本复盘/);
});

test("recommendNextAgentStep follows the latest version review action when older high-impact events remain", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "platform commission",
    refinedIdea: "platform commission and subsidy",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: createEquilibrium(),
    propertyAnalyses: [createProperty("p1"), createProperty("p2"), createProperty("p3")],
    researchSession: {
      phase: "paper",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
      },
      assetVersionHistory: [
        {
          id: "version-model",
          assetKind: "model",
          action: "applied_patch",
          patchId: "patch-model",
          summary: "apply model",
          changedPaths: [],
          changes: [],
          changeCount: 0,
          createdAt: 1710000000001,
          impact: {
            summary: "model changed",
            affectedAssetKinds: ["equilibrium", "properties", "paper"],
            reviewFocus: ["regenerate equilibrium"],
            nextAction: "regenerate symbolic equilibrium",
          },
        },
        {
          id: "version-equilibrium",
          assetKind: "equilibrium",
          action: "applied_patch",
          patchId: "patch-equilibrium",
          summary: "apply equilibrium",
          changedPaths: [],
          changes: [],
          changeCount: 0,
          createdAt: 1710000000002,
          impact: {
            summary: "equilibrium changed",
            affectedAssetKinds: ["properties", "paper"],
            reviewFocus: ["regenerate properties"],
            nextAction: "regenerate property analysis",
          },
        },
        {
          id: "version-properties",
          assetKind: "properties",
          action: "applied_patch",
          patchId: "patch-properties",
          summary: "apply properties",
          changedPaths: [],
          changes: [],
          changeCount: 0,
          createdAt: 1710000000003,
          impact: {
            summary: "properties changed",
            affectedAssetKinds: ["paper"],
            reviewFocus: ["review paper draft"],
            nextAction: "review or rewrite paper draft",
          },
        },
      ],
    },
  });

  assert.equal(recommendation.status, "blocked");
  assert.equal(recommendation.targetTab, "paper");
  assert.equal(recommendation.blocker?.kind, "version_review");
  assert.equal(recommendation.blocker?.description, "review or rewrite paper draft");
});

test("recommendNextAgentStep prioritizes failed math verification", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "研究平台佣金",
    refinedIdea: "平台佣金与补贴",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: createEquilibrium(),
    propertyAnalyses: [
      {
        ...createProperty("wrong"),
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=\\frac{3}{q}",
      },
      createProperty("p2"),
      createProperty("p3"),
    ],
    researchSession: {
      phase: "paper",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
      },
      assetVersionHistory: [],
    },
  });

  assert.equal(recommendation.status, "blocked");
  assert.equal(recommendation.targetTab, "quality");
  assert.equal(recommendation.blocker?.kind, "math_verification");
  assert.match(recommendation.reason, /数学验证/);
});

test("recommendNextAgentStep uses saved failed equilibrium artifacts to re-solve", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "研究平台佣金",
    refinedIdea: "平台佣金与补贴",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: createEquilibrium(),
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "均衡已生成。",
        },
      },
      mathArtifacts: [
        {
          id: "artifact-failed-solve",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "sympy_solve_check",
          title: "SymPy 独立求解对照",
          status: "failed",
          source: "sympy",
          output: { solutions: [] },
          createdAt: 1710000000000,
        },
      ],
    },
  });

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "solve_equilibrium");
  assert.match(recommendation.reason, /数学产物|重新/);
});

test("recommendNextAgentStep uses compiled system gaps to repair the model first", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "研究平台佣金",
    refinedIdea: "平台佣金与补贴",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: createEquilibrium(),
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "均衡已生成。",
        },
      },
      mathArtifacts: [
        {
          id: "artifact-compiled-gap",
          runId: "agent-equilibrium",
          stepId: "prepare-equilibrium",
          patchId: "patch-equilibrium",
          kind: "compiled_game_system",
          title: "Compiled game system",
          status: "manual_review",
          source: "model",
          output: {
            objectives: [],
            issues: [
              "No safe structured profit functions are available for FOC generation.",
            ],
          },
          createdAt: 1710000000000,
        },
      ],
    },
  });

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.targetTab, "model");
  assert.equal(recommendation.action?.agentAction, "build_model");
  assert.match(recommendation.reason, /模型|利润函数|FOC/);
});

test("recommendNextAgentStep uses missing decision variables to repair the model first", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "研究平台功能差异化",
    refinedIdea: "平台功能差异化与定价",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: {
      ...createEquilibrium(),
      status: "symbolic_failure",
      closedForm: "No closed-form equilibrium yet.",
    },
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "symbolic_failure",
        nextActions: [],
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt: "请重新求解均衡。",
        },
      },
      mathArtifacts: [
        {
          id: "artifact-missing-decision-variables",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "equilibrium_candidate",
          title: "Equilibrium candidate",
          status: "manual_review",
          source: "provider",
          issues: [
            "Closed-form equilibrium is missing model decision variable(s): a_A, a_B.",
          ],
          createdAt: 1710000000000,
        },
      ],
    },
  });

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.targetTab, "model");
  assert.equal(recommendation.action?.agentAction, "build_model");
  assert.match(recommendation.reason, /模型|变量|求解输入/);
});

test("planSafeContinuation blocks model repair instead of auto-running build_model", () => {
  const plan = planSafeContinuation({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "研究平台功能差异化",
    refinedIdea: "平台功能差异化与定价",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: {
      ...createEquilibrium(),
      status: "symbolic_failure",
      closedForm: "No closed-form equilibrium yet.",
    },
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "symbolic_failure",
        nextActions: [],
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt: "请重新求解均衡。",
        },
      },
      mathArtifacts: [
        {
          id: "artifact-missing-decision-variables",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "equilibrium_candidate",
          title: "Equilibrium candidate",
          status: "manual_review",
          source: "provider",
          issues: [
            "Closed-form equilibrium is missing model decision variable(s): a_A, a_B.",
          ],
          createdAt: 1710000000000,
        },
      ],
    },
  });

  assert.equal(plan.status, "blocked");
  assert.equal(plan.stopReason, "manual_choice_required");
  assert.match(plan.reason, /模型修复|手动/);
});

test("recommendNextAgentStep reruns solving after an applied model repair makes old math artifacts stale", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "研究平台功能差异化",
    refinedIdea: "平台功能差异化与定价",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: {
      ...createEquilibrium(),
      status: "symbolic_failure",
      closedForm: "No closed-form equilibrium yet.",
    },
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetFreshness: {
        model: "fresh",
        equilibrium: "stale",
        properties: "stale",
      },
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "symbolic_failure",
        nextActions: [],
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt: "模型修复已应用，请重新求解均衡。",
        },
      },
      mathArtifacts: [
        {
          id: "artifact-old-missing-decision-variables",
          runId: "agent-equilibrium-old",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium-old",
          kind: "equilibrium_candidate",
          title: "Old equilibrium candidate",
          status: "manual_review",
          source: "provider",
          issues: [
            "Closed-form equilibrium is missing model decision variable(s): a_A, a_B.",
          ],
          createdAt: 1710000000000,
        },
      ],
    },
  });

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.targetTab, "equilibrium");
  assert.equal(recommendation.action?.kind, "solve_equilibrium");
  assert.equal(recommendation.action?.agentAction, "solve_equilibrium");
  assert.match(recommendation.title, /重新生成|重新尝试|开始/);
});

test("recommendNextAgentStep ignores pre-repair model-gap artifacts after model patch approval", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "platform quality differentiation",
    refinedIdea: "platform quality differentiation and subsidy competition",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: {
      ...createEquilibrium(),
      status: "symbolic_failure",
      closedForm: "No closed-form equilibrium yet.",
    },
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "needs_revision",
        nextActions: [],
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt: "model repair was applied; solve equilibrium again",
        },
      },
      assetVersionHistory: [
        {
          id: "asset-version-patch-model-repair-applied",
          assetKind: "model",
          action: "applied_patch",
          patchId: "patch-model-repair",
          summary: "complete model solver inputs",
          changedPaths: ["hotellingModel.modelSetupDraft"],
          changes: [],
          changeCount: 1,
          createdAt: 1710000000100,
          approvedBy: "user",
        },
      ],
      mathArtifacts: [
        {
          id: "artifact-old-missing-decision-variables",
          runId: "agent-equilibrium-old",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium-old",
          kind: "equilibrium_candidate",
          title: "Old equilibrium candidate",
          status: "manual_review",
          source: "provider",
          issues: [
            "Closed-form equilibrium is missing model decision variable(s): a_A, a_B.",
          ],
          createdAt: 1710000000000,
        },
      ],
    },
  });

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.targetTab, "equilibrium");
  assert.equal(recommendation.action?.kind, "solve_equilibrium");
  assert.equal(recommendation.action?.agentAction, "solve_equilibrium");
  assert.notEqual(recommendation.action?.kind, "answer_model_question");
});

test("recommendNextAgentStep blocks property analysis when solved equilibrium still needs optimality review", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "platform commission",
    refinedIdea: "platform commission and subsidy",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: createEquilibrium(),
    researchSession: {
      phase: "analysis",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "equilibrium solved",
        },
      },
      mathArtifacts: [
        {
          id: "artifact-boundary-kkt-review",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "boundary_kkt_check",
          title: "Boundary and KKT check",
          status: "condition_insufficient",
          source: "sympy",
          issues: ["Boundary candidate needs KKT evidence."],
          createdAt: 1710000000000,
        },
      ],
    },
  });

  assert.equal(recommendation.status, "blocked");
  assert.equal(recommendation.targetTab, "quality");
  assert.equal(recommendation.action?.kind, undefined);
});

test("recommendNextAgentStep opens property analysis when solved equilibrium has optimality evidence", () => {
  const recommendation = recommendNextAgentStep({
    id: "project-1",
    createdAt: 1710000000000,
    rawIdea: "platform commission",
    refinedIdea: "platform commission and subsidy",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    hotellingModel: createModel(),
    equilibriumResult: {
      ...createEquilibrium(),
      conditions: [
        ...createEquilibrium().conditions,
        "Second-order condition: Hessian is negative definite.",
      ],
      derivation:
        "FOC gives the candidate, and the Hessian is negative definite at the candidate.",
    },
    researchSession: {
      phase: "analysis",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "equilibrium solved",
        },
      },
      mathArtifacts: [
        {
          id: "artifact-manual-generated-foc",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "generated_foc_system",
          title: "Generated FOC system",
          status: "manual_review",
          source: "sympy",
          input: {
            objectives: [
              {
                expression: "alpha_B*tau_A - tau_A^2",
                variable: "tau_A",
              },
            ],
          },
          issues: ["SymPy FOC generation is unavailable."],
          createdAt: 1710000000000,
        },
      ],
    },
  });

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.targetTab, "properties");
  assert.equal(recommendation.action?.kind, "analyze_properties");
});

function createModel() {
  return {
    symbols: [
      {
        id: "tau_A",
        symbol: "tau_A",
        baseSymbol: "tau",
        subscript: "A",
        codeName: "tau_A",
        name: "A 平台佣金",
        meaning: "平台 A 的卖家佣金率。",
        role: "parameter",
        side: "platform",
        assumption: "positive",
        recommended: true,
      },
      {
        id: "alpha_B",
        symbol: "alpha_B",
        baseSymbol: "alpha",
        subscript: "B",
        codeName: "alpha_B",
        name: "买方网络效应",
        meaning: "卖方参与对买方效用的影响。",
        role: "parameter",
        side: "consumer",
        assumption: "nonnegative",
        recommended: true,
      },
      {
        id: "q",
        symbol: "q",
        baseSymbol: "q",
        codeName: "q",
        name: "成交价值",
        meaning: "单位交易价值。",
        role: "parameter",
        side: "global",
        assumption: "positive",
        recommended: true,
      },
    ],
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [],
    utilityFunctions: [],
    demandDerivation: "",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "Pi_A = tau_A q",
        notes: "平台利润。",
      },
    ],
    assumptions: ["q > 0"],
    modelSetupDraft: "双边平台模型。",
  };
}

function createEquilibrium() {
  return {
    status: "solved",
    concept: "内点均衡",
    solvingSteps: ["对 tau_A 求一阶条件"],
    focs: ["partial Pi_A / partial tau_A = 0"],
    conditions: ["q > 0"],
    closedForm: "tau_A^*=2*alpha_B/q",
    derivation: "由 FOC 得到 tau_A^*。",
    code: "sp.solve([foc_tau_A], [tau_A])",
    warnings: [],
  };
}

function createProperty(id) {
  return {
    id,
    target: "tau_A^*",
    parameter: "\\alpha_B",
    operation: "differentiate",
    symbolicResult:
      "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=\\frac{2}{q}",
    signCondition: "为正",
    propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
    proofSketch: "对 tau_A^* 求偏导。",
    intuition: "q 为正时偏导为正。",
    warnings: [],
  };
}
