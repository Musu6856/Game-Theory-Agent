import test from "node:test";
import assert from "node:assert/strict";

import { attachEquilibriumResult } from "./research-generation/fallbacks.ts";
import { getPersistableResearchProject } from "./research-generation-result.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generatePropertyAnalysis,
  generateSymbolicEquilibrium,
} from "./research-session.ts";

test("fallback generation is not persistable", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });

  const result = {
    project,
    usedFallback: true,
    assistantMessage: "模型服务不可用",
  };

  assert.equal(getPersistableResearchProject(result), null);
});

test("successful generation remains persistable", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });

  const result = {
    project,
    usedFallback: false,
    assistantMessage: "已生成",
  };

  assert.equal(getPersistableResearchProject(result), project);
});

test("draft equilibrium fallback is not persisted as a completed equilibrium", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const adopted = adoptResearchDirection(
    project,
    "secondhand-commission-subsidy-hotelling"
  );
  const confirmed = confirmResearchModel(adopted);
  const solved = generateSymbolicEquilibrium(confirmed);

  const result = {
    project: solved,
    usedFallback: true,
    assistantMessage: "已生成本地符号均衡推导",
  };

  assert.equal(solved.equilibriumResult?.status, "derivation_draft");
  assert.equal(getPersistableResearchProject(result), null);
});

test("accepted default-scope fallback remains persistable when stale property analyses exist", () => {
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
  const reSolved = generateSymbolicEquilibrium(analyzed, {
    acceptDefaultFallbackScope: true,
  });

  const result = {
    project: reSolved,
    usedFallback: true,
    assistantMessage: "已重新生成本地符号均衡推导",
  };

  assert.equal(reSolved.equilibriumResult?.status, "solved");
  assert.ok(reSolved.propertyAnalyses?.length);
  assert.equal(getPersistableResearchProject(result), reSolved);
});

test("symbolic failure fallback is not persisted as completed equilibrium", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const failed = {
    ...project,
    equilibriumResult: {
      status: "symbolic_failure",
      concept: "隐式系统草稿",
      solvingSteps: ["列出一阶条件"],
      focs: ["F(z,\\theta)=0"],
      conditions: ["\\det J_zF\\ne0"],
      closedForm: "当前没有完整闭式解。",
      derivation: "只得到隐式系统。",
      code: "print('implicit system')",
      warnings: ["不是闭式均衡。"],
    },
    researchSession: {
      ...project.researchSession,
      phase: "equilibrium",
      assetSummary: {
        ...project.researchSession.assetSummary,
        equilibriumStatus: "symbolic_failure",
      },
    },
  };

  const result = {
    project: failed,
    usedFallback: true,
    assistantMessage: "只得到隐式系统草稿",
  };

  assert.equal(getPersistableResearchProject(result), null);
});

test("fallback agent patch is persistable because it still requires review", () => {
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
  const withPendingPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [
        {
          id: "patch-equilibrium-fallback",
          kind: "equilibrium",
          summary: "均衡求解 Agent 建议应用这版符号均衡",
          changes: [
            {
              kind: "replace",
              path: "equilibriumResult",
              value: {
                status: "solved",
                concept: "候选均衡",
                solvingSteps: ["求解一阶条件"],
                focs: ["FOC"],
                conditions: ["内部解条件"],
                closedForm: "\\tau_A^*=1",
                derivation: "候选推导。",
                code: "solve()",
                warnings: [],
              },
            },
          ],
          status: "proposed",
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const result = {
    project: withPendingPatch,
    usedFallback: true,
    assistantMessage: "已生成待审核均衡建议",
  };

  assert.equal(getPersistableResearchProject(result), withPendingPatch);
});

test("attaching symbolic failure does not open property analysis action", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const failed = attachEquilibriumResult(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    ),
    {
      status: "symbolic_failure",
      concept: "隐式系统草稿",
      solvingSteps: ["列出一阶条件"],
      focs: ["F(z,\\theta)=0"],
      conditions: ["\\det J_zF\\ne0"],
      closedForm: "当前没有完整闭式解。",
      derivation: "只得到隐式系统。",
      code: "print('implicit system')",
      warnings: ["不是闭式均衡。"],
    },
    "只得到隐式系统草稿。"
  );

  assert.equal(
    failed.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
});
