import type {
  ResearchAssetKind,
  ResearchAssetVersionEvent,
} from "../types";

export type VersionReviewPriority = "high" | "medium" | "low" | "none";

export type VersionReviewItem = {
  eventId: string;
  assetKind: ResearchAssetKind;
  action: ResearchAssetVersionEvent["action"];
  summary: string;
  createdAt: number;
  priority: Exclude<VersionReviewPriority, "none">;
  affectedAssetKinds: ResearchAssetKind[];
  impactSummary: string;
  nextAction: string;
  reviewFocus: string[];
};

export type VersionReviewSummary = {
  totalEventCount: number;
  reviewItemCount: number;
  highestPriority: VersionReviewPriority;
  affectedAssetKinds: ResearchAssetKind[];
  latestNextAction?: string;
  latestImpactSummary?: string;
  reviewItems: VersionReviewItem[];
};

export function buildVersionReviewSummary(
  history: ResearchAssetVersionEvent[]
): VersionReviewSummary {
  const reviewItems = history
    .filter((event) => event.impact)
    .map((event) => ({
      eventId: event.id,
      assetKind: event.assetKind,
      action: event.action,
      summary: event.summary,
      createdAt: event.createdAt,
      priority: getVersionReviewPriority(event),
      affectedAssetKinds: event.impact?.affectedAssetKinds ?? [],
      impactSummary: event.impact?.summary ?? "",
      nextAction: event.impact?.nextAction ?? "",
      reviewFocus: event.impact?.reviewFocus ?? [],
    }))
    .sort((left, right) => right.createdAt - left.createdAt);

  const latestItem = reviewItems[0];

  return {
    totalEventCount: history.length,
    reviewItemCount: reviewItems.length,
    highestPriority: getHighestPriority(reviewItems),
    affectedAssetKinds: collectAffectedAssetKinds(reviewItems),
    ...(latestItem?.nextAction ? { latestNextAction: latestItem.nextAction } : {}),
    ...(latestItem?.impactSummary
      ? { latestImpactSummary: latestItem.impactSummary }
      : {}),
    reviewItems,
  };
}

function getVersionReviewPriority(
  event: ResearchAssetVersionEvent
): Exclude<VersionReviewPriority, "none"> {
  if (event.action === "rejected_patch") return "low";

  switch (event.assetKind) {
    case "model":
    case "equilibrium":
      return "high";
    case "properties":
      return "medium";
    case "paper":
      return "low";
  }
}

function getHighestPriority(items: VersionReviewItem[]): VersionReviewPriority {
  if (items.some((item) => item.priority === "high")) return "high";
  if (items.some((item) => item.priority === "medium")) return "medium";
  if (items.some((item) => item.priority === "low")) return "low";
  return "none";
}

function collectAffectedAssetKinds(items: VersionReviewItem[]) {
  const seen = new Set<ResearchAssetKind>();
  const orderedKinds: ResearchAssetKind[] = [
    "model",
    "equilibrium",
    "properties",
    "paper",
  ];

  items.forEach((item) => {
    item.affectedAssetKinds.forEach((kind) => seen.add(kind));
  });

  return orderedKinds.filter((kind) => seen.has(kind));
}
