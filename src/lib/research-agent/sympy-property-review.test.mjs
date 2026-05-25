import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { reviewPropertyAnalysesWithSympy } from "./sympy-property-review.ts";

const hasLocalSympy =
  spawnSync("python", ["-c", "import sympy"], {
    encoding: "utf8",
  }).status === 0;

const equilibrium = {
  status: "solved",
  concept: "内点均衡",
  solvingSteps: ["联立一阶条件"],
  focs: ["partial Pi_A / partial tau_A = 0"],
  conditions: ["alpha_B > 0"],
  closedForm: "tau_A^*=sqrt(alpha_B)",
  derivation: "SymPy 可复算该比较静态。",
  code: "import sympy as sp",
  warnings: [],
};

test(
  "SymPy property review catches wrong derivatives outside the bounded verifier",
  { skip: !hasLocalSympy },
  async () => {
    const result = await reviewPropertyAnalysesWithSympy({
      equilibrium,
      analyses: [
        {
          id: "sqrt-wrong",
          target: "tau_A^*",
          parameter: "alpha_B",
          operation: "differentiate",
          symbolicResult: "partial tau_A^* / partial alpha_B = 1/(3*sqrt(alpha_B))",
          signCondition: "alpha_B > 0 时为正",
          propositionDraft: "命题：网络效应提高佣金。",
          proofSketch: "对闭式解求偏导。",
          intuition: "根号表达式的边际效应递减。",
          warnings: [],
        },
      ],
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

test("SymPy property review does not block when the runtime is unavailable", async () => {
  const result = await reviewPropertyAnalysesWithSympy({
    equilibrium,
    checker: async () => ({
      status: "manual_review",
      ok: true,
      message: "SymPy runtime unavailable.",
    }),
    analyses: [
      {
        id: "sqrt-runtime-unavailable",
        target: "tau_A^*",
        parameter: "alpha_B",
        operation: "differentiate",
        symbolicResult: "partial tau_A^* / partial alpha_B = 1/(3*sqrt(alpha_B))",
        signCondition: "alpha_B > 0 时为正",
        propositionDraft: "命题：网络效应提高佣金。",
        proofSketch: "对闭式解求偏导。",
        intuition: "运行时不可用时应交给人工复核。",
        warnings: [],
      },
    ],
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
