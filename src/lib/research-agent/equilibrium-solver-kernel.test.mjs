import assert from "node:assert/strict";
import test from "node:test";

import { runEquilibriumSolverKernel } from "./equilibrium-solver-kernel.ts";

function createProjectWithExplicitProfitModel() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    createdAt: 1710000000000,
    rawIdea: "test idea",
    refinedIdea: "test idea",
    model: null,
    wizardCompleted: false,
    sections: [],
    references: [],
    hotellingModel: {
      symbols: [
        {
          id: "tau-a",
          symbol: "\\tau_A",
          baseSymbol: "tau",
          subscript: "A",
          codeName: "tau_A",
          name: "platform A commission",
          meaning: "platform A commission",
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
          name: "buyer-side network effect",
          meaning: "buyer-side network effect",
          role: "parameter",
          side: "consumer",
          assumption: "alpha_B > 0",
          recommended: true,
        },
      ],
      sides: {
        consumerSideName: "buyers",
        merchantSideName: "sellers",
      },
      platforms: ["A"],
      timing: [
        {
          id: "pricing",
          order: 1,
          name: "pricing",
          decisions: ["tau_A"],
        },
      ],
      utilityFunctions: [],
      demandDerivation: "reduced-form demand",
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "alpha_B*tau_A - tau_A^2",
          notes: "safe explicit profit",
        },
      ],
      assumptions: ["alpha_B > 0"],
      modelSetupDraft: "test model",
    },
  };
}

function createProjectWithTwoDecisionProfitModel() {
  const project = createProjectWithExplicitProfitModel();

  return {
    ...project,
    hotellingModel: {
      ...project.hotellingModel,
      symbols: [
        project.hotellingModel.symbols[0],
        {
          id: "tau-b",
          symbol: "\\tau_B",
          baseSymbol: "tau",
          subscript: "B",
          codeName: "tau_B",
          name: "platform B commission",
          meaning: "platform B commission",
          role: "decision",
          side: "platform",
          assumption: "tau_B >= 0",
          recommended: true,
        },
        project.hotellingModel.symbols[1],
      ],
      platforms: ["A", "B"],
      timing: [
        {
          id: "pricing",
          order: 1,
          name: "pricing",
          decisions: ["tau_A", "tau_B"],
        },
      ],
      profitFunctions: [
        project.hotellingModel.profitFunctions[0],
        {
          id: "profit-b",
          platform: "B",
          expression: "alpha_B*tau_B - tau_B^2",
          notes: "safe explicit profit for platform B",
        },
      ],
    },
  };
}

function createSolvedCandidate(closedForm = "tau_A^* = alpha_B/2") {
  return {
    status: "solved",
    concept: "interior symbolic equilibrium",
    solvingSteps: ["Write platform profit.", "Take FOC.", "Solve FOC."],
    focs: ["2*tau_A - alpha_B = 0"],
    conditions: ["alpha_B > 0"],
    closedForm,
    derivation: "The FOC gives the closed-form equilibrium.",
    code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
    warnings: [],
  };
}

test("equilibrium solver kernel records an ordered tool loop for a verified candidate", async () => {
  const result = await runEquilibriumSolverKernel({
    project: createProjectWithExplicitProfitModel(),
    equilibrium: createSolvedCandidate(),
    now: 1710000000000,
    runId: "agent-equilibrium-kernel-test",
    focGenerationChecker: async ({ objectives }) => {
      assert.deepEqual(objectives, [
        {
          expression: "alpha_B*tau_A - tau_A^2",
          variable: "tau_A",
        },
      ]);
      return {
        ok: true,
        status: "passed",
        message: "generated model FOC",
        residuals: ["alpha_B - 2*tau_A"],
      };
    },
    checker: async ({ residuals, substitutions }) => {
      assert.deepEqual(residuals, ["alpha_B - 2*tau_A"]);
      assert.deepEqual(substitutions, { tau_A: "alpha_B/2" });
      return {
        ok: true,
        status: "passed",
        message: "residuals vanish",
        residuals: ["0"],
      };
    },
    solveChecker: async ({ residuals, variables, candidate }) => {
      assert.deepEqual(residuals, ["alpha_B - 2*tau_A"]);
      assert.deepEqual(variables, ["tau_A"]);
      assert.deepEqual(candidate, { tau_A: "alpha_B/2" });
      return {
        ok: true,
        status: "passed",
        message: "candidate matches independent solve",
        solutions: [{ tau_A: "alpha_B/2" }],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.decision.action, "accept_candidate");
  assert.deepEqual(
    result.artifacts.map((artifact) => artifact.kind),
    [
      "model_coverage_check",
      "compiled_game_system",
      "closed_form_substitutions",
      "foc_residuals",
      "generated_foc_system",
      "sympy_residual_check",
      "solver_attempt",
      "sympy_solve_check",
      "second_order_conditions",
      "hessian_check",
      "concavity_check",
      "boundary_kkt_check",
    ]
  );
  assert.deepEqual(
    result.steps.map((step) => step.kind),
    [
      "candidate_validation",
      "model_coverage_check",
      "compiled_game_system",
      "closed_form_substitutions",
      "foc_residuals",
      "generated_foc_system",
      "sympy_residual_check",
      "solver_attempt",
      "sympy_solve_check",
      "second_order_conditions",
      "hessian_check",
      "concavity_check",
      "boundary_kkt_check",
      "planner_decision",
    ]
  );
});

test("equilibrium solver kernel asks to repair the candidate when SymPy checks fail", async () => {
  const result = await runEquilibriumSolverKernel({
    project: createProjectWithExplicitProfitModel(),
    equilibrium: createSolvedCandidate("tau_A^* = alpha_B/3"),
    now: 1710000000000,
    runId: "agent-equilibrium-kernel-failed-test",
    focGenerationChecker: async () => ({
      ok: true,
      status: "passed",
      message: "generated model FOC",
      residuals: ["alpha_B - 2*tau_A"],
    }),
    checker: async () => ({
      ok: false,
      status: "failed",
      message: "residual is alpha_B/3",
      residuals: ["alpha_B/3"],
    }),
    solveChecker: async () => ({
      ok: false,
      status: "failed",
      message: "candidate does not match independent solve",
      solutions: [{ tau_A: "alpha_B/2" }],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision.action, "repair_equilibrium_candidate");
  assert.deepEqual(
    result.decision.artifactIds,
    [
      "agent-equilibrium-kernel-failed-test-review-equilibrium-5-sympy_residual_check",
      "agent-equilibrium-kernel-failed-test-review-equilibrium-6-solver_attempt",
      "agent-equilibrium-kernel-failed-test-review-equilibrium-7-sympy_solve_check",
    ]
  );
});

test("equilibrium solver kernel repairs candidates missing model decision variables", async () => {
  let solveVariables;

  const result = await runEquilibriumSolverKernel({
    project: createProjectWithTwoDecisionProfitModel(),
    equilibrium: createSolvedCandidate("tau_A^* = alpha_B/2"),
    now: 1710000000000,
    runId: "agent-equilibrium-kernel-missing-var-test",
    focGenerationChecker: async ({ objectives }) => ({
      ok: true,
      status: "passed",
      message: "generated model FOCs",
      residuals: objectives.map(
        (objective) => `alpha_B - 2*${objective.variable}`
      ),
    }),
    checker: async ({ residuals }) => ({
      ok: true,
      status: "passed",
      message: "residuals stubbed",
      residuals: residuals.map(() => "0"),
    }),
    solveChecker: async ({ variables, candidate }) => {
      solveVariables = variables;
      return {
        ok: true,
        status: "passed",
        message: "solve check stubbed",
        solutions: [{ ...candidate, tau_B: "alpha_B/2" }],
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision.action, "repair_equilibrium_candidate");
  assert.deepEqual(solveVariables, ["tau_A", "tau_B"]);
  assert.match(result.issues.join("\n"), /tau_B/);
  assert.ok(
    result.decision.artifactIds.some((artifactId) =>
      artifactId.includes("closed_form_substitutions")
    )
  );
});

test("equilibrium solver kernel asks to repair model inputs before solving arbitrary missing systems", async () => {
  const project = createProjectWithExplicitProfitModel();
  const result = await runEquilibriumSolverKernel({
    project: {
      ...project,
      hotellingModel: {
        ...project.hotellingModel,
        profitFunctions: [],
      },
    },
    equilibrium: createSolvedCandidate(),
    now: 1710000000000,
    runId: "agent-equilibrium-kernel-model-gap-test",
    focGenerationChecker: async () => {
      throw new Error("FOC generation should not run without objectives");
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision.action, "repair_model");
  assert.deepEqual(result.decision.artifactIds, [
    "agent-equilibrium-kernel-model-gap-test-review-equilibrium-1-compiled_game_system",
    "agent-equilibrium-kernel-model-gap-test-review-equilibrium-4-generated_foc_system",
  ]);
});

test("equilibrium solver kernel rejects FOC candidates whose SOC proves a minimum", async () => {
  const project = createProjectWithExplicitProfitModel();
  const result = await runEquilibriumSolverKernel({
    project: {
      ...project,
      hotellingModel: {
        ...project.hotellingModel,
        profitFunctions: [
          {
            id: "profit-a",
            platform: "A",
            expression: "tau_A^2",
            notes: "convex objective",
          },
        ],
        assumptions: ["tau_A >= 0"],
      },
    },
    equilibrium: {
      ...createSolvedCandidate("tau_A^* = 0"),
      focs: ["2*tau_A = 0"],
      conditions: ["tau_A >= 0", "second-order condition claimed"],
      derivation: "FOC gives tau_A = 0 and claims this is optimal.",
    },
    now: 1710000000000,
    runId: "agent-equilibrium-kernel-soc-fail-test",
    focGenerationChecker: async () => ({
      ok: true,
      status: "passed",
      message: "generated model FOC",
      residuals: ["2*tau_A"],
    }),
    checker: async () => ({
      ok: true,
      status: "passed",
      message: "residuals vanish",
      residuals: ["0"],
    }),
    solveChecker: async () => ({
      ok: true,
      status: "passed",
      message: "candidate matches independent solve",
      solutions: [{ tau_A: "0" }],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision.action, "repair_equilibrium_candidate");
  assert.ok(
    result.artifacts.some(
      (artifact) =>
        artifact.kind === "second_order_conditions" &&
        artifact.status === "failed"
    )
  );
  assert.match(result.issues.join("\n"), /second derivative/i);
});

test("equilibrium solver kernel requires boundary or KKT evidence for boundary candidates", async () => {
  const project = createProjectWithExplicitProfitModel();
  const result = await runEquilibriumSolverKernel({
    project: {
      ...project,
      hotellingModel: {
        ...project.hotellingModel,
        symbols: [
          {
            ...project.hotellingModel.symbols[0],
            id: "s-a",
            symbol: "s_A",
            baseSymbol: "s",
            codeName: "s_A",
            name: "platform A subsidy",
            meaning: "platform A subsidy",
            role: "decision",
            assumption: "s_A >= 0",
          },
        ],
        timing: [
          {
            id: "subsidy",
            order: 1,
            name: "subsidy",
            decisions: ["s_A"],
          },
        ],
        profitFunctions: [
          {
            id: "profit-a",
            platform: "A",
            expression: "-s_A^2",
            notes: "concave subsidy objective",
          },
        ],
        assumptions: ["s_A >= 0"],
      },
    },
    equilibrium: {
      ...createSolvedCandidate("s_A^* = 0"),
      focs: ["-2*s_A = 0"],
      conditions: ["s_A >= 0", "interior FOC"],
      derivation: "FOC gives s_A = 0.",
    },
    now: 1710000000000,
    runId: "agent-equilibrium-kernel-boundary-test",
    focGenerationChecker: async () => ({
      ok: true,
      status: "passed",
      message: "generated model FOC",
      residuals: ["-2*s_A"],
    }),
    checker: async () => ({
      ok: true,
      status: "passed",
      message: "residuals vanish",
      residuals: ["0"],
    }),
    solveChecker: async () => ({
      ok: true,
      status: "passed",
      message: "candidate matches independent solve",
      solutions: [{ s_A: "0" }],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.decision.action, "review_manually");
  assert.ok(
    result.artifacts.some(
      (artifact) =>
        artifact.kind === "boundary_kkt_check" &&
        artifact.status === "condition_insufficient"
    )
  );
  assert.match(result.issues.join("\n"), /KKT|boundary/i);
});
