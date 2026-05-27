import type {
  EquilibriumResult,
  HotellingModel,
  ResearchMathArtifact,
  ResearchMathVerificationCheck,
  SymbolDefinition,
} from "../types";

export type EquilibriumCoverageStatus =
  | ResearchMathVerificationCheck["status"];

export type EquilibriumCoverageMechanism =
  | "quality"
  | "subsidy"
  | "commission"
  | "recommendation"
  | "multihoming"
  | "verification"
  | "asymmetry"
  | "boundary";

export interface EquilibriumCoverageSymbol {
  symbol: string;
  role: SymbolDefinition["role"] | "mechanism";
  label: string;
  mechanism?: EquilibriumCoverageMechanism;
  source: string;
}

export interface EquilibriumCoverageResult {
  status: EquilibriumCoverageStatus;
  canPromote: boolean;
  model: {
    decisionVariables: string[];
    parameters: string[];
    demandVariables: string[];
    mechanismTerms: EquilibriumCoverageSymbol[];
    utilitySymbols: string[];
    profitSymbols: string[];
  };
  derivation: {
    usedSymbols: string[];
    usedDecisionVariables: string[];
    usedParameters: string[];
    usedMechanismTerms: string[];
  };
  omittedModelSymbols: string[];
  omittedHighValueMechanisms: EquilibriumCoverageSymbol[];
  suspiciousSimplification: boolean;
  issues: string[];
}

const HIGH_VALUE_MECHANISMS: {
  mechanism: EquilibriumCoverageMechanism;
  pattern: RegExp;
  label: string;
}[] = [
  {
    mechanism: "quality",
    pattern: /quality|品质|质量|质控|\bq_[A-Za-z0-9]+\b|\\?q_\{?[A-Za-z]\}?/i,
    label: "quality investment",
  },
  {
    mechanism: "subsidy",
    pattern: /subsid|补贴|\bs_[A-Za-z0-9]+\b|\\?s_\{?[A-Za-z]\}?/i,
    label: "subsidy",
  },
  {
    mechanism: "commission",
    pattern: /commission|佣金|take.?rate|\\tau|tau[_\s-]?[A-Za-z]|\btau\b/i,
    label: "commission",
  },
  {
    mechanism: "recommendation",
    pattern: /recommend|推荐|ranking|算法|流量|曝光|\br_[A-Za-z0-9]+\b|\\?r_\{?[A-Za-z]\}?/i,
    label: "recommendation strength",
  },
  {
    mechanism: "multihoming",
    pattern: /multi.?hom|多归属|多栖|跨平台/i,
    label: "multihoming",
  },
  {
    mechanism: "verification",
    pattern: /verif|认证|审核|核验|trust|effort|努力|\be_[A-Za-z0-9]+\b|\\?e_\{?[A-Za-z]\}?/i,
    label: "verification effort",
  },
  {
    mechanism: "asymmetry",
    pattern: /asymmetr|非对称|异质|\bA\b.*\bB\b|\bB\b.*\bA\b/i,
    label: "asymmetry",
  },
  {
    mechanism: "boundary",
    pattern: /boundary|corner|KKT|constraint|约束|边界|非负|上界|下界|>=|<=|\\ge|\\le/i,
    label: "boundary constraints",
  },
];

const DEFAULT_CORE_PATTERN =
  /(?:1\s*\/\s*2|\\frac\{1\}\{2\}|one-half|symmetric|对称|Hotelling).*(?:tau|\\tau|commission|佣金|subsid|补贴|s_[A-Za-z])|(?:tau|\\tau|commission|佣金|subsid|补贴|s_[A-Za-z]).*(?:1\s*\/\s*2|\\frac\{1\}\{2\}|one-half|symmetric|对称|Hotelling)/i;

export function evaluateEquilibriumCoverage({
  model,
  equilibrium,
}: {
  model?: HotellingModel;
  equilibrium: EquilibriumResult;
}): EquilibriumCoverageResult {
  const modelCoverage = extractModelCoverage(model);
  const derivationSymbols = extractDerivationSymbols(equilibrium);
  const usedSymbols = sortSymbols(
    [...modelCoverage.allTrackedSymbols].filter((symbol) =>
      symbolAppearsInSet(symbol, derivationSymbols)
    )
  );
  const usedSymbolSet = new Set(usedSymbols);
  const omittedModelSymbols = sortSymbols(
    [...modelCoverage.requiredSymbols].filter((symbol) => !usedSymbolSet.has(symbol))
  );
  const omittedHighValueMechanisms = modelCoverage.mechanismTerms.filter(
    (term) => !symbolAppearsInSet(term.symbol, derivationSymbols)
  );
  const suspiciousSimplification =
    modelCoverage.mechanismTerms.length >= 3 &&
    omittedHighValueMechanisms.length > 0 &&
    DEFAULT_CORE_PATTERN.test(getEquilibriumText(equilibrium));
  const issues = createCoverageIssues({
    omittedHighValueMechanisms,
    omittedModelSymbols,
    suspiciousSimplification,
  });
  const status = issues.length > 0 ? "failed" : "passed";

  return {
    status,
    canPromote: status === "passed",
    model: {
      decisionVariables: sortSymbols([...modelCoverage.decisionVariables]),
      parameters: sortSymbols([...modelCoverage.parameters]),
      demandVariables: sortSymbols([...modelCoverage.demandVariables]),
      mechanismTerms: modelCoverage.mechanismTerms,
      utilitySymbols: sortSymbols([...modelCoverage.utilitySymbols]),
      profitSymbols: sortSymbols([...modelCoverage.profitSymbols]),
    },
    derivation: {
      usedSymbols,
      usedDecisionVariables: usedSymbols.filter((symbol) =>
        modelCoverage.decisionVariables.has(symbol)
      ),
      usedParameters: usedSymbols.filter((symbol) =>
        modelCoverage.parameters.has(symbol)
      ),
      usedMechanismTerms: modelCoverage.mechanismTerms
        .filter((term) => usedSymbolSet.has(term.symbol))
        .map((term) => term.symbol),
    },
    omittedModelSymbols,
    omittedHighValueMechanisms,
    suspiciousSimplification,
    issues,
  };
}

export function createEquilibriumCoverageArtifact({
  coverage,
  id,
  runId,
  patchId,
  now,
}: {
  coverage: EquilibriumCoverageResult;
  id: string;
  runId?: string;
  patchId?: string;
  now: number;
}): ResearchMathArtifact {
  return {
    id,
    runId,
    patchId,
    stepId: "review-equilibrium",
    kind: "model_coverage_check",
    title: "Model coverage check",
    status: coverage.status,
    source: "model",
    input: {
      decisionVariables: coverage.model.decisionVariables,
      parameters: coverage.model.parameters,
      demandVariables: coverage.model.demandVariables,
      mechanismTerms: coverage.model.mechanismTerms,
    },
    output: {
      usedSymbols: coverage.derivation.usedSymbols,
      usedDecisionVariables: coverage.derivation.usedDecisionVariables,
      usedMechanismTerms: coverage.derivation.usedMechanismTerms,
      omittedModelSymbols: coverage.omittedModelSymbols,
      omittedHighValueMechanisms: coverage.omittedHighValueMechanisms,
      suspiciousSimplification: coverage.suspiciousSimplification,
    },
    issues: coverage.issues,
    createdAt: now,
  };
}

function extractModelCoverage(model?: HotellingModel) {
  const decisionVariables = new Set<string>();
  const parameters = new Set<string>();
  const demandVariables = new Set<string>();
  const utilitySymbols = new Set<string>();
  const profitSymbols = new Set<string>();
  const requiredSymbols = new Set<string>();
  const allTrackedSymbols = new Set<string>();
  const mechanismTermsBySymbol = new Map<string, EquilibriumCoverageSymbol>();

  const addTrackedSymbol = (symbol: string) => {
    const normalized = normalizeSymbol(symbol);
    if (normalized) allTrackedSymbols.add(normalized);
    return normalized;
  };
  const addRequiredSymbol = (symbol: string) => {
    const normalized = addTrackedSymbol(symbol);
    if (normalized) requiredSymbols.add(normalized);
    return normalized;
  };
  const addMechanism = (
    symbol: string,
    role: EquilibriumCoverageSymbol["role"],
    label: string,
    source: string,
    mechanism?: EquilibriumCoverageMechanism
  ) => {
    const normalized = addRequiredSymbol(symbol);
    if (!normalized) return;
    mechanismTermsBySymbol.set(normalized, {
      symbol: normalized,
      role,
      label,
      mechanism,
      source,
    });
  };

  for (const symbol of model?.symbols ?? []) {
    const normalized = addTrackedSymbol(symbol.codeName || symbol.symbol);
    if (!normalized) continue;

    if (symbol.role === "decision") {
      decisionVariables.add(normalized);
      requiredSymbols.add(normalized);
    }
    if (symbol.role === "parameter") parameters.add(normalized);
    if (symbol.role === "demand") {
      demandVariables.add(normalized);
      requiredSymbols.add(normalized);
    }

    const mechanism = detectHighValueMechanism(
      [
        symbol.symbol,
        symbol.codeName,
        symbol.baseSymbol,
        symbol.name,
        symbol.meaning,
        symbol.assumption,
      ].join(" ")
    );
    if (
      mechanism &&
      shouldTrackMechanismSymbol({
        symbol: normalized,
        role: symbol.role,
        mechanism: mechanism.mechanism,
      })
    ) {
      addMechanism(
        normalized,
        symbol.role,
        mechanism.label,
        "symbol_registry",
        mechanism.mechanism
      );
    }
  }

  for (const stage of model?.timing ?? []) {
    for (const decision of stage.decisions) {
      const normalized = addRequiredSymbol(decision);
      if (normalized) decisionVariables.add(normalized);
      const mechanism = detectHighValueMechanism(`${stage.name} ${decision}`);
    if (mechanism && normalized) {
        if (isLikelyMechanismSymbol(normalized, mechanism.mechanism)) {
          addMechanism(
            normalized,
            "decision",
            mechanism.label,
            "timing",
            mechanism.mechanism
          );
        }
      }
    }
  }

  for (const utility of model?.utilityFunctions ?? []) {
    for (const symbol of extractSymbolsFromText(utility.expression)) {
      utilitySymbols.add(symbol);
      addTrackedSymbol(symbol);
    }
    for (const term of detectMechanismsInText(
      `${utility.expression} ${utility.notes}`,
      "utility_function"
    )) {
      addMechanism(term.symbol, "mechanism", term.label, term.source, term.mechanism);
    }
  }

  for (const symbol of extractSymbolsFromText(model?.demandDerivation ?? "")) {
    demandVariables.add(symbol);
    addTrackedSymbol(symbol);
    if (/^n_/i.test(symbol)) requiredSymbols.add(symbol);
  }
  for (const term of detectMechanismsInText(
    model?.demandDerivation ?? "",
    "demand_derivation"
  )) {
    addMechanism(term.symbol, "mechanism", term.label, term.source, term.mechanism);
  }

  for (const profit of model?.profitFunctions ?? []) {
    for (const symbol of extractSymbolsFromText(profit.expression)) {
      profitSymbols.add(symbol);
      addTrackedSymbol(symbol);
    }
    for (const term of detectMechanismsInText(
      `${profit.expression} ${profit.notes}`,
      "profit_function"
    )) {
      addMechanism(term.symbol, "mechanism", term.label, term.source, term.mechanism);
    }
  }

  for (const assumption of model?.assumptions ?? []) {
    for (const symbol of extractSymbolsFromText(assumption)) {
      addTrackedSymbol(symbol);
    }
  }
  for (const term of detectMechanismsInText(
    model?.modelSetupDraft ?? "",
    "model_setup"
  )) {
    addMechanism(term.symbol, "mechanism", term.label, term.source, term.mechanism);
  }

  return {
    decisionVariables,
    parameters,
    demandVariables,
    utilitySymbols,
    profitSymbols,
    requiredSymbols,
    allTrackedSymbols,
    mechanismTerms: [...mechanismTermsBySymbol.values()].sort((left, right) =>
      left.symbol.localeCompare(right.symbol)
    ),
  };
}

function extractDerivationSymbols(equilibrium: EquilibriumResult) {
  return new Set(
    extractSymbolsFromText(getEquilibriumText(equilibrium)).map(normalizeSymbol)
  );
}

function getEquilibriumText(equilibrium: EquilibriumResult) {
  return [
    equilibrium.concept,
    ...equilibrium.solvingSteps,
    ...equilibrium.focs,
    ...equilibrium.conditions,
    equilibrium.closedForm,
    equilibrium.derivation,
    equilibrium.code,
    ...equilibrium.warnings,
    ...(equilibrium.solverScratchpad?.implicitSystem ?? []),
    ...(equilibrium.solverScratchpad?.reactionFunctions ?? []),
    ...(equilibrium.solverScratchpad?.attemptedSteps ?? []),
    equilibrium.solverScratchpad?.failedWithReason ?? "",
    ...(equilibrium.solverScratchpad?.needsModelClarification ?? []),
  ].join("\n");
}

function createCoverageIssues({
  omittedHighValueMechanisms,
  omittedModelSymbols,
  suspiciousSimplification,
}: {
  omittedHighValueMechanisms: EquilibriumCoverageSymbol[];
  omittedModelSymbols: string[];
  suspiciousSimplification: boolean;
}) {
  const issues: string[] = [];

  if (omittedHighValueMechanisms.length > 0) {
    const omitted = omittedHighValueMechanisms
      .map((term) => `${term.symbol} (${term.label})`)
      .join(", ");
    issues.push(
      `The derivation omits high-value model mechanisms: ${omitted}. Return to the model/equilibrium draft before promoting this as a formal equilibrium.`
    );
  }

  if (omittedHighValueMechanisms.length === 0 && omittedModelSymbols.length > 0) {
    return issues;
  }

  if (omittedModelSymbols.length > 0) {
    const uncoveredCoreSymbols = omittedModelSymbols.filter(
      (symbol) =>
        omittedHighValueMechanisms.some((term) => term.symbol === symbol)
    );
    if (uncoveredCoreSymbols.length > 0) {
      issues.push(
        `The derivation does not reference these confirmed model variables: ${uncoveredCoreSymbols.join(", ")}.`
      );
    }
  }

  if (suspiciousSimplification) {
    issues.push(
      "The confirmed model is mechanism-rich, but the candidate resembles the default symmetric tau/subsidy/one-half Hotelling solution. Treat it as a scoped draft, not a formal solved equilibrium."
    );
  }

  return issues;
}

function detectHighValueMechanism(text: string) {
  return HIGH_VALUE_MECHANISMS.find((entry) => entry.pattern.test(text));
}

function detectMechanismsInText(
  text: string,
  source: string
): EquilibriumCoverageSymbol[] {
  if (!text.trim()) return [];

  const symbols = extractSymbolsFromText(text);
  const symbolicText = symbols.join(" ");
  const terms: EquilibriumCoverageSymbol[] = [];

  for (const mechanism of HIGH_VALUE_MECHANISMS) {
    if (!mechanism.pattern.test(symbolicText)) continue;

    const matchingSymbol = symbols.find((symbol) =>
      isLikelyMechanismSymbol(symbol, mechanism.mechanism)
    );
    if (!matchingSymbol) continue;

    terms.push({
      symbol: matchingSymbol,
      role: "mechanism",
      label: mechanism.label,
      mechanism: mechanism.mechanism,
      source,
    });
  }

  return terms;
}

function isLikelyMechanismSymbol(
  symbol: string,
  mechanism: EquilibriumCoverageMechanism
) {
  if (mechanism === "quality") return /^q(?:_|$)/i.test(symbol);
  if (mechanism === "subsidy") return /^s(?:_|$)/i.test(symbol);
  if (mechanism === "commission") return /^tau(?:_|$)|^\\tau/i.test(symbol);
  if (mechanism === "recommendation") return /^r(?:_|$)/i.test(symbol);
  if (mechanism === "verification") return /^e(?:_|$)/i.test(symbol);
  return false;
}

function shouldTrackMechanismSymbol({
  symbol,
  role,
  mechanism,
}: {
  symbol: string;
  role: SymbolDefinition["role"];
  mechanism: EquilibriumCoverageMechanism;
}) {
  if (
    mechanism === "quality" ||
    mechanism === "recommendation" ||
    mechanism === "verification"
  ) {
    return role === "decision" && isLikelyMechanismSymbol(symbol, mechanism);
  }
  if (role === "decision") return true;
  if (mechanism === "subsidy" || mechanism === "commission") return role !== "cost";
  return false;
}

function extractSymbolsFromText(text: string) {
  const normalizedText = text
    .replace(/\\frac\{[^}]*\}\{[^}]*\}/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\\([A-Za-z]+)_([A-Za-z0-9]+)/g, "$1_$2")
    .replace(/\\([A-Za-z]+)/g, "$1");
  const matches = normalizedText.match(/[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)?/g) ?? [];
  const stopwords = new Set([
    "A",
    "B",
    "FOC",
    "KKT",
    "Pi",
    "The",
    "Buyer",
    "and",
    "candidate",
    "demand",
    "depends",
    "for",
    "keeps",
    "on",
    "with",
    "from",
    "into",
    "solve",
    "sp",
    "S",
    "partial",
    "through",
    "utility",
    "alpha",
    "beta",
    "theta",
    "quality",
    "recommendation",
    "subsidy",
    "commission",
    "platform",
  ]);

  return sortSymbols(
    matches
      .map(normalizeSymbol)
      .filter((symbol) => symbol && !stopwords.has(symbol))
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

function sortSymbols(symbols: Iterable<string>) {
  return [...new Set([...symbols].map(normalizeSymbol).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right)
  );
}
