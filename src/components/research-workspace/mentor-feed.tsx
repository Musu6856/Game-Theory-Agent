import {
  AlertCircle,
  CheckCircle2,
  FileText,
  ListChecks,
  LockKeyhole,
  Loader2,
  Sigma,
} from "lucide-react";

import { DirectionCard } from "./direction-card";
import { MathArtifact } from "./math-artifact";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/components/ui/button";
import { getResearchFeedItems } from "@/lib/research-feed";
import {
  createResearchActionClickHandler,
  getResearchFlowState,
} from "@/lib/research-flow";
import type {
  EquilibriumResult,
  HotellingModel,
  ResearchProject,
  ResearchSession,
} from "@/lib/types";

export function MentorFeed({
  project,
  session,
  onAdopt,
  onConfirmModel,
  onSolveEquilibrium,
  onAnalyzeProperties,
  adoptingDirectionId,
  isConfirmingModel,
  isSolvingEquilibrium,
  isAnalyzingProperties,
}: {
  project: ResearchProject;
  session: ResearchSession;
  onAdopt: (directionId: string) => void;
  onConfirmModel: () => void;
  onSolveEquilibrium: () => void;
  onAnalyzeProperties: () => void;
  adoptingDirectionId?: string | null;
  isConfirmingModel?: boolean;
  isSolvingEquilibrium?: boolean;
  isAnalyzingProperties?: boolean;
}) {
  const feedItems = getResearchFeedItems(session);
  const flow = getResearchFlowState(project, session);
  const evidenceSources = session.evidencePack?.sources ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      {feedItems.map((item, index) => (
        <Message
          key={`${item.message.id}-${index}`}
          role={item.message.role}
          content={item.message.content}
        >
          {item.showDirections && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {session.directions.map((direction) => (
                <DirectionCard
                  key={direction.id}
                  direction={direction}
                  evidenceSources={evidenceSources}
                  adopted={session.assetSummary.currentDirection?.id === direction.id}
                  disabled={false}
                  isAdopting={adoptingDirectionId === direction.id}
                  onAdopt={onAdopt}
                />
              ))}
            </div>
          )}
          {item.showPhaseAction && (
            <>
              {flow.canConfirmModel && project.hotellingModel && (
                <ModelConfirmationPanel
                  model={project.hotellingModel}
                  onConfirm={onConfirmModel}
                  isConfirming={isConfirmingModel}
                />
              )}
              {flow.canSolveEquilibrium && (
                <SolveReadinessPanel
                  project={project}
                  onSolve={onSolveEquilibrium}
                  isSolving={isSolvingEquilibrium}
                />
              )}
              {flow.canAnalyzeProperties && project.equilibriumResult && (
                <EquilibriumStatusPanel
                  project={project}
                  onAnalyze={onAnalyzeProperties}
                  isAnalyzing={isAnalyzingProperties}
                />
              )}
              {flow.hasPropertyAnalyses && project.propertyAnalyses && (
                <PropertyAnalysisPanel project={project} />
              )}
            </>
          )}
        </Message>
      ))}

      {feedItems.length === 0 && (
        <Message
          role="assistant"
          content="我先把你的想法拆成几个可建模方向，再一起选择最适合符号推导的路线。"
        >
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {session.directions.map((direction) => (
                <DirectionCard
                  key={direction.id}
                  direction={direction}
                  evidenceSources={evidenceSources}
                  adopted={session.assetSummary.currentDirection?.id === direction.id}
                  disabled={false}
                  isAdopting={adoptingDirectionId === direction.id}
                onAdopt={onAdopt}
              />
            ))}
          </div>
        </Message>
      )}
    </div>
  );
}

function ModelConfirmationPanel({
  model,
  onConfirm,
  isConfirming,
}: {
  model: HotellingModel;
  onConfirm: () => void;
  isConfirming?: boolean;
}) {
  return (
    <div className="mt-5 rounded-lg border border-primary/35 bg-accent/30 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-sm bg-background px-2 py-1 text-xs font-medium text-primary">
            <CheckCircle2 className="size-3.5" />
            下一步
          </div>
          <h3 className="font-serif text-base font-semibold">
            确认模型设定
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            先检查这个最小可求解模型是否符合你的设定。确认后，工作台会解锁“生成符号均衡推导”主按钮；后面仍然可以继续补充或回退调整。
          </p>
        </div>
        <Button
          className="h-9 shrink-0 gap-1.5"
          disabled={isConfirming}
          onClick={createResearchActionClickHandler(onConfirm)}
        >
          {isConfirming ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCircle2 className="size-4" />
          )}
          确认模型设定
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SummaryBox
          title="决策顺序"
          items={model.timing.map(
            (stage) => `${stage.order}. ${stage.name}：${stage.decisions.join("、")}`
          )}
        />
        <SummaryBox title="可求解假设" items={model.assumptions.slice(0, 3)} />
      </div>
    </div>
  );
}

function EquilibriumStatusPanel({
  project,
  onAnalyze,
  isAnalyzing,
}: {
  project: ResearchProject;
  onAnalyze: () => void;
  isAnalyzing?: boolean;
}) {
  const equilibrium = project.equilibriumResult;
  const canAnalyze =
    Boolean(equilibrium) &&
    equilibrium?.status !== "idle" &&
    equilibrium?.status !== "needs_revision";
  const isSymbolicFailure = equilibrium?.status === "symbolic_failure";
  const statusLabel = formatEquilibriumResultStatus(equilibrium?.status);

  return (
    <div className="mt-5 space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-serif text-base font-semibold">均衡求解</p>
            <p className="mt-1 text-xs text-muted-foreground">
              当前状态：{statusLabel}
            </p>
          </div>
          {canAnalyze ? (
            <span
              className={
                isSymbolicFailure
                  ? "inline-flex items-center gap-1.5 rounded-sm border border-amber-200 bg-[oklch(0.96_0.035_85)] px-2 py-1 text-xs text-[oklch(0.42_0.075_65)]"
                  : "inline-flex items-center gap-1.5 rounded-sm border border-[oklch(0.82_0.04_155)] bg-[oklch(0.965_0.026_155)] px-2 py-1 text-xs text-[oklch(0.34_0.065_155)]"
              }
            >
              {isSymbolicFailure ? (
                <AlertCircle className="size-3" />
              ) : (
                <CheckCircle2 className="size-3" />
              )}
              {isSymbolicFailure ? "需收窄模型" : "可检查资产"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-sm border border-amber-200 bg-[oklch(0.96_0.035_85)] px-2 py-1 text-xs text-[oklch(0.42_0.075_65)]">
              <AlertCircle className="size-3" />
              人工确认中
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isSymbolicFailure
            ? "当前不是完整闭式均衡，只是保留了符号方程、一阶条件和可继续求解的结构。不要把它当作论文结论；更好的下一步是收窄策略变量、明确需求份额，再重新求解。"
            : canAnalyze
              ? "当前已经生成一版可检查的符号均衡资产。请重点检查闭式表达、存在条件和代码是否与你的论文设定一致。"
            : "当前已经有符号推导草稿，但还没有可用于性质分析的解析均衡解。下一步应先检查需求份额和一阶条件，再继续整理闭式均衡。"}
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <SummaryBox title="求解步骤" items={equilibrium?.solvingSteps ?? []} />
          <SummaryBox title="约束条件" items={equilibrium?.conditions ?? []} />
        </div>

        {equilibrium?.focs.length ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-foreground">
              一阶条件
            </p>
            <div className="space-y-2">
              {equilibrium.focs.map((foc) => (
                <MathArtifact key={foc} formula={foc} />
              ))}
            </div>
          </div>
        ) : null}

        {equilibrium?.warnings.length ? (
          <div className="mt-4 rounded-md border border-amber-200 bg-[oklch(0.965_0.03_85)] px-3 py-3 text-xs leading-5 text-[oklch(0.38_0.07_65)]">
            {equilibrium.warnings.join(" ")}
          </div>
        ) : null}

        {equilibrium?.closedForm ? (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-foreground">
              {isSymbolicFailure ? "未得到闭式解" : "闭式均衡摘要"}
            </p>
            {isSymbolicFailure ? (
              <MarkdownRenderer
                content={equilibrium.closedForm}
                className="paperforge-markdown text-sm leading-6 text-muted-foreground"
              />
            ) : (
              <MathArtifact formula={equilibrium.closedForm} />
            )}
          </div>
        ) : null}

        {equilibrium?.code ? (
          <div className="mt-4 rounded-md border bg-background p-3">
            <p className="mb-2 text-xs font-semibold text-foreground">
              可复用求解代码
            </p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
              <code>{equilibrium.code}</code>
            </pre>
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-serif text-base font-semibold">性质分析</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isSymbolicFailure
                ? "仅可做隐函数草稿"
                : canAnalyze
                  ? "均衡资产已就绪"
                  : "依赖符号均衡结果"}
            </p>
          </div>
          {canAnalyze ? (
            <Button
              className="h-9 shrink-0 gap-1.5"
              disabled={isAnalyzing}
              onClick={createResearchActionClickHandler(onAnalyze)}
            >
              {isAnalyzing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              {isSymbolicFailure ? "生成隐函数性质草稿" : "生成性质分析"}
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">
              <LockKeyhole className="size-3" />
              等待解析解
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {isSymbolicFailure
            ? "这一步只能基于隐函数和反应系统生成性质草稿，不能声称已经得到闭式比较静态。若要论文可用，应先回到模型设定收窄变量。"
            : "这一步不会用数值代入替代理论分析。只有当均衡解足够清楚后，才会对佣金、补贴、网络效应、差异化成本等参数做求导、相减和阈值条件分析。"}
        </p>
        <div className="mt-3 grid gap-2 text-xs leading-5 md:grid-cols-3">
          <div className="rounded-md border border-dashed bg-background/70 px-3 py-3">
            比较静态：{isSymbolicFailure ? "仅草稿" : canAnalyze ? "可生成" : "等待均衡结果"}
          </div>
          <div className="rounded-md border border-dashed bg-background/70 px-3 py-3">
            策略差异：{isSymbolicFailure ? "需收窄" : canAnalyze ? "可生成" : "等待平台策略"}
          </div>
          <div className="rounded-md border border-dashed bg-background/70 px-3 py-3">
            阈值条件：{isSymbolicFailure ? "不宜声称" : canAnalyze ? "可生成" : "等待符号整理"}
          </div>
        </div>
      </div>
    </div>
  );
}

function SolveReadinessPanel({
  project,
  onSolve,
  isSolving,
}: {
  project: ResearchProject;
  onSolve: () => void;
  isSolving?: boolean;
}) {
  const equilibrium = project.equilibriumResult;

  return (
    <div className="mt-5 rounded-lg border border-primary/25 bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-sm bg-accent px-2 py-1 text-xs font-medium text-primary">
            <ListChecks className="size-3.5" />
            模型已确认
          </div>
          <h3 className="font-serif text-base font-semibold">
            生成符号均衡推导
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            模型设定已经确认。下一步会按无差异条件、需求份额、利润函数和一阶条件生成符号推导，不做数值仿真。
          </p>
        </div>
        <Button
          className="h-9 shrink-0 gap-1.5"
          disabled={isSolving}
          onClick={createResearchActionClickHandler(onSolve)}
        >
          {isSolving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sigma className="size-4" />
          )}
          生成符号均衡推导
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SummaryBox title="将要执行的步骤" items={equilibrium?.solvingSteps ?? []} />
        <SummaryBox title="需要满足的条件" items={equilibrium?.conditions ?? []} />
      </div>

      {equilibrium?.focs.length ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-foreground">
            待检查一阶条件
          </p>
          <div className="space-y-2">
            {equilibrium.focs.map((foc) => (
              <MathArtifact key={foc} formula={foc} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PropertyAnalysisPanel({ project }: { project: ResearchProject }) {
  const analyses = project.propertyAnalyses ?? [];
  const hasThinAnalysis = analyses.length > 0 && analyses.length < 3;

  return (
    <div className="mt-5 rounded-lg border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-serif text-base font-semibold">性质分析</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            下面是基于符号均衡结果生成的比较静态、阈值条件和命题草稿，不使用数值代入替代理论分析。
          </p>
        </div>
        <span
          className={
            hasThinAnalysis
              ? "inline-flex items-center gap-1.5 rounded-sm border border-amber-200 bg-[oklch(0.96_0.035_85)] px-2 py-1 text-xs text-[oklch(0.42_0.075_65)]"
              : "inline-flex items-center gap-1.5 rounded-sm border border-[oklch(0.82_0.04_155)] bg-[oklch(0.965_0.026_155)] px-2 py-1 text-xs text-[oklch(0.34_0.065_155)]"
          }
        >
          {hasThinAnalysis ? (
            <AlertCircle className="size-3" />
          ) : (
            <CheckCircle2 className="size-3" />
          )}
          {hasThinAnalysis ? "草稿不足" : "已生成草稿"}
        </span>
      </div>
      {hasThinAnalysis ? (
        <div className="mb-4 rounded-md border border-amber-200 bg-[oklch(0.965_0.03_85)] px-3 py-3 text-xs leading-5 text-[oklch(0.38_0.07_65)]">
          当前只有 {analyses.length} 条性质，不能作为完整性质分析。建议让助手“重做性质分析，至少给出 3 条可检查命题”，或先收窄模型后重新求解。
        </div>
      ) : null}

      <div className="space-y-3">
        {analyses.map((analysis, index) => (
          <div key={analysis.id} className="rounded-md border bg-background p-3">
            <p className="font-serif text-sm font-semibold">
              命题 {index + 1}
            </p>
            <p className="mt-1 text-sm leading-6">{analysis.propositionDraft}</p>
            <div className="mt-3">
              <MathArtifact formula={analysis.symbolicResult} />
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              条件：{analysis.signCondition}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              证明思路：{analysis.proofSketch}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryBox({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="mb-2 text-xs font-semibold text-foreground">{title}</p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <p key={item} className="text-xs leading-5 text-muted-foreground">
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function Message({
  role,
  content,
  children,
}: {
  role: "user" | "assistant";
  content: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-xs font-semibold data-[role=assistant]:bg-foreground data-[role=assistant]:font-serif data-[role=assistant]:text-background data-[role=user]:bg-border data-[role=user]:text-foreground"
        data-role={role}
      >
        {role === "assistant" ? "导" : "你"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-7 text-foreground">{content}</p>
        {children}
      </div>
    </div>
  );
}

function formatEquilibriumResultStatus(status?: EquilibriumResult["status"]) {
  switch (status) {
    case "solved":
      return "已生成符号均衡";
    case "symbolic_failure":
      return "仅有符号推导草稿";
    case "needs_revision":
      return "需要修订";
    case "idle":
      return "尚未开始";
    default:
      return "等待生成";
  }
}
