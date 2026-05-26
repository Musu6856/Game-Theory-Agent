"use client";

import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  CircleDot,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  LibraryBig,
  Loader2,
  PanelRightClose,
  PanelRightOpen,
  Sigma,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { DirectionCard } from "./direction-card";
import { EditableModelPanel } from "./editable-model-panel";
import { EditableSymbolRegistry } from "./editable-symbol-registry";
import { MathArtifact } from "./math-artifact";
import { PendingAssetPatches } from "./pending-asset-patches";
import { ResearchAssetsTabs } from "./research-assets-tabs";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  buildResearchProjectMarkdown,
  getResearchProjectMarkdownFilename,
} from "@/lib/research-export";
import {
  buildProjectAuditMarkdown,
  getProjectAuditMarkdownFilename,
} from "@/lib/research-agent/project-audit";
import {
  planSafeContinuation,
  recommendNextAgentStep,
  type SafeContinuationPlan,
  type NextAgentRecommendation,
} from "@/lib/research-agent/controller";
import {
  getAgentRecoverySuggestion,
  type AgentRecoverySuggestion,
} from "@/lib/research-agent/recovery";
import {
  buildVersionReviewSummary,
  type VersionReviewPriority,
} from "@/lib/research-agent/version-review-summary";
import {
  buildProjectMathVerificationSummary,
  getMathVerificationActionHints,
  selectMathVerificationPanelChecks,
  type MathVerificationSummary,
  type MathVerificationSummaryStatus,
} from "@/lib/research-agent/math-verification-summary";
import {
  getMathArtifactKindLabel,
  getMathArtifactStatusLabel,
  selectEquilibriumMathArtifactsForDisplay,
  selectPendingEquilibriumCandidate,
} from "@/lib/research-agent/equilibrium-display";
import {
  buildPaperSectionReview,
  type PaperSectionReview,
  type PaperSectionReviewStatus,
} from "@/lib/research-agent/paper-section-review";
import {
  buildAgentTraceReplay,
  buildAgentRunAuditMarkdown,
  filterAgentTraceEvents,
  filterAgentTraceReplaySteps,
  getAgentRunAuditMarkdownFilename,
  type AgentTraceReplayFilter,
  type AgentTraceReplayStep,
} from "@/lib/research-agent/trace-replay";
import {
  createResearchActionClickHandler,
  getResearchAssetsTabForPhase,
  getResearchFlowState,
  getResearchPrimaryAction,
  type ResearchAssetsTab,
  type ResearchPrimaryAction,
} from "@/lib/research-flow";
import type {
  AgentCheckpoint,
  AgentRun,
  AgentTask,
  AgentTraceEvent,
  EvidenceSource,
  ResearchAssetKind,
  ResearchAssetVersionEvent,
  ResearchProject,
  ResearchSession,
} from "@/lib/types";

type ResearchAssetsPanelProps = {
  project?: ResearchProject;
  session: ResearchSession;
  adoptingDirectionId?: string | null;
  isConfirmingModel?: boolean;
  isSolvingEquilibrium?: boolean;
  isAnalyzingProperties?: boolean;
  isDraftingPaper?: boolean;
  revisingPaperSectionId?: string | null;
  isContinuingSafely?: boolean;
  activeAgentTask?: AgentTask | null;
  agentTasks?: AgentTask[];
  onAdopt?: (directionId: string) => void;
  onConfirmModel?: () => void;
  onBuildModelRepair?: () => void;
  onSafeContinue?: () => void;
  onSolveEquilibrium?: () => void;
  onAnalyzeProperties?: () => void;
  onDraftPaper?: () => void;
  onRevisePaperSection?: (sectionId: string, instruction?: string) => void;
  onRunRecovery?: (suggestion: AgentRecoverySuggestion) => void;
  onSaveModelAssumptions?: (assumptions: string[]) => Promise<void> | void;
  onSaveModelSymbols?: (symbols: NonNullable<ResearchProject["hotellingModel"]>["symbols"]) => Promise<void> | void;
  onApplyAssetPatch?: (patchId: string) => void;
  onApplyQuickReviewAssetPatches?: (patchIds: string[]) => void;
  onRejectAssetPatch?: (patchId: string) => void;
  onRollbackVersion?: (eventId: string) => void;
  isCollapsed?: boolean;
  onTogglePane?: () => void;
};

export function ResearchAssetsPanel(props: ResearchAssetsPanelProps) {
  const latestProposedPatch = props.session.assetPatches
    ?.filter((patch) => patch.status === "proposed")
    .at(-1);
  const initialActiveTab = latestProposedPatch
    ? getResearchAssetsTabForPatchKind(latestProposedPatch.kind)
    : getResearchAssetsTabForPhase(props.session.phase);
  const patchKey = latestProposedPatch
    ? `${latestProposedPatch.id}:${latestProposedPatch.kind}`
    : "none";

  return (
    <ResearchAssetsPanelContent
      key={`${props.project?.id ?? "new"}:${props.session.phase}:${props.session.assetSummary.equilibriumStatus}:${patchKey}`}
      {...props}
      initialActiveTab={initialActiveTab}
    />
  );
}

function ResearchAssetsPanelContent({
  initialActiveTab,
  project,
  session,
  adoptingDirectionId,
  isConfirmingModel,
  isSolvingEquilibrium,
  isAnalyzingProperties,
  isDraftingPaper,
  revisingPaperSectionId,
  isContinuingSafely,
  activeAgentTask,
  agentTasks,
  onAdopt,
  onConfirmModel,
  onBuildModelRepair,
  onSafeContinue,
  onSolveEquilibrium,
  onAnalyzeProperties,
  onDraftPaper,
  onRevisePaperSection,
  onRunRecovery,
  onSaveModelAssumptions,
  onSaveModelSymbols,
  onApplyAssetPatch,
  onApplyQuickReviewAssetPatches,
  onRejectAssetPatch,
  onRollbackVersion,
  isCollapsed,
  onTogglePane,
}: ResearchAssetsPanelProps & { initialActiveTab: ResearchAssetsTab }) {
  const [activeTab, setActiveTab] = useState<ResearchAssetsTab>(initialActiveTab);
  const flow = getResearchFlowState(project, session);
  const asset = session.assetSummary;
  const analyses = project?.propertyAnalyses ?? [];
  const model = project?.hotellingModel;
  const equilibrium = project?.equilibriumResult;
  const pendingEquilibriumCandidate = selectPendingEquilibriumCandidate(
    session.assetPatches
  );
  const equilibriumMathArtifacts = selectEquilibriumMathArtifactsForDisplay(
    session.mathArtifacts
  );
  const nextRecommendation = recommendNextAgentStep(project);
  const safeContinuationPlan = planSafeContinuation(project);
  const recoverySuggestion = getAgentRecoverySuggestion(project);
  const mathSummary = buildProjectMathVerificationSummary({
    hotellingModel: project?.hotellingModel,
    equilibriumResult: project?.equilibriumResult,
    propertyAnalyses: project?.propertyAnalyses,
    researchSession: project?.researchSession,
  });
  const isSymbolicFailure = equilibrium?.status === "symbolic_failure";
  const hasThinAnalysis = analyses.length > 0 && analyses.length < 3;
  const canSolveNow =
    Boolean(model && onSolveEquilibrium) &&
    flow.canSolveEquilibrium &&
    nextRecommendation.action?.agentAction === "solve_equilibrium";
  const canAnalyzeNow =
    Boolean(equilibrium && onAnalyzeProperties) && flow.canAnalyzeProperties;
  const canDraftPaper = Boolean(onDraftPaper) && flow.canDraftPaper;
  const nextRecommendationBusy = getNextRecommendationBusyState({
    recommendation: nextRecommendation,
    isConfirmingModel,
    isSolvingEquilibrium,
    isAnalyzingProperties,
    isDraftingPaper,
  });
  const visibleAgentTask =
    activeAgentTask?.projectId === project?.id ? activeAgentTask : null;
  const visibleAgentTasks = getVisibleAgentTasks({
    tasks: agentTasks ?? [],
    activeTask: visibleAgentTask,
    projectId: project?.id,
  });
  const handleRunNextRecommendation = () => {
    setActiveTab(nextRecommendation.targetTab);

    switch (nextRecommendation.action?.kind) {
      case "choose_direction":
        return;
      case "confirm_model":
        onConfirmModel?.();
        return;
      case "answer_model_question":
        onBuildModelRepair?.();
        return;
      case "solve_equilibrium":
        onSolveEquilibrium?.();
        return;
      case "analyze_properties":
        onAnalyzeProperties?.();
        return;
      case "draft_paper":
        onDraftPaper?.();
        return;
      default:
        return;
    }
  };
  const handleApplyAssetPatch = onApplyAssetPatch
    ? (patchId: string) => {
        const patch = session.assetPatches?.find((item) => item.id === patchId);
        if (patch) setActiveTab(getResearchAssetsTabForPatchKind(patch.kind));
        onApplyAssetPatch(patchId);
      }
    : undefined;
  const handleExportMarkdown = () => {
    if (!project) return;

    downloadMarkdownFile(
      buildResearchProjectMarkdown(project),
      getResearchProjectMarkdownFilename(project)
    );
  };

  if (isCollapsed) {
    return (
      <aside className="flex h-full min-h-0 min-w-0 flex-col border-l border-border/70 bg-background">
        <div className="relative min-h-14 shrink-0 border-b border-border/70 px-2 py-2 pr-14">
          {onTogglePane ? (
            <button
              type="button"
              className="research-pane-icon-button research-pane-icon-button-inline absolute right-2 top-2"
              aria-label="展开右侧研究资产"
              onClick={() => {
                onTogglePane?.();
              }}
            >
              <PanelRightOpen size={16} />
            </button>
          ) : null}
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3 px-2 py-3">
          <div
            className="flex size-6 items-center justify-center rounded-full border border-border bg-muted/40 text-[10px] font-semibold text-muted-foreground"
            title={getPhaseLabel(session.phase)}
            aria-label={getPhaseLabel(session.phase)}
          >
            {getPhaseShortLabel(session.phase)}
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border/70 px-3 py-2">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">
              {asset.currentDirection?.title ?? "研究资产"}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {project ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs"
                onClick={handleExportMarkdown}
              >
                <Download className="size-3.5" />
                导出 Markdown
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="收起右侧研究资产"
              onClick={() => {
                onTogglePane?.();
              }}
            >
              <PanelRightClose className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <ResearchAssetsTabs activeTab={activeTab} onActiveTabChange={setActiveTab} />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <NextStepSuggestion
          recommendation={nextRecommendation}
          safeContinuationPlan={safeContinuationPlan}
          recoverySuggestion={recoverySuggestion}
          isBusy={nextRecommendationBusy}
          isContinuingSafely={isContinuingSafely}
          onRunAction={handleRunNextRecommendation}
          onSafeContinue={onSafeContinue}
          onRunRecovery={onRunRecovery}
        />

        <PendingAssetPatches
          patches={session.assetPatches ?? []}
          onApply={handleApplyAssetPatch}
          onApplyQuickReview={onApplyQuickReviewAssetPatches}
          onReject={onRejectAssetPatch}
        />

        {activeTab === "directions" ? (
          <DirectionsTab
            session={session}
            adoptingDirectionId={adoptingDirectionId}
            onAdopt={onAdopt}
          />
        ) : null}

        {activeTab === "evidence" ? (
          <EvidenceTab project={project} session={session} />
        ) : null}

        {activeTab === "model" ? (
          <ModelTab
            project={project}
            onSaveModelSymbols={onSaveModelSymbols}
            onSaveModelAssumptions={onSaveModelAssumptions}
          />
        ) : null}

        {activeTab === "equilibrium" ? (
          <EquilibriumTab
            equilibriumStatusLabel={flow.equilibriumStatusLabel}
            equilibrium={equilibrium}
            isStale={flow.isEquilibriumStale}
            canSolveNow={canSolveNow}
            isSolvingEquilibrium={isSolvingEquilibrium}
            onSolveEquilibrium={onSolveEquilibrium}
            mathSummary={mathSummary}
            onSelectAssetTab={setActiveTab}
            pendingEquilibriumCandidate={pendingEquilibriumCandidate}
            mathArtifacts={equilibriumMathArtifacts}
          />
        ) : null}

        {activeTab === "properties" ? (
          <PropertiesTab
            analyses={analyses}
            analysisStatusLabel={flow.analysisStatusLabel}
            hasThinAnalysis={hasThinAnalysis}
            isStale={flow.isPropertyAnalysisStale}
            canAnalyzeNow={canAnalyzeNow}
            isAnalyzingProperties={isAnalyzingProperties}
            onAnalyzeProperties={onAnalyzeProperties}
            mathSummary={mathSummary}
            onSelectAssetTab={setActiveTab}
          />
        ) : null}

        {activeTab === "paper" ? (
          <PaperTab
            project={project}
            canDraftPaper={canDraftPaper}
            isDraftingPaper={isDraftingPaper}
            revisingPaperSectionId={revisingPaperSectionId}
            onDraftPaper={onDraftPaper}
            onRevisePaperSection={onRevisePaperSection}
          />
        ) : null}

        {activeTab === "history" ? (
          <HistoryTab
            history={session.assetVersionHistory ?? []}
            onRollbackVersion={onRollbackVersion}
          />
        ) : null}

        {activeTab === "quality" ? (
          <QualityTab
            session={session}
            equilibrium={equilibrium}
            analysesCount={analyses.length}
            isSymbolicFailure={isSymbolicFailure}
            hasThinAnalysis={hasThinAnalysis}
            isEquilibriumStale={flow.isEquilibriumStale}
            isPropertyAnalysisStale={flow.isPropertyAnalysisStale}
            mathSummary={mathSummary}
            mathArtifacts={equilibriumMathArtifacts}
            onSelectAssetTab={setActiveTab}
          />
        ) : null}

        {visibleAgentTasks.length > 0 ? (
          <AgentTaskAuditPanel
            tasks={visibleAgentTasks}
            activeTaskId={visibleAgentTask?.id}
          />
        ) : null}
      </div>
    </aside>
  );
}

function DirectionsTab({
  session,
  adoptingDirectionId,
  onAdopt,
}: {
  session: ResearchSession;
  adoptingDirectionId?: string | null;
  onAdopt?: (directionId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <AssetSection
        title="候选方向"
        description="所有方向都可以直接采用，推荐标记只表示默认建议。"
      >
        <div className="space-y-3">
          {session.directions.map((direction) => (
            <DirectionCard
              key={direction.id}
              direction={direction}
              evidenceSources={session.evidencePack?.sources ?? []}
              adopted={session.assetSummary.currentDirection?.id === direction.id}
              disabled={!onAdopt}
              isAdopting={adoptingDirectionId === direction.id}
              onAdopt={onAdopt ?? (() => undefined)}
            />
          ))}
        </div>
      </AssetSection>
    </div>
  );
}

function EvidenceTab({
  project,
  session,
}: {
  project?: ResearchProject;
  session: ResearchSession;
}) {
  const pack = session.evidencePack;
  const runs = getAgentRunsForDisplay(session);
  const handleExportProjectAudit = () => {
    if (!project) return;

    downloadMarkdownFile(
      buildProjectAuditMarkdown(project),
      getProjectAuditMarkdownFilename(project)
    );
  };

  if (!pack) {
    return (
      <div className="space-y-4">
        <ProjectAuditExportCard
          project={project}
          onExport={handleExportProjectAudit}
        />
        <EmptyLine text="当前研究还没有联网来源。开启新的方向发现后，这里会显示检索来源；已执行过的 Agent 步骤会继续记录在下面。" />
        <AgentRunHistory runs={runs} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ProjectAuditExportCard
        project={project}
        onExport={handleExportProjectAudit}
      />
      <AssetSection
        title="来源依据"
        description="这里只保留来源标题、链接、摘要和相关性说明，不会把网页全文直接交给模型。"
      >
        <div className="space-y-3">
          <InfoTile label="检索查询" value={pack.query} />
          <InfoTile
            label="来源数"
            value={`${pack.sources.length} 个 / ${formatTimestamp(pack.createdAt)}`}
          />
          <div className="grid grid-cols-3 gap-2 text-[11px] leading-5">
            <InfoTile
              label="论文"
              value={`${countSourcesByType(pack.sources, "paper")}`}
            />
            <InfoTile
              label="网页"
              value={`${countSourcesByType(pack.sources, "web")}`}
            />
            <InfoTile
              label="其他"
              value={`${countNonWebSources(pack.sources)}`}
            />
          </div>
          <p className="rounded-md border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
            {pack.summary}
          </p>
        </div>
      </AssetSection>

      <AssetSection title="来源列表">
        {pack.sources.length > 0 ? (
          <div className="space-y-2">
            {pack.sources.map((source) => (
              <article
                key={source.id}
                className="rounded-md border bg-background px-3 py-3 text-xs leading-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SourceTypeBadge sourceType={source.sourceType} />
                  <span className="break-all font-mono text-[10px] text-muted-foreground">
                    {formatSourceHost(source.url)}
                  </span>
                  {source.publishedAt ? (
                    <span className="text-muted-foreground">
                      {source.publishedAt}
                    </span>
                  ) : null}
                </div>
                <a
                  className="mt-2 block break-words font-medium text-primary underline-offset-4 hover:underline"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  [{source.id}] {source.title}
                  <ExternalLink className="ml-1 inline size-3 align-[-2px]" />
                </a>
                <p className="mt-2 text-muted-foreground">{source.summary}</p>
                <p className="mt-2 text-muted-foreground">
                  相关性：{source.relevance}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyLine text="本轮没有保留可靠来源。常见原因：没有配置 TAVILY_API_KEY、开放学术 API 没匹配结果、请求超时，或候选 URL 被安全规则过滤。" />
        )}
      </AssetSection>

      <AgentRunHistory runs={runs} />
    </div>
  );
}

function ProjectAuditExportCard({
  project,
  onExport,
}: {
  project?: ResearchProject;
  onExport: () => void;
}) {
  const session = project?.researchSession;
  const runCount = getProjectAgentRunCount(session);
  const versionCount = session?.assetVersionHistory?.length ?? 0;
  const sourceCount = session?.evidencePack?.sources.length ?? 0;

  return (
    <AssetSection
      title="项目审计"
      description="把本项目的联网搜索、方向选择、Agent 执行记录和资产审核历史导出为一份 Markdown 报告。"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-[11px] leading-5">
          <InfoTile label="来源" value={`${sourceCount}`} />
          <InfoTile label="执行记录" value={`${runCount}`} />
          <InfoTile label="审核历史" value={`${versionCount}`} />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onExport}
          disabled={!project}
        >
          <Download className="size-3.5" />
          导出项目审计
        </Button>
      </div>
    </AssetSection>
  );
}

function ModelTab({
  project,
  onSaveModelSymbols,
  onSaveModelAssumptions,
}: {
  project?: ResearchProject;
  onSaveModelSymbols?: (symbols: NonNullable<ResearchProject["hotellingModel"]>["symbols"]) => Promise<void> | void;
  onSaveModelAssumptions?: (assumptions: string[]) => Promise<void> | void;
}) {
  const model = project?.hotellingModel;

  if (!model) {
    return <EmptyLine text="采用一个研究方向后，模型设定会显示在这里。" />;
  }

  return (
    <div className="space-y-6">
      <AssetSection title="模型摘要">
        <div className="rounded-md border bg-background px-3 py-3 text-muted-foreground">
          <MarkdownRenderer
            content={model.modelSetupDraft}
            className="paperforge-markdown text-sm leading-6"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 text-[11px] leading-5 sm:grid-cols-2">
          <InfoTile label="平台" value={model.platforms.join(" / ")} />
          <InfoTile
            label="两侧"
            value={`${model.sides.consumerSideName} / ${model.sides.merchantSideName}`}
          />
          <InfoTile label="时序" value={`${model.timing.length} 步`} />
          <InfoTile label="假设" value={`${model.assumptions.length} 条`} />
        </div>
      </AssetSection>

      <EditableSymbolRegistry
        symbols={model.symbols}
        onSaveSymbols={onSaveModelSymbols}
      />

      <EditableModelPanel
        assumptions={model.assumptions}
        onSaveAssumptions={onSaveModelAssumptions}
      />

      <AssetSection title="决策时序">
        <div className="space-y-2">
          {model.timing.map((stage) => (
            <article
              key={stage.id}
              className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-md border bg-background px-3 py-2"
            >
              <div className="pt-0.5 font-mono text-[11px] text-muted-foreground">
                {stage.order}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">{stage.name}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {stage.decisions.length > 0
                    ? stage.decisions.join(" / ")
                    : "暂无决策说明"}
                </p>
              </div>
            </article>
          ))}
        </div>
      </AssetSection>

      <AssetSection title="效用函数">
        <div className="space-y-2">
          {model.utilityFunctions.map((formula) => (
            <FormulaCard
              key={formula.id}
              label={getUtilitySideLabel(formula.side)}
              context={formula.platform}
              notes={formula.notes}
              formula={formula.expression}
            />
          ))}
        </div>
      </AssetSection>

      <AssetSection title="利润函数">
        <div className="space-y-2">
          {model.profitFunctions.map((formula) => (
            <FormulaCard
              key={formula.id}
              label={formula.platform}
              context="平台利润"
              notes={formula.notes}
              formula={formula.expression}
            />
          ))}
        </div>
      </AssetSection>
    </div>
  );
}

function FormulaCard({
  label,
  context,
  notes,
  formula,
}: {
  label: string;
  context: string;
  notes: string;
  formula: string;
}) {
  return (
    <article className="rounded-md border bg-background px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">{context}</p>
      </div>
      {notes ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{notes}</p>
      ) : null}
      <div className="mt-2">
        <MathArtifact formula={formula} variant="embedded" />
      </div>
    </article>
  );
}

function PhaseActionBar({
  action,
  isBusy,
  onAction,
}: {
  action: ResearchPrimaryAction | null;
  isBusy?: boolean;
  onAction?: () => void;
}) {
  if (!action || !onAction) return null;

  const icon =
    action.kind === "confirm_model" ? (
      <CheckCircle2 className="size-4" />
    ) : action.kind === "analyze_properties" ? (
      <FileText className="size-4" />
    ) : action.kind === "draft_paper" ? (
      <LibraryBig className="size-4" />
    ) : (
      <Sigma className="size-4" />
    );

  return (
    <div className="shrink-0 border-b border-border/70 bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {action.description}
          </p>
        </div>
        <Button
          className="gap-1.5"
          disabled={isBusy}
          onClick={createResearchActionClickHandler(onAction)}
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : icon}
          {action.label}
        </Button>
      </div>
    </div>
  );
}

function NextStepSuggestion({
  recommendation,
  safeContinuationPlan,
  recoverySuggestion,
  isBusy,
  isContinuingSafely,
  onRunAction,
  onSafeContinue,
  onRunRecovery,
}: {
  recommendation: NextAgentRecommendation;
  safeContinuationPlan: SafeContinuationPlan;
  recoverySuggestion: AgentRecoverySuggestion | null;
  isBusy?: boolean;
  isContinuingSafely?: boolean;
  onRunAction: () => void;
  onSafeContinue?: () => void;
  onRunRecovery?: (suggestion: AgentRecoverySuggestion) => void;
}) {
  const isExecutable =
    recommendation.status === "ready" &&
    recommendation.action &&
    recommendation.action.kind !== "choose_direction";
  const shouldShowBlockerDescription =
    recommendation.blocker &&
    recommendation.blocker.description.trim() !== recommendation.reason.trim();
  const canContinueSafely =
    safeContinuationPlan.status === "ready" &&
    safeContinuationPlan.steps.length > 0 &&
    Boolean(onSafeContinue);
  const icon =
    isBusy ? (
      <Loader2 className="size-4 animate-spin" />
    ) : recommendation.action?.kind === "draft_paper" ? (
      <LibraryBig className="size-4" />
    ) : recommendation.action?.kind === "analyze_properties" ? (
      <FileText className="size-4" />
    ) : recommendation.action?.kind === "solve_equilibrium" ? (
      <Sigma className="size-4" />
    ) : (
      <CircleDot className="size-4" />
    );

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={getRecommendationStatusLabel(recommendation.status)}
              tone={
                recommendation.status === "complete"
                  ? "success"
                  : recommendation.status === "blocked"
                    ? "warning"
                    : "neutral"
              }
            />
            <p className="min-w-0 text-sm font-semibold leading-6">
              {recommendation.title}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {recommendation.reason}
          </p>
          {shouldShowBlockerDescription ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {recommendation.blocker?.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {isExecutable ? (
            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              disabled={isBusy || isContinuingSafely}
              onClick={createResearchActionClickHandler(onRunAction)}
            >
              {icon}
              {recommendation.action?.label}
            </Button>
          ) : null}
          {canContinueSafely ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={isBusy || isContinuingSafely}
              onClick={createResearchActionClickHandler(onSafeContinue)}
              title={safeContinuationPlan.reason}
            >
              {isContinuingSafely ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              推进到审核点
            </Button>
          ) : null}
        </div>
      </div>
      {recoverySuggestion ? (
        <AgentRecoveryNotice
          suggestion={recoverySuggestion}
          isBusy={isBusy || isContinuingSafely}
          onRunRecovery={onRunRecovery}
        />
      ) : null}
    </div>
  );
}

function AgentTaskAuditPanel({
  tasks,
  activeTaskId,
}: {
  tasks: AgentTask[];
  activeTaskId?: string;
}) {
  const activeTask =
    tasks.find((task) => task.id === activeTaskId) ?? tasks[0] ?? null;
  const recentTasks = activeTask
    ? tasks.filter((task) => task.id !== activeTask.id)
    : tasks;
  const shouldOpenPanel = tasks.some(
    (task) => task.status === "running" || task.status === "failed"
  );
  const totals = summarizeAgentTasks(tasks);

  return (
    <details
      className="rounded-md border bg-muted/15 px-3 py-2.5"
      open={shouldOpenPanel}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Agent 任务审计</p>
              {activeTask ? (
                <StatusBadge
                  label={formatAgentTaskStatus(activeTask.status)}
                  tone={
                    activeTask.status === "completed"
                      ? "success"
                      : activeTask.status === "failed"
                        ? "warning"
                        : "neutral"
                  }
                />
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {activeTask
                ? `${formatAgentTaskAction(activeTask.action)} · 最近检查点 ${activeTask.checkpoints.length} 个`
                : `最近任务 ${tasks.length} 个`}
            </p>
          </div>
          <div className="shrink-0 text-right text-[11px] leading-5 text-muted-foreground">
            <p>{totals.patchCount} 个修改建议</p>
            <p>{totals.mathArtifactCount} 个数学产物</p>
          </div>
        </div>
      </summary>
      <div className="mt-3 space-y-3 border-t pt-3">
        {activeTask ? <AgentTaskStatusCard task={activeTask} /> : null}
        {recentTasks.length > 0 ? (
          <details
            className="rounded-md border bg-muted/20 px-3 py-2"
            open={recentTasks.some(
              (task) => task.status === "running" || task.status === "failed"
            )}
          >
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              最近任务历史（{recentTasks.length}）
            </summary>
            <div className="mt-3 space-y-3">
              {recentTasks.map((task) => (
                <AgentTaskStatusCard key={task.id} task={task} />
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </details>
  );
}

function AgentTaskStatusCard({ task }: { task: AgentTask }) {
  const isRunning = task.status === "queued" || task.status === "running";
  const latestCheckpoint = task.checkpoints.at(-1);
  const result = getAgentTaskResult(task.result);
  const displayedCheckpoints = task.checkpoints.slice(-6).reverse();

  return (
    <div className="rounded-md border bg-background px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={formatAgentTaskStatus(task.status)}
              tone={
                task.status === "completed"
                  ? "success"
                  : task.status === "failed"
                    ? "warning"
                    : "neutral"
              }
            />
            <p className="text-sm font-semibold leading-6">
              {formatAgentTaskAction(task.action)}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Task {shortenId(task.id)}
            {task.workerId ? ` · worker ${shortenId(task.workerId)}` : ""}
            {task.leaseUntil ? ` · lease ${formatTimestamp(task.leaseUntil)}` : ""}
          </p>
          {task.error ? (
            <p className="mt-2 rounded-md border border-[oklch(0.82_0.04_85)] bg-[oklch(0.985_0.02_85)] px-2.5 py-2 text-xs leading-5 text-[oklch(0.38_0.07_65)]">
              {task.error}
            </p>
          ) : null}
        </div>
        {isRunning ? (
          <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] leading-5">
        <InfoTile label="检查点" value={`${task.checkpoints.length}`} />
        <InfoTile label="修改建议" value={`${result?.patchIds?.length ?? 0}`} />
        <InfoTile label="数学产物" value={`${result?.mathArtifactIds?.length ?? 0}`} />
      </div>

      {latestCheckpoint ? (
        <div className="mt-3 rounded-md border bg-muted/25 px-2.5 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {latestCheckpoint.title}
              </p>
              <p className="text-[11px] leading-5 text-muted-foreground">
                最近检查点 · {formatAgentStepStatus(latestCheckpoint.status)} ·{" "}
                {formatTimestamp(latestCheckpoint.createdAt)}
              </p>
            </div>
            <StatusBadge
              label={formatAgentStepStatus(latestCheckpoint.status)}
              tone={getCheckpointTone(latestCheckpoint.status)}
            />
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-md border bg-muted/25 px-2.5 py-2 text-xs leading-5 text-muted-foreground">
          任务已进入队列，产生检查点后会在这里显示。
        </p>
      )}

      {displayedCheckpoints.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            执行时间线
          </p>
          {displayedCheckpoints.map((checkpoint) => (
            <AgentTaskCheckpointItem
              key={checkpoint.id}
              checkpoint={checkpoint}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getVisibleAgentTasks({
  tasks,
  activeTask,
  projectId,
}: {
  tasks: AgentTask[];
  activeTask?: AgentTask | null;
  projectId?: string;
}) {
  if (!projectId) return [];

  const merged = new Map<string, AgentTask>();
  for (const task of tasks) {
    if (task.projectId === projectId) {
      merged.set(task.id, task);
    }
  }
  if (activeTask?.projectId === projectId) {
    merged.set(activeTask.id, activeTask);
  }

  return [...merged.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
}

function summarizeAgentTasks(tasks: AgentTask[]) {
  return tasks.reduce(
    (summary, task) => {
      const result = getAgentTaskResult(task.result);
      summary.patchCount += result?.patchIds?.length ?? 0;
      summary.mathArtifactCount += result?.mathArtifactIds?.length ?? 0;
      return summary;
    },
    { patchCount: 0, mathArtifactCount: 0 }
  );
}

function AgentTaskCheckpointItem({
  checkpoint,
}: {
  checkpoint: AgentTask["checkpoints"][number];
}) {
  const metadata = checkpoint.metadata ?? {};
  const artifactId = getStringMetadata(metadata, "mathArtifactId");
  const artifactKind = getStringMetadata(metadata, "mathArtifactKind");
  const patchId = getStringMetadata(metadata, "patchId");
  const runId = getStringMetadata(metadata, "runId");
  const snapshot = metadata.mathArtifactSnapshot;

  return (
    <div className="rounded-md border bg-card px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words text-xs font-medium">{checkpoint.title}</p>
          <p className="text-[11px] leading-5 text-muted-foreground">
            {formatAgentStepStatus(checkpoint.status)} ·{" "}
            {formatTimestamp(checkpoint.createdAt)}
          </p>
        </div>
        <StatusBadge
          label={formatAgentStepStatus(checkpoint.status)}
          tone={getCheckpointTone(checkpoint.status)}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
        {runId ? <InlineMeta label="run" value={shortenId(runId)} /> : null}
        {patchId ? <InlineMeta label="patch" value={shortenId(patchId)} /> : null}
        {artifactKind ? <InlineMeta label="artifact" value={artifactKind} /> : null}
        {artifactId ? <InlineMeta label="id" value={shortenId(artifactId)} /> : null}
      </div>
      {snapshot ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
            数学产物快照
          </summary>
          <pre className="mt-2 max-h-36 overflow-auto rounded-md bg-muted/40 p-2 text-[11px] leading-5 text-muted-foreground">
            {formatJsonSnippet(snapshot)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function InlineMeta({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 rounded-sm border bg-background px-1.5 py-0.5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all font-medium text-foreground">
        {value}
      </span>
    </span>
  );
}

function getAgentTaskResult(result: AgentTask["result"]) {
  if (!result || typeof result !== "object") return undefined;
  return result as {
    patchIds?: string[];
    mathArtifactIds?: string[];
  };
}

function getStringMetadata(
  metadata: Record<string, unknown>,
  key: string
) {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getCheckpointTone(status: AgentTask["checkpoints"][number]["status"]) {
  return status === "failed"
    ? "warning"
    : status === "completed"
      ? "success"
      : "neutral";
}

function shortenId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatJsonSnippet(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatAgentTaskAction(action: AgentTask["action"]) {
  switch (action) {
    case "build_model":
      return "模型生成任务";
    case "solve_equilibrium":
      return "符号均衡求解任务";
    case "analyze_properties":
      return "性质分析任务";
    case "draft_paper":
      return "论文草稿任务";
    case "revise_paper_section":
      return "章节改写任务";
    default:
      return "Agent 任务";
  }
}

function formatAgentTaskStatus(status: AgentTask["status"]) {
  switch (status) {
    case "queued":
      return "排队中";
    case "running":
      return "执行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "cancelled":
      return "已取消";
  }
}

function AgentRecoveryNotice({
  suggestion,
  isBusy,
  onRunRecovery,
}: {
  suggestion: AgentRecoverySuggestion;
  isBusy?: boolean;
  onRunRecovery?: (suggestion: AgentRecoverySuggestion) => void;
}) {
  const canRun =
    suggestion.status !== "review_required" &&
    Boolean(suggestion.actionKind) &&
    Boolean(onRunRecovery);
  const label = suggestion.status === "retryable" ? "重试" : "继续";

  return (
    <div className="mt-3 rounded-md border bg-background px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label="恢复" tone="warning" />
            <p className="text-xs font-semibold leading-5">
              {suggestion.title}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {suggestion.reason}
          </p>
          {suggestion.checkpoint ? (
            <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
              最近检查点：{suggestion.checkpoint.title} ·{" "}
              {formatAgentStepStatus(suggestion.checkpoint.status)}
            </p>
          ) : null}
        </div>
        {canRun ? (
          <Button
            type="button"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs"
            disabled={isBusy}
            onClick={createResearchActionClickHandler(() =>
              onRunRecovery?.(suggestion)
            )}
          >
            {label}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function getRecommendationStatusLabel(status: NextAgentRecommendation["status"]) {
  switch (status) {
    case "ready":
      return "下一步";
    case "blocked":
      return "需处理";
    case "complete":
      return "已成稿";
  }
}

function formatVersionAction(action: ResearchAssetVersionEvent["action"]) {
  switch (action) {
    case "applied_patch":
      return "已应用";
    case "rejected_patch":
      return "已拒绝";
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

function formatAffectedAssetKinds(kinds: ResearchAssetKind[]) {
  if (kinds.length === 0) return "无正式资产受影响";
  return kinds.map(formatPatchKind).join("、");
}

function formatVersionReviewPriority(priority: VersionReviewPriority) {
  switch (priority) {
    case "high":
      return "高";
    case "medium":
      return "中";
    case "low":
      return "低";
    case "none":
      return "无";
  }
}

function formatMathVerificationStatus(status: MathVerificationSummaryStatus) {
  switch (status) {
    case "passed":
      return "已通过";
    case "failed":
      return "需修正";
    case "review_needed":
      return "需人工复核";
    case "not_ready":
      return "待验证";
  }
}

function getMathVerificationTone(
  status: MathVerificationSummaryStatus
): "neutral" | "success" | "warning" {
  switch (status) {
    case "passed":
      return "success";
    case "failed":
    case "review_needed":
      return "warning";
    case "not_ready":
      return "neutral";
  }
}

function formatPaperSectionReviewStatus(status: PaperSectionReviewStatus) {
  switch (status) {
    case "passed":
      return "可继续";
    case "review_needed":
      return "需复核";
    case "not_ready":
      return "待成稿";
  }
}

function getPaperSectionReviewTone(
  status: PaperSectionReviewStatus
): "neutral" | "success" | "warning" {
  switch (status) {
    case "passed":
      return "success";
    case "review_needed":
      return "warning";
    case "not_ready":
      return "neutral";
  }
}

function formatPaperDependency(
  dependency: PaperSectionReview["tasks"][number]["dependsOn"][number]
) {
  switch (dependency) {
    case "direction":
      return "方向";
    case "evidence":
      return "来源";
    case "model":
      return "模型";
    case "equilibrium":
      return "均衡";
    case "properties":
      return "性质分析";
  }
}

function formatChangeKind(kind: ResearchAssetVersionEvent["changes"][number]["kind"]) {
  switch (kind) {
    case "append":
      return "新增";
    case "replace":
      return "更新";
    case "remove":
      return "删除";
  }
}

function canRollbackVersionEvent(event: ResearchAssetVersionEvent) {
  return (
    event.action === "applied_patch" &&
    event.changes.some((change) => {
      if (change.kind === "append") return change.value !== undefined;
      return change.previousValue !== undefined;
    })
  );
}

function formatVersionValuePreview(value: unknown) {
  if (value === undefined) return "无";
  if (value === null) return "null";
  if (typeof value === "string") return value || "空字符串";
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getNextRecommendationBusyState({
  recommendation,
  isConfirmingModel,
  isSolvingEquilibrium,
  isAnalyzingProperties,
  isDraftingPaper,
}: {
  recommendation: NextAgentRecommendation;
  isConfirmingModel?: boolean;
  isSolvingEquilibrium?: boolean;
  isAnalyzingProperties?: boolean;
  isDraftingPaper?: boolean;
}) {
  switch (recommendation.action?.kind) {
    case "confirm_model":
    case "answer_model_question":
      return Boolean(isConfirmingModel);
    case "solve_equilibrium":
      return Boolean(isSolvingEquilibrium);
    case "analyze_properties":
      return Boolean(isAnalyzingProperties);
    case "draft_paper":
      return Boolean(isDraftingPaper);
    default:
      return false;
  }
}

function getUtilitySideLabel(side: "consumer" | "merchant") {
  return side === "consumer" ? "消费者效用" : "商家效用";
}

function getResearchAssetsTabForPatchKind(kind: ResearchAssetKind): ResearchAssetsTab {
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

function EquilibriumTab({
  equilibriumStatusLabel,
  equilibrium,
  pendingEquilibriumCandidate,
  mathArtifacts,
  isStale,
  canSolveNow,
  isSolvingEquilibrium,
  onSolveEquilibrium,
  mathSummary,
  onSelectAssetTab,
}: {
  equilibriumStatusLabel: string;
  equilibrium?: ResearchProject["equilibriumResult"];
  pendingEquilibriumCandidate?: ResearchProject["equilibriumResult"];
  mathArtifacts: NonNullable<ResearchSession["mathArtifacts"]>;
  isStale: boolean;
  canSolveNow: boolean;
  isSolvingEquilibrium?: boolean;
  onSolveEquilibrium?: () => void;
  mathSummary: MathVerificationSummary;
  onSelectAssetTab?: (tab: ResearchAssetsTab) => void;
}) {
  const displayedEquilibrium = pendingEquilibriumCandidate ?? equilibrium;
  const displayedIsSymbolicFailure =
    displayedEquilibrium?.status === "symbolic_failure";
  const isPendingCandidate = Boolean(pendingEquilibriumCandidate);
  const primaryAction = getResearchPrimaryAction(
    {
      canConfirmModel: false,
      canSolveEquilibrium: canSolveNow,
      canAnalyzeProperties: false,
      canDraftPaper: false,
    },
    "equilibrium"
  );

  return (
    <div className="space-y-5">
      <AssetSection title="均衡求解状态">
        <StatusBadge
          label={isStale ? "模型已修改，需要重算均衡" : equilibriumStatusLabel}
          tone={
            isStale || displayedIsSymbolicFailure
              ? "warning"
              : displayedEquilibrium
                ? "success"
                : "neutral"
          }
        />
        {displayedIsSymbolicFailure ? (
          <WarningBox text="当前没有得到可作为论文结论的闭式均衡解。这里仅保留一阶条件、约束和隐式系统草稿；需要收窄模型或重新求解后，才应继续性质分析。" />
        ) : null}
        {isStale ? (
          <WarningBox text="模型假设已被编辑，旧均衡不再是当前模型的权威结果。" />
        ) : null}
      </AssetSection>

      <PhaseActionBar
        action={primaryAction}
        isBusy={isSolvingEquilibrium}
        onAction={onSolveEquilibrium}
      />

      {displayedEquilibrium ? (
        <>
          {isPendingCandidate ? (
            <AssetSection title="待审核均衡候选">
              <WarningBox text="这版均衡已经生成并进入待审核修改建议。应用前，它还不会覆盖正式均衡资产，也不会解锁性质分析。" />
            </AssetSection>
          ) : null}

          <AssetSection title={isPendingCandidate ? "候选均衡概念" : "均衡概念"}>
            <MarkdownRenderer
              content={displayedEquilibrium.concept}
              className="paperforge-markdown text-sm leading-6 text-muted-foreground"
            />
          </AssetSection>

          <AssetSection title="一阶条件">
            <FormulaList
              items={displayedEquilibrium.focs}
              emptyText="尚未生成一阶条件。"
            />
          </AssetSection>

          {displayedIsSymbolicFailure ? (
            <AssetSection title="未得到闭式解">
              {displayedEquilibrium.closedForm ? (
                <MarkdownRenderer
                  content={displayedEquilibrium.closedForm}
                  className="paperforge-markdown text-sm leading-6 text-muted-foreground"
                />
              ) : (
                <EmptyLine text="当前只有隐式系统草稿，尚未得到星号闭式解。" />
              )}
            </AssetSection>
          ) : (
            <AssetSection title="闭式解">
              {displayedEquilibrium.closedForm ? (
                <MathArtifact formula={displayedEquilibrium.closedForm} />
              ) : (
                <EmptyLine text="尚未得到可展示的闭式解。" />
              )}
            </AssetSection>
          )}

          <AssetSection title="推导步骤">
            <OrderedList items={displayedEquilibrium.solvingSteps} />
          </AssetSection>

          <AssetSection title="存在条件">
            <OrderedList items={displayedEquilibrium.conditions} />
          </AssetSection>

          {displayedEquilibrium.warnings.length > 0 ? (
            <AssetSection title="注意">
              <div className="space-y-2">
                {displayedEquilibrium.warnings.map((warning) => (
                  <WarningBox key={warning} text={warning} />
                ))}
              </div>
            </AssetSection>
          ) : null}
        </>
      ) : (
        <EmptyLine text="确认模型后，可以在这里生成并检查符号均衡。" />
      )}

      <MathVerificationSummaryPanel
        summary={mathSummary}
        compact
        onSelectAssetTab={onSelectAssetTab}
      />

      <MathArtifactsPanel artifacts={mathArtifacts} />
    </div>
  );
}

function PropertiesTab({
  analyses,
  analysisStatusLabel,
  hasThinAnalysis,
  isStale,
  canAnalyzeNow,
  isAnalyzingProperties,
  onAnalyzeProperties,
  mathSummary,
  onSelectAssetTab,
}: {
  analyses: NonNullable<ResearchProject["propertyAnalyses"]>;
  analysisStatusLabel: string;
  hasThinAnalysis: boolean;
  isStale: boolean;
  canAnalyzeNow: boolean;
  isAnalyzingProperties?: boolean;
  onAnalyzeProperties?: () => void;
  mathSummary: MathVerificationSummary;
  onSelectAssetTab?: (tab: ResearchAssetsTab) => void;
}) {
  const primaryAction = getResearchPrimaryAction(
    {
      canConfirmModel: false,
      canSolveEquilibrium: false,
      canAnalyzeProperties: canAnalyzeNow,
      canDraftPaper: false,
    },
    "properties"
  );

  return (
    <div className="space-y-5">
      <AssetSection title="性质分析状态">
        <StatusBadge
          label={isStale ? "模型已修改，需要重做性质分析" : analysisStatusLabel}
          tone={isStale || hasThinAnalysis ? "warning" : analyses.length > 0 ? "success" : "neutral"}
        />
        {hasThinAnalysis ? (
          <WarningBox text="当前性质分析数量太少，只能算草稿。至少需要围绕核心参数、策略变量和阈值条件形成 3 条以上可检查命题。" />
        ) : null}
        {isStale ? (
          <WarningBox text="模型假设已被编辑，旧性质分析不再对应当前模型。" />
        ) : null}
      </AssetSection>

      <PhaseActionBar
        action={primaryAction}
        isBusy={isAnalyzingProperties}
        onAction={onAnalyzeProperties}
      />

      <MathVerificationSummaryPanel
        summary={mathSummary}
        compact
        onSelectAssetTab={onSelectAssetTab}
      />

      {analyses.length > 0 ? (
        <div className="space-y-3">
          {analyses.map((analysis, index) => (
            <article key={analysis.id} className="rounded-md border bg-background p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                命题草稿 {index + 1}
              </p>
              <h3 className="mt-1 text-sm font-semibold leading-6">
                {analysis.target} 对 {analysis.parameter}
              </h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {analysis.signCondition}
              </p>
              <div className="mt-3">
                <MathArtifact formula={analysis.symbolicResult} />
              </div>
              <MarkdownRenderer
                content={analysis.propositionDraft}
                className="paperforge-markdown mt-3 text-sm leading-6"
              />
              <MarkdownRenderer
                content={analysis.proofSketch}
                className="paperforge-markdown mt-2 text-xs leading-5 text-muted-foreground"
              />
            </article>
          ))}
        </div>
      ) : (
        <EmptyLine text="符号均衡完成后，可以在这里生成比较静态和命题草稿。" />
      )}
    </div>
  );
}

function PaperTab({
  project,
  canDraftPaper,
  isDraftingPaper,
  revisingPaperSectionId,
  onDraftPaper,
  onRevisePaperSection,
}: {
  project?: ResearchProject;
  canDraftPaper: boolean;
  isDraftingPaper?: boolean;
  revisingPaperSectionId?: string | null;
  onDraftPaper?: () => void;
  onRevisePaperSection?: (sectionId: string, instruction?: string) => void;
}) {
  const markdown = project ? buildResearchProjectMarkdown(project) : "";
  const sections = project?.sections ?? [];
  const hasDraftSections = sections.length > 0;
  const sectionReview = buildPaperSectionReview({
    project: {
      sections,
      researchSession: project?.researchSession,
    },
  });

  return (
    <div className="space-y-4">
      <AssetSection
        title="导出说明"
        description="Markdown 导出会把当前研究方向、模型、均衡和性质分析整理成一份完整正文。"
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <InfoTile
            label="导出格式"
            value="Markdown"
          />
          <InfoTile
            label="导出内容"
            value={hasDraftSections ? "正文 + 草稿章节" : "方向 / 模型 / 均衡 / 性质"}
          />
        </div>
        {canDraftPaper && onDraftPaper ? (
          <div className="mt-3">
            <Button
              type="button"
              className="gap-1.5"
              disabled={isDraftingPaper}
              onClick={createResearchActionClickHandler(onDraftPaper)}
            >
              {isDraftingPaper ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <LibraryBig className="size-4" />
              )}
              整理论文草稿
            </Button>
          </div>
        ) : null}
      </AssetSection>

      <PaperSectionReviewPanel review={sectionReview} />

      <AssetSection title="论文预览">
        {markdown ? (
          <div className="rounded-md border bg-background px-3 py-3">
            <MarkdownRenderer
              content={markdown}
              className="paperforge-markdown text-sm leading-7"
            />
          </div>
        ) : (
          <EmptyLine text="论文输出暂未生成。先把方向、模型、均衡和性质分析稳定下来，再整理成命题与正文。" />
        )}
      </AssetSection>

      {hasDraftSections ? (
        <AssetSection title="草稿章节">
          <div className="space-y-3">
            {sections.map((section) => (
              <article key={section.id} className="rounded-md border bg-background p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                      <FileText className="size-3.5" />
                      {section.status}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold">{section.title}</h3>
                  </div>
                  {onRevisePaperSection ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 gap-1.5"
                      disabled={Boolean(revisingPaperSectionId)}
                      onClick={createResearchActionClickHandler(() =>
                        onRevisePaperSection(
                          section.id,
                          `改写「${section.title}」，保持与当前模型、均衡、性质分析和来源依据一致。`
                        )
                      )}
                    >
                      {revisingPaperSectionId === section.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <FileText className="size-3.5" />
                      )}
                      章节改写建议
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  {section.content}
                </p>
              </article>
            ))}
          </div>
        </AssetSection>
      ) : null}
    </div>
  );
}

function QualityTab({
  session,
  equilibrium,
  analysesCount,
  isSymbolicFailure,
  hasThinAnalysis,
  isEquilibriumStale,
  isPropertyAnalysisStale,
  mathSummary,
  mathArtifacts,
  onSelectAssetTab,
}: {
  session: ResearchSession;
  equilibrium?: ResearchProject["equilibriumResult"];
  analysesCount: number;
  isSymbolicFailure: boolean;
  hasThinAnalysis: boolean;
  isEquilibriumStale: boolean;
  isPropertyAnalysisStale: boolean;
  mathSummary: MathVerificationSummary;
  mathArtifacts: NonNullable<ResearchSession["mathArtifacts"]>;
  onSelectAssetTab?: (tab: ResearchAssetsTab) => void;
}) {
  return (
    <div className="space-y-5">
      <AssetSection title="当前提示">
        {session.assetSummary.pendingDecision ? (
          <div className="flex gap-2 rounded-md border bg-background p-3 text-xs leading-5">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{session.assetSummary.pendingDecision.prompt}</span>
          </div>
        ) : (
          <EmptyLine text="当前没有必须处理的流程提示，可以继续自由对话或编辑右侧资产。" />
        )}
      </AssetSection>

      <AssetSection title="质量检查">
        <div className="space-y-2">
          <QualityLine ok={!isEquilibriumStale} text="均衡结果对应当前模型" />
          <QualityLine ok={!isPropertyAnalysisStale} text="性质分析对应当前模型" />
          <QualityLine ok={!isSymbolicFailure} text="均衡不是符号推导草稿" />
          <QualityLine ok={!hasThinAnalysis} text="性质分析不是单条薄弱命题" />
          <QualityLine ok={analysesCount === 0 || analysesCount >= 3} text="性质分析达到 3 条以上" />
          <QualityLine ok={!equilibrium?.warnings.length} text="均衡结果没有显式注意事项" />
        </div>
      </AssetSection>

      <MathVerificationSummaryPanel
        summary={mathSummary}
        onSelectAssetTab={onSelectAssetTab}
      />

      <MathArtifactsPanel artifacts={mathArtifacts} />

      <AssetSection title="下一步">
        <OrderedList items={session.assetSummary.nextActions} />
      </AssetSection>
    </div>
  );
}

function MathArtifactsPanel({
  artifacts,
}: {
  artifacts: NonNullable<ResearchSession["mathArtifacts"]>;
}) {
  const visibleArtifacts = artifacts.slice(0, 8);
  if (visibleArtifacts.length === 0) return null;
  const counts = summarizeMathArtifacts(visibleArtifacts);

  return (
    <details
      className="rounded-md border bg-muted/15 px-3 py-2.5"
      open={counts.failed > 0}
    >
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">技术校验记录</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              已保存 {visibleArtifacts.length} 个求解过程产物，展开后可看
              FOC、残差和 SymPy 对照。
            </p>
          </div>
          <div className="shrink-0 text-right text-[11px] leading-5 text-muted-foreground">
            <p>{counts.passed} 通过</p>
            <p>{counts.needsAttention} 需处理</p>
          </div>
        </div>
      </summary>
      <div className="mt-3 space-y-2 border-t pt-3">
        {visibleArtifacts.map((artifact) => (
          <article
            key={artifact.id}
            className="rounded-md border bg-background px-3 py-2 text-xs leading-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-foreground">{artifact.title}</p>
              <StatusBadge
                label={getMathArtifactStatusLabel(artifact.status)}
                tone={
                  artifact.status === "passed"
                    ? "success"
                    : artifact.status === "failed"
                      ? "warning"
                      : "neutral"
                }
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {getMathArtifactKindLabel(artifact.kind)} · {artifact.stepId}
              {artifact.patchId ? ` · ${artifact.patchId}` : ""}
            </p>
            {artifact.issues && artifact.issues.length > 0 ? (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {artifact.issues.slice(0, 2).map((issue) => (
                  <li key={issue} className="break-words">
                    {issue}
                  </li>
                ))}
              </ul>
            ) : null}
            {artifact.input !== undefined || artifact.output !== undefined ? (
              <details className="mt-2 rounded-sm bg-muted/35 px-2 py-1.5">
                <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                  展开技术详情
                </summary>
                {artifact.input !== undefined ? (
                  <>
                    <p className="mt-2 text-[10px] font-medium text-muted-foreground">
                      输入
                    </p>
                    <pre className="mt-1 max-h-32 overflow-auto rounded-sm bg-background/70 px-2 py-1.5 text-[10px] leading-4 text-muted-foreground">
                      {formatArtifactPreview(artifact.input)}
                    </pre>
                  </>
                ) : null}
                {artifact.output !== undefined ? (
                  <>
                    <p className="mt-2 text-[10px] font-medium text-muted-foreground">
                      输出
                    </p>
                    <pre className="mt-1 max-h-32 overflow-auto rounded-sm bg-background/70 px-2 py-1.5 text-[10px] leading-4 text-muted-foreground">
                      {formatArtifactPreview(artifact.output)}
                    </pre>
                  </>
                ) : null}
              </details>
            ) : null}
          </article>
        ))}
      </div>
    </details>
  );
}

function summarizeMathArtifacts(
  artifacts: NonNullable<ResearchSession["mathArtifacts"]>
) {
  return artifacts.reduce(
    (summary, artifact) => {
      if (artifact.status === "passed") summary.passed += 1;
      if (artifact.status === "failed") summary.failed += 1;
      if (
        artifact.status === "failed" ||
        artifact.status === "manual_review" ||
        artifact.status === "unsupported" ||
        artifact.status === "condition_insufficient"
      ) {
        summary.needsAttention += 1;
      }
      return summary;
    },
    { passed: 0, failed: 0, needsAttention: 0 }
  );
}

function formatArtifactPreview(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function FormulaList({ items, emptyText }: { items: string[]; emptyText: string }) {
  if (items.length === 0) return <EmptyLine text={emptyText} />;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <MathArtifact key={item} formula={item} />
      ))}
    </div>
  );
}

function OrderedList({ items }: { items: string[] }) {
  if (items.length === 0) return <EmptyLine text="暂无内容。" />;

  return (
    <ol className="space-y-2">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-2 text-xs leading-5">
          <span className="font-mono font-semibold text-muted-foreground">
            {index + 1}.
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

function MathVerificationSummaryPanel({
  summary,
  compact = false,
  onSelectAssetTab,
}: {
  summary: MathVerificationSummary;
  compact?: boolean;
  onSelectAssetTab?: (tab: ResearchAssetsTab) => void;
}) {
  const visibleIssues = summary.issues.slice(0, compact ? 2 : 4);
  const visibleChecks = selectMathVerificationPanelChecks(summary, {
    compact,
  });
  const actionHints = getMathVerificationActionHints(summary);
  const hasReviewDetails = visibleIssues.length > 0 || visibleChecks.length > 0;
  const showReviewShortcuts =
    Boolean(onSelectAssetTab) &&
    (summary.status === "failed" || summary.status === "review_needed");
  const reviewDetails = (
    <>
      {visibleIssues.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
          {visibleIssues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
      {visibleChecks.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
          {visibleChecks.map((check) => (
            <li
              key={`${check.kind}-${check.analysisId ?? "project"}-${check.message}`}
            >
              {check.message}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );

  return (
    <AssetSection title="数学验证">
      <div className="rounded-md border bg-background px-3 py-3 text-xs leading-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={formatMathVerificationStatus(summary.status)}
            tone={getMathVerificationTone(summary.status)}
          />
          <span className="text-muted-foreground">{summary.headline}</span>
        </div>
        <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-4">
          <InfoTile label="通过" value={`${summary.checkCounts.passed} 项`} />
          <InfoTile label="需修正" value={`${summary.checkCounts.failed} 项`} />
          <InfoTile
            label="条件不足"
            value={`${summary.checkCounts.condition_insufficient} 项`}
          />
          <InfoTile
            label="人工复核"
            value={`${
              summary.checkCounts.unsupported + summary.checkCounts.manual_review
            } 项`}
          />
        </div>
        <p className="mt-3 font-medium text-foreground">
          建议下一步：{summary.nextAction}
        </p>
        {actionHints.length > 0 ? (
          <div className="mt-3 border-t pt-3">
            <p className="text-[11px] font-semibold text-foreground">处理方式</p>
            <ul className="mt-2 space-y-1.5 text-muted-foreground">
              {actionHints.map((hint) => (
                <li key={hint.title} className="leading-5">
                  <span className="font-medium text-foreground">{hint.title}：</span>
                  {hint.body}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {showReviewShortcuts ? (
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => onSelectAssetTab?.("model")}
            >
              <ExternalLink className="size-3" />
              模型设定
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => onSelectAssetTab?.("equilibrium")}
            >
              <Sigma className="size-3" />
              符号均衡
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-[11px]"
              onClick={() => onSelectAssetTab?.("properties")}
            >
              <FileText className="size-3" />
              性质分析
            </Button>
          </div>
        ) : null}
        {hasReviewDetails && compact ? (
          <details className="mt-2 rounded-sm bg-muted/35 px-2 py-1.5">
            <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
              展开复核说明
            </summary>
            {reviewDetails}
          </details>
        ) : null}
        {hasReviewDetails && !compact ? reviewDetails : null}
      </div>
    </AssetSection>
  );
}

function PaperSectionReviewPanel({ review }: { review: PaperSectionReview }) {
  return (
    <AssetSection
      title="章节复核"
      description="章节级任务用于检查论文草稿是否还贴合当前模型、均衡和命题。"
    >
      <div className="rounded-md border bg-background px-3 py-3 text-xs leading-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={formatPaperSectionReviewStatus(review.status)}
            tone={getPaperSectionReviewTone(review.status)}
          />
          <span className="text-muted-foreground">{review.headline}</span>
        </div>
        <p className="mt-2 font-medium text-foreground">
          建议下一步：{review.nextAction}
        </p>
        {review.tasks.length > 0 ? (
          <div className="mt-3 space-y-2">
            {review.tasks.map((task) => (
              <article
                key={task.sectionId}
                className="rounded-sm border bg-card px-2.5 py-2"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge
                    label={formatVersionReviewPriority(task.priority)}
                    tone={task.priority === "high" ? "warning" : "neutral"}
                  />
                  <p className="font-medium text-foreground">{task.title}</p>
                </div>
                <p className="mt-1 text-muted-foreground">{task.reason}</p>
                <p className="mt-1 text-muted-foreground">
                  依赖资产：{task.dependsOn.map(formatPaperDependency).join("、")}
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {task.nextAction}
                </p>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </AssetSection>
  );
}

function AssetSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0">
      <div className="mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-2.5 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words font-medium text-foreground">{value}</p>
    </div>
  );
}

function HistoryTab({
  history,
  onRollbackVersion,
}: {
  history: ResearchAssetVersionEvent[];
  onRollbackVersion?: (eventId: string) => void;
}) {
  const events = [...history].reverse();
  const summary = buildVersionReviewSummary(history);

  if (events.length === 0) {
    return (
      <EmptyLine text="还没有资产版本记录。应用或拒绝模型、均衡、性质分析、论文草稿修改建议后，这里会留下审核记录。" />
    );
  }

  return (
    <div className="space-y-4">
      <AssetSection
        title="版本复盘"
        description="这里汇总最近审核对后续研究资产的影响，帮助判断先重算、先复核，还是继续写作。"
      >
        <div className="grid gap-2 text-[11px] leading-5 sm:grid-cols-3">
          <InfoTile label="待复核" value={`${summary.reviewItemCount} 条`} />
          <InfoTile
            label="最高优先级"
            value={formatVersionReviewPriority(summary.highestPriority)}
          />
          <InfoTile
            label="受影响资产"
            value={formatAffectedAssetKinds(summary.affectedAssetKinds)}
          />
        </div>
        {summary.latestImpactSummary || summary.latestNextAction ? (
          <div className="mt-3 rounded-md border bg-background px-3 py-3 text-xs leading-5 text-muted-foreground">
            {summary.latestImpactSummary ? (
              <p>{summary.latestImpactSummary}</p>
            ) : null}
            {summary.latestNextAction ? (
              <p className="mt-1 font-medium text-foreground">
                建议下一步：{summary.latestNextAction}
              </p>
            ) : null}
          </div>
        ) : null}
      </AssetSection>

      <AssetSection
        title="资产历史"
        description="这里记录用户审核过的修改建议，方便回放每个资产为什么被改、何时被批准。"
      >
        <div className="space-y-3">
          {events.map((event) => {
            const canRollback = canRollbackVersionEvent(event);

            return (
            <article
              key={event.id}
              className="rounded-md border bg-background px-3 py-3 text-xs leading-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  label={formatVersionAction(event.action)}
                  tone={event.action === "applied_patch" ? "success" : "warning"}
                />
                <StatusBadge
                  label={formatPatchKind(event.assetKind)}
                  tone="neutral"
                />
                <span className="text-muted-foreground">
                  {formatTimestamp(event.createdAt)}
                </span>
              </div>
              <p className="mt-2 font-medium">{event.summary}</p>
              <p className="mt-1 text-muted-foreground">
                修改范围：{event.changeCount} 处
              </p>
              {event.changes.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {event.changes.slice(0, 5).map((change, index) => (
                    <VersionChangeDiff
                      key={`${event.id}-${index}-${change.path}`}
                      change={change}
                    />
                  ))}
                  {event.changes.length > 5 ? (
                    <p className="text-[10px] text-muted-foreground">
                      还有 {event.changes.length - 5} 处修改未展开。
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground">
                <span className="rounded-sm border bg-card px-1.5 py-0.5 font-mono">
                  {event.patchId}
                </span>
                {event.sourceMessageId ? (
                  <span className="rounded-sm border bg-card px-1.5 py-0.5 font-mono">
                    {event.sourceMessageId}
                  </span>
                ) : null}
                {event.approvedBy ? (
                  <span className="rounded-sm border bg-card px-1.5 py-0.5">
                    用户批准
                  </span>
                ) : null}
              </div>
              {event.changedPaths.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {event.changedPaths.slice(0, 6).map((path) => (
                    <span
                      key={path}
                      className="rounded-sm border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
                    >
                      {path}
                    </span>
                  ))}
                  {event.changedPaths.length > 6 ? (
                    <span className="rounded-sm border bg-card px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      +{event.changedPaths.length - 6}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {event.note ? (
                <p className="mt-2 text-muted-foreground">说明：{event.note}</p>
              ) : null}
              {event.rejectionReason ? (
                <p className="mt-2 text-muted-foreground">
                  拒绝原因：{event.rejectionReason}
                </p>
              ) : null}
              {event.nextRecommendation ? (
                <p className="mt-2 rounded-sm border bg-card px-2 py-1.5 text-muted-foreground">
                  后续建议：{event.nextRecommendation}
                </p>
              ) : null}
              {event.impact ? (
                <div className="mt-2 rounded-sm border bg-card px-2 py-1.5 text-muted-foreground">
                  <p>影响摘要：{event.impact.summary}</p>
                  <p className="mt-1">
                    受影响资产：
                    {formatAffectedAssetKinds(event.impact.affectedAssetKinds)}
                  </p>
                  <p className="mt-1">建议下一步：{event.impact.nextAction}</p>
                  {event.impact.reviewFocus.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {event.impact.reviewFocus.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {canRollback ? (
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!onRollbackVersion}
                    onClick={() => onRollbackVersion?.(event.id)}
                  >
                    生成回滚建议
                  </Button>
                </div>
              ) : null}
            </article>
            );
          })}
        </div>
      </AssetSection>
    </div>
  );
}

function VersionChangeDiff({
  change,
}: {
  change: ResearchAssetVersionEvent["changes"][number];
}) {
  return (
    <div className="rounded-md border bg-card/70 px-2.5 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <StatusBadge label={formatChangeKind(change.kind)} tone="neutral" />
        <span className="break-all font-mono text-[10px] text-muted-foreground">
          {change.path}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <DiffValue label="原值" value={change.previousValue} />
        <DiffValue label="新值" value={change.value} />
      </div>
      {change.note ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{change.note}</p>
      ) : null}
    </div>
  );
}

function DiffValue({ label, value }: { label: string; value: unknown }) {
  const text = formatVersionValuePreview(value);

  return (
    <div className="min-w-0 rounded-sm bg-background px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 max-h-24 overflow-y-auto break-words font-mono text-[10px] leading-4 text-foreground">
        {text}
      </p>
    </div>
  );
}

function countSourcesByType(
  sources: EvidenceSource[],
  sourceType: EvidenceSource["sourceType"]
) {
  return sources.filter((source) => source.sourceType === sourceType).length;
}

function countNonWebSources(sources: EvidenceSource[]) {
  return sources.filter(
    (source) =>
      source.sourceType === "policy" || source.sourceType === "industry"
  ).length;
}

function formatSourceHost(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "success" | "warning";
}) {
  const className =
    tone === "success"
      ? "border-[oklch(0.82_0.04_155)] bg-[oklch(0.965_0.026_155)] text-[oklch(0.34_0.065_155)]"
      : tone === "warning"
        ? "border-[oklch(0.82_0.04_85)] bg-[oklch(0.965_0.03_85)] text-[oklch(0.38_0.07_65)]"
        : "border-border bg-background text-muted-foreground";

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-sm border px-2 py-1 text-xs ${className}`}
    >
      <CircleDot className="size-3" />
      <span className="min-w-0 break-words">{label}</span>
    </span>
  );
}

function SourceTypeBadge({
  sourceType,
}: {
  sourceType: EvidenceSource["sourceType"];
}) {
  const icon =
    sourceType === "paper" ? (
      <BookOpen className="size-3" />
    ) : sourceType === "web" ? (
      <Globe2 className="size-3" />
    ) : (
      <CircleDot className="size-3" />
    );
  const tone = sourceType === "paper" ? "success" : "neutral";

  return (
    <span
      className={[
        "inline-flex max-w-full items-center gap-1.5 rounded-sm border px-2 py-1 text-xs",
        tone === "success"
          ? "border-[oklch(0.82_0.04_155)] bg-[oklch(0.965_0.026_155)] text-[oklch(0.34_0.065_155)]"
          : "border-border bg-background text-muted-foreground",
      ].join(" ")}
    >
      {icon}
      <span className="min-w-0 break-words">{sourceType}</span>
    </span>
  );
}

function TraceSummary({ trace }: { trace: AgentTraceEvent[] }) {
  const toolResults = trace.filter((event) => event.type === "tool_result");
  const totalResults = toolResults.reduce(
    (sum, event) => sum + getNumericMetadata(event.metadata, "resultCount"),
    0
  );
  const retainedSources = toolResults.reduce(
    (sum, event) => sum + getNumericMetadata(event.metadata, "sourceCount"),
    0
  );
  const failedQueries = toolResults.reduce(
    (sum, event) => sum + getNumericMetadata(event.metadata, "failedQueryCount"),
    0
  );

  return (
    <div className="mb-3 grid grid-cols-3 gap-2 text-[11px] leading-5">
      <InfoTile label="工具结果" value={`${totalResults}`} />
      <InfoTile label="保留来源" value={`${retainedSources}`} />
      <InfoTile label="失败查询" value={`${failedQueries}`} />
    </div>
  );
}

function AgentRunTrace({ run }: { run: AgentRun }) {
  const replay = buildAgentTraceReplay(run);
  const [filter, setFilter] = useState<AgentTraceReplayFilter>("all");
  const [showFullMetadata, setShowFullMetadata] = useState(false);
  const allSteps = [...replay.steps, ...replay.unplannedSteps];
  const visibleSteps = filterAgentTraceReplaySteps(allSteps, filter);
  const visibleUnscopedEvents = filterAgentTraceEvents(
    replay.unscopedEvents,
    filter
  );
  const hasHiddenItems =
    filter !== "all" &&
    (visibleSteps.length !== allSteps.length ||
      visibleUnscopedEvents.length !== replay.unscopedEvents.length);
  const handleExportAudit = () => {
    downloadMarkdownFile(
      buildAgentRunAuditMarkdown(run),
      getAgentRunAuditMarkdownFilename(run)
    );
  };

  return (
    <div className="rounded-md border bg-card px-3 py-3">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs leading-5">
          <StatusBadge
            label={formatAgentRunStatus(run.status)}
            tone={
              run.status === "failed"
                ? "warning"
                : run.status === "completed"
                  ? "success"
                  : "neutral"
            }
          />
          <span className="font-medium">{formatAgentRunGoal(run.goal)}</span>
          <span className="text-muted-foreground">
            {formatTimestamp(run.startedAt)}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={handleExportAudit}
        >
          <Download className="size-3" />
          导出记录
        </Button>
      </div>
      <TraceReplaySummary replay={replay} />
      <TraceSummary trace={run.trace} />
      <TraceReplayToolbar
        filter={filter}
        showFullMetadata={showFullMetadata}
        onFilterChange={setFilter}
        onToggleMetadata={() => setShowFullMetadata((value) => !value)}
      />
      {hasHiddenItems ? (
        <p className="mb-2 text-[11px] leading-5 text-muted-foreground">
          当前筛选显示 {visibleSteps.length} / {allSteps.length} 个步骤，
          {visibleUnscopedEvents.length} / {replay.unscopedEvents.length} 个未归属事件。
        </p>
      ) : null}
      <TraceReplaySteps
        steps={visibleSteps}
        showFullMetadata={showFullMetadata}
      />
      <UnscopedTraceEvents
        events={visibleUnscopedEvents}
        showFullMetadata={showFullMetadata}
      />
      {run.pauseReason ? (
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          暂停原因：{run.pauseReason}
        </p>
      ) : null}
    </div>
  );
}

function TraceReplayToolbar({
  filter,
  showFullMetadata,
  onFilterChange,
  onToggleMetadata,
}: {
  filter: AgentTraceReplayFilter;
  showFullMetadata: boolean;
  onFilterChange: (filter: AgentTraceReplayFilter) => void;
  onToggleMetadata: () => void;
}) {
  const filters: { value: AgentTraceReplayFilter; label: string }[] = [
    { value: "all", label: "全部" },
    { value: "issues", label: "异常" },
    { value: "recovered", label: "恢复" },
    { value: "tools", label: "工具" },
    { value: "models", label: "模型" },
    { value: "approval", label: "审核" },
  ];

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            className={[
              "rounded-sm border px-2 py-1 text-[11px] leading-4 transition-colors",
              filter === item.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            ].join(" ")}
            onClick={() => onFilterChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[11px] leading-5 text-muted-foreground">
        <input
          type="checkbox"
          className="size-3 accent-primary"
          checked={showFullMetadata}
          onChange={onToggleMetadata}
        />
        展开完整元数据
      </label>
    </div>
  );
}

function TraceReplaySummary({
  replay,
}: {
  replay: ReturnType<typeof buildAgentTraceReplay>;
}) {
  return (
    <div className="mb-3 grid grid-cols-3 gap-2 text-[11px] leading-5">
      <InfoTile label="步骤" value={`${replay.summary.totalStepCount}`} />
      <InfoTile label="完成" value={`${replay.summary.completedStepCount}`} />
      <InfoTile
        label="恢复"
        value={`${replay.summary.resumedStepCount}`}
      />
    </div>
  );
}

function TraceReplaySteps({
  steps,
  showFullMetadata,
}: {
  steps: AgentTraceReplayStep[];
  showFullMetadata: boolean;
}) {
  if (steps.length === 0) return null;

  return (
    <div className="mb-3 space-y-2">
      {steps.map((step) => (
        <article
          key={step.id}
          className="rounded-md border bg-background px-3 py-2 text-xs leading-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={formatAgentStepStatus(step.status)}
              tone={
                step.hasError || step.status === "failed"
                  ? "warning"
                  : step.status === "completed"
                    ? "success"
                    : "neutral"
              }
            />
            {step.wasResumed ? <StatusBadge label="已恢复" tone="neutral" /> : null}
            <span className="min-w-0 break-words font-medium">{step.title}</span>
          </div>
          {step.latestMessage ? (
            <p className="mt-1 text-muted-foreground">{step.latestMessage}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span>检查点 {step.checkpoints.length}</span>
            <span>事件 {step.events.length}</span>
            {step.toolName ? <span>{step.toolName}</span> : null}
          </div>
          <TraceCheckpointLine checkpoint={step.latestCheckpoint} />
          <TraceStepEvents
            events={step.events}
            showFullMetadata={showFullMetadata}
          />
          {showFullMetadata ? (
            <TraceCheckpointMetadata checkpoints={step.checkpoints} />
          ) : null}
        </article>
      ))}
    </div>
  );
}

function TraceCheckpointLine({
  checkpoint,
}: {
  checkpoint?: AgentCheckpoint;
}) {
  if (!checkpoint) return null;

  return (
    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
      最近检查点：{formatAgentStepStatus(checkpoint.status)} ·{" "}
      {formatTimestamp(checkpoint.createdAt)}
    </p>
  );
}

function TraceStepEvents({
  events,
  showFullMetadata,
}: {
  events: AgentTraceEvent[];
  showFullMetadata: boolean;
}) {
  if (events.length === 0) return null;

  const visibleEvents = showFullMetadata ? events : events.slice(-3);

  return (
    <div className="mt-2 space-y-1">
      {visibleEvents.map((event) => (
        <TraceEventCard
          key={event.id}
          event={event}
          showFullMetadata={showFullMetadata}
        />
      ))}
      {!showFullMetadata && events.length > visibleEvents.length ? (
        <p className="text-[11px] leading-5 text-muted-foreground">
          还有 {events.length - visibleEvents.length} 条事件未展开。
        </p>
      ) : null}
    </div>
  );
}

function TraceCheckpointMetadata({
  checkpoints,
}: {
  checkpoints: AgentCheckpoint[];
}) {
  const checkpointsWithMetadata = checkpoints.filter(
    (checkpoint) =>
      checkpoint.metadata && Object.keys(checkpoint.metadata).length > 0
  );
  if (checkpointsWithMetadata.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-[11px] font-medium text-foreground">检查点元数据</p>
      {checkpointsWithMetadata.map((checkpoint) => (
        <pre
          key={checkpoint.id}
          className="max-h-40 overflow-auto rounded-sm bg-card px-2 py-1.5 text-[10px] leading-4 text-muted-foreground"
        >
          {JSON.stringify(
            {
              id: checkpoint.id,
              status: checkpoint.status,
              metadata: checkpoint.metadata,
            },
            null,
            2
          )}
        </pre>
      ))}
    </div>
  );
}

function UnscopedTraceEvents({
  events,
  showFullMetadata,
}: {
  events: AgentTraceEvent[];
  showFullMetadata: boolean;
}) {
  if (events.length === 0) return null;

  const visibleEvents = showFullMetadata ? events : events.slice(-3);

  return (
    <div className="mb-3 space-y-1">
      <p className="text-[11px] font-medium text-foreground">未归属事件</p>
      {visibleEvents.map((event) => (
        <TraceEventCard
          key={event.id}
          event={event}
          compact
          showFullMetadata={showFullMetadata}
        />
      ))}
      {!showFullMetadata && events.length > visibleEvents.length ? (
        <p className="text-[11px] leading-5 text-muted-foreground">
          还有 {events.length - visibleEvents.length} 条未归属事件未展开。
        </p>
      ) : null}
    </div>
  );
}

function TraceEventCard({
  event,
  compact,
  showFullMetadata,
}: {
  event: AgentTraceEvent;
  compact?: boolean;
  showFullMetadata: boolean;
}) {
  return (
    <div
      className={[
        "rounded-md border bg-card px-2 py-2 text-[11px] leading-5",
        compact ? "bg-background" : "",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge
          label={formatTraceType(event.type)}
          tone={event.type === "error" ? "warning" : "neutral"}
        />
        <span className="text-muted-foreground">
          {formatTimestamp(event.createdAt)}
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">{event.message}</p>
      <TraceMetadata
        metadata={event.metadata}
        showFullMetadata={showFullMetadata}
      />
    </div>
  );
}

function AgentRunHistory({ runs }: { runs: AgentRun[] }) {
  if (runs.length === 0) return null;

  return (
    <AssetSection title="Agent 执行记录">
      <div className="space-y-3">
        {runs.map((run) => (
          <AgentRunTrace key={run.id} run={run} />
        ))}
      </div>
    </AssetSection>
  );
}

function TraceMetadata({
  metadata,
  showFullMetadata,
}: {
  metadata?: Record<string, unknown>;
  showFullMetadata: boolean;
}) {
  if (!metadata) return null;

  const queries = Array.isArray(metadata.queries)
    ? metadata.queries.filter((query): query is string => typeof query === "string")
    : [];
  const sourceIds = Array.isArray(metadata.sourceIds)
    ? metadata.sourceIds.filter((id): id is string => typeof id === "string")
    : [];
  const compact = formatTraceMetadata(metadata);

  return (
    <div className="mt-2 space-y-1 text-[11px] leading-5 text-muted-foreground">
      {queries.length > 0 ? (
        <div className="space-y-1">
          <p className="font-medium text-foreground">检索词</p>
          {queries.slice(0, 4).map((query) => (
            <p key={query} className="break-words font-mono">
              {query}
            </p>
          ))}
        </div>
      ) : null}
      {sourceIds.length > 0 ? (
        <p className="break-words">
          使用来源：<span className="font-mono">{sourceIds.join(", ")}</span>
        </p>
      ) : null}
      {compact ? (
        <p className="break-words font-mono">
          {compact}
        </p>
      ) : null}
      {showFullMetadata ? (
        <pre className="max-h-48 overflow-auto rounded-sm bg-background px-2 py-1.5 text-[10px] leading-4 text-muted-foreground">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

function getNumericMetadata(
  metadata: Record<string, unknown> | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === "number" ? value : 0;
}

function WarningBox({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-md border border-amber-200 bg-[oklch(0.965_0.03_85)] px-3 py-3 text-xs leading-5 text-[oklch(0.38_0.07_65)]">
      {text}
    </p>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="min-w-0 rounded-md border border-dashed bg-background/60 px-3 py-3 text-xs leading-5 text-muted-foreground">
      {text}
    </div>
  );
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTraceType(type: AgentTraceEvent["type"]) {
  switch (type) {
    case "plan_created":
      return "plan";
    case "tool_call":
      return "tool call";
    case "tool_result":
      return "tool result";
    case "model_call":
      return "model call";
    case "model_result":
      return "model result";
    case "fallback":
      return "fallback";
    case "error":
      return "error";
  }
}

function getAgentRunsForDisplay(session: ResearchSession) {
  const runs = session.agentRunHistory ?? (session.agentRun ? [session.agentRun] : []);
  return runs.slice(-5).reverse();
}

function getProjectAgentRunCount(session?: ResearchSession) {
  if (!session) return 0;

  const ids = new Set<string>();
  session.agentRunHistory?.forEach((run) => ids.add(run.id));
  if (session.agentRun) ids.add(session.agentRun.id);
  return ids.size;
}

function downloadMarkdownFile(markdown: string, filename: string) {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatAgentRunStatus(status: AgentRun["status"]) {
  switch (status) {
    case "completed":
      return "已完成";
    case "paused":
      return "已暂停";
    case "running":
      return "运行中";
    case "failed":
      return "失败";
    case "idle":
      return "待开始";
  }
}

function formatAgentStepStatus(status: AgentCheckpoint["status"]) {
  switch (status) {
    case "pending":
      return "待执行";
    case "running":
      return "执行中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
    case "skipped":
      return "已跳过";
  }
}

function formatAgentRunGoal(goal: string) {
  if (goal === "推进到下一个审核点") return "连续推进";
  return goal;
}

function formatTraceMetadata(metadata?: Record<string, unknown>) {
  if (!metadata) return "";

  const keys = [
    "queryCount",
    "resultCount",
    "failedQueryCount",
    "sourceCount",
    "directionCount",
    "sourceIds",
    "queries",
  ];
  const compact = Object.fromEntries(
    keys
      .filter((key) => metadata[key] !== undefined)
      .map((key) => [key, metadata[key]])
  );

  if (Object.keys(compact).length === 0) return "";
  return JSON.stringify(compact);
}

function QualityLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-background px-3 py-2 text-xs leading-5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[oklch(0.38_0.07_155)]" />
      ) : (
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-[oklch(0.48_0.08_65)]" />
      )}
      <span>{text}</span>
    </div>
  );
}

function getPhaseShortLabel(phase: ResearchSession["phase"]) {
  switch (phase) {
    case "direction":
      return "D";
    case "model":
      return "M";
    case "equilibrium":
      return "E";
    case "analysis":
      return "A";
    case "paper":
      return "P";
  }
}

function getPhaseLabel(phase: ResearchSession["phase"]) {
  switch (phase) {
    case "direction":
      return "Direction discovery";
    case "model":
      return "Model confirmation";
    case "equilibrium":
      return "Equilibrium derivation";
    case "analysis":
      return "Property analysis";
    case "paper":
      return "Paper output";
  }
}
