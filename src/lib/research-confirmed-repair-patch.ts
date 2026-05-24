import type {
  HotellingModel,
  ResearchProject,
  SymbolDefinition,
} from "./types";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ConfirmedRepairAssetPatch = {
  kind: "update_model";
  summary: string;
  changes: ConfirmedRepairAssetPatchChange[];
};

type ConfirmedRepairAssetPatchChange = {
  target: string;
  op: "set" | "insert" | "remove";
  value?: JsonValue;
  reason?: string;
};

export function createConfirmedRepairProposalPatch(
  project: ResearchProject,
  userMessage: string
): ConfirmedRepairAssetPatch | null {
  const model = project.hotellingModel;
  if (!model || !isAffirmativeModelRepairRequest(userMessage)) return null;

  const proposal = findRecentAssistantModelRepairProposal(project);
  if (!proposal) return null;

  const modelFieldChanges = extractModelFieldPatchChanges(proposal, model);
  const mechanismEquations = extractMechanismEquationLines(proposal);
  const mechanismAssumptions =
    mechanismEquations.length > 0
      ? mechanismEquations
      : modelFieldChanges.length > 0
        ? []
      : extractRepairAssumptionLines(proposal);
  if (mechanismAssumptions.length === 0 && modelFieldChanges.length === 0) {
    return null;
  }

  const addedAssumptions = mechanismAssumptions.filter(
    (assumption) => !model.assumptions.includes(assumption)
  );
  const setupParagraphs =
    mechanismAssumptions.length > 0
      ? [
          "为修复上一轮均衡求解失败，先把机制函数收窄为可符号求解的函数形式：",
          ...mechanismAssumptions,
        ]
      : [
          "为修复上一轮均衡求解失败，已按确认方案统一买家补贴、平台利润和决策变量口径。",
        ];
  const nextModelSetupDraft = appendUniqueParagraphs(
    model.modelSetupDraft,
    setupParagraphs
  );
  const nextDemandDerivation =
    mechanismAssumptions.length > 0
      ? appendUniqueParagraphs(model.demandDerivation, [
          `均衡求解时需代入已确认的机制函数：${mechanismAssumptions.join("；")}。`,
        ])
      : appendUniqueParagraphs(model.demandDerivation, [
          "均衡求解时将买家补贴视为效用正项、平台利润成本项，并只对已确认的策略变量求一阶条件。",
        ]);
  const symbolValues = extractSymbolPatchValuesFromEquations(
    mechanismAssumptions,
    model.symbols
  );
  const changes: ConfirmedRepairAssetPatchChange[] = [
    ...addedAssumptions.map((assumption) => ({
      target: "hotellingModel.assumptions",
      op: "insert" as const,
      value: assumption,
      reason: "用户确认上一轮 AI 提出的模型修复设定。",
    })),
    ...symbolValues.map((symbol) => ({
      target: "hotellingModel.symbols",
      op: "insert" as const,
      value: symbol,
      reason: "补齐模型修复中新增的机制参数或函数符号。",
    })),
    ...modelFieldChanges,
  ];

  if (nextModelSetupDraft !== model.modelSetupDraft) {
    changes.push({
      target: "hotellingModel.modelSetupDraft",
      op: "set",
      value: nextModelSetupDraft,
      reason: "把已确认的修复设定写入模型摘要，避免后续求解继续缺少函数形式。",
    });
  }

  if (nextDemandDerivation !== model.demandDerivation) {
    changes.push({
      target: "hotellingModel.demandDerivation",
      op: "set",
      value: nextDemandDerivation,
      reason: "提醒后续均衡求解代入已确认的机制函数。",
    });
  }

  if (changes.length === 0) return null;

  return {
    kind: "update_model",
    summary: "应用上一轮模型修复建议",
    changes,
  };
}

function isAffirmativeModelRepairRequest(userMessage: string) {
  const text = userMessage.trim().toLowerCase();
  if (!text) return false;

  return (
    /^(确认|接受|同意|可以|行|好|好的|没问题|更新|修改|改|应用|按这个|就这样|采用|采纳)[。！!，,\s]*(吧|了)?$/.test(
      text
    ) ||
    /(确认|接受|同意|可以|更新|修改|改|应用|按这个|就这样|采用|采纳).{0,12}(改|修改|处理|写入|应用|生成|执行|做|更新)/.test(
      text
    ) ||
    /(帮我|你来|你帮我).{0,12}(处理好|改好|更新|写入|应用|做了|弄好)/.test(
      text
    )
  );
}

function findRecentAssistantModelRepairProposal(
  project: ResearchProject
): string | null {
  const messages = project.researchSession?.messages ?? [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;

    const content = message.content.trim();
    if (!content) continue;

    const asksForConfirmation =
      /(确认|接受|同意|采纳|是否|如果你|若你)[\s\S]{0,80}(修改|设定|方案|写入|模型|函数|应用|接受|确认)/.test(
        content
      );
    const hasConcreteRepair =
      /(\\psi|ψ|\\phi|φ|C_i|成本函数|机制函数|具体化|函数形式|不可求解|求解失败|修复|均衡失败|模型设定)/i.test(
        content
      ) || /(效用|利润函数|补贴|收费|价格项|决策变量)[\s\S]{0,120}(改|替换|删除|保留)/.test(content);

    if (asksForConfirmation && hasConcreteRepair) return content;
  }

  return null;
}

function extractMechanismEquationLines(text: string) {
  const lines = text
    .split(/\r?\n/)
    .flatMap((line) => line.split(/[；;]/))
    .map((line) =>
      line
        .replace(/^[\s>*\-+•·\d.、）)]+/, "")
        .replace(/\*\*/g, "")
        .replace(/^`|`$/g, "")
        .replace(/\.$/, "")
        .trim()
    )
    .filter(Boolean);
  const equations: string[] = [];

  for (const line of lines) {
    const normalized = line
      .replace(/：/g, ":")
      .replace(/\s+/g, " ")
      .replace(/^设定\s*[:：]?\s*/, "")
      .trim();
    const equationMatch = normalized.match(
      /((?:\\psi|ψ|\\phi|φ|C)_?i?\s*\([^=]{1,40}\)\s*=\s*[^，。,；;\n]+)/i
    );
    if (equationMatch) {
      equations.push(normalizeRepairEquation(equationMatch[1]));
    }
  }

  return uniqueStrings(equations);
}

function extractRepairAssumptionLines(text: string) {
  const candidates = text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^[\s>*\-+•·\d.、）)]+/, "")
        .replace(/\*\*/g, "")
        .trim()
    )
    .filter((line) => /=/.test(line))
    .filter((line) =>
      /(函数|成本|效用|需求|假设|设定|\\psi|ψ|\\phi|φ|C_i)/i.test(line)
    )
    .map((line) => line.replace(/[。；;]\s*$/, ""));

  return uniqueStrings(candidates).slice(0, 6);
}

function extractModelFieldPatchChanges(
  text: string,
  model: HotellingModel
): ConfirmedRepairAssetPatchChange[] {
  const changes: ConfirmedRepairAssetPatchChange[] = [];
  const mentionsBuyerSubsidy =
    /买家效用|消费者效用|用户效用/.test(text) &&
    /(\+|正|补贴项?)\s*s_A|s_A\s*(?:作为|为)?补贴|补贴.*s_A/.test(text);
  const mentionsBuyerProfitCost =
    /利润函数/.test(text) &&
    /(-|成本|扣除|补贴成本)\s*s_A|s_A\s*n_A\^B|s_A\s*n_A/.test(text);

  if (mentionsBuyerSubsidy) {
    for (const utility of model.utilityFunctions) {
      if (utility.side !== "consumer") continue;
      const nextExpression = ensureBuyerSubsidyInUtility(
        utility.expression,
        utility.platform
      );
      if (nextExpression === utility.expression) continue;

      changes.push({
        target: `hotellingModel.utilityFunctions[${utility.id}].expression`,
        op: "set",
        value: nextExpression,
        reason: "上一轮修复建议要求把买家补贴作为效用中的正项写入。",
      });
    }
  }

  if (mentionsBuyerProfitCost) {
    for (const profit of model.profitFunctions) {
      const nextExpression = ensureBuyerSubsidyCostInProfit(
        profit.expression,
        profit.platform
      );
      if (nextExpression === profit.expression) continue;

      changes.push({
        target: `hotellingModel.profitFunctions[${profit.id}].expression`,
        op: "set",
        value: nextExpression,
        reason: "上一轮修复建议要求把买家补贴写成平台利润中的成本项。",
      });
    }
  }

  if (/(删除|去掉|移除)[\s\S]{0,40}(p_A|p_B|p_i|价格|买家价格)/.test(text)) {
    for (const selector of ["p_A", "p_B", "p_i"]) {
      changes.push({
        target: `hotellingModel.symbols[${selector}]`,
        op: "remove",
        reason: "上一轮修复建议要求删除不再作为决策变量的买家价格符号。",
      });
    }
  }

  return changes;
}

function ensureBuyerSubsidyInUtility(expression: string, platform: string) {
  const subsidy = platform.toUpperCase() === "B" ? "s_B" : "s_A";
  if (expression.includes(subsidy)) return expression;

  return expression.replace(
    /\s-\s*p(?:_?[AB])?\b/,
    ` + ${subsidy}`
  );
}

function ensureBuyerSubsidyCostInProfit(expression: string, platform: string) {
  const normalizedPlatform = platform.toUpperCase() === "B" ? "B" : "A";
  const subsidy = normalizedPlatform === "B" ? "s_B" : "s_A";
  const buyerDemand =
    normalizedPlatform === "B" ? "n_B^B" : "n_A^B";
  const buyerPrice = normalizedPlatform === "B" ? "p_B" : "p_A";
  const priceRevenuePattern = new RegExp(
    `\\b${escapeRegExp(buyerPrice)}\\s*${escapeRegExp(buyerDemand)}\\b`,
    "g"
  );
  const withoutBuyerPrice = expression
    .replace(priceRevenuePattern, `- ${subsidy} ${buyerDemand}`)
    .replace(/\+\s*-\s*/g, "- ");
  if (withoutBuyerPrice !== expression) return withoutBuyerPrice;

  if (expression.includes(`-${subsidy}`) || expression.includes(`- ${subsidy}`)) {
    return expression;
  }

  return `${expression} - ${subsidy} ${buyerDemand}`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRepairEquation(value: string) {
  return value
    .replace(/ψ/g, "\\psi")
    .replace(/φ/g, "\\phi")
    .replace(/\s*=\s*/g, " = ")
    .replace(/\s+/g, " ")
    .trim();
}

function appendUniqueParagraphs(base: string, paragraphs: string[]) {
  const additions = paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !base.includes(paragraph));
  if (additions.length === 0) return base;

  return [base.trim(), ...additions].filter(Boolean).join("\n\n");
}

function extractSymbolPatchValuesFromEquations(
  equations: string[],
  existingSymbols: SymbolDefinition[]
): JsonValue[] {
  const existingCodeNames = new Set(
    existingSymbols.map((symbol) => symbol.codeName)
  );
  const symbols: JsonValue[] = [];

  for (const equation of equations) {
    for (const notation of extractRepairNotations(equation)) {
      const parsed = parseSimpleNotation(notation);
      const codeName = [parsed.baseSymbol, parsed.subscript, parsed.superscript]
        .filter(Boolean)
        .join("_")
        .replace(/\\/g, "")
        .replace(/[^A-Za-z0-9_]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");

      if (!codeName || existingCodeNames.has(codeName)) continue;
      existingCodeNames.add(codeName);
      symbols.push({
        symbol: formatSimpleNotation(parsed),
        baseSymbol: parsed.baseSymbol,
        subscript: parsed.subscript,
        superscript: parsed.superscript,
        codeName,
        name: formatSimpleNotation(parsed),
        meaning: inferRepairSymbolMeaning(formatSimpleNotation(parsed)),
        role: inferRepairSymbolRole(formatSimpleNotation(parsed)),
        side: "global",
        assumption: "nonnegative",
        recommended: false,
      });
    }
  }

  return symbols;
}

function extractRepairNotations(equation: string) {
  const withoutFunctions = equation.replace(
    /(?:\\psi|\\phi|C)_?i?\s*\([^)]*\)/gi,
    " "
  );
  const matches =
    withoutFunctions.match(
      /\\?[A-Za-z]+(?:_\{?[A-Za-z0-9]+\}?|\^[A-Za-z0-9]+)*/g
    ) ?? [];

  return uniqueStrings(
    matches
      .map((match) => match.replace(/[{}]/g, "").trim())
      .map((match) => match.replace(/\^\d+$/, ""))
      .filter((match) => !["frac", "partial", "left", "right"].includes(match))
      .filter((match) => !/^[A-Z]$/.test(match))
  );
}

function inferRepairSymbolMeaning(symbol: string) {
  if (/^k_?B$/i.test(symbol)) return "买家侧机制函数的线性强度参数。";
  if (/^k_?S$/i.test(symbol)) return "卖家侧机制函数的线性强度参数。";
  if (/^c$/i.test(symbol)) return "垂直化投入或机制成本函数的凸性成本参数。";
  return "上一轮模型修复建议中引入的机制参数。";
}

function inferRepairSymbolRole(symbol: string) {
  if (/^a_?/i.test(symbol)) return "decision";
  return /^c$/i.test(symbol) ? "cost" : "parameter";
}

function parseSimpleNotation(notation: string) {
  const cleaned = notation.trim();
  const match = cleaned.match(/^(.+?)(?:_\{?([^}^{]+)\}?)?(?:\^\{?([^}^{]+)\}?)?$/);
  return {
    baseSymbol: match?.[1]?.trim() || cleaned || "x",
    subscript: match?.[2]?.trim() ?? "",
    superscript: match?.[3]?.trim() ?? "",
  };
}

function formatSimpleNotation({
  baseSymbol,
  subscript,
  superscript,
}: {
  baseSymbol: string;
  subscript?: string;
  superscript?: string;
}) {
  return `${baseSymbol}${subscript ? `_${subscript}` : ""}${
    superscript ? `^${superscript}` : ""
  }`;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
