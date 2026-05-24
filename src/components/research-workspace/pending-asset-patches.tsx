"use client";

import { Check, CheckCheck, Eye, X } from "lucide-react";

import type { ResearchAssetPatch } from "@/lib/types";
import {
  describeResearchAssetChange,
  formatPatchPath,
  getResearchAssetChangeKindLabel,
  getResearchAssetKindLabel,
  getResearchAssetPatchSummaryLine,
} from "@/lib/research-asset-patch-display";
import {
  getPendingAssetPatchPanelClassName,
  getPendingAssetPatchesForDisplay,
  getQuickReviewAssetPatchesForDisplay,
  getResearchAssetPatchReviewLoad,
  type ResearchAssetPatchReviewLoad,
} from "@/lib/research-pending-patches-layout";

type PendingAssetPatchesProps = {
  patches: ResearchAssetPatch[];
  onReview?: (patchId: string) => void;
  onApply?: (patchId: string) => void;
  onApplyQuickReview?: (patchIds: string[]) => void;
  onReject?: (patchId: string) => void;
};

export function PendingAssetPatches({
  patches,
  onReview,
  onApply,
  onApplyQuickReview,
  onReject,
}: PendingAssetPatchesProps) {
  const proposed = getPendingAssetPatchesForDisplay(patches);
  const quickReviewPatches = getQuickReviewAssetPatchesForDisplay(patches);

  if (proposed.length === 0) return null;

  return (
    <section className={getPendingAssetPatchPanelClassName()}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground">
          待应用修改
        </div>
        {quickReviewPatches.length > 0 ? (
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-50 px-2 text-xs font-medium text-emerald-800 disabled:opacity-50 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-200"
            disabled={!onApplyQuickReview}
            onClick={() =>
              onApplyQuickReview?.(quickReviewPatches.map((patch) => patch.id))
            }
          >
            <CheckCheck size={13} />
            应用快速审核项（{quickReviewPatches.length}）
          </button>
        ) : null}
      </div>
      <div className="space-y-2">
        {proposed.map((patch) => {
          const reviewLoad = getResearchAssetPatchReviewLoad(patch);

          return (
            <article key={patch.id} className="rounded-md border bg-background p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{patch.summary}</div>
                  <div className="mt-1 text-xs leading-5 text-muted-foreground">
                    {getResearchAssetPatchSummaryLine(patch)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="flex flex-wrap justify-end gap-1">
                    <ReviewLoadBadge reviewLoad={reviewLoad} />
                    <span className="rounded-sm border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {getResearchAssetKindLabel(patch.kind)}
                    </span>
                  </div>
                  <PatchActions
                    patchId={patch.id}
                    onReview={onReview}
                    onApply={onApply}
                    onReject={onReject}
                  />
                </div>
              </div>
              <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
                {patch.changes.map((change, index) => (
                  <div
                    key={`${patch.id}-${index}-${change.kind}-${change.path}`}
                    className="rounded-sm bg-muted/45 px-2 py-1.5 text-xs leading-5 text-muted-foreground"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="rounded-sm border bg-background px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                        {getResearchAssetChangeKindLabel(change.kind)}
                      </span>
                      <span className="min-w-0 break-words text-foreground">
                        {describeResearchAssetChange(change, patch.kind)}
                      </span>
                    </div>
                    <div className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
                      {formatPatchPath(change.path)}
                    </div>
                    {change.note ? (
                      <div className="mt-1 break-words">{change.note}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ReviewLoadBadge({
  reviewLoad,
}: {
  reviewLoad: ResearchAssetPatchReviewLoad;
}) {
  return (
    <span
      className={getReviewLoadBadgeClassName(reviewLoad.level)}
      title={reviewLoad.reason}
    >
      {reviewLoad.label}
    </span>
  );
}

function getReviewLoadBadgeClassName(
  level: ResearchAssetPatchReviewLoad["level"]
) {
  switch (level) {
    case "high":
      return "rounded-sm border border-amber-300/70 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-200";
    case "medium":
      return "rounded-sm border border-sky-300/70 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:border-sky-400/35 dark:bg-sky-500/15 dark:text-sky-200";
    case "low":
      return "rounded-sm border border-emerald-300/70 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/15 dark:text-emerald-200";
  }
}

function PatchActions({
  patchId,
  onReview,
  onApply,
  onReject,
}: {
  patchId: string;
  onReview?: (patchId: string) => void;
  onApply?: (patchId: string) => void;
  onReject?: (patchId: string) => void;
}) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium disabled:opacity-50"
        disabled={!onReview}
        onClick={() => onReview?.(patchId)}
      >
        <Eye size={13} />
        查看
      </button>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-xs font-medium text-primary-foreground disabled:opacity-50"
        disabled={!onApply}
        onClick={() => onApply?.(patchId)}
      >
        <Check size={13} />
        应用
      </button>
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium disabled:opacity-50"
        disabled={!onReject}
        onClick={() => onReject?.(patchId)}
      >
        <X size={13} />
        拒绝
      </button>
    </div>
  );
}
