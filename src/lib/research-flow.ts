import type {
  EquilibriumResult,
  ResearchAssetFreshnessMap,
  ResearchProject,
  ResearchSession,
  ResearchSessionDecision,
  ResearchSessionEquilibriumStatus,
} from "./types";

export type ResearchFlowState = {
  pendingKind?: ResearchSessionDecision["kind"];
  canConfirmModel: boolean;
  canSolveEquilibrium: boolean;
  canAnalyzeProperties: boolean;
  canDraftPaper: boolean;
  hasPropertyAnalyses: boolean;
  equilibriumStatusLabel: string;
  analysisStatusLabel: string;
  assetFreshness: ResearchAssetFreshnessMap;
  isEquilibriumStale: boolean;
  isPropertyAnalysisStale: boolean;
};

export type ResearchModelPrimaryAction =
  | {
      kind: "confirm_model";
      label: string;
      description: string;
    }
  | {
      kind: "solve_equilibrium";
      label: string;
      description: string;
    };

export type ResearchPrimaryAction =
  | ResearchModelPrimaryAction
  | {
      kind: "analyze_properties";
      label: string;
      description: string;
    }
  | {
      kind: "draft_paper";
      label: string;
      description: string;
    };

export type ResearchPrimaryActionSurface =
  | "model"
  | "equilibrium"
  | "properties"
  | "paper";

export type ResearchAssetsTab =
  | "directions"
  | "evidence"
  | "model"
  | "equilibrium"
  | "properties"
  | "paper"
  | "history"
  | "quality";

export type ResearchAction = () => void | Promise<void>;

export function createResearchActionClickHandler(
  action?: ResearchAction
): (..._ignoredClickArgs: unknown[]) => void | Promise<void> {
  return () => action?.();
}

export function getResearchAssetsTabForPhase(
  phase: ResearchSession["phase"]
): ResearchAssetsTab {
  switch (phase) {
    case "direction":
      return "directions";
    case "model":
      return "model";
    case "equilibrium":
      return "equilibrium";
    case "analysis":
      return "properties";
    case "paper":
      return "paper";
    default:
      return "directions";
  }
}

export function markResearchAssetsStaleAfterModelEdit(
  project: ResearchProject
): ResearchProject {
  if (!project.hotellingModel || !project.researchSession) return project;

  const nextFreshness: ResearchAssetFreshnessMap = {
    ...(project.researchSession.assetFreshness ?? createFreshResearchAssetFreshness()),
    model: "fresh",
    equilibrium: "stale",
    properties: "stale",
  };

  return {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetFreshness: nextFreshness,
    },
  };
}

export function getResearchPrimaryAction(
  flow: Pick<
    ResearchFlowState,
    "canConfirmModel" | "canSolveEquilibrium" | "canAnalyzeProperties" | "canDraftPaper"
  >,
  surface: ResearchPrimaryActionSurface
): ResearchPrimaryAction | null {
  if (surface === "model") {
    if (flow.canConfirmModel) {
      return {
        kind: "confirm_model",
        label: "确认模型并进入均衡",
        description: "先锁定模型设定，再进入符号均衡求解。",
      };
    }

    if (flow.canSolveEquilibrium) {
      return {
        kind: "solve_equilibrium",
        label: "开始符号求解",
        description: "模型已确认，可以继续生成符号均衡。",
      };
    }

    return null;
  }

  if (surface === "equilibrium") {
    if (flow.canSolveEquilibrium) {
      return {
        kind: "solve_equilibrium",
        label: "开始符号求解",
        description: "模型已确认，可以继续生成符号均衡。",
      };
    }

    return null;
  }

  if (surface === "properties") {
    if (flow.canAnalyzeProperties) {
      return {
        kind: "analyze_properties",
        label: "生成性质分析",
        description: "符号均衡已生成，可以继续分析比较静态和命题草稿。",
      };
    }

    return null;
  }

  if (surface === "paper") {
    if (flow.canDraftPaper) {
      return {
        kind: "draft_paper",
        label: "整理论文草稿",
        description: "基于已应用的方向、模型、均衡和命题，生成可审阅的论文章节建议。",
      };
    }

    return null;
  }

  return null;
}

export function getResearchModelPrimaryAction(
  flow: Pick<ResearchFlowState, "canConfirmModel" | "canSolveEquilibrium">
): ResearchModelPrimaryAction | null {
  const action = getResearchPrimaryAction(
    {
      ...flow,
      canAnalyzeProperties: false,
      canDraftPaper: false,
    },
    "model"
  );
  return action && action.kind !== "analyze_properties" && action.kind !== "draft_paper"
    ? action
    : null;
}

export function getResearchFlowState(
  project?: ResearchProject | null,
  sessionOverride?: ResearchSession
): ResearchFlowState {
  const session = sessionOverride ?? project?.researchSession;
  const pendingKind = session?.assetSummary.pendingDecision?.kind;
  const equilibriumStatus = project?.equilibriumResult?.status;
  const hasPropertyAnalyses = Boolean(project?.propertyAnalyses?.length);
  const hasSolvableEquilibrium = isUsableEquilibriumStatus(equilibriumStatus);
  const assetFreshness =
    session?.assetFreshness ?? createFreshResearchAssetFreshness();
  const hasPendingModelPatch = Boolean(
    session?.assetPatches?.some(
      (patch) => patch.kind === "model" && patch.status === "proposed"
    )
  );
  const hasPendingEquilibriumPatch = Boolean(
    session?.assetPatches?.some(
      (patch) => patch.kind === "equilibrium" && patch.status === "proposed"
    )
  );
  const hasPendingPropertiesPatch = Boolean(
    session?.assetPatches?.some(
      (patch) => patch.kind === "properties" && patch.status === "proposed"
    )
  );
  const hasPendingPaperPatch = Boolean(
    session?.assetPatches?.some(
      (patch) => patch.kind === "paper" && patch.status === "proposed"
    )
  );
  const hasStalePropertyAnalyses =
    hasPropertyAnalyses && assetFreshness.properties === "stale";

  const canConfirmModel =
    Boolean(project?.hotellingModel) &&
    pendingKind === "answer_model_question" &&
    !hasPendingModelPatch &&
    !hasPropertyAnalyses;
  const canSolveEquilibrium =
    Boolean(project?.hotellingModel) &&
    (pendingKind === "solve_equilibrium" ||
      equilibriumStatus === "symbolic_failure") &&
    (!hasPropertyAnalyses ||
      assetFreshness.equilibrium === "stale" ||
      equilibriumStatus === "symbolic_failure" ||
      hasStalePropertyAnalyses);
  const canAnalyzeProperties =
    pendingKind === "analyze_properties" &&
    hasSolvableEquilibrium &&
    !hasPendingEquilibriumPatch &&
    !hasPropertyAnalyses;
  const canDraftPaper =
    hasPropertyAnalyses &&
    hasSolvableEquilibrium &&
    !hasPendingModelPatch &&
    !hasPendingEquilibriumPatch &&
    !hasPendingPropertiesPatch &&
    !hasPendingPaperPatch &&
    !hasStalePropertyAnalyses &&
    assetFreshness.equilibrium !== "stale";

  return {
    pendingKind,
    canConfirmModel,
    canSolveEquilibrium,
    canAnalyzeProperties,
    canDraftPaper,
    hasPropertyAnalyses,
    assetFreshness,
    isEquilibriumStale: assetFreshness.equilibrium === "stale",
    isPropertyAnalysisStale: hasStalePropertyAnalyses,
    equilibriumStatusLabel:
      equilibriumStatus === "symbolic_failure"
        ? "未得到闭式均衡"
        : canSolveEquilibrium
          ? "等待生成符号均衡推导"
          : formatEquilibriumStatus(
              session?.assetSummary.equilibriumStatus ?? equilibriumStatus
            ),
    analysisStatusLabel: hasPropertyAnalyses
      ? formatAnalysisStatus(project?.propertyAnalyses?.length ?? 0)
      : canAnalyzeProperties
        ? "等待生成性质分析"
        : equilibriumStatus === "symbolic_failure"
          ? "等待闭式均衡完成"
          : "等待符号均衡完成",
  };
}

function isUsableEquilibriumStatus(status?: EquilibriumResult["status"]) {
  return status === "solved";
}

function createFreshResearchAssetFreshness(): ResearchAssetFreshnessMap {
  return {
    model: "fresh",
    equilibrium: "fresh",
    properties: "fresh",
  };
}

function formatEquilibriumStatus(
  status?: ResearchSessionEquilibriumStatus | EquilibriumResult["status"]
) {
  switch (status) {
    case "not_started":
      return "尚未开始";
    case "等待模型确认":
      return "等待模型确认";
    case "等待开始求解":
      return "等待开始求解";
    case "待推导解析解":
      return "等待解析推导";
    case "idle":
      return "尚未开始";
    case "needs_revision":
      return "需要修订";
    case "solved":
      return "已生成符号均衡";
    case "symbolic_failure":
      return "未得到闭式均衡";
    default:
      return "等待生成";
  }
}

function formatAnalysisStatus(count: number) {
  if (count <= 0) return "等待生成性质分析";
  if (count < 3) return `仅生成 ${count} 项草稿`;
  return `已生成 ${count} 项草稿`;
}
