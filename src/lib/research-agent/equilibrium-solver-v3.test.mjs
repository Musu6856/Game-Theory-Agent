import assert from "node:assert/strict";
import test from "node:test";

import {
  compileEquilibriumSolverV3System,
  getSolverV3NextAction,
} from "./equilibrium-solver-v3.ts";

function createModel(overrides = {}) {
  return {
    symbols: [
      symbol("tau-a", "tau_A", "decision", "tau_A >= 0"),
      symbol("tau-b", "tau_B", "decision", "tau_B >= 0"),
      symbol("alpha", "alpha_B", "parameter", "alpha_B > 0"),
      symbol("beta", "beta", "parameter", "0 < beta < 2"),
    ],
    sides: {
      consumerSideName: "buyers",
      merchantSideName: "sellers",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "pricing",
        order: 1,
        name: "pricing",
        decisions: ["tau_A", "tau_B"],
      },
    ],
    utilityFunctions: [],
    demandDerivation: "n_A and n_B are state variables.",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "alpha_B*tau_A - tau_A^2 + beta*tau_A*tau_B",
        notes: "Platform A objective.",
      },
      {
        id: "profit-b",
        platform: "B",
        expression: "alpha_B*tau_B - tau_B^2 + beta*tau_A*tau_B",
        notes: "Platform B objective.",
      },
    ],
    assumptions: ["alpha_B > 0", "0 < beta < 2", "tau_A >= 0", "tau_B >= 0"],
    modelSetupDraft: "Two-player benchmark model.",
    ...overrides,
  };
}

function symbol(id, codeName, role, assumption = "") {
  return {
    id,
    symbol: codeName,
    baseSymbol: codeName.split("_")[0],
    subscript: codeName.split("_")[1],
    codeName,
    name: codeName,
    meaning: codeName,
    role,
    side: role === "parameter" ? "global" : "platform",
    assumption,
    recommended: true,
  };
}

test("solver v3 compiler separates players, variables, parameters, constraints, and timing", () => {
  const system = compileEquilibriumSolverV3System({
    model: createModel(),
    candidateVariables: ["tau_A", "tau_B"],
  });

  assert.deepEqual(system.players, [
    { id: "A", platform: "A", variables: ["tau_A"] },
    { id: "B", platform: "B", variables: ["tau_B"] },
  ]);
  assert.deepEqual(system.strategicVariables, ["tau_A", "tau_B"]);
  assert.deepEqual(system.parameters, ["alpha_B", "beta"]);
  assert.deepEqual(system.constraints.map((constraint) => constraint.expression), [
    "alpha_B > 0",
    "0 < beta < 2",
    "tau_A >= 0",
    "tau_B >= 0",
  ]);
  assert.equal(system.timing[0].stageId, "pricing");
});

test("solver v3 compiler generates safe structured FOCs and strategy attempts", () => {
  const system = compileEquilibriumSolverV3System({
    model: createModel(),
    candidateVariables: ["tau_A", "tau_B"],
  });

  assert.deepEqual(
    system.generatedFocSystem.map((foc) => foc.residual),
    [
      "alpha_B - 2*tau_A + beta*tau_B",
      "alpha_B - 2*tau_B + beta*tau_A",
    ]
  );
  assert.deepEqual(system.strategyPlan.map((item) => item.strategy), [
    "linear_system",
    "reaction_functions",
    "explicit_foc_solve",
    "residual_substitution",
    "implicit_system_fallback",
  ]);
  assert.equal(system.failure.kind, "none");
});

test("solver v3 compiler records Hessian and KKT obligations without marking them solved", () => {
  const system = compileEquilibriumSolverV3System({
    model: createModel({
      platforms: ["A"],
      symbols: [
        symbol("tau-a", "tau_A", "decision", "tau_A >= 0"),
        symbol("s-a", "s_A", "decision", "s_A >= 0"),
        symbol("alpha", "alpha_B", "parameter", "alpha_B > 0"),
      ],
      timing: [
        {
          id: "joint-choice",
          order: 1,
          name: "joint choice",
          decisions: ["tau_A", "s_A"],
        },
      ],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "alpha_B*tau_A + alpha_B*s_A - tau_A^2 - s_A^2 + 5*tau_A*s_A",
          notes: "Same-player multi-decision objective.",
        },
      ],
      assumptions: ["alpha_B > 0", "tau_A >= 0", "s_A >= 0"],
    }),
    candidateVariables: ["tau_A", "s_A"],
  });

  assert.ok(
    system.optimalityObligations.some(
      (obligation) =>
        obligation.kind === "hessian" &&
        obligation.status === "manual_review" &&
        obligation.variables.join(",") === "tau_A,s_A"
    )
  );
  assert.ok(
    system.optimalityObligations.some(
      (obligation) => obligation.kind === "boundary_kkt"
    )
  );
});

test("solver v3 compiler classifies model gaps and unsafe expressions with next actions", () => {
  const missingProfit = compileEquilibriumSolverV3System({
    model: createModel({ profitFunctions: [] }),
    candidateVariables: ["tau_A"],
  });
  const unsafe = compileEquilibriumSolverV3System({
    model: createModel({
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "alpha_B*tau_A - exp(tau_A)",
          notes: "Unsupported function.",
        },
      ],
    }),
    candidateVariables: ["tau_A"],
  });

  assert.equal(missingProfit.failure.kind, "model_gap");
  assert.match(getSolverV3NextAction(missingProfit.failure), /model/i);
  assert.equal(unsafe.failure.kind, "unsupported_expression");
  assert.match(getSolverV3NextAction(unsafe.failure), /manual review|rewrite/i);
});
