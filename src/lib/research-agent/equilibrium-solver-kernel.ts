import type {
  EquilibriumResult,
  ResearchMathArtifact,
  ResearchProject,
} from "../types";
import {
  verifyEquilibriumMathConsistency,
  type MathVerificationCheck,
} from "./math-verifier.ts";
import {
  reviewEquilibriumWithSympy,
  type SympyEquilibriumReviewResult,
  type SympyFocGenerationChecker,
  type SympyResidualChecker,
  type SympySolveChecker,
} from "./sympy-equilibrium-review.ts";
import {
  createEquilibriumCoverageArtifact,
  evaluateEquilibriumCoverage,
} from "./equilibrium-coverage.ts";
import {
  evaluateEquilibriumOptimality,
  type CompiledEquilibriumSystem,
} from "./equilibrium-optimality.ts";

export type EquilibriumSolverKernelDecisionAction =
  | "accept_candidate"
  | "repair_model"
  | "repair_equilibrium_candidate"
  | "review_manually";

export type EquilibriumSolverKernelStepKind =
  | "candidate_validation"
  | ResearchMathArtifact["kind"]
  | "planner_decision";

export type EquilibriumSolverKernelStepStatus =
  | MathVerificationCheck["status"]
  | "completed";

export interface EquilibriumSolverKernelStep {
  id: string;
  kind: EquilibriumSolverKernelStepKind;
  title: string;
  status: EquilibriumSolverKernelStepStatus;
  artifactIds: string[];
  issues: string[];
}

function hasCompiledObjectives(artifact: ResearchMathArtifact) {
  const input =
    artifact.input && typeof artifact.input === "object"
      ? (artifact.input as Record<string, unknown>)
      : {};
  const objectives = input.objectives;

  return Array.isArray(objectives) && objectives.length > 0;
}

export interface EquilibriumSolverKernelDecision {
  action: EquilibriumSolverKernelDecisionAction;
  title: string;
  reason: string;
  artifactIds: string[];
}

export interface EquilibriumSolverKernelResult {
  ok: boolean;
  issues: string[];
  checks: MathVerificationCheck[];
  artifacts: ResearchMathArtifact[];
  steps: EquilibriumSolverKernelStep[];
  decision: EquilibriumSolverKernelDecision;
}

export type EquilibriumSolverKernelMathArtifactSink = (
  artifact: ResearchMathArtifact
) => Promise<void> | void;

export async function runEquilibriumSolverKernel({
  project,
  equilibrium,
  checker,
  solveChecker,
  focGenerationChecker,
  now = Date.now(),
  runId = `agent-equilibrium-${now}`,
  onArtifact,
}: {
  project: ResearchProject;
  equilibrium: EquilibriumResult;
  checker?: SympyResidualChecker;
  solveChecker?: SympySolveChecker;
  focGenerationChecker?: SympyFocGenerationChecker;
  now?: number;
  runId?: string;
  onArtifact?: EquilibriumSolverKernelMathArtifactSink;
}): Promise<EquilibriumSolverKernelResult> {
  const candidateIssues = validateCandidateEquilibrium(equilibrium);
  const consistencyReview = verifyEquilibriumMathConsistency({
    model: project.hotellingModel,
    equilibrium,
  });
  const coverage = evaluateEquilibriumCoverage({
    model: project.hotellingModel,
    equilibrium,
  });
  const coverageArtifact = createEquilibriumCoverageArtifact({
    coverage,
    id: `${runId}-review-equilibrium-0-model_coverage_check`,
    runId,
    now,
  });
  await onArtifact?.(coverageArtifact);
  const sympyReview = await reviewEquilibriumWithSympy({
    model: project.hotellingModel,
    equilibrium,
    checker,
    solveChecker,
    focGenerationChecker,
    now,
    idPrefix: `${runId}-review-equilibrium`,
    onArtifact: async (artifact) => {
      await onArtifact?.({
        ...artifact,
        runId,
      });
    },
  });
  const compiledSystem = selectCompiledSystem(sympyReview.artifacts);
  const substitutions = selectClosedFormSubstitutions(sympyReview.artifacts);
  const optimalityReview = await evaluateEquilibriumOptimality({
    compiledSystem,
    substitutions,
    equilibrium,
    idPrefix: `${runId}-review-equilibrium`,
    now,
  });
  for (const artifact of optimalityReview.artifacts) {
    await onArtifact?.({
      ...artifact,
      runId,
    });
  }

  const issues = [
    ...candidateIssues,
    ...coverage.issues,
    ...consistencyReview.issues,
    ...sympyReview.issues,
    ...optimalityReview.issues,
  ];
  const checks = [
    ...consistencyReview.checks,
    ...sympyReview.checks,
    ...optimalityReview.checks,
  ];
  const decision = decideNextKernelAction({
    issues,
    coverageArtifact,
    sympyReview,
    optimalityArtifacts: optimalityReview.artifacts,
  });
  const steps = [
    createCandidateValidationStep({
      candidateIssues,
      consistencyIssues: consistencyReview.issues,
    }),
    createArtifactStep(coverageArtifact),
    ...sympyReview.artifacts.map(createArtifactStep),
    ...optimalityReview.artifacts.map(createArtifactStep),
    createDecisionStep(decision),
  ];

  return {
    ok: issues.length === 0 && decision.action === "accept_candidate",
    issues,
    checks,
    artifacts: [
      coverageArtifact,
      ...sympyReview.artifacts,
      ...optimalityReview.artifacts,
    ],
    steps,
    decision,
  };
}

function validateCandidateEquilibrium(equilibrium: EquilibriumResult) {
  const issues: string[] = [];

  if (equilibrium.status !== "solved") {
    issues.push("候选结果还不是 solved 状态，不能直接进入性质分析。");
  }

  if (!equilibrium.closedForm.trim()) {
    issues.push("缺少闭式解或可复用的均衡表达式。");
  }

  if (equilibrium.solvingSteps.length < 2) {
    issues.push("求解步骤过少，建议补充目标函数、一阶条件和联立求解过程。");
  }

  if (equilibrium.focs.length === 0) {
    issues.push("缺少一阶条件，难以审查均衡推导。");
  }

  if (equilibrium.conditions.length === 0) {
    issues.push("缺少存在条件或内点条件。");
  }

  return issues;
}

function decideNextKernelAction({
  issues,
  coverageArtifact,
  sympyReview,
  optimalityArtifacts,
}: {
  issues: string[];
  coverageArtifact: ResearchMathArtifact;
  sympyReview: SympyEquilibriumReviewResult;
  optimalityArtifacts: ResearchMathArtifact[];
}): EquilibriumSolverKernelDecision {
  const modelRepairArtifacts = sympyReview.artifacts.filter(isModelRepairArtifact);
  if (modelRepairArtifacts.length > 0) {
    return {
      action: "repair_model",
      title: "Repair model inputs",
      reason:
        "The solver kernel cannot compile complete, safe objective, variable, and FOC inputs from the current model assets.",
      artifactIds: modelRepairArtifacts.map((artifact) => artifact.id),
    };
  }

  const failedArtifacts = sympyReview.artifacts.filter(
    (artifact) => artifact.status === "failed"
  );
  const failedOptimalityArtifacts = optimalityArtifacts.filter(
    (artifact) => artifact.status === "failed"
  );
  if (failedOptimalityArtifacts.length > 0) {
    return {
      action: "repair_equilibrium_candidate",
      title: "Repair optimality evidence",
      reason:
        "The candidate may satisfy first-order checks, but second-order, Hessian, or concavity evidence shows it is not a verified profit maximum.",
      artifactIds: failedOptimalityArtifacts.map((artifact) => artifact.id),
    };
  }

  const candidateFailureArtifacts = failedArtifacts.filter(
    isEquilibriumCandidateRepairArtifact
  );
  if (candidateFailureArtifacts.length > 0) {
    return {
      action: "repair_equilibrium_candidate",
      title: "Repair equilibrium candidate",
      reason:
        "The candidate failed structured residual or independent solve checks, so the closed form and derivation should be repaired from the saved math artifacts.",
      artifactIds: candidateFailureArtifacts.map((artifact) => artifact.id),
    };
  }

  const blockingOptimalityArtifacts = optimalityArtifacts.filter(
    (artifact) =>
      artifact.status === "manual_review" ||
      artifact.status === "unsupported" ||
      artifact.status === "condition_insufficient"
  );
  if (blockingOptimalityArtifacts.length > 0) {
    return {
      action: "review_manually",
      title: "Review optimality evidence",
      reason:
        "The equilibrium candidate needs second-order, Hessian, concavity, or boundary/KKT evidence before it can be treated as a formal profit-maximizing equilibrium.",
      artifactIds: blockingOptimalityArtifacts.map((artifact) => artifact.id),
    };
  }

  if (issues.length > 0) {
    if (isBlockingCoverageArtifact(coverageArtifact)) {
      return {
        action: "review_manually",
        title: "Review model coverage before promotion",
        reason:
          "The equilibrium derivation omits confirmed high-value model mechanisms or appears to simplify a mechanism-rich model into the default symmetric core. Keep it as a draft until the omitted mechanisms are handled or explicitly scoped.",
        artifactIds: [coverageArtifact.id],
      };
    }

    return {
      action: "repair_equilibrium_candidate",
      title: "Repair equilibrium candidate",
      reason:
        "The candidate did not pass structural, symbolic, FOC residual, or independent solve review.",
      artifactIds:
        candidateFailureArtifacts.length > 0
          ? candidateFailureArtifacts.map((artifact) => artifact.id)
          : failedArtifacts.map((artifact) => artifact.id),
    };
  }

  const manualArtifacts = sympyReview.artifacts.filter(
    (artifact) =>
      artifact.status === "manual_review" ||
      artifact.status === "unsupported" ||
      artifact.status === "condition_insufficient"
  );
  const manualOptimalityArtifacts = optimalityArtifacts.filter(
    (artifact) =>
      artifact.status === "manual_review" ||
      artifact.status === "unsupported" ||
      artifact.status === "condition_insufficient"
  );
  if (manualOptimalityArtifacts.length > 0) {
    return {
      action: "review_manually",
      title: "Review optimality evidence",
      reason:
        "The equilibrium candidate needs second-order, Hessian, concavity, or boundary/KKT evidence before it can be treated as a formal profit-maximizing equilibrium.",
      artifactIds: manualOptimalityArtifacts.map((artifact) => artifact.id),
    };
  }

  if (manualArtifacts.length > 0) {
    return {
      action: "review_manually",
      title: "Review math artifacts",
      reason:
        "The solver kernel saved intermediate math artifacts, but some FOC, closed-form, or SymPy inputs cannot be automatically verified yet.",
      artifactIds: manualArtifacts.map((artifact) => artifact.id),
    };
  }

  return {
    action: "accept_candidate",
    title: "Accept candidate for review patch",
    reason:
      "The candidate passed the current bounded solver-kernel structural, residual, independent solve, and optimality checks.",
    artifactIds: [],
  };
}

function isBlockingCoverageArtifact(artifact: ResearchMathArtifact) {
  if (artifact.status !== "failed") return false;

  const output =
    artifact.output && typeof artifact.output === "object"
      ? (artifact.output as Record<string, unknown>)
      : {};
  if (output.suspiciousSimplification === true) return true;

  const omitted = Array.isArray(output.omittedHighValueMechanisms)
    ? output.omittedHighValueMechanisms
    : [];
  return omitted.some((item) => {
    if (!item || typeof item !== "object") return false;
    const mechanism = (item as { mechanism?: unknown }).mechanism;
    return (
      mechanism === "quality" ||
      mechanism === "recommendation" ||
      mechanism === "verification" ||
      mechanism === "multihoming" ||
      mechanism === "asymmetry" ||
      mechanism === "boundary"
    );
  });
}

function selectCompiledSystem(
  artifacts: ResearchMathArtifact[]
): CompiledEquilibriumSystem {
  const artifact = artifacts.find(
    (item) => item.kind === "compiled_game_system"
  );
  const output =
    artifact?.output && typeof artifact.output === "object"
      ? (artifact.output as Partial<CompiledEquilibriumSystem>)
      : {};

  return {
    variables: parseStringArray(output.variables),
    modelDecisionVariables: parseStringArray(output.modelDecisionVariables),
    parameters: parseStringArray(output.parameters),
    objectives: parseObjectives(output.objectives),
    assumptions: parseStringArray(output.assumptions),
    issues: parseStringArray(output.issues),
  };
}

function selectClosedFormSubstitutions(artifacts: ResearchMathArtifact[]) {
  const artifact = artifacts.find(
    (item) => item.kind === "closed_form_substitutions"
  );
  const output =
    artifact?.output && typeof artifact.output === "object"
      ? (artifact.output as { substitutions?: unknown })
      : {};
  const substitutions = output.substitutions;

  if (!substitutions || typeof substitutions !== "object") return {};
  return Object.fromEntries(
    Object.entries(substitutions as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseObjectives(value: unknown): CompiledEquilibriumSystem["objectives"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object")
    )
    .map((item) => ({
      profitFunctionId:
        typeof item.profitFunctionId === "string" ? item.profitFunctionId : "",
      platform: typeof item.platform === "string" ? item.platform : "",
      expression: typeof item.expression === "string" ? item.expression : "",
      variable: typeof item.variable === "string" ? item.variable : "",
    }))
    .filter((item) => item.expression && item.variable);
}

function createCandidateValidationStep({
  candidateIssues,
  consistencyIssues,
}: {
  candidateIssues: string[];
  consistencyIssues: string[];
}): EquilibriumSolverKernelStep {
  const issues = [...candidateIssues, ...consistencyIssues];
  return {
    id: "kernel-candidate-validation",
    kind: "candidate_validation",
    title: "检查均衡候选结构",
    status: issues.length > 0 ? "failed" : "completed",
    artifactIds: [],
    issues,
  };
}

function createArtifactStep(
  artifact: ResearchMathArtifact
): EquilibriumSolverKernelStep {
  return {
    id: `kernel-${artifact.kind}`,
    kind: artifact.kind,
    title: artifact.title,
    status: artifact.status,
    artifactIds: [artifact.id],
    issues: artifact.issues ?? [],
  };
}

function createDecisionStep(
  decision: EquilibriumSolverKernelDecision
): EquilibriumSolverKernelStep {
  return {
    id: "kernel-planner-decision",
    kind: "planner_decision",
    title: decision.title,
    status:
      decision.action === "accept_candidate" ? "completed" : "manual_review",
    artifactIds: decision.artifactIds,
    issues: decision.action === "accept_candidate" ? [] : [decision.reason],
  };
}

function isEquilibriumCandidateRepairArtifact(artifact: ResearchMathArtifact) {
  if (
    artifact.kind !== "closed_form_substitutions" &&
    artifact.kind !== "sympy_residual_check" &&
    artifact.kind !== "solver_attempt" &&
    artifact.kind !== "sympy_solve_check"
  ) {
    return false;
  }

  const input =
    artifact.input && typeof artifact.input === "object"
      ? (artifact.input as Record<string, unknown>)
      : {};
  if (input.residualSource === "candidate_foc") return true;
  if (artifact.status === "failed") return true;

  const text = [
    ...(artifact.issues ?? []),
    JSON.stringify(artifact.input ?? {}),
  ].join("\n");

  return /candidate|closed.?form|residual|solve|闭式|候选|残差/i.test(text);
}

function isModelRepairArtifact(artifact: ResearchMathArtifact) {
  if (
    artifact.kind !== "compiled_game_system" &&
    artifact.kind !== "generated_foc_system"
  ) {
    return false;
  }

  if (
    artifact.status !== "failed" &&
    artifact.status !== "manual_review" &&
    artifact.status !== "unsupported"
  ) {
    return false;
  }

  if (
    artifact.kind === "generated_foc_system" &&
    artifact.status === "manual_review" &&
    hasCompiledObjectives(artifact)
  ) {
    return false;
  }

  const text = [
    artifact.title,
    ...(artifact.issues ?? []),
    JSON.stringify(artifact.output ?? {}),
  ].join("\n");

  return /profit|objective|variable|FOC|利润|变量|求导|结构化/i.test(text);
}
