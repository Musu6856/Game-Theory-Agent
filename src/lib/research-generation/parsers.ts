import type {
  EquilibriumResult,
  HotellingModel,
  PropertyAnalysis,
  ResearchDirection,
  ResearchProject,
  ResearchSessionAssetSummary,
  SymbolDefinition,
} from "../types";
import { normalizeSymbolRegistry } from "../symbol-governance.ts";
import {
  isSymbolicEquilibriumResult,
  isSymbolicPropertyAnalysis,
} from "./quality-gates.ts";

export function extractFirstJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");

  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(source.slice(start, index + 1));
          return isRecord(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}


export function parseDirections(value: unknown): ResearchDirection[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) return null;

  const directions = value.map((entry) => {
    if (!isRecord(entry)) return null;
    const id = parseText(entry.id);
    const title = parseText(entry.title);
    const summary = parseText(entry.summary);
    const model =
      parseText(entry.model) ??
      parseText(entry["模型"]) ??
      inferDirectionModel(title, summary);
    const contribution =
      parseText(entry.contribution) ??
      parseText(entry["贡献"]) ??
      parseText(entry["researchContribution"]);
    const evidenceSourceIds = parseStringArray(entry.evidenceSourceIds);
    const evidenceNote = parseText(entry.evidenceNote);

    if (!id || !title || !summary || !model || !contribution) return null;

    return {
      id,
      title,
      summary,
      model,
      contribution,
      recommended: entry.recommended === true,
      ...(evidenceSourceIds ? { evidenceSourceIds } : {}),
      ...(evidenceNote ? { evidenceNote } : {}),
    };
  });

  if (directions.some((direction) => !direction)) return null;

  const parsed = directions as ResearchDirection[];
  if (!parsed.some((direction) => direction.recommended)) {
    parsed[0] = { ...parsed[0], recommended: true };
  }

  return parsed;
}

function inferDirectionModel(title: string | null, summary: string | null) {
  const text = `${title ?? ""} ${summary ?? ""}`;

  if (/hotelling|霍特林/i.test(text)) return "Hotelling 平台竞争模型";
  if (/双边|two-sided/i.test(text)) return "双边平台竞争模型";
  if (/信号|signal/i.test(text)) return "信号博弈模型";
  return null;
}


export function parseHotellingModel(
  value: unknown,
  fallbackSymbols: SymbolDefinition[] = []
): HotellingModel | null {
  if (!isRecord(value)) return null;
  const sides = isRecord(value.sides) ? value.sides : null;
  const consumerSideName = parseText(sides?.consumerSideName);
  const merchantSideName = parseText(sides?.merchantSideName);
  const platforms = parseStringArray(value.platforms);
  const timing = Array.isArray(value.timing) ? value.timing : null;
  const utilityFunctions = Array.isArray(value.utilityFunctions) ? value.utilityFunctions : null;
  const profitFunctions = Array.isArray(value.profitFunctions) ? value.profitFunctions : null;
  const demandDerivation = parseText(value.demandDerivation);
  const assumptions = parseStringArray(value.assumptions);
  const modelSetupDraft = parseText(value.modelSetupDraft);

  if (
    !consumerSideName ||
    !merchantSideName ||
    !platforms ||
    !timing ||
    !utilityFunctions ||
    !profitFunctions ||
    !demandDerivation ||
    !assumptions ||
    !modelSetupDraft
  ) {
    return null;
  }

  return {
    symbols:
      normalizeSymbolRegistry(value.symbols).length > 0
        ? normalizeSymbolRegistry(value.symbols)
        : normalizeSymbolRegistry(fallbackSymbols),
    sides: { consumerSideName, merchantSideName },
    platforms,
    timing: timing as HotellingModel["timing"],
    utilityFunctions: utilityFunctions as HotellingModel["utilityFunctions"],
    demandDerivation,
    profitFunctions: profitFunctions as HotellingModel["profitFunctions"],
    assumptions,
    modelSetupDraft,
  };
}

export function parseEquilibriumResult(value: unknown): EquilibriumResult | null {
  if (!isRecord(value)) return null;

  const status = parseEquilibriumStatus(value.status);
  const concept = parseText(value.concept);
  const solvingSteps = parseStringArray(value.solvingSteps);
  const focs = parseStringArray(value.focs);
  const conditions = parseStringArray(value.conditions);
  const closedForm = parseText(value.closedForm);
  const derivation = parseText(value.derivation);
  const code = parseText(value.code);
  const warnings = parseStringArray(value.warnings) ?? [];
  const solverScratchpad = parseEquilibriumSolverScratchpad(
    value.solverScratchpad
  );

  if (
    !status ||
    !concept ||
    !solvingSteps ||
    !focs ||
    !conditions ||
    !closedForm ||
    !derivation ||
    !code
  ) {
    return null;
  }

  const result: EquilibriumResult = {
    status,
    concept,
    solvingSteps,
    focs,
    conditions,
    closedForm,
    derivation,
    code,
    warnings,
    ...(solverScratchpad ? { solverScratchpad } : {}),
  };

  return isSymbolicEquilibriumResult(result) ? result : null;
}

export function parsePropertyAnalyses(value: unknown): PropertyAnalysis[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length < 3 || value.length > 5) return null;
  const analyses = value.map(parsePropertyAnalysis);
  if (analyses.some((analysis) => !analysis)) return null;
  return analyses as PropertyAnalysis[];
}

export function parsePropertyAnalysis(value: unknown): PropertyAnalysis | null {
  if (!isRecord(value)) return null;

  const id = parseText(value.id);
  const target = parseText(value.target);
  const parameter = parseText(value.parameter);
  const operation = parsePropertyOperation(value.operation);
  const symbolicResult = parseText(value.symbolicResult);
  const signCondition = parseText(value.signCondition);
  const propositionDraft = parseText(value.propositionDraft);
  const proofSketch = parseText(value.proofSketch);
  const intuition = parseText(value.intuition);
  const warnings = parseStringArray(value.warnings) ?? [];

  if (
    !id ||
    !target ||
    !parameter ||
    !operation ||
    !symbolicResult ||
    !signCondition ||
    !propositionDraft ||
    !proofSketch ||
    !intuition
  ) {
    return null;
  }

  const analysis: PropertyAnalysis = {
    id,
    target,
    parameter,
    operation,
    symbolicResult,
    signCondition,
    propositionDraft,
    proofSketch,
    intuition,
    warnings,
  };

  return isSymbolicPropertyAnalysis(analysis) ? analysis : null;
}

function parseEquilibriumStatus(
  value: unknown
): EquilibriumResult["status"] | null {
  if (
    value === "idle" ||
    value === "solved" ||
    value === "needs_revision" ||
    value === "derivation_draft" ||
    value === "implicit_system" ||
    value === "reaction_functions" ||
    value === "failed_with_reason" ||
    value === "needs_model_clarification" ||
    value === "symbolic_failure"
  ) {
    return value;
  }
  return null;
}

function parseEquilibriumSolverScratchpad(
  value: unknown
): EquilibriumResult["solverScratchpad"] | null {
  if (!isRecord(value)) return null;

  const status = parseEquilibriumDraftStatus(value.status);
  const implicitSystem = parseStringArray(value.implicitSystem);
  const reactionFunctions = parseStringArray(value.reactionFunctions);
  const failedWithReason = parseText(value.failedWithReason);
  const needsModelClarification = parseStringArray(value.needsModelClarification);
  const attemptedSteps = parseStringArray(value.attemptedSteps);
  const scratchpad = {
    ...(status ? { status } : {}),
    ...(implicitSystem ? { implicitSystem } : {}),
    ...(reactionFunctions ? { reactionFunctions } : {}),
    ...(failedWithReason ? { failedWithReason } : {}),
    ...(needsModelClarification ? { needsModelClarification } : {}),
    ...(attemptedSteps ? { attemptedSteps } : {}),
  };

  return Object.keys(scratchpad).length > 0 ? scratchpad : null;
}

function parseEquilibriumDraftStatus(
  value: unknown
): NonNullable<EquilibriumResult["solverScratchpad"]>["status"] | null {
  return value === "derivation_draft" ||
    value === "implicit_system" ||
    value === "reaction_functions" ||
    value === "failed_with_reason" ||
    value === "needs_model_clarification" ||
    value === "symbolic_failure"
    ? value
    : null;
}

function parsePropertyOperation(
  value: unknown
): PropertyAnalysis["operation"] | null {
  if (typeof value === "string" && /∂|\\partial|differentiat/i.test(value)) {
    return "differentiate";
  }

  if (
    value === "differentiate" ||
    value === "compare" ||
    value === "threshold" ||
    value === "custom"
  ) {
    return value;
  }
  return null;
}

export function parseAssetSummary(
  value: unknown,
  model: HotellingModel
): ResearchSessionAssetSummary | null {
  if (!isRecord(value)) return null;

  return {
    confirmedAssumptions: parseStringArray(value.confirmedAssumptions) ?? model.assumptions,
    utilityFunctions:
      parseStringArray(value.utilityFunctions) ??
      model.utilityFunctions.map((entry) => `$${entry.expression}$`),
    equilibriumStatus: "等待模型确认",
    nextActions: parseStringArray(value.nextActions) ?? [
      "确认模型设定",
      "检查效用函数",
      "准备符号化一阶条件",
    ],
    pendingDecision: {
      kind: "answer_model_question",
      prompt:
        parseText(isRecord(value.pendingDecision) ? value.pendingDecision.prompt : undefined) ??
        "请确认当前模型设定，之后进入符号化均衡求解。",
    },
  };
}

export function createModelAssetSummary(
  direction: ResearchDirection | undefined,
  model: HotellingModel
): ResearchSessionAssetSummary {
  return {
    currentDirection: direction,
    confirmedAssumptions: model.assumptions,
    utilityFunctions: model.utilityFunctions.map((entry) => `$${entry.expression}$`),
    equilibriumStatus: "等待模型确认",
    nextActions: ["确认模型设定", "检查效用函数", "准备符号化一阶条件"],
    pendingDecision: {
      kind: "answer_model_question",
      prompt: "请确认当前模型设定，之后进入符号化均衡求解。",
    },
  };
}

export function findDirection(project: ResearchProject, directionId: string | undefined) {
  if (!directionId) return undefined;
  return project.researchSession?.directions.find((direction) => direction.id === directionId);
}

export function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.map(parseText);
  if (strings.some((entry) => !entry)) return null;
  return strings as string[];
}

export function parseText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
