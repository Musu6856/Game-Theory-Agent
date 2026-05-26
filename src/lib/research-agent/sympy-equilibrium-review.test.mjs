import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { reviewEquilibriumWithSympy } from "./sympy-equilibrium-review.ts";

const hasLocalSympy =
  spawnSync("python", ["-c", "import sympy"], {
    encoding: "utf8",
  }).status === 0;

const simpleProfitModel = {
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

const twoDecisionProfitModel = {
  ...simpleProfitModel,
  symbols: [
    simpleProfitModel.symbols[0],
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
    simpleProfitModel.symbols[1],
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
    simpleProfitModel.profitFunctions[0],
    {
      id: "profit-b",
      platform: "B",
      expression: "alpha_B*tau_B - tau_B^2",
      notes: "safe explicit profit for platform B",
    },
  ],
};

test(
  "SymPy equilibrium review verifies closed forms against explicit FOCs",
  { skip: !hasLocalSympy },
  async () => {
    const result = await reviewEquilibriumWithSympy({
      equilibrium: {
        status: "solved",
        concept: "内点均衡",
        solvingSteps: ["联立 FOC"],
        focs: ["2*tau_A - alpha_B = 0"],
        conditions: ["alpha_B > 0"],
        closedForm: "tau_A^* = alpha_B/2",
        derivation: "由 FOC 解得。",
        code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
        warnings: [],
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
    assert.ok(
      result.checks.some(
        (check) =>
          check.kind === "sympy_execution" && check.status === "passed"
      )
    );
    assert.ok(result.checks.some((check) => /独立求解/.test(check.message)));
  }
);

test(
  "SymPy equilibrium review rejects closed forms that do not satisfy FOCs",
  { skip: !hasLocalSympy },
  async () => {
    const result = await reviewEquilibriumWithSympy({
      equilibrium: {
        status: "solved",
        concept: "错误均衡",
        solvingSteps: ["联立 FOC"],
        focs: ["2*tau_A - alpha_B = 0"],
        conditions: ["alpha_B > 0"],
        closedForm: "tau_A^* = alpha_B/3",
        derivation: "候选闭式解写错。",
        code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
        warnings: [],
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.issues.join("\n"), /SymPy/);
    assert.ok(
      result.checks.some(
        (check) =>
          check.kind === "sympy_execution" && check.status === "failed"
      )
    );
    assert.ok(result.checks.some((check) => /独立求解/.test(check.message)));
  }
);

test("SymPy equilibrium review keeps unsupported FOCs as manual review", async () => {
  const result = await reviewEquilibriumWithSympy({
    equilibrium: {
      status: "solved",
      concept: "一般符号均衡",
      solvingSteps: ["写出利润函数", "对佣金求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^* = alpha_B/q",
      derivation: "FOC 未整理成可直接代入的残差。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    checker: async () => ({
      ok: true,
      status: "manual_review",
      message: "unsupported explicit residual",
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.ok(
    result.checks.some(
      (check) =>
        check.kind === "sympy_execution" &&
        check.status === "manual_review"
    )
  );
});

test("SymPy equilibrium review records skipped math artifacts when executable inputs are unavailable", async () => {
  const result = await reviewEquilibriumWithSympy({
    equilibrium: {
      status: "solved",
      concept: "一般符号均衡",
      solvingSteps: ["写出利润函数", "对佣金求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^* = alpha_B/q",
      derivation: "FOC 未整理成可直接代入的残差。模型资产也没有可编译利润函数。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    now: 1710000000000,
    idPrefix: "test-skipped-artifacts",
  });

  assert.deepEqual(
    result.artifacts.map((artifact) => artifact.kind),
    [
      "compiled_game_system",
      "closed_form_substitutions",
      "foc_residuals",
      "generated_foc_system",
      "sympy_residual_check",
      "solver_attempt",
      "sympy_solve_check",
    ]
  );
  assert.equal(
    result.artifacts.find((artifact) => artifact.kind === "generated_foc_system")
      ?.status,
    "manual_review"
  );
  assert.equal(
    result.artifacts.find((artifact) => artifact.kind === "sympy_residual_check")
      ?.status,
    "manual_review"
  );
  assert.equal(
    result.artifacts.find((artifact) => artifact.kind === "solver_attempt")
      ?.status,
    "manual_review"
  );
  assert.equal(
    result.artifacts.find((artifact) => artifact.kind === "sympy_solve_check")
      ?.status,
    "manual_review"
  );
  assert.match(
    result.artifacts
      .flatMap((artifact) => artifact.issues ?? [])
      .join("\n"),
    /FOC|利润函数|残差|闭式解/
  );
});

test("SymPy equilibrium review returns structured math artifacts", async () => {
  const result = await reviewEquilibriumWithSympy({
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["联立 FOC"],
      focs: ["2*tau_A - alpha_B = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "由 FOC 解得。",
      code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
      warnings: [],
    },
    now: 1710000000000,
    idPrefix: "test-equilibrium",
    checker: async (request) => ({
      ok: true,
      status: "passed",
      message: "residual ok",
      residuals: request.residuals.map(() => "0"),
    }),
    solveChecker: async (request) => ({
      ok: true,
      status: "passed",
      message: "solve ok",
      solutions: [request.candidate],
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.artifacts.map((artifact) => artifact.kind),
    [
      "compiled_game_system",
      "closed_form_substitutions",
      "foc_residuals",
      "generated_foc_system",
      "sympy_residual_check",
      "solver_attempt",
      "sympy_solve_check",
    ]
  );
  assert.deepEqual(
    result.artifacts.find(
      (artifact) => artifact.kind === "closed_form_substitutions"
    )?.output,
    { substitutions: { tau_A: "alpha_B/2" }, variables: ["tau_A"] }
  );
  assert.deepEqual(
    result.artifacts.find((artifact) => artifact.kind === "foc_residuals")
      ?.output,
    { residuals: ["(2*tau_A - alpha_B)-(0)"], source: "candidate_foc" }
  );
  assert.deepEqual(
    result.artifacts.find((artifact) => artifact.kind === "sympy_solve_check")
      ?.output,
    { solutions: [{ tau_A: "alpha_B/2" }] }
  );
});

test("SymPy equilibrium review emits math artifacts incrementally", async () => {
  const emitted = [];
  let sawPreparedArtifactsBeforeResidualCheck = false;

  const result = await reviewEquilibriumWithSympy({
    equilibrium: {
      status: "solved",
      concept: "interior equilibrium",
      solvingSteps: ["Write FOC", "Solve"],
      focs: ["2*tau_A - alpha_B = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "Solve the FOC.",
      code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
      warnings: [],
    },
    now: 1710000000000,
    idPrefix: "test-incremental-artifacts",
    onArtifact: async (artifact) => {
      emitted.push(artifact.kind);
    },
    checker: async (request) => {
      sawPreparedArtifactsBeforeResidualCheck =
        emitted.includes("compiled_game_system") &&
        emitted.includes("closed_form_substitutions") &&
        emitted.includes("foc_residuals") &&
        emitted.includes("generated_foc_system");
      return {
        ok: true,
        status: "passed",
        message: "residual ok",
        residuals: request.residuals.map(() => "0"),
      };
    },
    solveChecker: async (request) => ({
      ok: true,
      status: "passed",
      message: "solve ok",
      solutions: [request.candidate],
    }),
  });

  assert.equal(sawPreparedArtifactsBeforeResidualCheck, true);
  assert.deepEqual(
    emitted,
    result.artifacts.map((artifact) => artifact.kind)
  );
});

test("SymPy equilibrium review records generated model-profit FOC artifacts", async () => {
  const result = await reviewEquilibriumWithSympy({
    model: simpleProfitModel,
    equilibrium: {
      status: "solved",
      concept: "由利润函数复核的内点均衡",
      solvingSteps: ["写出利润函数", "对佣金求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "候选 FOC 文本不可执行，需从利润函数生成 FOC。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    now: 1710000000000,
    idPrefix: "test-generated-foc",
    focGenerationChecker: async (request) => ({
      ok: true,
      status: "passed",
      message: "generated foc",
      residuals: request.objectives.map(
        (objective) => `alpha_B - 2*${objective.variable}`
      ),
    }),
    checker: async (request) => ({
      ok: true,
      status: "passed",
      message: "residual ok",
      residuals: request.residuals.map(() => "0"),
    }),
    solveChecker: async (request) => ({
      ok: true,
      status: "passed",
      message: "solve ok",
      solutions: [request.candidate],
    }),
  });

  const generatedFocArtifact = result.artifacts.find(
    (artifact) => artifact.kind === "generated_foc_system"
  );
  const compiledSystemArtifact = result.artifacts.find(
    (artifact) => artifact.kind === "compiled_game_system"
  );
  const solverAttemptArtifact = result.artifacts.find(
    (artifact) => artifact.kind === "solver_attempt"
  );

  assert.equal(compiledSystemArtifact?.status, "passed");
  assert.equal(generatedFocArtifact?.status, "passed");
  assert.deepEqual(generatedFocArtifact?.output, {
    residuals: ["alpha_B - 2*tau_A"],
    source: "model_profit_functions",
  });
  assert.deepEqual(generatedFocArtifact?.input, {
    objectives: [{ expression: "alpha_B*tau_A - tau_A^2", variable: "tau_A" }],
    compiledSystemId: compiledSystemArtifact?.id,
  });
  assert.deepEqual(solverAttemptArtifact?.input, {
    residuals: ["alpha_B - 2*tau_A"],
    variables: ["tau_A"],
    candidate: { tau_A: "alpha_B/2" },
    residualSource: "model_profit_foc",
  });
});

test("SymPy equilibrium review fails candidates missing model decision variables", async () => {
  let generatedObjectives;
  let solveInput;

  const result = await reviewEquilibriumWithSympy({
    model: twoDecisionProfitModel,
    equilibrium: {
      status: "solved",
      concept: "partial symmetric equilibrium",
      solvingSteps: ["Write profits.", "Solve one FOC."],
      focs: ["2*tau_A - alpha_B = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "Candidate only reports platform A.",
      code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
      warnings: [],
    },
    focGenerationChecker: async (request) => {
      generatedObjectives = request.objectives;
      return {
        ok: true,
        status: "passed",
        message: "generated focs",
        residuals: request.objectives.map(
          (objective) => `alpha_B - 2*${objective.variable}`
        ),
      };
    },
    checker: async (request) => ({
      ok: true,
      status: "passed",
      message: "residual check stubbed",
      residuals: request.residuals.map(() => "0"),
    }),
    solveChecker: async (request) => {
      solveInput = request;
      return {
        ok: true,
        status: "passed",
        message: "solve check stubbed",
        solutions: [{ tau_A: "alpha_B/2", tau_B: "alpha_B/2" }],
      };
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    generatedObjectives?.map((objective) => objective.variable),
    ["tau_A", "tau_B"]
  );
  assert.deepEqual(solveInput?.variables, ["tau_A", "tau_B"]);
  assert.match(result.issues.join("\n"), /tau_B/);
  assert.equal(
    result.artifacts.find(
      (artifact) => artifact.kind === "closed_form_substitutions"
    )?.status,
    "failed"
  );
  assert.deepEqual(
    result.artifacts.find(
      (artifact) => artifact.kind === "closed_form_substitutions"
    )?.output,
    {
      substitutions: { tau_A: "alpha_B/2" },
      variables: ["tau_A", "tau_B"],
      candidateVariables: ["tau_A"],
      missingVariables: ["tau_B"],
    }
  );
});

test("SymPy equilibrium review prefers model-generated FOCs for solver attempts", async () => {
  let residualCheckInput;
  let solveCheckInput;

  await reviewEquilibriumWithSympy({
    model: simpleProfitModel,
    equilibrium: {
      status: "solved",
      concept: "Model-grounded equilibrium",
      solvingSteps: ["Write FOC", "Solve"],
      focs: ["2*tau_A - alpha_B = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "Solve the FOC.",
      code: "sp.solve([2*tau_A-alpha_B], [tau_A])",
      warnings: [],
    },
    focGenerationChecker: async (request) => ({
      ok: true,
      status: "passed",
      message: "generated foc",
      residuals: request.objectives.map(
        (objective) => `alpha_B - 2*${objective.variable}`
      ),
    }),
    checker: async (request) => {
      residualCheckInput = request;
      return {
        ok: true,
        status: "passed",
        message: "residual ok",
        residuals: request.residuals.map(() => "0"),
      };
    },
    solveChecker: async (request) => {
      solveCheckInput = request;
      return {
        ok: true,
        status: "passed",
        message: "solve ok",
        solutions: [request.candidate],
      };
    },
  });

  assert.deepEqual(residualCheckInput?.residuals, ["alpha_B - 2*tau_A"]);
  assert.deepEqual(solveCheckInput?.residuals, ["alpha_B - 2*tau_A"]);
});

test(
  "SymPy equilibrium review derives FOCs from model profits when candidate FOCs are not executable",
  { skip: !hasLocalSympy },
  async () => {
    const result = await reviewEquilibriumWithSympy({
      model: simpleProfitModel,
      equilibrium: {
        status: "solved",
        concept: "由利润函数复核的内点均衡",
        solvingSteps: ["写出利润函数", "对佣金求一阶条件"],
        focs: ["partial Pi_A / partial tau_A = 0"],
        conditions: ["alpha_B > 0"],
        closedForm: "tau_A^* = alpha_B/3",
        derivation: "候选 FOC 文本不可执行，需从利润函数生成 FOC。",
        code: "sp.solve([foc_tau_A], [tau_A])",
        warnings: [],
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.issues.join("\n"), /模型利润函数|FOC|SymPy/);
    assert.ok(
      result.checks.some((check) => /模型利润函数生成 FOC/.test(check.message))
    );
    assert.ok(
      result.checks.some((check) => /alpha_B - 2\*tau_A/.test(check.message))
    );
  }
);
