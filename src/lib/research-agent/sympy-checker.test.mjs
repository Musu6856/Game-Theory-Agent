import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

import {
  runSympyDerivativeCheck,
  runSympySolveCheck,
} from "./sympy-checker.ts";
import * as sympyChecker from "./sympy-checker.ts";

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

test(
  "SymPy checker independently solves explicit FOCs and matches the candidate",
  { skip: !hasLocalSympy },
  async () => {
    const result = await runSympySolveCheck({
      residuals: ["2*tau_A - alpha_B"],
      variables: ["tau_A"],
      candidate: { tau_A: "alpha_B/2" },
      timeoutMs: 5000,
    });

    assert.equal(result.status, "passed");
    assert.equal(result.ok, true);
    assert.match(result.message, /独立求解/);
    assert.match(JSON.stringify(result.solutions), /alpha_B\/2/);
  }
);

test(
  "SymPy checker rejects a candidate that differs from the independent solution",
  { skip: !hasLocalSympy },
  async () => {
    const result = await runSympySolveCheck({
      residuals: ["2*tau_A - alpha_B"],
      variables: ["tau_A"],
      candidate: { tau_A: "alpha_B/3" },
      timeoutMs: 5000,
    });

    assert.equal(result.status, "failed");
    assert.equal(result.ok, false);
    assert.match(result.message, /独立求解/);
    assert.match(JSON.stringify(result.solutions), /alpha_B\/2/);
  }
);

test(
  "SymPy checker generates explicit FOC residuals from safe objective expressions",
  { skip: !hasLocalSympy },
  async () => {
    assert.equal(typeof sympyChecker.runSympyFocGenerationCheck, "function");

    const result = await sympyChecker.runSympyFocGenerationCheck({
      objectives: [
        {
          expression: "alpha_B*tau_A - tau_A^2",
          variable: "tau_A",
        },
      ],
      timeoutMs: 5000,
    });

    assert.equal(result.status, "passed");
    assert.equal(result.ok, true);
    assert.deepEqual(result.residuals, ["alpha_B - 2*tau_A"]);
    assert.match(result.message, /FOC/);
  }
);
