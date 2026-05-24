import type { ResearchAssetPatch } from "./types";

export type ResearchAssetPatchReviewLoad = {
  level: "high" | "medium" | "low";
  label: string;
  reason: string;
};

export function getPendingAssetPatchPanelClassName() {
  return "max-h-[min(42dvh,28rem)] shrink-0 overflow-y-auto border-b bg-muted/30 p-3";
}

export function getPendingAssetPatchesForDisplay<
  T extends Pick<ResearchAssetPatch, "status" | "createdAt">
>(patches: T[]): T[] {
  return patches
    .filter((patch) => patch.status === "proposed")
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function getResearchAssetPatchReviewLoad(
  patch: Pick<ResearchAssetPatch, "kind" | "changes" | "summary">
): ResearchAssetPatchReviewLoad {
  const text = `${patch.summary}\n${patch.changes
    .map((change) => `${change.path}\n${change.note ?? ""}`)
    .join("\n")}`;

  if (patch.kind === "model" || patch.kind === "equilibrium") {
    return {
      level: "high",
      label: "重点审核",
      reason: "会改变模型或均衡这类核心研究资产，需要逐项确认。",
    };
  }

  if (hasMathReviewRisk(text)) {
    return {
      level: "high",
      label: "重点审核",
      reason: "包含数学自检风险，需要确认推导、符号和条件是否可靠。",
    };
  }

  if (patch.kind === "properties") {
    return {
      level: "medium",
      label: "标准审核",
      reason: "会替换性质分析和命题组，建议快速扫一遍方向、条件和重复项。",
    };
  }

  return {
    level: "low",
    label: "快速审核",
    reason: "主要是论文草稿整理，不改变模型、均衡或性质分析资产。",
  };
}

function hasMathReviewRisk(value: string) {
  return /数学|偏导|复算|符号|条件不足|互相冲突|重复主题|未定义|未出现|自检提示/.test(
    value
  );
}
