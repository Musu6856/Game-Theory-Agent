"use client";

import { useMemo, useState } from "react";
import type { LiteratureAnalysis, ResearchProject } from "@/lib/types";
import { AnalysisStep } from "./analysis-step";
import { BackgroundStep } from "./background-step";
import { CodeBlock } from "./code-block";
import { EquilibriumStep } from "./equilibrium-step";
import { LiteratureStep } from "./literature-step";
import { ModelStep } from "./model-step";
import { WorkbenchShell, type WorkbenchStep } from "./workbench-shell";
import { cleanWorkbenchTitle } from "@/lib/workbench-format";

const LITERATURE_DECOMPOSITION_KEYS: Array<
  keyof Pick<
    LiteratureAnalysis,
    | "researchQuestion"
    | "modelStructure"
    | "timing"
    | "utilityDesign"
    | "equilibriumMethod"
  >
> = [
  "researchQuestion",
  "modelStructure",
  "timing",
  "utilityDesign",
  "equilibriumMethod",
];

const STEP_COPY: Record<
  WorkbenchStep,
  {
    label: string;
    mainTitle: string;
    mainBody: string;
    sideTitle: string;
    sideBody: string;
  }
> = {
  background: {
    label: "背景故事",
    mainTitle: "研究情境编辑区",
    mainBody:
      "这里承载背景故事、研究谜题与 Hotelling 直觉的结构化编辑。",
    sideTitle: "背景输出",
    sideBody: "背景草稿会在这里沉淀，方便继续改写为论文引言。",
  },
  literature: {
    label: "文献启发",
    mainTitle: "文献拆解编辑区",
    mainBody:
      "这里用于记录参考文献的模型结构、效用设计、均衡方法与可借鉴思路。",
    sideTitle: "文献输出",
    sideBody: "这里汇总文献启发与差异化切入点。",
  },
  model: {
    label: "模型建立",
    mainTitle: "Hotelling 模型编辑区",
    mainBody:
      "这里将接入符号表、参与边、平台、时序、效用函数与利润函数编辑器。",
    sideTitle: "模型输出",
    sideBody: "后续会在这里生成模型设定草稿与符号代码片段。",
  },
  equilibrium: {
    label: "均衡求解",
    mainTitle: "均衡求解编辑区",
    mainBody:
      "这里将呈现一阶条件、求解步骤、闭式解与需要修正的约束条件。",
    sideTitle: "求解代码",
    sideBody: "均衡代码生成后会显示在下方，方便复制复用。",
  },
  analysis: {
    label: "性质分析",
    mainTitle: "性质分析编辑区",
    mainBody:
      "这里将支持比较静态、阈值条件、命题草稿与证明思路的整理。",
    sideTitle: "分析输出",
    sideBody: "后续会在这里汇总命题、证明草稿与经济直觉。",
  },
};

const EQUILIBRIUM_STATUS_LABELS = {
  idle: "待求解",
  solved: "已求解",
  needs_revision: "需修正",
  symbolic_failure: "符号失败",
} as const;

const PROPERTY_OPERATION_LABELS = {
  differentiate: "求导",
  compare: "相减比较",
  threshold: "阈值条件",
  custom: "自定义",
} as const;

export function HotellingWorkbench({ project }: { project: ResearchProject }) {
  const [activeStep, setActiveStep] = useState<WorkbenchStep>("background");
  const copy = STEP_COPY[activeStep];
  const code = project.equilibriumResult?.code ?? "";

  const title = useMemo(() => {
    const cleanTitle = cleanWorkbenchTitle(project.refinedIdea, project.rawIdea);

    return `Hotelling 工作台 - ${cleanTitle}`;
  }, [project.refinedIdea, project.rawIdea]);

  return (
    <WorkbenchShell
      activeStep={activeStep}
      onStepChange={setActiveStep}
      title={title}
      main={
        <WorkbenchMain activeStep={activeStep} copy={copy} project={project} />
      }
      side={
        <OutputPanel
          activeStep={activeStep}
          copy={copy}
          code={activeStep === "equilibrium" ? code : ""}
          project={project}
        />
      }
    />
  );
}

function WorkbenchMain({
  activeStep,
  copy,
  project,
}: {
  activeStep: WorkbenchStep;
  copy: (typeof STEP_COPY)[WorkbenchStep];
  project: ResearchProject;
}) {
  if (activeStep === "background") {
    return <BackgroundStep project={project} />;
  }

  if (activeStep === "literature") {
    return <LiteratureStep project={project} />;
  }

  if (activeStep === "model") {
    return <ModelStep project={project} />;
  }

  if (activeStep === "equilibrium") {
    return <EquilibriumStep project={project} />;
  }

  if (activeStep === "analysis") {
    return <AnalysisStep project={project} />;
  }

  return <WorkbenchPlaceholder copy={copy} project={project} />;
}

function WorkbenchPlaceholder({
  copy,
  project,
}: {
  copy: (typeof STEP_COPY)[WorkbenchStep];
  project: ResearchProject;
}) {
  return (
    <div className="flex min-h-[520px] min-w-0 flex-col">
      <div className="border-b pb-3">
        <p className="text-xs font-medium text-muted-foreground">{copy.label}</p>
        <h3 className="mt-1 break-words text-base font-semibold">
          {copy.mainTitle}
        </h3>
      </div>

      <div className="grid flex-1 place-items-center py-8">
        <div className="min-w-0 border-l border-dashed border-muted-foreground/30 pl-4">
          <p className="max-w-xl break-words text-sm leading-6 text-foreground">
            {copy.mainBody}
          </p>
          <p className="mt-3 max-w-xl break-words text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            当前项目：
            <span className="font-medium text-foreground">
              {project.refinedIdea || project.rawIdea || "未命名研究项目"}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function OutputPanel({
  activeStep,
  copy,
  code,
  project,
}: {
  activeStep: WorkbenchStep;
  copy: (typeof STEP_COPY)[WorkbenchStep];
  code: string;
  project: ResearchProject;
}) {
  const analyses = project.literatureAnalyses ?? [];
  const latestAnalysis = analyses.at(-1);
  const completedLiteratureFields = analyses.reduce(
    (count, analysis) =>
      count +
      LITERATURE_DECOMPOSITION_KEYS.filter((key) => analysis[key].trim())
        .length,
    0
  );
  const totalLiteratureFields =
    analyses.length * LITERATURE_DECOMPOSITION_KEYS.length;

  return (
    <div className="space-y-4">
      <div className="border-b pb-3">
        <p className="text-xs font-medium text-muted-foreground">{copy.label}</p>
        <h3 className="mt-1 text-sm font-semibold">{copy.sideTitle}</h3>
      </div>

      {activeStep === "background" ? (
        <div className="min-w-0 border-l pl-3">
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
            {project.background?.draft ||
              "尚无背景草稿。先补全研究情境、谜题和机制直觉。"}
          </p>
        </div>
      ) : activeStep === "literature" ? (
        <div className="min-w-0 space-y-3">
          <p className="text-sm leading-6 text-muted-foreground">
            已导入 {analyses.length} 篇文献；拆解字段完成{" "}
            {completedLiteratureFields}/{totalLiteratureFields}。
          </p>
          {latestAnalysis ? (
            <LiteratureOutputSummary analysis={latestAnalysis} />
          ) : (
            <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
              尚无文献。添加标题和摘要后，这里会显示最新导入的线索。
            </p>
          )}
        </div>
      ) : activeStep === "equilibrium" ? (
        <>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.sideBody}
          </p>
          <EquilibriumOutputSummary project={project} />
          <CodeBlock code={code} />
        </>
      ) : activeStep === "analysis" ? (
        <>
          <p className="text-sm leading-6 text-muted-foreground">
            {copy.sideBody}
          </p>
          <AnalysisOutputSummary project={project} />
        </>
      ) : (
        <p className="text-sm leading-6 text-muted-foreground">
          {copy.sideBody}
        </p>
      )}
    </div>
  );
}

function EquilibriumOutputSummary({ project }: { project: ResearchProject }) {
  const equilibrium = project.equilibriumResult;

  if (!equilibrium) {
    return (
      <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
        尚未生成符号均衡解。
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-3 border-l pl-3">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">
          {equilibrium.concept || "未指定均衡概念"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          状态：{EQUILIBRIUM_STATUS_LABELS[equilibrium.status]}；一阶条件：{" "}
          {equilibrium.focs.filter((item) => item.trim()).length}；约束条件：{" "}
          {equilibrium.conditions.filter((item) => item.trim()).length}。
        </p>
      </div>
      <p className="line-clamp-5 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
        {equilibrium.closedForm ||
          equilibrium.derivation ||
          "推导完成后，闭式符号结果会显示在这里。"}
      </p>
      {equilibrium.warnings.length ? (
        <OutputList
          title="警告"
          items={equilibrium.warnings.filter((item) => item.trim()).slice(0, 3)}
        />
      ) : null}
    </div>
  );
}

function AnalysisOutputSummary({ project }: { project: ResearchProject }) {
  const analyses = project.propertyAnalyses ?? [];
  const latestAnalysis = analyses.at(-1);

  if (!latestAnalysis) {
    return (
      <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
        尚未添加符号性质分析。
      </p>
    );
  }

  return (
    <div className="min-w-0 space-y-3 border-l pl-3">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">
          {latestAnalysis.target || "未命名分析对象"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {analyses.length} 项分析 ·{" "}
          {PROPERTY_OPERATION_LABELS[latestAnalysis.operation]} · 参数{" "}
          {latestAnalysis.parameter || "未指定"}
        </p>
      </div>
      <p className="line-clamp-5 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
        {latestAnalysis.propositionDraft ||
          latestAnalysis.symbolicResult ||
          latestAnalysis.proofSketch ||
          "最新证明思路会显示在这里。"}
      </p>
      {latestAnalysis.warnings.length ? (
        <OutputList
          title="警告"
          items={latestAnalysis.warnings
            .filter((item) => item.trim())
            .slice(0, 3)}
        />
      ) : null}
    </div>
  );
}

function LiteratureOutputSummary({
  analysis,
}: {
  analysis: LiteratureAnalysis;
}) {
  const completedFields = LITERATURE_DECOMPOSITION_KEYS.filter((key) =>
    analysis[key].trim()
  ).length;
  const topBorrowableIdeas = analysis.borrowableIdeas
    .map((idea) => idea.trim())
    .filter(Boolean)
    .slice(0, 3);
  const topDifferentiationPoints = analysis.differentiationPoints
    .map((point) => point.trim())
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div className="min-w-0 space-y-3 border-l pl-3">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">
          {analysis.title || "未命名文献"}
        </p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          最新文献拆解 {completedFields}/{LITERATURE_DECOMPOSITION_KEYS.length}
        </p>
        <p className="mt-1 line-clamp-3 break-words text-xs leading-5 text-muted-foreground">
          {analysis.sourceText || "暂无原文片段"}
        </p>
      </div>

      <OutputList title="可借鉴" items={topBorrowableIdeas} />
      <OutputList title="差异化" items={topDifferentiationPoints} />
    </div>
  );
}

function OutputList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-foreground">{title}</p>
      {items.length ? (
        <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          暂未填写
        </p>
      )}
    </div>
  );
}
