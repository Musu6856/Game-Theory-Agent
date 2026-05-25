import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectMathVerificationSummary } from "./math-verification-summary.ts";

test("summarizes project math verification checks and blocking issues", () => {
  const summary = buildProjectMathVerificationSummary({
    hotellingModel: createModel(),
    equilibriumResult: {
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
    propertyAnalyses: [
      {
        id: "wrong-derivative",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=\\frac{3}{q}",
        signCondition: "为正",
        propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
        proofSketch: "对 tau_A^* 求偏导。",
        intuition: "候选偏导写错。",
        warnings: [],
      },
    ],
  });

  assert.equal(summary.status, "failed");
  assert.ok(summary.issueCount >= 1);
  assert.equal(summary.checkCounts.failed > 0, true);
  assert.match(summary.headline, /发现/);
  assert.match(summary.nextAction, /修正数学问题/);
});

test("reports unsupported checks as review-needed instead of failed", () => {
  const summary = buildProjectMathVerificationSummary({
    hotellingModel: createModel(),
    equilibriumResult: {
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
    propertyAnalyses: [
      {
        id: "unsupported",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=\\frac{1}{2\\alpha_B}",
        signCondition: "为正",
        propositionDraft: "命题：买方网络效应增强会提高均衡佣金。",
        proofSketch: "对 tau_A^* 求偏导。",
        intuition: "根号表达式暂不复算。",
        warnings: [],
      },
    ],
  });

  assert.equal(summary.status, "review_needed");
  assert.equal(summary.issueCount, 0);
  assert.equal(summary.checkCounts.manual_review > 0, true);
  assert.match(summary.nextAction, /人工复核/);
});

test("reports condition-insufficient checks as failed release blockers", () => {
  const model = createModel();
  const modelWithoutQSign = {
    ...model,
    symbols: model.symbols.map((symbol) =>
      symbol.symbol === "q" ? { ...symbol, assumption: "unrestricted" } : symbol
    ),
    assumptions: [],
  };
  const summary = buildProjectMathVerificationSummary({
    hotellingModel: modelWithoutQSign,
    equilibriumResult: {
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
    propertyAnalyses: [
      {
        id: "weak-condition",
        target: "tau_A^*",
        parameter: "\\alpha_B",
        operation: "differentiate",
        symbolicResult:
          "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
        signCondition: "为负",
        propositionDraft: "命题：买方网络效应增强会降低均衡佣金。",
        proofSketch: "对 tau_A^* 求偏导。",
        intuition: "候选缺少 q 的符号条件。",
        warnings: [],
      },
    ],
  });

  assert.equal(summary.status, "failed");
  assert.equal(summary.checkCounts.condition_insufficient > 0, true);
  assert.match(summary.headline, /数学复核问题/);
});

function createModel() {
  return {
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
    utilityFunctions: [],
    demandDerivation: "",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "Pi_A = tau_A q",
        notes: "平台利润。",
      },
    ],
    assumptions: ["q > 0"],
    modelSetupDraft: "双边平台模型。",
  };
}
