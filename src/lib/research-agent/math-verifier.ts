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
      model,
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
  model,
  equilibrium,
  analyses,
}: {
  model?: HotellingModel;
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
      return;
    }

    const expectedSign = inferExpressionSign(
      expected,
      collectSignAssumptions({
        model,
        equilibrium,
        signCondition: analysis.signCondition,
      })
    );
    const claimedSign = parseClaimedSign(analysis.signCondition);
    const missingSignConditions = findMissingSignConditions(
      expected,
      collectSignAssumptions({ model, equilibrium, signCondition: "" })
    );
    if (
      expectedSign === "unknown" &&
      claimedSign !== "unknown" &&
      missingSignConditions.length > 0
    ) {
      issues.push(
        `第 ${index + 1} 条性质分析的符号条件不足：${analysis.target} 对 ${analysis.parameter} 的偏导为 ${formatExpression(expected)}，但要判断其${formatSign(claimedSign)}方向，还需要明确 ${missingSignConditions.join("、")} 的正负条件。`
      );
      return;
    }
    if (
      expectedSign !== "unknown" &&
      claimedSign !== "unknown" &&
      expectedSign !== claimedSign
    ) {
      issues.push(
        `第 ${index + 1} 条性质分析的符号条件与偏导复算不一致：根据均衡闭式解和已知参数条件，${analysis.target} 对 ${analysis.parameter} 的偏导应为${formatSign(expectedSign)}，但候选符号条件写成${formatSign(claimedSign)}。`
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

type ExpressionSign = "positive" | "negative" | "zero" | "unknown";

function collectSignAssumptions({
  model,
  equilibrium,
  signCondition,
}: {
  model?: HotellingModel;
  equilibrium?: EquilibriumResult;
  signCondition: string;
}) {
  const assumptions = new Map<string, ExpressionSign>();

  (model?.symbols ?? []).forEach((symbol) => {
    const sign = parseAssumptionSign(symbol.assumption);
    if (sign === "unknown") return;
    getSymbolAliases(symbol).forEach((alias) => {
      assumptions.set(alias, sign);
    });
  });

  [
    ...(model?.assumptions ?? []),
    ...(equilibrium?.conditions ?? []),
    signCondition,
  ].forEach((value) => {
    parseTextSignAssumptions(value).forEach((sign, symbol) => {
      assumptions.set(symbol, sign);
    });
  });

  return assumptions;
}

function inferExpressionSign(
  expression: AlgebraExpression | null,
  assumptions: Map<string, ExpressionSign>
): ExpressionSign {
  if (!expression) return "unknown";

  const entries = [...expression.entries()].filter(
    ([, coefficient]) => Math.abs(coefficient) > 1e-12
  );
  if (entries.length === 0) return "zero";
  if (entries.length > 1) return "unknown";

  const [[term, coefficient]] = entries;
  let sign = coefficient > 0 ? 1 : -1;
  if (term === "1") return sign > 0 ? "positive" : "negative";

  const factorSigns = term.split("*").filter(Boolean);
  for (const factor of factorSigns) {
    const factorSign = inferFactorSign(factor, assumptions);
    if (factorSign === "unknown") return "unknown";
    if (factorSign === "zero") return "zero";
    if (factorSign === "negative") sign *= -1;
  }

  return sign > 0 ? "positive" : "negative";
}

function inferFactorSign(
  factor: string,
  assumptions: Map<string, ExpressionSign>
): ExpressionSign {
  const normalized = canonicalFactor(factor);
  if (normalized.startsWith("1/")) {
    return inferFactorSign(normalized.slice(2), assumptions);
  }

  const numeric = parseNumericFactor(normalized);
  if (numeric !== null) {
    if (numeric > 0) return "positive";
    if (numeric < 0) return "negative";
    return "zero";
  }

  const aliases = normalizeSymbolToken(normalized);
  for (const alias of aliases) {
    const sign = assumptions.get(alias);
    if (sign === "positive" || sign === "negative" || sign === "zero") {
      return sign;
    }
  }

  return "unknown";
}

function findMissingSignConditions(
  expression: AlgebraExpression | null,
  assumptions: Map<string, ExpressionSign>
) {
  if (!expression) return [];
  const missing = new Set<string>();

  expression.forEach((coefficient, term) => {
    if (Math.abs(coefficient) < 1e-12 || term === "1") return;
    term
      .split("*")
      .filter(Boolean)
      .forEach((factor) => {
        collectUnknownSignFactors(factor, assumptions).forEach((symbol) => {
          missing.add(symbol);
        });
      });
  });

  return [...missing].sort();
}

function collectUnknownSignFactors(
  factor: string,
  assumptions: Map<string, ExpressionSign>
) {
  const normalized = canonicalFactor(factor);
  const rawFactor = normalized.startsWith("1/")
    ? normalized.slice(2)
    : normalized;
  const numeric = parseNumericFactor(rawFactor);
  if (numeric !== null) return [];

  const aliases = normalizeSymbolToken(rawFactor).filter((symbol) =>
    isCandidateSymbol(symbol)
  );
  if (aliases.length === 0) return [];
  if (
    aliases.some((alias) => {
      const sign = assumptions.get(alias);
      return sign === "positive" || sign === "negative" || sign === "zero";
    })
  ) {
    return [];
  }

  return [aliases[0]];
}

function parseTextSignAssumptions(value: string) {
  const assumptions = new Map<string, ExpressionSign>();
  const normalized = normalizeMathText(value);
  const patterns: Array<[RegExp, ExpressionSign]> = [
    [/([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)>0/g, "positive"],
    [/0<([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)/g, "positive"],
    [/([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)<0/g, "negative"],
    [/0>([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)/g, "negative"],
    [/([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)*)=0/g, "zero"],
  ];

  patterns.forEach(([pattern, sign]) => {
    [...normalized.matchAll(pattern)].forEach((match) => {
      normalizeSymbolToken(match[1] ?? "").forEach((symbol) => {
        if (isCandidateSymbol(symbol)) assumptions.set(symbol, sign);
      });
    });
  });

  return assumptions;
}

function parseAssumptionSign(value: string): ExpressionSign {
  if (/zero|为零|等于零|恒为零/i.test(value)) return "zero";
  if (/nonnegative|非负|大于等于零|>=\s*0/i.test(value)) return "unknown";
  if (/nonpositive|非正|小于等于零|<=\s*0/i.test(value)) return "unknown";
  if (/positive|strictly positive|正|大于零|>\s*0/i.test(value)) {
    return "positive";
  }
  if (/negative|strictly negative|负|小于零|<\s*0/i.test(value)) {
    return "negative";
  }
  return "unknown";
}

function parseClaimedSign(value: string): ExpressionSign {
  const normalized = value.replace(/\s+/g, "");
  if (/zero|为零|等于零|恒为零|=0/i.test(normalized)) return "zero";
  if (/nonnegative|非负|大于等于零|>=0/i.test(normalized)) return "unknown";
  if (/nonpositive|非正|小于等于零|<=0/i.test(normalized)) return "unknown";
  if (/positive|为正|正向|正相关|增加|提高|上升/i.test(normalized)) {
    return "positive";
  }
  if (/negative|为负|负向|负相关|降低|下降|减少/i.test(normalized)) {
    return "negative";
  }
  return "unknown";
}

function formatSign(sign: ExpressionSign) {
  if (sign === "positive") return "正";
  if (sign === "negative") return "负";
  if (sign === "zero") return "零";
  return "无法判断";
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
