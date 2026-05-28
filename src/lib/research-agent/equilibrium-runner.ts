import { generateResearchProject } from "../ai-research-generation.ts";
import { createResearchAssetPatch } from "../research-asset-patch.ts";
import { createInitialResearchSession } from "../research-session.ts";
import type {
  EquilibriumResult,
  ResearchMathArtifact,
  ResearchAssetChange,
  ResearchAssetReviewRisk,
  ResearchProject,
  ResearchSessionMessage,
} from "../types";
import type {
  ResearchCompletionClient,
  ResearchGenerationRequest,
  ResearchGenerationResponse,
} from "../research-generation/types.ts";
import {
  appendOrReplaceProposedPatch,
  recordProposedPatchStep,
} from "./patch-proposals.ts";
import { createEquilibriumSolvingPlan } from "./planner.ts";
import type { MathVerificationCheck } from "./math-verifier.ts";
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
import {
  runEquilibriumSolverKernel,
  type EquilibriumSolverKernelDecision,
} from "./equilibrium-solver-kernel.ts";
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
  onMathArtifact?: (
    artifact: ResearchMathArtifact,
    context: { runId: string }
  ) => Promise<void> | void;
  onAgentCheckpoint?: AgentCheckpointSink;
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
      action: "solve_equilibrium",
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
        message: "已创建符号均衡复核计划。",
        metadata: {
          stepCount: agentRun.plan.length,
          hasModel: Boolean(request.project.hotellingModel),
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

  if (!shouldSkipCompletedStep(agentRun, "prepare-equilibrium")) {
    await recordStepStatus("prepare-equilibrium", "running");
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "prepare-equilibrium",
        type: "model_result",
        message: "已准备符号均衡求解所需的模型资产。",
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
    await recordStepStatus("prepare-equilibrium", "completed");
  }

  await recordStepStatus("draft-equilibrium", "running");
  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "draft-equilibrium",
      type: "model_call",
      message: "已向单步研究能力层请求符号均衡候选。",
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
        message: "没有取得可用的均衡候选，返回单步生成结果。",
        metadata: { usedFallback: solveResult.usedFallback },
      },
      now
    );
    await recordStepStatus("draft-equilibrium", "failed");
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
      message: "已收到符号均衡候选。",
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
  await recordStepStatus("draft-equilibrium", "completed");

  if (!isSolvedEquilibriumCandidate(candidateEquilibrium)) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-equilibrium",
        type: "tool_result",
        message:
          "均衡生成只得到推导草稿或隐式系统，已保留在中间对话中，暂不创建正式均衡 patch。",
        metadata: {
          status: candidateEquilibrium.status,
          usedFallback: solveResult.usedFallback,
        },
      },
      now
    );
    await recordStepStatus("review-equilibrium", "completed");
    agentRun = {
      ...agentRun,
      status: "paused",
      currentStepId: undefined,
      pauseReason:
        "当前只得到均衡推导草稿；需要继续推导、补模型或人工复核后才能生成正式均衡 patch。",
      requiresApproval: false,
      completedAt: now,
    };

    return {
      project: attachEquilibriumDraftForReview({
        originalProject: request.project,
        solveResult,
        equilibrium: candidateEquilibrium,
        agentRun,
        now,
      }),
      usedFallback: solveResult.usedFallback,
      assistantMessage:
        "这次只得到均衡推导草稿或隐式系统，我已保留在中间对话中；没有创建正式均衡 patch，也不会进入性质分析。",
      agentRun,
    };
  }

  await recordStepStatus("review-equilibrium", "running");
  let review = await reviewEquilibriumCandidateWithKernel(
    candidateEquilibrium,
    request.project,
    {
      now,
      runId: agentRun.id,
      onMathArtifact: client.onMathArtifact,
    }
  );
  let accumulatedReviewArtifacts = [...review.artifacts];

  if (review.decision.action === "repair_model") {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-equilibrium",
        type: "tool_result",
        message:
          "均衡求解内核发现模型求解输入需要先修复，暂不创建均衡 patch。",
        metadata: {
          ok: false,
          issues: review.issues,
          kernelDecision: review.decision,
          kernelStepCount: review.steps.length,
        },
      },
      now
    );
    await recordStepStatus("review-equilibrium", "completed");

    const patch = createModelRepairPatch({
      decision: review.decision,
      artifacts: review.artifacts,
      now,
      sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    });
    const proposal = recordProposedPatchStep({
      agentRun,
      project: request.project,
      patch,
      stepId: "propose-equilibrium-patch",
      now,
      message:
        "已创建待审核的模型修复 patch，因为求解内核无法编译完整模型输入。",
    });
    agentRun = proposal.agentRun;
    const mathArtifacts = attachArtifactRunAndPatch({
      artifacts: [
        createEquilibriumCandidateArtifact({
          equilibrium: candidateEquilibrium,
          runId: agentRun.id,
          patchId: proposal.patch.id,
          now,
        }),
        ...review.artifacts,
      ],
      runId: agentRun.id,
      patchId: proposal.patch.id,
    });
    agentRun = {
      ...agentRun,
      status: "paused",
      currentStepId: undefined,
      pauseReason:
        "等待用户审阅模型修复 patch 后再继续符号均衡求解。",
      requiresApproval: true,
      completedAt: now,
    };

    const project = attachModelRepairPatchForReview({
      originalProject: request.project,
      solveResult,
      patch: proposal.patch,
      agentRun,
      now,
      reviewIssues: review.issues,
      reviewChecks: review.checks,
      mathArtifacts,
      decision: review.decision,
    });

    return {
      project,
      usedFallback: solveResult.usedFallback,
      assistantMessage:
        "求解内核发现模型资产需要先修复，暂时不能信任这版均衡。我已经创建模型修复 patch，并保留本次数学产物供你审阅。",
      agentRun,
    };
  }

  const initialCoverageArtifact =
    findLatestModelCoverageArtifact(accumulatedReviewArtifacts);
  if (
    initialCoverageArtifact &&
    isBlockingCoverageArtifact(initialCoverageArtifact)
  ) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-equilibrium",
        type: "tool_result",
        message:
          "Equilibrium coverage check found omitted model mechanisms, so the solved-looking candidate stays as a draft instead of becoming a formal equilibrium patch.",
        metadata: {
          status: candidateEquilibrium.status,
          promotionBlocked: true,
          reason: "model_coverage_failed",
          omittedMechanisms: initialCoverageArtifact.output,
          issues: initialCoverageArtifact.issues ?? [],
        },
      },
      now
    );
    await recordStepStatus("review-equilibrium", "completed");
    const patch = createEquilibriumCandidatePatch({
      equilibrium: candidateEquilibrium,
      now,
      sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
      riskNotes: [
        "Coverage/manual review required before treating this candidate as final.",
        ...(initialCoverageArtifact.issues ?? []),
      ],
      reviewRisk: "coverage_blocked",
      reviewChecks: review.checks,
    });
    const proposal = recordProposedPatchStep({
      agentRun,
      project: request.project,
      patch,
      stepId: "propose-equilibrium-patch",
      now,
      message:
        "Coverage review found omitted mechanisms, so I created a high-attention equilibrium patch instead of silently applying the candidate.",
    });
    agentRun = proposal.agentRun;
    const mathArtifacts = attachArtifactRunAndPatch({
      artifacts: [
        createEquilibriumCandidateArtifact({
          equilibrium: candidateEquilibrium,
          runId: agentRun.id,
          patchId: proposal.patch.id,
          now,
        }),
        ...accumulatedReviewArtifacts,
      ],
      runId: agentRun.id,
      patchId: proposal.patch.id,
    });
    agentRun = {
      ...agentRun,
      status: "paused",
      currentStepId: undefined,
      pauseReason:
        "The candidate has a solved form and optimality evidence, but coverage review found omitted mechanisms. Review the proposed equilibrium patch before applying it.",
      requiresApproval: true,
      completedAt: now,
    };

    return {
      project: attachEquilibriumPatchForReview({
        originalProject: request.project,
        solveResult,
        patch: proposal.patch,
        agentRun,
        now,
        reviewIssues: initialCoverageArtifact.issues ?? [],
        reviewChecks: review.checks,
        mathArtifacts,
      }),
      usedFallback: solveResult.usedFallback,
      assistantMessage:
        "This candidate has a solved form and optimality evidence, but the model-coverage check found omitted confirmed mechanisms. I created a reviewable equilibrium patch for manual approval instead of applying it directly.",
      agentRun,
    };
  }

  if (review.decision.action === "repair_equilibrium_candidate") {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-equilibrium",
        type: "fallback",
        message:
          "均衡自检发现可修复风险，已请求一次有边界修复。",
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
      const repairReview = await reviewEquilibriumCandidateWithKernel(
        repairedEquilibrium,
        request.project,
        {
          now,
          runId: agentRun.id,
          artifactSuffix: "repair",
          onMathArtifact: client.onMathArtifact,
        }
      );
      accumulatedReviewArtifacts = mergeMathArtifacts(
        accumulatedReviewArtifacts,
        repairReview.artifacts
      );
      agentRun = appendTraceEvent(
        agentRun,
        {
          stepId: "review-equilibrium",
          type: "tool_result",
          message: repairReview.ok
            ? "修复后的均衡候选已通过自检。"
            : "修复后的均衡候选仍存在复核风险。",
          metadata: {
            repaired: repairReview.ok,
            remainingIssues: repairReview.issues,
            originalIssueCount: review.issues.length,
            kernelDecision: repairReview.decision,
            kernelStepCount: repairReview.steps.length,
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
            "均衡修复没有返回可用候选，保留原候选进入审核。",
          metadata: { repairAttempted: true, repairReturnedCandidate: false },
        },
        now
      );
    }
  }

  if (review.decision.action === "repair_model") {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-equilibrium",
        type: "tool_result",
        message:
          "修复后的均衡候选暴露出模型求解输入缺口，已切换为模型修复 patch。",
        metadata: {
          ok: false,
          issues: review.issues,
          kernelDecision: review.decision,
          kernelStepCount: review.steps.length,
          repairAttempted: true,
        },
      },
      now
    );
    await recordStepStatus("review-equilibrium", "completed");

    const patch = createModelRepairPatch({
      decision: review.decision,
      artifacts: accumulatedReviewArtifacts,
      now,
      sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    });
    const proposal = recordProposedPatchStep({
      agentRun,
      project: request.project,
      patch,
      stepId: "propose-equilibrium-patch",
      now,
      message:
        "已创建待审核的模型修复 patch，因为候选修复后仍无法编译完整模型求解输入。",
    });
    agentRun = proposal.agentRun;
    const mathArtifacts = attachArtifactRunAndPatch({
      artifacts: [
        createEquilibriumCandidateArtifact({
          equilibrium: candidateEquilibrium,
          runId: agentRun.id,
          patchId: proposal.patch.id,
          now,
        }),
        ...accumulatedReviewArtifacts,
      ],
      runId: agentRun.id,
      patchId: proposal.patch.id,
    });
    agentRun = {
      ...agentRun,
      status: "paused",
      currentStepId: undefined,
      pauseReason: "等待用户审核模型修复 patch 后再继续符号均衡求解。",
      requiresApproval: true,
      completedAt: now,
    };

    const project = attachModelRepairPatchForReview({
      originalProject: request.project,
      solveResult,
      patch: proposal.patch,
      agentRun,
      now,
      reviewIssues: review.issues,
      reviewChecks: review.checks,
      mathArtifacts,
      decision: review.decision,
    });

    return {
      project,
      usedFallback: solveResult.usedFallback,
      assistantMessage:
        "修复后的均衡候选仍缺少可信的模型求解输入。我已改为创建模型修复 patch，先把模型侧利润函数、变量或 FOC 输入补齐。",
      agentRun,
    };
  }

  if (review.decision.action === "repair_equilibrium_candidate") {
    const decision = createBoundedEquilibriumRepairDecision({
      decision: review.decision,
      artifacts: accumulatedReviewArtifacts,
    });
    const patch = createModelRepairPatch({
      decision,
      artifacts: accumulatedReviewArtifacts,
      now,
      sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    });
    const proposal = recordProposedPatchStep({
      agentRun,
      project: request.project,
      patch,
      stepId: "propose-equilibrium-patch",
      now,
      message:
        "鍧囪　鍊欓€夌粡杩囦竴娆℃湁杈圭晫淇鍚庝粛鏈€氳繃姹傝В鍐呮牳澶嶆牳锛屽凡杞垚妯″瀷/FOC 杈撳叆淇 patch銆?",
    });
    agentRun = proposal.agentRun;
    const mathArtifacts = attachArtifactRunAndPatch({
      artifacts: [
        createEquilibriumCandidateArtifact({
          equilibrium: candidateEquilibrium,
          runId: agentRun.id,
          patchId: proposal.patch.id,
          now,
        }),
        ...accumulatedReviewArtifacts,
      ],
      runId: agentRun.id,
      patchId: proposal.patch.id,
    });
    agentRun = {
      ...agentRun,
      status: "paused",
      currentStepId: undefined,
      pauseReason:
        "Waiting for review of the model/FOC input repair patch before rerunning symbolic equilibrium solving.",
      requiresApproval: true,
      completedAt: now,
    };

    const project = attachModelRepairPatchForReview({
      originalProject: request.project,
      solveResult,
      patch: proposal.patch,
      agentRun,
      now,
      reviewIssues: review.issues,
      reviewChecks: review.checks,
      mathArtifacts,
      decision,
    });

    return {
      project,
      usedFallback: solveResult.usedFallback,
      assistantMessage:
        "The bounded repair still did not pass the solver kernel. I kept both math-artifact rounds and created a model/FOC input repair patch instead of an equilibrium patch.",
      agentRun,
    };
  }

  agentRun = appendTraceEvent(
    agentRun,
    {
      stepId: "review-equilibrium",
      type: "tool_result",
      message: review.ok
        ? "均衡候选已通过第一轮推导复核。"
        : "均衡候选仍有风险，进入性质分析前需要复核。",
      metadata: {
        ok: review.ok,
        issues: review.issues,
        kernelDecision: review.decision,
        kernelStepCount: review.steps.length,
      },
    },
    now
  );
  await recordStepStatus("review-equilibrium", "completed");

  if (!isSolvedEquilibriumCandidate(candidateEquilibrium)) {
    const decision = createUnsolvedEquilibriumRepairDecision(review);
    const patch = createModelRepairPatch({
      decision,
      artifacts: accumulatedReviewArtifacts,
      now,
      sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    });
    const proposal = recordProposedPatchStep({
      agentRun,
      project: request.project,
      patch,
      stepId: "propose-equilibrium-patch",
      now,
      message:
        "均衡候选仍未得到闭式解，已改为创建模型/求解输入修复 patch，避免把失败诊断当作正式均衡应用。",
    });
    agentRun = proposal.agentRun;
    const mathArtifacts = attachArtifactRunAndPatch({
      artifacts: [
        createEquilibriumCandidateArtifact({
          equilibrium: candidateEquilibrium,
          runId: agentRun.id,
          patchId: proposal.patch.id,
          now,
        }),
        ...accumulatedReviewArtifacts,
      ],
      runId: agentRun.id,
      patchId: proposal.patch.id,
    });
    agentRun = {
      ...agentRun,
      status: "paused",
      currentStepId: undefined,
      pauseReason:
        "等待用户审阅模型/求解输入修复 patch 后，再重新生成符号均衡。",
      requiresApproval: true,
      completedAt: now,
    };

    const project = attachModelRepairPatchForReview({
      originalProject: request.project,
      solveResult,
      patch: proposal.patch,
      agentRun,
      now,
      reviewIssues: review.issues,
      reviewChecks: review.checks,
      mathArtifacts,
      decision,
    });

    return {
      project,
      usedFallback: solveResult.usedFallback,
      assistantMessage:
        "这次求解仍没有得到可用于性质分析的闭式均衡。我没有创建普通均衡 patch，而是创建了模型/求解输入修复 patch，先把利润函数、需求份额或 FOC 输入补齐后再重算。",
      agentRun,
    };
  }

  const coverageArtifact = findLatestModelCoverageArtifact(
    accumulatedReviewArtifacts
  );
  if (coverageArtifact && isBlockingCoverageArtifact(coverageArtifact)) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-equilibrium",
        type: "tool_result",
        message:
          "Equilibrium coverage check found omitted model mechanisms, so the solved-looking candidate stays as a draft instead of becoming a formal equilibrium patch.",
        metadata: {
          status: candidateEquilibrium.status,
          promotionBlocked: true,
          reason: "model_coverage_failed",
          omittedMechanisms: coverageArtifact.output,
          issues: coverageArtifact.issues ?? [],
        },
      },
      now
    );
    await recordStepStatus("review-equilibrium", "completed");
    const patch = createEquilibriumCandidatePatch({
      equilibrium: candidateEquilibrium,
      now,
      sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
      riskNotes: [
        "Coverage/manual review required before treating this candidate as final.",
        ...(coverageArtifact.issues ?? []),
      ],
      reviewRisk: "coverage_blocked",
      reviewChecks: review.checks,
    });
    const proposal = recordProposedPatchStep({
      agentRun,
      project: request.project,
      patch,
      stepId: "propose-equilibrium-patch",
      now,
      message:
        "Coverage review found omitted mechanisms, so I created a high-attention equilibrium patch instead of silently applying the candidate.",
    });
    agentRun = proposal.agentRun;
    const mathArtifacts = attachArtifactRunAndPatch({
      artifacts: [
        createEquilibriumCandidateArtifact({
          equilibrium: candidateEquilibrium,
          runId: agentRun.id,
          patchId: proposal.patch.id,
          now,
        }),
        ...accumulatedReviewArtifacts,
      ],
      runId: agentRun.id,
      patchId: proposal.patch.id,
    });
    agentRun = {
      ...agentRun,
      status: "paused",
      currentStepId: undefined,
      pauseReason:
        "The candidate has a solved form and optimality evidence, but coverage review found omitted mechanisms. Review the proposed equilibrium patch before applying it.",
      requiresApproval: true,
      completedAt: now,
    };

    return {
      project: attachEquilibriumPatchForReview({
        originalProject: request.project,
        solveResult,
        patch: proposal.patch,
        agentRun,
        now,
        reviewIssues: coverageArtifact.issues ?? [],
        reviewChecks: review.checks,
        mathArtifacts,
      }),
      usedFallback: solveResult.usedFallback,
      assistantMessage:
        "This candidate has a solved form and optimality evidence, but the model-coverage check found omitted confirmed mechanisms. I created a reviewable equilibrium patch for manual approval instead of applying it directly.",
      agentRun,
    };
  }

  if (!hasPromotionOptimalityEvidence(candidateEquilibrium)) {
    agentRun = appendTraceEvent(
      agentRun,
      {
        stepId: "review-equilibrium",
        type: "tool_result",
        message:
          "均衡候选只包含一阶条件或闭式表达，缺少二阶/Hessian/凹性/KKT/边界证据，已保留为草稿。",
        metadata: {
          status: candidateEquilibrium.status,
          promotionBlocked: true,
          reason: "missing_second_order_or_boundary_evidence",
        },
      },
      now
    );
    await recordStepStatus("review-equilibrium", "completed");
    agentRun = {
      ...agentRun,
      status: "paused",
      currentStepId: undefined,
      pauseReason:
        "当前均衡候选缺少二阶条件、Hessian、凹性、KKT 或边界分析证据；需要补足后才能生成正式均衡 patch。",
      requiresApproval: false,
      completedAt: now,
    };

    return {
      project: attachEquilibriumDraftForReview({
        originalProject: request.project,
        solveResult,
        equilibrium: candidateEquilibrium,
        agentRun,
        now,
        draftReason:
          "这版候选只证明了一阶条件，尚未证明利润最大化或边界/KKT 情况。",
        reviewChecks: review.checks,
        mathArtifacts: [
          createEquilibriumCandidateArtifact({
            equilibrium: candidateEquilibrium,
            runId: agentRun.id,
            patchId: `draft-equilibrium-${now}`,
            now,
          }),
          ...accumulatedReviewArtifacts,
        ],
      }),
      usedFallback: solveResult.usedFallback,
      assistantMessage:
        "这次只得到 FOC/闭式候选，但缺少二阶条件、Hessian、凹性、KKT 或边界分析证据。我已保留在中间对话中；没有创建正式均衡 patch，也不会进入性质分析。",
      agentRun,
    };
  }

  const patch = createEquilibriumCandidatePatch({
    equilibrium: candidateEquilibrium,
    now,
    sourceMessageId: request.project.researchSession?.messages.at(-1)?.id,
    riskNotes: review.issues,
    reviewChecks: review.checks,
  });
  const proposal = recordProposedPatchStep({
    agentRun,
    project: request.project,
    patch,
    stepId: "propose-equilibrium-patch",
    now,
    message:
      "已创建可审核的均衡 patch，并暂停等待用户确认。",
  });
  agentRun = proposal.agentRun;
  const mathArtifacts = attachArtifactRunAndPatch({
    artifacts: [
      createEquilibriumCandidateArtifact({
        equilibrium: candidateEquilibrium,
        runId: agentRun.id,
        patchId: proposal.patch.id,
        now,
      }),
      ...accumulatedReviewArtifacts,
    ],
    runId: agentRun.id,
    patchId: proposal.patch.id,
  });
  agentRun = {
    ...agentRun,
    status: "paused",
    currentStepId: undefined,
    pauseReason: "等待用户审阅均衡修改建议。",
    requiresApproval: true,
    completedAt: now,
  };

  const project = attachEquilibriumPatchForReview({
    originalProject: request.project,
    solveResult,
    patch: proposal.patch,
    agentRun,
    now,
    reviewIssues: review.issues,
    reviewChecks: review.checks,
    mathArtifacts,
  });

  return {
    project,
    usedFallback: solveResult.usedFallback,
    assistantMessage:
      "均衡候选复核已完成。我已把它放到右侧待审核修改建议里；请先审阅并应用，再进入性质分析。",
    agentRun,
  };
}

async function reviewEquilibriumCandidateWithKernel(
  equilibrium: EquilibriumResult,
  project: ResearchProject,
  options: {
    now: number;
    runId: string;
    artifactSuffix?: string;
    onMathArtifact?: EquilibriumSolvingAgentClient["onMathArtifact"];
  }
) {
  const kernelRunId = [
    options.runId,
    options.artifactSuffix,
  ].filter(Boolean).join("-");
  const kernel = await runEquilibriumSolverKernel({
    project,
    equilibrium,
    runId: kernelRunId,
    now: options.now,
    onArtifact: async (artifact) => {
      await options.onMathArtifact?.(
        {
          ...artifact,
          runId: options.runId,
        },
        { runId: options.runId }
      );
    },
  });

  const ok =
    kernel.decision.action === "accept_candidate" ||
    kernel.decision.action === "review_manually";

  return {
    ok,
    issues: kernel.issues,
    checks: kernel.checks,
    artifacts: kernel.artifacts,
    steps: kernel.steps,
    decision: kernel.decision,
  };
}

function createEquilibriumCandidateArtifact({
  equilibrium,
  runId,
  patchId,
  now,
}: {
  equilibrium: EquilibriumResult;
  runId: string;
  patchId: string;
  now: number;
}): ResearchMathArtifact {
  return {
    id: `${runId}-draft-equilibrium-candidate`,
    runId,
    patchId,
    stepId: "draft-equilibrium",
    kind: "equilibrium_candidate",
    title: "均衡候选",
    status: equilibrium.status === "solved" ? "passed" : "manual_review",
    source: "candidate",
    output: { equilibrium },
    issues:
      equilibrium.status === "solved"
        ? []
        : ["候选均衡还没有形成 solved 状态的闭式结果。"],
    createdAt: now,
  };
}

function isSolvedEquilibriumCandidate(equilibrium: EquilibriumResult) {
  return equilibrium.status === "solved" && equilibrium.closedForm.trim().length > 0;
}

function isDraftEquilibriumStatus(status?: EquilibriumResult["status"]) {
  return (
    status === "derivation_draft" ||
    status === "implicit_system" ||
    status === "reaction_functions" ||
    status === "failed_with_reason" ||
    status === "needs_model_clarification" ||
    status === "symbolic_failure"
  );
}

function hasPromotionOptimalityEvidence(equilibrium: EquilibriumResult) {
  const text = [
    ...equilibrium.solvingSteps,
    ...equilibrium.conditions,
    equilibrium.derivation,
    ...equilibrium.warnings,
  ].join("\n");

  return /二阶|second.?order|Hessian|海塞|负定|negative definite|凹|concav|KKT|边界|boundary|corner|约束最优|sufficien/i.test(
    text
  );
}

function createUnsolvedEquilibriumRepairDecision(review: {
  decision: EquilibriumSolverKernelDecision;
  artifacts: ResearchMathArtifact[];
}): EquilibriumSolverKernelDecision {
  return {
    action: "repair_model",
    title: "补强模型求解输入",
    reason:
      "候选均衡经过一次有边界修复后仍未得到闭式解，不能作为正式均衡应用；请先补全模型利润函数、需求份额、约束或 FOC 输入，再重新求解。",
    artifactIds:
      review.decision.artifactIds.length > 0
        ? review.decision.artifactIds
        : review.artifacts.map((artifact) => artifact.id),
  };
}

function createBoundedEquilibriumRepairDecision(review: {
  decision: EquilibriumSolverKernelDecision;
  artifacts: ResearchMathArtifact[];
}): EquilibriumSolverKernelDecision {
  return {
    action: "repair_model",
    title: "Repair model and FOC inputs",
    reason:
      "The candidate still failed the bounded solver-kernel review after one repair attempt. Do not apply it as a formal equilibrium; strengthen the model profit functions, decision variables, FOCs, or closed-form solution, then rerun solving.",
    artifactIds:
      review.decision.artifactIds.length > 0
        ? review.decision.artifactIds
        : review.artifacts.map((artifact) => artifact.id),
  };
}

function mergeMathArtifacts(
  previous: ResearchMathArtifact[],
  next: ResearchMathArtifact[]
) {
  const byId = new Map<string, ResearchMathArtifact>();

  [...previous, ...next].forEach((artifact) => {
    byId.set(artifact.id, artifact);
  });

  return [...byId.values()];
}

function findLatestModelCoverageArtifact(artifacts: ResearchMathArtifact[]) {
  return artifacts
    .filter((artifact) => artifact.kind === "model_coverage_check")
    .at(-1);
}

function isBlockingCoverageArtifact(artifact?: ResearchMathArtifact) {
  if (!artifact || artifact.status !== "failed") return false;

  const output =
    artifact.output && typeof artifact.output === "object"
      ? (artifact.output as Record<string, unknown>)
      : {};
  if (output.suspiciousSimplification === true) return true;

  const omitted = Array.isArray(output.omittedHighValueMechanisms)
    ? output.omittedHighValueMechanisms
    : [];
  return omitted.some((item) => {
    if (!item || typeof item !== "object") return false;
    const mechanism = (item as { mechanism?: unknown }).mechanism;
    return (
      mechanism === "quality" ||
      mechanism === "recommendation" ||
      mechanism === "verification" ||
      mechanism === "multihoming" ||
      mechanism === "asymmetry" ||
      mechanism === "boundary"
    );
  });
}

function attachArtifactRunAndPatch({
  artifacts,
  runId,
  patchId,
}: {
  artifacts: ResearchMathArtifact[];
  runId: string;
  patchId: string;
}) {
  return artifacts.map((artifact) => ({
    ...artifact,
    runId,
    patchId,
  }));
}

function createEquilibriumRepairMessage(issues: string[]) {
  return [
    "Agent 自检发现均衡候选还不适合进入性质分析，请只修复以下问题，并保持当前模型和符号表不变：",
    ...issues.map((issue) => `- ${issue}`),
    "修复后仍返回完整 equilibriumResult JSON；不要使用数值模拟、校准或经验回归。",
  ].join("\n");
}

function createEquilibriumCandidatePatch({
  equilibrium,
  now,
  sourceMessageId,
  riskNotes,
  reviewRisk,
  reviewChecks,
}: {
  equilibrium: EquilibriumResult;
  now: number;
  sourceMessageId?: string;
  riskNotes: string[];
  reviewRisk?: ResearchAssetReviewRisk;
  reviewChecks: MathVerificationCheck[];
}) {
  const note = createEquilibriumPatchNote({
    riskNotes,
    reviewChecks,
  });
  const changes: ResearchAssetChange[] = [
    {
      kind: "replace",
      path: "equilibriumResult",
      value: equilibrium,
      note,
      ...(reviewRisk ? { reviewRisk } : {}),
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

function createModelRepairPatch({
  decision,
  artifacts,
  now,
  sourceMessageId,
}: {
  decision: EquilibriumSolverKernelDecision;
  artifacts: ResearchMathArtifact[];
  now: number;
  sourceMessageId?: string;
}) {
  const artifactIssues = artifacts
    .filter((artifact) => decision.artifactIds.includes(artifact.id))
    .flatMap((artifact) => artifact.issues ?? [])
    .slice(0, 5);
  const value = [
    "Agent 求解阻塞：",
    decision.reason,
    ...artifactIssues.map((issue) => `- ${issue}`),
  ]
    .filter(Boolean)
    .join("\n");
  const changes: ResearchAssetChange[] = [
    {
      kind: "append",
      path: "modelSetupDraft",
      value,
      note: decision.reason,
    },
  ];

  return createResearchAssetPatch({
    id: `patch-model-solver-input-${now}`,
    kind: "model",
    summary: "求解内核建议先修复模型输入，再继续均衡求解",
    changes,
    createdAt: now,
    sourceMessageId,
  });
}

function createEquilibriumPatchNote({
  riskNotes,
  reviewChecks,
}: {
  riskNotes: string[];
  reviewChecks: MathVerificationCheck[];
}) {
  const lines = [
    riskNotes.length > 0
      ? `Agent 自检提示：${riskNotes.join("；")}`
      : "Agent 自检未发现阻断性质分析的明显风险。",
  ];
  const sympyNotes = reviewChecks
    .filter((check) => check.kind === "sympy_execution")
    .map((check) => `${formatCheckStatusForNote(check.status)}: ${check.message}`)
    .slice(0, 4);

  if (sympyNotes.length > 0) {
    lines.push(`SymPy 复核记录：${sympyNotes.join("；")}`);
  }

  return lines.join(" ");
}

function formatCheckStatusForNote(status: MathVerificationCheck["status"]) {
  switch (status) {
    case "passed":
      return "已通过";
    case "failed":
      return "需修正";
    case "condition_insufficient":
      return "条件不足";
    case "unsupported":
      return "暂不支持";
    case "manual_review":
      return "人工复核";
  }
}

function attachEquilibriumPatchForReview({
  originalProject,
  solveResult,
  patch,
  agentRun,
  now,
  reviewIssues,
  reviewChecks,
  mathArtifacts,
}: {
  originalProject: ResearchProject;
  solveResult: ResearchGenerationResponse;
  patch: ReturnType<typeof createEquilibriumCandidatePatch>;
  agentRun: AgentRun;
  now: number;
  reviewIssues: string[];
  reviewChecks: MathVerificationCheck[];
  mathArtifacts: ResearchMathArtifact[];
}) {
  const session =
    originalProject.researchSession ??
    solveResult.project.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);
  const previousPatches = originalProject.researchSession?.assetPatches ?? [];
  const messages = [
    ...session.messages,
    {
      id: `msg-equilibrium-agent-review-${now}`,
      role: "assistant" as const,
      content: createReviewMessage(reviewIssues),
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
        assetPatches: appendOrReplaceProposedPatch(previousPatches, patch),
        mathVerificationChecks: mergeSessionMathVerificationChecks(
          session.mathVerificationChecks,
          reviewChecks
        ),
        mathArtifacts: mergeSessionMathArtifacts(
          session.mathArtifacts,
          mathArtifacts
        ),
        assetSummary: {
          ...session.assetSummary,
          equilibriumStatus:
            originalProject.equilibriumResult?.status ?? "not_started",
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

function attachEquilibriumDraftForReview({
  originalProject,
  solveResult,
  equilibrium,
  agentRun,
  now,
  draftReason,
  reviewChecks = [],
  mathArtifacts = [],
}: {
  originalProject: ResearchProject;
  solveResult: ResearchGenerationResponse;
  equilibrium: EquilibriumResult;
  agentRun: AgentRun;
  now: number;
  draftReason?: string;
  reviewChecks?: MathVerificationCheck[];
  mathArtifacts?: ResearchMathArtifact[];
}) {
  const session =
    originalProject.researchSession ??
    solveResult.project.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);
  const providerMessages = solveResult.project.researchSession?.messages ?? [];
  const preserveExistingEquilibrium =
    solveResult.usedFallback &&
    Boolean(originalProject.equilibriumResult) &&
    !isDraftEquilibriumStatus(originalProject.equilibriumResult?.status);
  const displayedEquilibrium = preserveExistingEquilibrium
    ? originalProject.equilibriumResult
    : equilibrium;
  const messages = mergeMessagesById(session.messages, [
    ...providerMessages,
    {
      id: `msg-equilibrium-agent-draft-${now}`,
      role: "assistant" as const,
      content: createEquilibriumDraftReviewMessage(equilibrium, draftReason),
      createdAt: 0,
    },
  ]);

  return attachAgentRun(
    {
      ...solveResult.project,
      equilibriumResult: displayedEquilibrium,
      propertyAnalyses: originalProject.propertyAnalyses,
      researchSession: {
        ...session,
        phase: "equilibrium",
        messages,
        agentRun,
        assetPatches: originalProject.researchSession?.assetPatches ?? [],
        mathVerificationChecks: mergeSessionMathVerificationChecks(
          session.mathVerificationChecks,
          reviewChecks
        ),
        mathArtifacts: mergeSessionMathArtifacts(
          session.mathArtifacts,
          mathArtifacts
        ),
        assetSummary: {
          ...session.assetSummary,
          equilibriumStatus:
            displayedEquilibrium?.status ?? equilibrium.status,
          pendingDecision: {
            kind: "solve_equilibrium",
            prompt:
              draftReason ??
              "当前只有均衡推导草稿或隐式系统；请继续推导、补齐模型输入或人工复核后再生成正式均衡。",
          },
          nextActions: [
            "阅读中间对话中的均衡推导草稿",
            "检查 FOC、二阶条件和边界条件是否完整",
            "补齐模型输入后重新生成正式均衡",
          ],
        },
      },
    },
    agentRun
  );
}

function mergeMessagesById(
  current: ResearchSessionMessage[],
  incoming: ResearchSessionMessage[]
) {
  const byId = new Map<string, ResearchSessionMessage>();

  [...current, ...incoming].forEach((message) => {
    byId.set(message.id, message);
  });

  return [...byId.values()];
}

function createEquilibriumDraftReviewMessage(
  equilibrium: EquilibriumResult,
  draftReason?: string
) {
  return [
    "这次均衡求解停在推导草稿阶段，暂时没有创建正式均衡 patch。",
    "",
    `当前状态：${equilibrium.status}。`,
    draftReason ? `原因：${draftReason}` : "",
    "需要继续检查 FOC、二阶条件/Hessian 或边界/KKT 条件后，才能把结果晋升为正式均衡资产。",
  ].filter(Boolean).join("\n");
}

function attachModelRepairPatchForReview({
  originalProject,
  solveResult,
  patch,
  agentRun,
  now,
  reviewIssues,
  reviewChecks,
  mathArtifacts,
  decision,
}: {
  originalProject: ResearchProject;
  solveResult: ResearchGenerationResponse;
  patch: ReturnType<typeof createModelRepairPatch>;
  agentRun: AgentRun;
  now: number;
  reviewIssues: string[];
  reviewChecks: MathVerificationCheck[];
  mathArtifacts: ResearchMathArtifact[];
  decision: EquilibriumSolverKernelDecision;
}) {
  const session =
    originalProject.researchSession ??
    solveResult.project.researchSession ??
    createInitialResearchSession(originalProject.rawIdea);
  const previousPatches = originalProject.researchSession?.assetPatches ?? [];
  const messages = [
    ...session.messages,
    {
      id: `msg-equilibrium-agent-model-repair-${now}`,
      role: "assistant" as const,
      content: createModelRepairReviewMessage({
        decision,
        reviewIssues,
      }),
      createdAt: 0,
    },
  ];

  return attachAgentRun(
    {
      ...solveResult.project,
      hotellingModel: originalProject.hotellingModel,
      equilibriumResult: originalProject.equilibriumResult,
      propertyAnalyses: originalProject.propertyAnalyses,
      researchSession: {
        ...session,
        phase: "equilibrium",
        messages,
        agentRun,
        assetPatches: appendOrReplaceProposedPatch(previousPatches, patch),
        mathVerificationChecks: mergeSessionMathVerificationChecks(
          session.mathVerificationChecks,
          reviewChecks
        ),
        mathArtifacts: mergeSessionMathArtifacts(
          session.mathArtifacts,
          mathArtifacts
        ),
        assetSummary: {
          ...session.assetSummary,
          equilibriumStatus:
            originalProject.equilibriumResult?.status ?? "not_started",
          pendingDecision: {
            kind: "solve_equilibrium",
            prompt:
              "求解内核需要先审阅模型修复 patch，才能继续均衡求解。",
          },
          nextActions: [
            "审阅模型修复 patch",
            "应用或拒绝模型 patch",
            "模型输入补齐后重新生成符号均衡",
          ],
        },
      },
    },
    agentRun
  );
}

function mergeSessionMathVerificationChecks(
  previous: MathVerificationCheck[] | undefined,
  next: MathVerificationCheck[]
) {
  const seen = new Set<string>();
  const merged: MathVerificationCheck[] = [];

  [...(previous ?? []), ...next].forEach((check) => {
    const key = [
      check.kind,
      check.status,
      check.analysisId ?? "",
      check.analysisIndex ?? "",
      check.message,
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(check);
  });

  return merged.slice(-20);
}

function mergeSessionMathArtifacts(
  previous: ResearchMathArtifact[] | undefined,
  next: ResearchMathArtifact[]
) {
  const byId = new Map<string, ResearchMathArtifact>();

  [...(previous ?? []), ...next].forEach((artifact) => {
    byId.set(artifact.id, artifact);
  });

  return [...byId.values()].slice(-50);
}

function createModelRepairReviewMessage({
  decision,
  reviewIssues,
}: {
  decision: EquilibriumSolverKernelDecision;
  reviewIssues: string[];
}) {
  const issueLines =
    reviewIssues.length > 0
      ? reviewIssues.map((issue) => `- ${issue}`)
      : ["- 求解内核无法编译完整的模型侧输入。"];

  return [
    "均衡求解内核已在创建新均衡 patch 前暂停。",
    "",
    decision.reason,
    "",
    ...issueLines,
    "",
    "请先审阅模型修复 patch，再重新运行符号均衡求解。",
  ].join("\n");
}

function createReviewMessage(reviewIssues: string[]) {
  const reviewLine =
    reviewIssues.length > 0
      ? `Agent 自检提示：${reviewIssues.join("；")}`
      : "Agent 自检未发现明显阻断性质分析的风险。";

  return [
    "我已生成一版均衡候选，并放到右侧作为待审核修改建议。",
    "",
    `${reviewLine} 我没有直接进入性质分析；需要先审阅并应用这条修改建议。`,
  ].join("\n");
}

function attachAgentRun(project: ResearchProject, agentRun: AgentRun) {
  return appendAgentRunToProject(project, agentRun);
}
