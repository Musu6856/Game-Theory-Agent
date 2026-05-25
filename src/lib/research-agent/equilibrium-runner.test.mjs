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

test("equilibrium solving agent proposes a reviewable equilibrium patch with trace", async () => {
  const project = createConfirmedProject();
  const candidateEquilibrium = {
    status: "solved",
    concept: "双边 Hotelling 平台竞争内点均衡",
    solvingSteps: ["写出平台利润函数", "对佣金和补贴求一阶条件", "联立求解内点解"],
    focs: ["\\partial \\Pi_A / \\partial \\tau_A = 0"],
    conditions: ["t_B > \\alpha_B", "q > 0"],
    closedForm: "\\tau_A^* = \\frac{t_B - \\alpha_B}{2q}",
    derivation: "由一阶条件联立即得对称内点均衡。",
    code: "import sympy as sp\nsp.solve([foc_tau_A], [tau_A])",
    warnings: [],
  };

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
});

test("equilibrium solving agent keeps candidate equilibrium pending until applied", async () => {
  const project = createConfirmedProject();
  const providerDraftMessage =
    "FULL_EQUILIBRIUM_PROVIDER_DRAFT_SHOULD_STAY_OUT_OF_CHAT";
  const candidateEquilibrium = {
    status: "solved",
    concept: "候选均衡概念",
    solvingSteps: ["候选求解步骤"],
    focs: ["候选 FOC"],
    conditions: ["候选存在条件"],
    closedForm: "\\tau_A^* = 1",
    derivation: "候选推导。",
    code: "candidate_code()",
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

  assert.notEqual(result.project.equilibriumResult?.closedForm, "\\tau_A^* = 1");
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

  assert.equal(applied.equilibriumResult?.closedForm, "\\tau_A^* = 1");
  assert.equal(applied.researchSession?.assetPatches?.[0].status, "applied");
  assert.equal(
    applied.researchSession?.assetSummary.pendingDecision?.kind,
    "analyze_properties"
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

test("equilibrium solving agent retries once when self-review finds repairable risks", async () => {
  const project = createConfirmedProject();
  const riskyEquilibrium = {
    status: "symbolic_failure",
    concept: "隐式系统草稿",
    solvingSteps: ["列出一阶条件"],
    focs: [],
    conditions: [],
    closedForm: "",
    derivation: "当前只得到隐式系统。",
    code: "implicit_system()",
    warnings: ["不是闭式均衡。"],
  };
  const repairedEquilibrium = {
    status: "solved",
    concept: "修复后的双边平台内点均衡",
    solvingSteps: ["写出利润函数", "对佣金求一阶条件", "联立求解闭式解"],
    focs: ["\\partial \\Pi_A / \\partial \\tau_A = 0"],
    conditions: ["q > 0", "t_B > \\alpha_B"],
    closedForm: "\\tau_A^* = \\frac{t_B - \\alpha_B}{2q}",
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
          attempts === 1 ? riskyEquilibrium : repairedEquilibrium;
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
  assert.deepEqual(equilibriumChange?.value, repairedEquilibrium);
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
    closedForm: "tau_A^* = alpha_B / q",
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
          attempts === 1 ? riskyEquilibrium : repairedEquilibrium;
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
  assert.deepEqual(equilibriumChange?.value, repairedEquilibrium);
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
    const project = createConfirmedProject();
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
            attempts === 1 ? riskyEquilibrium : repairedEquilibrium;
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
    assert.deepEqual(equilibriumChange?.value, repairedEquilibrium);
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
            attempts === 1 ? riskyEquilibrium : repairedEquilibrium;
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
    assert.deepEqual(equilibriumChange?.value, repairedEquilibrium);
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
    const candidateEquilibrium = {
      status: "solved",
      concept: "由利润函数复核的闭式解",
      solvingSteps: ["写出利润函数", "对佣金求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "候选闭式解满足从利润函数生成的 FOC。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    };

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
