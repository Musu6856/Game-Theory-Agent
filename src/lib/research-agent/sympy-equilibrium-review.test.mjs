import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { reviewEquilibriumWithSympy } from "./sympy-equilibrium-review.ts";

const hasLocalSympy =
  spawnSync("python", ["-c", "import sympy"], {
    encoding: "utf8",
  }).status === 0;

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
