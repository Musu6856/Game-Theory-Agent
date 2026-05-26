import type {
  ResearchAssetKind,
  ResearchMathArtifact,
  ResearchProject,
} from "../types";

export type EquilibriumKernelPlannerAction =
  | "apply_pending_patch"
  | "repair_model"
  | "repair_equilibrium_candidate"
  | "solve_equilibrium"
  | "review_manually"
  | "analyze_properties";

export type EquilibriumKernelPlannerDecision = {
  status: "ready" | "blocked";
  action: EquilibriumKernelPlannerAction;
  title: string;
  reason: string;
  patchKind?: ResearchAssetKind;
  artifactIds?: string[];
};

export function planEquilibriumKernelNextStep(
  project: ResearchProject
): EquilibriumKernelPlannerDecision {
  const pendingPatch = project.researchSession?.assetPatches?.find(
    (patch) =>
      patch.status === "proposed" &&
      (patch.kind === "model" || patch.kind === "equilibrium")
  );

  if (pendingPatch) {
    return {
      status: "blocked",
      action: "apply_pending_patch",
      title: "先审阅求解相关修改建议",
      reason: "模型或均衡 patch 仍在等待审核，求解内核不会绕过资产审批。",
      patchKind: pendingPatch.kind,
    };
  }

  if (!project.hotellingModel) {
    return {
      status: "blocked",
      action: "repair_model",
      title: "先补齐模型资产",
      reason: "缺少模型设定，无法构造利润函数、FOC 或均衡求解输入。",
    };
  }

  const latestArtifacts = getLatestEquilibriumArtifacts(
    project.researchSession?.mathArtifacts ?? []
  );
  const modelGapArtifacts = latestArtifacts.filter(isModelRepairArtifact);
  if (modelGapArtifacts.length > 0) {
    return {
      status: "ready",
      action: "repair_model",
      title: "补强模型求解输入",
      reason:
        "求解内核已尝试从模型资产编译利润函数、变量和 FOC，但当前模型缺少可安全求导的结构化利润函数或变量匹配，需要先生成一条模型修复建议。",
      artifactIds: modelGapArtifacts.map((artifact) => artifact.id),
    };
  }

  const failedArtifacts = latestArtifacts.filter(
    (artifact) => artifact.status === "failed"
  );
  const candidateFailureArtifacts = failedArtifacts.filter(
    isEquilibriumCandidateRepairArtifact
  );
  if (candidateFailureArtifacts.length > 0) {
    return {
      status: "ready",
      action: "repair_equilibrium_candidate",
      title: "修复均衡候选",
      reason:
        "已保存的数学产物显示候选均衡的 FOC 残差回代或独立求解对照未通过，应先基于这些产物修复候选闭式解和推导。",
      artifactIds: candidateFailureArtifacts.map((artifact) => artifact.id),
    };
  }
  if (failedArtifacts.length > 0) {
    return {
      status: "ready",
      action: "solve_equilibrium",
      title: "重新生成符号均衡",
      reason:
        "已保存的数学产物显示残差回代或独立求解未通过，需要重新生成或修复均衡候选。",
      artifactIds: failedArtifacts.map((artifact) => artifact.id),
    };
  }

  const manualArtifacts = latestArtifacts.filter(
    (artifact) =>
      artifact.status === "manual_review" ||
      artifact.status === "unsupported" ||
      artifact.status === "condition_insufficient"
  );
  if (manualArtifacts.length > 0) {
    return {
      status: "blocked",
      action: "review_manually",
      title: "人工复核数学产物",
      reason:
        "求解内核已经保存中间数学产物，但部分 FOC、闭式解或 SymPy 输入暂不能自动复核。",
      artifactIds: manualArtifacts.map((artifact) => artifact.id),
    };
  }

  if (project.equilibriumResult?.status === "solved") {
    return {
      status: "ready",
      action: "analyze_properties",
      title: "生成性质分析",
      reason: "当前均衡已求解，且最近的求解产物没有失败或人工复核阻塞。",
    };
  }

  return {
    status: "ready",
    action: "solve_equilibrium",
    title: "开始符号求解",
    reason: "模型资产已经存在，下一步应构造候选均衡、FOC 和复核产物。",
  };
}

function getLatestEquilibriumArtifacts(artifacts: ResearchMathArtifact[]) {
  const latestPatchId = artifacts.findLast(
    (artifact) => artifact.patchId && isEquilibriumArtifact(artifact)
  )?.patchId;

  return artifacts.filter((artifact) => {
    if (!isEquilibriumArtifact(artifact)) return false;
    return latestPatchId ? artifact.patchId === latestPatchId : true;
  });
}

function isEquilibriumArtifact(artifact: ResearchMathArtifact) {
  return (
    artifact.kind === "equilibrium_candidate" ||
    artifact.kind === "compiled_game_system" ||
    artifact.kind === "closed_form_substitutions" ||
    artifact.kind === "foc_residuals" ||
    artifact.kind === "generated_foc_system" ||
    artifact.kind === "model_profit_foc" ||
    artifact.kind === "solver_attempt" ||
    artifact.kind === "sympy_residual_check" ||
    artifact.kind === "sympy_solve_check"
  );
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

  const text = [
    ...(artifact.issues ?? []),
    JSON.stringify(artifact.input ?? {}),
  ].join("\n");

  return /candidate|候选|closed.?form|闭式|残差回代/i.test(text);
}

function hasCompiledObjectives(artifact: ResearchMathArtifact) {
  const input =
    artifact.input && typeof artifact.input === "object"
      ? (artifact.input as Record<string, unknown>)
      : {};
  const objectives = input.objectives;

  return Array.isArray(objectives) && objectives.length > 0;
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
