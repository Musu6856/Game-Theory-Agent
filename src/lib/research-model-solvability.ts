import type { HotellingModel, SymbolDefinition } from "./types";

export type HotellingModelSolvabilityResult = {
  ok: boolean;
  issues: string[];
};

const unresolvedMechanismFunctionPattern =
  /\\(?:psi|phi|Psi|Phi)(?:_\{?[A-Za-z0-9]+\}?|)\s*\(|\b(?:R|C|Revenue|Cost)_[A-Za-z0-9]+\s*\(/;
const mechanismPlaceholderPattern =
  /multi[-\s]?homing|multihoming|多归属|排他|exclus|exclusive|agreement|friction|机制|占位|placeholder|\ba_d\d+\b/i;

export function evaluateHotellingModelSolvability(
  model: HotellingModel
): HotellingModelSolvabilityResult {
  const issues: string[] = [];
  const expressionFields = [
    ...model.utilityFunctions.map((entry) => entry.expression),
    ...model.profitFunctions.map((entry) => entry.expression),
    model.demandDerivation,
    model.modelSetupDraft,
  ];

  if (expressionFields.some((entry) => unresolvedMechanismFunctionPattern.test(entry))) {
    issues.push(
      "unresolved mechanism function: replace psi/phi/R_i(...)/C_i(...) with concrete symbolic terms before solving"
    );
  }

  const floatingMechanismSymbols = model.symbols.filter((symbol) =>
    isFloatingMechanismSymbol(model, symbol)
  );
  if (floatingMechanismSymbols.length > 0) {
    issues.push(
      `floating mechanism symbol: ${floatingMechanismSymbols
        .map((symbol) => symbol.codeName || symbol.symbol)
        .join(", ")} must appear in utility, demand, or profit equations; decision mechanisms must also appear in timing before solving`
    );
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function filterFloatingMechanismSymbols(
  model: HotellingModel,
  symbols: SymbolDefinition[]
) {
  return symbols.filter((symbol) => !isFloatingMechanismSymbol(model, symbol));
}

export function isFloatingMechanismSymbol(
  model: HotellingModel,
  symbol: SymbolDefinition
) {
  if (!isPotentialMechanismSymbol(symbol)) return false;

  const normalized = normalizeSymbol(symbol.codeName || symbol.symbol);
  if (!normalized) return false;

  const equationSymbols = extractModelEquationSymbols(model);
  const timingSymbols = extractTimingDecisionSymbols(model);
  const appearsInEquations = symbolAppearsInSet(normalized, equationSymbols);
  const appearsInTiming =
    symbol.role !== "decision" || symbolAppearsInSet(normalized, timingSymbols);

  return !appearsInEquations || !appearsInTiming;
}

function isPotentialMechanismSymbol(symbol: SymbolDefinition) {
  return mechanismPlaceholderPattern.test(
    [
      symbol.symbol,
      symbol.codeName,
      symbol.baseSymbol,
      symbol.name,
      symbol.meaning,
      symbol.assumption,
    ].join(" ")
  );
}

function extractModelEquationSymbols(model: HotellingModel) {
  return new Set(
    [
      ...model.utilityFunctions.map((entry) => entry.expression),
      model.demandDerivation,
      ...model.profitFunctions.map((entry) => entry.expression),
    ].flatMap(extractSymbolsFromText)
  );
}

function extractTimingDecisionSymbols(model: HotellingModel) {
  return new Set(model.timing.flatMap((stage) => stage.decisions).map(normalizeSymbol));
}

function extractSymbolsFromText(text: string) {
  const normalizedText = text
    .replace(/\\frac\{[^}]*\}\{[^}]*\}/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\\([A-Za-z]+)_([A-Za-z0-9]+)/g, "$1_$2")
    .replace(/\\([A-Za-z]+)/g, "$1");

  return (
    normalizedText
      .match(/[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)?/g)
      ?.map(normalizeSymbol)
      .filter(Boolean) ?? []
  );
}

function normalizeSymbol(symbol: string) {
  return symbol
    .trim()
    .replace(/^\$/, "")
    .replace(/\$$/, "")
    .replace(/^\\/, "")
    .replace(/\^\*/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, "")
    .replace(/_\{([^}]+)\}/g, "_$1");
}

function symbolAppearsInSet(symbol: string, symbols: Set<string>) {
  const normalized = normalizeSymbol(symbol);
  if (symbols.has(normalized)) return true;

  return [...symbols].some(
    (entry) =>
      entry === normalized ||
      entry.startsWith(`${normalized}_`) ||
      normalized.startsWith(`${entry}_`)
  );
}
