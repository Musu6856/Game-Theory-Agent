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

  const issues = [
    ...candidateIssues,
    ...consistencyReview.issues,
    ...sympyReview.issues,
  ];
  const checks = [...consistencyReview.checks, ...sympyReview.checks];
  const decision = decideNextKernelAction({
    issues,
    sympyReview,
  });
  const steps = [
    createCandidateValidationStep({
      candidateIssues,
      consistencyIssues: consistencyReview.issues,
    }),
    ...sympyReview.artifacts.map(createArtifactStep),
    createDecisionStep(decision),
  ];

  return {
    ok: issues.length === 0 && decision.action === "accept_candidate",
    issues,
    checks,
    artifacts: sympyReview.artifacts,
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
  sympyReview,
}: {
  issues: string[];
  sympyReview: SympyEquilibriumReviewResult;
}): EquilibriumSolverKernelDecision {
  const modelRepairArtifacts = sympyReview.artifacts.filter(isModelRepairArtifact);
  if (modelRepairArtifacts.length > 0) {
    return {
      action: "repair_model",
      title: "补强模型求解输入",
      reason:
        "求解内核无法从当前模型资产得到完整、安全的利润函数、变量和 FOC 输入，应先补模型资产。",
      artifactIds: modelRepairArtifacts.map((artifact) => artifact.id),
    };
  }

  const failedArtifacts = sympyReview.artifacts.filter(
    (artifact) => artifact.status === "failed"
  );
  const candidateFailureArtifacts = failedArtifacts.filter(
    isEquilibriumCandidateRepairArtifact
  );
  if (candidateFailureArtifacts.length > 0 || issues.length > 0) {
    return {
      action: "repair_equilibrium_candidate",
      title: "修复均衡候选",
      reason:
        "候选均衡没有通过结构、符号、FOC 残差或独立求解复核，应基于已保存数学产物修复闭式解和推导。",
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
  if (manualArtifacts.length > 0) {
    return {
      action: "review_manually",
      title: "人工复核数学产物",
      reason:
        "求解内核已保存中间数学产物，但部分 FOC、闭式解或 SymPy 输入暂不能自动复核。",
      artifactIds: manualArtifacts.map((artifact) => artifact.id),
    };
  }

  return {
    action: "accept_candidate",
    title: "接受候选并进入审核 patch",
    reason: "候选均衡通过当前受限求解内核的结构检查、FOC 残差和独立求解对照。",
    artifactIds: [],
  };
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
