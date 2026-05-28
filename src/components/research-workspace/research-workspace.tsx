"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquarePlus, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";

import { ChatPanel } from "./chat-panel";
import { ResearchAssetsPanel } from "./research-assets-panel";
import { ResearchSidebar } from "./research-sidebar";
import { ResearchWorkspaceShell } from "./research-workspace-shell";
import {
  createProject,
  createAgentTaskApi,
  fetchAgentTaskApi,
  fetchProject,
  generateResearchProjectApi,
  listAgentTasksForProjectApi,
  runAgentTaskApi,
  saveProject,
  type GenerateResearchProjectResult,
} from "@/lib/api";
import {
  MODEL_SOURCE_STORAGE_KEY,
  ONLINE_EVIDENCE_STORAGE_KEY,
  getModelSourceMetadata,
  getRuntimeModelSourceSettings,
  parseStoredOnlineEvidenceEnabled,
  parseStoredModelSourceSettings,
} from "@/lib/model-source";
import {
  planSafeContinuation,
  type SafeContinuationStep,
} from "@/lib/research-agent/controller";
import { selectRecoverableAgentTaskForProject } from "@/lib/research-agent/task-recovery";
import {
  isAgentTaskInProgress,
  selectVisibleActiveAgentTask,
} from "@/lib/research-agent/workspace-agent-task-state";
import { appendSafeContinuationTrace } from "@/lib/research-agent/trace";
import { proposeRollbackPatchFromVersionEvent } from "@/lib/research-agent/version-history";
import type { AgentRecoverySuggestion } from "@/lib/research-agent/recovery";
import {
  applyQuickReviewAssetPatchesToProject,
  applyResearchAssetPatchToProject,
  markProjectPatchStatus,
} from "@/lib/research-asset-patch-apply";
import {
  createResearchChatViewMessages,
  type ResearchChatViewMessage,
} from "@/lib/research-chat-view";
import { markResearchAssetsStaleAfterModelEdit } from "@/lib/research-flow";
import {
  createComposingSidebarProject,
  getResearchWorkspaceViewState,
} from "@/lib/research-workspace-state";
import {
  classifyResearchInput,
  isCasualConversationStarter,
} from "@/lib/research-intent";
import {
  confirmResearchModel,
  createInitialResearchSession,
  getCurrentResearchDirectionId,
  normalizeResearchProjectForWorkspace,
} from "@/lib/research-session";
import { normalizeSymbolRegistry } from "@/lib/symbol-governance";
import { getPersistableResearchProject } from "@/lib/research-generation-result";
import { useStore } from "@/lib/store";
import type {
  AgentTask,
  AgentTaskInput,
  ResearchAssetPatch,
  ResearchProject,
  ResearchSessionMessage,
  SymbolDefinition,
} from "@/lib/types";
import type { AgentResumeRequest } from "@/lib/research-agent/resume";

export function ResearchWorkspace({
  project,
  startComposingNewConversation = false,
}: {
  project?: ResearchProject;
  startComposingNewConversation?: boolean;
}) {
  const router = useRouter();
  const { dispatch } = useStore();
  const [isSending, setIsSending] = useState(false);
  const [adoptingDirectionId, setAdoptingDirectionId] = useState<string | null>(
    null
  );
  const [isConfirmingModel, setIsConfirmingModel] = useState(false);
  const [isSolvingEquilibrium, setIsSolvingEquilibrium] = useState(false);
  const [isAnalyzingProperties, setIsAnalyzingProperties] = useState(false);
  const [isDraftingPaper, setIsDraftingPaper] = useState(false);
  const [revisingPaperSectionId, setRevisingPaperSectionId] = useState<
    string | null
  >(null);
  const [isContinuingSafely, setIsContinuingSafely] = useState(false);
  const [activeAgentTask, setActiveAgentTask] = useState<AgentTask | null>(null);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [localComposingProjectId, setLocalComposingProjectId] =
    useState<string | null>(null);
  const [optimisticMessage, setOptimisticMessage] =
    useState<ResearchSessionMessage | null>(null);
  const [pendingAssistantMessage, setPendingAssistantMessage] =
    useState<ResearchChatViewMessage | null>(null);
  const [localConversationMessages, setLocalConversationMessages] = useState<
    ResearchSessionMessage[]
  >([]);
  const inFlightAgentTaskIdsRef = useRef<Set<string>>(new Set());
  const runAndRefreshAgentTaskRef = useRef<
    ((task: AgentTask, projectId: string) => Promise<ResearchProject>) | null
  >(null);
  const activeProject = project
    ? normalizeResearchProjectForWorkspace(project)
    : null;
  const activeProjectId = activeProject?.id;
  const { isComposingNewConversation } = getResearchWorkspaceViewState({
    projectId: project?.id,
    startComposingNewConversation,
    localComposingProjectId,
  });
  const displayedProject = isComposingNewConversation ? null : activeProject;
  const sidebarProject =
    activeProject ?? createComposingSidebarProject(createTimestamp());
  const session = displayedProject
    ? displayedProject.researchSession ??
      createInitialResearchSession(displayedProject.rawIdea)
    : null;
  const visibleAgentTask = selectVisibleActiveAgentTask({
    activeTask: activeAgentTask,
    tasks: agentTasks,
    projectId: activeProjectId,
  });
  const isAgentTaskActive = Boolean(visibleAgentTask);
  const isBusy =
    isSending ||
    Boolean(adoptingDirectionId) ||
    isConfirmingModel ||
    isSolvingEquilibrium ||
    isAnalyzingProperties ||
    isDraftingPaper ||
    Boolean(revisingPaperSectionId) ||
    isContinuingSafely ||
    isAgentTaskActive;

  function readStoredModelSourceSettings() {
    return parseStoredModelSourceSettings(
      window.localStorage.getItem(MODEL_SOURCE_STORAGE_KEY)
    );
  }

  function readRuntimeModelSourceSettings() {
    return getRuntimeModelSourceSettings(readStoredModelSourceSettings());
  }

  function readOnlineEvidenceEnabled() {
    return parseStoredOnlineEvidenceEnabled(
      window.localStorage.getItem(ONLINE_EVIDENCE_STORAGE_KEY)
    );
  }

  async function persistGeneratedProject(nextProject: ResearchProject) {
    dispatch({ type: "SET_PROJECT", payload: nextProject });
    await saveProject(nextProject);
  }

  async function refreshProjectFromServer(projectId: string) {
    const refreshed = normalizeResearchProjectForWorkspace(
      await fetchProject(projectId)
    );
    dispatch({ type: "SET_PROJECT", payload: refreshed });
    return refreshed;
  }

  function upsertAgentTask(task: AgentTask) {
    setAgentTasks((currentTasks) => {
      const nextTasks = currentTasks.filter((item) => item.id !== task.id);
      return [task, ...nextTasks].sort((a, b) => b.updatedAt - a.updatedAt);
    });
  }

  async function runBackgroundAgentTask({
    action,
    currentProject,
    resume,
    sectionId,
    instruction,
  }: {
    action: BackgroundAgentTaskAction;
    currentProject: ResearchProject;
    resume?: AgentResumeRequest;
    sectionId?: string;
    instruction?: string;
  }) {
    const task = await createAgentTaskApi({
      rawIdea: currentProject.rawIdea,
      action,
      projectId: currentProject.id,
      ...(resume ? { resume } : {}),
      ...(sectionId ? { sectionId } : {}),
      ...(instruction ? { instruction } : {}),
    });
    setActiveAgentTask(task);
    upsertAgentTask(task);
    return runAndRefreshAgentTask(task, currentProject.id);
  }

  async function runAndRefreshAgentTask(
    task: AgentTask,
    projectId: string
  ) {
    if (inFlightAgentTaskIdsRef.current.has(task.id)) {
      return refreshProjectFromServer(projectId);
    }

    inFlightAgentTaskIdsRef.current.add(task.id);
    try {
      let runTaskError: unknown;
      const runTaskPromise = runAgentTaskApi(
        task.id,
        readRuntimeModelSourceSettings()
      ).catch((error) => {
        runTaskError = error;
        return null;
      });

      const finishedTask = await waitForAgentTaskCompletion(
        task,
        (updatedTask) => {
          setActiveAgentTask(updatedTask);
          upsertAgentTask(updatedTask);
        }
      );
      const routeTask = await runTaskPromise;
      const finalTask = selectNewestAgentTask(
        routeTask ? [finishedTask, routeTask] : [finishedTask]
      );
      upsertAgentTask(finalTask);
      if (runTaskError && isAgentTaskInProgress(finalTask)) {
        setActiveAgentTask(finalTask);
        throw runTaskError;
      }
      if (finalTask.status === "failed") {
        setActiveAgentTask(null);
        throw new Error(finalTask.error ?? "Agent task failed");
      }
      if (finalTask.status !== "completed") {
        setActiveAgentTask(
          isAgentTaskInProgress(finalTask) ? finalTask : null
        );
        throw new Error(`Agent task stopped with status: ${finalTask.status}`);
      }

      setActiveAgentTask(null);
      return refreshProjectFromServer(projectId);
    } finally {
      inFlightAgentTaskIdsRef.current.delete(task.id);
    }
  }
  useEffect(() => {
    runAndRefreshAgentTaskRef.current = runAndRefreshAgentTask;
  });

  useEffect(() => {
    if (!activeProjectId || isComposingNewConversation) {
      return;
    }

    let cancelled = false;

    async function recoverAgentTask() {
      if (!activeProjectId) return;

      try {
        const tasks = await listAgentTasksForProjectApi(activeProjectId);
        if (cancelled) return;
        setAgentTasks(tasks);

        const recoverableTask = selectRecoverableAgentTaskForProject(
          tasks,
          activeProjectId
        );
        if (!recoverableTask) return;
        if (inFlightAgentTaskIdsRef.current.has(recoverableTask.id)) return;

        setActiveAgentTask(recoverableTask);
        upsertAgentTask(recoverableTask);
        const runTask = runAndRefreshAgentTaskRef.current;
        if (!runTask) return;
        await runTask(recoverableTask, activeProjectId);
      } catch (error) {
        if (cancelled) return;
        setActiveAgentTask(null);
        console.error("Failed to recover agent task", error);
        toast.error("任务恢复失败", {
          description: "请刷新项目或重新点击当前步骤。",
        });
      }
    }

    recoverAgentTask();

    return () => {
      cancelled = true;
    };
  }, [activeProjectId, isComposingNewConversation]);

  async function handleAdopt(directionId: string) {
    if (!activeProject || isBusy) return;

    setAdoptingDirectionId(directionId);
    try {
      const result =
        await generateResearchProjectApi({
          action: "build_model",
          rawIdea: activeProject.rawIdea,
          selectedDirectionId: directionId,
          project: activeProject,
          runtimeModelSource: readRuntimeModelSourceSettings(),
        });
      const nextProject = getPersistableResearchProject(result);
      if (!nextProject) {
        toast.error("模型生成失败，右侧资产未更新。");
        return;
      }
      await persistGeneratedProject(nextProject);
      toast.success("已采用方向", {
        description: "模型生成 Agent 已准备修改建议，请先在右侧审阅并应用。",
      });
    } catch (error) {
      console.error("Failed to adopt direction", error);
      toast.error("采用方向失败");
    } finally {
      setAdoptingDirectionId(null);
    }
  }

  async function handleConfirmModel() {
    if (!activeProject || isBusy) return;

    setIsConfirmingModel(true);
    try {
      const nextProject = confirmResearchModel(activeProject);
      await persistGeneratedProject(nextProject);
      toast.success("模型设定已确认", {
        description: "下一步可以在右侧均衡页生成符号均衡推导。",
      });
    } catch (error) {
      console.error("Failed to confirm model", error);
      toast.error("模型确认失败");
    } finally {
      setIsConfirmingModel(false);
    }
  }

  async function handleBuildModelRepair() {
    if (!activeProject || isBusy) return;

    const currentDirectionId = getCurrentResearchDirectionId(activeProject);
    if (!currentDirectionId) {
      toast.info("请先采用一个研究方向", {
        description: "模型修复需要沿着已采用的方向生成待审核修改建议。",
      });
      return;
    }

    setIsConfirmingModel(true);
    try {
      const result = await generateResearchProjectApi({
        action: "build_model",
        rawIdea: activeProject.rawIdea,
        selectedDirectionId: currentDirectionId,
        userMessage:
          "请根据最近一次均衡求解内核保存的数学产物修复模型求解输入：补齐决策变量、结构化利润函数和 FOC 所需符号；只生成待审核模型 patch，不要直接覆盖正式资产。",
        project: activeProject,
        runtimeModelSource: readRuntimeModelSourceSettings(),
      });
      const nextProject = getPersistableResearchProject(result);
      if (!nextProject) {
        toast.error("模型修复失败，右侧资产未更新。");
        return;
      }
      await persistGeneratedProject(nextProject);
      toast.success("模型修复建议已生成", {
        description: "请在右侧模型页审阅并应用，再重新进行符号求解。",
      });
    } catch (error) {
      console.error("Failed to generate model repair", error);
      toast.error("模型修复建议生成失败");
    } finally {
      setIsConfirmingModel(false);
    }
  }

  async function confirmModelForSafeContinuation(
    currentProject: ResearchProject
  ) {
    setIsConfirmingModel(true);
    try {
      const nextProject = confirmResearchModel(currentProject);
      await persistGeneratedProject(nextProject);
      return nextProject;
    } finally {
      setIsConfirmingModel(false);
    }
  }

  async function runAgentActionForSafeContinuation(
    action: Exclude<SafeContinuationStep["agentAction"], undefined>,
    currentProject: ResearchProject
  ) {
    if (action === "build_model") {
      throw new Error("Direction choice must remain manual.");
    }

    const setBusy =
      action === "solve_equilibrium"
        ? setIsSolvingEquilibrium
        : action === "analyze_properties"
          ? setIsAnalyzingProperties
          : setIsDraftingPaper;

    setBusy(true);
    try {
      const nextProject = await runBackgroundAgentTask({
        action,
        currentProject,
      });

      const projectAfterAction =
        action === "solve_equilibrium" &&
        !hasProposedAssetPatch(nextProject, "equilibrium")
          ? markAssetFreshnessAfterEquilibrium(nextProject)
          : action === "analyze_properties" &&
              !hasProposedAssetPatch(nextProject, "properties")
            ? markAssetFreshnessAfterProperties(nextProject)
            : nextProject;

      await persistGeneratedProject(projectAfterAction);
      return projectAfterAction;
    } finally {
      setBusy(false);
    }
  }

  async function handleSafeContinue() {
    if (!activeProject || isBusy) return;

    const plan = planSafeContinuation(activeProject);
    if (plan.status !== "ready" || plan.steps.length === 0) {
      toast.info(plan.title, {
        description: plan.blocker?.description ?? plan.reason,
      });
      return;
    }

    setIsContinuingSafely(true);
    let currentProject = activeProject;
    const executedSteps: SafeContinuationStep[] = [];
    try {
      for (const step of plan.steps) {
        if (step.kind === "confirm_model") {
          currentProject = await confirmModelForSafeContinuation(currentProject);
          executedSteps.push(step);
          continue;
        }

        if (!step.agentAction) {
          throw new Error("Continuous step is missing an agent action.");
        }

        currentProject = await runAgentActionForSafeContinuation(
          step.agentAction,
          currentProject
        );
        executedSteps.push(step);

        if (hasAnyProposedAssetPatch(currentProject)) {
          break;
        }
      }

      const stopPlan = planSafeContinuation(currentProject);
      currentProject = appendSafeContinuationTrace(currentProject, {
        plan,
        executedSteps,
        finalPlan: stopPlan,
      });
      await persistGeneratedProject(currentProject);
      toast.success("已推进到下一个审核点", {
        description:
          stopPlan.blocker?.description ??
          "请先在右侧审阅并处理修改建议，再继续下一步。",
      });
    } catch (error) {
      console.error("Failed to continue safely", error);
      toast.error("连续推进失败", {
        description: "本次没有绕过审核；请检查当前资产后再重试。",
      });
    } finally {
      setIsContinuingSafely(false);
    }
  }

  async function handleSolveEquilibrium(
    userMessage?: string,
    allowDuringChat = false,
    resume?: AgentResumeRequest
  ) {
    if (
      !activeProject ||
      (!allowDuringChat &&
        (isSending ||
          Boolean(adoptingDirectionId) ||
          isConfirmingModel ||
          isSolvingEquilibrium ||
          isAnalyzingProperties ||
          isDraftingPaper))
    ) {
      return;
    }

    setIsSolvingEquilibrium(true);
    try {
      const nextProject = await runBackgroundAgentTask({
        action: "solve_equilibrium",
        currentProject: activeProject,
        resume,
      });
      const hasPendingEquilibriumPatch = hasProposedAssetPatch(
        nextProject,
        "equilibrium"
      );
      const projectAfterEquilibrium = hasPendingEquilibriumPatch
        ? nextProject
        : markAssetFreshnessAfterEquilibrium(nextProject);
      const nextProjectWithMessage = userMessage
        ? attachChatMessageToProject(
            projectAfterEquilibrium,
            userMessage
          )
        : projectAfterEquilibrium;
      await persistGeneratedProject(nextProjectWithMessage);
      if (hasPendingEquilibriumPatch) {
        toast.success("均衡求解 Agent 已准备修改建议", {
          description: "请先在右侧审阅并应用，再进入性质分析。",
        });
      } else {
        toast.success("符号均衡推导已生成", {
          description: "请检查闭式解、推导步骤和存在条件是否可用于论文。",
        });
      }
    } catch (error) {
      console.error("Failed to solve symbolic equilibrium", error);
      toast.error("符号均衡推导生成失败");
    } finally {
      setIsSolvingEquilibrium(false);
    }
  }

  async function handleAnalyzeProperties(
    userMessage?: string,
    allowDuringChat = false,
    resume?: AgentResumeRequest
  ) {
    if (
      !activeProject ||
      (!allowDuringChat &&
        (isSending ||
          Boolean(adoptingDirectionId) ||
          isConfirmingModel ||
          isSolvingEquilibrium ||
          isAnalyzingProperties))
    ) {
      return;
    }

    setIsAnalyzingProperties(true);
    try {
      const nextProject = await runBackgroundAgentTask({
        action: "analyze_properties",
        currentProject: activeProject,
        resume,
      });
      const hasPendingPropertiesPatch = hasProposedAssetPatch(
        nextProject,
        "properties"
      );
      const projectAfterProperties = hasPendingPropertiesPatch
        ? nextProject
        : markAssetFreshnessAfterProperties(nextProject);
      const nextProjectWithMessage = userMessage
        ? attachChatMessageToProject(
            projectAfterProperties,
            userMessage
          )
        : projectAfterProperties;
      await persistGeneratedProject(nextProjectWithMessage);
      if (hasPendingPropertiesPatch) {
        toast.success("性质分析 Agent 已准备修改建议", {
          description: "请先在右侧审阅并应用，再整理命题或论文草稿。",
        });
      } else {
        toast.success("性质分析已生成", {
          description: "低质量或单条空洞性质会被拒绝，右侧质检会继续提示风险。",
        });
      }
    } catch (error) {
      console.error("Failed to analyze properties", error);
      toast.error("性质分析生成失败");
    } finally {
      setIsAnalyzingProperties(false);
    }
  }

  async function handleDraftPaper(resume?: AgentResumeRequest) {
    if (!activeProject || isBusy) return;

    setIsDraftingPaper(true);
    try {
      const nextProject = await runBackgroundAgentTask({
        action: "draft_paper",
        currentProject: activeProject,
        resume,
      });
      await persistGeneratedProject(nextProject);
      toast.success("论文输出 Agent 已准备草稿建议", {
        description: "请先在右侧审阅并应用，再导出 Markdown 或继续改写。",
      });
    } catch (error) {
      console.error("Failed to draft paper", error);
      toast.error("论文草稿整理失败");
    } finally {
      setIsDraftingPaper(false);
    }
  }

  async function handleRevisePaperSection(
    sectionId: string,
    instruction?: string
  ) {
    if (!activeProject || isBusy) return;

    setRevisingPaperSectionId(sectionId);
    try {
      const nextProject = await runBackgroundAgentTask({
        action: "revise_paper_section",
        currentProject: activeProject,
        sectionId,
        instruction,
      });

      await persistGeneratedProject(nextProject);
      toast.success("章节级论文 Agent 已准备改写建议", {
        description: "请先在右侧审阅并应用，本次不会直接覆盖现有章节。",
      });
    } catch (error) {
      console.error("Failed to revise paper section", error);
      toast.error("章节改写建议生成失败");
    } finally {
      setRevisingPaperSectionId(null);
    }
  }

  async function handleRunRecovery(suggestion: AgentRecoverySuggestion) {
    const resume = getResumeRequestForSuggestion(suggestion);

    switch (suggestion.actionKind) {
      case "confirm_model":
        await handleConfirmModel();
        return;
      case "solve_equilibrium":
        await handleSolveEquilibrium(undefined, false, resume);
        return;
      case "analyze_properties":
        await handleAnalyzeProperties(undefined, false, resume);
        return;
      case "draft_paper":
        await handleDraftPaper(resume);
        return;
      case "safe_continue":
        await handleSafeContinue();
        return;
      default:
        toast.info("请先处理当前恢复提示。");
    }
  }

  async function handleSubmit(content: string) {
    if (isBusy) return;

    const idea = content.trim();
    if (!idea) return;

    if (
      (isComposingNewConversation || !activeProject) &&
      isCasualConversationStarter(idea)
    ) {
      setLocalConversationMessages((messages) => [
        ...messages,
        {
          id: createMessageId("msg-local-user"),
          role: "user",
          content: idea,
          createdAt: createTimestamp(),
        },
        {
          id: createMessageId("msg-local-assistant"),
          role: "assistant",
          content:
            "我在。这个工作台主要做博弈论论文流程：方向发现、联网来源、模型候选、符号均衡、性质分析、论文输出和 Markdown 导出。\n\n要开始新研究，请直接输入一个具体研究想法；打开已有项目后，也可以问我当前模型、均衡、性质分析或论文草稿哪里需要改。",
          createdAt: createTimestamp(),
        },
      ]);
      return;
    }

    const pendingAssistantBubble = createPendingAssistantMessage();
    setOptimisticMessage({
      id: createMessageId("msg-optimistic"),
      role: "user",
      content: idea,
      createdAt: createTimestamp(),
    });
    setPendingAssistantMessage(pendingAssistantBubble);

    if (isComposingNewConversation || !activeProject) {
      setIsSending(true);
      const settings = readStoredModelSourceSettings();

      try {
        const result =
          await generateResearchProjectApi({
            action: "discover_directions",
            rawIdea: idea,
            modelSource: getModelSourceMetadata(settings),
            runtimeModelSource: getRuntimeModelSourceSettings(settings),
            useOnlineEvidence: readOnlineEvidenceEnabled(),
          });
        const generatedProject = getPersistableResearchProject(result);
        if (!generatedProject) {
          toast.error("模型服务不可用，未创建新研究。");
          return;
        }
        const saved = await createProject(generatedProject);
        dispatch({ type: "NEW_PROJECT", payload: saved });
        setLocalComposingProjectId(null);
        setLocalConversationMessages([]);
        router.push(`/research/${saved.id}`);
        toast.success("已开启新的探索对话");
      } catch (error) {
        console.error("Failed to generate research project", error);
        toast.error("新研究生成失败");
      } finally {
        setIsSending(false);
        setOptimisticMessage(null);
        setPendingAssistantMessage(null);
      }
      return;
    }

    if (!session) {
      setOptimisticMessage(null);
      setPendingAssistantMessage(null);
      return;
    }

    const inputIntent = classifyResearchInput(idea);

    setIsSending(true);
    try {
      if (inputIntent === "redo_equilibrium") {
        await handleSolveEquilibrium(idea, true);
        return;
      }

      if (inputIntent === "redo_properties" && activeProject.equilibriumResult) {
        await handleAnalyzeProperties(idea, true);
        return;
      }

      const result = await generateResearchProjectApi({
        action: "continue_conversation",
        rawIdea: activeProject.rawIdea,
        userMessage: idea,
        project: activeProject,
        runtimeModelSource: readRuntimeModelSourceSettings(),
      });
      const nextProject = result.assetPatch
        ? attachConversationPatch(result)
        : result.project;
      await persistGeneratedProject(nextProject);

      if (result.assetPatch) {
        toast.success("已生成修改建议", {
          description: "右侧会显示待应用修改，确认后才会改动结构化资产。",
        });
      } else if (result.usedFallback) {
        toast.info("模型服务暂不可用，已保留对话消息，右侧资产未更新。");
      } else {
        toast.success("已回复", {
          description: inputIntent === "refine_model"
            ? "这次先作为对话建议，不会直接覆盖模型。"
            : "这次消息只进入对话，不会覆盖当前研究资产。",
        });
      }
    } catch (error) {
      console.error("Failed to continue research generation", error);
      toast.error("对话回复失败");
    } finally {
      setIsSending(false);
      setOptimisticMessage(null);
      setPendingAssistantMessage(null);
    }
  }

  async function handleSaveModelAssumptions(assumptions: string[]) {
    if (!activeProject?.hotellingModel || !session) return;

    const nextProject = markResearchAssetsStaleAfterModelEdit({
      ...activeProject,
      hotellingModel: {
        ...activeProject.hotellingModel,
        assumptions,
      },
      researchSession: {
        ...session,
        assetSummary: {
          ...session.assetSummary,
          confirmedAssumptions: assumptions,
          pendingDecision: {
            kind: "solve_equilibrium",
            prompt: "模型假设已经修改。请重新生成符号均衡，再进入性质分析。",
          },
          nextActions: [
            "检查右侧模型假设是否准确",
            "重新生成符号均衡",
            "基于新均衡重做性质分析",
          ],
        },
        messages: [
          ...session.messages,
          {
            id: createMessageId("msg-model-edited"),
            role: "assistant",
            content:
              "模型假设已在右侧更新。旧的均衡和性质分析已标记为需要重新检查，建议下一步重新生成符号均衡。",
            createdAt: createTimestamp(),
          },
        ],
      },
    });

    await persistGeneratedProject(nextProject);
    toast.success("模型假设已保存", {
      description: "均衡和性质分析已标记为需要重算。",
    });
  }

  async function handleSaveModelSymbols(symbols: SymbolDefinition[]) {
    if (!activeProject?.hotellingModel || !session) return;

    const nextSymbols = normalizeSymbolRegistry(symbols);
    const nextProject = markResearchAssetsStaleAfterModelEdit({
      ...activeProject,
      hotellingModel: {
        ...activeProject.hotellingModel,
        symbols: nextSymbols,
      },
      researchSession: {
        ...session,
        assetSummary: {
          ...session.assetSummary,
          pendingDecision: {
            kind: "solve_equilibrium",
            prompt: "符号表已经更新。请重新生成符号均衡，再进入性质分析。",
          },
          nextActions: [
            "检查右侧符号表是否完整",
            "重新生成符号均衡",
            "基于新符号体系重做性质分析",
          ],
        },
        messages: [
          ...session.messages,
          {
            id: createMessageId("msg-symbols-edited"),
            role: "assistant",
            content:
              "符号表已在右侧更新。旧的均衡和性质分析已标记为需要重新检查，建议下一步重新生成符号均衡。",
            createdAt: createTimestamp(),
          },
        ],
      },
    });

    await persistGeneratedProject(nextProject);
    toast.success("符号表已保存", {
      description: "均衡和性质分析已标记为需要重算。",
    });
  }

  async function handleApplyAssetPatch(patchId: string) {
    const currentProject = displayedProject ?? activeProject;
    if (!currentProject?.researchSession) return;

    const patch = currentProject.researchSession.assetPatches?.find(
      (item) => item.id === patchId
    );
    if (!patch) return;

    const nextProject = applyResearchAssetPatchToProject(currentProject, patch);
    await persistGeneratedProject(nextProject);
    const appliedPatch = nextProject.researchSession?.assetPatches?.find(
      (item) => item.id === patchId
    );
    if (appliedPatch?.status !== "applied") {
      toast.error("修改未应用", {
        description: "这条修改建议没有识别到可写入右侧资产的有效路径。",
      });
      return;
    }

    toast.success("修改已应用", {
      description: getAppliedPatchToastDescription(patch.kind),
    });
  }

  async function handleApplyQuickReviewAssetPatches(patchIds: string[]) {
    const currentProject = displayedProject ?? activeProject;
    if (!currentProject?.researchSession || isBusy) return;

    const result = applyQuickReviewAssetPatchesToProject(
      currentProject,
      patchIds
    );

    if (result.appliedCount === 0) {
      toast.info("没有可快速应用的修改建议");
      return;
    }

    await persistGeneratedProject(result.project);
    toast.success(`已应用 ${result.appliedCount} 条快速审核项`, {
      description: "只处理论文草稿等低风险修改；核心资产仍需逐条审阅。",
    });
  }

  async function handleRejectAssetPatch(patchId: string) {
    const currentProject = displayedProject ?? activeProject;
    if (!currentProject?.researchSession) return;

    await persistGeneratedProject(
      markProjectPatchStatus(currentProject, patchId, "rejected")
    );
    toast.info("已拒绝修改建议");
  }

  async function handleRollbackVersion(eventId: string) {
    const currentProject = displayedProject ?? activeProject;
    if (!currentProject?.researchSession) return;

    const nextProject = proposeRollbackPatchFromVersionEvent(
      currentProject,
      eventId
    );
    if (nextProject === currentProject) {
      toast.error("暂时不能生成回滚建议", {
        description: "这条历史记录没有足够的修改快照，或它本身不是已应用记录。",
      });
      return;
    }

    await persistGeneratedProject(nextProject);
    toast.success("已生成回滚建议", {
      description: "请在右侧待应用修改中审核后再应用。",
    });
  }

  const centerMessages = (() => {
    const baseMessages =
      !displayedProject || isComposingNewConversation || !session
        ? localConversationMessages
        : session.messages;

    return createResearchChatViewMessages(
      baseMessages,
      optimisticMessage,
      pendingAssistantMessage
    );
  })();
  const chatTitle =
    !displayedProject || isComposingNewConversation
      ? "新的研究对话"
      : displayedProject.refinedIdea || displayedProject.rawIdea;
  const chatSubtitle =
    !displayedProject || isComposingNewConversation
      ? "输入研究想法，PaperForge 会先发现可建模方向"
      : "中间只保留对话，结构化研究资产在右侧检查和编辑";

  return (
    <ResearchWorkspaceShell
      left={
          <ResearchSidebar
            project={sidebarProject}
            isComposingNewConversation={isComposingNewConversation}
            onStartNewConversation={() => {
              setLocalConversationMessages([]);
              if (activeProject) setLocalComposingProjectId(activeProject.id);
            }}
            onOpenProject={() => {
              setLocalConversationMessages([]);
              setLocalComposingProjectId(null);
            }}
          />
      }
      center={
        <ChatPanel
          messages={centerMessages}
          isBusy={isBusy}
          onSubmit={handleSubmit}
          headerTitle={chatTitle}
          headerSubtitle={chatSubtitle}
          placeholder={getChatPlaceholder(displayedProject, session, isComposingNewConversation)}
          emptyState={
            <NewConversationEmptyState hasExistingProject={Boolean(activeProject)} />
          }
        />
      }
      right={({ isCollapsed, toggleRight }) =>
        session ? (
          <ResearchAssetsPanel
            project={displayedProject ?? undefined}
            session={session}
            adoptingDirectionId={adoptingDirectionId}
            isConfirmingModel={isConfirmingModel}
            isSolvingEquilibrium={isSolvingEquilibrium}
            isAnalyzingProperties={isAnalyzingProperties}
            isDraftingPaper={isDraftingPaper}
            revisingPaperSectionId={revisingPaperSectionId}
            isContinuingSafely={isContinuingSafely}
            activeAgentTask={visibleAgentTask}
            agentTasks={agentTasks}
            onAdopt={handleAdopt}
            onConfirmModel={handleConfirmModel}
            onBuildModelRepair={handleBuildModelRepair}
            onSafeContinue={handleSafeContinue}
            onSolveEquilibrium={handleSolveEquilibrium}
            onAnalyzeProperties={handleAnalyzeProperties}
            onDraftPaper={handleDraftPaper}
            onRevisePaperSection={handleRevisePaperSection}
            onRunRecovery={handleRunRecovery}
            onSaveModelAssumptions={handleSaveModelAssumptions}
            onSaveModelSymbols={handleSaveModelSymbols}
            onApplyAssetPatch={handleApplyAssetPatch}
            onApplyQuickReviewAssetPatches={handleApplyQuickReviewAssetPatches}
            onRejectAssetPatch={handleRejectAssetPatch}
            onRollbackVersion={handleRollbackVersion}
            isCollapsed={isCollapsed}
            onTogglePane={toggleRight}
          />
        ) : (
          <ResearchEmptyAssetsPanel />
        )
      }
    />
  );
}

type BackgroundAgentTaskAction = Extract<
  AgentTaskInput["action"],
  | "solve_equilibrium"
  | "analyze_properties"
  | "draft_paper"
  | "revise_paper_section"
>;

function selectNewestAgentTask(tasks: AgentTask[]) {
  return tasks.reduce((newest, task) =>
    task.updatedAt > newest.updatedAt ? task : newest
  );
}

async function waitForAgentTaskCompletion(
  task: AgentTask,
  onUpdate?: (task: AgentTask) => void
) {
  let currentTask = task;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (!isAgentTaskInProgress(currentTask)) return currentTask;

    await delay(1000);
    currentTask = await fetchAgentTaskApi(currentTask.id);
    onUpdate?.(currentTask);
  }

  return currentTask;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type ApiConversationPatch = NonNullable<GenerateResearchProjectResult["assetPatch"]>;

function attachConversationPatch(
  result: GenerateResearchProjectResult
): ResearchProject {
  const patch = result.assetPatch
    ? convertApiConversationPatch(result.assetPatch)
    : null;
  if (!patch) return result.project;

  const session =
    result.project.researchSession ?? createInitialResearchSession(result.project.rawIdea);

  return {
    ...result.project,
    researchSession: {
      ...session,
      assetPatches: [...(session.assetPatches ?? []), patch],
    },
  };
}

function convertApiConversationPatch(
  patch: ApiConversationPatch
): ResearchAssetPatch | null {
  const kind =
    patch.kind === "update_model"
      ? "model"
      : patch.kind === "update_equilibrium"
        ? "equilibrium"
        : patch.kind === "update_properties"
          ? "properties"
          : null;
  if (!kind || patch.changes.length === 0) return null;

  return {
    id: createPatchId(),
    kind,
    summary: patch.summary,
    status: "proposed",
    createdAt: createTimestamp(),
    changes: patch.changes.map((change) => ({
      kind:
        change.op === "insert"
          ? "append"
          : change.op === "remove"
            ? "remove"
            : "replace",
      path: change.target,
      value: change.value,
      note: change.reason,
    })),
  };
}

function createTimestamp() {
  return Date.now();
}

function createMessageId(prefix: string) {
  return `${prefix}-${createTimestamp()}`;
}

function createPatchId() {
  return `patch-${createTimestamp()}-${Math.random().toString(16).slice(2)}`;
}

function createPendingAssistantMessage(): ResearchChatViewMessage {
  return {
    id: createMessageId("msg-pending-assistant"),
    role: "assistant",
    content: "PaperForge 正在生成回复...",
    createdAt: createTimestamp(),
    isPending: true,
  };
}

function markAssetFreshnessAfterEquilibrium(project: ResearchProject): ResearchProject {
  if (!project.researchSession) return project;
  const hasExistingPropertyAnalyses = Boolean(project.propertyAnalyses?.length);
  return {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetFreshness: {
        ...(project.researchSession.assetFreshness ?? {
          model: "fresh",
          equilibrium: "fresh",
          properties: "fresh",
        }),
        equilibrium: "fresh",
        properties: hasExistingPropertyAnalyses ? "stale" : "fresh",
      },
    },
  };
}

function getResumeRequestForSuggestion(
  suggestion: AgentRecoverySuggestion
): AgentResumeRequest | undefined {
  if (suggestion.status === "review_required") return undefined;

  return {
    runId: suggestion.runId,
    checkpointId: suggestion.checkpoint?.id,
  };
}

function markAssetFreshnessAfterProperties(project: ResearchProject): ResearchProject {
  if (!project.researchSession) return project;
  return {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetFreshness: {
        ...(project.researchSession.assetFreshness ?? {
          model: "fresh",
          equilibrium: "fresh",
          properties: "fresh",
        }),
        properties: "fresh",
      },
    },
  };
}

function hasProposedAssetPatch(
  project: ResearchProject,
  kind: ResearchAssetPatch["kind"]
) {
  return Boolean(
    project.researchSession?.assetPatches?.some(
      (patch) => patch.kind === kind && patch.status === "proposed"
    )
  );
}

function hasAnyProposedAssetPatch(project: ResearchProject) {
  return Boolean(
    project.researchSession?.assetPatches?.some(
      (patch) => patch.status === "proposed"
    )
  );
}

function getAppliedPatchToastDescription(kind: ResearchAssetPatch["kind"]) {
  switch (kind) {
    case "model":
      return "模型已更新，均衡和性质分析需要重新生成。";
    case "equilibrium":
      return "均衡资产已更新，性质分析已标记为需要重新检查。";
    case "properties":
      return "性质分析已写入右侧工作台。";
    case "paper":
      return "论文草稿已写入右侧论文输出。";
  }
}

function attachChatMessageToProject(
  project: ResearchProject,
  userMessage: string
): ResearchProject {
  const trimmed = userMessage.trim();
  if (!trimmed || !project.researchSession) return project;

  const messages = project.researchSession.messages;
  if (messages.some((message) => message.role === "user" && message.content === trimmed)) {
    return project;
  }

  const insertIndex =
    messages.length > 0 && messages[messages.length - 1].role === "assistant"
      ? messages.length - 1
      : messages.length;

  return {
    ...project,
    researchSession: {
      ...project.researchSession,
      messages: [
        ...messages.slice(0, insertIndex),
        {
          id: createMessageId("msg-user-chat"),
          role: "user",
          content: trimmed,
          createdAt: createTimestamp(),
        },
        ...messages.slice(insertIndex),
      ],
    },
  };
}

function getChatPlaceholder(
  project: ResearchProject | null,
  session: ReturnType<typeof createInitialResearchSession> | null,
  isComposingNewConversation: boolean
) {
  if (isComposingNewConversation || !project) {
    return "输入新的研究想法，例如：二手平台佣金与补贴如何影响买卖双方参与...";
  }

  if (session?.phase === "model") {
    return "可以直接问模型设定，也可以说：把模型假设改成... 但先让我确认";
  }

  return "可以问结果，也可以说：重新求均衡 / 重做性质分析 / 整理成命题";
}

function NewConversationEmptyState({
  hasExistingProject,
}: {
  hasExistingProject: boolean;
}) {
  return (
    <div className="mx-auto flex min-h-[55vh] w-full max-w-3xl flex-col justify-center">
      <div className="flex items-start gap-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-foreground text-background">
          <MessageSquarePlus className="size-4" />
        </div>
        <div>
          <p className="text-xl font-semibold">
            {hasExistingProject ? "开启新的探索对话" : "从一句研究想法开始"}
          </p>
          <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
            {hasExistingProject
              ? "输入一个新的研究想法后，PaperForge 会把它保存成新的探索记录，再从方向发现开始。"
              : "直接在底部输入研究想法，PaperForge 会依次推进方向发现、模型确认、符号均衡和性质分析。"}
          </p>
        </div>
      </div>
    </div>
  );
}

function ResearchEmptyAssetsPanel() {
  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-card">
      <div className="border-b px-4 py-4">
        <p className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <PanelRightOpen className="size-3.5" />
          研究资产
        </p>
        <h2 className="mt-1 text-lg font-semibold">工作台总览</h2>
      </div>
      <div className="min-h-0 flex-1 p-4">
        <div className="rounded-md border border-dashed bg-background/60 px-3 py-3 text-xs leading-5 text-muted-foreground">
          开启研究对话后，方向、模型、均衡和性质分析会显示在这里。
        </div>
      </div>
    </aside>
  );
}
