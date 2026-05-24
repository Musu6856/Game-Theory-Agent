import { generateResearchProject } from "../ai-research-generation.ts";
import { createResearchAssetPatch } from "../research-asset-patch.ts";
import { createInitialResearchSession } from "../research-session.ts";
import type {
  EquilibriumResult,
  ResearchAssetChange,
  ResearchProject,
} from "../types";
import { verifyEquilibriumMathConsistency } from "./math-verifier.ts";
import type {
  ResearchCompletionClient,
  ResearchGenerationRequest,
  ResearchGenerationResponse,
} from "../research-generation/types.ts";
import { createEquilibriumSolvingPlan } from "./planner.ts";
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

export type EquilibriumSolvingAgentRequest = {
  rawIdea: string;
  project: ResearchProject;
  resume?: AgentResumeRequest;
};

export type EquilibriumSolvingAgentClient = ResearchCompletionClient & {
  solveEquilibrium?: (
    request: ResearchGenerationRequest,
    client: ResearchCompletionClient
  ) => Promise<ResearchGenerationResponse>;
};

export type EquilibriumSolvingAgentResult = ResearchGenerationResponse & {
  agentRun: AgentRun;
};

export async function runEquilibriumSolvingAgent(
  request: EquilibriumSolvingAgentRequest,
  client: EquilibriumSolvingAgentClient = {}
): Promise<EquilibriumSolvingAgentResult> {
  const now = client.now ?? Date.now();
  const runId = client.id
    ? `agent-equilibrium-${client.id}`
    : `agent-equilibrium-${now}`;
  let agentRun = createResumableAgentRun({
    project: request.project,
    resume: request.resume,
    fallback: {
      id: runId,
      goal: request.rawIdea.trim(),
      now,
      plan: createEquilibriumSolvingPlan(),
    },
  });
  if (!request.resume) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        type: "plan_created",
        message: "Created symbolic equilibrium review plan.",
        metadata: {
          stepCount: agentRun.plan.length,
          hasModel: Boolean(request.project.hotellingModel),
        },
      },
      now
    );
  }

  if (!shouldSkipCompletedStep(agentRun, "prepare-equilibrium")) {
    agentRun = updateStepStatus(agentRun, "prepare-equilibrium", "running", now);
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "prepare-equilibrium",
        type: "model_result",
        message: "Prepared model assets for symbolic equilibrium solving.",
        metadata: {
          modelAssumptionCount:
            request.project.hotellingModel?.assumptions.length ?? 0,
          utilityFunctionCount:
            request.project.hotellingModel?.utilityFunctions.length ?? 0,
          profitFunctionCount:
            request.project.hotellingModel?.profitFunctions.length ?? 0,
        },
      },
      now
    );
    agentRun = updateStepStatus(agentRun, "prepare-equilibrium", "completed", now);
  }

  agentRun = updateStepStatus(agentRun, "draft-equilibrium", "running", now);
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-equilibrium",
      type: "model_call",
      message: "Requested a symbolic equilibrium candidate from the single-step research layer.",
      metadata: { toolName: "research.solveEquilibrium" },
    },
    now
  );

  const solveEquilibrium = client.solveEquilibrium ?? generateResearchProject;
  let solveResult = await solveEquilibrium(
    {
      action: "solve_equilibrium",
      rawIdea: request.rawIdea,
      project: request.project,
    },
    client
  );
  let candidateEquilibrium = solveResult.project.equilibriumResult;

  if (!candidateEquilibrium) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "draft-equilibrium",
        type: "fallback",
        message: "Equilibrium candidate was unavailable; returning single-step result.",
        metadata: { usedFallback: solveResult.usedFallback },
      },
      now
    );
    agentRun = updateStepStatus(agentRun, "draft-equilibrium", "failed", now);
    return {
      ...solveResult,
      project: attachAgentRun(solveResult.project, agentRun),
      agentRun,
    };
  }

  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-equilibrium",
      type: "model_result",
      message: "Received a symbolic equilibrium candidate.",
      metadata: {
        usedFallback: solveResult.usedFallback,
        status: candidateEquilibrium.status,
        solvingStepCount: candidateEquilibrium.solvingSteps.length,
        focCount: candidateEquilibrium.focs.length,
        conditionCount: candidateEquilibrium.conditions.length,
        warningCount: candidateEquilibrium.warnings.length,
      },
    },
    now
  );
  agentRun = updateStepStatus(agentRun, "draft-equilibrium", "completed", now);

  agentRun = updateStepStatus(agentRun, "review-equilibrium", "running", now);
  let review = reviewEquilibriumCandidate(
    candidateEquilibrium,
    request.project
  );
  if (!review.ok) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-equilibrium",
        type: "fallback",
        message:
          "Equilibrium self-review found repairable risks; requested one bounded repair attempt.",
        metadata: {
          repairAttempted: true,
          issues: review.issues,
        },
      },
      now
    );
    const repairResult = await solveEquilibrium(
      {
        action: "solve_equilibrium",
        rawIdea: request.rawIdea,
        userMessage: createEquilibriumRepairMessage(review.issues),
        project: request.project,
      },
      client
    );
    const repairedEquilibrium = repairResult.project.equilibriumResult;

    if (repairedEquilibrium) {
      const repairReview = reviewEquilibriumCandidate(
        repairedEquilibrium,
        request.project
      );
      agentRun = appendTraceEvent(
        agentRun,
        {
          stepId: "review-equilibrium",
          type: "tool_result",
          message: repairReview.ok
            ? "Equilibrium repair candidate passed self-review."
            : "Equilibrium repair candidate still has review risks.",
          metadata: {
            repaired: repairReview.ok,
            remainingIssues: repairReview.issues,
            originalIssueCount: review.issues.length,
          },
        },
        now
      );
      if (repairReview.issues.length <= review.issues.length) {
        solveResult = repairResult;
        candidateEquilibrium = repairedEquilibrium;
        review = repairReview;
      }
    } else {
      agentRun = appendTraceEvent(
        agentRun,
        {
          stepId: "review-equilibrium",
          type: "fallback",
          message:
            "Equilibrium repair attempt returned no usable equilibrium; keeping the original candidate.",
          metadata: { repairAttempted: true, repairReturnedCandidate: false },
        },
        now
      );
    }
  }
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "review-equilibrium",
      type: "tool_result",
      message: review.ok
        ? "Equilibrium candidate passed the first derivation review."
        : "Equilibrium candidate has risks that must be reviewed before analysis.",
      metadata: {
        ok: review.ok,
        issues: review.issues,
      },
    },
    now
  );
  agentRun = updateStepStatus(agentRun, "review-equilibrium", "completed", now);

  agentRun = updateStepStatus(
    agentRun,
    "propose-equilibrium-patch",
    "running",
    now
  );
  const patch = createEquilibriumCandidatePatch({
    equilibrium: candidateEquilibrium,
    now,
    sourceMessageId:
      solveResult.project.researchSession?.messages.at(-1)?.id ??
      request.project.researchSession?.messages.at(-1)?.id,
    riskNotes: review.issues,
  });
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "propose-equilibrium-patch",
      type: "tool_result",
      message:
        "Created a reviewable equilibrium patch and paused for user approval.",
      metadata: {
        patchId: patch.id,
        changeCount: patch.changes.length,
      },
    },
    now
  );
  agentRun = updateStepStatus(
    agentRun,
    "propose-equilibrium-patch",
    "completed",
    now
  );
  agentRun = {
    ...agentRun,
    status: "paused",
    currentStepId: undefined,
    pauseReason: "等待用户审阅并应用均衡修改建议。",
    requiresApproval: true,
    completedAt: now,
  };

  const project = attachEquilibriumPatchForReview({
    originalProject: request.project,
    solveResult,
    patch,
    agentRun,
    now,
    reviewIssues: review.issues,
  });

  return {
    project,
    usedFallback: solveResult.usedFallback,
    assistantMessage:
      "我已经完成均衡求解的第一轮审查，并在右侧准备了一条均衡修改建议。请先审阅并应用，再进入性质分析。",
    agentRun,
  };
}

function reviewEquilibriumCandidate(
  equilibrium: EquilibriumResult,
  project: ResearchProject
) {
  const issues: string[] = [];

  if (equilibrium.status !== "solved") {
    issues.push("候选结果还不是 solved 状态，不能直接进入性质分析。");
  }

  if (!equilibrium.closedForm.trim()) {
    issues.push("缺少闭式解或可复用的均衡表达式。");
  }

  if (equilibrium.solvingSteps.length < 2) {
    issues.push("求解步骤过少，建议补充目标函数、一阶条件和联立求解过程。");
  }

  if (equilibrium.focs.length === 0) {
    issues.push("缺少一阶条件，难以审查均衡推导。");
  }

  if (equilibrium.conditions.length === 0) {
    issues.push("缺少存在条件或内点条件。");
  }

  issues.push(
    ...verifyEquilibriumMathConsistency({
      model: project.hotellingModel,
      equilibrium,
    }).issues
  );

  return {
    ok: issues.length === 0,
    issues,
  };
}

function createEquilibriumRepairMessage(issues: string[]) {
  return [
    "Agent 自检发现均衡候选还不适合进入性质分析，请只修复以下问题，保持当前模型和符号表不变：",
    ...issues.map((issue) => `- ${issue}`),
    "修复后仍返回完整 equilibriumResult JSON；不要使用数值模拟、校准或经验回归。",
  ].join("\n");
}

function createEquilibriumCandidatePatch({
  equilibrium,
  now,
  sourceMessageId,
  riskNotes,
}: {
  equilibrium: EquilibriumResult;
  now: number;
  sourceMessageId?: string;
  riskNotes: string[];
}) {
  const note =
    riskNotes.length > 0
      ? `Agent 自检提示：${riskNotes.join("；")}`
      : "Agent 自检未发现阻断性质分析的明显风险。";
  const changes: ResearchAssetChange[] = [
    {
      kind: "replace",
      path: "equilibriumResult",
      value: equilibrium,
      note,
    },
  ];

  return createResearchAssetPatch({
    id: `patch-equilibrium-agent-${now}`,
    kind: "equilibrium",
    summary: "均衡求解 Agent 建议应用这版符号均衡",
    changes,
    createdAt: now,
    sourceMessageId,
  });
}

function attachEquilibriumPatchForReview({
  originalProject,
  solveResult,
  patch,
  agentRun,
  now,
  reviewIssues,
}: {
  originalProject: ResearchProject;
  solveResult: ResearchGenerationResponse;
  patch: ReturnType<typeof createEquilibriumCandidatePatch>;
  agentRun: AgentRun;
  now: number;
  reviewIssues: string[];
}) {
  const session =
    solveResult.project.researchSession ??
    originalProject.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);
  const previousPatches = originalProject.researchSession?.assetPatches ?? [];
  const messages = [
    ...session.messages,
    {
      id: `msg-equilibrium-agent-review-${now}`,
      role: "assistant" as const,
      content: createReviewMessage(solveResult.assistantMessage, reviewIssues),
      createdAt: 0,
    },
  ];

  return attachAgentRun(
    {
      ...solveResult.project,
      equilibriumResult: originalProject.equilibriumResult,
      propertyAnalyses: originalProject.propertyAnalyses,
      researchSession: {
        ...session,
        phase: "equilibrium",
        messages,
        agentRun,
        assetPatches: [...previousPatches, patch],
        assetSummary: {
          ...session.assetSummary,
          equilibriumStatus:
            originalProject.equilibriumResult?.status ?? "等待开始求解",
          pendingDecision: {
            kind: "solve_equilibrium",
            prompt:
              "请先审阅并应用均衡修改建议，再进入性质分析。",
          },
          nextActions: [
            "审阅右侧待处理的均衡修改建议",
            "应用或拒绝均衡 patch",
            "应用后再生成性质分析",
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
      : "自检结果：暂未发现阻断性质分析的明显风险。";

  return [
    assistantMessage?.trim() || "我已生成一版均衡候选。",
    "",
    `${reviewLine}我没有直接把它推进到性质分析，而是放到右侧作为待审核修改建议。`,
  ].join("\n");
}

function attachAgentRun(project: ResearchProject, agentRun: AgentRun) {
  return appendAgentRunToProject(project, agentRun);
}
