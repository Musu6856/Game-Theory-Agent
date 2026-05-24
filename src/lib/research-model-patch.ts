import type {
  HotellingModel,
  ProfitFunction,
  ResearchAssetChange,
  SymbolDefinition,
  UtilityFunction,
} from "./types";
import {
  createSymbolDraft,
  normalizeSymbolDefinition,
  normalizeSymbolRegistry,
} from "./symbol-governance.ts";

const SYMBOL_FIELDS = new Set<keyof SymbolDefinition>([
  "id",
  "symbol",
  "baseSymbol",
  "subscript",
  "superscript",
  "codeName",
  "name",
  "meaning",
  "role",
  "side",
  "assumption",
  "recommended",
]);

const UTILITY_FUNCTION_FIELDS = new Set(["id", "side", "platform", "expression", "notes"]);
const PROFIT_FUNCTION_FIELDS = new Set(["id", "platform", "expression", "notes"]);

export function applyModelPatchToHotellingModel(
  model: HotellingModel,
  changes: ResearchAssetChange[]
): HotellingModel {
  return {
    ...model,
    sides: applyModelPatchToSides(model.sides, changes),
    platforms: applyModelPatchToPlatforms(model.platforms, changes),
    timing: applyModelPatchToTiming(model.timing, changes),
    demandDerivation: applyModelPatchToTextField(
      model.demandDerivation,
      changes,
      "demandDerivation"
    ),
    modelSetupDraft: applyModelPatchToTextField(
      model.modelSetupDraft,
      changes,
      "modelSetupDraft"
    ),
    utilityFunctions: applyFormulaArrayFieldPatch(
      model.utilityFunctions,
      changes,
      "utilityFunctions",
      UTILITY_FUNCTION_FIELDS
    ),
    profitFunctions: applyFormulaArrayFieldPatch(
      model.profitFunctions,
      changes,
      "profitFunctions",
      PROFIT_FUNCTION_FIELDS
    ),
    assumptions: applyModelPatchToAssumptions(model.assumptions, changes),
    symbols: applyModelPatchToSymbols(model.symbols, changes),
  };
}

function applyModelPatchToSides(
  currentValue: HotellingModel["sides"],
  changes: ResearchAssetChange[]
) {
  let nextValue = { ...currentValue };

  for (const change of changes) {
    const normalized = normalizeModelPath(change.path);
    if (normalized === "sides" && isRecord(change.value)) {
      const consumerSideName = normalizeOptionalString(
        change.value.consumerSideName
      );
      const merchantSideName = normalizeOptionalString(
        change.value.merchantSideName
      );
      nextValue = {
        consumerSideName: consumerSideName ?? nextValue.consumerSideName,
        merchantSideName: merchantSideName ?? nextValue.merchantSideName,
      };
    }

    if (normalized === "sides.consumerSideName") {
      nextValue = {
        ...nextValue,
        consumerSideName:
          normalizeOptionalString(change.value) ?? nextValue.consumerSideName,
      };
    }

    if (normalized === "sides.merchantSideName") {
      nextValue = {
        ...nextValue,
        merchantSideName:
          normalizeOptionalString(change.value) ?? nextValue.merchantSideName,
      };
    }
  }

  return nextValue;
}

function applyModelPatchToPlatforms(
  currentValue: string[],
  changes: ResearchAssetChange[]
) {
  let nextValue = [...currentValue];

  for (const change of changes) {
    if (normalizeModelPath(change.path) !== "platforms") continue;

    if (change.kind === "remove") {
      nextValue = [];
      continue;
    }

    if (Array.isArray(change.value)) {
      const platforms = change.value
        .map(normalizeOptionalString)
        .filter((value): value is string => Boolean(value));
      nextValue =
        change.kind === "append" ? [...nextValue, ...platforms] : platforms;
      continue;
    }

    const platform = normalizeOptionalString(change.value);
    if (platform) nextValue = [...nextValue, platform];
  }

  return nextValue.length > 0 ? nextValue : currentValue;
}

function applyModelPatchToTiming(
  currentValue: HotellingModel["timing"],
  changes: ResearchAssetChange[]
) {
  let nextValue = [...currentValue];

  for (const change of changes) {
    const normalized = normalizeModelPath(change.path);
    if (normalized !== "timing") continue;

    if (change.kind === "remove") {
      nextValue = [];
      continue;
    }

    if (Array.isArray(change.value)) {
      const stages = change.value.filter(isModelStage);
      nextValue =
        change.kind === "append" ? [...nextValue, ...stages] : stages;
      continue;
    }

    if (isModelStage(change.value)) {
      nextValue = [...nextValue, change.value];
    }
  }

  return nextValue.length > 0 ? nextValue : currentValue;
}

function applyModelPatchToTextField(
  currentValue: string,
  changes: ResearchAssetChange[],
  fieldName: "demandDerivation" | "modelSetupDraft"
) {
  let nextValue = currentValue;

  for (const change of changes) {
    if (!targetsModelTextField(change.path, fieldName)) continue;

    if (change.kind === "remove") {
      nextValue = "";
      continue;
    }

    const value = typeof change.value === "string" ? change.value.trim() : "";
    if (!value) continue;

    nextValue =
      change.kind === "append"
        ? [nextValue.trim(), value].filter(Boolean).join("\n\n")
        : value;
  }

  return nextValue;
}

function targetsModelTextField(
  path: string,
  fieldName: "demandDerivation" | "modelSetupDraft"
) {
  const normalized = normalizeModelPath(path);
  return normalized === fieldName;
}

function normalizeModelPath(path: string) {
  return path.trim().replace(/^hotellingModel\./, "");
}

function normalizeOptionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function isModelStage(value: unknown): value is HotellingModel["timing"][number] {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.order === "number" &&
    Number.isFinite(value.order) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    Array.isArray(value.decisions) &&
    value.decisions.every((entry) => typeof entry === "string")
  );
}

function applyFormulaArrayFieldPatch<T extends UtilityFunction | ProfitFunction>(
  items: T[],
  changes: ResearchAssetChange[],
  fieldName: "utilityFunctions" | "profitFunctions",
  allowedFields: Set<string>
) {
  let nextItems = [...items];

  for (const change of changes) {
    const target = parseObjectArrayFieldTarget(
      change.path,
      fieldName,
      allowedFields
    );
    if (!target) continue;

    if (target.kind === "array") {
      if (Array.isArray(change.value)) {
        const parsed = change.value.filter(isRecord) as unknown as T[];
        nextItems = change.kind === "append" ? [...nextItems, ...parsed] : parsed;
        continue;
      }

      if (change.kind === "remove") {
        nextItems = [];
        continue;
      }

      if (isRecord(change.value)) {
        nextItems = [...nextItems, change.value as unknown as T];
      }
      continue;
    }

    const index = resolveObjectArrayFieldIndex(nextItems, target.selector);
    if (change.kind === "remove" && !target.field) {
      if (index >= 0) {
        nextItems = nextItems.filter((_, itemIndex) => itemIndex !== index);
      }
      continue;
    }

    if (index < 0 || !target.field) continue;

    const current = nextItems[index];
    const value = change.kind === "remove" ? "" : change.value;
    nextItems[index] = {
      ...current,
      [target.field]: value,
    } as T;
  }

  return nextItems;
}

function parseObjectArrayFieldTarget(
  path: string,
  fieldName: "utilityFunctions" | "profitFunctions",
  allowedFields: Set<string>
):
  | { kind: "array" }
  | { kind: "item"; selector: string | number; field?: string }
  | null {
  const normalized = path.trim().replace(/^hotellingModel\./, "");
  if (normalized === fieldName) return { kind: "array" };

  const bracketMatch = normalized.match(
    new RegExp(`^${fieldName}\\[["']?([^\\]"']+)["']?\\](?:\\.([A-Za-z_][A-Za-z0-9_]*))?$`)
  );
  if (!bracketMatch) return null;

  const field = bracketMatch[2];
  if (field && !allowedFields.has(field)) return null;

  return {
    kind: "item",
    selector: /^\d+$/.test(bracketMatch[1])
      ? Number(bracketMatch[1])
      : bracketMatch[1],
    ...(field ? { field } : {}),
  };
}

function resolveObjectArrayFieldIndex<T extends { id: string }>(
  items: T[],
  selector: string | number
) {
  if (typeof selector === "number") {
    return selector >= 0 && selector < items.length ? selector : -1;
  }

  return items.findIndex((item) => item.id === selector);
}

export function applyModelPatchToAssumptions(
  assumptions: string[],
  changes: ResearchAssetChange[]
) {
  let nextAssumptions = [...assumptions];

  for (const change of changes) {
    if (!change.path.includes("assumptions")) continue;

    if (Array.isArray(change.value)) {
      nextAssumptions = change.value.map(String).filter(Boolean);
      continue;
    }

    const value = typeof change.value === "string" ? change.value.trim() : "";
    const indexMatch = change.path.match(/assumptions\[(\d+)\]/);
    const index = indexMatch ? Number(indexMatch[1]) : -1;

    if (change.kind === "remove") {
      nextAssumptions =
        index >= 0
          ? nextAssumptions.filter((_, itemIndex) => itemIndex !== index)
          : nextAssumptions.filter((assumption) => assumption !== value);
      continue;
    }

    if (!value) continue;

    if (change.kind === "append" || index < 0) {
      nextAssumptions.push(value);
      continue;
    }

    nextAssumptions[index] = value;
  }

  return nextAssumptions.filter(Boolean);
}

export function applyModelPatchToSymbols(
  symbols: SymbolDefinition[],
  changes: ResearchAssetChange[]
) {
  let nextSymbols = normalizeSymbolRegistry(symbols);

  for (const change of changes) {
    const target = parseSymbolPatchPath(change.path);
    if (!target) continue;

    if (target.kind === "registry") {
      if (Array.isArray(change.value)) {
        const parsed = normalizeSymbolRegistry(change.value);
        nextSymbols =
          change.kind === "append" ? [...nextSymbols, ...parsed] : parsed;
        continue;
      }

      if (change.kind === "remove") {
        nextSymbols = [];
        continue;
      }

      const nextSymbol = createSymbolFromPatchValue(change.value, nextSymbols.length);
      if (nextSymbol) nextSymbols = [...nextSymbols, nextSymbol];
      continue;
    }

    const index = resolveSymbolIndex(nextSymbols, target.selector);

    if (change.kind === "remove" && !target.field) {
      if (index >= 0) {
        nextSymbols = nextSymbols.filter((_, itemIndex) => itemIndex !== index);
      }
      continue;
    }

    if (index < 0) {
      const nextSymbol = createSymbolFromMissingTarget(target, change);
      if (nextSymbol) nextSymbols = [...nextSymbols, nextSymbol];
      continue;
    }

    const current = nextSymbols[index];
    const patched = patchSymbol(current, target.field, change, index);
    if (patched) nextSymbols[index] = patched;
  }

  return normalizeSymbolRegistry(nextSymbols);
}

type SymbolPatchTarget =
  | { kind: "registry" }
  | { kind: "symbol"; selector: string | number; field?: keyof SymbolDefinition };

function parseSymbolPatchPath(path: string): SymbolPatchTarget | null {
  const normalized = path.trim();
  if (!/(^|\.)(symbols|symbolRegistry)(\.|\[|$)/i.test(normalized)) {
    return null;
  }

  if (/(^|\.)(symbols|symbolRegistry)$/i.test(normalized)) {
    return { kind: "registry" };
  }

  const bracketMatch = normalized.match(
    /(?:^|\.)(?:symbols|symbolRegistry)\[["']?([^\]"']+)["']?\](?:\.([A-Za-z_][A-Za-z0-9_]*))?$/i
  );
  if (bracketMatch) {
    const selector = /^\d+$/.test(bracketMatch[1])
      ? Number(bracketMatch[1])
      : bracketMatch[1];
    return toSymbolPatchTarget(selector, bracketMatch[2]);
  }

  const dotMatch = normalized.match(
    /(?:^|\.)(?:symbols|symbolRegistry)\.([A-Za-z0-9_\\{}^]+)(?:\.([A-Za-z_][A-Za-z0-9_]*))?$/i
  );
  if (dotMatch) {
    return toSymbolPatchTarget(dotMatch[1], dotMatch[2]);
  }

  return null;
}

function toSymbolPatchTarget(
  selector: string | number,
  rawField?: string
): SymbolPatchTarget | null {
  const field = rawField as keyof SymbolDefinition | undefined;
  if (field && !SYMBOL_FIELDS.has(field)) return null;
  return { kind: "symbol", selector, ...(field ? { field } : {}) };
}

function resolveSymbolIndex(
  symbols: SymbolDefinition[],
  selector: string | number
) {
  if (typeof selector === "number") {
    return selector >= 0 && selector < symbols.length ? selector : -1;
  }

  const needle = normalizeSymbolSelector(selector);
  return symbols.findIndex(
    (symbol) => {
      const keys = [
        symbol.id,
        symbol.codeName,
        symbol.symbol,
        symbol.baseSymbol,
        formatSymbolNotation(symbol),
      ].map(normalizeSymbolSelector);

      return keys.includes(needle);
    }
  );
}

function patchSymbol(
  current: SymbolDefinition,
  field: keyof SymbolDefinition | undefined,
  change: ResearchAssetChange,
  index: number
) {
  if (!field) {
    return createSymbolFromPatchValue(change.value, index, current);
  }

  const nextValue = change.kind === "remove" ? emptySymbolField(field) : change.value;
  const candidate = {
    ...current,
    [field]: nextValue,
  };

  return normalizePatchedSymbol(candidate, index, field);
}

function createSymbolFromMissingTarget(
  target: Extract<SymbolPatchTarget, { kind: "symbol" }>,
  change: ResearchAssetChange
) {
  if (change.kind === "remove") return null;

  const selector = String(target.selector);
  const seed = createSymbolDraft(symbolSeedFromNotation(selector));

  if (target.field) {
    return normalizePatchedSymbol(
      {
        ...seed,
        [target.field]: change.value,
      },
      0,
      target.field
    );
  }

  return createSymbolFromPatchValue(change.value, 0, seed);
}

function createSymbolFromPatchValue(
  value: unknown,
  index: number,
  base?: SymbolDefinition
) {
  if (isRecord(value)) {
    return normalizePatchedSymbol({ ...(base ?? {}), ...value }, index);
  }

  if (typeof value === "string" && value.trim()) {
    return normalizePatchedSymbol(
      {
        ...(base ?? {}),
        ...symbolSeedFromNotation(value),
      },
      index,
      "symbol"
    );
  }

  return base ? normalizeSymbolDefinition(base, index) : null;
}

function normalizePatchedSymbol(
  value: Record<string, unknown>,
  index: number,
  changedField?: keyof SymbolDefinition
) {
  const candidate = { ...value };

  if (changedField === "symbol" && typeof candidate.symbol === "string") {
    const parsed = parseNotation(candidate.symbol);
    candidate.baseSymbol = parsed.baseSymbol;
    candidate.subscript = parsed.subscript;
    candidate.superscript = parsed.superscript;
    candidate.codeName = toCodeName(parsed);
  } else if (
    changedField === "baseSymbol" ||
    changedField === "subscript" ||
    changedField === "superscript"
  ) {
    const notation = formatSymbolNotation({
      baseSymbol: String(candidate.baseSymbol ?? "x"),
      subscript: String(candidate.subscript ?? ""),
      superscript: String(candidate.superscript ?? ""),
    });
    candidate.symbol = notation;
    candidate.codeName = toCodeName({
      baseSymbol: String(candidate.baseSymbol ?? "x"),
      subscript: String(candidate.subscript ?? ""),
      superscript: String(candidate.superscript ?? ""),
    });
  }

  return normalizeSymbolDefinition(candidate, index);
}

function symbolSeedFromNotation(notation: string) {
  const parsed = parseNotation(notation);
  return {
    symbol: formatSymbolNotation(parsed),
    baseSymbol: parsed.baseSymbol,
    subscript: parsed.subscript,
    superscript: parsed.superscript,
    codeName: toCodeName(parsed),
    name: formatSymbolNotation(parsed),
    meaning: "",
    assumption: "real",
  };
}

function parseNotation(notation: string) {
  const cleaned = notation
    .trim()
    .replace(/^\$|\$$/g, "")
    .replace(/^\\\(|\\\)$/g, "")
    .trim();
  const match = cleaned.match(/^(.+?)(?:_\{?([^}^{]+)\}?)?(?:\^\{?([^}^{]+)\}?)?$/);

  return {
    baseSymbol: match?.[1]?.trim() || cleaned || "x",
    subscript: match?.[2]?.trim() ?? "",
    superscript: match?.[3]?.trim() ?? "",
  };
}

function formatSymbolNotation({
  baseSymbol,
  subscript,
  superscript,
}: {
  baseSymbol: string;
  subscript?: string;
  superscript?: string;
}) {
  const base = baseSymbol.trim() || "x";
  const sub = subscript?.trim();
  const sup = superscript?.trim();
  return `${base}${sub ? `_${sub}` : ""}${sup ? `^${sup}` : ""}`;
}

function toCodeName({
  baseSymbol,
  subscript,
  superscript,
}: {
  baseSymbol: string;
  subscript?: string;
  superscript?: string;
}) {
  return [baseSymbol, subscript, superscript]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("_")
    .replace(/\\/g, "")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeSymbolSelector(value: string) {
  return value
    .trim()
    .replace(/^\$|\$$/g, "")
    .replace(/^\\\(|\\\)$/g, "")
    .replace(/^\\\[|\\\]$/g, "")
    .replace(/^\\+/, "")
    .replace(/[{}]/g, "")
    .toLowerCase();
}

function emptySymbolField(field: keyof SymbolDefinition) {
  if (field === "recommended") return false;
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
