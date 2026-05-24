import type {
  ResearchAssetChange,
  ResearchAssetKind,
  ResearchAssetPatch,
} from "./types";

export function getResearchAssetPatchSummaryLine(patch: ResearchAssetPatch) {
  const count = patch.changes.length;

  if (patch.kind === "model") {
    const symbolEdits = patch.changes.filter((change) =>
      change.path.includes("symbols")
    ).length;
    const assumptionEdits = patch.changes.filter((change) =>
      change.path.includes("assumptions")
    ).length;
    const parts = [
      symbolEdits > 0 ? `${symbolEdits} 条符号修改` : "",
      assumptionEdits > 0 ? `${assumptionEdits} 条假设修改` : "",
    ].filter(Boolean);

    return parts.length > 0
      ? `模型修改：${parts.join("，")}`
      : `模型修改：${count} 条改动`;
  }

  return `${getResearchAssetKindLabel(patch.kind)}修改：${count} 条改动`;
}

export function getResearchAssetKindLabel(kind: ResearchAssetKind) {
  switch (kind) {
    case "model":
      return "模型";
    case "equilibrium":
      return "均衡";
    case "properties":
      return "性质";
    case "paper":
      return "论文输出";
  }
}

export function getResearchAssetChangeKindLabel(kind: ResearchAssetChange["kind"]) {
  switch (kind) {
    case "append":
      return "新增";
    case "replace":
      return "更新";
    case "remove":
      return "删除";
  }
}

export function describeResearchAssetChange(
  change: ResearchAssetChange,
  patchKind: ResearchAssetKind
) {
  if (patchKind === "model") {
    const modelDescription = describeModelChange(change);
    if (modelDescription) return modelDescription;
  }

  const preview = formatPatchValuePreview(change);
  return [
    getResearchAssetChangeKindLabel(change.kind),
    formatPatchPath(change.path),
    preview ? `：${preview}` : "",
  ].join("");
}

function describeModelChange(change: ResearchAssetChange) {
  const symbolTarget = parseSymbolTarget(change.path);
  if (symbolTarget) {
    const valuePreview = formatPatchValuePreview(change);

    if (change.kind === "append" && symbolTarget.kind === "registry") {
      return `新增符号${valuePreview ? ` ${valuePreview}` : ""}`;
    }

    if (change.kind === "remove") {
      return symbolTarget.selector
        ? `删除符号 ${symbolTarget.selector}`
        : "清空符号表";
    }

    if (symbolTarget.field === "symbol") {
      return `重命名符号 ${symbolTarget.selector} -> ${String(change.value ?? "").trim()}`;
    }

    if (symbolTarget.field) {
      return `更新 ${symbolTarget.selector} 的${getSymbolFieldLabel(
        symbolTarget.field
      )}${valuePreview ? `：${valuePreview}` : ""}`;
    }

    return `更新符号 ${symbolTarget.selector}${valuePreview ? `：${valuePreview}` : ""}`;
  }

  const assumptionTarget = parseAssumptionTarget(change.path);
  if (assumptionTarget) {
    const preview = formatPatchValuePreview(change);

    if (change.kind === "append") {
      return `新增假设${preview ? `：${preview}` : ""}`;
    }

    if (change.kind === "remove") {
      return assumptionTarget.index === undefined
        ? `删除假设${preview ? `：${preview}` : ""}`
        : `删除第 ${assumptionTarget.index + 1} 条假设`;
    }

    return assumptionTarget.index === undefined
      ? `更新模型假设${preview ? `：${preview}` : ""}`
      : `更新第 ${assumptionTarget.index + 1} 条假设${preview ? `：${preview}` : ""}`;
  }

  return "";
}

function parseSymbolTarget(path: string):
  | {
      kind: "registry";
      selector?: undefined;
      field?: undefined;
    }
  | {
      kind: "symbol";
      selector: string;
      field?: string;
    }
  | null {
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
    return {
      kind: "symbol",
      selector: bracketMatch[1],
      ...(bracketMatch[2] ? { field: bracketMatch[2] } : {}),
    };
  }

  return null;
}

function parseAssumptionTarget(path: string) {
  const normalized = path.trim();
  if (!/(^|\.)assumptions(\[|$)/i.test(normalized)) return null;

  const indexMatch = normalized.match(/assumptions\[(\d+)\]/i);
  return {
    ...(indexMatch ? { index: Number(indexMatch[1]) } : {}),
  };
}

function getSymbolFieldLabel(field: string) {
  switch (field) {
    case "name":
      return "名称";
    case "meaning":
      return "含义";
    case "assumption":
      return "取值假设";
    case "role":
      return "类别";
    case "side":
      return "侧别";
    case "codeName":
      return "代码名";
    case "baseSymbol":
      return "基础符号";
    case "subscript":
      return "下标";
    case "superscript":
      return "上标";
    case "recommended":
      return "推荐状态";
    default:
      return field;
  }
}

export function formatPatchPath(path: string) {
  return path
    .replace(/^hotellingModel\./, "")
    .replace(/^equilibriumResult\./, "")
    .replace(/^propertyAnalyses\./, "properties.")
    .replace(/^paper\./, "");
}

export function formatPatchValuePreview(change: ResearchAssetChange) {
  if (change.kind === "remove" || change.value === undefined) return "";
  if (typeof change.value === "string") return change.value;
  if (isRecord(change.value)) {
    const symbol = typeof change.value.symbol === "string" ? change.value.symbol : "";
    const name = typeof change.value.name === "string" ? change.value.name : "";
    return [symbol, name].filter(Boolean).join(" - ");
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
