import assert from "node:assert/strict";
import test from "node:test";

import {
  verifyEquilibriumMathConsistency,
  verifyPropertyAnalysisMathConsistency,
} from "./math-verifier.ts";

const model = {
  symbols: [
    {
      id: "tau_A",
      symbol: "tau_A",
      baseSymbol: "tau",
      subscript: "A",
      codeName: "tau_A",
      name: "A 平台佣金",
      meaning: "平台 A 的卖家佣金率。",
      role: "parameter",
      side: "platform",
      assumption: "positive",
      recommended: true,
    },
    {
      id: "alpha_B",
      symbol: "alpha_B",
      baseSymbol: "alpha",
      subscript: "B",
      codeName: "alpha_B",
      name: "买方网络效应",
      meaning: "卖方参与对买方效用的影响。",
      role: "parameter",
      side: "consumer",
      assumption: "nonnegative",
      recommended: true,
    },
    {
      id: "q",
      symbol: "q",
      baseSymbol: "q",
      codeName: "q",
      name: "成交价值",
      meaning: "单位交易价值。",
      role: "parameter",
      side: "global",
      assumption: "positive",
      recommended: true,
    },
  ],
  sides: {
    consumerSideName: "买家",
    merchantSideName: "卖家",
  },
  platforms: ["A", "B"],
  timing: [],
  utilityFunctions: [
    {
      id: "u-buyer-a",
      side: "consumer",
      platform: "A",
      expression: "U_A^B = v_B + alpha_B n_A^S - t_B x",
      notes: "买方效用。",
    },
  ],
  demandDerivation: "由无差异条件得到 n_A^B。",
  profitFunctions: [
    {
      id: "profit-a",
      platform: "A",
      expression: "Pi_A = tau_A q n_A^S n_A^B",
      notes: "平台利润。",
    },
  ],
  assumptions: ["q > 0"],
  modelSetupDraft: "双边平台模型。",
};

test("equilibrium math verifier accepts symbols grounded in the model", () => {
  const result = verifyEquilibriumMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^* = alpha_B / q",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "foc_A = sp.diff(Pi_A, tau_A)\nsp.solve([foc_A], [tau_A])",
      warnings: [],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(
    result.checks.map((check) => check.status),
    ["passed"]
  );
});

test("equilibrium math verifier matches generated scaffold aliases to model symbols", () => {
  const mechanismModel = {
    ...model,
    symbols: [
      ...model.symbols,
      {
        id: "mu_d1",
        symbol: "mu_d1",
        baseSymbol: "mu",
        subscript: "d1",
        codeName: "mu_d1",
        name: "d1 mechanism multiplier",
        meaning: "Auxiliary mechanism variable in the generated model.",
        role: "parameter",
        side: "global",
        assumption: "nonnegative",
        recommended: true,
      },
    ],
    timing: [
      {
        stage: 1,
        actor: "platform",
        decisions: ["tau_A", "mu_d1"],
      },
    ],
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "Pi_A = tau_A * q - mu_d1",
        notes: "Generated model profit expression.",
      },
    ],
  };

  const result = verifyEquilibriumMathConsistency({
    model: mechanismModel,
    equilibrium: {
      status: "needs_revision",
      concept: "model-grounded scaffold",
      solvingSteps: ["Use current decisions tau_a and \\mu_{d1}."],
      focs: ["partial Pi_A / partial tau_a = 0"],
      conditions: ["q > 0", "\\mu_{d1} >= 0"],
      closedForm: "Current model-bound equilibrium scaffold.",
      derivation: "The scaffold references tau_a and \\mu_{d1} from the model.",
      code: "sp.solve([foc_tau_a], [tau_a, mu_d1])",
      warnings: [],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("equilibrium math verifier accepts generic platform-indexed notation", () => {
  const platformIndexedModel = {
    ...model,
    symbols: [
      ...model.symbols,
      {
        id: "tau_B",
        symbol: "tau_B",
        baseSymbol: "tau",
        subscript: "B",
        codeName: "tau_B",
        name: "B platform commission",
        meaning: "Platform B commission.",
        role: "decision",
        side: "platform",
        assumption: "real",
        recommended: true,
      },
      {
        id: "s_A",
        symbol: "s_A",
        baseSymbol: "s",
        subscript: "A",
        codeName: "s_A",
        name: "A buyer subsidy",
        meaning: "Platform A buyer subsidy.",
        role: "decision",
        side: "platform",
        assumption: "real",
        recommended: true,
      },
      {
        id: "s_B",
        symbol: "s_B",
        baseSymbol: "s",
        subscript: "B",
        codeName: "s_B",
        name: "B buyer subsidy",
        meaning: "Platform B buyer subsidy.",
        role: "decision",
        side: "platform",
        assumption: "real",
        recommended: true,
      },
    ],
    timing: [
      {
        stage: 1,
        actor: "platform",
        decisions: ["tau_A", "tau_B", "s_A", "s_B"],
      },
    ],
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "Pi_A = tau_A * q - s_A",
        notes: "Platform A profit.",
      },
      {
        id: "profit-b",
        platform: "B",
        expression: "Pi_B = tau_B * q - s_B",
        notes: "Platform B profit.",
      },
    ],
  };

  const result = verifyEquilibriumMathConsistency({
    model: platformIndexedModel,
    equilibrium: {
      status: "solved",
      concept: "symmetric equilibrium",
      solvingSteps: ["Solve the platform i problem for tau_i and s_i."],
      focs: [
        "\\frac{\\partial \\Pi_i}{\\partial \\tau_i}=0",
        "\\frac{\\partial \\Pi_i}{\\partial s_i}=0",
      ],
      conditions: ["q > 0"],
      closedForm: "\\tau_i^*=\\frac{q}{2}, s_i^*=\\frac{q}{4}",
      derivation: "The symmetric solution is written with generic platform index i.",
      code: "sp.solve([foc_tau_i, foc_s_i], [tau_i, s_i])",
      warnings: [],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("equilibrium math verifier rejects ungrounded variables", () => {
  const result = verifyEquilibriumMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 p_A 求一阶条件"],
      focs: ["partial Pi_A / partial p_A = 0"],
      conditions: ["q > 0"],
      closedForm: "p_A^* = beta_X / q",
      derivation: "由 FOC 得到 p_A^*。",
      code: "sp.solve([foc_p_A], [p_A])",
      warnings: [],
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /p_A/);
  assert.match(result.issues.join("\n"), /beta_X/);
  assert.equal(result.checks[0]?.status, "failed");
  assert.equal(result.checks[0]?.kind, "symbol_grounding");
});

test("property math verifier rejects target and parameter outside model and equilibrium context", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^* = alpha_B / q",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "unknown-price-effect",
        target: "p_A^*",
        parameter: "beta_X",
        operation: "differentiate",
        symbolicResult: "partial p_A^* / partial beta_X = 1/q",
        signCondition: "q>0 时为正",
        propositionDraft: "命题：外部参数提高均衡价格。",
        proofSketch: "对 p_A^* 关于 beta_X 求导。",
        intuition: "外部参数提高价格。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /第 1 条/);
  assert.match(result.issues.join("\n"), /p_A/);
  assert.match(result.issues.join("\n"), /beta_X/);
});

test("property math verifier rejects a supported derivative that disagrees with the equilibrium closed form", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^* = alpha_B / q",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "wrong-buyer-network-effect",
        target: "tau_A^*",
        parameter: "alpha_B",
        operation: "differentiate",
        symbolicResult: "partial tau_A^* / partial alpha_B = 2/q",
        signCondition: "q>0 时为正",
        propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
        proofSketch: "对 tau_A^* 关于 alpha_B 求导。",
        intuition: "方向错误的候选。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /偏导复算/);
  assert.match(result.issues.join("\n"), /1\/q/);
  assert.match(result.issues.join("\n"), /2\/q/);
});

test("property math verifier accepts equivalent derivatives with explicit multiplication", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^* = 2 * alpha_B / q",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "buyer-network-effect",
        target: "tau_A^*",
        parameter: "alpha_B",
        operation: "differentiate",
        symbolicResult: "partial tau_A^* / partial alpha_B = 2/q",
        signCondition: "q>0 时为正",
        propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
        proofSketch: "对 tau_A^* 关于 alpha_B 求导。",
        intuition: "方向正确的候选。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("property math verifier accepts derivatives from a simple LaTeX fraction", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^*=\\frac{t_S-2\\alpha_B}{q}",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "buyer-network-effect",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
        signCondition: "q>0 时为负",
        propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
        proofSketch: "对 tau_A^* 关于 alpha_B 求导。",
        intuition: "方向正确的候选。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("property math verifier rejects wrong derivatives from a simple LaTeX fraction", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^*=\\frac{t_S-2\\alpha_B}{q}",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "wrong-buyer-network-effect",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=-\\frac{1}{q}",
        signCondition: "q>0 时为负",
        propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
        proofSketch: "对 tau_A^* 关于 alpha_B 求导。",
        intuition: "方向错误的候选。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /偏导复算/);
  assert.match(result.issues.join("\n"), /2\/q/);
  assert.match(result.issues.join("\n"), /1\/q/);
});

test("property math verifier reads chained equations inside markdown math", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm:
        "在对称内部均衡中：$\\tau_A^*=\\tau_B^*=\\frac{t_S-2\\alpha_B}{q}$。",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "buyer-network-effect",
        target: "\\tau_B^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_B^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
        signCondition: "q>0 时为负",
        propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
        proofSketch: "对 tau_B^* 关于 alpha_B 求导。",
        intuition: "方向正确的候选。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("property math verifier rejects a sign condition that contradicts a recomputed derivative", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^*=\\frac{t_S-2\\alpha_B}{q}",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "wrong-sign-condition",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
        signCondition: "q>0 时为正",
        propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
        proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        intuition: "方向写反的候选。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /符号条件/);
  assert.match(result.issues.join("\n"), /应为负/);
  assert.match(result.issues.join("\n"), /写成正/);
});

test("property math verifier accepts a zero sign condition for a recomputed zero derivative", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^*=2/q",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "zero-sign-condition",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=0",
        signCondition: "恒为零",
        propositionDraft: "命题：买方网络效应不改变均衡佣金。",
        proofSketch: "闭式解不含 alpha_B，因此偏导为零。",
        intuition: "参数未进入该闭式解。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("property math verifier rejects a directional sign claim without required parameter sign conditions", () => {
  const modelWithoutQSign = {
    ...model,
    symbols: model.symbols.map((symbol) =>
      symbol.symbol === "q" ? { ...symbol, assumption: "unrestricted" } : symbol
    ),
    assumptions: [],
  };
  const result = verifyPropertyAnalysisMathConsistency({
    model: modelWithoutQSign,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: [],
      closedForm: "tau_A^*=-2*alpha_B/q",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "weak-sign-condition",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
        signCondition: "为负",
        propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
        proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        intuition: "候选直接声称方向，但没有说明 q 的符号。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /条件不足/);
  assert.match(result.issues.join("\n"), /q/);
  assert.ok(
    result.checks.some(
      (check) =>
        check.kind === "sign_condition" &&
        check.status === "condition_insufficient"
    )
  );
});

test("property math verifier routes implicit systems to manual review", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "symbolic_failure",
      concept: "隐式系统",
      solvingSteps: ["列出一阶条件 F(z, theta)=0"],
      focs: ["F(tau_A, alpha_B)=0"],
      conditions: ["det J != 0"],
      closedForm: "F(tau_A, alpha_B)=0",
      derivation: "当前只有隐式方程，没有 tau_A 的显式闭式解。",
      code: "F = sp.Function('F')",
      warnings: ["implicit system"],
    },
    analyses: [
      {
        id: "implicit-comparative-static",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=-F_{\\alpha}/F_{\\tau}",
        signCondition: "需要人工判断",
        propositionDraft: "命题：隐式系统下买方网络效应改变佣金。",
        proofSketch: "由隐函数定理得到符号方向。",
        intuition: "隐式系统需要额外条件。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.ok(
    result.checks.some(
      (check) =>
        check.kind === "calculus_recheck" &&
        check.status === "manual_review"
    )
  );
});

test("property math verifier reports passed calculus checks for supported derivatives", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^*=2*alpha_B/q",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "supported-derivative",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=\\frac{2}{q}",
        signCondition: "为正",
        propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
        proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        intuition: "q 为正时偏导为正。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.ok(
    result.checks.some(
      (check) =>
        check.kind === "calculus_recheck" && check.status === "passed"
    )
  );
});

test("property math verifier reports unsupported calculus checks without blocking", () => {
  const result = verifyPropertyAnalysisMathConsistency({
    model,
    equilibrium: {
      status: "solved",
      concept: "内点均衡",
      solvingSteps: ["对 tau_A 求一阶条件"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["q > 0"],
      closedForm: "tau_A^*=sqrt(alpha_B)",
      derivation: "由 FOC 得到 tau_A^*。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
    analyses: [
      {
        id: "unsupported-derivative",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=\\frac{1}{2\\alpha_B}",
        signCondition: "为正",
        propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
        proofSketch: "对 tau_A^* 关于 alpha_B 求偏导。",
        intuition: "候选使用根号表达式。",
        warnings: [],
      },
    ],
  });

  assert.equal(result.ok, true);
  assert.ok(
    result.checks.some(
      (check) =>
        check.kind === "calculus_recheck" &&
        check.status === "manual_review"
    )
  );
});
