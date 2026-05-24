import {
  getResearchFlowState,
  type ResearchAssetsTab,
} from "../research-flow.ts";
import type {
  ResearchAssetKind,
  ResearchProject,
  ResearchSessionDecision,
} from "../types";

export type NextAgentActionKind =
  | ResearchSessionDecision["kind"]
  | "confirm_model";

export type AgentExecutableAction =
  | "build_model"
  | "solve_equilibrium"
  | "analyze_properties"
  | "draft_paper";

export type NextAgentBlocker = {
  kind:
    | "pending_patch"
    | "stale_asset"
    | "symbolic_failure"
    | "missing_asset"
    | "manual_choice"
    | "complete";
  label: string;
  description: string;
  patchKind?: ResearchAssetKind;
};

export type SafeContinuationStep = {
  kind: Exclude<NextAgentActionKind, "choose_direction">;
  label: string;
  description: string;
  agentAction?: AgentExecutableAction;
  targetTab: ResearchAssetsTab;
};

export type SafeContinuationPlan = {
  status: "ready" | "blocked" | "complete";
  title: string;
  reason: string;
  targetTab: ResearchAssetsTab;
  steps: SafeContinuationStep[];
  stopReason?:
    | "approval_required"
    | "manual_choice_required"
    | "complete"
    | "blocked";
  blocker?: NextAgentBlocker;
};

export type NextAgentRecommendation = {
  status: "ready" | "blocked" | "complete";
  title: string;
  reason: string;
  targetTab: ResearchAssetsTab;
  action?: {
    kind: NextAgentActionKind;
    label: string;
    description: string;
    agentAction?: AgentExecutableAction;
  };
  blocker?: NextAgentBlocker;
};

export function planSafeContinuation(
  project?: ResearchProject | null
): SafeContinuationPlan {
  const recommendation = recommendNextAgentStep(project);

  if (recommendation.status === "complete") {
    return {
      status: "complete",
      title: "当前闭环已有论文草稿",
      reason: recommendation.reason,
      targetTab: recommendation.targetTab,
      steps: [],
      stopReason: "complete",
      blocker: {
        kind: "complete",
        label: "当前闭环完成",
        description: "可以继续编辑、导出，或回到任一资产修订。",
      },
    };
  }

  const action = recommendation.action;

  if (recommendation.status === "blocked" || !action) {
    return {
      status: "blocked",
      title: recommendation.title,
      reason: recommendation.reason,
      targetTab: recommendation.targetTab,
      steps: [],
      stopReason: "blocked",
      blocker: recommendation.blocker,
    };
  }

  if (!isSafeContinuationActionKind(action.kind)) {
    return {
      status: "blocked",
      title: "需要先选择方向",
      reason: "研究方向会决定后续模型结构，连续推进不会替用户自动选择方向。",
      targetTab: "directions",
      steps: [],
      stopReason: "manual_choice_required",
      blocker: {
        kind: "manual_choice",
        label: "等待选择方向",
        description: "请先在候选方向中采用一个方向，再继续自动推进。",
      },
    };
  }

  const firstStep: SafeContinuationStep = {
    kind: action.kind,
    agentAction: action.agentAction,
    label: action.label,
    description: action.description,
    targetTab: recommendation.targetTab,
  };
  const steps =
    firstStep.kind === "confirm_model"
      ? [
          firstStep,
          {
            kind: "solve_equilibrium" as const,
            agentAction: "solve_equilibrium" as const,
            targetTab: "equilibrium" as const,
            label: "生成符号均衡",
            description: "模型确认后继续生成均衡候选，并在待审核 patch 处停止。",
          },
        ]
      : [firstStep];

  return {
    status: "ready",
    title: getSafeContinuationTitle(steps),
    reason: getSafeContinuationReason(steps),
    targetTab: steps.at(-1)?.targetTab ?? recommendation.targetTab,
    steps,
    stopReason: "approval_required",
  };
}

export function recommendNextAgentStep(
  project?: ResearchProject | null
): NextAgentRecommendation {
  if (!project) {
    return {
      status: "ready",
      title: "输入研究想法",
      reason: "先从一句研究想法开始，Agent 才能发现方向并整理来源。",
      targetTab: "directions",
      action: {
        kind: "choose_direction",
        label: "开始方向发现",
        description: "输入研究想法后，系统会进入方向发现阶段。",
      },
    };
  }

  const session = project.researchSession;
  const pendingPatch = session?.assetPatches?.find(
    (patch) => patch.status === "proposed"
  );
  if (pendingPatch) {
    return {
      status: "blocked",
      title: "先审阅修改建议",
      reason: `当前有一条${formatPatchKind(pendingPatch.kind)}修改建议还没有处理。Agent 不会绕过审核继续推进。`,
      targetTab: getTabForPatchKind(pendingPatch.kind),
      blocker: {
        kind: "pending_patch",
        label: "等待人工审核",
        description: "先应用或拒绝右侧待审核修改建议，再继续下一步。",
        patchKind: pendingPatch.kind,
      },
    };
  }

  const flow = getResearchFlowState(project, session);
  if (project.sections.length > 0 && flow.canDraftPaper) {
    return {
      status: "complete",
      title: "当前闭环已有论文草稿",
      reason: "方向、模型、均衡、性质分析和论文草稿都已经形成，可以继续编辑、导出或回到任一资产修订。",
      targetTab: "paper",
    };
  }

  if (flow.canDraftPaper) {
    return {
      status: "ready",
      title: "整理论文草稿",
      reason: "性质分析已经稳定，下一步可以把已确认资产整理成可审阅的论文章节。",
      targetTab: "paper",
      action: {
        kind: "draft_paper",
        agentAction: "draft_paper",
        label: "整理论文草稿",
        description: "基于已应用的方向、模型、均衡和命题，生成论文章节建议。",
      },
    };
  }

  if (flow.isEquilibriumStale) {
    return {
      status: "ready",
      title: "重新生成符号均衡",
      reason: "模型已经修改，旧均衡不再对应当前模型，下一步应先重算均衡。",
      targetTab: "equilibrium",
      action: {
        kind: "solve_equilibrium",
        agentAction: "solve_equilibrium",
        label: "重新生成符号均衡",
        description: "基于当前模型重新生成均衡候选，并以修改建议形式等待审核。",
      },
    };
  }

  if (flow.isPropertyAnalysisStale) {
    return {
      status: "ready",
      title: "重做性质分析",
      reason: "均衡已经更新或模型相关资产发生变化，旧性质分析需要基于当前均衡重新生成。",
      targetTab: "properties",
      action: {
        kind: "analyze_properties",
        agentAction: "analyze_properties",
        label: "重做性质分析",
        description: "基于当前均衡重新生成比较静态和命题候选。",
      },
    };
  }

  if (flow.canAnalyzeProperties) {
    return {
      status: "ready",
      title: "生成性质分析",
      reason: "符号均衡已经可用，下一步可以分析比较静态并整理命题草稿。",
      targetTab: "properties",
      action: {
        kind: "analyze_properties",
        agentAction: "analyze_properties",
        label: "生成性质分析",
        description: "基于已确认均衡生成比较静态和命题候选。",
      },
    };
  }

  if (flow.canSolveEquilibrium) {
    return {
      status: "ready",
      title:
        project.equilibriumResult?.status === "symbolic_failure"
          ? "重新尝试符号求解"
          : "开始符号求解",
      reason:
        project.equilibriumResult?.status === "symbolic_failure"
          ? "当前只得到隐式或失败草稿，需要先重新求解或收窄模型。"
          : "模型已经确认，下一步可以生成符号均衡推导。",
      targetTab: "equilibrium",
      action: {
        kind: "solve_equilibrium",
        agentAction: "solve_equilibrium",
        label:
          project.equilibriumResult?.status === "symbolic_failure"
            ? "重新尝试符号求解"
            : "开始符号求解",
        description: "生成均衡候选、自检推导质量，并等待审核后写入资产。",
      },
    };
  }

  if (flow.canConfirmModel) {
    return {
      status: "ready",
      title: "确认模型设定",
      reason: "模型候选已经生成，先确认参与者、时序、符号和函数，再进入均衡求解。",
      targetTab: "model",
      action: {
        kind: "confirm_model",
        label: "确认模型并进入均衡",
        description: "锁定当前模型设定，进入符号均衡阶段。",
      },
    };
  }

  if (session?.phase === "direction" || !session?.assetSummary.currentDirection) {
    return {
      status: "ready",
      title: "选择研究方向",
      reason: "方向发现已经完成，下一步需要先采用一个方向，再生成模型候选。",
      targetTab: "directions",
      action: {
        kind: "choose_direction",
        agentAction: "build_model",
        label: "采用一个方向",
        description: "选择方向后，模型生成 Agent 会准备待审核模型修改建议。",
      },
    };
  }

  if (project.equilibriumResult?.status === "symbolic_failure") {
    return {
      status: "blocked",
      title: "均衡结果需要修订",
      reason: "当前均衡没有得到可用于性质分析的闭式解，应先重算均衡或修改模型。",
      targetTab: "equilibrium",
      blocker: {
        kind: "symbolic_failure",
        label: "均衡未闭式求解",
        description: "先回到模型或均衡页修订，再继续性质分析。",
      },
    };
  }

  return {
    status: "blocked",
    title: "等待补齐研究资产",
    reason: "当前状态还不足以自动推进。请检查右侧质量页的提示，确认缺少方向、模型、均衡还是性质分析。",
    targetTab: "quality",
    blocker: {
      kind: "missing_asset",
      label: "资产不足",
      description: "需要先补齐当前阶段的研究资产。",
    },
  };
}

function isSafeContinuationActionKind(
  kind: NextAgentActionKind
): kind is SafeContinuationStep["kind"] {
  return kind !== "choose_direction";
}

function getSafeContinuationTitle(steps: SafeContinuationStep[]) {
  if (steps.length > 1) return "继续到下一个审核点";

  switch (steps[0]?.kind) {
    case "confirm_model":
      return "确认模型设定";
    case "solve_equilibrium":
      return "继续生成符号均衡";
    case "analyze_properties":
      return "继续生成性质分析";
    case "draft_paper":
      return "继续整理论文草稿";
    default:
      return "继续推进";
  }
}

function getSafeContinuationReason(steps: SafeContinuationStep[]) {
  if (steps.length > 1) {
    return "系统会先确认当前模型，再生成均衡候选；一旦出现待审核修改建议，就停下来等你处理。";
  }

  switch (steps[0]?.kind) {
    case "solve_equilibrium":
      return "系统会生成均衡候选，并在待审核修改建议处停下。";
    case "analyze_properties":
      return "系统会生成比较静态和命题候选，并在待审核修改建议处停下。";
    case "draft_paper":
      return "系统会整理章节草稿，并在待审核修改建议处停下。";
    default:
      return "系统会推进一个安全步骤，并在需要人工审核时停下。";
  }
}

function getTabForPatchKind(kind: ResearchAssetKind): ResearchAssetsTab {
  switch (kind) {
    case "model":
      return "model";
    case "equilibrium":
      return "equilibrium";
    case "properties":
      return "properties";
    case "paper":
      return "paper";
  }
}

function formatPatchKind(kind: ResearchAssetKind) {
  switch (kind) {
    case "model":
      return "模型";
    case "equilibrium":
      return "均衡";
    case "properties":
      return "性质分析";
    case "paper":
      return "论文草稿";
  }
}
