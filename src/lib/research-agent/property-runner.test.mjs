import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { runPropertyAnalysisAgent } from "./property-runner.ts";
import { applyResearchAssetPatchToProject } from "../research-asset-patch-apply.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generateSymbolicEquilibrium,
} from "../research-session.ts";

const hasLocalSympy =
  spawnSync("python", ["-c", "import sympy"], {
    encoding: "utf8",
  }).status === 0;

function createSolvedProject() {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });

  return generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    )
  );
}

function createCandidateAnalyses() {
  return [
    {
      id: "buyer-network-commission",
      target: "\\tau_A^*",
      parameter: "\\alpha_B",
      operation: "differentiate",
      symbolicResult:
        "\\partial \\tau_A^* / \\partial \\alpha_B = -2/q",
      signCondition: "q>0 时为负",
      propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
      proofSketch: "对闭式均衡佣金关于 \\alpha_B 求偏导。",
      intuition: "买方网络效应越强，平台越愿意通过降低佣金扩大卖方参与。",
      warnings: [],
    },
    {
      id: "seller-cost-subsidy",
      target: "s_A^*",
      parameter: "t_S",
      operation: "differentiate",
      symbolicResult: "\\partial s_A^* / \\partial t_S > 0",
      signCondition: "内部解且 q>0",
      propositionDraft: "命题：卖方侧差异化成本提高会抬高买方补贴。",
      proofSketch: "对补贴闭式解关于 t_S 求偏导并整理符号。",
      intuition: "卖方侧更难吸引时，平台转向补贴买方以维持成交规模。",
      warnings: [],
    },
    {
      id: "threshold-entry",
      target: "n_A^B",
      parameter: "\\tau_A",
      operation: "threshold",
      symbolicResult: "n_A^B>0 \\Leftrightarrow \\tau_A < \\bar\\tau",
      signCondition: "\\bar\\tau>0",
      propositionDraft: "命题：佣金存在保持买方参与的上界。",
      proofSketch: "由需求份额非负约束解出佣金阈值。",
      intuition: "过高佣金会压缩卖方参与并间接削弱买方侧价值。",
      warnings: [],
    },
  ];
}

test("property analysis agent stops before drafting without an applied solved equilibrium", async () => {
  const project = confirmResearchModel(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "test property guard",
        now: 1710000000000,
      }),
      "secondhand-commission-subsidy-hotelling"
    )
  );
  let attempts = 0;

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "property-agent-equilibrium-guard-test",
      now: 1710000000000,
      analyzeProperties: async () => {
        attempts += 1;
        return {
          project,
          usedFallback: false,
          assistantMessage: "should not draft properties",
        };
      },
    }
  );

  assert.equal(attempts, 0);
  assert.equal(result.agentRun.status, "failed");
  assert.equal(
    Boolean(
      result.project.researchSession?.assetPatches?.some(
        (patch) => patch.kind === "properties" && patch.status === "proposed"
      )
    ),
    false
  );
});

test("property analysis agent proposes a reviewable properties patch with trace", async () => {
  const project = createSolvedProject();
  const candidateAnalyses = createCandidateAnalyses();

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "property-agent-test",
      now: 1710000000000,
      analyzeProperties: async () => ({
        project: {
          ...project,
          propertyAnalyses: candidateAnalyses,
          researchSession: {
            ...project.researchSession,
            phase: "analysis",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus:
                project.researchSession?.assetSummary.equilibriumStatus ??
                "solved",
              nextActions: ["检查命题条件", "整理论文草稿"],
              pendingDecision: undefined,
            },
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-provider-properties",
                role: "assistant",
                content: "我给出一组比较静态和命题草稿。",
                createdAt: 0,
              },
            ],
          },
        },
        usedFallback: false,
        assistantMessage: "我给出一组比较静态和命题草稿。",
      }),
    }
  );

  const session = result.project.researchSession;
  const patch = session?.assetPatches?.[0];

  assert.equal(result.usedFallback, false);
  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, true);
  assert.equal(session?.agentRun?.status, "paused");
  assert.equal(session?.phase, "analysis");
  assert.equal(session?.assetSummary.pendingDecision?.kind, "analyze_properties");
  assert.match(
    session?.assetSummary.pendingDecision?.prompt ?? "",
    /审阅并应用性质分析修改建议/
  );
  assert.equal(patch?.kind, "properties");
  assert.equal(patch?.status, "proposed");
  assert.equal(
    patch?.changes.some((change) => change.path === "propertyAnalyses"),
    true
  );
  assert.equal(
    result.agentRun.trace.some((event) => event.type === "tool_result"),
    true
  );
});

test("property analysis agent repairs candidates with contradictory derivative sign conditions", async () => {
  const project = createSolvedProject();
  const projectWithSimpleClosedForm = {
    ...project,
    equilibriumResult: {
      ...project.equilibriumResult,
      closedForm: "tau_A^* = -2 * alpha_B / q",
    },
  };
  const riskyAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 0
      ? {
          ...analysis,
          id: "wrong-sign-condition",
          target: "tau_A^*",
          parameter: "alpha_B",
          symbolicResult: "partial tau_A^* / partial alpha_B = -2/q",
          signCondition: "q>0 时为正",
          propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
          proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        }
      : analysis
  );
  const repairedAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 0
      ? {
          ...analysis,
          target: "tau_A^*",
          parameter: "alpha_B",
          symbolicResult: "partial tau_A^* / partial alpha_B = -2/q",
          signCondition: "q>0 时为负",
          propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
          proofSketch: "由 tau_A^* = -2alpha_B/q 直接求偏导。",
        }
      : analysis
  );
  let attempts = 0;

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: projectWithSimpleClosedForm.rawIdea,
      project: projectWithSimpleClosedForm,
    },
    {
      id: "property-agent-sign-repair-test",
      now: 1710000000000,
      analyzeProperties: async () => {
        attempts += 1;
        const analyses = attempts === 1 ? riskyAnalyses : repairedAnalyses;
        return {
          project: {
            ...projectWithSimpleClosedForm,
            propertyAnalyses: analyses,
            researchSession: {
              ...projectWithSimpleClosedForm.researchSession,
              phase: "analysis",
              assetSummary: {
                ...projectWithSimpleClosedForm.researchSession?.assetSummary,
                confirmedAssumptions:
                  projectWithSimpleClosedForm.researchSession?.assetSummary
                    .confirmedAssumptions ?? [],
                utilityFunctions:
                  projectWithSimpleClosedForm.researchSession?.assetSummary
                    .utilityFunctions ?? [],
                equilibriumStatus: "solved",
                nextActions: ["检查命题条件", "整理论文草稿"],
                pendingDecision: undefined,
              },
              messages: projectWithSimpleClosedForm.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "性质分析候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const propertyChange = patch?.changes.find(
    (change) => change.path === "propertyAnalyses"
  );

  assert.equal(attempts, 2);
  assert.deepEqual(propertyChange?.value, repairedAnalyses);
  assert.equal(
    result.agentRun.trace.some((event) =>
      String(event.metadata?.issues ?? "").includes("符号条件")
    ),
    true
  );
});

test("property analysis agent repairs candidates with underspecified derivative sign conditions", async () => {
  const project = createSolvedProject();
  const modelWithoutQSign = {
    ...project.hotellingModel,
    symbols: (project.hotellingModel?.symbols ?? []).map((symbol) =>
      symbol.symbol === "q" ? { ...symbol, assumption: "unrestricted" } : symbol
    ),
    assumptions: [],
  };
  const projectWithWeakConditions = {
    ...project,
    hotellingModel: modelWithoutQSign,
    equilibriumResult: {
      ...project.equilibriumResult,
      conditions: [],
      closedForm: "tau_A^* = -2 * alpha_B / q",
    },
  };
  const riskyAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 0
      ? {
          ...analysis,
          id: "weak-sign-condition",
          target: "tau_A^*",
          parameter: "alpha_B",
          symbolicResult: "partial tau_A^* / partial alpha_B = -2/q",
          signCondition: "为负",
          propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
          proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        }
      : analysis
  );
  const repairedAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 0
      ? {
          ...analysis,
          target: "tau_A^*",
          parameter: "alpha_B",
          symbolicResult: "partial tau_A^* / partial alpha_B = -2/q",
          signCondition: "q>0 时为负",
          propositionDraft: "命题：当 q>0 时，买方网络效应增强会降低均衡佣金。",
          proofSketch: "由 tau_A^* = -2alpha_B/q 直接求偏导，并在 q>0 下判断符号。",
        }
      : analysis
  );
  let attempts = 0;

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: projectWithWeakConditions.rawIdea,
      project: projectWithWeakConditions,
    },
    {
      id: "property-agent-weak-condition-repair-test",
      now: 1710000000000,
      analyzeProperties: async () => {
        attempts += 1;
        const analyses = attempts === 1 ? riskyAnalyses : repairedAnalyses;
        return {
          project: {
            ...projectWithWeakConditions,
            propertyAnalyses: analyses,
            researchSession: {
              ...projectWithWeakConditions.researchSession,
              phase: "analysis",
              assetSummary: {
                ...projectWithWeakConditions.researchSession?.assetSummary,
                confirmedAssumptions:
                  projectWithWeakConditions.researchSession?.assetSummary
                    .confirmedAssumptions ?? [],
                utilityFunctions:
                  projectWithWeakConditions.researchSession?.assetSummary
                    .utilityFunctions ?? [],
                equilibriumStatus: "solved",
                nextActions: ["检查命题条件", "整理论文草稿"],
                pendingDecision: undefined,
              },
              messages: projectWithWeakConditions.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "性质分析候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const propertyChange = patch?.changes.find(
    (change) => change.path === "propertyAnalyses"
  );

  assert.equal(attempts, 2);
  assert.deepEqual(propertyChange?.value, repairedAnalyses);
  assert.equal(
    result.agentRun.trace.some((event) =>
      String(event.metadata?.issues ?? "").includes("条件不足")
    ),
    true
  );
});

test("property analysis agent repairs duplicate analyses with conflicting directions", async () => {
  const project = createSolvedProject();
  const conflictingAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 1
      ? {
          ...analysis,
          id: "buyer-network-commission-opposite",
          target: "tau_A^*",
          parameter: "alpha_B",
          operation: "differentiate",
          symbolicResult: "partial tau_A^* / partial alpha_B = 2/q",
          signCondition: "q>0 时为正",
          propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
          proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        }
      : analysis
  );
  const repairedAnalyses = createCandidateAnalyses();
  let attempts = 0;

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "property-agent-duplicate-conflict-repair-test",
      now: 1710000000000,
      analyzeProperties: async () => {
        attempts += 1;
        const analyses = attempts === 1 ? conflictingAnalyses : repairedAnalyses;
        return {
          project: {
            ...project,
            propertyAnalyses: analyses,
            researchSession: {
              ...project.researchSession,
              phase: "analysis",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus:
                  project.researchSession?.assetSummary.equilibriumStatus ??
                  "solved",
                nextActions: ["检查命题条件", "整理论文草稿"],
                pendingDecision: undefined,
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "性质分析候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const propertyChange = patch?.changes.find(
    (change) => change.path === "propertyAnalyses"
  );

  assert.equal(attempts, 2);
  assert.deepEqual(propertyChange?.value, repairedAnalyses);
  assert.equal(
    result.agentRun.trace.some((event) =>
      String(event.metadata?.issues ?? "").includes("互相冲突")
    ),
    true
  );
});

test("property analysis agent repairs repeated property topics even without opposite signs", async () => {
  const project = createSolvedProject();
  const repeatedAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 1
      ? {
          ...analysis,
          id: "buyer-network-commission-repeat",
          target: "tau_A^*",
          parameter: "alpha_B",
          operation: "differentiate",
          symbolicResult: "partial tau_A^* / partial alpha_B = -2/q",
          signCondition: "q>0 时为负",
          propositionDraft: "命题：买方网络效应增强会压低均衡佣金。",
          proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        }
      : analysis
  );
  const repairedAnalyses = createCandidateAnalyses();
  let attempts = 0;

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "property-agent-duplicate-topic-repair-test",
      now: 1710000000000,
      analyzeProperties: async () => {
        attempts += 1;
        const analyses = attempts === 1 ? repeatedAnalyses : repairedAnalyses;
        return {
          project: {
            ...project,
            propertyAnalyses: analyses,
            researchSession: {
              ...project.researchSession,
              phase: "analysis",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus:
                  project.researchSession?.assetSummary.equilibriumStatus ??
                  "solved",
                nextActions: ["检查命题条件", "整理论文草稿"],
                pendingDecision: undefined,
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "性质分析候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const propertyChange = patch?.changes.find(
    (change) => change.path === "propertyAnalyses"
  );

  assert.equal(attempts, 2);
  assert.deepEqual(propertyChange?.value, repairedAnalyses);
  assert.equal(
    result.agentRun.trace.some((event) =>
      String(event.metadata?.issues ?? "").includes("重复主题")
    ),
    true
  );
});

test("property analysis agent keeps candidate analyses pending until applied", async () => {
  const project = createSolvedProject();
  const candidateAnalyses = createCandidateAnalyses();
  const providerDraftMessage =
    "FULL_PROPERTY_PROVIDER_DRAFT_SHOULD_STAY_OUT_OF_CHAT";

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "property-agent-pending-test",
      now: 1710000000000,
      analyzeProperties: async () => ({
        project: {
          ...project,
          propertyAnalyses: candidateAnalyses,
          researchSession: {
            ...project.researchSession,
            phase: "analysis",
            assetSummary: {
              ...project.researchSession?.assetSummary,
              confirmedAssumptions:
                project.researchSession?.assetSummary.confirmedAssumptions ?? [],
              utilityFunctions:
                project.researchSession?.assetSummary.utilityFunctions ?? [],
              equilibriumStatus:
                project.researchSession?.assetSummary.equilibriumStatus ??
                "solved",
              nextActions: ["检查命题条件"],
              pendingDecision: undefined,
            },
            messages: [
              ...(project.researchSession?.messages ?? []),
              {
                id: "msg-provider-properties",
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
    (change) => change.path === "propertyAnalyses"
  );

  assert.equal(result.project.propertyAnalyses?.length ?? 0, 0);
  assert.equal(rootChange?.value, candidateAnalyses);
  assert.equal(
    result.project.researchSession?.messages.some((message) =>
      message.content.includes(providerDraftMessage)
    ),
    false
  );

  const applied = applyResearchAssetPatchToProject(result.project, patch, {
    now: 1710000000001,
  });

  assert.equal(applied.propertyAnalyses?.length, 3);
  assert.equal(applied.propertyAnalyses?.[0].id, "buyer-network-commission");
  assert.equal(applied.researchSession?.assetPatches?.[0].status, "applied");
  assert.equal(
    applied.researchSession?.assetSummary.pendingDecision?.kind,
    "draft_paper"
  );
});

test("property analysis agent retries once when self-review finds repairable risks", async () => {
  const project = createSolvedProject();
  const riskyAnalyses = [
    {
      id: "thin-analysis",
      target: "\\tau_A^*",
      parameter: "\\alpha_B",
      operation: "differentiate",
      symbolicResult: "\\partial \\tau_A^*/\\partial \\alpha_B = -2/q",
      signCondition: "q>0 时为负",
      propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
      proofSketch: "对闭式均衡佣金求偏导。",
      intuition: "网络效应改变平台补贴和收费权衡。",
      warnings: [],
    },
  ];
  const repairedAnalyses = createCandidateAnalyses();
  let attempts = 0;

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "property-agent-repair-test",
      now: 1710000000000,
      analyzeProperties: async (request) => {
        attempts += 1;
        assert.equal(
          attempts === 1 || /自检发现/.test(request.userMessage ?? ""),
          true
        );
        const analyses = attempts === 1 ? riskyAnalyses : repairedAnalyses;
        return {
          project: {
            ...project,
            propertyAnalyses: analyses,
            researchSession: {
              ...project.researchSession,
              phase: "analysis",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus:
                  project.researchSession?.assetSummary.equilibriumStatus ??
                  "solved",
                nextActions: ["检查命题条件", "整理论文草稿"],
                pendingDecision: undefined,
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "性质分析候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const propertyChange = patch?.changes.find(
    (change) => change.path === "propertyAnalyses"
  );

  assert.equal(attempts, 2);
  assert.deepEqual(propertyChange?.value, repairedAnalyses);
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.stepId === "review-properties" &&
        event.type === "fallback" &&
        event.metadata?.repairAttempted === true
    ),
    true
  );
  assert.equal(
    result.agentRun.trace.some(
      (event) =>
        event.stepId === "review-properties" &&
        event.type === "tool_result" &&
        event.metadata?.repaired === true
    ),
    true
  );
});

test("property analysis agent repairs candidates with ungrounded math symbols", async () => {
  const project = createSolvedProject();
  const riskyAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 0
      ? {
          ...analysis,
          id: "unknown-price-effect",
          target: "p_A^*",
          parameter: "beta_X",
          symbolicResult: "partial p_A^* / partial beta_X = 1/q",
          proofSketch: "对 p_A^* 关于 beta_X 求偏导。",
        }
      : analysis
  );
  const repairedAnalyses = createCandidateAnalyses();
  let attempts = 0;

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "property-agent-math-repair-test",
      now: 1710000000000,
      analyzeProperties: async () => {
        attempts += 1;
        const analyses = attempts === 1 ? riskyAnalyses : repairedAnalyses;
        return {
          project: {
            ...project,
            propertyAnalyses: analyses,
            researchSession: {
              ...project.researchSession,
              phase: "analysis",
              assetSummary: {
                ...project.researchSession?.assetSummary,
                confirmedAssumptions:
                  project.researchSession?.assetSummary.confirmedAssumptions ?? [],
                utilityFunctions:
                  project.researchSession?.assetSummary.utilityFunctions ?? [],
                equilibriumStatus:
                  project.researchSession?.assetSummary.equilibriumStatus ??
                  "solved",
                nextActions: ["检查命题条件", "整理论文草稿"],
                pendingDecision: undefined,
              },
              messages: project.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "性质分析候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const propertyChange = patch?.changes.find(
    (change) => change.path === "propertyAnalyses"
  );

  assert.equal(attempts, 2);
  assert.deepEqual(propertyChange?.value, repairedAnalyses);
  assert.equal(
    result.agentRun.trace.some((event) =>
      String(event.metadata?.issues ?? "").includes("未出现的符号")
    ),
    true
  );
});

test("property analysis agent repairs candidates with inconsistent derivative results", async () => {
  const project = createSolvedProject();
  const projectWithSimpleClosedForm = {
    ...project,
    equilibriumResult: {
      ...project.equilibriumResult,
      closedForm: "tau_A^* = alpha_B / q",
    },
  };
  const riskyAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 0
      ? {
          ...analysis,
          id: "wrong-buyer-network-effect",
          target: "tau_A^*",
          parameter: "alpha_B",
          symbolicResult: "partial tau_A^* / partial alpha_B = 2/q",
          signCondition: "q>0 时为正",
          propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
          proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        }
      : analysis
  );
  const repairedAnalyses = createCandidateAnalyses().map((analysis, index) =>
    index === 0
      ? {
          ...analysis,
          target: "tau_A^*",
          parameter: "alpha_B",
          symbolicResult: "partial tau_A^* / partial alpha_B = 1/q",
          signCondition: "q>0 时为正",
          propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
          proofSketch: "由 tau_A^* = alpha_B/q 直接求偏导。",
        }
      : analysis
  );
  let attempts = 0;

  const result = await runPropertyAnalysisAgent(
    {
      rawIdea: projectWithSimpleClosedForm.rawIdea,
      project: projectWithSimpleClosedForm,
    },
    {
      id: "property-agent-cas-repair-test",
      now: 1710000000000,
      analyzeProperties: async () => {
        attempts += 1;
        const analyses = attempts === 1 ? riskyAnalyses : repairedAnalyses;
        return {
          project: {
            ...projectWithSimpleClosedForm,
            propertyAnalyses: analyses,
            researchSession: {
              ...projectWithSimpleClosedForm.researchSession,
              phase: "analysis",
              assetSummary: {
                ...projectWithSimpleClosedForm.researchSession?.assetSummary,
                confirmedAssumptions:
                  projectWithSimpleClosedForm.researchSession?.assetSummary
                    .confirmedAssumptions ?? [],
                utilityFunctions:
                  projectWithSimpleClosedForm.researchSession?.assetSummary
                    .utilityFunctions ?? [],
                equilibriumStatus: "solved",
                nextActions: ["检查命题条件", "整理论文草稿"],
                pendingDecision: undefined,
              },
              messages: projectWithSimpleClosedForm.researchSession?.messages ?? [],
            },
          },
          usedFallback: false,
          assistantMessage: "性质分析候选。",
        };
      },
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const propertyChange = patch?.changes.find(
    (change) => change.path === "propertyAnalyses"
  );

  assert.equal(attempts, 2);
  assert.deepEqual(propertyChange?.value, repairedAnalyses);
  assert.equal(
    result.agentRun.trace.some((event) =>
      String(event.metadata?.issues ?? "").includes("偏导复算")
    ),
    true
  );
});

test(
  "property analysis agent repairs candidates when SymPy catches an unsupported derivative",
  { skip: !hasLocalSympy },
  async () => {
    const project = createSolvedProject();
    const projectWithSqrtClosedForm = {
      ...project,
      equilibriumResult: {
        ...project.equilibriumResult,
        closedForm: "tau_A^* = sqrt(alpha_B)",
        conditions: ["alpha_B > 0"],
      },
    };
    const riskyAnalyses = createCandidateAnalyses().map((analysis, index) =>
      index === 0
        ? {
            ...analysis,
            id: "wrong-sqrt-buyer-network-effect",
            target: "tau_A^*",
            parameter: "alpha_B",
            symbolicResult:
              "partial tau_A^* / partial alpha_B = 1/(3*sqrt(alpha_B))",
            signCondition: "alpha_B>0 时为正",
            propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
            proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
          }
        : analysis
    );
    const repairedAnalyses = createCandidateAnalyses().map((analysis, index) =>
      index === 0
        ? {
            ...analysis,
            target: "tau_A^*",
            parameter: "alpha_B",
            symbolicResult:
              "partial tau_A^* / partial alpha_B = 1/(2*sqrt(alpha_B))",
            signCondition: "alpha_B>0 时为正",
            propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
            proofSketch: "由 tau_A^* = sqrt(alpha_B) 直接求偏导。",
          }
        : analysis
    );
    let attempts = 0;

    const result = await runPropertyAnalysisAgent(
      {
        rawIdea: projectWithSqrtClosedForm.rawIdea,
        project: projectWithSqrtClosedForm,
      },
      {
        id: "property-agent-sympy-repair-test",
        now: 1710000000000,
        analyzeProperties: async () => {
          attempts += 1;
          const analyses = attempts === 1 ? riskyAnalyses : repairedAnalyses;
          return {
            project: {
              ...projectWithSqrtClosedForm,
              propertyAnalyses: analyses,
              researchSession: {
                ...projectWithSqrtClosedForm.researchSession,
                phase: "analysis",
                assetSummary: {
                  ...projectWithSqrtClosedForm.researchSession?.assetSummary,
                  confirmedAssumptions:
                    projectWithSqrtClosedForm.researchSession?.assetSummary
                      .confirmedAssumptions ?? [],
                  utilityFunctions:
                    projectWithSqrtClosedForm.researchSession?.assetSummary
                      .utilityFunctions ?? [],
                  equilibriumStatus: "solved",
                  nextActions: ["检查命题条件", "整理论文草稿"],
                  pendingDecision: undefined,
                },
                messages:
                  projectWithSqrtClosedForm.researchSession?.messages ?? [],
              },
            },
            usedFallback: false,
            assistantMessage: "性质分析候选。",
          };
        },
      }
    );

    const patch = result.project.researchSession?.assetPatches?.[0];
    const propertyChange = patch?.changes.find(
      (change) => change.path === "propertyAnalyses"
    );

    assert.equal(attempts, 2);
    assert.deepEqual(propertyChange?.value, repairedAnalyses);
    assert.equal(
      result.agentRun.trace.some((event) =>
        String(event.metadata?.issues ?? "").includes("SymPy")
      ),
      true
    );
  }
);
