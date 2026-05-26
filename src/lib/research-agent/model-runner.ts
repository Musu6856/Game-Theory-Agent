import { generateResearchProject } from "../ai-research-generation.ts";
import { createResearchAssetPatch } from "../research-asset-patch.ts";
import { evaluateHotellingModelSolvability } from "../research-model-solvability.ts";
import { createInitialResearchSession } from "../research-session.ts";
import type {
  HotellingModel,
  ResearchAssetChange,
  ResearchProject,
  ResearchSessionAssetSummary,
} from "../types";
import { adoptResearchDirection } from "../research-session.ts";
import type {
  ResearchCompletionClient,
  ResearchGenerationRequest,
  ResearchGenerationResponse,
} from "../research-generation/types.ts";
import {
  appendOrReplaceProposedPatch,
  recordProposedPatchStep,
} from "./patch-proposals.ts";
import { createModelGenerationPlan } from "./planner.ts";
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

export type ModelGenerationAgentRequest = {
  rawIdea: string;
  selectedDirectionId: string;
  userMessage?: string;
  project: ResearchProject;
  resume?: AgentResumeRequest;
};

export type ModelGenerationAgentClient = ResearchCompletionClient & {
  buildModel?: (
    request: ResearchGenerationRequest,
    client: ResearchCompletionClient
  ) => Promise<ResearchGenerationResponse>;
  onAgentCheckpoint?: AgentCheckpointSink;
};

export type ModelGenerationAgentResult = ResearchGenerationResponse & {
  agentRun: AgentRun;
};

export async function runModelGenerationAgent(
  request: ModelGenerationAgentRequest,
  client: ModelGenerationAgentClient = {}
): Promise<ModelGenerationAgentResult> {
  const now = client.now ?? Date.now();
  const runId = client.id ? `agent-model-${client.id}` : `agent-model-${now}`;
  let agentRun = createResumableAgentRun({
    project: request.project,
    resume: request.resume,
    fallback: {
      id: runId,
      action: "build_model",
      goal: request.rawIdea.trim(),
      now,
      plan: createModelGenerationPlan(),
    },
  });
  if (!request.resume) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        type: "plan_created",
        message: "Created model generation review plan.",
        metadata: {
          selectedDirectionId: request.selectedDirectionId,
          stepCount: agentRun.plan.length,
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

  const selectedDirection = request.project.researchSession?.directions.find(
    (direction) => direction.id === request.selectedDirectionId
  );
  if (!shouldSkipCompletedStep(agentRun, "adopt-direction")) {
    await recordStepStatus("adopt-direction", "running");
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "adopt-direction",
        type: "model_result",
        message: "Selected direction prepared for model generation.",
        metadata: {
          selectedDirectionId: request.selectedDirectionId,
          directionTitle: selectedDirection?.title,
          evidenceSourceIds: selectedDirection?.evidenceSourceIds ?? [],
        },
      },
      now
    );
    await recordStepStatus("adopt-direction", "completed");
  }

  await recordStepStatus("draft-model", "running");
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-model",
      type: "model_call",
      message: "Requested a model candidate from the single-step research layer.",
      metadata: { toolName: "research.buildModel" },
    },
    now
  );

  const buildModel = client.buildModel ?? generateResearchProject;
  let buildResult = await buildModel(
    {
      action: "build_model",
      rawIdea: request.rawIdea,
      selectedDirectionId: request.selectedDirectionId,
      userMessage: request.userMessage,
      project: request.project,
    },
    client
  );
  let candidateModel = buildResult.project.hotellingModel;

  if (!candidateModel) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "draft-model",
        type: "fallback",
        message: "Model candidate was unavailable; returning single-step result.",
        metadata: { usedFallback: buildResult.usedFallback },
      },
      now
    );
    await recordStepStatus("draft-model", "failed");
    return {
      ...buildResult,
      project: attachAgentRun(buildResult.project, agentRun),
      agentRun,
    };
  }

  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-model",
      type: "model_result",
      message: "Received a model candidate.",
      metadata: {
        usedFallback: buildResult.usedFallback,
        assumptionCount: candidateModel.assumptions.length,
        utilityFunctionCount: candidateModel.utilityFunctions.length,
        profitFunctionCount: candidateModel.profitFunctions.length,
        symbolCount: candidateModel.symbols.length,
      },
    },
    now
  );
  await recordStepStatus("draft-model", "completed");

  await recordStepStatus("review-model", "running");
  let review = reviewModelCandidate(candidateModel);
  if (!review.ok) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-model",
        type: "fallback",
        message:
          "Model self-review found repairable risks; requested one bounded repair attempt.",
        metadata: {
          repairAttempted: true,
          issues: review.issues,
        },
      },
      now
    );
    const repairResult = await buildModel(
      {
        action: "build_model",
        rawIdea: request.rawIdea,
        selectedDirectionId: request.selectedDirectionId,
        userMessage: createModelRepairMessage({
          originalMessage: request.userMessage,
          issues: review.issues,
        }),
        project: request.project,
      },
      client
    );
    const repairedModel = repairResult.project.hotellingModel;

    if (repairedModel) {
      const repairReview = reviewModelCandidate(repairedModel);
      agentRun = appendTraceEvent(
        agentRun,
        {
          stepId: "review-model",
          type: "tool_result",
          message: repairReview.ok
            ? "Model repair candidate passed self-review."
            : "Model repair candidate still has review risks.",
          metadata: {
            repaired: repairReview.ok,
            remainingIssues: repairReview.issues,
            originalIssueCount: review.issues.length,
          },
        },
        now
      );
      if (repairReview.issues.length <= review.issues.length) {
        buildResult = repairResult;
        candidateModel = repairedModel;
        review = repairReview;
      }
    } else {
      agentRun = appendTraceEvent(
        agentRun,
        {
          stepId: "review-model",
          type: "fallback",
          message:
            "Model repair attempt returned no usable model; keeping the original candidate.",
          metadata: { repairAttempted: true, repairReturnedCandidate: false },
        },
        now
      );
    }
  }
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "review-model",
      type: "tool_result",
      message: review.ok
        ? "Model candidate passed the first solvability review."
        : "Model candidate has risks that must be reviewed before solving.",
      metadata: {
        ok: review.ok,
        issues: review.issues,
      },
    },
    now
  );
  await recordStepStatus("review-model", "completed");

  const patch = createModelCandidatePatch({
    model: candidateModel,
    now,
    sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    riskNotes: review.issues,
  });
  const proposal = recordProposedPatchStep({
    agentRun,
    project: request.project,
    patch,
    stepId: "propose-model-patch",
    now,
    message: "Created a reviewable model patch and paused for user approval.",
  });
  agentRun = proposal.agentRun;
  agentRun = {
    ...agentRun,
    status: "paused",
    currentStepId: undefined,
    pauseReason: "等待用户审阅并应用模型修改建议。",
    requiresApproval: true,
    completedAt: now,
  };

  const project = attachModelPatchForReview({
    originalProject: request.project,
    buildResult,
    patch: proposal.patch,
    agentRun,
    now,
    reviewIssues: review.issues,
  });

  return {
    project,
    usedFallback: buildResult.usedFallback,
    assistantMessage:
      "我已经完成模型生成的第一轮审查，并在右侧准备了一条模型修改建议。请先审阅并应用，再进入均衡求解。",
    agentRun,
  };
}

function reviewModelCandidate(model: HotellingModel) {
  const solvability = evaluateHotellingModelSolvability(model);
  const issues = [...solvability.issues];

  if (model.utilityFunctions.length < 2) {
    issues.push("效用函数数量偏少，至少应覆盖核心参与方。");
  }

  if (model.profitFunctions.length < 1) {
    issues.push("缺少平台利润函数，无法进入均衡求解。");
  }

  if (model.assumptions.length < 2) {
    issues.push("假设数量偏少，建议补充参与者、时序和可解性边界。");
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function createModelRepairMessage({
  originalMessage,
  issues,
}: {
  originalMessage?: string;
  issues: string[];
}) {
  return [
    originalMessage?.trim(),
    "Agent 自检发现模型候选还不适合直接进入均衡求解，请只修复以下问题，保持同一个研究方向，不要扩展成新论文题目：",
    ...issues.map((issue) => `- ${issue}`),
    "修复后仍返回完整 hotellingModel JSON。",
  ]
    .filter(Boolean)
    .join("\n");
}

function createModelCandidatePatch({
  model,
  now,
  sourceMessageId,
  riskNotes,
}: {
  model: HotellingModel;
  now: number;
  sourceMessageId?: string;
  riskNotes: string[];
}) {
  const note = riskNotes.length > 0
    ? `Agent 自检提示：${riskNotes.join("；")}`
    : "Agent 自检未发现阻断均衡求解的明显风险。";
  const changes: ResearchAssetChange[] = [
    {
      kind: "replace",
      path: "hotellingModel.sides",
      value: model.sides,
      note: "更新参与者两侧命名。",
    },
    {
      kind: "replace",
      path: "hotellingModel.platforms",
      value: model.platforms,
      note: "更新平台集合。",
    },
    {
      kind: "replace",
      path: "hotellingModel.timing",
      value: model.timing,
      note: "更新博弈时序和决策变量。",
    },
    {
      kind: "replace",
      path: "hotellingModel.modelSetupDraft",
      value: model.modelSetupDraft,
      note,
    },
    {
      kind: "replace",
      path: "hotellingModel.demandDerivation",
      value: model.demandDerivation,
      note: "更新需求推导口径，使后续均衡求解继承同一模型设定。",
    },
    {
      kind: "replace",
      path: "hotellingModel.assumptions",
      value: model.assumptions,
      note: "更新模型假设。",
    },
    {
      kind: "replace",
      path: "hotellingModel.utilityFunctions",
      value: model.utilityFunctions,
      note: "更新效用函数。",
    },
    {
      kind: "replace",
      path: "hotellingModel.profitFunctions",
      value: model.profitFunctions,
      note: "更新利润函数。",
    },
    {
      kind: "replace",
      path: "hotellingModel.symbols",
      value: model.symbols,
      note: "更新符号表。",
    },
  ];

  return createResearchAssetPatch({
    id: `patch-model-agent-${now}`,
    kind: "model",
    summary: "模型生成 Agent 建议应用这版模型设定",
    changes,
    createdAt: now,
    sourceMessageId,
  });
}

function attachModelPatchForReview({
  originalProject,
  buildResult,
  patch,
  agentRun,
  now,
  reviewIssues,
}: {
  originalProject: ResearchProject;
  buildResult: ResearchGenerationResponse;
  patch: ReturnType<typeof createModelCandidatePatch>;
  agentRun: AgentRun;
  now: number;
  reviewIssues: string[];
}) {
  const session =
    originalProject.researchSession ??
    buildResult.project.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);
  const reviewBaseProject = createReviewBaseProject(
    originalProject,
    buildResult.project
  );
  const previousPatches = originalProject.researchSession?.assetPatches ?? [];
  const messages = [
    ...session.messages,
    {
      id: `msg-model-agent-review-${now}`,
      role: "assistant" as const,
      content: createReviewMessage(reviewIssues),
      createdAt: 0,
    },
  ];

  return attachAgentRun(
    {
      ...reviewBaseProject,
      researchSession: {
        ...session,
        phase: "model",
        messages,
        agentRun,
        assetPatches: appendOrReplaceProposedPatch(previousPatches, patch),
        assetSummary: {
          ...createReviewAssetSummary(reviewBaseProject, session.assetSummary),
          pendingDecision: {
            kind: "answer_model_question",
            prompt:
              "请先审阅并应用模型修改建议，再确认模型并进入均衡求解。",
          },
          nextActions: [
            "审阅右侧待处理的模型修改建议",
            "应用或拒绝模型 patch",
            "应用后再确认模型并进入均衡求解",
          ],
        },
      },
    },
    agentRun
  );
}

function createReviewAssetSummary(
  reviewBaseProject: ResearchProject,
  fallbackSummary: ResearchSessionAssetSummary
) {
  const model = reviewBaseProject.hotellingModel;

  if (!model) return fallbackSummary;

  return {
    ...fallbackSummary,
    confirmedAssumptions: model.assumptions,
    utilityFunctions: model.utilityFunctions.map(
      (entry) => `$${entry.expression}$`
    ),
    equilibriumStatus: "等待模型确认" as const,
  };
}

function createReviewBaseProject(
  originalProject: ResearchProject,
  candidateProject: ResearchProject
) {
  if (originalProject.hotellingModel) {
    return {
      ...candidateProject,
      hotellingModel: originalProject.hotellingModel,
      equilibriumResult: originalProject.equilibriumResult,
      propertyAnalyses: originalProject.propertyAnalyses,
    };
  }

  const selectedDirectionId =
    candidateProject.researchSession?.assetSummary.currentDirection?.id ??
    originalProject.researchSession?.assetSummary.currentDirection?.id;

  if (selectedDirectionId) {
    try {
      const adopted = adoptResearchDirection(originalProject, selectedDirectionId);
      return {
        ...candidateProject,
        hotellingModel: adopted.hotellingModel,
        equilibriumResult: adopted.equilibriumResult,
        propertyAnalyses: originalProject.propertyAnalyses,
      };
    } catch {
      return candidateProject;
    }
  }

  return candidateProject;
}

function createReviewMessage(reviewIssues: string[]) {
  const reviewLine =
    reviewIssues.length > 0
      ? `自检提示：${reviewIssues.join("；")}。`
      : "自检结果：暂未发现阻断符号均衡求解的明显风险。";

  return [
    "我已生成一版模型候选，并放到右侧作为待审核修改建议。",
    "",
    `${reviewLine}我没有直接把它当作已确认模型推进到均衡，而是放到右侧作为待审核修改建议。`,
  ].join("\n");
}

function attachAgentRun(project: ResearchProject, agentRun: AgentRun) {
  return appendAgentRunToProject(project, agentRun);
}
