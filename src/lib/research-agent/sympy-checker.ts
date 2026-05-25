import { spawn } from "node:child_process";

import type { MathVerificationCheck } from "./math-verifier.ts";

export type SympyDerivativeCheckRequest = {
  expression: string;
  parameter: string;
  claimedDerivative: string;
  pythonCommand?: string;
  timeoutMs?: number;
  maxInputLength?: number;
};

export type SympyDerivativeCheckResult = {
  ok: boolean;
  status: MathVerificationCheck["status"];
  message: string;
  expected?: string;
  claimed?: string;
  difference?: string;
};

type SympyPayload = {
  expression: string;
  parameter: string;
  claimedDerivative: string;
};

type PythonSympyResult = {
  ok?: boolean;
  expected?: string;
  claimed?: string;
  difference?: string;
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 2500;
const DEFAULT_MAX_INPUT_LENGTH = 1200;
const SAFE_SYMPY_INPUT_PATTERN = /^[A-Za-z0-9_+\-*/().,\s^]+$/;

const SYMPY_DERIVATIVE_SCRIPT = `
import json
import re
import sys

try:
    import sympy as sp
except Exception as exc:
    print(json.dumps({"error": "sympy_import_failed: " + str(exc)}, ensure_ascii=False))
    sys.exit(2)

SAFE_RE = re.compile(r"^[A-Za-z0-9_+\\-*/().,\\s^]+$")

def normalize(value):
    return str(value).replace("^", "**").strip()

def parse_expr(value, local_dict):
    normalized = normalize(value)
    if not SAFE_RE.match(normalized):
        raise ValueError("unsafe expression")
    return sp.sympify(normalized, locals=local_dict)

try:
    payload = json.loads(sys.stdin.read())
    expression_text = normalize(payload["expression"])
    claimed_text = normalize(payload["claimedDerivative"])
    parameter_text = normalize(payload["parameter"])
    combined = " ".join([expression_text, claimed_text, parameter_text])
    names = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", combined))
    names.discard("sqrt")
    local_dict = {name: sp.symbols(name, real=True) for name in names}
    local_dict["sqrt"] = sp.sqrt

    if parameter_text not in local_dict:
        local_dict[parameter_text] = sp.symbols(parameter_text, real=True)

    expression = parse_expr(expression_text, local_dict)
    claimed = parse_expr(claimed_text, local_dict)
    parameter = local_dict[parameter_text]
    expected = sp.simplify(sp.diff(expression, parameter))
    difference = sp.simplify(expected - claimed)

    print(json.dumps({
        "ok": bool(difference == 0),
        "expected": str(expected),
        "claimed": str(claimed),
        "difference": str(difference),
    }, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({"error": str(exc)}, ensure_ascii=False))
    sys.exit(1)
`;

export async function runSympyDerivativeCheck({
  expression,
  parameter,
  claimedDerivative,
  pythonCommand = process.env.PAPERFORGE_SYMPY_PYTHON ?? "python",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxInputLength = DEFAULT_MAX_INPUT_LENGTH,
}: SympyDerivativeCheckRequest): Promise<SympyDerivativeCheckResult> {
  const payload = normalizeSympyPayload({
    expression,
    parameter,
    claimedDerivative,
  });
  const validationError = validatePayload(payload, maxInputLength);
  if (validationError) {
    return {
      ok: true,
      status: "unsupported",
      message: validationError,
    };
  }

  return executeSympyDerivativeScript({
    payload,
    pythonCommand,
    timeoutMs,
  });
}

export function normalizeExpressionForSympy(value: string) {
  let normalized = value
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*")
    .replace(/\\alpha/g, "alpha")
    .replace(/\\beta/g, "beta")
    .replace(/\\delta/g, "delta")
    .replace(/\\tau/g, "tau")
    .replace(/\\mu/g, "mu")
    .replace(/α/g, "alpha")
    .replace(/β/g, "beta")
    .replace(/δ/g, "delta")
    .replace(/τ/g, "tau")
    .replace(/μ/g, "mu")
    .replace(/\^\*/g, "");

  normalized = replaceLatexCommands(normalized);

  return normalized
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceLatexCommands(value: string) {
  let previous = "";
  let normalized = value;

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)");
  }

  return normalized;
}

function normalizeSympyPayload(payload: SympyPayload): SympyPayload {
  return {
    expression: normalizeExpressionForSympy(payload.expression),
    parameter: normalizeExpressionForSympy(payload.parameter),
    claimedDerivative: normalizeExpressionForSympy(payload.claimedDerivative),
  };
}

function validatePayload(payload: SympyPayload, maxInputLength: number) {
  const values = [
    payload.expression,
    payload.parameter,
    payload.claimedDerivative,
  ];

  if (values.some((value) => value.length === 0)) {
    return "SymPy 复算缺少表达式、参数或候选偏导，已转入人工复核。";
  }

  if (values.some((value) => value.length > maxInputLength)) {
    return "SymPy 复算输入过长，已转入人工复核。";
  }

  if (values.some((value) => !SAFE_SYMPY_INPUT_PATTERN.test(value))) {
    return "SymPy 复算输入包含暂不支持的符号，已转入人工复核。";
  }

  return "";
}

function executeSympyDerivativeScript({
  payload,
  pythonCommand,
  timeoutMs,
}: {
  payload: SympyPayload;
  pythonCommand: string;
  timeoutMs: number;
}) {
  return new Promise<SympyDerivativeCheckResult>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timeoutRef: { timer?: ReturnType<typeof setTimeout> } = {};
    const child = spawn(pythonCommand, ["-c", SYMPY_DERIVATIVE_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (result: SympyDerivativeCheckResult) => {
      if (settled) return;
      settled = true;
      if (timeoutRef.timer) clearTimeout(timeoutRef.timer);
      resolve(result);
    };

    timeoutRef.timer = setTimeout(() => {
      child.kill();
      finish({
        ok: true,
        status: "manual_review",
        message: "SymPy 复算超时，已转入人工复核。",
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      finish({
        ok: true,
        status: "manual_review",
        message: `SymPy 运行时不可用，已转入人工复核：${error.message}`,
      });
    });
    child.on("close", (code) => {
      if (settled) return;

      const parsed = parsePythonResult(stdout);
      if (!parsed || parsed.error || code !== 0) {
        finish({
          ok: true,
          status: "manual_review",
          message: `SymPy 复算暂不可用，已转入人工复核：${
            parsed?.error ?? stderr.trim() ?? `退出码 ${code}`
          }`,
        });
        return;
      }

      if (parsed.ok) {
        finish({
          ok: true,
          status: "passed",
          expected: parsed.expected,
          claimed: parsed.claimed,
          difference: parsed.difference,
          message: `SymPy 复算通过：候选偏导与系统复算结果一致，结果为 ${parsed.expected}。`,
        });
        return;
      }

      finish({
        ok: false,
        status: "failed",
        expected: parsed.expected,
        claimed: parsed.claimed,
        difference: parsed.difference,
        message: `SymPy 复算不一致：系统复算结果为 ${parsed.expected}，候选写成 ${parsed.claimed}。`,
      });
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function parsePythonResult(stdout: string): PythonSympyResult | null {
  const text = stdout.trim().split(/\r?\n/).at(-1);
  if (!text) return null;

  try {
    return JSON.parse(text) as PythonSympyResult;
  } catch {
    return null;
  }
}
