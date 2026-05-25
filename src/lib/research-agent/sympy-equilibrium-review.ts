import type { EquilibriumResult } from "../types";
import type {
  MathVerificationCheck,
  MathVerificationResult,
} from "./math-verifier.ts";
import {
  normalizeExpressionForSympy,
  runSympyResidualCheck,
  runSympySolveCheck,
  type SympyResidualCheckRequest,
  type SympyResidualCheckResult,
  type SympySolveCheckRequest,
  type SympySolveCheckResult,
} from "./sympy-checker.ts";

export type SympyResidualChecker = (
  request: SympyResidualCheckRequest
) => Promise<SympyResidualCheckResult>;

export type SympySolveChecker = (
  request: SympySolveCheckRequest
) => Promise<SympySolveCheckResult>;

export async function reviewEquilibriumWithSympy({
  equilibrium,
  checker = runSympyResidualCheck,
  solveChecker = runSympySolveCheck,
}: {
  equilibrium: EquilibriumResult;
  checker?: SympyResidualChecker;
  solveChecker?: SympySolveChecker;
}): Promise<MathVerificationResult> {
  const substitutions = parseClosedFormSubstitutions(equilibrium.closedForm);
  const residuals = parseFocResiduals(equilibrium.focs);
  const variables = Object.keys(substitutions);
  const issues: string[] = [];
  const checks: MathVerificationCheck[] = [];

  if (residuals.length === 0 || Object.keys(substitutions).length === 0) {
    checks.push({
      kind: "sympy_execution",
      status: "manual_review",
      message:
        "均衡候选暂未形成可执行 SymPy FOC 残差复算输入，保留人工复核。",
    });
    return {
      ok: true,
      issues,
      checks,
    };
  }

  const result = await runSingleResidualCheck({
    checker,
    residuals,
    substitutions,
  });
  checks.push({
    kind: "sympy_execution",
    status: result.status,
    message: result.message,
  });

  if (!result.ok) {
    issues.push(result.message);
  }

  const solveResult = await runSingleSolveCheck({
    checker: solveChecker,
    residuals,
    variables,
    candidate: substitutions,
  });
  checks.push({
    kind: "sympy_execution",
    status: solveResult.status,
    message: solveResult.message,
  });

  if (!solveResult.ok) {
    issues.push(solveResult.message);
  }

  return {
    ok: issues.length === 0,
    issues,
    checks,
  };
}

async function runSingleSolveCheck({
  checker,
  residuals,
  variables,
  candidate,
}: {
  checker: SympySolveChecker;
  residuals: string[];
  variables: string[];
  candidate: Record<string, string>;
}) {
  try {
    return await checker({
      residuals,
      variables,
      candidate,
    });
  } catch (error) {
    return {
      ok: true,
      status: "manual_review" as const,
      message: `SymPy 独立求解异常，已转入人工复核：${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

async function runSingleResidualCheck({
  checker,
  residuals,
  substitutions,
}: {
  checker: SympyResidualChecker;
  residuals: string[];
  substitutions: Record<string, string>;
}) {
  try {
    return await checker({
      residuals,
      substitutions,
    });
  } catch (error) {
    return {
      ok: true,
      status: "manual_review" as const,
      message: `SymPy 残差复算异常，已转入人工复核：${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function parseClosedFormSubstitutions(closedForm: string) {
  const substitutions: Record<string, string> = {};

  extractMathSegments(closedForm).forEach((segment) => {
    normalizeExpressionForSympy(segment)
      .split(/[\n;,，。；]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const parts = part.split("=").map((value) => value.trim()).filter(Boolean);
        if (parts.length < 2) return;

        const expression = parts.at(-1);
        if (!expression) return;

        parts.slice(0, -1).forEach((leftHandSide) => {
          const key = normalizeSymbolKey(leftHandSide);
          if (key) substitutions[key] = expression;
        });
      });
  });

  return substitutions;
}

function parseFocResiduals(focs: string[]) {
  return focs
    .map((foc) => normalizeExpressionForSympy(foc))
    .map(parseEquationResidual)
    .filter((value): value is string => Boolean(value));
}

function parseEquationResidual(equation: string) {
  if (/partial|Pi|diff|solve/i.test(equation)) return undefined;

  const parts = equation.split("=").map((value) => value.trim()).filter(Boolean);
  if (parts.length === 1 && isResidualExpression(parts[0])) return parts[0];
  if (parts.length !== 2) return undefined;

  const [left, right] = parts;
  if (!isResidualExpression(left) || !isResidualExpression(right)) {
    return undefined;
  }

  return `(${left})-(${right})`;
}

function isResidualExpression(value: string) {
  return /^[A-Za-z0-9_+\-*/().,\s^]+$/.test(value);
}

function extractMathSegments(value: string) {
  const segments = [...value.matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
  return segments.length > 0 ? segments : [value];
}

function normalizeSymbolKey(value: string) {
  const normalized = normalizeExpressionForSympy(value)
    .replace(/\^.*$/, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .trim();

  return normalized || undefined;
}
