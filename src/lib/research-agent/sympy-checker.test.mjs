import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import { runSympyDerivativeCheck } from "./sympy-checker.ts";

const hasLocalSympy =
  spawnSync("python", ["-c", "import sympy"], {
    encoding: "utf8",
  }).status === 0;

test(
  "SymPy checker verifies a derivative that the bounded JS verifier cannot handle",
  { skip: !hasLocalSympy },
  async () => {
    const result = await runSympyDerivativeCheck({
      expression: "sqrt(alpha_B)",
      parameter: "alpha_B",
      claimedDerivative: "1/(2*sqrt(alpha_B))",
      timeoutMs: 5000,
    });

    assert.equal(result.status, "passed");
    assert.equal(result.ok, true);
    assert.match(result.expected ?? "", /sqrt/);
  }
);

test(
  "SymPy checker rejects an incorrect derivative for a supported expression",
  { skip: !hasLocalSympy },
  async () => {
    const result = await runSympyDerivativeCheck({
      expression: "sqrt(alpha_B)",
      parameter: "alpha_B",
      claimedDerivative: "1/(3*sqrt(alpha_B))",
      timeoutMs: 5000,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.ok, false);
    assert.match(result.message, /SymPy/);
    assert.match(result.expected ?? "", /sqrt/);
  }
);

test("SymPy checker degrades to manual review when Python is unavailable", async () => {
  const result = await runSympyDerivativeCheck({
    expression: "sqrt(alpha_B)",
    parameter: "alpha_B",
    claimedDerivative: "1/(2*sqrt(alpha_B))",
    pythonCommand: "paperforge-python-command-that-does-not-exist",
    timeoutMs: 1000,
  });

  assert.equal(result.status, "manual_review");
  assert.equal(result.ok, true);
  assert.match(result.message, /不可用|unavailable|无法启动/i);
});
