import type {
  EquilibriumResult,
  ResearchMathArtifact,
  ResearchMathVerificationCheck,
} from "../types";
import { normalizeExpressionForSympy } from "./sympy-checker.ts";

export interface CompiledEquilibriumSystem {
  variables: string[];
  modelDecisionVariables: string[];
  parameters: string[];
  objectives: Array<{
    profitFunctionId: string;
    platform: string;
    expression: string;
    variable: string;
  }>;
  assumptions: string[];
  issues: string[];
}

export interface EquilibriumOptimalityResult {
  ok: boolean;
  issues: string[];
  checks: ResearchMathVerificationCheck[];
  artifacts: ResearchMathArtifact[];
}

type OptimalityStatus = ResearchMathVerificationCheck["status"];

export async function evaluateEquilibriumOptimality({
  compiledSystem,
  substitutions,
  equilibrium,
  idPrefix,
  now = Date.now(),
}: {
  compiledSystem: CompiledEquilibriumSystem;
  substitutions: Record<string, string>;
  equilibrium: EquilibriumResult;
  idPrefix: string;
  now?: number;
}): Promise<EquilibriumOptimalityResult> {
  const artifacts: ResearchMathArtifact[] = [];
  const issues: string[] = [];
  const checks: ResearchMathVerificationCheck[] = [];

  const secondOrder = evaluateSecondOrderConditions({
    compiledSystem,
    substitutions,
    idPrefix,
    now,
  });
  artifacts.push(secondOrder.artifact);
  checks.push(secondOrder.check);
  issues.push(...secondOrder.issues);

  const hessian = evaluateHessianEvidence({
    compiledSystem,
    secondOrderStatus: secondOrder.artifact.status,
    idPrefix,
    now,
  });
  artifacts.push(hessian.artifact);
  checks.push(hessian.check);
  issues.push(...hessian.issues);

  const concavity = evaluateConcavityEvidence({
    equilibrium,
    secondOrderStatus: secondOrder.artifact.status,
    hessianStatus: hessian.artifact.status,
    idPrefix,
    now,
  });
  artifacts.push(concavity.artifact);
  checks.push(concavity.check);
  issues.push(...concavity.issues);

  const boundary = evaluateBoundaryKktEvidence({
    compiledSystem,
    substitutions,
    equilibrium,
    idPrefix,
    now,
  });
  artifacts.push(boundary.artifact);
  checks.push(boundary.check);
  issues.push(...boundary.issues);

  return {
    ok: issues.length === 0,
    issues,
    checks,
    artifacts,
  };
}

function evaluateSecondOrderConditions({
  compiledSystem,
  substitutions,
  idPrefix,
  now,
}: {
  compiledSystem: CompiledEquilibriumSystem;
  substitutions: Record<string, string>;
  idPrefix: string;
  now: number;
}) {
  const oneDimensionalObjectives = compiledSystem.objectives.filter(
    (objective) => compiledSystem.variables.includes(objective.variable)
  );

  if (oneDimensionalObjectives.length === 0) {
    const message =
      "No structured one-dimensional objective is available for executable second-order checking.";
    return optimalityArtifactResult({
      artifact: createOptimalityArtifact({
        id: `${idPrefix}-8-second_order_conditions`,
        kind: "second_order_conditions",
        title: "Second-order conditions",
        status: "manual_review",
        input: {
          variables: compiledSystem.variables,
          objectives: compiledSystem.objectives,
          substitutions,
        },
        output: { secondDerivatives: [] },
        issues: [message],
        now,
      }),
      message,
      issue: false,
    });
  }

  const evaluations = oneDimensionalObjectives.map((objective) =>
    evaluateSecondDerivative({
      expression: objective.expression,
      variable: objective.variable,
      substitutions,
    })
  );
  const failed = evaluations.filter((item) => item.status === "failed");
  const unsupported = evaluations.filter(
    (item) => item.status === "manual_review" || item.status === "unsupported"
  );

  if (failed.length > 0) {
    const message = failed
      .map(
        (item) =>
          `Second derivative for ${item.variable} is ${item.value}, so the candidate is not verified as a local maximum.`
      )
      .join(" ");
    return optimalityArtifactResult({
      artifact: createOptimalityArtifact({
        id: `${idPrefix}-8-second_order_conditions`,
        kind: "second_order_conditions",
        title: "Second-order conditions",
        status: "failed",
        input: {
          variables: compiledSystem.variables,
          objectives: compiledSystem.objectives,
          substitutions,
        },
        output: { secondDerivatives: evaluations },
        issues: [message],
        now,
      }),
      message,
      issue: true,
    });
  }

  if (unsupported.length > 0) {
    const message =
      "Second-order conditions contain unsupported or parameter-dependent expressions and require manual review.";
    return optimalityArtifactResult({
      artifact: createOptimalityArtifact({
        id: `${idPrefix}-8-second_order_conditions`,
        kind: "second_order_conditions",
        title: "Second-order conditions",
        status: "manual_review",
        input: {
          variables: compiledSystem.variables,
          objectives: compiledSystem.objectives,
          substitutions,
        },
        output: { secondDerivatives: evaluations },
        issues: [message],
        now,
      }),
      message,
      issue: false,
    });
  }

  return optimalityArtifactResult({
    artifact: createOptimalityArtifact({
      id: `${idPrefix}-8-second_order_conditions`,
      kind: "second_order_conditions",
      title: "Second-order conditions",
      status: "passed",
      input: {
        variables: compiledSystem.variables,
        objectives: compiledSystem.objectives,
        substitutions,
      },
      output: { secondDerivatives: evaluations },
      now,
    }),
    message: "Second-order conditions are negative for executable one-dimensional objectives.",
    issue: false,
  });
}

function evaluateHessianEvidence({
  compiledSystem,
  secondOrderStatus,
  idPrefix,
  now,
}: {
  compiledSystem: CompiledEquilibriumSystem;
  secondOrderStatus: OptimalityStatus;
  idPrefix: string;
  now: number;
}) {
  const strategicVariableCount = compiledSystem.variables.length;
  if (
    strategicVariableCount <= 1 ||
    hasOnlySeparableOneDimensionalObjectives(compiledSystem)
  ) {
    return optimalityArtifactResult({
      artifact: createOptimalityArtifact({
        id: `${idPrefix}-9-hessian_check`,
        kind: "hessian_check",
        title: "Hessian check",
        status: secondOrderStatus === "passed" ? "passed" : "manual_review",
        input: { variables: compiledSystem.variables },
        output: {
          reason:
            strategicVariableCount <= 1
              ? "one-dimensional objectives use second-order checks"
              : "separable one-dimensional player objectives use second-order checks",
        },
        now,
      }),
      message: "Hessian check is not required for one-dimensional objectives.",
      issue: secondOrderStatus !== "passed",
    });
  }

  const message =
    "Multi-variable Hessian definiteness is not yet executable for this candidate and requires manual review.";
  return optimalityArtifactResult({
    artifact: createOptimalityArtifact({
      id: `${idPrefix}-9-hessian_check`,
      kind: "hessian_check",
      title: "Hessian check",
      status: "manual_review",
      input: {
        variables: compiledSystem.variables,
        objectives: compiledSystem.objectives,
      },
      output: { reason: "multi_variable_hessian_manual_review" },
      issues: [message],
      now,
    }),
    message,
    issue: true,
  });
}

function hasOnlySeparableOneDimensionalObjectives(
  compiledSystem: CompiledEquilibriumSystem
) {
  if (compiledSystem.objectives.length === 0) return false;

  const objectiveVariables = compiledSystem.objectives.map(
    (objective) => objective.variable
  );
  const uniqueObjectiveVariables = new Set(objectiveVariables);
  if (uniqueObjectiveVariables.size !== objectiveVariables.length) return false;

  const objectiveOwners = compiledSystem.objectives.map((objective) =>
    objective.platform || objective.profitFunctionId
  );
  const uniqueObjectiveOwners = new Set(objectiveOwners);
  if (uniqueObjectiveOwners.size !== objectiveOwners.length) return false;

  return compiledSystem.variables.every((variable) =>
    uniqueObjectiveVariables.has(variable)
  );
}

function evaluateConcavityEvidence({
  equilibrium,
  secondOrderStatus,
  hessianStatus,
  idPrefix,
  now,
}: {
  equilibrium: EquilibriumResult;
  secondOrderStatus: OptimalityStatus;
  hessianStatus: OptimalityStatus;
  idPrefix: string;
  now: number;
}) {
  const text = [
    ...equilibrium.solvingSteps,
    ...equilibrium.conditions,
    equilibrium.derivation,
    ...equilibrium.warnings,
  ].join("\n");
  const hasTextualConcavity =
    /concav|凹|negative definite|负定|second.?order|二阶|Hessian/i.test(text);

  if (secondOrderStatus === "failed" || hessianStatus === "failed") {
    const message =
      "Concavity cannot be accepted because executable optimality checks found a failing condition.";
    return optimalityArtifactResult({
      artifact: createOptimalityArtifact({
        id: `${idPrefix}-10-concavity_check`,
        kind: "concavity_check",
        title: "Concavity evidence",
        status: "failed",
        input: { derivationText: text },
        output: { hasTextualConcavity },
        issues: [message],
        now,
      }),
      message,
      issue: true,
    });
  }

  if (hasTextualConcavity || secondOrderStatus === "passed") {
    return optimalityArtifactResult({
      artifact: createOptimalityArtifact({
        id: `${idPrefix}-10-concavity_check`,
        kind: "concavity_check",
        title: "Concavity evidence",
        status: "passed",
        input: { derivationText: text },
        output: { hasTextualConcavity },
        now,
      }),
      message: "Concavity or second-order evidence is present.",
      issue: false,
    });
  }

  const message =
    "No concavity, Hessian, or sufficient second-order argument is available.";
  return optimalityArtifactResult({
    artifact: createOptimalityArtifact({
      id: `${idPrefix}-10-concavity_check`,
      kind: "concavity_check",
      title: "Concavity evidence",
      status: "manual_review",
      input: { derivationText: text },
      output: { hasTextualConcavity },
      issues: [message],
      now,
    }),
    message,
    issue: false,
  });
}

function evaluateBoundaryKktEvidence({
  compiledSystem,
  substitutions,
  equilibrium,
  idPrefix,
  now,
}: {
  compiledSystem: CompiledEquilibriumSystem;
  substitutions: Record<string, string>;
  equilibrium: EquilibriumResult;
  idPrefix: string;
  now: number;
}) {
  const boundaryVariables = compiledSystem.variables.filter((variable) =>
    isBoundaryCandidate(variable, substitutions, compiledSystem.assumptions)
  );

  if (boundaryVariables.length === 0) {
    return optimalityArtifactResult({
      artifact: createOptimalityArtifact({
        id: `${idPrefix}-11-boundary_kkt_check`,
        kind: "boundary_kkt_check",
        title: "Boundary and KKT check",
        status: "passed",
        input: { assumptions: compiledSystem.assumptions, substitutions },
        output: { boundaryVariables: [] },
        now,
      }),
      message: "No active boundary candidate was detected.",
      issue: false,
    });
  }

  const text = [
    ...equilibrium.solvingSteps,
    ...equilibrium.conditions,
    equilibrium.derivation,
    ...equilibrium.warnings,
  ].join("\n");
  const hasBoundaryEvidence = /KKT|boundary|corner|边界|角点|互补松弛|约束/i.test(text);

  if (hasBoundaryEvidence) {
    return optimalityArtifactResult({
      artifact: createOptimalityArtifact({
        id: `${idPrefix}-11-boundary_kkt_check`,
        kind: "boundary_kkt_check",
        title: "Boundary and KKT check",
        status: "manual_review",
        input: { assumptions: compiledSystem.assumptions, substitutions },
        output: { boundaryVariables, hasBoundaryEvidence },
        issues: [
          "Boundary or KKT evidence is present but still requires manual review before treating the result as a proved maximum.",
        ],
        now,
      }),
      message:
        "Boundary or KKT evidence is present but still requires manual review.",
      issue: false,
    });
  }

  const message = `Boundary candidate(s) ${boundaryVariables.join(
    ", "
  )} need KKT or boundary-region analysis before promotion.`;
  return optimalityArtifactResult({
    artifact: createOptimalityArtifact({
      id: `${idPrefix}-11-boundary_kkt_check`,
      kind: "boundary_kkt_check",
      title: "Boundary and KKT check",
      status: "condition_insufficient",
      input: { assumptions: compiledSystem.assumptions, substitutions },
      output: { boundaryVariables, hasBoundaryEvidence },
      issues: [message],
      now,
    }),
    message,
    issue: true,
  });
}

function evaluateSecondDerivative({
  expression,
  variable,
  substitutions,
}: {
  expression: string;
  variable: string;
  substitutions: Record<string, string>;
}) {
  const normalizedExpression = normalizeExpressionForSympy(expression);
  const normalizedVariable = normalizeExpressionForSympy(variable);
  const directQuadratic = matchSingleVariableQuadratic(
    normalizedExpression,
    normalizedVariable
  );
  if (directQuadratic !== null) {
    return {
      variable,
      value: String(directQuadratic),
      status: directQuadratic < 0 ? "passed" : "failed",
      method: "quadratic_coefficient",
    };
  }

  return {
    variable,
    value: "",
    status: "manual_review" as const,
    method: "unsupported_expression",
    substitutions,
  };
}

function matchSingleVariableQuadratic(expression: string, variable: string) {
  const compact = expression.replace(/\s+/g, "").replace(/\*\*/g, "^");
  const escapedVariable = escapeRegExp(variable);

  if (!new RegExp(`${escapedVariable}(?:\\^2)?`).test(compact)) return null;

  let quadraticCoefficient = 0;
  let sawQuadraticTerm = false;
  const terms = compact.match(/[+-]?[^+-]+/g) ?? [];

  for (const term of terms) {
    if (!term.includes(variable)) continue;

    const coefficient = matchQuadraticCoefficient(term, escapedVariable);
    if (coefficient !== null) {
      quadraticCoefficient += coefficient;
      sawQuadraticTerm = true;
      continue;
    }

    if (new RegExp(`${escapedVariable}\\^2`).test(term)) return null;
  }

  return sawQuadraticTerm ? 2 * quadraticCoefficient : null;
}

function matchQuadraticCoefficient(term: string, escapedVariable: string) {
  const directMatch = term.match(
    new RegExp(`^([+-]?)${escapedVariable}\\^2$`)
  );
  if (directMatch) return directMatch[1] === "-" ? -1 : 1;

  const coefficientMatch = term.match(
    new RegExp(`^([+-]?\\d+(?:\\.\\d+)?)\\*${escapedVariable}\\^2$`)
  );
  if (coefficientMatch) return Number(coefficientMatch[1]);

  return null;
}

function isBoundaryCandidate(
  variable: string,
  substitutions: Record<string, string>,
  assumptions: string[]
) {
  const value = substitutions[variable];
  if (!value || normalizeExpressionForSympy(value) !== "0") return false;

  const normalizedVariable = normalizeExpressionForSympy(variable);
  return assumptions.some((assumption) => {
    const normalized = normalizeExpressionForSympy(assumption);
    return (
      normalized.includes(`${normalizedVariable} >= 0`) ||
      normalized.includes(`${normalizedVariable}>=0`) ||
      normalized.includes(`0 <= ${normalizedVariable}`) ||
      normalized.includes(`0<=${normalizedVariable}`)
    );
  });
}

function optimalityArtifactResult({
  artifact,
  message,
  issue,
}: {
  artifact: ResearchMathArtifact;
  message: string;
  issue: boolean;
}) {
  return {
    artifact,
    check: {
      kind: "sympy_execution" as const,
      status: artifact.status,
      message,
    },
    issues: issue ? [message] : [],
  };
}

function createOptimalityArtifact({
  id,
  kind,
  title,
  status,
  input,
  output,
  issues,
  now,
}: {
  id: string;
  kind: ResearchMathArtifact["kind"];
  title: string;
  status: OptimalityStatus;
  input?: unknown;
  output?: unknown;
  issues?: string[];
  now: number;
}): ResearchMathArtifact {
  return {
    id,
    kind,
    title,
    status,
    source: "sympy",
    stepId: "review-equilibrium",
    createdAt: now,
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(issues && issues.length > 0 ? { issues } : {}),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
