import type { EquilibriumResult, HotellingModel } from "../types";
import type {
  MathVerificationCheck,
  MathVerificationResult,
} from "./math-verifier.ts";
import {
  normalizeExpressionForSympy,
  runSympyFocGenerationCheck,
  runSympyResidualCheck,
  runSympySolveCheck,
  type SympyFocGenerationCheckRequest,
  type SympyFocGenerationCheckResult,
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

export type SympyFocGenerationChecker = (
  request: SympyFocGenerationCheckRequest
) => Promise<SympyFocGenerationCheckResult>;

export async function reviewEquilibriumWithSympy({
  model,
  equilibrium,
  checker = runSympyResidualCheck,
  solveChecker = runSympySolveCheck,
  focGenerationChecker = runSympyFocGenerationCheck,
}: {
  model?: HotellingModel;
  equilibrium: EquilibriumResult;
  checker?: SympyResidualChecker;
  solveChecker?: SympySolveChecker;
  focGenerationChecker?: SympyFocGenerationChecker;
}): Promise<MathVerificationResult> {
  const substitutions = parseClosedFormSubstitutions(equilibrium.closedForm);
  let residuals = parseFocResiduals(equilibrium.focs);
  let residualSource: "candidate_foc" | "model_profit_foc" = "candidate_foc";
  const variables = Object.keys(substitutions);
  const issues: string[] = [];
  const checks: MathVerificationCheck[] = [];

  if (residuals.length === 0 && model && variables.length > 0) {
    const generated = await runModelFocGenerationCheck({
      checker: focGenerationChecker,
      model,
      variables,
    });
    checks.push({
      kind: "sympy_execution",
      status: generated.status,
      message: generated.message,
    });
    if ((generated.residuals?.length ?? 0) > 0) {
      residuals = generated.residuals ?? [];
      residualSource = "model_profit_foc";
    }
  }

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
    issues.push(formatSympyIssue(result.message, residualSource));
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
    issues.push(formatSympyIssue(solveResult.message, residualSource));
  }

  return {
    ok: issues.length === 0,
    issues,
    checks,
  };
}

function formatSympyIssue(
  message: string,
  residualSource: "candidate_foc" | "model_profit_foc"
) {
  if (residualSource !== "model_profit_foc") return message;
  return `基于模型利润函数生成 FOC 的复核失败：${message}`;
}

async function runModelFocGenerationCheck({
  checker,
  model,
  variables,
}: {
  checker: SympyFocGenerationChecker;
  model: HotellingModel;
  variables: string[];
}) {
  const objectives = createModelFocObjectives(model, variables);
  try {
    return await checker({
      objectives,
    });
  } catch (error) {
    return {
      ok: true,
      status: "manual_review" as const,
      message: `SymPy 模型利润函数生成 FOC 异常，已转入人工复核：${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
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

function createModelFocObjectives(model: HotellingModel, variables: string[]) {
  const profitFunctions = model.profitFunctions
    .map((profit) => ({
      ...profit,
      expression: extractRightHandExpression(profit.expression),
    }))
    .filter((profit) => profit.expression.length > 0);

  return variables.flatMap((variable) => {
    const profit = chooseProfitFunctionForVariable(
      profitFunctions,
      variable
    );
    if (!profit) return [];
    return {
      expression: profit.expression,
      variable,
    };
  });
}

function chooseProfitFunctionForVariable(
  profitFunctions: Array<HotellingModel["profitFunctions"][number]>,
  variable: string
) {
  if (profitFunctions.length === 1) return profitFunctions[0];

  const variablePlatform = extractPlatformToken(variable);
  if (!variablePlatform) return undefined;

  return profitFunctions.find(
    (profit) => extractPlatformToken(profit.platform) === variablePlatform
  );
}

function extractRightHandExpression(expression: string) {
  const normalized = normalizeExpressionForSympy(expression);
  const parts = normalized.split("=").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? "";
}

function extractPlatformToken(value: string) {
  const normalized = normalizeExpressionForSympy(value);
  const explicit = normalized.match(/(?:^|_)([AB])(?:$|_)/i)?.[1];
  if (explicit) return explicit.toUpperCase();
  if (/平台\s*A|platform\s*A/i.test(value)) return "A";
  if (/平台\s*B|platform\s*B/i.test(value)) return "B";
  if (/^[AB]$/i.test(normalized)) return normalized.toUpperCase();
  return undefined;
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
