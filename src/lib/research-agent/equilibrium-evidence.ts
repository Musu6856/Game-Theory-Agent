import type {
  EquilibriumResult,
  ResearchMathArtifact,
  ResearchMathArtifactKind,
  ResearchProject,
} from "../types";

export type EquilibriumEvidenceStatus =
  | "not_ready"
  | "formal"
  | "draft"
  | "review_required"
  | "failed";

export type EquilibriumRepresentation =
  | "none"
  | "closed_form"
  | "reaction_functions"
  | "implicit_system"
  | "derivation_draft"
  | "failed"
  | "needs_model_clarification";

export type EquilibriumEvidenceAssessment = {
  status: EquilibriumEvidenceStatus;
  representation: EquilibriumRepresentation;
  canUseForFormalComparativeStatics: boolean;
  canCiteAsFormalEquilibrium: boolean;
  summary: string;
  nextAction: string;
  optimalitySummary: string;
  blockingArtifacts: ResearchMathArtifact[];
  optimalityArtifacts: ResearchMathArtifact[];
};

const OPTIMALITY_ARTIFACT_KINDS = new Set<ResearchMathArtifactKind>([
  "second_order_conditions",
  "hessian_check",
  "concavity_check",
  "boundary_kkt_check",
]);

const BLOCKING_OPTIMALITY_STATUSES = new Set<ResearchMathArtifact["status"]>([
  "failed",
  "condition_insufficient",
  "unsupported",
  "manual_review",
]);

export function assessProjectEquilibriumEvidence(
  project: Pick<ResearchProject, "equilibriumResult" | "researchSession">
) {
  return assessEquilibriumEvidence({
    equilibrium: project.equilibriumResult,
    mathArtifacts: project.researchSession?.mathArtifacts,
  });
}

export function assessEquilibriumEvidence({
  equilibrium,
  mathArtifacts,
}: {
  equilibrium?: EquilibriumResult;
  mathArtifacts?: ResearchMathArtifact[];
}): EquilibriumEvidenceAssessment {
  const optimalityArtifacts = selectLatestOptimalityArtifacts(mathArtifacts);
  const blockingArtifacts = optimalityArtifacts.filter((artifact) =>
    BLOCKING_OPTIMALITY_STATUSES.has(artifact.status)
  );

  if (!equilibrium) {
    return {
      status: "not_ready",
      representation: "none",
      canUseForFormalComparativeStatics: false,
      canCiteAsFormalEquilibrium: false,
      summary: "当前还没有可用的均衡结果。",
      nextAction: "先生成并审核均衡推导。",
      optimalitySummary: "尚未形成最优性证据。",
      blockingArtifacts,
      optimalityArtifacts,
    };
  }

  const representation = getEquilibriumRepresentation(equilibrium);

  if (isFailedEquilibriumStatus(equilibrium.status)) {
    return {
      status: "failed",
      representation,
      canUseForFormalComparativeStatics: false,
      canCiteAsFormalEquilibrium: false,
      summary: createDraftSummary(equilibrium, representation),
      nextAction: "回到模型或均衡阶段，生成可审核的修复 patch。",
      optimalitySummary: summarizeOptimalityArtifacts(optimalityArtifacts),
      blockingArtifacts,
      optimalityArtifacts,
    };
  }

  if (isDraftEquilibriumStatus(equilibrium.status)) {
    return {
      status: "draft",
      representation,
      canUseForFormalComparativeStatics: false,
      canCiteAsFormalEquilibrium: false,
      summary: createDraftSummary(equilibrium, representation),
      nextAction: "继续求解或补充模型条件，暂时不要进入正式性质分析。",
      optimalitySummary: summarizeOptimalityArtifacts(optimalityArtifacts),
      blockingArtifacts,
      optimalityArtifacts,
    };
  }

  if (equilibrium.status !== "solved") {
    return {
      status: "not_ready",
      representation,
      canUseForFormalComparativeStatics: false,
      canCiteAsFormalEquilibrium: false,
      summary: `当前均衡状态是 ${equilibrium.status}，还不能作为正式均衡使用。`,
      nextAction: "先完成并审核均衡推导。",
      optimalitySummary: summarizeOptimalityArtifacts(optimalityArtifacts),
      blockingArtifacts,
      optimalityArtifacts,
    };
  }

  if (blockingArtifacts.length > 0) {
    return {
      status: "review_required",
      representation,
      canUseForFormalComparativeStatics: false,
      canCiteAsFormalEquilibrium: false,
      summary: createOptimalityReviewSummary(blockingArtifacts),
      nextAction: "先返回均衡阶段补充二阶条件、Hessian、凹性或边界/KKT 证据。",
      optimalitySummary: summarizeOptimalityArtifacts(optimalityArtifacts),
      blockingArtifacts,
      optimalityArtifacts,
    };
  }

  if (
    optimalityArtifacts.length === 0 &&
    !hasTextualOptimalityEvidence(equilibrium)
  ) {
    return {
      status: "review_required",
      representation,
      canUseForFormalComparativeStatics: false,
      canCiteAsFormalEquilibrium: false,
      summary:
        "均衡结果只有 solved 状态，但尚未看到二阶条件、Hessian、凹性或边界/KKT 证据，不能用于正式比较静态。",
      nextAction: "先返回均衡阶段补充最优性证据或生成人工复核说明。",
      optimalitySummary: summarizeOptimalityArtifacts(optimalityArtifacts),
      blockingArtifacts,
      optimalityArtifacts,
    };
  }

  return {
    status: "formal",
    representation,
    canUseForFormalComparativeStatics: true,
    canCiteAsFormalEquilibrium: true,
    summary: createFormalSummary(equilibrium, optimalityArtifacts),
    nextAction: "可以进入正式比较静态，但论文中仍应列明存在条件和最优性证据。",
    optimalitySummary: summarizeOptimalityArtifacts(optimalityArtifacts),
    blockingArtifacts,
    optimalityArtifacts,
  };
}

export function isFormalEquilibriumReady(
  assessment: EquilibriumEvidenceAssessment
) {
  return (
    assessment.status === "formal" &&
    assessment.canUseForFormalComparativeStatics &&
    assessment.canCiteAsFormalEquilibrium
  );
}

export function isOptimalityArtifactKind(kind: ResearchMathArtifactKind) {
  return OPTIMALITY_ARTIFACT_KINDS.has(kind);
}

export function formatEquilibriumEvidenceStatus(
  assessment: EquilibriumEvidenceAssessment
) {
  switch (assessment.status) {
    case "formal":
      return "正式均衡";
    case "draft":
      return "均衡草稿";
    case "review_required":
      return "均衡需人工复核";
    case "failed":
      return "均衡未通过";
    case "not_ready":
      return "均衡未就绪";
  }
}

function selectLatestOptimalityArtifacts(
  artifacts: ResearchMathArtifact[] | undefined
) {
  const byKind = new Map<ResearchMathArtifactKind, ResearchMathArtifact>();
  (artifacts ?? [])
    .filter((artifact) => OPTIMALITY_ARTIFACT_KINDS.has(artifact.kind))
    .forEach((artifact) => {
      const previous = byKind.get(artifact.kind);
      if (!previous || artifact.createdAt >= previous.createdAt) {
        byKind.set(artifact.kind, artifact);
      }
    });

  return [...byKind.values()].sort((left, right) => left.createdAt - right.createdAt);
}

function getEquilibriumRepresentation(
  equilibrium: EquilibriumResult
): EquilibriumRepresentation {
  if (equilibrium.status === "reaction_functions") return "reaction_functions";
  if (equilibrium.status === "implicit_system") return "implicit_system";
  if (equilibrium.status === "derivation_draft") return "derivation_draft";
  if (equilibrium.status === "needs_model_clarification") {
    return "needs_model_clarification";
  }
  if (
    equilibrium.status === "failed_with_reason" ||
    equilibrium.status === "symbolic_failure"
  ) {
    return "failed";
  }
  if (equilibrium.closedForm.trim()) return "closed_form";
  if (equilibrium.solverScratchpad?.reactionFunctions?.length) {
    return "reaction_functions";
  }
  if (equilibrium.solverScratchpad?.implicitSystem?.length) {
    return "implicit_system";
  }
  return "derivation_draft";
}

function isDraftEquilibriumStatus(status: EquilibriumResult["status"]) {
  return (
    status === "derivation_draft" ||
    status === "implicit_system" ||
    status === "reaction_functions"
  );
}

function isFailedEquilibriumStatus(status: EquilibriumResult["status"]) {
  return (
    status === "failed_with_reason" ||
    status === "needs_model_clarification" ||
    status === "symbolic_failure"
  );
}

function createDraftSummary(
  equilibrium: EquilibriumResult,
  representation: EquilibriumRepresentation
) {
  if (representation === "implicit_system") {
    return "当前均衡只是隐式系统或求解草稿，不能作为正式闭式均衡证明，也不能解锁正式比较静态。";
  }
  if (representation === "reaction_functions") {
    return "当前均衡只是反应函数草稿，尚未形成正式闭式均衡证明。";
  }
  if (representation === "needs_model_clarification") {
    return "当前均衡需要先补充模型设定，不能作为正式均衡使用。";
  }
  if (representation === "failed") {
    return "当前均衡求解失败或只保留诊断草稿，不能作为正式均衡使用。";
  }
  if (equilibrium.solverScratchpad?.failedWithReason) {
    return `当前均衡是草稿，失败原因：${equilibrium.solverScratchpad.failedWithReason}`;
  }
  return "当前均衡仍是推导草稿，不能作为正式闭式均衡证明。";
}

function createOptimalityReviewSummary(artifacts: ResearchMathArtifact[]) {
  const names = artifacts.map(formatOptimalityArtifactName);
  const statuses = artifacts.map((artifact) =>
    formatArtifactStatus(artifact.status)
  );
  const issues = artifacts.flatMap((artifact) => artifact.issues ?? []).slice(0, 2);
  const issueText = issues.length ? `：${issues.join("；")}` : "";
  return `均衡结果仍需要最优性人工复核，${names.join("、")} 显示 ${statuses.join("、")}${issueText}。在补足二阶条件、Hessian、凹性或边界/KKT 证据前，不能用于正式比较静态。`;
}

function createFormalSummary(
  equilibrium: EquilibriumResult,
  optimalityArtifacts: ResearchMathArtifact[]
) {
  const representation = equilibrium.closedForm.trim()
    ? "闭式均衡"
    : "已求解均衡";
  const passedEvidence = optimalityArtifacts.filter(
    (artifact) => artifact.status === "passed"
  );
  if (passedEvidence.length > 0) {
    return `${representation}已通过可用的最优性证据复核，包括 ${passedEvidence
      .map(formatOptimalityArtifactName)
      .join("、")}。`;
  }
  return `${representation}可作为当前正式结果使用；论文中仍需保留二阶条件、Hessian、凹性或边界/KKT 论证。`;
}

function hasTextualOptimalityEvidence(equilibrium: EquilibriumResult) {
  const text = [
    ...equilibrium.solvingSteps,
    ...equilibrium.conditions,
    equilibrium.derivation,
    ...equilibrium.warnings,
  ].join("\n");

  return /second.?order|二阶|Hessian|negative definite|负定|concav|凹|KKT|boundary|边界|角点/i.test(
    text
  );
}

function summarizeOptimalityArtifacts(artifacts: ResearchMathArtifact[]) {
  if (artifacts.length === 0) {
    return "尚未记录二阶条件、Hessian、凹性或边界/KKT 证据。";
  }
  return artifacts
    .map(
      (artifact) =>
        `${formatOptimalityArtifactName(artifact)}：${formatArtifactStatus(
          artifact.status
        )}`
    )
    .join("；");
}

function formatOptimalityArtifactName(artifact: ResearchMathArtifact) {
  switch (artifact.kind) {
    case "second_order_conditions":
      return "二阶条件";
    case "hessian_check":
      return "Hessian 检查";
    case "concavity_check":
      return "凹性证据";
    case "boundary_kkt_check":
      return "边界/KKT 检查";
    default:
      return artifact.title || artifact.kind;
  }
}

function formatArtifactStatus(status: ResearchMathArtifact["status"]) {
  switch (status) {
    case "passed":
      return "已通过";
    case "failed":
      return "需修正";
    case "condition_insufficient":
      return "条件不足";
    case "unsupported":
      return "暂不支持";
    case "manual_review":
      return "人工复核";
  }
}
