import {
  getResearchFlowState,
  isDraftEquilibriumStatus,
  type ResearchAssetsTab,
} from "../research-flow.ts";
import {
  getResearchAssetPatchReviewLoad,
  type ResearchAssetPatchReviewLoad,
} from "../research-pending-patches-layout.ts";
import type {
  ResearchAssetKind,
  ResearchProject,
  ResearchSessionDecision,
} from "../types";
import { buildProjectMathVerificationSummary } from "./math-verification-summary.ts";
import { planEquilibriumKernelNextStep } from "./equilibrium-dynamic-planner.ts";
import { buildVersionReviewSummary } from "./version-review-summary.ts";

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
    | "version_review"
    | "math_verification"
    | "complete";
  label: string;
  description: string;
  patchKind?: ResearchAssetKind;
  reviewLoad?: ResearchAssetPatchReviewLoad;
};

export type SafeContinuationStep = {
  kind: Exclude<
    NextAgentActionKind,
    "choose_direction" | "answer_model_question"
  >;
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
      title:
        action.kind === "answer_model_question"
          ? "需要先手动触发模型修复"
          : "需要先选择方向",
      reason:
        action.kind === "answer_model_question"
          ? "这一步会生成模型修复建议，可能改变变量、利润函数或 FOC 输入；请先用主按钮触发并在右侧审核，而不是让连续推进自动跳过。"
          : "研究方向会决定后续模型结构，连续推进不会替用户自动选择方向。",
      targetTab:
        action.kind === "answer_model_question" ? "model" : "directions",
      steps: [],
      stopReason: "manual_choice_required",
      blocker: {
        kind: "manual_choice",
        label:
          action.kind === "answer_model_question"
            ? "等待模型修复"
            : "等待选择方向",
        description:
          action.kind === "answer_model_question"
            ? "请先点击“生成模型修复建议”，审阅并应用模型 patch 后再重新求解。"
            : "请先在候选方向中采用一个方向，再继续自动推进。",
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
    const reviewLoad = getResearchAssetPatchReviewLoad(pendingPatch);

    return {
      status: "blocked",
      title: "先审阅修改建议",
      reason: `当前有一条${formatPatchKind(pendingPatch.kind)}修改建议还没有处理：${reviewLoad.label}。Agent 不会绕过审核继续推进。`,
      targetTab: getTabForPatchKind(pendingPatch.kind),
      blocker: {
        kind: "pending_patch",
        label: reviewLoad.label,
        description: `${reviewLoad.label}：${reviewLoad.reason} 处理后再继续下一步。`,
        patchKind: pendingPatch.kind,
        reviewLoad,
      },
    };
  }

  const equilibriumKernelDecision =
    session?.mathArtifacts?.length
      ? planEquilibriumKernelNextStep(project)
      : null;
  const flow = getResearchFlowState(project, session);
  if (flow.isEquilibriumStale) {
    return {
      status: "ready",
      title: "重新生成符号均衡",
      reason: "模型已经修改，旧均衡和旧数学产物不再对应当前模型，下一步应先重算均衡。",
      targetTab: "equilibrium",
      action: {
        kind: "solve_equilibrium",
        agentAction: "solve_equilibrium",
        label: "重新生成符号均衡",
        description: "基于当前模型重新生成均衡候选，并以修改建议形式等待审核。",
      },
    };
  }

  if (
    equilibriumKernelDecision?.action === "solve_equilibrium" &&
    equilibriumKernelDecision.artifactIds?.length
  ) {
    return {
      status: "ready",
      title: equilibriumKernelDecision.title,
      reason: equilibriumKernelDecision.reason,
      targetTab: "equilibrium",
      action: {
        kind: "solve_equilibrium",
        agentAction: "solve_equilibrium",
        label: "重新生成符号均衡",
        description:
          "基于已保存的数学产物重新生成均衡候选，并在待审核 patch 处停止。",
      },
    };
  }
  if (
    equilibriumKernelDecision?.action === "repair_equilibrium_candidate" &&
    equilibriumKernelDecision.artifactIds?.length
  ) {
    return {
      status: "ready",
      title: equilibriumKernelDecision.title,
      reason: equilibriumKernelDecision.reason,
      targetTab: "equilibrium",
      action: {
        kind: "solve_equilibrium",
        agentAction: "solve_equilibrium",
        label: "修复均衡候选",
        description:
          "基于残差回代和独立求解产物修复均衡候选，并在待审核 patch 处停止。",
      },
    };
  }
  if (equilibriumKernelDecision?.action === "repair_model") {
    return {
      status: "ready",
      title: equilibriumKernelDecision.title,
      reason: equilibriumKernelDecision.reason,
      targetTab: "model",
      action: {
        kind: "answer_model_question",
        agentAction: "build_model",
        label: "生成模型修复建议",
        description:
          "基于求解内核保存的数学产物补强模型资产，先形成待审核模型 patch，再重新求解均衡。",
      },
    };
  }
  if (
    equilibriumKernelDecision?.action === "review_manually" &&
    !flow.canAnalyzeProperties
  ) {
    return {
      status: "blocked",
      title: equilibriumKernelDecision.title,
      reason: equilibriumKernelDecision.reason,
      targetTab: "quality",
      blocker: {
        kind: "math_verification",
        label: "数学产物需人工复核",
        description: equilibriumKernelDecision.reason,
      },
    };
  }

  if (project.sections.length > 0 && flow.canDraftPaper) {
    return {
      status: "complete",
      title: "当前闭环已有论文草稿",
      reason: "方向、模型、均衡、性质分析和论文草稿都已经形成，可以继续编辑、导出或回到任一资产修订。",
      targetTab: "paper",
    };
  }

  const versionSummary = buildVersionReviewSummary(
    session?.assetVersionHistory ?? []
  );
  if (
    versionSummary.highestPriority === "high" &&
    !hasExecutablePendingDecision(flow.pendingKind)
  ) {
    const targetTab = getTabForVersionReviewSummary(versionSummary);

    return {
      status: "blocked",
      title: "先做版本复盘",
      reason: `版本复盘显示最近审核影响了${formatAffectedAssetKinds(versionSummary.affectedAssetKinds)}，建议先确认这些资产是否需要重算或改写。`,
      targetTab,
      blocker: {
        kind: "version_review",
        label: "版本影响待复核",
        description:
          versionSummary.latestNextAction ??
          "先查看历史页的版本复盘，再决定下一步。",
      },
    };
  }

  const mathSummary = buildProjectMathVerificationSummary({
    hotellingModel: project.hotellingModel,
    equilibriumResult: project.equilibriumResult,
    propertyAnalyses: project.propertyAnalyses,
  });
  if (mathSummary.status === "failed") {
    return {
      status: "blocked",
      title: "先处理数学验证问题",
      reason: `数学验证发现 ${mathSummary.issueCount} 个需要修正的问题，继续生成论文前应先处理。`,
      targetTab: "quality",
      blocker: {
        kind: "math_verification",
        label: "数学验证需修正",
        description: mathSummary.nextAction,
      },
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
        isDraftEquilibriumStatus(project.equilibriumResult?.status)
          ? "重新尝试符号求解"
          : "开始符号求解",
      reason:
        isDraftEquilibriumStatus(project.equilibriumResult?.status)
          ? "当前只得到隐式或失败草稿，需要先重新求解或收窄模型。"
          : "模型已经确认，下一步可以生成符号均衡推导。",
      targetTab: "equilibrium",
      action: {
        kind: "solve_equilibrium",
        agentAction: "solve_equilibrium",
        label:
          isDraftEquilibriumStatus(project.equilibriumResult?.status)
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

  if (isDraftEquilibriumStatus(project.equilibriumResult?.status)) {
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

function hasExecutablePendingDecision(
  pendingKind: ResearchSessionDecision["kind"] | undefined
) {
  return (
    pendingKind === "solve_equilibrium" ||
    pendingKind === "analyze_properties" ||
    pendingKind === "draft_paper"
  );
}

function isSafeContinuationActionKind(
  kind: NextAgentActionKind
): kind is SafeContinuationStep["kind"] {
  return kind !== "choose_direction" && kind !== "answer_model_question";
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

function getTabForVersionReviewSummary(
  summary: ReturnType<typeof buildVersionReviewSummary>
): ResearchAssetsTab {
  const latestAppliedItem =
    summary.reviewItems.find((item) => item.action !== "rejected_patch") ??
    summary.reviewItems.find(
      (item) => item.priority === summary.highestPriority
    );

  switch (latestAppliedItem?.assetKind) {
    case "model":
      return "equilibrium";
    case "equilibrium":
      return "properties";
    case "properties":
      return "paper";
    case "paper":
      return "paper";
    default:
      return "history";
  }
}

function formatAffectedAssetKinds(kinds: ResearchAssetKind[]) {
  if (kinds.length === 0) return "后续资产";
  return kinds.map(formatPatchKind).join("、");
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
