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
  }
);
