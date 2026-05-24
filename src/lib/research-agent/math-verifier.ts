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

  issues.push(
    ...verifyPropertyCalculusConsistency({
      equilibrium,
      analyses,
    }).issues
  );

  return {
    ok: issues.length === 0,
    issues,
  };
}

function verifyPropertyCalculusConsistency({
  equilibrium,
  analyses,
}: {
  equilibrium?: EquilibriumResult;
  analyses: PropertyAnalysis[];
}): MathVerificationResult {
  const closedFormEquations = parseClosedFormEquations(
    equilibrium?.closedForm ?? ""
  );
  const issues: string[] = [];

  analyses.forEach((analysis, index) => {
    if (analysis.operation !== "differentiate") return;

    const target = canonicalSymbolKey(analysis.target);
    const parameter = canonicalSymbolKey(analysis.parameter);
    if (!target || !parameter) return;

    const targetExpression = closedFormEquations.get(target);
    if (!targetExpression) return;

    const expectedDerivative = differentiateSupportedExpression(
      targetExpression,
      parameter
    );
    const claimedDerivative = parseClaimedDerivativeExpression({
      symbolicResult: analysis.symbolicResult,
      target,
      parameter,
    });
    if (!expectedDerivative || !claimedDerivative) return;

    const expected = simplifyExpression(expectedDerivative);
    const claimed = simplifyExpression(claimedDerivative);
    if (!areEquivalentExpressions(expected, claimed)) {
      issues.push(
        `第 ${index + 1} 条性质分析的偏导复算不一致：根据均衡闭式解，${analysis.target} 对 ${analysis.parameter} 的偏导应为 ${formatExpression(expected)}，但候选写成 ${formatExpression(claimed)}。`
      );
    }
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

type AlgebraExpression = Map<string, number>;

function parseClosedFormEquations(closedForm: string) {
  const equations = new Map<string, string>();

  extractMathSegments(closedForm).forEach((segment) => {
    const normalized = normalizeMathText(segment);

    normalized
      .split(/[\n;,，。；]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const parts = part.split("=").map((value) => value.trim()).filter(Boolean);
        if (parts.length < 2) return;

        const expression = parts.at(-1);
        if (!expression) return;

        parts.slice(0, -1).forEach((leftHandSide) => {
          const key = canonicalSymbolKey(leftHandSide);
          if (key) equations.set(key, expression);
        });
      });
  });

  return equations;
}

function extractMathSegments(value: string) {
  const segments = [...value.matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
  return segments.length > 0 ? segments : [value];
}

function parseClaimedDerivativeExpression({
  symbolicResult,
  target,
  parameter,
}: {
  symbolicResult: string;
  target: string;
  parameter: string;
}) {
  const normalized = normalizeMathText(symbolicResult);
  const [lhs, rhs] = normalized.split("=").map((part) => part?.trim());
  if (!lhs || !rhs) return null;
  if (!lhs.includes(target) || !lhs.includes(parameter)) return null;

  return rhs;
}

function differentiateSupportedExpression(expression: string, parameter: string) {
  const parsed = parseLinearExpression(expression);
  if (!parsed) return null;

  const derivative: AlgebraExpression = new Map();
  parsed.forEach((coefficient, term) => {
    const termDerivative = differentiateTerm(term, parameter);
    if (!termDerivative) return;
    addExpression(derivative, termDerivative, coefficient);
  });

  return derivative.size > 0 ? derivative : new Map([["1", 0]]);
}

function differentiateTerm(term: string, parameter: string) {
  const factors = term.split("*").filter(Boolean);
  const parameterCount = factors.filter((factor) => factor === parameter).length;
  if (parameterCount === 0) return null;
  if (parameterCount > 1) return null;

  const remainingFactors = factors.filter((factor) => factor !== parameter);
  const key = remainingFactors.length > 0 ? remainingFactors.join("*") : "1";
  return new Map([[key, 1]]);
}

function parseLinearExpression(expression: string): AlgebraExpression | null {
  const normalized = distributeSimpleFraction(normalizeMathText(expression));
  const expressionMap: AlgebraExpression = new Map();
  const parts = splitAdditiveTerms(normalized);

  if (parts.length === 0) return null;

  for (const part of parts) {
    const parsed = parseSignedTerm(part);
    if (!parsed) return null;
    const [term, coefficient] = parsed;
    addTerm(expressionMap, term, coefficient);
  }

  return expressionMap;
}

function splitAdditiveTerms(expression: string) {
  const parts: string[] = [];
  let current = "";
  let depth = 0;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;

    if ((char === "+" || char === "-") && depth === 0 && current.trim()) {
      parts.push(current);
      current = char;
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current);

  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseSignedTerm(term: string): [string, number] | null {
  let rest = term.trim();
  let sign = 1;

  if (rest.startsWith("+")) rest = rest.slice(1).trim();
  if (rest.startsWith("-")) {
    sign = -1;
    rest = rest.slice(1).trim();
  }

  const fraction = splitTopLevel(rest, "/");
  if (fraction) {
    const [numerator, denominator] = fraction;
    const numeratorExpression = parseLinearExpression(stripOuterParens(numerator));
    if (!numeratorExpression) return null;

    const result: AlgebraExpression = new Map();
    numeratorExpression.forEach((coefficient, numeratorTerm) => {
      addTerm(
        result,
        combineFactors([numeratorTerm, reciprocalTerm(denominator)]),
        coefficient * sign
      );
    });

    if (result.size !== 1) return null;
    const [[resultTerm, resultCoefficient]] = [...result.entries()];
    return [resultTerm, resultCoefficient];
  }

  const factors = insertImplicitMultiplication(rest)
    .split("*")
    .map((factor) => factor.trim())
    .filter(Boolean);
  let coefficient = sign;
  const symbolicFactors: string[] = [];

  for (const factor of factors.length ? factors : [rest]) {
    const numeric = parseNumericFactor(factor);
    if (numeric !== null) {
      coefficient *= numeric;
    } else {
      symbolicFactors.push(canonicalFactor(factor));
    }
  }

  return [combineFactors(symbolicFactors), coefficient];
}

function simplifyExpression(expression: string | AlgebraExpression) {
  if (typeof expression !== "string") return normalizeExpressionMap(expression);
  const parsed = parseLinearExpression(expression);
  return parsed ? normalizeExpressionMap(parsed) : null;
}

function normalizeExpressionMap(expression: AlgebraExpression) {
  const normalized: AlgebraExpression = new Map();
  expression.forEach((coefficient, term) => {
    if (Math.abs(coefficient) < 1e-12) return;
    addTerm(normalized, canonicalTerm(term), coefficient);
  });
  return normalized;
}

function areEquivalentExpressions(
  expected: AlgebraExpression | null,
  claimed: AlgebraExpression | null
) {
  if (!expected || !claimed) return true;
  const keys = new Set([...expected.keys(), ...claimed.keys()]);

  for (const key of keys) {
    if (Math.abs((expected.get(key) ?? 0) - (claimed.get(key) ?? 0)) > 1e-12) {
      return false;
    }
  }

  return true;
}

function addExpression(
  target: AlgebraExpression,
  source: AlgebraExpression,
  multiplier = 1
) {
  source.forEach((coefficient, term) => {
    addTerm(target, term, coefficient * multiplier);
  });
}

function addTerm(expression: AlgebraExpression, term: string, coefficient: number) {
  const normalizedTerm = canonicalTerm(term);
  expression.set(normalizedTerm, (expression.get(normalizedTerm) ?? 0) + coefficient);
}

function canonicalTerm(term: string) {
  if (!term || term === "1") return "1";
  return combineFactors(term.split("*").filter(Boolean));
}

function combineFactors(factors: string[]) {
  const cleaned = factors
    .map((factor) => canonicalFactor(factor))
    .filter((factor) => factor && factor !== "1")
    .sort();

  return cleaned.length > 0 ? cleaned.join("*") : "1";
}

function canonicalFactor(factor: string) {
  return normalizeMathText(stripOuterParens(factor)).trim();
}

function reciprocalTerm(value: string) {
  return `1/${canonicalFactor(value)}`;
}

function parseNumericFactor(factor: string) {
  const normalized = stripOuterParens(factor.trim());
  if (/^\d+(?:\.\d+)?$/.test(normalized)) return Number(normalized);
  return null;
}

function splitTopLevel(value: string, separator: string) {
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === separator && depth === 0) {
      return [value.slice(0, index).trim(), value.slice(index + 1).trim()] as const;
    }
  }

  return null;
}

function stripOuterParens(value: string) {
  let result = value.trim();

  while (
    result.startsWith("(") &&
    result.endsWith(")") &&
    hasMatchingOuterParens(result)
  ) {
    result = result.slice(1, -1).trim();
  }

  return result;
}

function hasMatchingOuterParens(value: string) {
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0 && index < value.length - 1) return false;
  }

  return depth === 0;
}

function canonicalSymbolKey(value: string) {
  const normalized = normalizeMathText(value)
    .replace(/\s+/g, "")
    .replace(/\^\*/g, "")
    .replace(/\*/g, "");
  const match = normalized.match(/[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*(?:\^[A-Za-z0-9]+)?/);
  return match?.[0] ?? "";
}

function normalizeMathText(value: string) {
  return value
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)")
    .replace(/\\partial/g, "partial")
    .replace(/∂/g, "partial")
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
    .replace(/\s+/g, "")
    .replace(/\^\*/g, "")
    .replace(/[{}]/g, "");
}

function insertImplicitMultiplication(value: string) {
  return value.replace(/(\d)([A-Za-z])/g, "$1*$2");
}

function distributeSimpleFraction(value: string) {
  const match = value.match(/^\(([^()]+)\)\/\(([^()]+)\)$/);
  if (!match) return value;

  const [, numerator, denominator] = match;
  return splitAdditiveTerms(numerator)
    .map((part, index) => {
      const trimmed = part.trim();
      const separator = index === 0 || trimmed.startsWith("-") ? "" : "+";
      return `${separator}${trimmed}/(${denominator})`;
    })
    .join("");
}

function formatExpression(expression: AlgebraExpression | null) {
  if (!expression) return "无法复算";

  const entries = [...expression.entries()].filter(
    ([, coefficient]) => Math.abs(coefficient) > 1e-12
  );
  if (entries.length === 0) return "0";

  return entries
    .map(([term, coefficient], index) => {
      const sign = coefficient < 0 ? "-" : index === 0 ? "" : "+";
      const absolute = Math.abs(coefficient);
      if (term.startsWith("1/")) {
        const denominator = term.slice(2);
        const numerator = absolute === 1 ? "1" : formatCoefficient(absolute);
        return `${sign}${numerator}/${denominator}`;
      }

      const coefficientText =
        absolute === 1 && term !== "1" ? "" : formatCoefficient(absolute);
      const termText = term === "1" ? "" : term.replace(/\*/g, "*");
      return `${sign}${coefficientText}${termText}` || "0";
    })
    .join("");
}

function formatCoefficient(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
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
