import type {
  EquilibriumResult,
  PropertyAnalysis,
} from "../types";
import type {
  MathVerificationCheck,
  MathVerificationResult,
} from "./math-verifier.ts";
import {
  normalizeExpressionForSympy,
  runSympyDerivativeCheck,
  type SympyDerivativeCheckRequest,
  type SympyDerivativeCheckResult,
} from "./sympy-checker.ts";

export type SympyDerivativeChecker = (
  request: SympyDerivativeCheckRequest
) => Promise<SympyDerivativeCheckResult>;

export async function reviewPropertyAnalysesWithSympy({
  equilibrium,
  analyses,
  onlyAnalysisIndexes,
  checker = runSympyDerivativeCheck,
}: {
  equilibrium?: EquilibriumResult;
  analyses: PropertyAnalysis[];
  onlyAnalysisIndexes?: Iterable<number>;
  checker?: SympyDerivativeChecker;
}): Promise<MathVerificationResult> {
  const closedFormEquations = parseClosedFormEquationsForSympy(
    equilibrium?.closedForm ?? ""
  );
  const enabledIndexes = onlyAnalysisIndexes
    ? new Set(onlyAnalysisIndexes)
    : undefined;
  const issues: string[] = [];
  const checks: MathVerificationCheck[] = [];

  for (const [index, analysis] of analyses.entries()) {
    if (enabledIndexes && !enabledIndexes.has(index)) continue;
    if (analysis.operation !== "differentiate") continue;

    const target = normalizeSymbolKey(analysis.target);
    const parameter = normalizeSymbolKey(analysis.parameter);
    const targetExpression = target ? closedFormEquations.get(target) : undefined;
    const claimedDerivative = parseClaimedDerivativeForSympy(
      analysis.symbolicResult
    );

    if (!target || !parameter || !targetExpression || !claimedDerivative) {
      checks.push({
        kind: "sympy_execution",
        status: "manual_review",
        analysisId: analysis.id,
        analysisIndex: index,
        message: `第 ${index + 1} 条性质分析暂未形成可执行 SymPy 复算输入，保留人工复核。`,
      });
      continue;
    }

    const result = await runSingleSympyCheck({
      checker,
      expression: targetExpression,
      parameter,
      claimedDerivative,
    });

    const message = `第 ${index + 1} 条性质分析：${result.message}`;
    checks.push({
      kind: "sympy_execution",
      status: result.status,
      analysisId: analysis.id,
      analysisIndex: index,
      message,
    });

    if (!result.ok) {
      issues.push(message);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    checks,
  };
}

async function runSingleSympyCheck({
  checker,
  expression,
  parameter,
  claimedDerivative,
}: {
  checker: SympyDerivativeChecker;
  expression: string;
  parameter: string;
  claimedDerivative: string;
}) {
  try {
    return await checker({
      expression,
      parameter,
      claimedDerivative,
    });
  } catch (error) {
    return {
      ok: true,
      status: "manual_review" as const,
      message: `SymPy 复算异常，已转入人工复核：${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

function parseClosedFormEquationsForSympy(closedForm: string) {
  const equations = new Map<string, string>();

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
          if (key) equations.set(key, expression);
        });
      });
  });

  return equations;
}

function parseClaimedDerivativeForSympy(symbolicResult: string) {
  const normalized = normalizeExpressionForSympy(symbolicResult);
  const parts = normalized.split("=").map((part) => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts.at(-1) : undefined;
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
