import type {
  ResearchAssetChange,
  ResearchAssetChangeKind,
  ResearchAssetKind,
  ResearchAssetPatch,
  ResearchAssetPatchInput,
  ResearchAssetPatchStatus,
} from "./types";

const VALID_KINDS = new Set<ResearchAssetKind>([
  "model",
  "equilibrium",
  "properties",
  "paper",
]);

const VALID_CHANGE_KINDS = new Set<ResearchAssetChangeKind>([
  "replace",
  "append",
  "remove",
]);

const VALID_STATUSES = new Set<ResearchAssetPatchStatus>([
  "proposed",
  "applied",
  "rejected",
]);

export function createResearchAssetPatch(
  input: ResearchAssetPatchInput
): ResearchAssetPatch {
  const candidate = {
    id: normalizeId(input.id),
    kind: input.kind,
    summary: normalizeText(input.summary),
    changes: input.changes.map(normalizeResearchAssetChange),
    status: "proposed" as const,
    createdAt: normalizeTimestamp(input.createdAt),
    sourceMessageId: normalizeOptionalText(input.sourceMessageId),
  };

  const validated = validateResearchAssetPatch(candidate);
  if (!validated) {
    throw new Error("Invalid research asset patch.");
  }

  return validated;
}

export function validateResearchAssetPatch(
  value: unknown
): ResearchAssetPatch | null {
  if (!isRecord(value)) return null;

  const id = normalizeOptionalText(value.id);
  const kind = parseAssetKind(value.kind);
  const summary = normalizeOptionalText(value.summary);
  const status = parsePatchStatus(value.status);
  const createdAt = normalizeNumericTimestamp(value.createdAt);
  const sourceMessageId = normalizeOptionalText(value.sourceMessageId);
  const appliedAt = normalizeNumericTimestamp(value.appliedAt);
  const rejectedAt = normalizeNumericTimestamp(value.rejectedAt);
  const rejectionReason = normalizeOptionalText(value.rejectionReason);
  const changes = parseChanges(value.changes);

  if (!id || !kind || !summary || !status || !createdAt || !changes) {
    return null;
  }

  const patch: ResearchAssetPatch = {
    id,
    kind,
    summary,
    changes,
    status,
    createdAt,
    ...(sourceMessageId ? { sourceMessageId } : {}),
    ...(appliedAt ? { appliedAt } : {}),
    ...(rejectedAt ? { rejectedAt } : {}),
    ...(rejectionReason ? { rejectionReason } : {}),
  };

  if (!isValidResearchAssetPatchShape(patch)) return null;

  if (patch.status === "rejected" && !patch.rejectedAt) return null;

  return patch;
}

export function rejectResearchAssetPatch(
  patch: ResearchAssetPatch,
  rejectionReason: string,
  rejectedAt = Date.now()
): ResearchAssetPatch {
  return {
    ...patch,
    status: "rejected",
    rejectedAt,
    rejectionReason: normalizeText(rejectionReason),
  };
}

function parseChanges(value: unknown): ResearchAssetChange[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  const changes = value.map((entry) => normalizeResearchAssetChange(entry));
  if (changes.some((change) => !isValidResearchAssetChange(change))) {
    return null;
  }

  return changes;
}

function normalizeResearchAssetChange(
  value: ResearchAssetChange | Record<string, unknown>
): ResearchAssetChange {
  return {
    kind: parseChangeKind(value.kind) ?? "replace",
    path: normalizeText(value.path),
    ...(value.value !== undefined ? { value: value.value } : {}),
    ...(value.previousValue !== undefined
      ? { previousValue: value.previousValue }
      : {}),
    ...(normalizeOptionalText(value.note) ? { note: normalizeOptionalText(value.note) } : {}),
  };
}

function parseAssetKind(value: unknown): ResearchAssetKind | null {
  return typeof value === "string" && VALID_KINDS.has(value as ResearchAssetKind)
    ? (value as ResearchAssetKind)
    : null;
}

function parseChangeKind(
  value: unknown
): ResearchAssetChangeKind | null {
  return typeof value === "string" &&
    VALID_CHANGE_KINDS.has(value as ResearchAssetChangeKind)
    ? (value as ResearchAssetChangeKind)
    : null;
}

function parsePatchStatus(
  value: unknown
): ResearchAssetPatchStatus | null {
  return typeof value === "string" && VALID_STATUSES.has(value as ResearchAssetPatchStatus)
    ? (value as ResearchAssetPatchStatus)
    : null;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeText(value: unknown): string {
  return normalizeOptionalText(value) ?? "";
}

function normalizeId(value: unknown): string {
  return normalizeText(value) || createPatchId();
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : Date.now();
}

function normalizeNumericTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function createPatchId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `patch-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidResearchAssetChange(change: ResearchAssetChange): boolean {
  return (
    VALID_CHANGE_KINDS.has(change.kind) &&
    Boolean(change.path.trim()) &&
    (!change.note || change.note.trim().length > 0)
  );
}

function isValidResearchAssetPatchShape(patch: ResearchAssetPatch): boolean {
  return (
    VALID_KINDS.has(patch.kind) &&
    VALID_STATUSES.has(patch.status) &&
    Boolean(patch.id.trim()) &&
    Boolean(patch.summary.trim()) &&
    patch.changes.length > 0 &&
    patch.changes.every(isValidResearchAssetChange)
  );
}
