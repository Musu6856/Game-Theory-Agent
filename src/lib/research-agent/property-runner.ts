import { generateResearchProject } from "../ai-research-generation.ts";
import { createResearchAssetPatch } from "../research-asset-patch.ts";
import { createInitialResearchSession } from "../research-session.ts";
import type {
  PropertyAnalysis,
  ResearchAssetChange,
  ResearchProject,
} from "../types";
import type {
  ResearchCompletionClient,
  ResearchGenerationRequest,
  ResearchGenerationResponse,
} from "../research-generation/types.ts";
import { createPropertyAnalysisPlan } from "./planner.ts";
import {
  createResumableAgentRun,
  shouldSkipCompletedStep,
  type AgentResumeRequest,
} from "./resume.ts";
import {
  appendTraceEvent,
  updateStepStatus,
  type AgentRun,
} from "./state.ts";
import { appendAgentRunToProject } from "./trace.ts";

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

  if (!shouldSkipCompletedStep(agentRun, "prepare-properties")) {
    agentRun = updateStepStatus(agentRun, "prepare-properties", "running", now);
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
    agentRun = updateStepStatus(agentRun, "prepare-properties", "completed", now);
  }

  agentRun = updateStepStatus(agentRun, "draft-properties", "running", now);
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
  const analysisResult = await analyzeProperties(
    {
      action: "analyze_properties",
      rawIdea: request.rawIdea,
      project: request.project,
    },
    client
  );
  const candidateAnalyses = analysisResult.project.propertyAnalyses ?? [];

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
    agentRun = updateStepStatus(agentRun, "draft-properties", "failed", now);
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
  agentRun = updateStepStatus(agentRun, "draft-properties", "completed", now);

  agentRun = updateStepStatus(agentRun, "review-properties", "running", now);
  const review = reviewPropertyAnalysisCandidates(candidateAnalyses);
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
  agentRun = updateStepStatus(agentRun, "review-properties", "completed", now);

  agentRun = updateStepStatus(
    agentRun,
    "propose-properties-patch",
    "running",
    now
  );
  const patch = createPropertyAnalysisCandidatePatch({
    analyses: candidateAnalyses,
    now,
    sourceMessageId:
      analysisResult.project.researchSession?.messages.at(-1)?.id ??
      request.project.researchSession?.messages.at(-1)?.id,
    riskNotes: review.issues,
  });
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "propose-properties-patch",
      type: "tool_result",
      message:
        "Created a reviewable property analysis patch and paused for user approval.",
      metadata: {
        patchId: patch.id,
        changeCount: patch.changes.length,
      },
    },
    now
  );
  agentRun = updateStepStatus(
    agentRun,
    "propose-properties-patch",
    "completed",
    now
  );
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
    patch,
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

function reviewPropertyAnalysisCandidates(analyses: PropertyAnalysis[]) {
  const issues: string[] = [];

  if (analyses.length < 3) {
    issues.push("候选性质分析少于 3 条，难以形成稳定的命题组。");
  }

  const duplicateIds = findDuplicateIds(analyses);
  if (duplicateIds.length > 0) {
    issues.push(`存在重复命题 id：${duplicateIds.join("、")}。`);
  }

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

  return {
    ok: issues.length === 0,
    issues,
  };
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
    analysisResult.project.researchSession ??
    originalProject.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);
  const previousPatches = originalProject.researchSession?.assetPatches ?? [];
  const messages = [
    ...session.messages,
    {
      id: `msg-properties-agent-review-${now}`,
      role: "assistant" as const,
      content: createReviewMessage(analysisResult.assistantMessage, reviewIssues),
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
        assetPatches: [...previousPatches, patch],
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

function createReviewMessage(
  assistantMessage: string | undefined,
  reviewIssues: string[]
) {
  const reviewLine =
    reviewIssues.length > 0
      ? `自检提示：${reviewIssues.join("；")}。`
      : "自检结果：暂未发现阻断论文整理的明显风险。";

  return [
    assistantMessage?.trim() || "我已生成一组性质分析候选。",
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
