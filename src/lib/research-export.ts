import type {
  EquilibriumResult,
  HotellingModel,
  PropertyAnalysis,
  ResearchProject,
  SymbolDefinition,
} from "./types";

type ResearchPhase = NonNullable<NonNullable<ResearchProject["researchSession"]>["phase"]>;

export function buildResearchProjectMarkdown(project: ResearchProject): string {
  const title = getResearchProjectTitle(project);
  const lines: string[] = [`# ${title}`];

  pushBlankLine(lines);
  pushProjectOverview(lines, project);

  const directionSection = buildDirectionSection(project);
  if (directionSection) {
    pushBlankLine(lines);
    lines.push(directionSection);
  }

  const modelSection = buildModelSection(project.hotellingModel);
  if (modelSection) {
    pushBlankLine(lines);
    lines.push(modelSection);
  }

  const equilibriumSection = buildEquilibriumSection(project.equilibriumResult);
  if (equilibriumSection) {
    pushBlankLine(lines);
    lines.push(equilibriumSection);
  }

  const propertiesSection = buildPropertySection(project.propertyAnalyses);
  if (propertiesSection) {
    pushBlankLine(lines);
    lines.push(propertiesSection);
  }

  return lines.join("\n");
}

export function getResearchProjectMarkdownFilename(project: ResearchProject): string {
  const baseName = project.refinedIdea?.trim()
    || project.researchSession?.assetSummary.currentDirection?.title?.trim()
    || project.rawIdea?.trim()
    || "paperforge-research";

  return `${sanitizeFilename(`paperforge-${baseName}`)}.md`;
}

function pushProjectOverview(lines: string[], project: ResearchProject) {
  const overview = [
    `- 项目 ID：\`${project.id}\``,
    `- 原始想法：${project.rawIdea || "未填写"}`,
  ];
  if (project.refinedIdea && project.refinedIdea.trim() !== project.rawIdea.trim()) {
    overview.push(`- 精炼题目：${project.refinedIdea}`);
  }
  if (project.researchSession?.phase) {
    overview.push(`- 当前阶段：${formatPhaseLabel(project.researchSession.phase)}`);
  }

  lines.push(...overview);
}

function buildDirectionSection(project: ResearchProject) {
  const session = project.researchSession;
  const current = session?.assetSummary.currentDirection;
  const directions = session?.directions ?? [];
  if (!current && directions.length === 0) return null;

  const lines: string[] = ["## 研究方向"];
  if (current) {
    lines.push(
      "",
      "### 当前方向",
      `- 标题：${current.title}`,
      `- 摘要：${current.summary}`,
      `- 模型：${current.model}`,
      `- 贡献：${current.contribution}`,
      `- 推荐：${current.recommended ? "是" : "否"}`
    );
  } else {
    lines.push("", "### 候选方向");
    directions.forEach((direction, index) => {
      lines.push(
        "",
        `#### ${index + 1}. ${direction.title}`,
        `- 摘要：${direction.summary}`,
        `- 模型：${direction.model}`,
        `- 贡献：${direction.contribution}`,
        `- 推荐：${direction.recommended ? "是" : "否"}`
      );
    });
  }

  return lines.join("\n");
}

function buildModelSection(model?: HotellingModel) {
  if (!model) return null;

  const lines: string[] = ["## 模型设定"];
  lines.push("", "### 模型摘要", model.modelSetupDraft.trim());
  lines.push(
    "",
    "### 关键设定",
    `- 两侧：${model.sides.consumerSideName} / ${model.sides.merchantSideName}`,
    `- 平台：${model.platforms.join(" / ") || "未填写"}`,
    `- 时序：${model.timing.length} 步`,
    `- 假设：${model.assumptions.length} 条`
  );

  if (model.timing.length > 0) {
    lines.push("", "### 决策时序");
    model.timing.forEach((stage) => {
      lines.push(
        "",
        `#### ${stage.order}. ${stage.name}`,
        ...(stage.decisions.length > 0
          ? stage.decisions.map((decision) => `- ${decision}`)
          : ["- 暂无决策说明"])
      );
    });
  }

  if (model.symbols.length > 0) {
    lines.push("", "### 符号表");
    model.symbols.forEach((symbol) => {
      lines.push(`- ${formatSymbolLine(symbol)}`);
    });
  }

  if (model.utilityFunctions.length > 0) {
    lines.push("", "### 效用函数");
    model.utilityFunctions.forEach((formula) => {
      lines.push(
        "",
        `#### ${getUtilitySideLabel(formula.side)} / ${formula.platform}`,
        formula.notes ? `- 说明：${formula.notes}` : "- 说明：",
        wrapDisplayMath(formula.expression)
      );
    });
  }

  if (model.profitFunctions.length > 0) {
    lines.push("", "### 利润函数");
    model.profitFunctions.forEach((formula) => {
      lines.push(
        "",
        `#### ${formula.platform}`,
        formula.notes ? `- 说明：${formula.notes}` : "- 说明：",
        wrapDisplayMath(formula.expression)
      );
    });
  }

  if (model.demandDerivation.trim()) {
    lines.push("", "### 需求推导", model.demandDerivation.trim());
  }

  return lines.join("\n");
}

function buildEquilibriumSection(equilibrium?: EquilibriumResult) {
  if (!equilibrium) return null;

  const lines: string[] = ["## 符号均衡", `- 状态：${equilibrium.status}`];
  if (equilibrium.concept.trim()) {
    lines.push("", "### 概念", equilibrium.concept.trim());
  }

  if (equilibrium.solvingSteps.length > 0) {
    lines.push("", "### 推导步骤");
    equilibrium.solvingSteps.forEach((step) => lines.push(`- ${step}`));
  }

  if (equilibrium.focs.length > 0) {
    lines.push("", "### 一阶条件");
    equilibrium.focs.forEach((foc) => {
      lines.push(`- ${wrapInlineMath(foc)}`);
    });
  }

  if (equilibrium.conditions.length > 0) {
    lines.push("", "### 存在条件");
    equilibrium.conditions.forEach((condition) => {
      lines.push(`- ${wrapInlineMath(condition)}`);
    });
  }

  if (equilibrium.status === "symbolic_failure") {
    lines.push(
      "",
      "### 未得到闭式解",
      "当前内容是符号推导草稿或隐式系统草稿，不应作为论文中的闭式均衡解。"
    );
    if (equilibrium.closedForm.trim()) {
      lines.push("", equilibrium.closedForm.trim());
    }
  } else if (equilibrium.closedForm.trim()) {
    lines.push("", "### 闭式解", wrapDisplayMath(equilibrium.closedForm.trim()));
  }

  if (equilibrium.derivation.trim()) {
    lines.push("", "### 推导说明", equilibrium.derivation.trim());
  }

  if (equilibrium.code.trim()) {
    lines.push("", "### 可复用代码", "```python", equilibrium.code.trim(), "```");
  }

  if (equilibrium.warnings.length > 0) {
    lines.push("", "### 注意");
    equilibrium.warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  return lines.join("\n");
}

function buildPropertySection(analyses: PropertyAnalysis[] | undefined) {
  if (!analyses || analyses.length === 0) return null;

  const lines: string[] = ["## 性质分析"];
  analyses.forEach((analysis, index) => {
    lines.push(
      "",
      `### 分析 ${index + 1}：${analysis.target} 对 ${analysis.parameter}`,
      `- 操作：${analysis.operation}`,
      `- 符号结果：${wrapInlineMath(analysis.symbolicResult)}`
    );

    if (analysis.signCondition.trim()) {
      lines.push(`- 符号条件：${analysis.signCondition.trim()}`);
    }

    if (analysis.propositionDraft.trim()) {
      lines.push("", "#### 命题草稿", analysis.propositionDraft.trim());
    }

    if (analysis.proofSketch.trim()) {
      lines.push("", "#### 证明草稿", analysis.proofSketch.trim());
    }

    if (analysis.intuition.trim()) {
      lines.push("", "#### 直觉", analysis.intuition.trim());
    }

    if (analysis.warnings.length > 0) {
      lines.push("", "#### 注意");
      analysis.warnings.forEach((warning) => lines.push(`- ${warning}`));
    }
  });

  return lines.join("\n");
}

function formatPhaseLabel(phase: ResearchPhase) {
  switch (phase) {
    case "direction":
      return "方向阶段";
    case "model":
      return "模型阶段";
    case "equilibrium":
      return "均衡阶段";
    case "analysis":
      return "性质阶段";
    case "paper":
      return "论文输出阶段";
    default:
      return String(phase);
  }
}

function formatSymbolLine(symbol: SymbolDefinition) {
  const pieces = [
    `\`${symbol.symbol}\``,
    `(${symbol.codeName})`,
    symbol.name,
    symbol.meaning,
    `角色：${symbol.role}`,
    `归属：${symbol.side}`,
    `假设：${symbol.assumption}`,
    symbol.recommended ? "推荐" : "非推荐",
  ];

  return pieces.join("，");
}

function getUtilitySideLabel(side: "consumer" | "merchant") {
  return side === "consumer" ? "消费者效用" : "商家效用";
}

function getResearchProjectTitle(project: ResearchProject) {
  return (
    project.refinedIdea?.trim()
    || project.researchSession?.assetSummary.currentDirection?.title?.trim()
    || project.rawIdea?.trim()
    || "PaperForge Research"
  );
}

function wrapDisplayMath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\$\$[\s\S]*\$\$$/.test(trimmed)) return trimmed;
  if (/^\\\[[\s\S]*\\\]$/.test(trimmed)) return trimmed;
  return `$$\n${trimmed}\n$$`;
}

function wrapInlineMath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("$") && trimmed.endsWith("$")) return trimmed;
  if (trimmed.startsWith("\\(") && trimmed.endsWith("\\)")) return trimmed;
  if (trimmed.startsWith("\\[") && trimmed.endsWith("\\]")) return trimmed;
  return `$${trimmed}$`;
}

function pushBlankLine(lines: string[]) {
  if (lines.length > 0 && lines.at(-1) !== "") {
    lines.push("");
  }
}

function sanitizeFilename(input: string) {
  const safe = input
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return safe.slice(0, 120) || "paperforge-research";
}
