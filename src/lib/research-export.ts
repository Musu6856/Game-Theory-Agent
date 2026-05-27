import type {
  HotellingModel,
  PropertyAnalysis,
  ResearchProject,
  SymbolDefinition,
} from "./types";
import { assessProjectEquilibriumEvidence } from "./research-agent/equilibrium-evidence.ts";

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

  const equilibriumSection = buildEquilibriumSection(project);
  if (equilibriumSection) {
    pushBlankLine(lines);
    lines.push(equilibriumSection);
  }

  const propertiesSection = buildPropertySection(project.propertyAnalyses);
  if (propertiesSection) {
    pushBlankLine(lines);
    lines.push(propertiesSection);
  }

  const paperSection = buildAppliedPaperSection(project.sections);
  if (paperSection) {
    pushBlankLine(lines);
    lines.push(paperSection);
  }

  const mathArtifactsSection = buildMathArtifactsSection(
    project.researchSession?.mathArtifacts
  );
  if (mathArtifactsSection) {
    pushBlankLine(lines);
    lines.push(mathArtifactsSection);
  }

  const sympyReviewSection = buildSympyReviewScriptSection(project);
  if (sympyReviewSection) {
    pushBlankLine(lines);
    lines.push(sympyReviewSection);
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

function buildEquilibriumSection(project: ResearchProject) {
  const equilibrium = project.equilibriumResult;
  if (!equilibrium) return null;
  const assessment = assessProjectEquilibriumEvidence(project);

  const lines: string[] = [
    "## 符号均衡",
    `- 状态：${equilibrium.status}`,
    `- 证据状态：${assessment.status}`,
    `- 下游使用：${assessment.canUseForFormalComparativeStatics ? "可用于正式比较静态" : "不能用于正式比较静态"}`,
    `- 最优性证据：${assessment.optimalitySummary}`,
  ];
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

  if (!assessment.canCiteAsFormalEquilibrium) {
    lines.push(
      "",
      "### 未得到闭式解",
      assessment.summary
    );
    if (equilibrium.solverScratchpad?.implicitSystem?.length) {
      lines.push(
        "",
        "#### 隐式系统草稿",
        ...equilibrium.solverScratchpad.implicitSystem.map((item) => `- ${item}`)
      );
    }
    if (equilibrium.solverScratchpad?.reactionFunctions?.length) {
      lines.push(
        "",
        "#### 反应函数草稿",
        ...equilibrium.solverScratchpad.reactionFunctions.map((item) => `- ${item}`)
      );
    }
    if (equilibrium.closedForm.trim() && assessment.status !== "draft") {
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

function buildAppliedPaperSection(sections: ResearchProject["sections"]) {
  if (sections.length === 0) return null;

  const lines: string[] = ["## 论文输出"];
  sections.forEach((section) => {
    if (!section.content.trim()) return;

    lines.push(
      "",
      `### ${section.title}`,
      "",
      section.content.trim()
    );
  });

  return lines.length > 1 ? lines.join("\n") : null;
}

function buildMathArtifactsSection(
  artifacts: NonNullable<ResearchProject["researchSession"]>["mathArtifacts"]
) {
  if (!artifacts || artifacts.length === 0) return null;

  const lines: string[] = ["## 数学产物记录"];
  artifacts.slice(-12).forEach((artifact) => {
    lines.push(
      "",
      `### ${artifact.title}`,
      `- 类型：${artifact.kind}`,
      `- 状态：${artifact.status}`,
      `- 来源：${artifact.source}`,
      `- AgentRun：${artifact.runId ?? "未记录"}`,
      `- 步骤：${artifact.stepId}`,
      `- Patch：${artifact.patchId ?? "未绑定"}`
    );

    if (artifact.input !== undefined) {
      lines.push("", "#### 输入", "```json", stringifyArtifactValue(artifact.input), "```");
    }

    if (artifact.output !== undefined) {
      lines.push("", "#### 输出", "```json", stringifyArtifactValue(artifact.output), "```");
    }

    if (artifact.issues?.length) {
      lines.push("", "#### 问题");
      artifact.issues.forEach((issue) => lines.push(`- ${issue}`));
    }
  });

  return lines.join("\n");
}

function stringifyArtifactValue(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildSympyReviewScriptSection(project: ResearchProject) {
  const script = buildSympyReviewScript(project);
  if (!script) return null;

  return [
    "## 可复核 SymPy 脚本",
    "",
    "这段脚本由当前模型、均衡和性质分析资产生成，用于复核可解析的利润函数、FOC、候选闭式解和比较静态；复杂或暂不支持的表达式会输出人工复核提示。",
    "",
    "```python",
    script,
    "```",
  ].join("\n");
}

function buildSympyReviewScript(project: ResearchProject) {
  const model = project.hotellingModel;
  const equilibrium = project.equilibriumResult;
  const assessment = assessProjectEquilibriumEvidence(project);
  if (
    !model ||
    !equilibrium ||
    equilibrium.status !== "solved" ||
    !assessment.canUseForFormalComparativeStatics
  ) {
    return "";
  }

  const symbolNames = getModelSymbolNames(model);
  if (symbolNames.length === 0) return "";

  const profitInputs = model.profitFunctions
    .map((profit) => parseFormulaAssignment(profit.expression, model))
    .filter((profit): profit is FormulaAssignment => Boolean(profit));
  const candidateInputs = extractCandidateAssignments(
    equilibrium.closedForm,
    model,
    symbolNames
  );
  const equilibriumResidualInputs = extractEquilibriumResidualInputs(
    equilibrium.focs,
    model
  );
  const equilibriumAssignmentInputs = extractEquilibriumAssignmentInputs(
    equilibrium.focs,
    model
  );
  const reviewCandidateInputs = addDerivedCandidateInputs(
    candidateInputs,
    equilibriumAssignmentInputs
  );
  const decisionVariablesByProfit = buildDecisionVariablesByProfit({
    model,
    profitInputs,
  });
  const propertyClaims = buildPropertyClaimInputs(
    project.propertyAnalyses ?? [],
    model,
    reviewCandidateInputs.map((input) => input.name)
  );

  if (
    profitInputs.length === 0 &&
    reviewCandidateInputs.length === 0 &&
    equilibriumResidualInputs.length === 0 &&
    propertyClaims.length === 0
  ) {
    return "";
  }

  const lines: string[] = [
    "# PaperForge generated SymPy review script",
    "# 目的：复核当前导出的利润函数、FOC、候选闭式解和性质分析。",
    "# 注意：复杂隐式系统或无法安全解析的表达式会进入人工复核提示。",
    "import sympy as sp",
    "from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application",
    "",
    "TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application,)",
    `symbol_names = ${toPythonString(symbolNames.join(" "))}`,
    "symbol_values = sp.symbols(symbol_names, real=True)",
    "if not isinstance(symbol_values, tuple):",
    "    symbol_values = (symbol_values,)",
    "locals_dict = dict(zip(symbol_names.split(), symbol_values))",
    "globals().update(locals_dict)",
    "",
    "def parse_sympy(text):",
    "    return parse_expr(text, local_dict=locals_dict, transformations=TRANSFORMATIONS)",
    "",
    "def safe_parse(label, text):",
    "    try:",
    "        return parse_sympy(text)",
    "    except Exception as exc:",
    "        print(f'[manual_review] {label}: {text} -> {exc}')",
    "        return None",
    "",
  ];

  appendSymbolComments(lines, model);
  appendProfitReviewCode(lines, profitInputs, decisionVariablesByProfit);
  appendCandidateReviewCode(
    lines,
    reviewCandidateInputs,
    equilibriumResidualInputs
  );
  appendPropertyReviewCode(lines, propertyClaims);
  appendOriginalEquilibriumCode(lines, equilibrium.code);

  return lines.join("\n").trim();
}

type FormulaAssignment = {
  name: string;
  expression: string;
};

type PropertyClaimInput = {
  id: string;
  target: string;
  targetNames: string[];
  parameterName: string;
  claimedDerivative: string;
  signCondition: string;
};

function getModelSymbolNames(model: HotellingModel) {
  const names = new Set<string>();
  model.symbols.forEach((symbol) => {
    if (isPythonIdentifier(symbol.codeName)) {
      names.add(symbol.codeName);
    }
  });

  ["tau", "s", "D"].forEach((name) => names.add(name));
  return Array.from(names).sort();
}

function appendSymbolComments(lines: string[], model: HotellingModel) {
  lines.push("# 符号表与假设");
  model.symbols
    .filter((symbol) => isPythonIdentifier(symbol.codeName))
    .forEach((symbol) => {
      lines.push(
        `# ${symbol.codeName}: ${symbol.name}; assumption=${symbol.assumption}`
      );
    });
  lines.push("");
}

function appendProfitReviewCode(
  lines: string[],
  profitInputs: FormulaAssignment[],
  decisionVariablesByProfit: Record<string, string[]>
) {
  lines.push("# 1) 从模型利润函数生成原始 FOC 诊断");
  lines.push("# 说明：如果利润函数尚未代入需求份额，这里的偏导只作诊断，不直接判定候选均衡。");
  lines.push(`profit_inputs = ${toPythonTupleList(profitInputs)}`);
  lines.push("profit_functions = {}");
  lines.push("for name, expression_text in profit_inputs:");
  lines.push("    parsed = safe_parse(f'profit {name}', expression_text)");
  lines.push("    if parsed is not None:");
  lines.push("        profit_functions[name] = parsed");
  lines.push("        globals()[name] = parsed");
  lines.push(`decision_variables_by_profit = ${toPythonStringListMap(decisionVariablesByProfit)}`);
  lines.push("raw_profit_foc_residuals = []");
  lines.push("for profit_name, variable_names in decision_variables_by_profit.items():");
  lines.push("    profit_expr = profit_functions.get(profit_name)");
  lines.push("    if profit_expr is None:");
  lines.push("        continue");
  lines.push("    for variable_name in variable_names:");
  lines.push("        variable = locals_dict.get(variable_name)");
  lines.push("        if variable is None:");
  lines.push("            print(f'[manual_review] missing variable for FOC: {variable_name}')");
  lines.push("            continue");
  lines.push("        try:");
  lines.push("            foc = sp.simplify(sp.diff(profit_expr, variable))");
  lines.push("            raw_profit_foc_residuals.append(foc)");
  lines.push("            print(f'raw profit FOC {profit_name}/{variable_name} =', foc)");
  lines.push("        except Exception as exc:");
  lines.push("            print(f'[manual_review] FOC {profit_name}/{variable_name}: {exc}')");
  lines.push("");
}

function appendCandidateReviewCode(
  lines: string[],
  candidateInputs: FormulaAssignment[],
  equilibriumResidualInputs: FormulaAssignment[]
) {
  lines.push("# 2) 候选闭式解回代与独立 solve 对照");
  lines.push(`candidate_inputs = ${toPythonTupleList(candidateInputs)}`);
  lines.push("candidate_solution = {}");
  lines.push("for variable_name, expression_text in candidate_inputs:");
  lines.push("    variable = locals_dict.get(variable_name)");
  lines.push("    expression = safe_parse(f'candidate {variable_name}', expression_text)");
  lines.push("    if variable is not None and expression is not None:");
  lines.push("        candidate_solution[variable] = expression");
  lines.push(`equilibrium_residual_inputs = ${toPythonTupleList(equilibriumResidualInputs)}`);
  lines.push("equilibrium_residuals = []");
  lines.push("for label, residual_text in equilibrium_residual_inputs:");
  lines.push("    residual = safe_parse(f'equilibrium residual {label}', residual_text)");
  lines.push("    if residual is not None:");
  lines.push("        equilibrium_residuals.append(residual)");
  lines.push("foc_residuals = list(equilibrium_residuals)");
  lines.push("if not foc_residuals:");
  lines.push("    print('[manual_review] no executable equilibrium residuals; raw profit FOCs are diagnostic only')");
  lines.push("candidate_residuals = [sp.simplify(residual.subs(candidate_solution)) for residual in foc_residuals]");
  lines.push("print('candidate_solution =', candidate_solution)");
  lines.push("print('candidate_residuals =', candidate_residuals)");
  lines.push("try:");
  lines.push("    solve_variables = list(candidate_solution.keys())");
  lines.push("    independent_solutions = sp.solve(foc_residuals, solve_variables, dict=True, simplify=True)");
  lines.push("    print('independent_solutions =', independent_solutions)");
  lines.push("except Exception as exc:");
  lines.push("    print('[manual_review] independent solve skipped:', exc)");
  lines.push("");
}

function appendPropertyReviewCode(
  lines: string[],
  propertyClaims: PropertyClaimInput[]
) {
  lines.push("# 3) 性质分析偏导复核");
  lines.push(`property_claims = ${toPythonPropertyClaims(propertyClaims)}`);
  lines.push("for claim in property_claims:");
  lines.push("    parameter = locals_dict.get(claim['parameter_name'])");
  lines.push("    claimed = safe_parse(");
  lines.push("        f\"claimed derivative {claim['id']}\",");
  lines.push("        claim['claimed_derivative'],");
  lines.push("    ) if claim['claimed_derivative'] else None");
  lines.push("    reviewed = False");
  lines.push("    for target_name in claim['target_names']:");
  lines.push("        target = locals_dict.get(target_name)");
  lines.push("        expression = candidate_solution.get(target) if target is not None else None");
  lines.push("        if expression is None or parameter is None or claimed is None:");
  lines.push("            continue");
  lines.push("        derivative = sp.simplify(sp.diff(expression, parameter))");
  lines.push("        residual = sp.simplify(derivative - claimed)");
  lines.push("        print(f\"property {claim['id']} {target_name}: derivative=\", derivative, 'residual=', residual)");
  lines.push("        reviewed = True");
  lines.push("    if not reviewed:");
  lines.push("        print(f\"[manual_review] property {claim['id']} requires manual review: {claim['target']} | {claim['sign_condition']}\")");
  lines.push("");
}

function appendOriginalEquilibriumCode(lines: string[], code: string) {
  const trimmed = code.trim();
  if (!trimmed) return;

  lines.push("# 4) Agent 原始均衡代码片段");
  lines.push("original_equilibrium_code = r'''");
  lines.push(trimmed.replace(/'''/g, "\\'\\'\\'"));
  lines.push("'''");
  lines.push("print('original_equilibrium_code lines =', len(original_equilibrium_code.splitlines()))");
}

function parseFormulaAssignment(
  value: string,
  model: HotellingModel
): FormulaAssignment | null {
  const normalized = normalizeMathText(value, model);
  const [nameText, ...expressionParts] = normalized.split("=");
  if (expressionParts.length === 0) return null;

  const normalizedName = nameText.trim();
  const name = isPythonIdentifier(normalizedName)
    ? normalizedName
    : extractFirstSymbolName(normalizedName, getModelSymbolNames(model));
  const expression = expressionParts.join("=").trim();
  if (!name || !expression) return null;
  return { name, expression };
}

function extractEquilibriumResidualInputs(
  focs: string[],
  model: HotellingModel
): FormulaAssignment[] {
  return focs
    .map((foc, index) => {
      const equation = normalizeMathText(foc, model);
      const residual = equationToResidual(equation);
      if (!residual) return null;
      return {
        name: `eq_${index + 1}`,
        expression: residual,
      };
    })
    .filter((input): input is FormulaAssignment => Boolean(input));
}

function extractEquilibriumAssignmentInputs(
  focs: string[],
  model: HotellingModel
): FormulaAssignment[] {
  return focs
    .map((foc) => {
      const equation = normalizeMathText(foc, model);
      const [left, ...rightParts] = equation.split("=");
      const right = rightParts.join("=").trim();
      const name = left.trim();
      if (!isPythonIdentifier(name) || !right || /[<>]/.test(right)) {
        return null;
      }
      return {
        name,
        expression: right,
      };
    })
    .filter((input): input is FormulaAssignment => Boolean(input));
}

function addDerivedCandidateInputs(
  candidateInputs: FormulaAssignment[],
  equilibriumAssignmentInputs: FormulaAssignment[]
) {
  const derived = [...candidateInputs];
  const byName = new Map(candidateInputs.map((input) => [input.name, input]));
  const seen = new Set(candidateInputs.map((input) => input.name));

  [
    ["tau", "tau_A", "tau_B"],
    ["s", "s_A", "s_B"],
  ].forEach(([alias, leftName, rightName]) => {
    const left = byName.get(leftName);
    const right = byName.get(rightName);
    if (!left || !right || left.expression !== right.expression || seen.has(alias)) {
      return;
    }
    seen.add(alias);
    derived.push({ name: alias, expression: left.expression });
  });

  equilibriumAssignmentInputs.forEach((input) => {
    if (seen.has(input.name)) return;
    seen.add(input.name);
    derived.push(input);
  });

  return derived;
}

function equationToResidual(equation: string) {
  if (!equation || /partial|diff|solve/i.test(equation) || /[<>]/.test(equation)) {
    return "";
  }
  const [left, ...rightParts] = equation.split("=");
  const right = rightParts.join("=").trim();
  if (!left.trim() || !right) return "";
  return `(${left.trim()}) - (${right})`;
}

function buildDecisionVariablesByProfit({
  model,
  profitInputs,
}: {
  model: HotellingModel;
  profitInputs: FormulaAssignment[];
}) {
  const candidateDecisionNames = model.timing
    .flatMap((stage) => stage.decisions)
    .map((decision) => normalizeMathText(decision, model))
    .filter(isPythonIdentifier);
  model.symbols
    .filter((symbol) => symbol.role === "decision")
    .forEach((symbol) => {
      if (isPythonIdentifier(symbol.codeName)) {
        candidateDecisionNames.push(symbol.codeName);
      }
    });

  const uniqueDecisionNames = Array.from(new Set(candidateDecisionNames));
  const variablesByProfit: Record<string, string[]> = {};
  profitInputs.forEach((profit) => {
    variablesByProfit[profit.name] = uniqueDecisionNames.filter((name) =>
      expressionContainsSymbol(profit.expression, name)
    );
  });

  return variablesByProfit;
}

function extractCandidateAssignments(
  closedForm: string,
  model: HotellingModel,
  symbolNames: string[]
) {
  const assignments: FormulaAssignment[] = [];
  const seen = new Set<string>();
  const chunks = closedForm
    .replace(/\$/g, "\n")
    .split(/[，,；;。\n]/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  chunks.forEach((chunk) => {
    if (!chunk.includes("=")) return;
    const parts = chunk
      .split("=")
      .map((part) => normalizeMathText(part, model))
      .filter(Boolean);
    if (parts.length < 2) return;

    const expression = parts.at(-1)?.trim() ?? "";
    const variableNames = parts
      .slice(0, -1)
      .flatMap((part) => extractSymbolNames(part, symbolNames));

    variableNames.forEach((name) => {
      const key = `${name}|${expression}`;
      if (!expression || seen.has(key)) return;
      seen.add(key);
      assignments.push({ name, expression });
    });
  });

  return assignments;
}

function buildPropertyClaimInputs(
  analyses: PropertyAnalysis[],
  model: HotellingModel,
  candidateNames: string[]
): PropertyClaimInput[] {
  const symbolNames = getModelSymbolNames(model);

  return analyses.map((analysis, index) => {
    const normalizedTarget = normalizeMathText(analysis.target, model);
    const targetNames = expandTargetNames(
      isPythonIdentifier(normalizedTarget)
        ? [normalizedTarget]
        : extractSymbolNames(normalizedTarget, symbolNames),
      candidateNames
    );
    const parameterName =
      extractFirstSymbolName(
        normalizeMathText(analysis.parameter, model),
        symbolNames
      ) ?? "";
    const claimedDerivative =
      analysis.operation === "differentiate"
        ? extractClaimedDerivative(analysis.symbolicResult, model)
        : "";

    return {
      id: analysis.id || `analysis-${index + 1}`,
      target: analysis.target,
      targetNames,
      parameterName,
      claimedDerivative,
      signCondition: analysis.signCondition,
    };
  });
}

function expandTargetNames(targetNames: string[], candidateNames: string[]) {
  const expanded = new Set(targetNames);
  targetNames.forEach((targetName) => {
    const genericMatch = /^([A-Za-z]+)_i(?:_|$)/.exec(targetName);
    if (!genericMatch) return;
    const prefix = `${genericMatch[1]}_`;
    candidateNames
      .filter((candidateName) => candidateName.startsWith(prefix))
      .forEach((candidateName) => expanded.add(candidateName));
  });
  return Array.from(expanded).filter((name) => candidateNames.includes(name));
}

function extractClaimedDerivative(value: string, model: HotellingModel) {
  const normalized = normalizeMathText(value, model);
  if (!normalized.includes("=")) return "";
  const expression = normalized.split("=").at(-1)?.trim() ?? "";
  if (/[<>]/.test(expression)) return "";
  return expression;
}

function normalizeMathText(value: string, model: HotellingModel) {
  let normalized = value
    .replace(/\$\$/g, " ")
    .replace(/\$/g, " ")
    .replace(/\\\[/g, " ")
    .replace(/\\\]/g, " ")
    .replace(/\\\(/g, " ")
    .replace(/\\\)/g, " ")
    .replace(/\\left/g, "")
    .replace(/\\right/g, "")
    .replace(/\\cdot/g, "*")
    .replace(/\\times/g, "*")
    .replace(/\\quad/g, " ")
    .replace(/\\text\{[^{}]*\}/g, " ")
    .replace(/\\alpha/g, "alpha")
    .replace(/\\beta/g, "beta")
    .replace(/\\delta/g, "delta")
    .replace(/\\tau/g, "tau")
    .replace(/\\mu/g, "mu")
    .replace(/\\kappa/g, "kappa")
    .replace(/\\rho/g, "rho")
    .replace(/\\Pi/g, "Pi")
    .replace(/α/g, "alpha")
    .replace(/β/g, "beta")
    .replace(/δ/g, "delta")
    .replace(/τ/g, "tau")
    .replace(/μ/g, "mu")
    .replace(/\^\{([^{}]+)\*\}/g, "^$1")
    .replace(/\^\*/g, "");

  normalized = replaceLatexCommands(normalized);
  normalized = replaceKnownSymbols(normalized, model);
  normalized = insertKnownSymbolMultiplication(
    normalized,
    getModelSymbolNames(model)
  );

  return normalized
    .replace(/[{}]/g, "")
    .replace(/\^/g, "**")
    .replace(/\s+/g, " ")
    .trim();
}

function replaceLatexCommands(value: string) {
  let previous = "";
  let normalized = value;

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)")
      .replace(/\\sqrt\{([^{}]+)\}/g, "sqrt($1)");
  }

  return normalized;
}

function replaceKnownSymbols(value: string, model: HotellingModel) {
  let normalized = value;
  const replacements = model.symbols
    .flatMap((symbol) =>
      getSymbolVariants(symbol).map((variant) => ({
        variant,
        codeName: symbol.codeName,
      }))
    )
    .filter(({ variant, codeName }) => variant && variant !== codeName)
    .sort((a, b) => b.variant.length - a.variant.length);

  replacements.forEach(({ variant, codeName }) => {
    normalized = normalized.split(variant).join(codeName);
  });

  return normalized;
}

function insertKnownSymbolMultiplication(value: string, symbolNames: string[]) {
  let normalized = value;
  const names = [...symbolNames].sort((a, b) => b.length - a.length);

  names.forEach((left) => {
    names.forEach((right) => {
      if (left === right) return;
      normalized = normalized.replace(
        new RegExp(`${escapeRegExp(left)}${escapeRegExp(right)}`, "g"),
        `${left}*${right}`
      );
    });
  });

  return normalized;
}

function getSymbolVariants(symbol: SymbolDefinition) {
  const variants = new Set([symbol.symbol, symbol.codeName]);
  if (symbol.subscript && symbol.superscript) {
    variants.add(`${symbol.baseSymbol}_${symbol.subscript}^${symbol.superscript}`);
    variants.add(`${symbol.baseSymbol}_{${symbol.subscript}}^${symbol.superscript}`);
    variants.add(`${symbol.baseSymbol}_${symbol.subscript}^{${symbol.superscript}}`);
    variants.add(`${symbol.baseSymbol}_{${symbol.subscript}}^{${symbol.superscript}}`);
  } else if (symbol.subscript) {
    variants.add(`${symbol.baseSymbol}_${symbol.subscript}`);
    variants.add(`${symbol.baseSymbol}_{${symbol.subscript}}`);
  }
  return Array.from(variants).filter(Boolean);
}

function extractSymbolNames(value: string, symbolNames: string[]) {
  const tokens = value.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return tokens.filter((token) => symbolNames.includes(token));
}

function extractFirstSymbolName(value: string, symbolNames: string[]) {
  return extractSymbolNames(value, symbolNames).at(-1);
}

function expressionContainsSymbol(expression: string, symbolName: string) {
  const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(symbolName)}([^A-Za-z0-9_]|$)`);
  return pattern.test(expression);
}

function toPythonTupleList(items: FormulaAssignment[]) {
  if (items.length === 0) return "[]";
  return `[\n${items
    .map(
      (item) =>
        `    (${toPythonString(item.name)}, ${toPythonString(item.expression)}),`
    )
    .join("\n")}\n]`;
}

function toPythonStringListMap(value: Record<string, string[]>) {
  const entries = Object.entries(value);
  if (entries.length === 0) return "{}";
  return `{\n${entries
    .map(
      ([key, values]) =>
        `    ${toPythonString(key)}: [${values.map(toPythonString).join(", ")}],`
    )
    .join("\n")}\n}`;
}

function toPythonPropertyClaims(claims: PropertyClaimInput[]) {
  if (claims.length === 0) return "[]";
  return `[\n${claims
    .map(
      (claim) =>
        "    {" +
        [
          `'id': ${toPythonString(claim.id)}`,
          `'target': ${toPythonString(claim.target)}`,
          `'target_names': [${claim.targetNames.map(toPythonString).join(", ")}]`,
          `'parameter_name': ${toPythonString(claim.parameterName)}`,
          `'claimed_derivative': ${toPythonString(claim.claimedDerivative)}`,
          `'sign_condition': ${toPythonString(claim.signCondition)}`,
        ].join(", ") +
        "},"
    )
    .join("\n")}\n]`;
}

function toPythonString(value: string) {
  return JSON.stringify(value);
}

function isPythonIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
