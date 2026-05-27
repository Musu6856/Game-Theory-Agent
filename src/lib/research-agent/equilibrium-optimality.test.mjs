import assert from "node:assert/strict";
import test from "node:test";

import { evaluateEquilibriumOptimality } from "./equilibrium-optimality.ts";

function createEquilibrium(overrides = {}) {
  return {
    status: "solved",
    concept: "stationary candidate",
    solvingSteps: ["Write profit.", "Take FOC.", "Solve."],
    focs: ["2*tau_A = 0"],
    conditions: ["tau_A >= 0"],
    closedForm: "tau_A^* = 0",
    derivation: "FOC gives tau_A = 0.",
    code: "sp.solve([2*tau_A], [tau_A])",
    warnings: [],
    ...overrides,
  };
}

test("optimality check fails one-dimensional stationary points with positive second derivative", async () => {
  const result = await evaluateEquilibriumOptimality({
    compiledSystem: {
      variables: ["tau_A"],
      modelDecisionVariables: ["tau_A"],
      parameters: [],
      objectives: [
        {
          profitFunctionId: "profit-a",
          platform: "A",
          expression: "tau_A^2",
          variable: "tau_A",
        },
      ],
      assumptions: ["tau_A >= 0"],
      issues: [],
    },
    substitutions: { tau_A: "0" },
    equilibrium: createEquilibrium(),
    idPrefix: "optimality-positive-second",
    now: 1710000000000,
  });

  const secondOrder = result.artifacts.find(
    (artifact) => artifact.kind === "second_order_conditions"
  );

  assert.equal(result.ok, false);
  assert.equal(secondOrder?.status, "failed");
  assert.ok(result.issues.some((issue) => /second derivative/i.test(issue)));
});

test("optimality check records boundary KKT insufficiency for constrained boundary candidates", async () => {
  const result = await evaluateEquilibriumOptimality({
    compiledSystem: {
      variables: ["s_A"],
      modelDecisionVariables: ["s_A"],
      parameters: [],
      objectives: [
        {
          profitFunctionId: "profit-a",
          platform: "A",
          expression: "-s_A^2",
          variable: "s_A",
        },
      ],
      assumptions: ["s_A >= 0"],
      issues: [],
    },
    substitutions: { s_A: "0" },
    equilibrium: createEquilibrium({
      focs: ["-2*s_A = 0"],
      closedForm: "s_A^* = 0",
      derivation: "FOC gives s_A = 0.",
    }),
    idPrefix: "optimality-boundary",
    now: 1710000000000,
  });

  const boundary = result.artifacts.find(
    (artifact) => artifact.kind === "boundary_kkt_check"
  );

  assert.equal(result.ok, false);
  assert.equal(boundary?.status, "condition_insufficient");
  assert.ok(
    boundary?.issues?.some((issue) => /KKT|boundary/i.test(issue))
  );
});

test("optimality check accepts separable one-dimensional objectives for multiple players", async () => {
  const result = await evaluateEquilibriumOptimality({
    compiledSystem: {
      variables: ["tau_A", "tau_B"],
      modelDecisionVariables: ["tau_A", "tau_B"],
      parameters: ["alpha_B"],
      objectives: [
        {
          profitFunctionId: "profit-a",
          platform: "A",
          expression: "alpha_B*tau_A - tau_A^2",
          variable: "tau_A",
        },
        {
          profitFunctionId: "profit-b",
          platform: "B",
          expression: "alpha_B*tau_B - tau_B^2",
          variable: "tau_B",
        },
      ],
      assumptions: ["alpha_B > 0"],
      issues: [],
    },
    substitutions: { tau_A: "alpha_B/2", tau_B: "alpha_B/2" },
    equilibrium: createEquilibrium({
      focs: ["alpha_B - 2*tau_A = 0", "alpha_B - 2*tau_B = 0"],
      closedForm: "tau_A^* = alpha_B/2; tau_B^* = alpha_B/2",
      conditions: ["alpha_B > 0", "second-order condition holds"],
      derivation:
        "Each platform solves a separable concave one-dimensional objective.",
    }),
    idPrefix: "optimality-separable-players",
    now: 1710000000000,
  });

  const hessian = result.artifacts.find(
    (artifact) => artifact.kind === "hessian_check"
  );

  assert.equal(result.ok, true);
  assert.equal(hessian?.status, "passed");
});

test("optimality check accepts one-dimensional interacting player objectives", async () => {
  const result = await evaluateEquilibriumOptimality({
    compiledSystem: {
      variables: ["tau_A", "tau_B"],
      modelDecisionVariables: ["tau_A", "tau_B"],
      parameters: ["alpha_B", "beta"],
      objectives: [
        {
          profitFunctionId: "profit-a",
          platform: "A",
          expression: "alpha_B*tau_A - tau_A^2 + beta*tau_A*tau_B",
          variable: "tau_A",
        },
        {
          profitFunctionId: "profit-b",
          platform: "B",
          expression: "alpha_B*tau_B - tau_B^2 + beta*tau_A*tau_B",
          variable: "tau_B",
        },
      ],
      assumptions: ["alpha_B > 0"],
      issues: [],
    },
    substitutions: { tau_A: "alpha_B/2", tau_B: "alpha_B/2" },
    equilibrium: createEquilibrium({
      focs: [
        "alpha_B - 2*tau_A + beta*tau_B = 0",
        "alpha_B - 2*tau_B + beta*tau_A = 0",
      ],
      closedForm: "tau_A^* = alpha_B/2; tau_B^* = alpha_B/2",
      conditions: ["alpha_B > 0", "second-order condition holds"],
      derivation:
        "Each platform has a one-dimensional own decision while payoffs interact through the rival strategy.",
    }),
    idPrefix: "optimality-interacting-players",
    now: 1710000000000,
  });

  const hessian = result.artifacts.find(
    (artifact) => artifact.kind === "hessian_check"
  );

  assert.equal(result.ok, true);
  assert.equal(hessian?.status, "passed");
});

test("optimality check requires Hessian review for one player with multiple decisions", async () => {
  const result = await evaluateEquilibriumOptimality({
    compiledSystem: {
      variables: ["tau_A", "s_A"],
      modelDecisionVariables: ["tau_A", "s_A"],
      parameters: ["alpha_B"],
      objectives: [
        {
          profitFunctionId: "profit-a",
          platform: "A",
          expression:
            "alpha_B*tau_A + alpha_B*s_A - tau_A^2 - s_A^2 + 5*tau_A*s_A",
          variable: "tau_A",
        },
        {
          profitFunctionId: "profit-a",
          platform: "A",
          expression:
            "alpha_B*tau_A + alpha_B*s_A - tau_A^2 - s_A^2 + 5*tau_A*s_A",
          variable: "s_A",
        },
      ],
      assumptions: ["alpha_B > 0"],
      issues: [],
    },
    substitutions: { tau_A: "alpha_B/2", s_A: "alpha_B/2" },
    equilibrium: createEquilibrium({
      focs: ["alpha_B - 2*tau_A + 5*s_A = 0"],
      closedForm: "tau_A^* = alpha_B/2; s_A^* = alpha_B/2",
      conditions: ["alpha_B > 0", "second-order condition claimed"],
      derivation:
        "The candidate checks each own second derivative but has cross terms.",
    }),
    idPrefix: "optimality-multidecision-player",
    now: 1710000000000,
  });

  const hessian = result.artifacts.find(
    (artifact) => artifact.kind === "hessian_check"
  );

  assert.equal(result.ok, false);
  assert.equal(hessian?.status, "manual_review");
});
