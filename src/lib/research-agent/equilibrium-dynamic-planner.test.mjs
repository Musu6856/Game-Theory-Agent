import assert from "node:assert/strict";
import test from "node:test";

import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generateSymbolicEquilibrium,
} from "../research-session.ts";
import { planEquilibriumKernelNextStep } from "./equilibrium-dynamic-planner.ts";

function createConfirmedProject() {
  return confirmResearchModel(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "研究二手平台佣金与补贴策略",
        now: 1710000000000,
      }),
      "secondhand-commission-subsidy-hotelling"
    )
  );
}

test("equilibrium dynamic planner asks for review when an equilibrium patch is pending", () => {
  const project = {
    ...createConfirmedProject(),
    researchSession: {
      ...createConfirmedProject().researchSession,
      assetPatches: [
        {
          id: "patch-equilibrium",
          kind: "equilibrium",
          summary: "待审核均衡",
          status: "proposed",
          createdAt: 1710000000000,
          changes: [
            {
              kind: "replace",
              path: "equilibriumResult.closedForm",
              value: "tau_A^*=1",
            },
          ],
        },
      ],
    },
  };

  const decision = planEquilibriumKernelNextStep(project);

  assert.equal(decision.action, "apply_pending_patch");
  assert.equal(decision.status, "blocked");
  assert.equal(decision.patchKind, "equilibrium");
});

test("equilibrium dynamic planner re-solves when saved SymPy artifacts failed", () => {
  const solved = generateSymbolicEquilibrium(createConfirmedProject());
  const project = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      mathArtifacts: [
        {
          id: "artifact-failed-residual",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "sympy_residual_check",
          title: "SymPy FOC 残差回代",
          status: "failed",
          source: "sympy",
          output: { residuals: ["alpha_B/3"] },
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const decision = planEquilibriumKernelNextStep(project);

  assert.equal(decision.status, "ready");
  assert.equal(decision.action, "solve_equilibrium");
  assert.match(decision.reason, /残差|独立求解|重新/);
  assert.deepEqual(decision.artifactIds, ["artifact-failed-residual"]);
});

test("equilibrium dynamic planner repairs a failed candidate before full re-solve", () => {
  const solved = generateSymbolicEquilibrium(createConfirmedProject());
  const project = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      mathArtifacts: [
        {
          id: "artifact-candidate-failed",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "sympy_residual_check",
          title: "SymPy FOC 残差回代",
          status: "failed",
          source: "sympy",
          input: {
            residualSource: "candidate_foc",
            residuals: ["2*tau_A-alpha_B"],
            substitutions: { tau_A: "alpha_B/3" },
          },
          output: { residuals: ["alpha_B/3"] },
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const decision = planEquilibriumKernelNextStep(project);

  assert.equal(decision.status, "ready");
  assert.equal(decision.action, "repair_equilibrium_candidate");
  assert.deepEqual(decision.artifactIds, ["artifact-candidate-failed"]);
  assert.match(decision.reason, /候选|残差|修复/);
});

test("equilibrium dynamic planner routes unsupported math artifacts to manual review", () => {
  const solved = generateSymbolicEquilibrium(createConfirmedProject());
  const project = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      mathArtifacts: [
        {
          id: "artifact-manual",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "foc_residuals",
          title: "候选 FOC 残差",
          status: "manual_review",
          source: "candidate",
          output: { residuals: [] },
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const decision = planEquilibriumKernelNextStep(project);

  assert.equal(decision.status, "blocked");
  assert.equal(decision.action, "review_manually");
  assert.deepEqual(decision.artifactIds, ["artifact-manual"]);
});

test("equilibrium dynamic planner repairs the model when compiled system is incomplete", () => {
  const solved = generateSymbolicEquilibrium(createConfirmedProject());
  const project = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
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
            issues: ["No safe structured profit functions are available for FOC generation."],
          },
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const decision = planEquilibriumKernelNextStep(project);

  assert.equal(decision.status, "ready");
  assert.equal(decision.action, "repair_model");
  assert.deepEqual(decision.artifactIds, ["artifact-compiled-gap"]);
  assert.match(decision.reason, /模型|利润函数|变量|FOC/);
});

test("equilibrium dynamic planner keeps generated FOC manual review when model objectives exist", () => {
  const solved = generateSymbolicEquilibrium(createConfirmedProject());
  const project = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      mathArtifacts: [
        {
          id: "artifact-generated-foc-manual",
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
          output: {
            residuals: [],
            source: "model_profit_functions",
          },
          issues: ["SymPy FOC generation is unavailable."],
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const decision = planEquilibriumKernelNextStep(project);

  assert.equal(decision.status, "blocked");
  assert.equal(decision.action, "review_manually");
  assert.deepEqual(decision.artifactIds, ["artifact-generated-foc-manual"]);
});

test("equilibrium dynamic planner opens property analysis after solved verified equilibrium", () => {
  const solved = generateSymbolicEquilibrium(createConfirmedProject());
  const project = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      mathArtifacts: [
        {
          id: "artifact-passed",
          runId: "agent-equilibrium",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium",
          kind: "sympy_residual_check",
          title: "SymPy FOC 残差回代",
          status: "passed",
          source: "sympy",
          output: { residuals: ["0"] },
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const decision = planEquilibriumKernelNextStep(project);

  assert.equal(decision.status, "ready");
  assert.equal(decision.action, "analyze_properties");
});
