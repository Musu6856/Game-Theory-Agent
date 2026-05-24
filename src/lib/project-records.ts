import type { ProjectRow } from "@/db/schema";
import type {
  HotellingModel,
  ModelSourceMetadata,
  ModelSourceProvider,
  ResearchProject,
} from "./types";
import { normalizeSymbolRegistry } from "./symbol-governance.ts";

export function projectFromRow(row: ProjectRow): ResearchProject {
  return {
    id: row.id,
    createdAt: row.createdAt.getTime(),
    rawIdea: row.rawIdea,
    refinedIdea: row.refinedIdea,
    projectType: row.projectType,
    model: row.model,
    researchSession: row.researchSession ?? undefined,
    modelSource: sanitizeModelSourceMetadata(row.modelSource),
    wizardCompleted: row.wizardCompleted || row.sections.length > 0,
    sections: row.sections,
    references: row.references,
    background: row.background ?? undefined,
    literatureAnalyses: row.literatureAnalyses ?? [],
    hotellingModel: normalizeHotellingModel(row.hotellingModel),
    equilibriumResult: row.equilibriumResult ?? undefined,
    propertyAnalyses: row.propertyAnalyses ?? [],
  };
}

const MAX_IDEAL_LENGTH = 5000;
const MAX_REFINED_LENGTH = 20000;
const MAX_SECTIONS = 50;
const MAX_REFERENCES = 100;
const MAX_LITERATURE_ANALYSES = 20;
const MAX_PROPERTY_ANALYSES = 50;
const MAX_PROJECT_JSON_CHARS = 1_000_000;
const MAX_NESTED_STRING_CHARS = 100_000;
const MAX_NESTED_ARRAY_ITEMS = 500;
const MAX_NESTED_OBJECT_KEYS = 200;
const MAX_NESTED_DEPTH = 12;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeProjectPayload(value: unknown): ResearchProject | null {
  if (!value || typeof value !== "object") return null;

  const project = value as Partial<ResearchProject>;

  if (
    typeof project.id !== "string" ||
    typeof project.createdAt !== "number" ||
    typeof project.rawIdea !== "string" ||
    typeof project.refinedIdea !== "string" ||
    (project.wizardCompleted !== undefined &&
      typeof project.wizardCompleted !== "boolean") ||
    (project.projectType !== undefined &&
      project.projectType !== "exploration" &&
      project.projectType !== "formal" &&
      project.projectType !== "legacy") ||
    (project.literatureAnalyses !== undefined &&
      !Array.isArray(project.literatureAnalyses)) ||
    (project.propertyAnalyses !== undefined &&
      !Array.isArray(project.propertyAnalyses)) ||
    !Array.isArray(project.sections) ||
    !Array.isArray(project.references)
  ) {
    return null;
  }

  const literatureAnalyses = project.literatureAnalyses ?? [];
  const propertyAnalyses = project.propertyAnalyses ?? [];
  const modelSource = sanitizeModelSourceMetadata(project.modelSource);

  if (
    !UUID_RE.test(project.id) ||
    project.rawIdea.length > MAX_IDEAL_LENGTH ||
    project.refinedIdea.length > MAX_REFINED_LENGTH ||
    project.sections.length > MAX_SECTIONS ||
    project.references.length > MAX_REFERENCES ||
    literatureAnalyses.length > MAX_LITERATURE_ANALYSES ||
    propertyAnalyses.length > MAX_PROPERTY_ANALYSES ||
    !isBoundedProjectJson(project)
  ) {
    return null;
  }

  return {
    id: project.id,
    createdAt: project.createdAt,
    rawIdea: project.rawIdea,
    refinedIdea: project.refinedIdea,
    projectType: project.projectType ?? "legacy",
    model: project.model ?? null,
    researchSession: project.researchSession,
    modelSource,
    wizardCompleted: project.wizardCompleted ?? false,
    sections: project.sections,
    references: project.references,
    background: project.background,
    literatureAnalyses,
    hotellingModel: normalizeHotellingModel(project.hotellingModel),
    equilibriumResult: project.equilibriumResult,
    propertyAnalyses,
  };
}

function sanitizeModelSourceMetadata(
  value: unknown
): ModelSourceMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;

  const source = value as Partial<
    ModelSourceMetadata & {
      source?: unknown;
      provider?: unknown;
      model?: unknown;
      baseUrl?: unknown;
      hasBrowserApiKey?: unknown;
    }
  >;

  if (source.source === "paperforge") {
    return { source: "paperforge" };
  }

  if (source.source !== "own") return undefined;
  if (typeof source.provider !== "string") return undefined;
  if (!isModelSourceProvider(source.provider)) return undefined;

  const model = cleanString(source.model);
  if (!model) return undefined;

  const metadata: ModelSourceMetadata = {
    source: "own",
    provider: source.provider,
    model,
    hasBrowserApiKey: Boolean(source.hasBrowserApiKey),
  };
  const baseUrl = cleanEndpoint(source.baseUrl);
  if (baseUrl) metadata.baseUrl = baseUrl;

  return metadata;
}

function normalizeHotellingModel(
  value: ResearchProject["hotellingModel"] | null
): HotellingModel | undefined {
  if (!value) return undefined;

  return {
    ...value,
    symbols: normalizeSymbolRegistry(value.symbols),
  };
}

function isModelSourceProvider(value: string): value is ModelSourceProvider {
  return (
    value === "openai" ||
    value === "openai-compatible"
  );
}

function isBoundedProjectJson(value: unknown) {
  const budget = { chars: 0 };
  return isBoundedJsonValue(value, 0, budget);
}

function isBoundedJsonValue(
  value: unknown,
  depth: number,
  budget: { chars: number }
): boolean {
  if (budget.chars > MAX_PROJECT_JSON_CHARS) return false;
  if (depth > MAX_NESTED_DEPTH) return false;

  if (value === null || value === undefined) return true;

  if (typeof value === "string") {
    budget.chars += value.length;
    return (
      value.length <= MAX_NESTED_STRING_CHARS &&
      budget.chars <= MAX_PROJECT_JSON_CHARS
    );
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    if (value.length > MAX_NESTED_ARRAY_ITEMS) return false;
    return value.every((item) =>
      isBoundedJsonValue(item, depth + 1, budget)
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > MAX_NESTED_OBJECT_KEYS) return false;

    return entries.every(([key, nestedValue]) => {
      budget.chars += key.length;
      return (
        budget.chars <= MAX_PROJECT_JSON_CHARS &&
        isBoundedJsonValue(nestedValue, depth + 1, budget)
      );
    });
  }

  return false;
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanEndpoint(value: unknown) {
  const endpoint = cleanString(value);
  return endpoint ? endpoint.replace(/\/+$/, "") : "";
}
