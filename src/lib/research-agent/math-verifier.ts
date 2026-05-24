import type {
  EquilibriumResult,
  HotellingModel,
  PropertyAnalysis,
  SymbolDefinition,
} from "../types";

export type MathVerificationResult = {
  ok: boolean;
  issues: string[];
};

export function verifyEquilibriumMathConsistency({
  model,
  equilibrium,
}: {
  model?: HotellingModel;
  equilibrium: EquilibriumResult;
}): MathVerificationResult {
  const allowedSymbols = createAllowedSymbolSet(model);
  const referencedSymbols = extractMathSymbols([
    ...equilibrium.solvingSteps,
    ...equilibrium.focs,
    ...equilibrium.conditions,
    equilibrium.closedForm,
    equilibrium.derivation,
    equilibrium.code,
  ]);
  const ungroundedSymbols = findUngroundedSymbols(
    referencedSymbols,
    allowedSymbols
  );
  const issues = ungroundedSymbols.map(
    (symbol) => `均衡候选引用了模型中未定义的符号：${symbol}。`
  );

  return {
    ok: issues.length === 0,
    issues,
  };
}

export function verifyPropertyAnalysisMathConsistency({
  model,
  equilibrium,
  analyses,
}: {
  model?: HotellingModel;
  equilibrium?: EquilibriumResult;
  analyses: PropertyAnalysis[];
}): MathVerificationResult {
  const allowedSymbols = createAllowedSymbolSet(model);
  extractMathSymbols([
    ...(equilibrium?.focs ?? []),
    ...(equilibrium?.conditions ?? []),
    equilibrium?.closedForm ?? "",
    equilibrium?.derivation ?? "",
    equilibrium?.code ?? "",
  ]).forEach((symbol) => allowedSymbols.add(symbol));

  const issues: string[] = [];

  analyses.forEach((analysis, index) => {
    const referencedSymbols = extractMathSymbols([
      analysis.target,
      analysis.parameter,
      analysis.symbolicResult,
      analysis.signCondition,
      analysis.propositionDraft,
      analysis.proofSketch,
    ]);
    const ungroundedSymbols = findUngroundedSymbols(
      referencedSymbols,
      allowedSymbols
    );

    ungroundedSymbols.forEach((symbol) => {
      issues.push(
        `第 ${index + 1} 条性质分析引用了模型或均衡中未出现的符号：${symbol}。`
      );
    });
  });

  return {
    ok: issues.length === 0,
    issues,
  };
}

function createAllowedSymbolSet(model?: HotellingModel) {
  const symbols = new Set<string>();

  (model?.symbols ?? []).forEach((symbol) => {
    getSymbolAliases(symbol).forEach((alias) => symbols.add(alias));
  });

  extractMathSymbols([
    ...(model?.timing ?? []).flatMap((stage) => stage.decisions),
    ...(model?.utilityFunctions ?? []).map((entry) => entry.expression),
    ...(model?.profitFunctions ?? []).map((entry) => entry.expression),
    model?.demandDerivation ?? "",
    ...(model?.assumptions ?? []),
  ]).forEach((symbol) => symbols.add(symbol));

  return symbols;
}

function getSymbolAliases(symbol: SymbolDefinition) {
  const aliases = [
    symbol.symbol,
    symbol.codeName,
    symbol.baseSymbol,
    symbol.subscript ? `${symbol.baseSymbol}_${symbol.subscript}` : undefined,
    symbol.superscript ? `${symbol.baseSymbol}_${symbol.superscript}` : undefined,
    symbol.subscript && symbol.superscript
      ? `${symbol.baseSymbol}_${symbol.subscript}_${symbol.superscript}`
      : undefined,
    symbol.subscript && symbol.superscript
      ? `${symbol.baseSymbol}_${symbol.subscript}^${symbol.superscript}`
      : undefined,
  ];

  return aliases
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => normalizeSymbolToken(value));
}

function findUngroundedSymbols(symbols: Set<string>, allowedSymbols: Set<string>) {
  return [...symbols].filter((symbol) => !allowedSymbols.has(symbol));
}

function extractMathSymbols(values: string[]) {
  const symbols = new Set<string>();

  values.forEach((value) => {
    tokenizeMathText(value).forEach((token) => {
      normalizeSymbolToken(token).forEach((normalized) => {
        if (isCandidateSymbol(normalized)) symbols.add(normalized);
      });
    });
  });

  return symbols;
}

function tokenizeMathText(value: string) {
  return [
    ...value.matchAll(
      /\\[A-Za-z]+(?:_\{?[A-Za-z0-9]+\}?|\^[A-Za-z0-9*]+)*/g
    ),
    ...value.matchAll(/[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*(?:\^[A-Za-z0-9*]+)?/g),
    ...value.matchAll(/[α-ωΑ-ΩΠτβδ]\w*(?:_[A-Za-z0-9]+)?(?:\^[A-Za-z0-9*]+)?/g),
  ].map((match) => match[0]);
}

function normalizeSymbolToken(token: string) {
  const cleaned = token
    .replace(/\\bar/g, "")
    .replace(/\\tau/g, "tau")
    .replace(/\\alpha/g, "alpha")
    .replace(/\\beta/g, "beta")
    .replace(/\\delta/g, "delta")
    .replace(/\\Pi/g, "Pi")
    .replace(/τ/g, "tau")
    .replace(/α/g, "alpha")
    .replace(/β/g, "beta")
    .replace(/δ/g, "delta")
    .replace(/Π/g, "Pi")
    .replace(/[{}]/g, "")
    .replace(/\^\*/g, "")
    .replace(/\*/g, "")
    .trim();

  if (!cleaned) return [];

  const withoutSuperscript = cleaned.replace(/\^[A-Za-z0-9]+$/, "");
  const withoutPlatformSuperscript = withoutSuperscript.replace(/_[AB]_[BS]$/, (match) =>
    match.replace(/_([BS])$/, "^$1")
  );

  return Array.from(
    new Set([cleaned, withoutSuperscript, withoutPlatformSuperscript])
  );
}

function isCandidateSymbol(token: string) {
  if (IGNORED_TOKENS.has(token)) return false;
  if (IGNORED_TOKEN_PATTERNS.some((pattern) => pattern.test(token))) {
    return false;
  }

  if (/^[A-Za-z]$/.test(token)) {
    return ["q", "x", "y", "p", "t", "v", "c", "n", "s"].includes(token);
  }

  if (token.includes("_") || token.includes("^") || token.startsWith("\\")) {
    return true;
  }

  return /^(tau|alpha|beta|delta|Pi)$/.test(token);
}

const IGNORED_TOKENS = new Set([
  "\\partial",
  "\\frac",
  "\\left",
  "\\right",
  "\\cdot",
  "\\times",
  "\\Leftrightarrow",
  "\\bar",
  "partial",
  "frac",
  "left",
  "right",
  "cdot",
  "times",
  "Leftrightarrow",
  "bar",
  "det",
  "ln",
  "log",
  "exp",
  "sqrt",
  "max",
  "min",
  "argmax",
  "argmin",
  "le",
  "ge",
  "lt",
  "gt",
  "if",
  "then",
  "else",
  "for",
  "as",
  "return",
  "solve",
  "diff",
  "symbols",
  "print",
  "range",
  "sp",
  "sympy",
  "import",
  "positive",
  "negative",
  "nonnegative",
  "FOC",
  "foc",
  "foc_tau_A",
  "foc_p_A",
]);

const IGNORED_TOKEN_PATTERNS = [
  /^foc(?:_[A-Za-z0-9]+)+$/,
  /^eq(?:_[A-Za-z0-9]+)+$/,
  /^expr(?:_[A-Za-z0-9]+)*$/,
  /^solution(?:_[A-Za-z0-9]+)*$/,
  /^result(?:_[A-Za-z0-9]+)*$/,
  /^condition(?:_[A-Za-z0-9]+)*$/,
];
