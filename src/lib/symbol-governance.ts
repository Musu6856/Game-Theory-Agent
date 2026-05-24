import type { HotellingModel, SymbolDefinition, SymbolRole, SymbolSide } from "./types";

export type SymbolGovernanceIssueSeverity = "warning" | "error";

export interface SymbolGovernanceIssue {
  severity: SymbolGovernanceIssueSeverity;
  code:
    | "missing_symbols"
    | "missing_core_symbol"
    | "duplicate_symbol"
    | "missing_name"
    | "missing_meaning"
    | "missing_assumption"
    | "no_recommended_symbol";
  message: string;
  symbolId?: string;
  symbol?: string;
}

type SymbolSeed = Omit<SymbolDefinition, "id">;
type SymbolNotationParts = Pick<
  SymbolDefinition,
  "baseSymbol" | "subscript" | "superscript"
>;
type NormalizedSymbolInput = SymbolNotationParts &
  Pick<SymbolDefinition, "symbol" | "codeName">;

export interface SymbolRegistryDisplayItem {
  symbol: SymbolDefinition;
  issueCount: number;
  originalIndex: number;
}

export interface SymbolRegistryDisplayGroup {
  role: SymbolRole;
  label: string;
  count: number;
  issueCount: number;
  symbols: SymbolRegistryDisplayItem[];
}

export interface SymbolRegistryDisplaySummary {
  groups: SymbolRegistryDisplayGroup[];
  totals: {
    total: number;
    recommended: number;
    issueCount: number;
  };
  issues: SymbolGovernanceIssue[];
}

export const SYMBOL_ROLE_DISPLAY_ORDER: SymbolRole[] = [
  "decision",
  "demand",
  "utility",
  "parameter",
  "cost",
  "derived",
];

const SYMBOL_SIDE_DISPLAY_ORDER: SymbolSide[] = [
  "platform",
  "consumer",
  "merchant",
  "both",
  "global",
];

const SYMBOL_ROLE_LABELS: Record<SymbolRole, string> = {
  decision: "决策变量",
  demand: "需求与份额",
  utility: "效用项",
  parameter: "参数",
  cost: "成本",
  derived: "派生项",
};

export function getSymbolRoleLabel(role: SymbolRole) {
  return SYMBOL_ROLE_LABELS[role];
}

const CORE_HOTELLING_SYMBOLS: SymbolSeed[] = [
  {
    symbol: "n_A^B",
    baseSymbol: "n",
    subscript: "A",
    superscript: "B",
    codeName: "n_A_B",
    name: "A 平台买家份额",
    meaning: "选择平台 A 的买家数量、需求份额或质量份额。",
    role: "demand",
    side: "consumer",
    assumption: "nonnegative",
    recommended: true,
  },
  {
    symbol: "n_B^B",
    baseSymbol: "n",
    subscript: "B",
    superscript: "B",
    codeName: "n_B_B",
    name: "B 平台买家份额",
    meaning: "选择平台 B 的买家数量、需求份额或质量份额。",
    role: "demand",
    side: "consumer",
    assumption: "nonnegative",
    recommended: true,
  },
  {
    symbol: "n_A^S",
    baseSymbol: "n",
    subscript: "A",
    superscript: "S",
    codeName: "n_A_S",
    name: "A 平台卖家份额",
    meaning: "选择平台 A 的卖家数量、需求份额或质量份额。",
    role: "demand",
    side: "merchant",
    assumption: "nonnegative",
    recommended: true,
  },
  {
    symbol: "n_B^S",
    baseSymbol: "n",
    subscript: "B",
    superscript: "S",
    codeName: "n_B_S",
    name: "B 平台卖家份额",
    meaning: "选择平台 B 的卖家数量、需求份额或质量份额。",
    role: "demand",
    side: "merchant",
    assumption: "nonnegative",
    recommended: true,
  },
  {
    symbol: "tau_A",
    baseSymbol: "tau",
    subscript: "A",
    codeName: "tau_A",
    name: "A 平台卖家佣金率",
    meaning: "平台 A 对成交额 q 收取的佣金比例。",
    role: "parameter",
    side: "platform",
    assumption: "positive",
    recommended: true,
  },
  {
    symbol: "tau_B",
    baseSymbol: "tau",
    subscript: "B",
    codeName: "tau_B",
    name: "B 平台卖家佣金率",
    meaning: "平台 B 对成交额 q 收取的佣金比例。",
    role: "parameter",
    side: "platform",
    assumption: "positive",
    recommended: true,
  },
  {
    symbol: "s_A",
    baseSymbol: "s",
    subscript: "A",
    codeName: "s_A",
    name: "A 平台买家补贴率",
    meaning: "平台 A 对买家参与支付的补贴强度。",
    role: "parameter",
    side: "platform",
    assumption: "nonnegative",
    recommended: true,
  },
  {
    symbol: "s_B",
    baseSymbol: "s",
    subscript: "B",
    codeName: "s_B",
    name: "B 平台买家补贴率",
    meaning: "平台 B 对买家参与支付的补贴强度。",
    role: "parameter",
    side: "platform",
    assumption: "nonnegative",
    recommended: true,
  },
  {
    symbol: "p",
    baseSymbol: "p",
    codeName: "p",
    name: "买家价格",
    meaning: "买家侧的一般化价格或支付项。",
    role: "parameter",
    side: "global",
    assumption: "positive",
    recommended: true,
  },
  {
    symbol: "q",
    baseSymbol: "q",
    codeName: "q",
    name: "成交价值",
    meaning: "单位成交额、交易价值或佣金计费基数。",
    role: "parameter",
    side: "global",
    assumption: "positive",
    recommended: true,
  },
  {
    symbol: "x",
    baseSymbol: "x",
    codeName: "x",
    name: "买家位置",
    meaning: "买家在 Hotelling 线段上的位置或选择分布。",
    role: "decision",
    side: "consumer",
    assumption: "in_[0,1]",
    recommended: true,
  },
  {
    symbol: "y",
    baseSymbol: "y",
    codeName: "y",
    name: "卖家位置",
    meaning: "卖家在 Hotelling 线段上的位置或选择分布。",
    role: "decision",
    side: "merchant",
    assumption: "in_[0,1]",
    recommended: true,
  },
  {
    symbol: "t_B",
    baseSymbol: "t",
    subscript: "B",
    codeName: "t_B",
    name: "买家差异化成本",
    meaning: "买家侧的运输成本、错配成本或差异化强度。",
    role: "parameter",
    side: "consumer",
    assumption: "positive",
    recommended: true,
  },
  {
    symbol: "t_S",
    baseSymbol: "t",
    subscript: "S",
    codeName: "t_S",
    name: "卖家差异化成本",
    meaning: "卖家侧的运输成本、错配成本或差异化强度。",
    role: "parameter",
    side: "merchant",
    assumption: "positive",
    recommended: true,
  },
  {
    symbol: "alpha_B",
    baseSymbol: "alpha",
    subscript: "B",
    codeName: "alpha_B",
    name: "买家侧网络外部性",
    meaning: "卖家参与对买家效用的跨边网络外部性强度。",
    role: "parameter",
    side: "consumer",
    assumption: "nonnegative",
    recommended: true,
  },
  {
    symbol: "alpha_S",
    baseSymbol: "alpha",
    subscript: "S",
    codeName: "alpha_S",
    name: "卖家侧网络外部性",
    meaning: "买家参与对卖家效用的跨边网络外部性强度。",
    role: "parameter",
    side: "merchant",
    assumption: "nonnegative",
    recommended: true,
  },
  {
    symbol: "v_B",
    baseSymbol: "v",
    subscript: "B",
    codeName: "v_B",
    name: "买家基准效用",
    meaning: "买家侧的基准估值或公共价值项。",
    role: "utility",
    side: "consumer",
    assumption: "real",
    recommended: true,
  },
  {
    symbol: "v_S",
    baseSymbol: "v",
    subscript: "S",
    codeName: "v_S",
    name: "卖家基准效用",
    meaning: "卖家侧的基准估值或公共价值项。",
    role: "utility",
    side: "merchant",
    assumption: "real",
    recommended: true,
  },
];

export function createHotellingSymbolSeed(): SymbolDefinition[] {
  return CORE_HOTELLING_SYMBOLS.map((seed) => materializeSymbol(seed));
}

export function createSymbolDraft(
  overrides: Partial<SymbolDefinition> = {}
): SymbolDefinition {
  return materializeSymbol({
    id: createSymbolId(),
    symbol: "x_i",
    baseSymbol: "x",
    subscript: "i",
    superscript: "",
    codeName: "x_i",
    name: "新符号",
    meaning: "",
    role: "parameter",
    side: "global",
    assumption: "real",
    recommended: false,
    ...overrides,
  });
}

export function createSymbolDraftForRole(role: SymbolRole): SymbolDefinition {
  return createSymbolDraft({
    role,
    side: getDefaultSymbolSideForRole(role),
  });
}

function getDefaultSymbolSideForRole(role: SymbolRole): SymbolSide {
  switch (role) {
    case "parameter":
    case "cost":
      return "platform";
    case "derived":
      return "global";
    case "decision":
    case "demand":
    case "utility":
      return "consumer";
  }
}

export function normalizeSymbolRegistry(value: unknown): SymbolDefinition[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => normalizeSymbolDefinition(entry, index))
    .filter((symbol): symbol is SymbolDefinition => Boolean(symbol));
}

export function normalizeSymbolDefinition(
  value: unknown,
  fallbackIndex = 0
): SymbolDefinition | null {
  if (typeof value === "string") {
    return normalizeLegacySymbolDefinition(value, fallbackIndex);
  }

  if (!isRecord(value)) return null;

  const input = normalizeRecordSymbolInput(value);
  if (!input) return null;

  const canonical = findCanonicalHotellingSymbol(input);
  if (canonical) {
    return materializeSymbol({
      ...canonical,
      id: resolveSymbolId(value.id, fallbackIndex, canonical.codeName),
      name: parseOptionalText(value.name) ?? canonical.name,
      meaning: parseOptionalText(value.meaning) ?? canonical.meaning,
      role: parseRole(value.role) ?? canonical.role,
      side: parseSide(value.side) ?? canonical.side,
      assumption: parseOptionalText(value.assumption) ?? canonical.assumption,
      recommended: canonical.recommended || value.recommended === true,
    });
  }

  const inferred = inferSymbolMetadata({
    ...input,
    name: parseOptionalText(value.name),
    meaning: parseOptionalText(value.meaning),
  });

  return materializeSymbol({
    id: resolveSymbolId(value.id, fallbackIndex),
    symbol: input.symbol,
    baseSymbol: input.baseSymbol,
    subscript: input.subscript,
    superscript: input.superscript,
    codeName: input.codeName,
    name: parseOptionalText(value.name) ?? inferred.name,
    meaning: parseOptionalText(value.meaning) ?? "",
    role: parseRole(value.role) ?? inferred.role,
    side: parseSide(value.side) ?? inferred.side,
    assumption: parseOptionalText(value.assumption) ?? inferred.assumption,
    recommended: value.recommended === true || inferred.recommended,
  });
}

export function groupSymbolRegistryForDisplay(
  value: unknown
): SymbolRegistryDisplaySummary {
  const symbols = normalizeSymbolRegistry(value);
  const issues = validateSymbolGovernance({ symbols });
  const issueCountBySymbolId = new Map<string, number>();

  for (const issue of issues) {
    if (!issue.symbolId) continue;
    issueCountBySymbolId.set(
      issue.symbolId,
      (issueCountBySymbolId.get(issue.symbolId) ?? 0) + 1
    );
  }

  const grouped = new Map<SymbolRole, SymbolRegistryDisplayItem[]>();

  symbols.forEach((symbol, originalIndex) => {
    const item: SymbolRegistryDisplayItem = {
      symbol,
      issueCount: issueCountBySymbolId.get(symbol.id) ?? 0,
      originalIndex,
    };

    grouped.set(symbol.role, [...(grouped.get(symbol.role) ?? []), item]);
  });

  const groups = SYMBOL_ROLE_DISPLAY_ORDER.map((role) => {
    const roleSymbols = grouped.get(role) ?? [];
    const sortedSymbols = [...roleSymbols].sort(compareDisplaySymbols);

    return {
      role,
      label: SYMBOL_ROLE_LABELS[role],
      count: sortedSymbols.length,
      issueCount: sortedSymbols.reduce(
        (total, item) => total + item.issueCount,
        0
      ),
      symbols: sortedSymbols,
    };
  });

  return {
    groups,
    totals: {
      total: symbols.length,
      recommended: symbols.filter((symbol) => symbol.recommended).length,
      issueCount: issues.length,
    },
    issues,
  };
}

function normalizeLegacySymbolDefinition(
  value: string,
  fallbackIndex: number
): SymbolDefinition | null {
  const text = parseText(value);
  if (!text) return null;

  const [rawSymbol, ...meaningParts] = text.split(/[:：]/);
  const notation = parseNotationParts(rawSymbol || text);
  const symbol = formatSymbolNotation(notation);
  const meaning = meaningParts.join(":").trim();
  const codeName = buildCodeName(notation) || notation.baseSymbol || symbol;
  const canonical = findCanonicalHotellingSymbol({
    symbol,
    baseSymbol: notation.baseSymbol,
    subscript: notation.subscript,
    superscript: notation.superscript,
    codeName,
  });

  if (canonical) {
    return materializeSymbol({
      ...canonical,
      id: resolveSymbolId(undefined, fallbackIndex, canonical.codeName),
      meaning: meaning || canonical.meaning,
    });
  }

  const inferred = inferSymbolMetadata({
    symbol,
    baseSymbol: notation.baseSymbol,
    subscript: notation.subscript,
    superscript: notation.superscript,
    codeName,
    meaning,
  });

  return materializeSymbol({
    id: resolveSymbolId(undefined, fallbackIndex, codeName),
    symbol,
    baseSymbol: notation.baseSymbol,
    subscript: notation.subscript,
    superscript: notation.superscript,
    codeName,
    name: inferred.name,
    meaning,
    role: inferred.role,
    side: inferred.side,
    assumption: inferred.assumption,
    recommended: inferred.recommended,
  });
}

function normalizeRecordSymbolInput(
  value: Record<string, unknown>
): NormalizedSymbolInput | null {
  const symbolText = parseNotationText(value.symbol);
  const codeNameText = parseNotationText(value.codeName);
  const baseText = parseNotationText(value.baseSymbol);
  const subscriptText = parseOptionalNotationText(value.subscript);
  const superscriptText = parseOptionalNotationText(value.superscript);
  const notationSource = symbolText ?? codeNameText ?? baseText;

  if (!notationSource) return null;

  const parsed = parseNotationParts(notationSource);
  const baseSymbol = baseText ?? parsed.baseSymbol;
  const subscript = subscriptText ?? parsed.subscript;
  const superscript = superscriptText ?? parsed.superscript;
  const symbol =
    symbolText ??
    formatSymbolNotation({
      baseSymbol,
      subscript,
      superscript,
    });
  const codeName =
    codeNameText ??
    buildCodeName({
      baseSymbol,
      subscript,
      superscript,
    }) ??
    symbol;

  return {
    symbol,
    baseSymbol,
    ...(subscript ? { subscript } : {}),
    ...(superscript ? { superscript } : {}),
    codeName,
  };
}

function findCanonicalHotellingSymbol(
  input: NormalizedSymbolInput
): SymbolSeed | undefined {
  const inputKeys = buildSymbolLookupKeys(input);

  return CORE_HOTELLING_SYMBOLS.find((seed) =>
    Array.from(buildSymbolLookupKeys(seed)).some((key) => inputKeys.has(key))
  );
}

function buildSymbolLookupKeys(
  input: Partial<NormalizedSymbolInput>
): Set<string> {
  const keys = new Set<string>();
  const add = (value: unknown) => {
    const key = normalizeLookupKey(value);
    if (key) keys.add(key);
  };

  add(input.symbol);
  add(input.codeName);

  if (input.baseSymbol) {
    add(formatSymbolNotation(input as SymbolNotationParts));
    add(buildCodeName(input as SymbolNotationParts));
  }

  return keys;
}

function inferSymbolMetadata(
  input: NormalizedSymbolInput & { name?: string; meaning?: string }
): Pick<
  SymbolSeed,
  "name" | "meaning" | "role" | "side" | "assumption" | "recommended"
> {
  const text = [
    input.symbol,
    input.codeName,
    input.name ?? "",
    input.meaning ?? "",
  ].join(" ");
  const role = inferSymbolRole(text, input);
  const side = inferSymbolSide(text, input);

  return {
    name: input.name ?? inferSymbolName(text, input, side),
    meaning: input.meaning ?? "",
    role,
    side,
    assumption: inferSymbolAssumption(text, role),
    recommended: false,
  };
}

function inferSymbolRole(
  text: string,
  input: SymbolNotationParts
): SymbolRole {
  if (/(需求|份额|市场份额|数量|占比|demand|share)/i.test(text)) {
    return "demand";
  }
  if (/(效用|utility)/i.test(text)) return "utility";
  if (/(利润|阈值|导出|均衡|derived)/i.test(text)) return "derived";
  if (
    /(位置|坐标|选址|选择|location|choice)/i.test(text) ||
    input.baseSymbol === "x" ||
    input.baseSymbol === "y"
  ) {
    return "decision";
  }
  if (
    /(成本|价格|佣金|补贴|费率|参数|外部性|质量|价值|估值|cost|price|commission|subsidy|parameter)/i.test(
      text
    )
  ) {
    return "parameter";
  }
  return "parameter";
}

function inferSymbolSide(
  text: string,
  input: SymbolNotationParts
): SymbolSide {
  const consumer =
    /(消费者|买家|用户|consumer|buyer)/i.test(text) ||
    input.subscript === "B" ||
    input.superscript === "B";
  const merchant =
    /(卖家|商家|merchant|seller)/i.test(text) ||
    input.subscript === "S" ||
    input.superscript === "S";

  if (consumer && merchant) return "both";
  if (consumer) return "consumer";
  if (merchant) return "merchant";
  if (/(平台|platform|佣金|补贴)/i.test(text)) return "platform";
  return "global";
}

function inferSymbolAssumption(text: string, role: SymbolRole) {
  if (/\[0,\s*1\]|0\s*到\s*1|0\s*和\s*1|位置|比例|概率|占比|份额|share/i.test(text)) {
    return "in_[0,1]";
  }
  if (/(数量|需求|市场规模|补贴|外部性|非负|nonnegative)/i.test(text)) {
    return "nonnegative";
  }
  if (/(成本|价格|佣金|费率|质量|价值|参数|正|positive)/i.test(text)) {
    return "positive";
  }
  if (role === "utility" || role === "derived") return "real";
  return "real";
}

function inferSymbolName(
  text: string,
  input: NormalizedSymbolInput,
  side: SymbolSide
) {
  const sideLabel =
    side === "consumer"
      ? "买家"
      : side === "merchant"
        ? "卖家"
        : side === "platform"
          ? "平台"
          : "";

  if (/(位置|坐标|选址|location)/i.test(text)) {
    return `${sideLabel || ""}位置`;
  }
  if (/(需求|份额|市场份额|数量|占比|demand|share)/i.test(text)) {
    return `${sideLabel || ""}份额`;
  }
  if (/(交通成本|运输成本|差异化成本|错配成本)/i.test(text)) {
    return `${sideLabel || ""}差异化成本`;
  }
  if (/(佣金|commission)/i.test(text)) return `${sideLabel || ""}佣金率`;
  if (/(补贴|subsidy)/i.test(text)) return `${sideLabel || ""}补贴率`;
  if (/(价格|price)/i.test(text)) return `${sideLabel || ""}价格`;
  if (/(效用|utility)/i.test(text)) return `${sideLabel || ""}效用`;
  if (/(外部性|network)/i.test(text)) return `${sideLabel || ""}网络外部性`;

  return input.symbol;
}

function compareDisplaySymbols(
  left: SymbolRegistryDisplayItem,
  right: SymbolRegistryDisplayItem
) {
  const issueDelta = Number(right.issueCount > 0) - Number(left.issueCount > 0);
  if (issueDelta !== 0) return issueDelta;

  const recommendedDelta =
    Number(right.symbol.recommended) - Number(left.symbol.recommended);
  if (recommendedDelta !== 0) return recommendedDelta;

  const sideDelta =
    SYMBOL_SIDE_DISPLAY_ORDER.indexOf(left.symbol.side) -
    SYMBOL_SIDE_DISPLAY_ORDER.indexOf(right.symbol.side);
  if (sideDelta !== 0) return sideDelta;

  return left.originalIndex - right.originalIndex;
}

export function mergeSymbolRegistries(
  primary: SymbolDefinition[],
  secondary: SymbolDefinition[]
): SymbolDefinition[] {
  const seen = new Set<string>();
  const merged: SymbolDefinition[] = [];

  for (const symbol of [
    ...normalizeSymbolRegistry(primary),
    ...normalizeSymbolRegistry(secondary),
  ]) {
    const identity = getSymbolIdentity(symbol);
    if (seen.has(identity)) continue;
    seen.add(identity);
    merged.push(symbol);
  }

  return merged;
}

export function formatSymbolRegistryForPrompt(
  symbols: SymbolDefinition[]
): string {
  if (symbols.length === 0) {
    return "当前尚未定义符号表。";
  }

  return symbols
    .map(
      (symbol, index) =>
        `${index + 1}. ${symbol.symbol} | code=${symbol.codeName} | name=${
          symbol.name || "未命名"
        } | meaning=${symbol.meaning || "未说明"} | role=${symbol.role} | side=${
          symbol.side
        } | assumption=${symbol.assumption || "未说明"} | recommended=${
          symbol.recommended ? "yes" : "no"
        }`
    )
    .join("\n");
}

export function validateSymbolGovernance(
  model?: Pick<HotellingModel, "symbols">
): SymbolGovernanceIssue[] {
  const symbols = normalizeSymbolRegistry(model?.symbols ?? []);
  const issues: SymbolGovernanceIssue[] = [];

  if (symbols.length === 0) {
    issues.push({
      severity: "warning",
      code: "missing_symbols",
      message: "当前模型还没有符号表。",
    });
    return issues;
  }

  const byIdentity = new Map<string, SymbolDefinition>();
  for (const symbol of symbols) {
    const identity = getSymbolIdentity(symbol);
    const duplicate = byIdentity.get(identity);
    if (duplicate) {
      issues.push({
        severity: "warning",
        code: "duplicate_symbol",
        message: `${symbol.symbol || symbol.codeName} 与 ${duplicate.symbol || duplicate.codeName} 重复。`,
        symbolId: symbol.id,
        symbol: symbol.symbol,
      });
      continue;
    }

    byIdentity.set(identity, symbol);

    if (!symbol.name.trim()) {
      issues.push({
        severity: "warning",
        code: "missing_name",
        message: `${symbol.symbol || symbol.codeName} 还没有名称。`,
        symbolId: symbol.id,
        symbol: symbol.symbol,
      });
    }

    if (!symbol.meaning.trim()) {
      issues.push({
        severity: "warning",
        code: "missing_meaning",
        message: `${symbol.symbol || symbol.codeName} 还没有含义说明。`,
        symbolId: symbol.id,
        symbol: symbol.symbol,
      });
    }

    if (!symbol.assumption.trim()) {
      issues.push({
        severity: "warning",
        code: "missing_assumption",
        message: `${symbol.symbol || symbol.codeName} 还没有取值假设。`,
        symbolId: symbol.id,
        symbol: symbol.symbol,
      });
    }
  }

  if (!symbols.some((symbol) => symbol.recommended)) {
    issues.push({
      severity: "warning",
      code: "no_recommended_symbol",
      message: "当前符号表里没有推荐符号。",
    });
  }

  for (const required of CORE_HOTELLING_SYMBOLS) {
    const hasRequired = symbols.some(
      (symbol) =>
        symbol.codeName === required.codeName ||
        getSymbolIdentity(symbol) === getSymbolIdentity(materializeSymbol(required))
    );

    if (!hasRequired) {
      issues.push({
        severity: "warning",
        code: "missing_core_symbol",
        message: `符号表缺少核心符号 ${required.symbol}。`,
        symbol: required.symbol,
      });
    }
  }

  return issues;
}

function materializeSymbol(seed: SymbolSeed & { id?: string }): SymbolDefinition {
  const baseSymbol = normalizeNotationText(seed.baseSymbol) || "x";
  const subscript = parseOptionalNotationText(seed.subscript);
  const superscript = parseOptionalNotationText(seed.superscript);
  const symbol = normalizeNotationText(seed.symbol) || formatSymbolNotation({
    baseSymbol,
    subscript,
    superscript,
  });
  const codeName = normalizeNotationText(seed.codeName) || buildCodeName({
    baseSymbol,
    subscript,
    superscript,
  }) || symbol;

  return {
    id: resolveSymbolId(seed.id, 0, codeName || symbol || baseSymbol),
    symbol,
    baseSymbol,
    ...(subscript ? { subscript } : {}),
    ...(superscript ? { superscript } : {}),
    codeName,
    name: seed.name.trim(),
    meaning: seed.meaning.trim(),
    role: seed.role,
    side: seed.side,
    assumption: seed.assumption.trim(),
    recommended: seed.recommended,
  };
}

function formatSymbolNotation(
  symbol: Pick<SymbolDefinition, "baseSymbol" | "subscript" | "superscript">
) {
  const base = parseText(symbol.baseSymbol) || "x";
  const subscript = parseText(symbol.subscript);
  const superscript = parseText(symbol.superscript);

  return `${base}${subscript ? `_${subscript}` : ""}${
    superscript ? `^${superscript}` : ""
  }`;
}

function buildCodeName(
  symbol: Pick<SymbolDefinition, "baseSymbol" | "subscript" | "superscript">
) {
  return [symbol.baseSymbol, symbol.subscript, symbol.superscript]
    .map((part) => parseText(part))
    .filter(Boolean)
    .join("_")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseNotationParts(value: unknown): Pick<
  SymbolDefinition,
  "baseSymbol" | "subscript" | "superscript"
> {
  const cleaned = normalizeNotationText(value);
  if (!cleaned) return { baseSymbol: "x" };

  const match = cleaned.match(
    /^(.+?)(?:_\{?([^}^{]+)\}?)?(?:\^\{?([^}^{]+)\}?)?$/
  );
  const baseSymbol = normalizeNotationText(match?.[1] ?? cleaned) || "x";
  const subscript = normalizeNotationText(match?.[2] ?? "");
  const superscript = normalizeNotationText(match?.[3] ?? "");

  return {
    baseSymbol,
    ...(subscript ? { subscript } : {}),
    ...(superscript ? { superscript } : {}),
  };
}

function getSymbolIdentity(symbol: SymbolDefinition) {
  const codeName = parseText(symbol.codeName) || "symbol";
  return `${codeName.toLowerCase()}::${formatSymbolNotation(symbol).toLowerCase()}`;
}

function createSymbolId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `symbol-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildIdSeed(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function resolveSymbolId(
  value: unknown,
  fallbackIndex: number,
  fallbackSeed = ""
): string {
  const text = parseOptionalText(value);
  const seed = buildIdSeed(fallbackSeed);
  return text || `symbol-${fallbackIndex}${seed ? `-${seed}` : ""}`;
}

function parseText(value: unknown): string {
  return parseOptionalText(value) ?? "";
}

function parseOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseNotationText(value: unknown): string | undefined {
  const text = parseOptionalText(value);
  return text ? normalizeNotationText(text) : undefined;
}

function parseOptionalNotationText(value: unknown): string | undefined {
  const text = parseOptionalText(value);
  return text ? normalizeNotationText(text) : undefined;
}

function normalizeNotationText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/^\$|\$$/g, "")
    .replace(/^\\\(|\\\)$/g, "")
    .replace(/^\\\[|\\\]$/g, "")
    .replace(/^\\+/, "")
    .replace(/[{}]/g, "");
}

function normalizeLookupKey(value: unknown) {
  return normalizeNotationText(value).toLowerCase();
}

function parseRole(value: unknown): SymbolRole | undefined {
  return value === "parameter" ||
    value === "decision" ||
    value === "demand" ||
    value === "utility" ||
    value === "cost" ||
    value === "derived"
    ? value
    : undefined;
}

function parseSide(value: unknown): SymbolSide | undefined {
  return value === "platform" ||
    value === "consumer" ||
    value === "merchant" ||
    value === "both" ||
    value === "global"
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
