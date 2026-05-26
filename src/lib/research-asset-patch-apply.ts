import { markResearchAssetsStaleAfterModelEdit } from "./research-flow.ts";
import { recordPatchReviewVersion } from "./research-agent/version-history.ts";
import { applyModelPatchToHotellingModel } from "./research-model-patch.ts";
import { getQuickReviewAssetPatchesForApply } from "./research-pending-patches-layout.ts";
import {
  createInitialResearchSession,
  createSymbolicEquilibriumScaffoldResult,
} from "./research-session.ts";
import type {
  EquilibriumResult,
  PaperSection,
  PropertyAnalysis,
  ResearchAssetChange,
  ResearchAssetPatch,
  ResearchAssetPatchStatus,
  ResearchProject,
} from "./types";

type ApplyResearchAssetPatchOptions = {
  now?: number;
};

type ApplyQuickReviewAssetPatchesResult = {
  project: ResearchProject;
  appliedCount: number;
};

const EQUILIBRIUM_ARRAY_FIELD_NAMES = [
  "solvingSteps",
  "focs",
  "conditions",
  "warnings",
] as const;

const EQUILIBRIUM_TEXT_FIELD_NAMES = [
  "concept",
  "closedForm",
  "derivation",
  "code",
] as const;

const PROPERTY_TEXT_FIELD_NAMES = [
  "id",
  "target",
  "parameter",
  "symbolicResult",
  "signCondition",
  "propositionDraft",
  "proofSketch",
  "intuition",
] as const;

type EquilibriumArrayField = (typeof EQUILIBRIUM_ARRAY_FIELD_NAMES)[number];
type EquilibriumTextField = (typeof EQUILIBRIUM_TEXT_FIELD_NAMES)[number];
type PropertyTextField = (typeof PROPERTY_TEXT_FIELD_NAMES)[number];

const EQUILIBRIUM_ARRAY_FIELDS: ReadonlySet<keyof EquilibriumResult> = new Set(
  EQUILIBRIUM_ARRAY_FIELD_NAMES
);
const EQUILIBRIUM_TEXT_FIELDS: ReadonlySet<keyof EquilibriumResult> = new Set(
  EQUILIBRIUM_TEXT_FIELD_NAMES
);
const PROPERTY_TEXT_FIELDS: ReadonlySet<keyof PropertyAnalysis> = new Set(
  PROPERTY_TEXT_FIELD_NAMES
);

export function applyResearchAssetPatchToProject(
  project: ResearchProject,
  patch: ResearchAssetPatch,
  options: ApplyResearchAssetPatchOptions = {}
): ResearchProject {
  const now = options.now ?? Date.now();
  const projectWithSession = ensureResearchSession(project);

  if (!hasApplicableAssetPatchChange(projectWithSession, patch)) {
    return appendUnappliedPatchWarning(projectWithSession, patch, now);
  }

  const projectWithAppliedStatus = recordPatchReviewVersion(
    markProjectPatchStatus(
      projectWithSession,
      patch.id,
      "applied",
      now
    ),
    {
      patch,
      status: "applied",
      now,
    }
  );

  if (patch.kind === "model" && projectWithAppliedStatus.hotellingModel) {
    return applyModelAssetPatch(projectWithAppliedStatus, patch, now);
  }

  if (patch.kind === "equilibrium") {
    return applyEquilibriumAssetPatch(projectWithAppliedStatus, patch, now);
  }

  if (patch.kind === "properties") {
    return applyPropertiesAssetPatch(projectWithAppliedStatus, patch, now);
  }

  if (patch.kind === "paper") {
    return applyPaperAssetPatch(projectWithAppliedStatus, patch, now);
  }

  return projectWithAppliedStatus;
}

function hasApplicableAssetPatchChange(
  project: ResearchProject,
  patch: ResearchAssetPatch
) {
  switch (patch.kind) {
    case "model": {
      if (!project.hotellingModel) return false;
      const nextModel = applyModelPatchToHotellingModel(
        project.hotellingModel,
        patch.changes
      );
      return !areJsonEqual(nextModel, project.hotellingModel);
    }
    case "equilibrium": {
      const current = project.equilibriumResult ?? createSymbolicEquilibriumScaffoldResult();
      const next = applyEquilibriumChanges(current, patch.changes);
      return !areJsonEqual(next, current);
    }
    case "properties": {
      const current = project.propertyAnalyses ?? [];
      const next = applyPropertyChanges(current, patch.changes);
      return !areJsonEqual(next, current);
    }
    case "paper": {
      const next = applyPaperSectionChanges(project.sections ?? [], patch.changes);
      return !areJsonEqual(next, project.sections ?? []);
    }
  }
}

function appendUnappliedPatchWarning(
  project: ResearchProject,
  patch: ResearchAssetPatch,
  now: number
): ResearchProject {
  const session = project.researchSession ?? createInitialResearchSession(project.rawIdea);

  return {
    ...project,
    researchSession: {
      ...session,
      messages: [
        ...session.messages,
        createAssistantMessage(
          "msg-asset-patch-not-applied",
          `这条${formatPatchKind(patch.kind)}修改建议没有识别到可应用的修改路径，暂时没有写入右侧资产。请重新生成修改建议或调整 patch 路径后再应用。`,
          now
        ),
      ],
    },
  };
}

function areJsonEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function formatPatchKind(kind: ResearchAssetPatch["kind"]) {
  switch (kind) {
    case "model":
      return "模型";
    case "equilibrium":
      return "均衡";
    case "properties":
      return "性质分析";
    case "paper":
      return "论文草稿";
  }
}

export function applyQuickReviewAssetPatchesToProject(
  project: ResearchProject,
  patchIds: string[],
  options: ApplyResearchAssetPatchOptions = {}
): ApplyQuickReviewAssetPatchesResult {
  const requestedIds = new Set(patchIds);
  const session = project.researchSession ?? createInitialResearchSession(project.rawIdea);
  const quickReviewPatches = getQuickReviewAssetPatchesForApply(
    session.assetPatches ?? []
  ).filter((patch) => requestedIds.has(patch.id));

  let nextProject = project;
  const now = options.now ?? Date.now();
  quickReviewPatches.forEach((patch, index) => {
    nextProject = applyResearchAssetPatchToProject(nextProject, patch, {
      now: now + index,
    });
  });

  return {
    project: nextProject,
    appliedCount: quickReviewPatches.length,
  };
}

export function markProjectPatchStatus(
  project: ResearchProject,
  patchId: string,
  status: ResearchAssetPatchStatus,
  now = Date.now()
): ResearchProject {
  const session = project.researchSession ?? createInitialResearchSession(project.rawIdea);
  const existingPatches = session.assetPatches ?? [];

  const nextProject = {
    ...project,
    researchSession: {
      ...session,
      assetPatches:
        existingPatches.length > 0
          ? existingPatches.map((patch) =>
              patch.id === patchId
                ? {
                    ...patch,
                    status,
                    ...(status === "applied" ? { appliedAt: now } : {}),
                    ...(status === "rejected" ? { rejectedAt: now } : {}),
                  }
                : patch
            )
          : session.assetPatches,
    },
  };

  if (status !== "rejected") return nextProject;

  const rejectedPatch = existingPatches.find((patch) => patch.id === patchId);
  if (!rejectedPatch) return nextProject;

  return recordPatchReviewVersion(nextProject, {
    patch: rejectedPatch,
    status: "rejected",
    now,
  });
}

function applyModelAssetPatch(
  project: ResearchProject,
  patch: ResearchAssetPatch,
  now: number
): ResearchProject {
  if (!project.hotellingModel || !project.researchSession) return project;

  const nextModel = applyModelPatchToHotellingModel(
    project.hotellingModel,
    patch.changes
  );
  const session = project.researchSession;

  return markResearchAssetsStaleAfterModelEdit({
    ...project,
    hotellingModel: nextModel,
    researchSession: {
      ...session,
      phase: "equilibrium",
      assetSummary: {
        ...session.assetSummary,
        confirmedAssumptions: nextModel.assumptions,
        utilityFunctions: nextModel.utilityFunctions.map(
          (entry) => `$${entry.expression}$`
        ),
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt:
            "模型或符号表已经按建议修改。请重新生成符号均衡，再进入性质分析。",
        },
        nextActions: [
          "核对右侧模型和符号表",
          "重新生成符号均衡",
          "基于新模型重做性质分析",
        ],
      },
      messages: [
        ...session.messages,
        createAssistantMessage(
          "msg-asset-patch-applied",
          "我已把这条修改建议应用到右侧模型资产里。均衡和性质分析需要重新生成后才适合继续使用。",
          now
        ),
      ],
    },
  });
}

function applyEquilibriumAssetPatch(
  project: ResearchProject,
  patch: ResearchAssetPatch,
  now: number
): ResearchProject {
  const session = project.researchSession;
  if (!session) return project;

  const equilibrium = applyEquilibriumChanges(
    project.equilibriumResult ?? createSymbolicEquilibriumScaffoldResult(),
    patch.changes
  );

  if (equilibrium.status !== "solved") {
    return {
      ...project,
      equilibriumResult: equilibrium,
      researchSession: {
        ...session,
        phase: "equilibrium",
        assetFreshness: {
          ...(session.assetFreshness ?? createFreshResearchAssetFreshness()),
          equilibrium: "fresh",
          properties: "stale",
        },
        assetSummary: {
          ...session.assetSummary,
          equilibriumStatus: equilibrium.status,
          pendingDecision: {
            kind: "solve_equilibrium",
            prompt:
              "这条均衡草稿还没有得到可用于性质分析的闭式解。请继续修正模型或重新生成符号均衡。",
          },
          nextActions: [
            "检查当前一阶条件草稿",
            "补全需求份额、利润函数或闭式求解步骤",
            "重新生成符号均衡",
          ],
        },
        messages: [
          ...session.messages,
          createAssistantMessage(
            "msg-equilibrium-patch-applied",
            "我已把这条均衡草稿应用到右侧均衡资产里，但它还没有得到可用于性质分析的闭式解。请继续修正模型或重新生成符号均衡。",
            now
          ),
        ],
      },
    };
  }

  return {
    ...project,
    equilibriumResult: equilibrium,
    researchSession: {
      ...session,
      phase: "analysis",
      assetFreshness: {
        ...(session.assetFreshness ?? createFreshResearchAssetFreshness()),
        equilibrium: "fresh",
        properties: "stale",
      },
      assetSummary: {
        ...session.assetSummary,
        equilibriumStatus: equilibrium.status,
        pendingDecision: {
          kind: "analyze_properties",
          prompt:
            "均衡结果已经按建议修改。请重新检查闭式解、存在条件，并基于新均衡重做性质分析。",
        },
        nextActions: [
          "检查右侧均衡推导",
          "确认闭式解与存在条件",
          "基于新均衡重做性质分析",
        ],
      },
      messages: [
        ...session.messages,
        createAssistantMessage(
          "msg-equilibrium-patch-applied",
          "我已把这条修改建议应用到右侧均衡资产里。性质分析需要重新检查或重新生成。",
          now
        ),
      ],
    },
  };
}

function applyPropertiesAssetPatch(
  project: ResearchProject,
  patch: ResearchAssetPatch,
  now: number
): ResearchProject {
  const session = project.researchSession;
  if (!session) return project;

  const analyses = applyPropertyChanges(project.propertyAnalyses ?? [], patch.changes);

  return {
    ...project,
    propertyAnalyses: analyses,
    researchSession: {
      ...session,
      phase: "analysis",
      assetFreshness: {
        ...(session.assetFreshness ?? createFreshResearchAssetFreshness()),
        properties: "fresh",
      },
      assetSummary: {
        ...session.assetSummary,
        pendingDecision: {
          kind: "draft_paper",
          prompt:
            "性质分析已经按建议写入右侧资产。请检查命题组后整理论文草稿。",
        },
        nextActions: [
          "整理命题与证明草稿",
          "检查符号条件是否符合论文假设",
          "整理论文草稿",
        ],
      },
      messages: [
        ...session.messages,
        createAssistantMessage(
          "msg-properties-patch-applied",
          "我已把这条修改建议应用到右侧性质分析资产里。",
          now
        ),
      ],
    },
  };
}

function applyPaperAssetPatch(
  project: ResearchProject,
  patch: ResearchAssetPatch,
  now: number
): ResearchProject {
  const session = project.researchSession;
  if (!session) return project;

  const sections = applyPaperSectionChanges(project.sections ?? [], patch.changes);

  return {
    ...project,
    sections,
    researchSession: {
      ...session,
      phase: "paper",
      assetSummary: {
        ...session.assetSummary,
        pendingDecision: undefined,
        nextActions: [
          "导出 Markdown 草稿",
          "继续改写论文章节",
          "补充文献引用与讨论边界",
        ],
      },
      messages: [
        ...session.messages,
        createAssistantMessage(
          "msg-paper-patch-applied",
          "我已把这条论文草稿建议写入右侧论文输出。",
          now
        ),
      ],
    },
  };
}

function applyEquilibriumChanges(
  equilibrium: EquilibriumResult,
  changes: ResearchAssetChange[]
): EquilibriumResult {
  let nextEquilibrium = { ...equilibrium };

  for (const change of changes) {
    const target = parseEquilibriumTarget(change.path);
    if (!target) continue;

    if (target.kind === "root") {
      const replacement = parseEquilibriumPartial(change.value);
      if (replacement) {
        nextEquilibrium = { ...nextEquilibrium, ...replacement };
      }
      continue;
    }

    if (target.field === "status") {
      const status = parseEquilibriumStatus(change.value);
      if (status) nextEquilibrium = { ...nextEquilibrium, status };
      continue;
    }

    if (isEquilibriumArrayField(target.field)) {
      nextEquilibrium = {
        ...nextEquilibrium,
        [target.field]: applyStringArrayChange(
          nextEquilibrium[target.field],
          change,
          target.index
        ),
      };
      continue;
    }

    if (isEquilibriumTextField(target.field)) {
      const value = typeof change.value === "string" ? change.value.trim() : "";
      if (change.kind === "remove") {
        nextEquilibrium = { ...nextEquilibrium, [target.field]: "" };
      } else if (value) {
        nextEquilibrium = { ...nextEquilibrium, [target.field]: value };
      }
    }
  }

  return nextEquilibrium;
}

function applyPropertyChanges(
  analyses: PropertyAnalysis[],
  changes: ResearchAssetChange[]
): PropertyAnalysis[] {
  let nextAnalyses = [...analyses];

  for (const change of changes) {
    const target = parsePropertyTarget(change.path);
    if (!target) continue;

    if (target.kind === "root") {
      nextAnalyses = applyPropertyRootChange(nextAnalyses, change);
      continue;
    }

    const index = resolvePropertyIndex(nextAnalyses, target.selector);
    if (change.kind === "remove" && !target.field) {
      if (index >= 0) {
        nextAnalyses = nextAnalyses.filter((_, itemIndex) => itemIndex !== index);
      }
      continue;
    }

    const nextAnalysis = normalizePropertyAnalysis(change.value);
    if (index < 0 && nextAnalysis) {
      nextAnalyses = [...nextAnalyses, nextAnalysis];
      continue;
    }

    if (index < 0 || !target.field) continue;

    const patched = patchPropertyAnalysis(nextAnalyses[index], target.field, change);
    if (patched) nextAnalyses[index] = patched;
  }

  return nextAnalyses;
}

function applyPaperSectionChanges(
  sections: PaperSection[],
  changes: ResearchAssetChange[]
): PaperSection[] {
  let nextSections = [...sections];

  for (const change of changes) {
    const target = parsePaperSectionTarget(change.path);
    if (!target) continue;

    if (target.kind === "root" && change.kind === "remove") {
      nextSections = [];
      continue;
    }

    if (target.kind === "section" && change.kind === "remove") {
      nextSections = applySinglePaperSectionChange(
        nextSections,
        change.kind,
        target.selector
      );
      continue;
    }

    const values = Array.isArray(change.value) ? change.value : [change.value];
    const incoming = values
      .map(normalizePaperSection)
      .filter((section): section is PaperSection => Boolean(section));

    if (incoming.length === 0) continue;

    if (target.kind === "section") {
      nextSections = applySinglePaperSectionChange(
        nextSections,
        change.kind,
        target.selector,
        incoming[0]
      );
      continue;
    }

    nextSections =
      change.kind === "append"
        ? mergePaperSections(nextSections, incoming)
        : incoming;
  }

  return nextSections;
}

type PaperSectionPatchTarget =
  | { kind: "root" }
  | {
      kind: "section";
      selector: string | number;
    };

function parsePaperSectionTarget(path: string): PaperSectionPatchTarget | null {
  const normalized = normalizePatchPath(path);
  if (normalized === "sections" || normalized === "paper.sections") {
    return { kind: "root" };
  }

  const bracketMatch = normalized.match(
    /^(?:paper\.)?sections\[['"]?([^\]"']+)['"]?\]$/
  );
  if (bracketMatch) {
    return toPaperSectionTarget(bracketMatch[1]);
  }

  const dotMatch = normalized.match(
    /^(?:paper\.)?sections\.([A-Za-z0-9_-]+)$/
  );
  if (dotMatch) {
    return toPaperSectionTarget(dotMatch[1]);
  }

  return null;
}

function toPaperSectionTarget(rawSelector: string): PaperSectionPatchTarget {
  return {
    kind: "section",
    selector: /^\d+$/.test(rawSelector) ? Number(rawSelector) : rawSelector,
  };
}

function applySinglePaperSectionChange(
  sections: PaperSection[],
  kind: ResearchAssetChange["kind"],
  selector: string | number,
  incoming?: PaperSection
) {
  const index = resolvePaperSectionIndex(sections, selector);

  if (kind === "remove") {
    return index >= 0
      ? sections.filter((_, sectionIndex) => sectionIndex !== index)
      : sections;
  }

  if (!incoming) return sections;

  if (index < 0) {
    return [...sections, incoming];
  }

  const next = [...sections];
  next[index] = incoming;
  return next;
}

function applyPropertyRootChange(
  analyses: PropertyAnalysis[],
  change: ResearchAssetChange
) {
  if (change.kind === "remove") {
    const removalId = parseRemovalId(change.value);
    return removalId
      ? analyses.filter((analysis) => analysis.id !== removalId)
      : [];
  }

  const values = Array.isArray(change.value) ? change.value : [change.value];
  const nextAnalyses = values
    .map(normalizePropertyAnalysis)
    .filter((analysis): analysis is PropertyAnalysis => Boolean(analysis));

  if (change.kind === "append") {
    return mergePropertyAnalyses(analyses, nextAnalyses);
  }

  return nextAnalyses.length > 0 ? nextAnalyses : analyses;
}

function patchPropertyAnalysis(
  analysis: PropertyAnalysis,
  field: keyof PropertyAnalysis,
  change: ResearchAssetChange
): PropertyAnalysis | null {
  const candidate = { ...analysis };

  if (field === "operation") {
    const operation = parsePropertyOperation(change.value);
    if (!operation) return null;
    candidate.operation = operation;
    return candidate;
  }

  if (field === "warnings") {
    candidate.warnings = applyStringArrayChange(analysis.warnings, change);
    return candidate;
  }

  if (!isPropertyTextField(field)) return null;
  const value = typeof change.value === "string" ? change.value.trim() : "";
  candidate[field] = change.kind === "remove" ? "" : value;
  return normalizePropertyAnalysis(candidate);
}

type EquilibriumPatchTarget =
  | { kind: "root" }
  | {
      kind: "field";
      field: keyof EquilibriumResult;
      index?: number;
    };

function parseEquilibriumTarget(path: string): EquilibriumPatchTarget | null {
  const normalized = normalizePatchPath(path);
  if (normalized === "equilibriumResult" || normalized === "equilibrium") {
    return { kind: "root" };
  }

  const match = normalized.match(
    /^equilibrium(?:Result)?\.([A-Za-z_][A-Za-z0-9_]*)(?:\[(\d+)\])?$/
  );
  if (!match) return null;

  const field = match[1] as keyof EquilibriumResult;
  if (
    field !== "status" &&
    !EQUILIBRIUM_ARRAY_FIELDS.has(field) &&
    !EQUILIBRIUM_TEXT_FIELDS.has(field)
  ) {
    return null;
  }

  return {
    kind: "field",
    field,
    ...(match[2] ? { index: Number(match[2]) } : {}),
  };
}

type PropertyPatchTarget =
  | { kind: "root" }
  | {
      kind: "item";
      selector: string | number;
      field?: keyof PropertyAnalysis;
    };

function parsePropertyTarget(path: string): PropertyPatchTarget | null {
  const normalized = normalizePatchPath(path);
  if (normalized === "propertyAnalyses" || normalized === "properties") {
    return { kind: "root" };
  }

  const bracketMatch = normalized.match(
    /^property(?:Analyses|Analysis|Properties)\[["']?([^\]"']+)["']?\](?:\.([A-Za-z_][A-Za-z0-9_]*))?$/
  );
  if (bracketMatch) {
    return toPropertyTarget(bracketMatch[1], bracketMatch[2]);
  }

  const dotMatch = normalized.match(
    /^property(?:Analyses|Analysis|Properties)\.([A-Za-z0-9_-]+)(?:\.([A-Za-z_][A-Za-z0-9_]*))?$/
  );
  if (dotMatch) {
    return toPropertyTarget(dotMatch[1], dotMatch[2]);
  }

  return null;
}

function toPropertyTarget(
  rawSelector: string,
  rawField?: string
): PropertyPatchTarget | null {
  const field = rawField as keyof PropertyAnalysis | undefined;
  if (
    field &&
    field !== "operation" &&
    field !== "warnings" &&
    !PROPERTY_TEXT_FIELDS.has(field)
  ) {
    return null;
  }

  return {
    kind: "item",
    selector: /^\d+$/.test(rawSelector) ? Number(rawSelector) : rawSelector,
    ...(field ? { field } : {}),
  };
}

function parseEquilibriumPartial(value: unknown): Partial<EquilibriumResult> | null {
  if (!isRecord(value)) return null;

  const partial: Partial<EquilibriumResult> = {};
  const status = parseEquilibriumStatus(value.status);
  if (status) partial.status = status;

  for (const field of EQUILIBRIUM_TEXT_FIELD_NAMES) {
    const text = parseText(value[field]);
    if (text) partial[field] = text;
  }

  for (const field of EQUILIBRIUM_ARRAY_FIELD_NAMES) {
    const items = parseStringArray(value[field]);
    if (items) partial[field] = items;
  }

  return Object.keys(partial).length > 0 ? partial : null;
}

function normalizePropertyAnalysis(value: unknown): PropertyAnalysis | null {
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

  return {
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
}

function normalizePaperSection(value: unknown): PaperSection | null {
  if (!isRecord(value)) return null;

  const id = parseText(value.id);
  const title = parseText(value.title);
  const content = parseText(value.content);
  const status = parsePaperSectionStatus(value.status);

  if (!id || !title || !content || !status) return null;

  return {
    id,
    title,
    content,
    status,
  };
}

function mergePaperSections(
  current: PaperSection[],
  incoming: PaperSection[]
) {
  const next = [...current];

  for (const section of incoming) {
    const index = next.findIndex((item) => item.id === section.id);
    if (index >= 0) {
      next[index] = section;
    } else {
      next.push(section);
    }
  }

  return next;
}

function applyStringArrayChange(
  current: string[],
  change: ResearchAssetChange,
  index?: number
) {
  if (change.kind === "remove") {
    if (typeof index === "number") {
      return current.filter((_, itemIndex) => itemIndex !== index);
    }

    const value = typeof change.value === "string" ? change.value.trim() : "";
    return value ? current.filter((item) => item !== value) : [];
  }

  const values = Array.isArray(change.value)
    ? change.value.map(String).map((item) => item.trim()).filter(Boolean)
    : typeof change.value === "string" && change.value.trim()
      ? [change.value.trim()]
      : [];

  if (values.length === 0) return current;

  if (change.kind === "append") return [...current, ...values];
  if (typeof index === "number") {
    const next = [...current];
    next[index] = values[0];
    return next.filter(Boolean);
  }

  return values;
}

function resolvePropertyIndex(
  analyses: PropertyAnalysis[],
  selector: string | number
) {
  if (typeof selector === "number") {
    return selector >= 0 && selector < analyses.length ? selector : -1;
  }

  return analyses.findIndex((analysis) => analysis.id === selector);
}

function resolvePaperSectionIndex(
  sections: PaperSection[],
  selector: string | number
) {
  if (typeof selector === "number") {
    return selector >= 0 && selector < sections.length ? selector : -1;
  }

  return sections.findIndex((section) => section.id === selector);
}

function mergePropertyAnalyses(
  current: PropertyAnalysis[],
  incoming: PropertyAnalysis[]
) {
  const next = [...current];

  for (const analysis of incoming) {
    const index = next.findIndex((item) => item.id === analysis.id);
    if (index >= 0) {
      next[index] = analysis;
    } else {
      next.push(analysis);
    }
  }

  return next;
}

function parseEquilibriumStatus(
  value: unknown
): EquilibriumResult["status"] | null {
  return value === "idle" ||
    value === "solved" ||
    value === "needs_revision" ||
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

  return value === "differentiate" ||
    value === "compare" ||
    value === "threshold" ||
    value === "custom"
    ? value
    : null;
}

function parsePaperSectionStatus(value: unknown): PaperSection["status"] | null {
  return value === "draft" || value === "generated" || value === "edited"
    ? value
    : null;
}

function isEquilibriumArrayField(
  field: keyof EquilibriumResult
): field is EquilibriumArrayField {
  return EQUILIBRIUM_ARRAY_FIELDS.has(field);
}

function isEquilibriumTextField(
  field: keyof EquilibriumResult
): field is EquilibriumTextField {
  return EQUILIBRIUM_TEXT_FIELDS.has(field);
}

function isPropertyTextField(
  field: keyof PropertyAnalysis
): field is PropertyTextField {
  return PROPERTY_TEXT_FIELDS.has(field);
}

function parseRemovalId(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (isRecord(value)) return parseText(value.id);
  return null;
}

function ensureResearchSession(project: ResearchProject): ResearchProject {
  if (project.researchSession) return project;

  return {
    ...project,
    researchSession: createInitialResearchSession(project.rawIdea),
  };
}

function createFreshResearchAssetFreshness() {
  return {
    model: "fresh" as const,
    equilibrium: "fresh" as const,
    properties: "fresh" as const,
  };
}

function createAssistantMessage(prefix: string, content: string, now: number) {
  return {
    id: `${prefix}-${now}`,
    role: "assistant" as const,
    content,
    createdAt: now,
  };
}

function normalizePatchPath(path: string) {
  return path.trim().replace(/^project\./, "");
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const strings = value.map(parseText);
  if (strings.some((entry) => !entry)) return null;
  return strings as string[];
}

function parseText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
