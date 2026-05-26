import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectMathVerificationSummary,
  getMathVerificationActionHints,
  selectMathVerificationPanelChecks,
} from "./math-verification-summary.ts";

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

test("explains actionable next steps for failed and manual-review math states", () => {
  const failedHints = getMathVerificationActionHints({
    status: "failed",
    checkCounts: {
      passed: 1,
      failed: 1,
      condition_insufficient: 1,
      unsupported: 0,
      manual_review: 0,
    },
  });
  const manualReviewHints = getMathVerificationActionHints({
    status: "review_needed",
    checkCounts: {
      passed: 2,
      failed: 0,
      condition_insufficient: 0,
      unsupported: 1,
      manual_review: 1,
    },
  });

  assert.ok(failedHints.some((hint) => /需修正/.test(hint.title)));
  assert.ok(failedHints.some((hint) => /回到模型、均衡或性质分析/.test(hint.body)));
  assert.ok(failedHints.some((hint) => /修改建议/.test(hint.body)));
  assert.ok(manualReviewHints.some((hint) => /人工复核/.test(hint.title)));
  assert.ok(manualReviewHints.some((hint) => /展开/.test(hint.body)));
  assert.ok(manualReviewHints.some((hint) => /继续推进/.test(hint.body)));
});

test("includes persisted async SymPy checks in the project summary", () => {
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
    propertyAnalyses: [],
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
      },
      mathVerificationChecks: [
        {
          kind: "sympy_execution",
          status: "passed",
          message:
            "SymPy 模型利润函数生成 FOC 通过：得到 1 条可执行残差：alpha_B - 2*tau_A。",
        },
      ],
    },
  });

  assert.equal(summary.checkCounts.passed > 1, true);
  assert.ok(
    summary.checks.some((check) =>
      /alpha_B - 2\*tau_A/.test(check.message)
    )
  );
});

test("summarizes persisted manual-review checks as visible review work", () => {
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
    propertyAnalyses: [],
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
      },
      mathVerificationChecks: [
        {
          kind: "sympy_execution",
          status: "manual_review",
          message: "SymPy 独立求解暂不支持该系统，保留人工复核。",
        },
      ],
    },
  });

  assert.equal(summary.status, "review_needed");
  assert.equal(summary.checkCounts.manual_review, 1);
  assert.ok(
    selectMathVerificationPanelChecks(summary, { compact: false }).some(
      (check) => /人工复核/.test(check.message)
    )
  );
});

test("selects passed SymPy execution checks for the visible math panel", () => {
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
    propertyAnalyses: [],
    researchSession: {
      phase: "equilibrium",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
      },
      mathVerificationChecks: [
        {
          kind: "sympy_execution",
          status: "passed",
          message:
            "SymPy 残差复算通过：闭式解代回可执行 FOC 后残差为 0。",
        },
        {
          kind: "symbol_grounding",
          status: "passed",
          message: "普通符号来源检查通过。",
        },
      ],
    },
  });

  const visible = selectMathVerificationPanelChecks(summary, {
    compact: false,
  });

  assert.equal(visible.length, 1);
  assert.match(visible[0].message, /SymPy 残差复算通过/);
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
