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

export type SympyResidualCheckRequest = {
  residuals: string[];
  substitutions: Record<string, string>;
  pythonCommand?: string;
  timeoutMs?: number;
  maxInputLength?: number;
};

export type SympyResidualCheckResult = {
  ok: boolean;
  status: MathVerificationCheck["status"];
  message: string;
  residuals?: string[];
};

export type SympySolveCheckRequest = {
  residuals: string[];
  variables: string[];
  candidate: Record<string, string>;
  pythonCommand?: string;
  timeoutMs?: number;
  maxInputLength?: number;
};

export type SympySolveCheckResult = {
  ok: boolean;
  status: MathVerificationCheck["status"];
  message: string;
  solutions?: Array<Record<string, string>>;
};

type SympyPayload = {
  expression: string;
  parameter: string;
  claimedDerivative: string;
};

type SympyResidualPayload = {
  residuals: string[];
  substitutions: Record<string, string>;
};

type SympySolvePayload = {
  residuals: string[];
  variables: string[];
  candidate: Record<string, string>;
};

type PythonSympyResult = {
  ok?: boolean;
  expected?: string;
  claimed?: string;
  difference?: string;
  residuals?: string[];
  solutions?: Array<Record<string, string>>;
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

const SYMPY_RESIDUAL_SCRIPT = `
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
    residual_texts = [normalize(value) for value in payload.get("residuals", [])]
    substitutions_text = {
        normalize(key): normalize(value)
        for key, value in payload.get("substitutions", {}).items()
    }
    combined = " ".join(
        residual_texts + list(substitutions_text.keys()) + list(substitutions_text.values())
    )
    names = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", combined))
    names.discard("sqrt")
    local_dict = {name: sp.symbols(name, real=True) for name in names}
    local_dict["sqrt"] = sp.sqrt

    substitutions = {
        local_dict[name]: parse_expr(value, local_dict)
        for name, value in substitutions_text.items()
        if name in local_dict
    }
    residuals = []
    ok = True
    for residual_text in residual_texts:
        residual = sp.simplify(parse_expr(residual_text, local_dict).subs(substitutions))
        residuals.append(str(residual))
        if residual != 0:
            ok = False

    print(json.dumps({"ok": bool(ok), "residuals": residuals}, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({"error": str(exc)}, ensure_ascii=False))
    sys.exit(1)
`;

const SYMPY_SOLVE_SCRIPT = `
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
    residual_texts = [normalize(value) for value in payload.get("residuals", [])]
    variable_names = [normalize(value) for value in payload.get("variables", [])]
    candidate_text = {
        normalize(key): normalize(value)
        for key, value in payload.get("candidate", {}).items()
    }
    combined = " ".join(
        residual_texts + variable_names + list(candidate_text.keys()) + list(candidate_text.values())
    )
    names = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", combined))
    names.discard("sqrt")
    local_dict = {name: sp.symbols(name, real=True) for name in names}
    local_dict["sqrt"] = sp.sqrt

    residuals = [parse_expr(value, local_dict) for value in residual_texts]
    variables = [local_dict[name] for name in variable_names if name in local_dict]
    candidate = {
        local_dict[name]: parse_expr(value, local_dict)
        for name, value in candidate_text.items()
        if name in local_dict
    }
    solutions = sp.solve(residuals, variables, dict=True, simplify=True)
    serialized = [
        {str(symbol): str(sp.simplify(value)) for symbol, value in solution.items()}
        for solution in solutions
    ]
    matched = False
    for solution in solutions:
        if all(symbol in solution and sp.simplify(solution[symbol] - value) == 0 for symbol, value in candidate.items()):
            matched = True
            break

    print(json.dumps({"ok": bool(matched), "solutions": serialized}, ensure_ascii=False))
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

export async function runSympyResidualCheck({
  residuals,
  substitutions,
  pythonCommand = process.env.PAPERFORGE_SYMPY_PYTHON ?? "python",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxInputLength = DEFAULT_MAX_INPUT_LENGTH,
}: SympyResidualCheckRequest): Promise<SympyResidualCheckResult> {
  const payload = normalizeResidualPayload({
    residuals,
    substitutions,
  });
  const validationError = validateResidualPayload(payload, maxInputLength);
  if (validationError) {
    return {
      ok: true,
      status: "unsupported",
      message: validationError,
    };
  }

  return executeSympyResidualScript({
    payload,
    pythonCommand,
    timeoutMs,
  });
}

export async function runSympySolveCheck({
  residuals,
  variables,
  candidate,
  pythonCommand = process.env.PAPERFORGE_SYMPY_PYTHON ?? "python",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxInputLength = DEFAULT_MAX_INPUT_LENGTH,
}: SympySolveCheckRequest): Promise<SympySolveCheckResult> {
  const payload = normalizeSolvePayload({
    residuals,
    variables,
    candidate,
  });
  const validationError = validateSolvePayload(payload, maxInputLength);
  if (validationError) {
    return {
      ok: true,
      status: "unsupported",
      message: validationError,
    };
  }

  return executeSympySolveScript({
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

function normalizeResidualPayload(
  payload: SympyResidualPayload
): SympyResidualPayload {
  return {
    residuals: payload.residuals.map(normalizeExpressionForSympy),
    substitutions: Object.fromEntries(
      Object.entries(payload.substitutions).map(([key, value]) => [
        normalizeExpressionForSympy(key),
        normalizeExpressionForSympy(value),
      ])
    ),
  };
}

function normalizeSolvePayload(payload: SympySolvePayload): SympySolvePayload {
  return {
    residuals: payload.residuals.map(normalizeExpressionForSympy),
    variables: payload.variables.map(normalizeExpressionForSympy),
    candidate: Object.fromEntries(
      Object.entries(payload.candidate).map(([key, value]) => [
        normalizeExpressionForSympy(key),
        normalizeExpressionForSympy(value),
      ])
    ),
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

function validateResidualPayload(
  payload: SympyResidualPayload,
  maxInputLength: number
) {
  const values = [
    ...payload.residuals,
    ...Object.keys(payload.substitutions),
    ...Object.values(payload.substitutions),
  ];

  if (
    payload.residuals.length === 0 ||
    Object.keys(payload.substitutions).length === 0 ||
    values.some((value) => value.length === 0)
  ) {
    return "SymPy 残差复算缺少 FOC 残差或闭式解代入项，已转入人工复核。";
  }

  if (values.some((value) => value.length > maxInputLength)) {
    return "SymPy 残差复算输入过长，已转入人工复核。";
  }

  if (values.some((value) => !SAFE_SYMPY_INPUT_PATTERN.test(value))) {
    return "SymPy 残差复算输入包含暂不支持的符号，已转入人工复核。";
  }

  return "";
}

function validateSolvePayload(payload: SympySolvePayload, maxInputLength: number) {
  const values = [
    ...payload.residuals,
    ...payload.variables,
    ...Object.keys(payload.candidate),
    ...Object.values(payload.candidate),
  ];

  if (
    payload.residuals.length === 0 ||
    payload.variables.length === 0 ||
    Object.keys(payload.candidate).length === 0 ||
    values.some((value) => value.length === 0)
  ) {
    return "SymPy 独立求解缺少 FOC、变量或候选闭式解，已转入人工复核。";
  }

  if (values.some((value) => value.length > maxInputLength)) {
    return "SymPy 独立求解输入过长，已转入人工复核。";
  }

  if (values.some((value) => !SAFE_SYMPY_INPUT_PATTERN.test(value))) {
    return "SymPy 独立求解输入包含暂不支持的符号，已转入人工复核。";
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

function executeSympyResidualScript({
  payload,
  pythonCommand,
  timeoutMs,
}: {
  payload: SympyResidualPayload;
  pythonCommand: string;
  timeoutMs: number;
}) {
  return new Promise<SympyResidualCheckResult>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timeoutRef: { timer?: ReturnType<typeof setTimeout> } = {};
    const child = spawn(pythonCommand, ["-c", SYMPY_RESIDUAL_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (result: SympyResidualCheckResult) => {
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
        message: "SymPy 残差复算超时，已转入人工复核。",
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
          message: `SymPy 残差复算暂不可用，已转入人工复核：${
            parsed?.error ?? stderr.trim() ?? `退出码 ${code}`
          }`,
        });
        return;
      }

      if (parsed.ok) {
        finish({
          ok: true,
          status: "passed",
          residuals: parsed.residuals,
          message: "SymPy 残差复算通过：闭式解代回可执行 FOC 后残差为 0。",
        });
        return;
      }

      finish({
        ok: false,
        status: "failed",
        residuals: parsed.residuals,
        message: `SymPy 残差复算不一致：闭式解代回 FOC 后残差为 ${(parsed.residuals ?? []).join("、")}。`,
      });
    });

    child.stdin.end(JSON.stringify(payload));
  });
}

function executeSympySolveScript({
  payload,
  pythonCommand,
  timeoutMs,
}: {
  payload: SympySolvePayload;
  pythonCommand: string;
  timeoutMs: number;
}) {
  return new Promise<SympySolveCheckResult>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const timeoutRef: { timer?: ReturnType<typeof setTimeout> } = {};
    const child = spawn(pythonCommand, ["-c", SYMPY_SOLVE_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (result: SympySolveCheckResult) => {
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
        message: "SymPy 独立求解超时，已转入人工复核。",
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
          message: `SymPy 独立求解暂不可用，已转入人工复核：${
            parsed?.error ?? stderr.trim() ?? `退出码 ${code}`
          }`,
        });
        return;
      }

      if (parsed.ok) {
        finish({
          ok: true,
          status: "passed",
          solutions: parsed.solutions,
          message: "SymPy 独立求解通过：候选闭式解与系统求解结果一致。",
        });
        return;
      }

      finish({
        ok: false,
        status: "failed",
        solutions: parsed.solutions,
        message: `SymPy 独立求解不一致：系统求得 ${JSON.stringify(parsed.solutions ?? [])}，候选闭式解未匹配。`,
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
