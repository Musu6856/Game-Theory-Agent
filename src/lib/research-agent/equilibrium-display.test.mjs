import test from "node:test";
import assert from "node:assert/strict";

import {
  getMathArtifactKindLabel,
  getMathArtifactStatusLabel,
  selectEquilibriumMathArtifactsForDisplay,
  selectPendingEquilibriumCandidate,
} from "./equilibrium-display.ts";

test("selectPendingEquilibriumCandidate returns the latest proposed equilibrium patch value", () => {
  const oldCandidate = {
    status: "solved",
    concept: "旧候选",
    solvingSteps: ["旧步骤"],
    focs: ["old_foc = 0"],
    conditions: ["old condition"],
    closedForm: "old",
    derivation: "old",
    code: "old",
    warnings: [],
  };
  const latestCandidate = {
    status: "solved",
    concept: "最新候选",
    solvingSteps: ["写出利润函数", "联立 FOC"],
    focs: ["2*tau_A-alpha_B=0"],
    conditions: ["alpha_B > 0"],
    closedForm: "tau_A^*=alpha_B/2",
    derivation: "由 FOC 得到。",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  };

  const candidate = selectPendingEquilibriumCandidate([
    {
      id: "patch-old",
      kind: "equilibrium",
      summary: "旧 patch",
      status: "rejected",
      createdAt: 1,
      changes: [
        {
          kind: "replace",
          path: "equilibriumResult",
          value: oldCandidate,
        },
      ],
    },
    {
      id: "patch-latest",
      kind: "equilibrium",
      summary: "最新 patch",
      status: "proposed",
      createdAt: 2,
      changes: [
        {
          kind: "replace",
          path: "equilibriumResult",
          value: latestCandidate,
        },
      ],
    },
  ]);

  assert.deepEqual(candidate, latestCandidate);
});

test("selectPendingEquilibriumCandidate accepts root alias equilibrium patch values", () => {
  const candidateValue = {
    status: "solved",
    concept: "alias candidate",
    solvingSteps: ["derive payoff", "solve FOC"],
    focs: ["2*tau_A-alpha_B=0"],
    conditions: ["alpha_B > 0"],
    closedForm: "tau_A^*=alpha_B/2",
    derivation: "FOC gives the candidate.",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  };

  const candidate = selectPendingEquilibriumCandidate([
    {
      id: "patch-alias",
      kind: "equilibrium",
      summary: "alias patch",
      status: "proposed",
      createdAt: 1,
      changes: [
        {
          kind: "replace",
          path: "equilibrium",
          value: candidateValue,
        },
      ],
    },
  ]);

  assert.deepEqual(candidate, candidateValue);
});

test("selectPendingEquilibriumCandidate reconstructs field-level patch values", () => {
  const candidate = selectPendingEquilibriumCandidate([
    {
      id: "patch-field-level",
      kind: "equilibrium",
      summary: "field-level patch",
      status: "proposed",
      createdAt: 1,
      changes: [
        {
          kind: "replace",
          path: "equilibriumResult.status",
          value: "solved",
        },
        {
          kind: "replace",
          path: "equilibriumResult.concept",
          value: "field candidate",
        },
        {
          kind: "replace",
          path: "equilibriumResult.solvingSteps",
          value: ["derive payoff", "solve FOC"],
        },
        {
          kind: "replace",
          path: "equilibriumResult.focs",
          value: ["2*tau_A-alpha_B=0"],
        },
        {
          kind: "replace",
          path: "equilibriumResult.conditions",
          value: ["alpha_B > 0"],
        },
        {
          kind: "replace",
          path: "equilibriumResult.closedForm",
          value: "tau_A^*=alpha_B/2",
        },
        {
          kind: "replace",
          path: "equilibriumResult.derivation",
          value: "FOC gives the candidate.",
        },
        {
          kind: "replace",
          path: "equilibriumResult.code",
          value: "sp.solve([2*tau_A-alpha_B], [tau_A])",
        },
        {
          kind: "replace",
          path: "equilibriumResult.warnings",
          value: [],
        },
      ],
    },
  ]);

  assert.deepEqual(candidate, {
    status: "solved",
    concept: "field candidate",
    solvingSteps: ["derive payoff", "solve FOC"],
    focs: ["2*tau_A-alpha_B=0"],
    conditions: ["alpha_B > 0"],
    closedForm: "tau_A^*=alpha_B/2",
    derivation: "FOC gives the candidate.",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  });
});

test("selectEquilibriumMathArtifactsForDisplay filters and orders recent equilibrium artifacts", () => {
  const artifacts = [
    {
      id: "property-artifact",
      stepId: "review-properties",
      kind: "sympy_residual_check",
      title: "性质复核",
      status: "passed",
      source: "sympy",
      createdAt: 1,
      output: { property: true },
    },
    {
      id: "candidate",
      stepId: "draft-equilibrium",
      kind: "equilibrium_candidate",
      title: "均衡候选",
      status: "passed",
      source: "candidate",
      createdAt: 2,
    },
    {
      id: "coverage",
      stepId: "review-equilibrium",
      kind: "model_coverage_check",
      title: "模型覆盖",
      status: "failed",
      source: "model",
      createdAt: 4,
    },
    {
      id: "solve",
      stepId: "review-equilibrium",
      kind: "sympy_solve_check",
      title: "独立求解",
      status: "manual_review",
      source: "sympy",
      createdAt: 3,
    },
    {
      id: "second-order",
      stepId: "review-equilibrium",
      kind: "second_order_conditions",
      title: "二阶条件",
      status: "failed",
      source: "sympy",
      createdAt: 5,
    },
  ];

  assert.deepEqual(
    selectEquilibriumMathArtifactsForDisplay(artifacts).map((artifact) => artifact.id),
    ["second-order", "coverage", "solve", "candidate"]
  );
});

test("math artifact display labels are localized Chinese", () => {
  assert.equal(getMathArtifactKindLabel("equilibrium_candidate"), "均衡候选");
  assert.equal(getMathArtifactKindLabel("model_coverage_check"), "模型覆盖");
  assert.equal(getMathArtifactKindLabel("sympy_solve_check"), "独立求解");
  assert.equal(getMathArtifactKindLabel("second_order_conditions"), "二阶条件");
  assert.equal(getMathArtifactKindLabel("hessian_check"), "Hessian 检查");
  assert.equal(getMathArtifactKindLabel("concavity_check"), "凹性证据");
  assert.equal(getMathArtifactKindLabel("boundary_kkt_check"), "边界/KKT");
  assert.equal(getMathArtifactStatusLabel("manual_review"), "人工复核");
  assert.equal(getMathArtifactStatusLabel("condition_insufficient"), "条件不足");
});
