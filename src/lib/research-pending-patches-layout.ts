import type { ResearchAssetPatch } from "./types";

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
