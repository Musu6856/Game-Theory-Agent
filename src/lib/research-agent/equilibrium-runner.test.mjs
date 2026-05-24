import assert from "node:assert/strict";
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
                content: "候选均衡已生成。",
                createdAt: 0,
              },
            ],
          },
        },
        usedFallback: false,
        assistantMessage: "候选均衡已生成。",
      }),
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const rootChange = patch?.changes.find(
    (change) => change.path === "equilibriumResult"
  );

  assert.notEqual(result.project.equilibriumResult?.closedForm, "\\tau_A^* = 1");
  assert.equal(rootChange?.value, candidateEquilibrium);

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
