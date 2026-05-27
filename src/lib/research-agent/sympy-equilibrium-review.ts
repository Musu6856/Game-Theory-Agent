import type {
  EquilibriumResult,
  HotellingModel,
  ResearchMathArtifact,
} from "../types";
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
import { compileEquilibriumSolverV3System } from "./equilibrium-solver-v3.ts";

export type SympyResidualChecker = (
  request: SympyResidualCheckRequest
) => Promise<SympyResidualCheckResult>;

export type SympySolveChecker = (
  request: SympySolveCheckRequest
) => Promise<SympySolveCheckResult>;

export type SympyFocGenerationChecker = (
  request: SympyFocGenerationCheckRequest
) => Promise<SympyFocGenerationCheckResult>;

export type SympyMathArtifactSink = (
  artifact: ResearchMathArtifact
) => Promise<void> | void;

export type SympyEquilibriumReviewResult = MathVerificationResult & {
  artifacts: ResearchMathArtifact[];
};

export async function reviewEquilibriumWithSympy({
  model,
  equilibrium,
  checker = runSympyResidualCheck,
  solveChecker = runSympySolveCheck,
  focGenerationChecker = runSympyFocGenerationCheck,
  now = Date.now(),
  idPrefix = "sympy-equilibrium",
  onArtifact,
}: {
  model?: HotellingModel;
  equilibrium: EquilibriumResult;
  checker?: SympyResidualChecker;
  solveChecker?: SympySolveChecker;
  focGenerationChecker?: SympyFocGenerationChecker;
  now?: number;
  idPrefix?: string;
  onArtifact?: SympyMathArtifactSink;
}): Promise<SympyEquilibriumReviewResult> {
  const substitutions = parseClosedFormSubstitutions(equilibrium.closedForm);
  const candidateResiduals = parseFocResiduals(equilibrium.focs);
  let residuals = candidateResiduals;
  let residualSource: "candidate_foc" | "model_profit_foc" = "candidate_foc";
  const candidateVariables = Object.keys(substitutions);
  const compiledSystem = compileGameSystemForEquilibrium(
    model,
    candidateVariables
  );
  const solverV3System = compileEquilibriumSolverV3System({
    model,
    candidateVariables,
  });
  const variables = compiledSystem.variables;
  const missingCandidateVariables =
    compiledSystem.modelDecisionVariables.filter(
      (variable) => !hasSubstitutionForVariable(substitutions, variable)
    );
  const closedFormIssues =
    missingCandidateVariables.length > 0
      ? [
          `Closed-form equilibrium is missing model decision variable(s): ${missingCandidateVariables.join(
            ", "
          )}.`,
        ]
      : [];
  const issues: string[] = [];
  issues.push(...closedFormIssues);
  const checks: MathVerificationCheck[] = [];
  const artifacts: ResearchMathArtifact[] = [
    createMathArtifact({
      idPrefix,
      index: 1,
      kind: "compiled_game_system",
      title: "Compiled game system",
      status:
        compiledSystem.objectives.length > 0 ? "passed" : "manual_review",
      source: "model",
      stepId: "prepare-equilibrium",
      createdAt: now,
      input: {
        modelAvailable: Boolean(model),
        candidateVariables,
      },
      output: {
        ...compiledSystem,
        solverVersion: "v3",
        players: solverV3System.players,
        stateVariables: solverV3System.stateVariables,
        constraints: solverV3System.constraints,
        timing: solverV3System.timing,
        generatedFocSystem: solverV3System.generatedFocSystem,
        optimalityObligations: solverV3System.optimalityObligations,
        strategyPlan: solverV3System.strategyPlan,
        failure: solverV3System.failure,
      },
      issues: compiledSystem.issues,
    }),
    createMathArtifact({
      idPrefix,
      index: 2,
      kind: "closed_form_substitutions",
      title: "闭式解代入项",
      status:
        candidateVariables.length === 0
          ? "manual_review"
          : missingCandidateVariables.length > 0
            ? "failed"
            : "passed",
      source: "candidate",
      stepId: "review-equilibrium",
      createdAt: now,
      input: { closedForm: equilibrium.closedForm },
      output: {
        substitutions,
        variables,
        ...(missingCandidateVariables.length > 0
          ? {
              candidateVariables,
              missingVariables: missingCandidateVariables,
            }
          : {}),
      },
      issues: closedFormIssues,
    }),
    createMathArtifact({
      idPrefix,
      index: 3,
      kind: "foc_residuals",
      title: "候选 FOC 残差",
      status: candidateResiduals.length > 0 ? "passed" : "manual_review",
      source: "candidate",
      stepId: "review-equilibrium",
      createdAt: now,
      input: { focs: equilibrium.focs },
      output: { residuals: candidateResiduals, source: residualSource },
    }),
  ];
  await emitMathArtifacts(artifacts, onArtifact);

  const objectives = compiledSystem.objectives.map((objective) => ({
    expression: objective.expression,
    variable: objective.variable,
  }));
  if (objectives.length > 0) {
    const generated = await runModelFocGenerationCheck({
      checker: focGenerationChecker,
      objectives,
    });
    checks.push({
      kind: "sympy_execution",
      status: generated.status,
      message: generated.message,
    });
    const artifact = createMathArtifact({
        idPrefix,
        index: artifacts.length + 1,
        kind: "generated_foc_system",
        title: "模型利润函数生成 FOC",
        status: generated.status,
        source: "sympy",
        stepId: "review-equilibrium",
        createdAt: now,
        input: { objectives, compiledSystemId: artifacts[0]?.id },
        output: {
          residuals: generated.residuals ?? [],
          source: "model_profit_functions",
        },
        issues: generated.ok ? [] : [generated.message],
      });
    artifacts.push(artifact);
    await emitMathArtifact(artifact, onArtifact);
    if ((generated.residuals?.length ?? 0) > 0) {
      residuals = generated.residuals ?? [];
      residualSource = "model_profit_foc";
    }
  } else {
    const message =
      "SymPy 模型利润函数生成 FOC 缺少可求导的模型利润函数或变量匹配，已转入人工复核。";
    checks.push({
      kind: "sympy_execution",
      status: "manual_review",
      message,
    });
    const artifact = createMathArtifact({
        idPrefix,
        index: artifacts.length + 1,
        kind: "generated_foc_system",
        title: "模型利润函数生成 FOC",
        status: "manual_review",
        source: "sympy",
        stepId: "review-equilibrium",
        createdAt: now,
        input: { objectives, compiledSystemId: artifacts[0]?.id },
        output: {
          residuals: [],
          source: "model_profit_functions",
        },
        issues:
          compiledSystem.issues.length > 0
            ? [message, ...compiledSystem.issues]
            : [message],
      });
    artifacts.push(artifact);
    await emitMathArtifact(artifact, onArtifact);
  }

  if (residuals.length === 0 || Object.keys(substitutions).length === 0) {
    const residualMessage =
      "均衡候选暂未形成可执行 SymPy FOC 残差复算输入，保留人工复核。";
    const solveMessage =
      "均衡候选暂未形成可执行 SymPy 独立求解输入，保留人工复核。";
    checks.push({
      kind: "sympy_execution",
      status: "manual_review",
      message: residualMessage,
    });
    checks.push({
      kind: "sympy_execution",
      status: "manual_review",
      message: solveMessage,
    });
    const manualArtifacts = [
      createMathArtifact({
        idPrefix,
        index: artifacts.length + 1,
        kind: "sympy_residual_check",
        title: "SymPy FOC 残差回代",
        status: "manual_review",
        source: "sympy",
        stepId: "review-equilibrium",
        createdAt: now,
        input: { residuals, substitutions, residualSource },
        output: { residuals: [] },
        issues: [residualMessage],
      }),
      createMathArtifact({
        idPrefix,
        index: artifacts.length + 2,
        kind: "solver_attempt",
        title: "SymPy solver attempt",
        status: "manual_review",
        source: "sympy",
        stepId: "review-equilibrium",
        createdAt: now,
        input: {
          residuals,
          variables,
          candidate: substitutions,
          residualSource,
        },
        output: {
          engine: "sympy.solve",
          solutions: [],
        },
        issues: [solveMessage],
      }),
      createMathArtifact({
        idPrefix,
        index: artifacts.length + 3,
        kind: "sympy_solve_check",
        title: "SymPy 独立求解对照",
        status: "manual_review",
        source: "sympy",
        stepId: "review-equilibrium",
        createdAt: now,
        input: { residuals, variables, candidate: substitutions },
        output: { solutions: [] },
        issues: [solveMessage],
      })
    ];
    artifacts.push(...manualArtifacts);
    await emitMathArtifacts(manualArtifacts, onArtifact);
    return {
      ok: true,
      issues,
      checks,
      artifacts,
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
  const residualArtifact = createMathArtifact({
      idPrefix,
      index: artifacts.length + 1,
      kind: "sympy_residual_check",
      title: "SymPy FOC 残差回代",
      status: result.status,
      source: "sympy",
      stepId: "review-equilibrium",
      createdAt: now,
      input: { residuals, substitutions, residualSource },
      output: { residuals: result.residuals ?? [] },
      issues: result.ok ? [] : [formatSympyIssue(result.message, residualSource)],
    });
  artifacts.push(residualArtifact);
  await emitMathArtifact(residualArtifact, onArtifact);

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
  const solverArtifact = createMathArtifact({
      idPrefix,
      index: artifacts.length + 1,
      kind: "solver_attempt",
      title: "SymPy solver attempt",
      status: solveResult.status,
      source: "sympy",
      stepId: "review-equilibrium",
      createdAt: now,
      input: {
        residuals,
        variables,
        candidate: substitutions,
        residualSource,
      },
      output: {
        engine: "sympy.solve",
        solutions: solveResult.solutions ?? [],
      },
      issues: solveResult.ok
        ? []
        : [formatSympyIssue(solveResult.message, residualSource)],
    });
  artifacts.push(solverArtifact);
  await emitMathArtifact(solverArtifact, onArtifact);

  if (!solveResult.ok) {
    issues.push(formatSympyIssue(solveResult.message, residualSource));
  }
  const solveCheckArtifact = createMathArtifact({
      idPrefix,
      index: artifacts.length + 1,
      kind: "sympy_solve_check",
      title: "SymPy 独立求解对照",
      status: solveResult.status,
      source: "sympy",
      stepId: "review-equilibrium",
      createdAt: now,
      input: { residuals, variables, candidate: substitutions },
      output: { solutions: solveResult.solutions ?? [] },
      issues: solveResult.ok
        ? []
        : [formatSympyIssue(solveResult.message, residualSource)],
    });
  artifacts.push(solveCheckArtifact);
  await emitMathArtifact(solveCheckArtifact, onArtifact);

  return {
    ok: issues.length === 0,
    issues,
    checks,
    artifacts,
  };
}

async function emitMathArtifacts(
  artifacts: ResearchMathArtifact[],
  onArtifact?: SympyMathArtifactSink
) {
  for (const artifact of artifacts) {
    await emitMathArtifact(artifact, onArtifact);
  }
}

async function emitMathArtifact(
  artifact: ResearchMathArtifact,
  onArtifact?: SympyMathArtifactSink
) {
  await onArtifact?.(artifact);
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
  objectives,
}: {
  checker: SympyFocGenerationChecker;
  objectives: SympyFocGenerationCheckRequest["objectives"];
}) {
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

function createMathArtifact({
  idPrefix,
  index,
  kind,
  title,
  status,
  source,
  stepId,
  createdAt,
  input,
  output,
  issues,
}: Omit<ResearchMathArtifact, "id"> & {
  idPrefix: string;
  index: number;
}): ResearchMathArtifact {
  return {
    id: `${idPrefix}-${index}-${kind}`,
    kind,
    title,
    status,
    source,
    stepId,
    createdAt,
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(issues && issues.length > 0 ? { issues } : {}),
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

function hasSubstitutionForVariable(
  substitutions: Record<string, string>,
  variable: string
) {
  return Object.prototype.hasOwnProperty.call(substitutions, variable);
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

function compileGameSystemForEquilibrium(
  model: HotellingModel | undefined,
  candidateVariables: string[]
) {
  const issues: string[] = [];
  if (!model) {
    return {
      variables: candidateVariables,
      modelDecisionVariables: [],
      parameters: [],
      objectives: [],
      assumptions: [],
      issues: ["No confirmed model asset is available for FOC generation."],
    };
  }

  const modelDecisionVariables = inferDecisionVariablesFromModel(model);
  const variables = Array.from(
    new Set([...modelDecisionVariables, ...candidateVariables])
  );
  if (candidateVariables.length === 0) {
    issues.push("No closed-form decision variables were parsed from the candidate equilibrium.");
  }

  const profitFunctions = model.profitFunctions
    .map((profit) => ({
      ...profit,
      expression: extractRightHandExpression(profit.expression),
    }))
    .filter((profit) => profit.expression.length > 0);

  if (profitFunctions.length === 0) {
    issues.push("No safe structured profit functions are available for FOC generation.");
  }

  const objectives = variables.flatMap((variable) => {
    const profit = chooseProfitFunctionForVariable(
      profitFunctions,
      variable
    );
    if (!profit) {
      issues.push(`No profit function could be matched to decision variable ${variable}.`);
      return [];
    }
    return {
      profitFunctionId: profit.id,
      platform: profit.platform,
      expression: profit.expression,
      variable,
    };
  });

  return {
    variables,
    modelDecisionVariables,
    parameters: model.symbols
      .filter((symbol) => symbol.role !== "decision")
      .map((symbol) => symbol.codeName)
      .filter(Boolean),
    objectives,
    assumptions: model.assumptions,
    issues,
  };
}

function inferDecisionVariablesFromModel(model: HotellingModel) {
  const strategicStages = model.timing.filter((stage) => stage.order === 1);
  const stagedDecisionVariables =
    strategicStages.length > 0
      ? strategicStages.flatMap((stage) => stage.decisions)
      : model.timing.flatMap((stage) => stage.decisions);
  const symbolDecisionVariables =
    strategicStages.length > 0
      ? []
      : model.symbols
          .filter((symbol) => symbol.role === "decision")
          .map((symbol) => symbol.codeName);

  return Array.from(
    new Set(
      [
        ...stagedDecisionVariables,
        ...symbolDecisionVariables,
      ]
        .map((value) => normalizeExpressionForSympy(value))
        .filter(Boolean)
    )
  );
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
