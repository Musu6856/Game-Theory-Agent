import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { runEquilibriumSolvingAgent } from "./equilibrium-runner.ts";
import { applyResearchAssetPatchToProject } from "../research-asset-patch-apply.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
} from "../research-session.ts";
import { createAgentRun, updateStepStatus } from "./state.ts";
import { appendAgentRunToProject } from "./trace.ts";

const hasLocalSympy =
  spawnSync("python", ["-c", "import sympy"], {
    encoding: "utf8",
  }).status === 0;

function createConfirmedProject() {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });

  return confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );
}

function createExplicitProfitModel() {
  return {
    symbols: [
      {
        id: "tau-a",
        symbol: "\\tau_A",
        baseSymbol: "tau",
        subscript: "A",
        codeName: "tau_A",
        name: "平台 A 佣金",
        meaning: "平台 A 选择的佣金。",
        role: "decision",
        side: "platform",
        assumption: "tau_A >= 0",
        recommended: true,
      },
      {
        id: "alpha-b",
        symbol: "\\alpha_B",
        baseSymbol: "alpha",
        subscript: "B",
        codeName: "alpha_B",
        name: "买方网络效应",
        meaning: "买方侧网络效应强度。",
        role: "parameter",
        side: "consumer",
        assumption: "alpha_B > 0",
        recommended: true,
      },
    ],
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A"],
    timing: [
      {
        id: "pricing",
        order: 1,
        name: "平台定价",
        decisions: ["tau_A"],
      },
    ],
    utilityFunctions: [],
    demandDerivation: "测试模型直接给出约化利润函数。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "alpha_B*tau_A - tau_A^2",
        notes: "平台 A 的安全显式利润函数。",
      },
    ],
    assumptions: ["alpha_B > 0"],
    modelSetupDraft: "测试用显式利润函数。",
  };
}

function createQualityRecommendationModel() {
  return {
    symbols: [
      {
        id: "tau-a",
        symbol: "\\tau_A",
        baseSymbol: "tau",
        subscript: "A",
        codeName: "tau_A",
        name: "Platform A commission",
        meaning: "Commission chosen by platform A",
        role: "decision",
        side: "platform",
        assumption: "tau_A >= 0",
        recommended: true,
      },
      {
        id: "s-a",
        symbol: "s_A",
        baseSymbol: "s",
        subscript: "A",
        codeName: "s_A",
        name: "Platform A subsidy",
        meaning: "Subsidy chosen by platform A",
        role: "decision",
        side: "platform",
        assumption: "s_A >= 0",
        recommended: true,
      },
      {
        id: "q-a",
        symbol: "q_A",
        baseSymbol: "q",
        subscript: "A",
        codeName: "q_A",
        name: "Quality investment",
        meaning: "Quality investment chosen by platform A",
        role: "decision",
        side: "platform",
        assumption: "q_A >= 0",
        recommended: true,
      },
      {
        id: "r-a",
        symbol: "r_A",
        baseSymbol: "r",
        subscript: "A",
        codeName: "r_A",
        name: "Recommendation strength",
        meaning: "Recommendation strength chosen by platform A",
        role: "decision",
        side: "platform",
        assumption: "0 <= r_A <= 1",
        recommended: true,
      },
    ],
    sides: {
      consumerSideName: "buyers",
      merchantSideName: "sellers",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "platform-choice",
        order: 1,
        name: "Platforms choose commission, subsidy, quality, and recommendation",
        decisions: ["tau_A", "s_A", "q_A", "r_A"],
      },
    ],
    utilityFunctions: [
      {
        id: "buyer-a",
        side: "consumer",
        platform: "A",
        expression: "v + theta*q_A + r_A - p_A - t*x",
        notes: "Quality and recommendation shift buyer utility.",
      },
    ],
    demandDerivation:
      "Demand depends on commission tau_A, subsidy s_A, quality q_A, and recommendation r_A.",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression:
          "Pi_A = tau_A*n_A^S - s_A*n_A^B - c_q*q_A^2/2 - c_r*r_A^2/2",
        notes: "Quality investment and recommendation strength are costly strategic choices.",
      },
    ],
    assumptions: ["theta > 0", "c_q > 0", "c_r > 0"],
    modelSetupDraft:
      "A mechanism-rich platform model with quality investment and recommendation strength.",
  };
}

function withOptimalityEvidence(equilibrium) {
  return {
    ...equilibrium,
    solvingSteps: [
      ...equilibrium.solvingSteps,
      "检查二阶条件或 Hessian 负定性。",
    ],
    conditions: [
      ...equilibrium.conditions,
      "二阶条件成立：自身决策 Hessian 负定。",
    ],
    derivation:
      `${equilibrium.derivation}\n二阶条件/Hessian 检查显示自身目标函数在候选点局部凹，满足晋升条件。`,
  };
}

test("equilibrium solving agent proposes a reviewable equilibrium patch with trace", async () => {
  const project = createConfirmedProject();
  const candidateEquilibrium = withOptimalityEvidence({
    status: "solved",
    concept: "双边 Hotelling 平台竞争内点均衡",
    solvingSteps: ["写出平台利润函数", "对佣金和补贴求一阶条件", "联立求解内点解"],
    focs: ["\\partial \\Pi_A / \\partial \\tau_A = 0"],
    conditions: ["t_B > \\alpha_B", "q > 0"],
    closedForm:
      "\\tau_A^* = \\frac{t_B - \\alpha_B}{2q}; \\tau_B^* = \\frac{t_B - \\alpha_B}{2q}; s_A^* = \\frac{\\alpha_B}{2}; s_B^* = \\frac{\\alpha_B}{2}",
    derivation: "由一阶条件联立即得对称内点均衡。",
    code: "import sympy as sp\nsp.solve([foc_tau_A], [tau_A])",
    warnings: [],
  });

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-test",
      now: 1710000000000,
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: candidateEquilibrium,
          researchSession: {
            ...project.researchSession,
            phase: "equilibrium",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus: "solved",
              nextActions: ["检查符号均衡推导", "生成性质分析"],
              pendingDecision: {
                kind: "analyze_properties",
                prompt: "符号均衡结果已经生成。",
              },
            },
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-provider-equilibrium",
                role: "assistant",
                content: "我给出一版闭式均衡。",
                createdAt: 0,
              },
            ],
          },
        },
        usedFallback: false,
        assistantMessage: "我给出一版闭式均衡。",
      }),
    }
  );

  const session = result.project.researchSession;
  const patch = session?.assetPatches?.[0];

  assert.equal(result.usedFallback, false);
  assert.match(result.assistantMessage, /待审核修改建议/);
  assert.doesNotMatch(result.assistantMessage, /Equilibrium review/);
  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, true);
  assert.equal(session?.agentRun?.status, "paused");
  assert.equal(session?.phase, "equilibrium");
  assert.equal(session?.assetSummary.pendingDecision?.kind, "solve_equilibrium");
  assert.match(
    session?.assetSummary.pendingDecision?.prompt ?? "",
    /审阅并应用均衡修改建议/
  );
  assert.equal(patch?.kind, "equilibrium");
  assert.equal(patch?.status, "proposed");
  assert.equal(
    patch?.changes.some((change) => change.path === "equilibriumResult"),
    true
  );
  assert.equal(
    result.agentRun.trace.some((event) => event.type === "tool_result"),
    true
  );
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.stepId === "review-equilibrium" &&
        event.type === "tool_result" &&
        event.metadata?.kernelDecision?.action
    ),
    true
  );
});

test("equilibrium solving agent keeps candidate equilibrium pending until applied", async () => {
  const baseProject = createConfirmedProject();
  const project = {
    ...baseProject,
    hotellingModel: createExplicitProfitModel(),
  };
  const providerDraftMessage =
    "FULL_EQUILIBRIUM_PROVIDER_DRAFT_SHOULD_STAY_OUT_OF_CHAT";
  const candidateEquilibrium = {
    status: "solved",
    concept: "候选均衡概念",
    solvingSteps: ["Write FOC", "Solve FOC", "Check second-order condition"],
    focs: ["2*tau_A - alpha_B = 0"],
    conditions: ["alpha_B > 0", "Second-order condition: -2 < 0"],
    closedForm: "tau_A^* = alpha_B/2",
    derivation: "候选推导。Hessian is negative definite for the one-dimensional objective.",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  };

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-pending-test",
      now: 1710000000000,
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: candidateEquilibrium,
          researchSession: {
            ...project.researchSession,
            phase: "equilibrium",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus: "solved",
              nextActions: ["生成性质分析"],
              pendingDecision: {
                kind: "analyze_properties",
                prompt: "符号均衡结果已经生成。",
              },
            },
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-provider-equilibrium",
                role: "assistant",
                content: providerDraftMessage,
                createdAt: 0,
              },
            ],
          },
        },
        usedFallback: false,
        assistantMessage: providerDraftMessage,
      }),
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const rootChange = patch?.changes.find(
    (change) => change.path === "equilibriumResult"
  );

  assert.notEqual(result.project.equilibriumResult?.closedForm, "tau_A^* = alpha_B/2");
  assert.equal(rootChange?.value, candidateEquilibrium);
  assert.equal(
    result.project.researchSession?.messages.some((message) =>
      message.content.includes(providerDraftMessage)
    ),
    false
  );

  const applied = applyResearchAssetPatchToProject(result.project, patch, {
    now: 1710000000001,
  });

  assert.equal(applied.equilibriumResult?.closedForm, "tau_A^* = alpha_B/2");
  assert.equal(applied.researchSession?.assetPatches?.[0].status, "applied");
  assert.equal(
    applied.researchSession?.assetSummary.pendingDecision?.kind,
    "analyze_properties"
  );
});

test("equilibrium solving agent blocks simplified equilibria that omit rich model mechanisms", async () => {
  const baseProject = createConfirmedProject();
  const project = {
    ...baseProject,
    hotellingModel: createQualityRecommendationModel(),
  };
  const simplifiedEquilibrium = withOptimalityEvidence({
    status: "solved",
    concept: "Simplified tau and subsidy Hotelling equilibrium",
    solvingSteps: [
      "Write FOCs for tau_A and s_A",
      "Solve the symmetric interior system",
    ],
    focs: [
      "partial Pi_A / partial tau_A = 0",
      "partial Pi_A / partial s_A = 0",
    ],
    conditions: ["t > alpha", "Second-order condition: Hessian is negative definite."],
    closedForm:
      "n_A^{B*}=1/2; n_A^{S*}=1/2; tau_A^*=(t-alpha)/2; s_A^*=alpha/2",
    derivation:
      "The symmetric Hotelling core gives a one-half allocation after solving tau and subsidy.",
    code: "sp.solve([foc_tau_A, foc_s_A], [tau_A, s_A])",
    warnings: [],
  });

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-coverage-block-test",
      now: 1710000000000,
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: simplifiedEquilibrium,
          researchSession: {
            ...project.researchSession,
            phase: "equilibrium",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus: "solved",
              nextActions: ["Review symbolic equilibrium", "Analyze properties"],
              pendingDecision: {
                kind: "analyze_properties",
                prompt: "A symbolic equilibrium is ready.",
              },
            },
            messages: project.researchSession?.messages ?? [],
          },
        },
        usedFallback: false,
        assistantMessage: "A solved equilibrium candidate is ready.",
      }),
    }
  );

  const patches = result.project.researchSession?.assetPatches ?? [];
  const artifacts = result.project.researchSession?.mathArtifacts ?? [];
  const coverageArtifact = artifacts.find(
    (artifact) => artifact.kind === "model_coverage_check"
  );

  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, true);
  assert.equal(patches.some((patch) => patch.kind === "equilibrium"), true);
  assert.equal(
    patches.find((patch) => patch.kind === "equilibrium")?.changes[0]
      ?.reviewRisk,
    "coverage_blocked"
  );
  assert.equal(result.project.equilibriumResult?.status, "needs_revision");
  assert.equal(coverageArtifact?.status, "failed");
  assert.ok(
    coverageArtifact?.issues?.some(
      (issue) => issue.includes("q_A") && issue.includes("r_A")
    )
  );
  assert.ok(
    result.agentRun.trace.some(
      (event) =>
        event.stepId === "review-equilibrium" &&
        event.metadata?.reason === "model_coverage_failed"
    )
  );
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
});

test("equilibrium solving agent keeps non-solved draft in chat without proposing a formal equilibrium patch", async () => {
  const project = createConfirmedProject();
  const providerDraftMessage =
    "## 隐式均衡推导草稿\n\n当前只能得到 F(z, theta)=0，尚未证明闭式解。";
  const draftEquilibrium = {
    status: "implicit_system",
    concept: "隐式均衡系统草稿",
    solvingSteps: ["列出平台利润函数", "写出 FOC", "停在隐式系统"],
    focs: ["F(z,theta)=0"],
    conditions: ["det J_zF != 0"],
    closedForm: "尚未得到闭式均衡解。",
    derivation: providerDraftMessage,
    code: "import sympy as sp\n# implicit system draft",
    warnings: ["这不是正式 solved 均衡。"],
  };

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-draft-test",
      now: 1710000000000,
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: draftEquilibrium,
          researchSession: {
            ...project.researchSession,
            phase: "equilibrium",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus: "implicit_system",
              nextActions: ["继续修正模型或推导草稿"],
              pendingDecision: {
                kind: "solve_equilibrium",
                prompt: "继续求解或修正模型输入。",
              },
            },
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-equilibrium-provider-draft",
                role: "assistant",
                content: providerDraftMessage,
                createdAt: 0,
              },
            ],
          },
        },
        usedFallback: false,
        assistantMessage: providerDraftMessage,
      }),
    }
  );

  const session = result.project.researchSession;

  assert.equal(result.usedFallback, false);
  assert.equal(result.project.equilibriumResult?.status, "implicit_system");
  assert.equal(session?.assetPatches?.some((patch) => patch.kind === "equilibrium"), false);
  assert.equal(session?.assetSummary.pendingDecision?.kind, "solve_equilibrium");
  assert.equal(session?.assetSummary.equilibriumStatus, "implicit_system");
  assert.equal(
    session?.messages.some((message) =>
      message.content.includes("隐式均衡推导草稿")
    ),
    true
  );
  assert.match(result.assistantMessage, /草稿|没有创建正式均衡 patch|不会进入性质分析/);
  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, false);
});

test("equilibrium solving agent preserves an existing equilibrium asset when a re-solve falls back to a draft", async () => {
  const baseProject = createConfirmedProject();
  const existingEquilibrium = withOptimalityEvidence({
    status: "solved",
    concept: "Previously applied equilibrium candidate",
    solvingSteps: ["Solve the earlier accepted candidate."],
    focs: ["\\partial \\Pi_A / \\partial s_A = 0"],
    conditions: ["Second-order condition was recorded for the prior candidate."],
    closedForm: "s_A^*=s_B^*=s^*, \\tau_A^*=\\tau_B^*=\\tau^*",
    derivation: "Prior candidate retained as the current right-side asset.",
    code: "import sympy as sp",
    warnings: [],
  });
  const project = {
    ...baseProject,
    equilibriumResult: existingEquilibrium,
    propertyAnalyses: [
      {
        id: "prior-analysis",
        target: "\\tau_i^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_i^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
        signCondition: "q>0 时为负。",
        propositionDraft: "Prior proposition.",
        proofSketch: "Prior proof.",
        intuition: "Prior intuition.",
        warnings: [],
      },
    ],
    researchSession: {
      ...baseProject.researchSession,
      phase: "equilibrium",
      assetSummary: {
        ...baseProject.researchSession?.assetSummary,
        equilibriumStatus: "solved",
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt: "Retry symbolic equilibrium solving.",
        },
      },
      assetFreshness: {
        model: "fresh",
        equilibrium: "fresh",
        properties: "stale",
      },
    },
  };
  const fallbackDraftMessage =
    "I only obtained a fallback derivation draft for the re-solve attempt.";
  const fallbackDraft = {
    status: "derivation_draft",
    concept: "Fallback diagnostic draft",
    solvingSteps: ["List model-bound FOCs but do not solve them."],
    focs: ["F(z,theta)=0"],
    conditions: ["Need model repair or manual review."],
    closedForm: "No closed-form result from this re-solve.",
    derivation: fallbackDraftMessage,
    code: "print('diagnostic only')",
    warnings: ["This fallback draft must not overwrite the existing asset."],
  };

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-fallback-after-existing-test",
      now: 1710000000000,
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: fallbackDraft,
          researchSession: {
            ...project.researchSession,
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-provider-fallback-draft",
                role: "assistant",
                content: fallbackDraftMessage,
                createdAt: 0,
              },
            ],
          },
        },
        usedFallback: true,
        assistantMessage: fallbackDraftMessage,
      }),
    }
  );

  const session = result.project.researchSession;

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.equilibriumResult?.closedForm, existingEquilibrium.closedForm);
  assert.equal(result.project.equilibriumResult?.status, "solved");
  assert.deepEqual(result.project.propertyAnalyses, project.propertyAnalyses);
  assert.equal(session?.assetSummary.pendingDecision?.kind, "solve_equilibrium");
  assert.equal(session?.assetSummary.equilibriumStatus, "solved");
  assert.equal(
    session?.messages.some((message) =>
      message.content.includes(fallbackDraftMessage)
    ),
    true
  );
  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, false);
});

test("equilibrium solving agent keeps FOC-only solved output as draft until second-order evidence exists", async () => {
  const baseProject = createConfirmedProject();
  const project = {
    ...baseProject,
    hotellingModel: createExplicitProfitModel(),
  };
  const focOnlyEquilibrium = {
    status: "solved",
    concept: "FOC-only candidate",
    solvingSteps: ["Write platform profit.", "Take first-order condition.", "Solve FOC."],
    focs: ["2*tau_A - alpha_B = 0"],
    conditions: ["alpha_B > 0"],
    closedForm: "tau_A^* = alpha_B/2",
    derivation: "The FOC gives tau_A^* = alpha_B/2.",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  };

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-foc-only-test",
      now: 1710000000000,
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: focOnlyEquilibrium,
          researchSession: {
            ...project.researchSession,
            phase: "equilibrium",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus: "solved",
              nextActions: ["检查二阶条件"],
              pendingDecision: {
                kind: "analyze_properties",
                prompt: "符号均衡结果已经生成。",
              },
            },
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-provider-foc-only",
                role: "assistant",
                content: "FOC-only derivation.",
                createdAt: 0,
              },
            ],
          },
        },
        usedFallback: false,
        assistantMessage: "FOC-only derivation.",
      }),
    }
  );

  const session = result.project.researchSession;

  assert.equal(session?.assetPatches?.some((patch) => patch.kind === "equilibrium"), false);
  assert.equal(result.project.equilibriumResult?.status, "solved");
  assert.equal(session?.assetSummary.pendingDecision?.kind, "solve_equilibrium");
  assert.equal(result.agentRun.requiresApproval, false);
  assert.match(result.assistantMessage, /二阶条件|Hessian|凹性|KKT|边界|没有创建正式均衡 patch/);
});

test("equilibrium solving agent persists step-level math artifacts for review", async () => {
  const project = createConfirmedProject();
  const candidateEquilibrium = {
    status: "solved",
    concept: "可复核均衡",
    solvingSteps: ["写出 FOC", "联立求解"],
    focs: ["2*tau_A - alpha_B = 0"],
    conditions: ["alpha_B > 0"],
    closedForm: "tau_A^* = alpha_B/2",
    derivation: "由 FOC 得到。",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  };

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-artifact-test",
      now: 1710000000000,
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: candidateEquilibrium,
          researchSession: {
            ...project.researchSession,
            phase: "equilibrium",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus: "solved",
              nextActions: ["检查符号均衡推导", "生成性质分析"],
              pendingDecision: {
                kind: "analyze_properties",
                prompt: "符号均衡结果已经生成。",
              },
            },
            messages: project.researchSession?.messages ?? [],
          },
        },
        usedFallback: false,
        assistantMessage: "均衡候选。",
      }),
    }
  );

  const artifacts = result.project.researchSession?.mathArtifacts ?? [];
  const patchId = result.project.researchSession?.assetPatches?.[0]?.id;

  assert.ok(artifacts.some((artifact) => artifact.kind === "equilibrium_candidate"));
  assert.ok(
    artifacts.some(
      (artifact) =>
        artifact.kind === "closed_form_substitutions" &&
        artifact.stepId === "review-equilibrium"
    )
  );
  assert.ok(
    artifacts.some((artifact) => artifact.kind === "foc_residuals")
  );
  assert.equal(
    artifacts.every((artifact) => artifact.runId === result.agentRun.id),
    true
  );
  assert.equal(
    artifacts.every((artifact) => artifact.patchId === patchId),
    true
  );
  assert.deepEqual(
    artifacts.find((artifact) => artifact.kind === "equilibrium_candidate")
      ?.output,
    { equilibrium: candidateEquilibrium }
  );
});

test("equilibrium solving agent streams math artifacts to the task sink", async () => {
  const project = createConfirmedProject();
  const streamedArtifacts = [];
  const candidateEquilibrium = {
    status: "solved",
    concept: "streamed candidate",
    solvingSteps: ["Write FOC", "Solve"],
    focs: ["partial Pi_A / partial tau_A = 0"],
    conditions: ["alpha_B > 0"],
    closedForm: "tau_A^* = alpha_B/2",
    derivation: "Candidate needs model-grounded review.",
    code: "sp.solve([foc_tau_A], [tau_A])",
    warnings: [],
  };

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-stream-test",
      now: 1710000000000,
      onMathArtifact: async (artifact, context) => {
        streamedArtifacts.push({
          id: artifact.id,
          kind: artifact.kind,
          runId: artifact.runId,
          contextRunId: context.runId,
        });
      },
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: candidateEquilibrium,
          researchSession: {
            ...project.researchSession,
            phase: "equilibrium",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus: "solved",
              nextActions: ["Review equilibrium"],
            },
            messages: project.researchSession?.messages ?? [],
          },
        },
        usedFallback: false,
        assistantMessage: "candidate",
      }),
    }
  );

  assert.ok(streamedArtifacts.length >= 4);
  assert.deepEqual(
    streamedArtifacts.map((artifact) => artifact.kind).slice(0, 4),
    [
      "model_coverage_check",
      "compiled_game_system",
      "closed_form_substitutions",
      "foc_residuals",
    ]
  );
  assert.equal(
    streamedArtifacts.every(
      (artifact) =>
        artifact.runId === result.agentRun.id &&
        artifact.contextRunId === result.agentRun.id
    ),
    true
  );
});

test("equilibrium solving agent proposes a model repair patch when solver inputs are missing", async () => {
  const baseProject = createConfirmedProject();
  const project = {
    ...baseProject,
    hotellingModel: {
      ...baseProject.hotellingModel,
      profitFunctions: [],
      modelSetupDraft: "confirmed model without explicit profits",
    },
  };
  const candidateEquilibrium = {
    status: "solved",
    concept: "candidate from incomplete model",
    solvingSteps: ["Write FOC", "Solve"],
    focs: ["2*tau_A - alpha_B = 0"],
    conditions: ["alpha_B > 0"],
    closedForm: "tau_A^* = alpha_B/2",
    derivation: "candidate derivation",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  };
  let attempts = 0;

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-model-repair-test",
      now: 1710000000000,
      solveEquilibrium: async () => {
        attempts += 1;
        return {
          project: {
            ...project,
            equilibriumResult: candidateEquilibrium,
            researchSession: {
              ...project.researchSession,
              phase: "equilibrium",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus: "solved",
                nextActions: ["review candidate"],
                pendingDecision: {
                  kind: "analyze_properties",
                  prompt: "candidate generated",
                },
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "candidate generated",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const artifacts = result.project.researchSession?.mathArtifacts ?? [];

  assert.equal(attempts, 1);
  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, true);
  assert.equal(patch?.kind, "model");
  assert.equal(
    patch?.changes.some((change) => change.path === "modelSetupDraft"),
    true
  );
  assert.equal(
    result.project.researchSession?.assetPatches?.some(
      (item) => item.kind === "equilibrium" && item.status === "proposed"
    ),
    false
  );
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.stepId === "review-equilibrium" &&
        event.metadata?.kernelDecision?.action === "repair_model"
    ),
    true
  );
  assert.ok(
    artifacts.some((artifact) => artifact.kind === "compiled_game_system")
  );
  assert.equal(
    artifacts.every((artifact) => artifact.patchId === patch?.id),
    true
  );
});

test("equilibrium solving agent resumes a failed run with the same run id", async () => {
  const baseProject = createConfirmedProject();
  const failedRun = updateStepStatus(
    updateStepStatus(
      createAgentRun({
        id: "agent-equilibrium-resume",
        goal: baseProject.rawIdea,
        now: 1710000000000,
        plan: [
          {
            id: "prepare-equilibrium",
            kind: "reflection",
            title: "Prepare equilibrium target",
            status: "completed",
          },
          {
            id: "draft-equilibrium",
            kind: "tool",
            toolName: "research.solveEquilibrium",
            title: "Draft symbolic equilibrium candidate",
            status: "running",
          },
          {
            id: "review-equilibrium",
            kind: "reflection",
            title: "Review equilibrium derivation quality",
            status: "pending",
          },
          {
            id: "propose-equilibrium-patch",
            kind: "approval",
            toolName: "asset.proposePatch",
            title: "Propose reviewable equilibrium patch",
            status: "pending",
          },
        ],
      }),
      "draft-equilibrium",
      "running",
      1710000000100
    ),
    "draft-equilibrium",
    "failed",
    1710000000200
  );
  const project = appendAgentRunToProject(baseProject, failedRun);
  const candidateEquilibrium = {
    status: "solved",
    concept: "恢复后的均衡",
    solvingSteps: ["重试生成闭式解", "联立求解"],
    focs: ["\\partial \\Pi_A / \\partial \\tau_A = 0"],
    conditions: ["q > 0"],
    closedForm: "\\tau_A^* = 2",
    derivation: "恢复后重新生成推导。",
    code: "solve_again()",
    warnings: [],
  };

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
      resume: {
        runId: "agent-equilibrium-resume",
        checkpointId: failedRun.checkpoints?.at(-1)?.id,
      },
    },
    {
      now: 1710000000300,
      solveEquilibrium: async () => ({
        project: {
          ...project,
          equilibriumResult: candidateEquilibrium,
          researchSession: {
            ...project.researchSession,
            phase: "equilibrium",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus: "solved",
              nextActions: ["检查符号均衡推导", "生成性质分析"],
              pendingDecision: {
                kind: "analyze_properties",
                prompt: "符号均衡结果已经生成。",
              },
            },
            messages: project.researchSession?.messages ?? [],
          },
        },
        usedFallback: false,
        assistantMessage: "恢复后生成均衡。",
      }),
    }
  );

  assert.equal(result.agentRun.id, "agent-equilibrium-resume");
  assert.equal(result.project.researchSession?.agentRun?.id, "agent-equilibrium-resume");
  assert.equal(
    result.project.researchSession?.agentRunHistory?.filter(
      (run) => run.id === "agent-equilibrium-resume"
    ).length,
    1
  );
  assert.equal(result.agentRun.status, "paused");
  assert.equal(
    result.agentRun.trace.some(
      (event) => event.type === "fallback" && /恢复/.test(event.message)
    ),
    true
  );
  assert.equal(
    result.agentRun.checkpoints?.some(
      (checkpoint) =>
        checkpoint.stepId === "draft-equilibrium" &&
        checkpoint.status === "running" &&
        checkpoint.metadata?.resumedFromCheckpointId
    ),
    true
  );
  assert.equal(
    result.agentRun.checkpoints?.some(
      (checkpoint) =>
        checkpoint.stepId === "prepare-equilibrium" &&
        checkpoint.status === "running" &&
        checkpoint.createdAt === 1710000000300
    ),
    false
  );
});

test("equilibrium solving agent retries once when a solved candidate has repairable risks", async () => {
  const project = createConfirmedProject();
  const riskyEquilibrium = {
    status: "solved",
    concept: "未校验符号均衡",
    solvingSteps: ["对 p_A 求一阶条件", "联立求解"],
    focs: ["partial Pi_A / partial p_A = 0"],
    conditions: ["q > 0"],
    closedForm: "p_A^* = beta_X / q",
    derivation: "由 FOC 得到 p_A^*。",
    code: "sp.solve([foc_p_A], [p_A])",
    warnings: [],
  };
  const repairedEquilibrium = {
    status: "solved",
    concept: "修复后的双边平台内点均衡",
    solvingSteps: ["写出利润函数", "对佣金求一阶条件", "联立求解闭式解"],
    focs: ["\\partial \\Pi_A / \\partial \\tau_A = 0"],
    conditions: ["q > 0", "t_B > \\alpha_B"],
    closedForm:
      "\\tau_A^* = \\frac{t_B - \\alpha_B}{2q}; \\tau_B^* = \\frac{t_B - \\alpha_B}{2q}; s_A^* = \\frac{\\alpha_B}{2}; s_B^* = \\frac{\\alpha_B}{2}",
    derivation: "由一阶条件联立即得。",
    code: "import sympy as sp\nsp.solve([foc_tau_A], [tau_A])",
    warnings: [],
  };
  let attempts = 0;

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-repair-test",
      now: 1710000000000,
      solveEquilibrium: async (request) => {
        attempts += 1;
        assert.equal(
          attempts === 1 || /自检发现/.test(request.userMessage ?? ""),
          true
        );
        const equilibrium =
          attempts === 1
            ? riskyEquilibrium
            : withOptimalityEvidence(repairedEquilibrium);
        return {
          project: {
            ...project,
            equilibriumResult: equilibrium,
            researchSession: {
              ...project.researchSession,
              phase: "equilibrium",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus: equilibrium.status,
                nextActions: ["检查符号均衡推导", "生成性质分析"],
                pendingDecision: {
                  kind: "analyze_properties",
                  prompt: "符号均衡结果已经生成。",
                },
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "均衡候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const equilibriumChange = patch?.changes.find(
    (change) => change.path === "equilibriumResult"
  );
  const artifacts = result.project.researchSession?.mathArtifacts ?? [];

  assert.equal(attempts, 2);
  assert.deepEqual(
    equilibriumChange?.value,
    withOptimalityEvidence(repairedEquilibrium)
  );
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.stepId === "review-equilibrium" &&
        event.type === "fallback" &&
        event.metadata?.repairAttempted === true
    ),
    true
  );
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.stepId === "review-equilibrium" &&
        event.type === "tool_result" &&
        event.metadata?.repaired === true
    ),
    true
  );
  assert.equal(
    artifacts.some(
      (artifact) =>
        artifact.id.includes(`${result.agentRun.id}-review-equilibrium`) &&
        !artifact.id.includes(`${result.agentRun.id}-repair-review-equilibrium`)
    ),
    true
  );
  assert.equal(
    artifacts.some((artifact) =>
      artifact.id.includes(`${result.agentRun.id}-repair-review-equilibrium`)
    ),
    true
  );
});

test("equilibrium solving agent does not retry or propose a patch for a non-solved draft", async () => {
  const project = createConfirmedProject();
  const unresolvedEquilibrium = {
    status: "symbolic_failure",
    concept: "implicit system only",
    solvingSteps: ["Write first-order conditions"],
    focs: [],
    conditions: [],
    closedForm: "",
    derivation: "No closed-form equilibrium was obtained.",
    code: "",
    warnings: ["not solved"],
  };
  let attempts = 0;

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-unsolved-repair-test",
      now: 1710000000000,
      solveEquilibrium: async () => {
        attempts += 1;
        return {
          project: {
            ...project,
            equilibriumResult: unresolvedEquilibrium,
            researchSession: {
              ...project.researchSession,
              phase: "equilibrium",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus: "symbolic_failure",
                nextActions: ["review implicit system"],
                pendingDecision: {
                  kind: "solve_equilibrium",
                  prompt: "no closed form",
                },
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "implicit system only",
        };
      },
    }
  );

  const patches = result.project.researchSession?.assetPatches ?? [];

  assert.equal(attempts, 1);
  assert.equal(
    patches.some((patch) => patch.kind === "equilibrium" && patch.status === "proposed"),
    false
  );
  assert.equal(patches.length, 0);
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
  assert.equal(result.agentRun.requiresApproval, false);
  assert.match(result.assistantMessage, /草稿|没有创建正式均衡 patch|不会进入性质分析/);
});

test("equilibrium solving agent switches to model repair when bounded repair loses model inputs", async () => {
  const baseProject = createConfirmedProject();
  const explicitModel = createExplicitProfitModel();
  const project = {
    ...baseProject,
    hotellingModel: {
      ...explicitModel,
      platforms: ["A", "B"],
      profitFunctions: [
        ...explicitModel.profitFunctions,
        {
          id: "profit-b",
          platform: "B",
          expression: "alpha_B*tau_A - tau_A^2",
          notes: "Second platform profit makes variable matching explicit.",
        },
      ],
    },
  };
  const riskyEquilibrium = {
    status: "solved",
    concept: "wrong closed form",
    solvingSteps: ["Write platform profit.", "Take FOC.", "Solve FOC."],
    focs: ["2*tau_A - alpha_B = 0"],
    conditions: ["alpha_B > 0"],
    closedForm: "tau_A^* = alpha_B/3",
    derivation: "Wrong candidate.",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  };
  const repairedButUngrounded = {
    status: "solved",
    concept: "ungrounded repaired candidate",
    solvingSteps: ["Write FOC.", "Solve FOC."],
    focs: ["2*s - 1 = 0"],
    conditions: ["s > 0"],
    closedForm: "s^* = 1/2",
    derivation: "Uses a variable outside the confirmed model.",
    code: "sp.solve([2*s-1], [s])",
    warnings: [],
  };
  let attempts = 0;

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-repair-to-model-test",
      now: 1710000000000,
      solveEquilibrium: async () => {
        attempts += 1;
        const equilibrium =
          attempts === 1 ? riskyEquilibrium : repairedButUngrounded;
        return {
          project: {
            ...project,
            equilibriumResult: equilibrium,
            researchSession: {
              ...project.researchSession,
              phase: "equilibrium",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus: equilibrium.status,
                nextActions: ["Review equilibrium"],
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "candidate",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];

  assert.equal(attempts, 2);
  assert.equal(patch?.kind, "model");
  assert.equal(
    patch?.changes.some((change) => change.path === "modelSetupDraft"),
    true
  );
  assert.notDeepEqual(result.project.equilibriumResult, repairedButUngrounded);
});

test("equilibrium solving agent repairs candidates with ungrounded math symbols", async () => {
  const project = createConfirmedProject();
  const riskyEquilibrium = {
    status: "solved",
    concept: "未校验符号均衡",
    solvingSteps: ["对 p_A 求一阶条件", "联立求解"],
    focs: ["partial Pi_A / partial p_A = 0"],
    conditions: ["q > 0"],
    closedForm: "p_A^* = beta_X / q",
    derivation: "由 FOC 得到 p_A^*。",
    code: "sp.solve([foc_p_A], [p_A])",
    warnings: [],
  };
  const repairedEquilibrium = {
    status: "solved",
    concept: "修复后的符号均衡",
    solvingSteps: ["对 tau_A 求一阶条件", "联立求解"],
    focs: ["partial Pi_A / partial tau_A = 0"],
    conditions: ["q > 0"],
    closedForm:
      "tau_A^* = alpha_B / q; tau_B^* = alpha_B / q; s_A^* = 0; s_B^* = 0",
    derivation: "由 FOC 得到 tau_A^*。",
    code: "sp.solve([foc_tau_A], [tau_A])",
    warnings: [],
  };
  let attempts = 0;

  const result = await runEquilibriumSolvingAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "equilibrium-agent-math-repair-test",
      now: 1710000000000,
      solveEquilibrium: async () => {
        attempts += 1;
        const equilibrium =
          attempts === 1
            ? riskyEquilibrium
            : withOptimalityEvidence(repairedEquilibrium);
        return {
          project: {
            ...project,
            equilibriumResult: equilibrium,
            researchSession: {
              ...project.researchSession,
              phase: "equilibrium",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus: equilibrium.status,
                nextActions: ["检查符号均衡推导", "生成性质分析"],
                pendingDecision: {
                  kind: "analyze_properties",
                  prompt: "符号均衡结果已经生成。",
                },
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "均衡候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const equilibriumChange = patch?.changes.find(
    (change) => change.path === "equilibriumResult"
  );

  assert.equal(attempts, 2);
  assert.deepEqual(
    equilibriumChange?.value,
    withOptimalityEvidence(repairedEquilibrium)
  );
  assert.equal(
    result.agentRun.trace.some((event) =>
      String(event.metadata?.issues ?? "").includes("未定义的符号")
    ),
    true
  );
});

test(
  "equilibrium solving agent repairs candidates whose closed form fails SymPy FOC residual checks",
  { skip: !hasLocalSympy },
  async () => {
    const baseProject = createConfirmedProject();
    const project = {
      ...baseProject,
      hotellingModel: createExplicitProfitModel(),
    };
    const riskyEquilibrium = {
      status: "solved",
      concept: "错误闭式解",
      solvingSteps: ["写出 FOC", "联立求解"],
      focs: ["2*tau_A - alpha_B = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/3",
      derivation: "候选闭式解没有满足 FOC。",
      code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
      warnings: [],
    };
    const repairedEquilibrium = {
      ...riskyEquilibrium,
      concept: "修复后的闭式解",
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "将闭式解代回 FOC 后残差为 0。",
    };
    const promotedRepairedEquilibrium =
      withOptimalityEvidence(repairedEquilibrium);
    let attempts = 0;

    const result = await runEquilibriumSolvingAgent(
      {
        rawIdea: project.rawIdea,
        project,
      },
      {
        id: "equilibrium-agent-sympy-residual-repair-test",
        now: 1710000000000,
        solveEquilibrium: async () => {
          attempts += 1;
          const equilibrium =
            attempts === 1 ? riskyEquilibrium : promotedRepairedEquilibrium;
          return {
            project: {
              ...project,
              equilibriumResult: equilibrium,
              researchSession: {
                ...project.researchSession,
                phase: "equilibrium",
                assetSummary: {
                  ...project.researchSession?.assetSummary,
                  confirmedAssumptions:
                    project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                  utilityFunctions:
                    project.researchSession?.assetSummary.utilityFunctions ?? [],
                  equilibriumStatus: equilibrium.status,
                  nextActions: ["检查符号均衡推导", "生成性质分析"],
                  pendingDecision: {
                    kind: "analyze_properties",
                    prompt: "符号均衡结果已经生成。",
                  },
                },
                messages: project.researchSession?.messages ?? [],
              },
            },
            usedFallback: false,
            assistantMessage: "均衡候选。",
          };
        },
      }
    );

    const patch = result.project.researchSession?.assetPatches?.[0];
    const equilibriumChange = patch?.changes.find(
      (change) => change.path === "equilibriumResult"
    );

    assert.equal(attempts, 2);
    assert.deepEqual(equilibriumChange?.value, promotedRepairedEquilibrium);
    assert.equal(
      result.agentRun.trace.some((event) =>
        String(event.metadata?.issues ?? "").includes("SymPy")
      ),
      true
    );
  }
);

test(
  "equilibrium solving agent repairs candidates using FOCs generated from model profits",
  { skip: !hasLocalSympy },
  async () => {
    const baseProject = createConfirmedProject();
    const project = {
      ...baseProject,
      hotellingModel: createExplicitProfitModel(),
    };
    const riskyEquilibrium = {
      status: "solved",
      concept: "利润函数下的错误闭式解",
      solvingSteps: ["写出利润函数", "对佣金求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/3",
      derivation: "候选闭式解没有满足从利润函数生成的 FOC。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    };
    const repairedEquilibrium = {
      ...riskyEquilibrium,
      concept: "由利润函数复核后的闭式解",
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "系统从利润函数生成 FOC 后，候选解满足该 FOC。",
    };
    const promotedRepairedEquilibrium =
      withOptimalityEvidence(repairedEquilibrium);
    let attempts = 0;

    const result = await runEquilibriumSolvingAgent(
      {
        rawIdea: project.rawIdea,
        project,
      },
      {
        id: "equilibrium-agent-generated-foc-repair-test",
        now: 1710000000000,
        solveEquilibrium: async () => {
          attempts += 1;
          const equilibrium =
            attempts === 1 ? riskyEquilibrium : promotedRepairedEquilibrium;
          return {
            project: {
              ...project,
              equilibriumResult: equilibrium,
              researchSession: {
                ...project.researchSession,
                phase: "equilibrium",
                assetSummary: {
                  ...project.researchSession?.assetSummary,
                  confirmedAssumptions:
                    project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                  utilityFunctions:
                    project.researchSession?.assetSummary.utilityFunctions ?? [],
                  equilibriumStatus: equilibrium.status,
                  nextActions: ["检查符号均衡推导", "生成性质分析"],
                  pendingDecision: {
                    kind: "analyze_properties",
                    prompt: "符号均衡结果已经生成。",
                  },
                },
                messages: project.researchSession?.messages ?? [],
              },
            },
            usedFallback: false,
            assistantMessage: "均衡候选。",
          };
        },
      }
    );

    const patch = result.project.researchSession?.assetPatches?.[0];
    const equilibriumChange = patch?.changes.find(
      (change) => change.path === "equilibriumResult"
    );

    assert.equal(attempts, 2);
    assert.deepEqual(equilibriumChange?.value, promotedRepairedEquilibrium);
    assert.equal(
      result.agentRun.trace.some((event) =>
        String(event.metadata?.issues ?? "").includes("模型利润函数")
      ),
      true
    );
  }
);

test(
  "equilibrium solving agent includes SymPy generated FOC diagnostics in patch notes",
  { skip: !hasLocalSympy },
  async () => {
    const baseProject = createConfirmedProject();
    const project = {
      ...baseProject,
      hotellingModel: createExplicitProfitModel(),
    };
    const candidateEquilibrium = withOptimalityEvidence({
      status: "solved",
      concept: "由利润函数复核的闭式解",
      solvingSteps: ["写出利润函数", "对佣金求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "候选闭式解满足从利润函数生成的 FOC。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    });

    const result = await runEquilibriumSolvingAgent(
      {
        rawIdea: project.rawIdea,
        project,
      },
      {
        id: "equilibrium-agent-generated-foc-note-test",
        now: 1710000000000,
        solveEquilibrium: async () => ({
          project: {
            ...project,
            equilibriumResult: candidateEquilibrium,
            researchSession: {
              ...project.researchSession,
              phase: "equilibrium",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus: candidateEquilibrium.status,
                nextActions: ["检查符号均衡推导", "生成性质分析"],
                pendingDecision: {
                  kind: "analyze_properties",
                  prompt: "符号均衡结果已经生成。",
                },
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "均衡候选。",
        }),
      }
    );

    const patch = result.project.researchSession?.assetPatches?.[0];
    const equilibriumChange = patch?.changes.find(
      (change) => change.path === "equilibriumResult"
    );

    assert.match(equilibriumChange?.note ?? "", /SymPy 复核记录/);
    assert.match(equilibriumChange?.note ?? "", /模型利润函数生成 FOC/);
    assert.match(equilibriumChange?.note ?? "", /alpha_B - 2\*tau_A/);
  }
);

test(
  "equilibrium solving agent persists SymPy review checks on the research session",
  { skip: !hasLocalSympy },
  async () => {
    const baseProject = createConfirmedProject();
    const project = {
      ...baseProject,
      hotellingModel: createExplicitProfitModel(),
    };
    const candidateEquilibrium = withOptimalityEvidence({
      status: "solved",
      concept: "由利润函数复核的闭式解",
      solvingSteps: ["写出利润函数", "对佣金求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "候选闭式解满足从利润函数生成的 FOC。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    });

    const result = await runEquilibriumSolvingAgent(
      {
        rawIdea: project.rawIdea,
        project,
      },
      {
        id: "equilibrium-agent-persist-sympy-checks-test",
        now: 1710000000000,
        solveEquilibrium: async () => ({
          project: {
            ...project,
            equilibriumResult: candidateEquilibrium,
            researchSession: {
              ...project.researchSession,
              phase: "equilibrium",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus: candidateEquilibrium.status,
                nextActions: ["检查符号均衡推导", "生成性质分析"],
                pendingDecision: {
                  kind: "analyze_properties",
                  prompt: "符号均衡结果已经生成。",
                },
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "均衡候选。",
        }),
      }
    );

    const persistedChecks =
      result.project.researchSession?.mathVerificationChecks ?? [];

    assert.ok(
      persistedChecks.some(
        (check) =>
          check.kind === "sympy_execution" &&
          /模型利润函数生成 FOC/.test(check.message)
      )
    );
    assert.ok(
      persistedChecks.some((check) => /alpha_B - 2\*tau_A/.test(check.message))
    );
  }
);
