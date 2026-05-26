import { generateResearchProject } from "../ai-research-generation.ts";
import { createResearchAssetPatch } from "../research-asset-patch.ts";
import { createInitialResearchSession } from "../research-session.ts";
import type {
  PropertyAnalysis,
  ResearchAssetChange,
  ResearchProject,
} from "../types";
import { verifyPropertyAnalysisMathConsistency } from "./math-verifier.ts";
import type {
  ResearchCompletionClient,
  ResearchGenerationRequest,
  ResearchGenerationResponse,
} from "../research-generation/types.ts";
import {
  appendOrReplaceProposedPatch,
  recordProposedPatchStep,
} from "./patch-proposals.ts";
import { createPropertyAnalysisPlan } from "./planner.ts";
import {
  createResumableAgentRun,
  shouldSkipCompletedStep,
  type AgentResumeRequest,
} from "./resume.ts";
import {
  appendTraceEvent,
  updateStepStatusAndNotify,
  type AgentCheckpointSink,
  type AgentRun,
} from "./state.ts";
import { appendAgentRunToProject } from "./trace.ts";
import { reviewPropertyAnalysesWithSympy } from "./sympy-property-review.ts";

export type PropertyAnalysisAgentRequest = {
  rawIdea: string;
  project: ResearchProject;
  resume?: AgentResumeRequest;
};

export type PropertyAnalysisAgentClient = ResearchCompletionClient & {
  analyzeProperties?: (
    request: ResearchGenerationRequest,
    client: ResearchCompletionClient
  ) => Promise<ResearchGenerationResponse>;
  onAgentCheckpoint?: AgentCheckpointSink;
};

export type PropertyAnalysisAgentResult = ResearchGenerationResponse & {
  agentRun: AgentRun;
};

export async function runPropertyAnalysisAgent(
  request: PropertyAnalysisAgentRequest,
  client: PropertyAnalysisAgentClient = {}
): Promise<PropertyAnalysisAgentResult> {
  const now = client.now ?? Date.now();
  const runId = client.id
    ? `agent-properties-${client.id}`
    : `agent-properties-${now}`;
  let agentRun = createResumableAgentRun({
    project: request.project,
    resume: request.resume,
    fallback: {
      id: runId,
      action: "analyze_properties",
      goal: request.rawIdea.trim(),
      now,
      plan: createPropertyAnalysisPlan(),
    },
  });
  if (!request.resume) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        type: "plan_created",
        message: "Created property analysis review plan.",
        metadata: {
          stepCount: agentRun.plan.length,
          equilibriumStatus: request.project.equilibriumResult?.status,
        },
      },
      now
    );
  }
  const recordStepStatus = async (
    stepId: string,
    status: AgentRun["plan"][number]["status"],
    metadata?: Record<string, unknown>
  ) => {
    agentRun = await updateStepStatusAndNotify(
      agentRun,
      stepId,
      status,
      now,
      metadata,
      client.onAgentCheckpoint
    );
  };

  if (request.project.equilibriumResult?.status !== "solved") {
    await recordStepStatus("prepare-properties", "running");
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "prepare-properties",
        type: "fallback",
        message:
          "性质分析需要先应用 solved 状态的均衡结果，暂不生成候选。",
        metadata: {
          hasEquilibrium: Boolean(request.project.equilibriumResult),
          equilibriumStatus: request.project.equilibriumResult?.status,
        },
      },
      now
    );
    await recordStepStatus("prepare-properties", "failed");
    agentRun = {
      ...agentRun,
      status: "failed",
      currentStepId: undefined,
      pauseReason:
        "性质分析需要先应用 solved 状态的均衡 patch。",
      completedAt: now,
    };

    return {
      project: attachAgentRun(request.project, agentRun),
      usedFallback: false,
      assistantMessage:
        "性质分析需要先应用 solved 状态的均衡 patch；我没有生成新的性质分析修改建议。",
      agentRun,
    };
  }

  if (!shouldSkipCompletedStep(agentRun, "prepare-properties")) {
    await recordStepStatus("prepare-properties", "running");
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "prepare-properties",
        type: "model_result",
        message: "Prepared confirmed equilibrium assets for property analysis.",
        metadata: {
          hasEquilibrium: Boolean(request.project.equilibriumResult),
          equilibriumStatus: request.project.equilibriumResult?.status,
          conditionCount: request.project.equilibriumResult?.conditions.length ?? 0,
        },
      },
      now
    );
    await recordStepStatus("prepare-properties", "completed");
  }

  await recordStepStatus("draft-properties", "running");
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-properties",
      type: "model_call",
      message:
        "Requested symbolic property analysis candidates from the single-step research layer.",
      metadata: { toolName: "research.analyzeProperties" },
    },
    now
  );

  const analyzeProperties = client.analyzeProperties ?? generateResearchProject;
  let analysisResult = await analyzeProperties(
    {
      action: "analyze_properties",
      rawIdea: request.rawIdea,
      project: request.project,
    },
    client
  );
  let candidateAnalyses = analysisResult.project.propertyAnalyses ?? [];

  if (candidateAnalyses.length === 0) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "draft-properties",
        type: "fallback",
        message: "Property analysis candidates were unavailable; returning single-step result.",
        metadata: { usedFallback: analysisResult.usedFallback },
      },
      now
    );
    await recordStepStatus("draft-properties", "failed");
    return {
      ...analysisResult,
      project: attachAgentRun(analysisResult.project, agentRun),
      agentRun,
    };
  }

  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-properties",
      type: "model_result",
      message: "Received property analysis candidates.",
      metadata: {
        usedFallback: analysisResult.usedFallback,
        analysisCount: candidateAnalyses.length,
        operationTypes: Array.from(
          new Set(candidateAnalyses.map((analysis) => analysis.operation))
        ),
      },
    },
    now
  );
  await recordStepStatus("draft-properties", "completed");

  await recordStepStatus("review-properties", "running");
  let review = await reviewPropertyAnalysisCandidates(
    candidateAnalyses,
    request.project
  );
  if (!review.ok) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-properties",
        type: "fallback",
        message:
          "Property analysis self-review found repairable risks; requested one bounded repair attempt.",
        metadata: {
          repairAttempted: true,
          issues: review.issues,
        },
      },
      now
    );
    const repairResult = await analyzeProperties(
      {
        action: "analyze_properties",
        rawIdea: request.rawIdea,
        userMessage: createPropertyRepairMessage(review.issues),
        project: request.project,
      },
      client
    );
    const repairedAnalyses = repairResult.project.propertyAnalyses ?? [];

    if (repairedAnalyses.length > 0) {
      const repairReview = await reviewPropertyAnalysisCandidates(
        repairedAnalyses,
        request.project
      );
      agentRun = appendTraceEvent(
        agentRun,
        {
          stepId: "review-properties",
          type: "tool_result",
          message: repairReview.ok
            ? "Property analysis repair candidates passed self-review."
            : "Property analysis repair candidates still have review risks.",
          metadata: {
            repaired: repairReview.ok,
            remainingIssues: repairReview.issues,
            originalIssueCount: review.issues.length,
          },
        },
        now
      );
      if (repairReview.issues.length <= review.issues.length) {
        analysisResult = repairResult;
        candidateAnalyses = repairedAnalyses;
        review = repairReview;
      }
    } else {
      agentRun = appendTraceEvent(
        agentRun,
        {
          stepId: "review-properties",
          type: "fallback",
          message:
            "Property analysis repair attempt returned no usable analyses; keeping the original candidate.",
          metadata: { repairAttempted: true, repairReturnedCandidate: false },
        },
        now
      );
    }
  }
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "review-properties",
      type: "tool_result",
      message: review.ok
        ? "Property analysis candidates passed the first proposition review."
        : "Property analysis candidates have risks that must be reviewed before writing.",
      metadata: {
        ok: review.ok,
        issues: review.issues,
      },
    },
    now
  );
  await recordStepStatus("review-properties", "completed");

  const patch = createPropertyAnalysisCandidatePatch({
    analyses: candidateAnalyses,
    now,
    sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    riskNotes: review.issues,
  });
  const proposal = recordProposedPatchStep({
    agentRun,
    project: request.project,
    patch,
    stepId: "propose-properties-patch",
    now,
    message:
      "Created a reviewable property analysis patch and paused for user approval.",
  });
  agentRun = proposal.agentRun;
  agentRun = {
    ...agentRun,
    status: "paused",
    currentStepId: undefined,
    pauseReason: "等待用户审阅并应用性质分析修改建议。",
    requiresApproval: true,
    completedAt: now,
  };

  const project = attachPropertyPatchForReview({
    originalProject: request.project,
    analysisResult,
    patch: proposal.patch,
    agentRun,
    now,
    reviewIssues: review.issues,
  });

  return {
    project,
    usedFallback: analysisResult.usedFallback,
    assistantMessage:
      "我已经完成性质分析的第一轮审查，并在右侧准备了一条性质分析修改建议。请先审阅并应用，再整理命题或论文草稿。",
    agentRun,
  };
}

async function reviewPropertyAnalysisCandidates(
  analyses: PropertyAnalysis[],
  project: ResearchProject
) {
  const issues: string[] = [];

  if (analyses.length < 3) {
    issues.push("候选性质分析少于 3 条，难以形成稳定的命题组。");
  }

  const duplicateIds = findDuplicateIds(analyses);
  if (duplicateIds.length > 0) {
    issues.push(`存在重复命题 id：${duplicateIds.join("、")}。`);
  }

  issues.push(...reviewDuplicatePropertyClaims(analyses));

  analyses.forEach((analysis, index) => {
    if (!analysis.target.trim()) {
      issues.push(`第 ${index + 1} 条缺少分析对象。`);
    }

    if (!analysis.parameter.trim()) {
      issues.push(`第 ${index + 1} 条缺少参数变化对象。`);
    }

    if (!analysis.symbolicResult.trim()) {
      issues.push(`第 ${index + 1} 条缺少符号结果。`);
    }

    if (!analysis.signCondition.trim()) {
      issues.push(`第 ${index + 1} 条缺少符号条件。`);
    }

    if (!analysis.propositionDraft.trim()) {
      issues.push(`第 ${index + 1} 条缺少命题草稿。`);
    }

    if (!analysis.proofSketch.trim()) {
      issues.push(`第 ${index + 1} 条缺少证明草图。`);
    }
  });

  const mathReview = verifyPropertyAnalysisMathConsistency({
    model: project.hotellingModel,
    equilibrium: project.equilibriumResult,
    analyses,
  });
  issues.push(...mathReview.issues);

  const sympyCandidateIndexes = mathReview.checks
    .filter(
      (check) =>
        check.kind === "calculus_recheck" &&
        (check.status === "manual_review" || check.status === "unsupported") &&
        typeof check.analysisIndex === "number"
    )
    .map((check) => check.analysisIndex as number);

  if (sympyCandidateIndexes.length > 0) {
    issues.push(
      ...(
        await reviewPropertyAnalysesWithSympy({
          equilibrium: project.equilibriumResult,
          analyses,
          onlyAnalysisIndexes: sympyCandidateIndexes,
        })
      ).issues
    );
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function createPropertyRepairMessage(issues: string[]) {
  return [
    "Agent 自检发现性质分析候选还不适合进入论文整理，请只修复以下问题，保持当前模型、均衡和符号表不变：",
    ...issues.map((issue) => `- ${issue}`),
    "修复后返回 3 到 5 条完整 propertyAnalyses；每条必须有符号结果、符号条件、命题草稿和证明草图。",
  ].join("\n");
}

function createPropertyAnalysisCandidatePatch({
  analyses,
  now,
  sourceMessageId,
  riskNotes,
}: {
  analyses: PropertyAnalysis[];
  now: number;
  sourceMessageId?: string;
  riskNotes: string[];
}) {
  const note =
    riskNotes.length > 0
      ? `Agent 自检提示：${riskNotes.join("；")}`
      : "Agent 自检未发现阻断论文整理的明显风险。";
  const changes: ResearchAssetChange[] = [
    {
      kind: "replace",
      path: "propertyAnalyses",
      value: analyses,
      note,
    },
  ];

  return createResearchAssetPatch({
    id: `patch-properties-agent-${now}`,
    kind: "properties",
    summary: "性质分析 Agent 建议应用这组比较静态与命题草稿",
    changes,
    createdAt: now,
    sourceMessageId,
  });
}

function attachPropertyPatchForReview({
  originalProject,
  analysisResult,
  patch,
  agentRun,
  now,
  reviewIssues,
}: {
  originalProject: ResearchProject;
  analysisResult: ResearchGenerationResponse;
  patch: ReturnType<typeof createPropertyAnalysisCandidatePatch>;
  agentRun: AgentRun;
  now: number;
  reviewIssues: string[];
}) {
  const session =
    originalProject.researchSession ??
    analysisResult.project.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);
  const previousPatches = originalProject.researchSession?.assetPatches ?? [];
  const messages = [
    ...session.messages,
    {
      id: `msg-properties-agent-review-${now}`,
      role: "assistant" as const,
      content: createReviewMessage(reviewIssues),
      createdAt: 0,
    },
  ];

  return attachAgentRun(
    {
      ...analysisResult.project,
      propertyAnalyses: originalProject.propertyAnalyses,
      researchSession: {
        ...session,
        phase: "analysis",
        messages,
        agentRun,
        assetPatches: appendOrReplaceProposedPatch(previousPatches, patch),
        assetFreshness: {
          ...(session.assetFreshness ?? createFreshResearchAssetFreshness()),
          properties: originalProject.propertyAnalyses?.length ? "stale" : "fresh",
        },
        assetSummary: {
          ...session.assetSummary,
          pendingDecision: {
            kind: "analyze_properties",
            prompt:
              "请先审阅并应用性质分析修改建议，再整理命题或论文草稿。",
          },
          nextActions: [
            "审阅右侧待处理的性质分析修改建议",
            "应用或拒绝性质分析 patch",
            "应用后再整理论文命题和正文草稿",
          ],
        },
      },
    },
    agentRun
  );
}

function createReviewMessage(reviewIssues: string[]) {
  const reviewLine =
    reviewIssues.length > 0
      ? `自检提示：${reviewIssues.join("；")}。`
      : "自检结果：暂未发现阻断论文整理的明显风险。";

  return [
    "我已生成一组性质分析候选，并放到右侧作为待审核修改建议。",
    "",
    `${reviewLine}我没有直接把它们写入右侧性质分析资产，而是放到右侧作为待审核修改建议。`,
  ].join("\n");
}

function findDuplicateIds(analyses: PropertyAnalysis[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const analysis of analyses) {
    if (seen.has(analysis.id)) duplicates.add(analysis.id);
    seen.add(analysis.id);
  }

  return [...duplicates];
}

function reviewDuplicatePropertyClaims(analyses: PropertyAnalysis[]) {
  const issues: string[] = [];
  const groups = new Map<string, PropertyAnalysis[]>();

  analyses.forEach((analysis) => {
    const key = getPropertyClaimKey(analysis);
    if (!key) return;
    groups.set(key, [...(groups.get(key) ?? []), analysis]);
  });

  groups.forEach((group, key) => {
    if (group.length < 2) return;

    const signs = new Map(
      group.map((analysis) => [analysis.id, inferClaimDirection(analysis)])
    );
    const knownSigns = new Set(
      [...signs.values()].filter((sign) => sign !== "unknown")
    );

    if (knownSigns.size > 1) {
      issues.push(
        `性质分析命题组内部互相冲突：${formatClaimKey(key)} 出现了相反方向的结论，请合并或修正重复命题。`
      );
      return;
    }

    issues.push(
      `性质分析命题组存在重复主题：${formatClaimKey(key)} 被多条命题重复分析，请合并为一条或改成不同角度。`
    );
  });

  return issues;
}

function getPropertyClaimKey(analysis: PropertyAnalysis) {
  const target = normalizePropertyClaimToken(analysis.target);
  const parameter = normalizePropertyClaimToken(analysis.parameter);
  const operation = analysis.operation.trim();
  if (!target || !parameter || !operation) return "";
  return `${operation}:${target}:${parameter}`;
}

function normalizePropertyClaimToken(value: string) {
  return value
    .replace(/\\tau/g, "tau")
    .replace(/\\alpha/g, "alpha")
    .replace(/\\beta/g, "beta")
    .replace(/\\delta/g, "delta")
    .replace(/[{}]/g, "")
    .replace(/\^\*/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function inferClaimDirection(analysis: PropertyAnalysis) {
  const condition = analysis.signCondition.replace(/\s+/g, "");
  if (/zero|为零|等于零|恒为零/i.test(condition)) return "zero";
  if (/nonnegative|非负|大于等于零|>=0/i.test(condition)) return "unknown";
  if (/nonpositive|非正|小于等于零|<=0/i.test(condition)) return "unknown";
  if (/positive|为正|正向|正相关|增加|提高|上升/i.test(condition)) {
    return "positive";
  }
  if (/negative|为负|负向|负相关|降低|下降|减少/i.test(condition)) {
    return "negative";
  }

  const result = normalizePropertyClaimToken(analysis.symbolicResult);
  const rhs = result.split("=").at(-1)?.trim() ?? "";
  if (rhs === "0") return "zero";
  if (rhs.startsWith("-")) return "negative";
  if (rhs.startsWith("+") || /^\d/.test(rhs)) return "positive";

  return "unknown";
}

function formatClaimKey(key: string) {
  const [, target, parameter] = key.split(":");
  return `${target} 对 ${parameter}`;
}

function createFreshResearchAssetFreshness() {
  return {
    model: "fresh" as const,
    equilibrium: "fresh" as const,
    properties: "fresh" as const,
  };
}

function attachAgentRun(project: ResearchProject, agentRun: AgentRun) {
  return appendAgentRunToProject(project, agentRun);
}
