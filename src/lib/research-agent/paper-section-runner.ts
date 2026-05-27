import { createResearchAssetPatch } from "../research-asset-patch.ts";
import { createInitialResearchSession } from "../research-session.ts";
import type {
  PaperSection,
  ResearchAssetChange,
  ResearchAssetPatch,
  ResearchProject,
} from "../types";
import type { ResearchGenerationResponse } from "../research-generation/types.ts";
import {
  appendOrReplaceProposedPatch,
  recordProposedPatchStep,
} from "./patch-proposals.ts";
import { createPaperSectionRevisionPlan } from "./planner.ts";
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
import { assessProjectEquilibriumEvidence } from "./equilibrium-evidence.ts";

export type PaperSectionRevisionAgentRequest = {
  rawIdea: string;
  project: ResearchProject;
  sectionId: string;
  instruction?: string;
  resume?: AgentResumeRequest;
};

export type PaperSectionRevisionAgentClient = {
  now?: number;
  id?: string;
  onAgentCheckpoint?: AgentCheckpointSink;
};

export type PaperSectionRevisionAgentResult = ResearchGenerationResponse & {
  agentRun: AgentRun;
};

export async function runPaperSectionRevisionAgent(
  request: PaperSectionRevisionAgentRequest,
  client: PaperSectionRevisionAgentClient = {}
): Promise<PaperSectionRevisionAgentResult> {
  const now = client.now ?? Date.now();
  const sectionId = request.sectionId.trim();
  const runId = client.id
    ? `agent-paper-section-${client.id}`
    : `agent-paper-section-${now}`;
  let agentRun = createResumableAgentRun({
    project: request.project,
    resume: request.resume,
    fallback: {
      id: runId,
      action: "revise_paper_section",
      goal: request.rawIdea.trim(),
      now,
      plan: createPaperSectionRevisionPlan(),
    },
  });

  const targetSection = request.project.sections.find(
    (section) => section.id === sectionId
  );

  if (!request.resume) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        type: "plan_created",
        message: "Created section-level paper revision plan.",
        metadata: {
          sectionId,
          sectionTitle: targetSection?.title,
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

  if (!targetSection) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "select-paper-section",
        type: "error",
        message: "Target paper section was not found.",
        metadata: { sectionId },
      },
      now
    );
    await recordStepStatus("select-paper-section", "failed");
    return {
      project: attachAgentRun(request.project, agentRun),
      usedFallback: true,
      assistantMessage: "没有找到要改写的论文章节，本次没有生成修改建议。",
      agentRun,
    };
  }

  if (!shouldSkipCompletedStep(agentRun, "select-paper-section")) {
    await recordStepStatus("select-paper-section", "running");
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "select-paper-section",
        type: "tool_result",
        message: "Selected the target paper section and collected dependencies.",
        metadata: {
          sectionId: targetSection.id,
          sectionTitle: targetSection.title,
          dependencies: summarizeSectionDependencies(request.project),
        },
      },
      now
    );
    await recordStepStatus("select-paper-section", "completed");
  }

  await recordStepStatus("draft-paper-section", "running");
  const revisedSection = revisePaperSection({
    project: request.project,
    section: targetSection,
    instruction: request.instruction,
  });
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-paper-section",
      type: "model_result",
      message: "Drafted a section-level paper revision from applied assets.",
      metadata: {
        sectionId: revisedSection.id,
        sectionTitle: revisedSection.title,
        instruction: request.instruction?.trim(),
        contentLength: revisedSection.content.length,
      },
    },
    now
  );
  await recordStepStatus("draft-paper-section", "completed");

  await recordStepStatus("review-section-grounding", "running");
  const review = reviewPaperSectionRevision(request.project, revisedSection);
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "review-section-grounding",
      type: "tool_result",
      message: review.ok
        ? "Section revision passed the first grounding review."
        : "Section revision has gaps that should be reviewed before application.",
      metadata: {
        ok: review.ok,
        issues: review.issues,
      },
    },
    now
  );
  await recordStepStatus("review-section-grounding", "completed");

  const patch = createPaperSectionPatch({
    section: revisedSection,
    now,
    sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    groundingNote: createGroundingNote(request.project, review.issues),
  });
  const proposal = recordProposedPatchStep({
    agentRun,
    project: request.project,
    patch,
    stepId: "propose-section-patch",
    now,
    message:
      "Created a reviewable section-level paper patch and paused for user approval.",
    changedPaths: patch.changes.map((change) => change.path),
  });
  agentRun = proposal.agentRun;
  agentRun = {
    ...agentRun,
    status: "paused",
    currentStepId: undefined,
    pauseReason: "等待用户审阅并应用本章改写建议。",
    requiresApproval: true,
    completedAt: now,
  };

  const project = attachPaperSectionPatchForReview({
    originalProject: request.project,
    patch: proposal.patch,
    agentRun,
    now,
    section: revisedSection,
    reviewIssues: review.issues,
  });

  return {
    project,
    usedFallback: false,
    assistantMessage:
      "我已经生成本章改写建议，并放在右侧作为待审阅补丁。应用前不会覆盖现有论文正文。",
    agentRun,
  };
}

function revisePaperSection({
  project,
  section,
  instruction,
}: {
  project: ResearchProject;
  section: PaperSection;
  instruction?: string;
}): PaperSection {
  const direction = project.researchSession?.assetSummary.currentDirection;
  const model = project.hotellingModel;
  const equilibrium = project.equilibriumResult;
  const equilibriumEvidence = assessProjectEquilibriumEvidence(project);
  const analyses = project.propertyAnalyses ?? [];
  const trimmedInstruction = instruction?.trim();

  return {
    ...section,
    content: [
      section.content,
      "",
      "【章节级改写建议】",
      trimmedInstruction ? `改写重点：${trimmedInstruction}` : "",
      direction
        ? `研究方向：${direction.title}。${direction.summary}`
        : `研究主题：${project.refinedIdea || project.rawIdea}。`,
      model
        ? `模型依据：参与方为 ${model.sides.consumerSideName} 与 ${model.sides.merchantSideName}，平台为 ${model.platforms.join("、")}；本章应与当前假设、效用函数和利润函数保持一致。`
        : "模型依据：当前尚未应用稳定模型设定，本章只能保留为研究动机或占位草稿。",
      equilibriumEvidence.canCiteAsFormalEquilibrium
        ? "均衡依据：当前均衡可作为正式结果引用；引用时仍应保留存在条件和最优性证据。"
        : `均衡依据：${equilibriumEvidence.summary} 本章不应写成最终均衡结论。`,
      analyses.length > 0
        ? `性质依据：当前已有 ${analyses.length} 条比较静态或命题草稿，本章应核对命题编号、符号结果和经济直觉。`
        : "性质依据：当前尚无稳定性质分析，本章不应新增未经审阅的命题。",
      "来源依据：如已启用联网搜索，本章应只使用右侧来源摘要支持研究动机；正式引用仍需人工补齐格式。",
    ]
      .filter(Boolean)
      .join("\n\n"),
    status: "generated",
  };
}

function reviewPaperSectionRevision(
  project: ResearchProject,
  section: PaperSection
) {
  const issues: string[] = [];

  if (!section.content.trim()) {
    issues.push("本章改写内容为空。");
  }

  if (!project.hotellingModel && dependsOnModel(section)) {
    issues.push("本章依赖模型设定，但当前没有已应用的模型资产。");
  }

  const equilibriumEvidence = assessProjectEquilibriumEvidence(project);
  if (
    dependsOnEquilibrium(section) &&
    !equilibriumEvidence.canCiteAsFormalEquilibrium
  ) {
    issues.push(equilibriumEvidence.summary);
  }

  if (dependsOnProperties(section) && (project.propertyAnalyses?.length ?? 0) === 0) {
    issues.push("本章依赖命题或比较静态，但当前没有性质分析资产。");
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function createPaperSectionPatch({
  section,
  now,
  sourceMessageId,
  groundingNote,
}: {
  section: PaperSection;
  now: number;
  sourceMessageId?: string;
  groundingNote: string;
}) {
  const changes: ResearchAssetChange[] = [
    {
      kind: "replace",
      path: `sections[${section.id}]`,
      value: section,
      note: groundingNote,
    },
  ];

  return createResearchAssetPatch({
    id: `patch-paper-section-agent-${section.id}-${now}`,
    kind: "paper",
    summary: `章节级论文 Agent 建议改写「${section.title}」`,
    changes,
    createdAt: now,
    sourceMessageId,
  });
}

function attachPaperSectionPatchForReview({
  originalProject,
  patch,
  agentRun,
  now,
  section,
  reviewIssues,
}: {
  originalProject: ResearchProject;
  patch: ResearchAssetPatch;
  agentRun: AgentRun;
  now: number;
  section: PaperSection;
  reviewIssues: string[];
}) {
  const session =
    originalProject.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);

  return attachAgentRun(
    {
      ...originalProject,
      sections: originalProject.sections,
      researchSession: {
        ...session,
        phase: "paper",
        messages: [
          ...session.messages,
          {
            id: `msg-paper-section-agent-review-${now}`,
            role: "assistant" as const,
            content: createReviewMessage(section, reviewIssues),
            createdAt: now,
          },
        ],
        assetPatches: appendOrReplaceProposedPatch(
          session.assetPatches ?? [],
          patch
        ),
        assetSummary: {
          ...session.assetSummary,
          pendingDecision: {
            kind: "revise_paper_section",
            prompt: `请先审阅并应用「${section.title}」的章节级改写建议。`,
          },
          nextActions: [
            "审阅右侧待处理的章节改写建议",
            "应用或拒绝本章论文 patch",
            "应用后继续逐章补充引用、证明叙述和讨论边界",
          ],
        },
      },
    },
    agentRun
  );
}

function createGroundingNote(project: ResearchProject, reviewIssues: string[]) {
  const sourceCount = project.researchSession?.evidencePack?.sources.length ?? 0;
  const baseNotes = [
    `来源依据：联网来源 ${sourceCount} 条。`,
    `模型：${project.hotellingModel ? "已使用当前模型资产" : "缺少已应用模型资产"}。`,
    `均衡：${project.equilibriumResult?.status ?? "not_started"}。`,
    `性质：${project.propertyAnalyses?.length ?? 0} 条。`,
  ];

  if (reviewIssues.length > 0) {
    baseNotes.push(`Agent 自检提示：${reviewIssues.join("；")}。`);
  }

  return baseNotes.join(" ");
}

function createReviewMessage(section: PaperSection, reviewIssues: string[]) {
  const reviewLine =
    reviewIssues.length > 0
      ? `自检提示：${reviewIssues.join("；")}。`
      : "自检结果：暂未发现阻断本章改写的明显风险。";

  return [
    `我已经为「${section.title}」生成章节级改写建议。`,
    "",
    `${reviewLine}我没有直接覆盖论文正文，而是放到右侧作为待审阅 patch。`,
  ].join("\n");
}

function summarizeSectionDependencies(project: ResearchProject) {
  return {
    hasDirection: Boolean(project.researchSession?.assetSummary.currentDirection),
    hasEvidence: Boolean(project.researchSession?.evidencePack?.sources.length),
    hasModel: Boolean(project.hotellingModel),
    equilibriumStatus: project.equilibriumResult?.status,
    propertyAnalysisCount: project.propertyAnalyses?.length ?? 0,
  };
}

function dependsOnModel(section: PaperSection) {
  return /model|模型|假设|效用|利润|时序|参与方/.test(getSectionText(section));
}

function dependsOnEquilibrium(section: PaperSection) {
  return /equilibrium|均衡|闭式|foc|一阶|closed/.test(getSectionText(section));
}

function dependsOnProperties(section: PaperSection) {
  return /proposition|命题|比较静态|偏导|性质|证明/.test(getSectionText(section));
}

function getSectionText(section: PaperSection) {
  return `${section.id} ${section.title} ${section.content}`.toLowerCase();
}

function attachAgentRun(project: ResearchProject, agentRun: AgentRun) {
  return appendAgentRunToProject(project, agentRun);
}
