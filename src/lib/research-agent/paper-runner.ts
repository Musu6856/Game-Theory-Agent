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
import { createPaperOutputPlan } from "./planner.ts";
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

export type PaperOutputAgentRequest = {
  rawIdea: string;
  project: ResearchProject;
  resume?: AgentResumeRequest;
};

export type PaperOutputAgentClient = {
  now?: number;
  id?: string;
};

export type PaperOutputAgentResult = ResearchGenerationResponse & {
  agentRun: AgentRun;
};

export async function runPaperOutputAgent(
  request: PaperOutputAgentRequest,
  client: PaperOutputAgentClient = {}
): Promise<PaperOutputAgentResult> {
  const now = client.now ?? Date.now();
  const runId = client.id ? `agent-paper-${client.id}` : `agent-paper-${now}`;
  let agentRun = createResumableAgentRun({
    project: request.project,
    resume: request.resume,
    fallback: {
      id: runId,
      action: "draft_paper",
      goal: request.rawIdea.trim(),
      now,
      plan: createPaperOutputPlan(),
    },
  });
  if (!request.resume) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        type: "plan_created",
        message: "Created paper output review plan.",
        metadata: {
          stepCount: agentRun.plan.length,
          existingSectionCount: request.project.sections.length,
        },
      },
      now
    );
  }

  const assetSummary = summarizePaperAssets(request.project);
  if (!shouldSkipCompletedStep(agentRun, "prepare-paper-assets")) {
    agentRun = updateStepStatus(agentRun, "prepare-paper-assets", "running", now);
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "prepare-paper-assets",
        type: "tool_result",
        message: "Prepared stable assets for paper drafting.",
        metadata: assetSummary,
      },
      now
    );
    agentRun = updateStepStatus(agentRun, "prepare-paper-assets", "completed", now);
  }

  agentRun = updateStepStatus(agentRun, "draft-paper-sections", "running", now);
  const sections = draftPaperSections(request.project);
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-paper-sections",
      type: "model_result",
      message: "Drafted paper sections from applied research assets.",
      metadata: {
        sectionCount: sections.length,
        sectionIds: sections.map((section) => section.id),
      },
    },
    now
  );
  agentRun = updateStepStatus(agentRun, "draft-paper-sections", "completed", now);

  agentRun = updateStepStatus(agentRun, "review-paper-grounding", "running", now);
  const review = reviewPaperSections(request.project, sections);
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "review-paper-grounding",
      type: "tool_result",
      message: review.ok
        ? "Paper draft sections passed the first grounding review."
        : "Paper draft sections have gaps that should be reviewed before export.",
      metadata: {
        ok: review.ok,
        issues: review.issues,
      },
    },
    now
  );
  agentRun = updateStepStatus(agentRun, "review-paper-grounding", "completed", now);

  const patch = createPaperDraftPatch({
    sections,
    now,
    sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    riskNotes: review.issues,
  });
  const proposal = recordProposedPatchStep({
    agentRun,
    project: request.project,
    patch,
    stepId: "propose-paper-patch",
    now,
    message:
      "Created a reviewable paper draft patch and paused for user approval.",
  });
  agentRun = proposal.agentRun;
  agentRun = {
    ...agentRun,
    status: "paused",
    currentStepId: undefined,
    pauseReason: "等待用户审阅并应用论文草稿建议。",
    requiresApproval: true,
    completedAt: now,
  };

  const project = attachPaperPatchForReview({
    originalProject: request.project,
    patch: proposal.patch,
    agentRun,
    now,
    reviewIssues: review.issues,
  });

  return {
    project,
    usedFallback: false,
    assistantMessage:
      "我已经根据当前稳定资产整理出论文草稿建议，并放在右侧待应用。请先审阅章节内容，再决定是否写入论文输出。",
    agentRun,
  };
}

function summarizePaperAssets(project: ResearchProject) {
  const pendingPatchKinds = project.researchSession?.assetPatches
    ?.filter((patch) => patch.status === "proposed")
    .map((patch) => patch.kind) ?? [];

  return {
    hasDirection: Boolean(project.researchSession?.assetSummary.currentDirection),
    hasModel: Boolean(project.hotellingModel),
    equilibriumStatus: project.equilibriumResult?.status,
    propertyAnalysisCount: project.propertyAnalyses?.length ?? 0,
    pendingPatchKinds,
  };
}

function draftPaperSections(project: ResearchProject): PaperSection[] {
  const direction = project.researchSession?.assetSummary.currentDirection;
  const model = project.hotellingModel;
  const equilibrium = project.equilibriumResult;
  const analyses = project.propertyAnalyses ?? [];
  const title = direction?.title || project.refinedIdea || project.rawIdea;

  const sections: PaperSection[] = [
    {
      id: "paper-introduction",
      title: "引言与研究问题",
      content: [
        `本文围绕“${title}”展开，目标是解释平台在双边参与者之间如何配置收费、补贴与机制设计。`,
        direction?.summary ? `研究背景可以从这个机制出发：${direction.summary}` : "",
        direction?.contribution
          ? `预期贡献是：${direction.contribution}`
          : "当前贡献陈述仍需要结合研究方向进一步压实。",
      ]
        .filter(Boolean)
        .join("\n\n"),
      status: "generated",
    },
    {
      id: "paper-model",
      title: "模型设定",
      content: model
        ? [
            model.modelSetupDraft,
            `参与方设定为 ${model.sides.consumerSideName} 与 ${model.sides.merchantSideName}，平台集合为 ${model.platforms.join("、")}。`,
            model.assumptions.length > 0
              ? `核心假设包括：${model.assumptions.join("；")}。`
              : "当前模型假设仍需要补充。",
            model.demandDerivation
              ? `需求推导路径为：${model.demandDerivation}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        : "当前还没有可写入论文的模型设定。",
      status: "generated",
    },
    {
      id: "paper-equilibrium",
      title: "均衡分析",
      content: equilibrium
        ? [
            equilibrium.concept,
            equilibrium.closedForm
              ? `闭式结果为：\n\n${equilibrium.closedForm}`
              : "当前尚未得到闭式均衡表达式。",
            equilibrium.conditions.length > 0
              ? `存在条件或适用区间包括：${equilibrium.conditions.join("；")}。`
              : "均衡存在条件仍需要补充。",
            equilibrium.derivation ? `推导说明：${equilibrium.derivation}` : "",
          ]
            .filter(Boolean)
            .join("\n\n")
        : "当前还没有可写入论文的均衡推导。",
      status: "generated",
    },
    {
      id: "paper-propositions",
      title: "比较静态与命题",
      content:
        analyses.length > 0
          ? analyses
              .map((analysis, index) =>
                [
                  `命题 ${index + 1}：${analysis.propositionDraft}`,
                  `符号结果：${analysis.symbolicResult}`,
                  `适用条件：${analysis.signCondition}`,
                  `证明思路：${analysis.proofSketch}`,
                  analysis.intuition ? `经济直觉：${analysis.intuition}` : "",
                ]
                  .filter(Boolean)
                  .join("\n")
              )
              .join("\n\n")
          : "当前还没有性质分析，暂不能形成稳定命题组。",
      status: "generated",
    },
    {
      id: "paper-discussion",
      title: "讨论与后续扩展",
      content: [
        "这一版草稿只使用已经应用到右侧工作台的研究资产，不额外引入新的模型假设或数值结论。",
        "后续可以继续补充文献定位、机制边界、稳健性讨论和可检验含义。",
        project.researchSession?.evidencePack?.sources.length
          ? "联网搜索来源可在引言与文献定位中作为研究动机依据，但正式论文仍需要补齐规范引用。"
          : "当前没有可用的联网搜索来源，正式写作前建议补充文献与现实案例依据。",
      ].join("\n\n"),
      status: "generated",
    },
  ];

  return sections;
}

function reviewPaperSections(project: ResearchProject, sections: PaperSection[]) {
  const issues: string[] = [];
  const pendingPatchKinds = project.researchSession?.assetPatches
    ?.filter((patch) => patch.status === "proposed" && patch.kind !== "paper")
    .map((patch) => patch.kind) ?? [];

  if (!project.hotellingModel) {
    issues.push("缺少已应用的模型设定，论文草稿只能保留研究动机。");
  }

  if (project.equilibriumResult?.status !== "solved") {
    issues.push("缺少已求解的均衡结果，均衡章节不能作为正式结论。");
  }

  if ((project.propertyAnalyses?.length ?? 0) < 3) {
    issues.push("性质分析少于 3 条，命题组还不够稳定。");
  }

  if (pendingPatchKinds.length > 0) {
    issues.push(
      `仍有未应用的资产建议：${pendingPatchKinds.join("、")}，论文草稿可能不是最新资产。`
    );
  }

  if (sections.length < 4 || sections.some((section) => !section.content.trim())) {
    issues.push("章节数量或正文内容不足。");
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

function createPaperDraftPatch({
  sections,
  now,
  sourceMessageId,
  riskNotes,
}: {
  sections: PaperSection[];
  now: number;
  sourceMessageId?: string;
  riskNotes: string[];
}) {
  const note =
    riskNotes.length > 0
      ? `Agent 自检提示：${riskNotes.join("；")}`
      : "Agent 自检未发现阻断论文输出的明显风险。";
  const changes: ResearchAssetChange[] = [
    {
      kind: "replace",
      path: "sections",
      value: sections,
      note,
    },
  ];

  return createResearchAssetPatch({
    id: `patch-paper-agent-${now}`,
    kind: "paper",
    summary: "论文输出 Agent 建议应用这版草稿章节",
    changes,
    createdAt: now,
    sourceMessageId,
  });
}

function attachPaperPatchForReview({
  originalProject,
  patch,
  agentRun,
  now,
  reviewIssues,
}: {
  originalProject: ResearchProject;
  patch: ResearchAssetPatch;
  agentRun: AgentRun;
  now: number;
  reviewIssues: string[];
}) {
  const session =
    originalProject.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);
  const previousPatches = session.assetPatches ?? [];
  const messages = [
    ...session.messages,
    {
      id: `msg-paper-agent-review-${now}`,
      role: "assistant" as const,
      content: createReviewMessage(reviewIssues),
      createdAt: 0,
    },
  ];

  return attachAgentRun(
    {
      ...originalProject,
      sections: originalProject.sections,
      researchSession: {
        ...session,
        phase: "paper",
        messages,
        agentRun,
        assetPatches: appendOrReplaceProposedPatch(previousPatches, patch),
        assetSummary: {
          ...session.assetSummary,
          pendingDecision: {
            kind: "draft_paper",
            prompt: "请先审阅并应用论文草稿建议，再导出或继续改写正文。",
          },
          nextActions: [
            "审阅右侧待处理的论文草稿建议",
            "应用或拒绝论文输出 patch",
            "应用后再导出 Markdown 或继续补充文献与讨论",
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
      : "自检结果：暂未发现阻断论文输出的明显风险。";

  return [
    "我已经把当前稳定资产整理成一版论文草稿章节。",
    "",
    `${reviewLine}我没有直接覆盖论文输出，而是放到右侧作为待审核建议。`,
  ].join("\n");
}

function attachAgentRun(project: ResearchProject, agentRun: AgentRun) {
  return appendAgentRunToProject(project, agentRun);
}
