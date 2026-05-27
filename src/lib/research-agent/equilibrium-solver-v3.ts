import type { HotellingModel } from "../types";
import { normalizeExpressionForSympy } from "./sympy-checker.ts";

export type SolverV3Strategy =
  | "linear_system"
  | "reaction_functions"
  | "explicit_foc_solve"
  | "residual_substitution"
  | "implicit_system_fallback";

export type SolverV3FailureKind =
  | "none"
  | "model_gap"
  | "unsupported_expression"
  | "condition_insufficiency"
  | "soc_hessian_failure"
  | "boundary_or_multiple_equilibrium"
  | "solver_timeout";

export interface SolverV3CompiledSystem {
  players: Array<{
    id: string;
    platform: string;
    variables: string[];
  }>;
  strategicVariables: string[];
  stateVariables: string[];
  parameters: string[];
  constraints: Array<{
    expression: string;
    variables: string[];
    kind: "assumption" | "bound" | "existence";
  }>;
  timing: Array<{
    stageId: string;
    order: number;
    name: string;
    decisions: string[];
  }>;
  objectives: Array<{
    profitFunctionId: string;
    platform: string;
    expression: string;
    variables: string[];
  }>;
  generatedFocSystem: Array<{
    profitFunctionId: string;
    platform: string;
    variable: string;
    residual: string;
  }>;
  optimalityObligations: Array<{
    kind: "second_order" | "hessian" | "boundary_kkt";
    platform: string;
    variables: string[];
    status: "generated" | "manual_review";
    reason: string;
  }>;
  strategyPlan: Array<{
    strategy: SolverV3Strategy;
    enabled: boolean;
    reason: string;
  }>;
  failure: {
    kind: SolverV3FailureKind;
    reason: string;
    nextAction: string;
  };
}

const SAFE_EXPRESSION_PATTERN = /^[A-Za-z0-9_+\-*/().,\s^]+$/;

export function compileEquilibriumSolverV3System({
  model,
  candidateVariables = [],
}: {
  model?: HotellingModel;
  candidateVariables?: string[];
}): SolverV3CompiledSystem {
  const timing = (model?.timing ?? []).map((stage) => ({
    stageId: stage.id,
    order: stage.order,
    name: stage.name,
    decisions: stage.decisions.map(normalizeExpressionForSympy).filter(Boolean),
  }));
  const strategicVariables = uniqueSymbols([
    ...timing.flatMap((stage) => stage.decisions),
    ...candidateVariables.map(normalizeExpressionForSympy),
  ]);
  const parameters = uniqueSymbols(
    (model?.symbols ?? [])
      .filter((symbol) => symbol.role !== "decision")
      .map((symbol) => symbol.codeName)
  );
  const stateVariables = uniqueSymbols([
    ...extractSymbols(model?.demandDerivation ?? "").filter((symbol) =>
      /^n_/i.test(symbol)
    ),
    ...(model?.symbols ?? [])
      .filter((symbol) => symbol.role === "demand" || symbol.role === "derived")
      .map((symbol) => symbol.codeName),
  ]);
  const constraints = (model?.assumptions ?? []).map((assumption) => ({
    expression: normalizeExpressionForSympy(assumption),
    variables: extractSymbols(assumption),
    kind: classifyConstraint(assumption),
  }));
  const objectives = compileObjectives({
    model,
    strategicVariables,
  });
  const generatedFocSystem = objectives.flatMap((objective) =>
    objective.variables.map((variable) => ({
      profitFunctionId: objective.profitFunctionId,
      platform: objective.platform,
      variable,
      residual: differentiateSimplePolynomial(objective.expression, variable),
    }))
  );
  const players = createPlayers({
    model,
    strategicVariables,
    objectives,
  });
  const optimalityObligations = createOptimalityObligations({
    players,
    constraints,
  });
  const failure = classifyFailure({
    model,
    objectives,
    generatedFocSystem,
  });

  return {
    players,
    strategicVariables,
    stateVariables,
    parameters,
    constraints,
    timing,
    objectives,
    generatedFocSystem,
    optimalityObligations,
    strategyPlan: createStrategyPlan({
      generatedFocSystem,
      strategicVariables,
      failureKind: failure.kind,
    }),
    failure,
  };
}

export function getSolverV3NextAction(
  failure: SolverV3CompiledSystem["failure"]
) {
  if (failure.kind === "none") return "Continue with bounded solver strategies.";
  return failure.nextAction;
}

function compileObjectives({
  model,
  strategicVariables,
}: {
  model?: HotellingModel;
  strategicVariables: string[];
}): SolverV3CompiledSystem["objectives"] {
  return (model?.profitFunctions ?? [])
    .map((profit) => ({
      profitFunctionId: profit.id,
      platform: profit.platform,
      expression: extractRightHandExpression(profit.expression),
      variables: strategicVariables.filter((variable) =>
        platformMatchesVariable(profit.platform, variable)
      ),
    }))
    .filter((objective) => objective.expression.length > 0);
}

function createPlayers({
  model,
  strategicVariables,
  objectives,
}: {
  model?: HotellingModel;
  strategicVariables: string[];
  objectives: SolverV3CompiledSystem["objectives"];
}) {
  const platforms =
    model?.platforms && model.platforms.length > 0
      ? model.platforms
      : uniqueSymbols(objectives.map((objective) => objective.platform));

  return platforms.map((platform) => ({
    id: normalizePlatform(platform),
    platform,
    variables: strategicVariables.filter((variable) =>
      platformMatchesVariable(platform, variable)
    ),
  }));
}

function createOptimalityObligations({
  players,
  constraints,
}: {
  players: SolverV3CompiledSystem["players"];
  constraints: SolverV3CompiledSystem["constraints"];
}): SolverV3CompiledSystem["optimalityObligations"] {
  return players.flatMap((player) => {
    const obligations: SolverV3CompiledSystem["optimalityObligations"] = [];
    if (player.variables.length <= 1) {
      obligations.push({
        kind: "second_order",
        platform: player.platform,
        variables: player.variables,
        status: "generated",
        reason: "single own decision variable",
      });
    } else {
      obligations.push({
        kind: "hessian",
        platform: player.platform,
        variables: player.variables,
        status: "manual_review",
        reason: "same-player multi-decision objective needs Hessian review",
      });
    }

    const boundedVariables = player.variables.filter((variable) =>
      constraints.some(
        (constraint) =>
          constraint.kind === "bound" && constraint.variables.includes(variable)
      )
    );
    if (boundedVariables.length > 0) {
      obligations.push({
        kind: "boundary_kkt",
        platform: player.platform,
        variables: boundedVariables,
        status: "manual_review",
        reason: "bounded decision variables need KKT or boundary-region analysis",
      });
    }

    return obligations;
  });
}

function createStrategyPlan({
  generatedFocSystem,
  strategicVariables,
  failureKind,
}: {
  generatedFocSystem: SolverV3CompiledSystem["generatedFocSystem"];
  strategicVariables: string[];
  failureKind: SolverV3FailureKind;
}): SolverV3CompiledSystem["strategyPlan"] {
  const hasExecutableFocs =
    failureKind === "none" &&
    generatedFocSystem.length > 0 &&
    generatedFocSystem.every((foc) => foc.residual);

  return [
    {
      strategy: "linear_system",
      enabled: hasExecutableFocs && generatedFocSystem.length === strategicVariables.length,
      reason: "try linear FOC system first when equation and variable counts match",
    },
    {
      strategy: "reaction_functions",
      enabled: hasExecutableFocs && strategicVariables.length >= 2,
      reason: "derive bounded reaction functions for multi-player systems",
    },
    {
      strategy: "explicit_foc_solve",
      enabled: hasExecutableFocs,
      reason: "use explicit FOC solve when safe residuals exist",
    },
    {
      strategy: "residual_substitution",
      enabled: hasExecutableFocs,
      reason: "verify candidate substitutions against residuals",
    },
    {
      strategy: "implicit_system_fallback",
      enabled: true,
      reason: "preserve implicit equations when closed-form solve is not safe",
    },
  ];
}

function classifyFailure({
  model,
  objectives,
  generatedFocSystem,
}: {
  model?: HotellingModel;
  objectives: SolverV3CompiledSystem["objectives"];
  generatedFocSystem: SolverV3CompiledSystem["generatedFocSystem"];
}): SolverV3CompiledSystem["failure"] {
  if (!model || (model.profitFunctions ?? []).length === 0) {
    return failure(
      "model_gap",
      "No structured profit functions are available.",
      "Return to the model asset and create a reviewable model repair patch."
    );
  }

  const unsafeObjective = objectives.find(
    (objective) =>
      !SAFE_EXPRESSION_PATTERN.test(objective.expression) ||
      hasUnsupportedFunctionCall(objective.expression)
  );
  if (unsafeObjective) {
    return failure(
      "unsupported_expression",
      `Unsupported expression in ${unsafeObjective.profitFunctionId}: ${unsafeObjective.expression}`,
      "Rewrite the objective into safe algebraic form or keep the solve under manual review."
    );
  }

  if (objectives.length === 0 || generatedFocSystem.length === 0) {
    return failure(
      "model_gap",
      "No objective could be matched to the strategic variables.",
      "Repair model timing, platform ids, or profit-function ownership."
    );
  }

  if (generatedFocSystem.some((foc) => !foc.residual)) {
    return failure(
      "unsupported_expression",
      "At least one FOC could not be generated by the bounded polynomial differentiator.",
      "Rewrite unsupported objectives or keep an implicit/manual-review solve."
    );
  }

  return failure("none", "No solver v3 preflight failure.", "Continue.");
}

function failure(
  kind: SolverV3FailureKind,
  reason: string,
  nextAction: string
): SolverV3CompiledSystem["failure"] {
  return { kind, reason, nextAction };
}

function differentiateSimplePolynomial(expression: string, variable: string) {
  const normalized = normalizeExpressionForSympy(expression)
    .replace(/\s+/g, "")
    .replace(/\*\*/g, "^");
  const terms = normalized.match(/[+-]?[^+-]+/g) ?? [];
  const derivativeTerms = terms
    .map((term) => differentiateTerm(term, variable))
    .filter((term): term is string => Boolean(term));
  return derivativeTerms.length > 0
    ? normalizeSigns(derivativeTerms.join("+"))
    : "0";
}

function differentiateTerm(term: string, variable: string) {
  if (!term.includes(variable)) return "";

  const factors = term.split("*");
  const cleanedFactors = factors.map((factor, index) =>
    index === 0 ? factor.replace(/^[+-]/, "") : factor
  );
  const variableFactorIndex = factors.findIndex(
    (_factor, index) =>
      cleanedFactors[index] === variable ||
      cleanedFactors[index] === `${variable}^2`
  );
  if (variableFactorIndex < 0) return "";

  const sign = term.startsWith("-") ? "-" : "";
  const variableFactor = cleanedFactors[variableFactorIndex];
  const otherFactors = cleanedFactors.filter(
    (_factor, index) => index !== variableFactorIndex
  );

  if (variableFactor === `${variable}^2`) {
    return `${sign}${["2", variable, ...otherFactors].join("*")}`;
  }

  return `${sign}${otherFactors.length > 0 ? otherFactors.join("*") : "1"}`;
}

function normalizeSigns(value: string) {
  return value
    .replace(/\+\-/g, " - ")
    .replace(/\+/g, " + ")
    .replace(/^\s*\+\s*/, "")
    .trim();
}

function hasUnsupportedFunctionCall(expression: string) {
  return /[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(expression);
}

function classifyConstraint(
  expression: string
): SolverV3CompiledSystem["constraints"][number]["kind"] {
  if (/>=|<=|\\ge|\\le/.test(expression)) return "bound";
  if (/exist|interior|unique|存在|内点|唯一/i.test(expression)) {
    return "existence";
  }
  return "assumption";
}

function extractRightHandExpression(expression: string) {
  const normalized = normalizeExpressionForSympy(expression);
  const parts = normalized.split("=").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? normalized;
}

function extractSymbols(expression: string) {
  const normalized = normalizeExpressionForSympy(expression);
  return uniqueSymbols(normalized.match(/[A-Za-z][A-Za-z0-9_]+/g) ?? []);
}

function uniqueSymbols(values: string[]) {
  return [...new Set(values.map(normalizeExpressionForSympy).filter(Boolean))];
}

function platformMatchesVariable(platform: string, variable: string) {
  const platformToken = normalizePlatform(platform);
  if (!platformToken) return true;
  return new RegExp(`_${platformToken}$`, "i").test(variable);
}

function normalizePlatform(platform: string) {
  const normalized = normalizeExpressionForSympy(platform);
  const explicit = normalized.match(/(?:^|_)([A-Z])(?:$|_)/i)?.[1];
  return explicit ? explicit.toUpperCase() : normalized.toUpperCase();
}
