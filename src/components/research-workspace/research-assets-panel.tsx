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
import { PhaseIndicator } from "./phase-indicator";
import { ResearchAssetsTabs } from "./research-assets-tabs";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import {
  buildResearchProjectMarkdown,
  getResearchProjectMarkdownFilename,
} from "@/lib/research-export";
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
  isContinuingSafely?: boolean;
  onAdopt?: (directionId: string) => void;
  onConfirmModel?: () => void;
  onSafeContinue?: () => void;
  onSolveEquilibrium?: () => void;
  onAnalyzeProperties?: () => void;
  onDraftPaper?: () => void;
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
  isContinuingSafely,
  onAdopt,
  onConfirmModel,
  onSafeContinue,
  onSolveEquilibrium,
  onAnalyzeProperties,
  onDraftPaper,
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
  const nextRecommendation = recommendNextAgentStep(project);
  const safeContinuationPlan = planSafeContinuation(project);
  const recoverySuggestion = getAgentRecoverySuggestion(project);
  const isSymbolicFailure = equilibrium?.status === "symbolic_failure";
  const hasThinAnalysis = analyses.length > 0 && analyses.length < 3;
  const canSolveNow =
    Boolean(model && onSolveEquilibrium) &&
    (flow.canSolveEquilibrium || flow.isEquilibriumStale);
  const canAnalyzeNow =
    Boolean(equilibrium && onAnalyzeProperties) &&
    (flow.canAnalyzeProperties || flow.isPropertyAnalysisStale);
  const canDraftPaper = Boolean(onDraftPaper) && flow.canDraftPaper;
  const nextRecommendationBusy = getNextRecommendationBusyState({
    recommendation: nextRecommendation,
    isConfirmingModel,
    isSolvingEquilibrium,
    isAnalyzingProperties,
    isDraftingPaper,
  });
  const handleRunNextRecommendation = () => {
    setActiveTab(nextRecommendation.targetTab);

    switch (nextRecommendation.action?.kind) {
      case "choose_direction":
        return;
      case "confirm_model":
        onConfirmModel?.();
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
  const handleReviewAssetPatch = (patchId: string) => {
    const patch = session.assetPatches?.find((item) => item.id === patchId);
    if (patch) setActiveTab(getResearchAssetsTabForPatchKind(patch.kind));
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

    const markdown = buildResearchProjectMarkdown(project);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = getResearchProjectMarkdownFilename(project);
    anchor.click();
    URL.revokeObjectURL(url);
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
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex min-h-14 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">
              {asset.currentDirection?.title ?? "工作台总览"}
            </h2>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              右侧内容是当前研究的结构化版本，可以检查、采用和编辑。
            </p>
          </div>
          <div className="flex items-start gap-2">
            {project ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
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
            <PhaseIndicator phase={session.phase} />
          </div>
        </div>
      </div>

      <PendingAssetPatches
        patches={session.assetPatches ?? []}
        onReview={handleReviewAssetPatch}
        onApply={handleApplyAssetPatch}
        onApplyQuickReview={onApplyQuickReviewAssetPatches}
        onReject={onRejectAssetPatch}
      />

      <ResearchAssetsTabs activeTab={activeTab} onActiveTabChange={setActiveTab} />

      <NextStepSuggestion
        recommendation={nextRecommendation}
        safeContinuationPlan={safeContinuationPlan}
        recoverySuggestion={recoverySuggestion}
        isBusy={nextRecommendationBusy}
        isContinuingSafely={isContinuingSafely}
        onOpenTab={setActiveTab}
        onRunAction={handleRunNextRecommendation}
        onSafeContinue={onSafeContinue}
        onRunRecovery={onRunRecovery}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {activeTab === "directions" ? (
          <DirectionsTab
            session={session}
            adoptingDirectionId={adoptingDirectionId}
            onAdopt={onAdopt}
          />
        ) : null}

        {activeTab === "evidence" ? <EvidenceTab session={session} /> : null}

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
            isSymbolicFailure={isSymbolicFailure}
            isStale={flow.isEquilibriumStale}
            canSolveNow={canSolveNow}
            isSolvingEquilibrium={isSolvingEquilibrium}
            onSolveEquilibrium={onSolveEquilibrium}
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
          />
        ) : null}

        {activeTab === "paper" ? (
          <PaperTab
            project={project}
            canDraftPaper={canDraftPaper}
            isDraftingPaper={isDraftingPaper}
            onDraftPaper={onDraftPaper}
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

function EvidenceTab({ session }: { session: ResearchSession }) {
  const pack = session.evidencePack;
  const runs = getAgentRunsForDisplay(session);

  if (!pack) {
    return (
      <div className="space-y-4">
        <EmptyLine text="当前研究还没有联网来源。开启新的方向发现后，这里会显示检索来源；已执行过的 Agent 步骤会继续记录在下面。" />
        <AgentRunHistory runs={runs} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
  onOpenTab,
  onRunAction,
  onSafeContinue,
  onRunRecovery,
}: {
  recommendation: NextAgentRecommendation;
  safeContinuationPlan: SafeContinuationPlan;
  recoverySuggestion: AgentRecoverySuggestion | null;
  isBusy?: boolean;
  isContinuingSafely?: boolean;
  onOpenTab: (tab: ResearchAssetsTab) => void;
  onRunAction: () => void;
  onSafeContinue?: () => void;
  onRunRecovery?: (suggestion: AgentRecoverySuggestion) => void;
}) {
  const isExecutable =
    recommendation.status === "ready" &&
    recommendation.action &&
    recommendation.action.kind !== "choose_direction";
  const canContinueSafely =
    safeContinuationPlan.status === "ready" &&
    safeContinuationPlan.steps.length > 0 &&
    Boolean(onSafeContinue);
  const buttonLabel = isExecutable
    ? recommendation.action?.label
    : recommendation.status === "complete"
      ? "查看草稿"
      : recommendation.status === "blocked"
        ? "去处理"
        : "查看方向";
  const icon =
    recommendation.status === "complete" ? (
      <CheckCircle2 className="size-4" />
    ) : recommendation.status === "blocked" ? (
      <AlertCircle className="size-4" />
    ) : isBusy ? (
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
    <div className="shrink-0 border-b border-border/70 bg-muted/20 px-4 py-3">
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
          {recommendation.blocker ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {recommendation.blocker.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button
            type="button"
            variant={isExecutable ? "default" : "outline"}
            size="sm"
            className="gap-1.5"
            disabled={isBusy || isContinuingSafely}
            onClick={createResearchActionClickHandler(
              isExecutable
                ? onRunAction
                : () => onOpenTab(recommendation.targetTab)
            )}
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : icon}
            {buttonLabel}
          </Button>
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
          onOpenTab={onOpenTab}
          onRunRecovery={onRunRecovery}
        />
      ) : null}
    </div>
  );
}

function AgentRecoveryNotice({
  suggestion,
  isBusy,
  onOpenTab,
  onRunRecovery,
}: {
  suggestion: AgentRecoverySuggestion;
  isBusy?: boolean;
  onOpenTab: (tab: ResearchAssetsTab) => void;
  onRunRecovery?: (suggestion: AgentRecoverySuggestion) => void;
}) {
  const canRun =
    suggestion.status !== "review_required" &&
    Boolean(suggestion.actionKind) &&
    Boolean(onRunRecovery);
  const label =
    suggestion.status === "review_required"
      ? "去审核"
      : suggestion.status === "retryable"
        ? "重试"
        : "继续";

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
        <Button
          type="button"
          variant={canRun ? "default" : "outline"}
          size="sm"
          className="h-7 shrink-0 gap-1.5 text-xs"
          disabled={isBusy || (suggestion.status !== "review_required" && !canRun)}
          onClick={createResearchActionClickHandler(
            canRun
              ? () => onRunRecovery?.(suggestion)
              : () => onOpenTab(suggestion.targetTab)
          )}
        >
          {label}
        </Button>
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
  isSymbolicFailure,
  isStale,
  canSolveNow,
  isSolvingEquilibrium,
  onSolveEquilibrium,
}: {
  equilibriumStatusLabel: string;
  equilibrium?: ResearchProject["equilibriumResult"];
  isSymbolicFailure: boolean;
  isStale: boolean;
  canSolveNow: boolean;
  isSolvingEquilibrium?: boolean;
  onSolveEquilibrium?: () => void;
}) {
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
          tone={isStale || isSymbolicFailure ? "warning" : equilibrium ? "success" : "neutral"}
        />
        {isSymbolicFailure ? (
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

      {equilibrium ? (
        <>
          <AssetSection title="均衡概念">
            <MarkdownRenderer
              content={equilibrium.concept}
              className="paperforge-markdown text-sm leading-6 text-muted-foreground"
            />
          </AssetSection>

          <AssetSection title="一阶条件">
            <FormulaList items={equilibrium.focs} emptyText="尚未生成一阶条件。" />
          </AssetSection>

          {isSymbolicFailure ? (
            <AssetSection title="未得到闭式解">
              {equilibrium.closedForm ? (
                <MarkdownRenderer
                  content={equilibrium.closedForm}
                  className="paperforge-markdown text-sm leading-6 text-muted-foreground"
                />
              ) : (
                <EmptyLine text="当前只有隐式系统草稿，尚未得到星号闭式解。" />
              )}
            </AssetSection>
          ) : (
            <AssetSection title="闭式解">
              {equilibrium.closedForm ? (
                <MathArtifact formula={equilibrium.closedForm} />
              ) : (
                <EmptyLine text="尚未得到可展示的闭式解。" />
              )}
            </AssetSection>
          )}

          <AssetSection title="推导步骤">
            <OrderedList items={equilibrium.solvingSteps} />
          </AssetSection>

          <AssetSection title="存在条件">
            <OrderedList items={equilibrium.conditions} />
          </AssetSection>

          {equilibrium.warnings.length > 0 ? (
            <AssetSection title="注意">
              <div className="space-y-2">
                {equilibrium.warnings.map((warning) => (
                  <WarningBox key={warning} text={warning} />
                ))}
              </div>
            </AssetSection>
          ) : null}
        </>
      ) : (
        <EmptyLine text="确认模型后，可以在这里生成并检查符号均衡。" />
      )}
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
}: {
  analyses: NonNullable<ResearchProject["propertyAnalyses"]>;
  analysisStatusLabel: string;
  hasThinAnalysis: boolean;
  isStale: boolean;
  canAnalyzeNow: boolean;
  isAnalyzingProperties?: boolean;
  onAnalyzeProperties?: () => void;
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
  onDraftPaper,
}: {
  project?: ResearchProject;
  canDraftPaper: boolean;
  isDraftingPaper?: boolean;
  onDraftPaper?: () => void;
}) {
  const markdown = project ? buildResearchProjectMarkdown(project) : "";
  const sections = project?.sections ?? [];
  const hasDraftSections = sections.length > 0;

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
                <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <FileText className="size-3.5" />
                  {section.status}
                </p>
                <h3 className="mt-1 text-sm font-semibold">{section.title}</h3>
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
}: {
  session: ResearchSession;
  equilibrium?: ResearchProject["equilibriumResult"];
  analysesCount: number;
  isSymbolicFailure: boolean;
  hasThinAnalysis: boolean;
  isEquilibriumStale: boolean;
  isPropertyAnalysisStale: boolean;
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

      <AssetSection title="下一步">
        <OrderedList items={session.assetSummary.nextActions} />
      </AssetSection>
    </div>
  );
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

  if (events.length === 0) {
    return (
      <EmptyLine text="还没有资产版本记录。应用或拒绝模型、均衡、性质分析、论文草稿修改建议后，这里会留下审核记录。" />
    );
  }

  return (
    <div className="space-y-4">
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
    const markdown = buildAgentRunAuditMarkdown(run);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = getAgentRunAuditMarkdownFilename(run);
    anchor.click();
    URL.revokeObjectURL(url);
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
