import { createInitialResearchSession } from "../research-session.ts";
import { createResearchAssetPatch } from "../research-asset-patch.ts";
import type {
  ResearchAssetChange,
  ResearchAssetPatch,
  ResearchAssetPatchStatus,
  ResearchAssetVersionEvent,
  ResearchProject,
  ResearchSessionDecision,
} from "../types";

const MAX_ASSET_VERSION_HISTORY = 50;

export function recordPatchReviewVersion(
  project: ResearchProject,
  {
    patch,
    status,
    now = Date.now(),
    rejectionReason,
  }: {
    patch: ResearchAssetPatch;
    status: Extract<ResearchAssetPatchStatus, "applied" | "rejected">;
    now?: number;
    rejectionReason?: string;
  }
): ResearchProject {
  const session =
    project.researchSession ?? createInitialResearchSession(project.rawIdea);
  const event = createPatchReviewVersionEvent({
    patch,
    status,
    now,
    rejectionReason,
  });
  const previousEvents = session.assetVersionHistory ?? [];
  const nextHistory = [
    ...previousEvents.filter((item) => item.id !== event.id),
    event,
  ].slice(-MAX_ASSET_VERSION_HISTORY);

  return {
    ...project,
    researchSession: {
      ...session,
      assetVersionHistory: nextHistory,
    },
  };
}

export function createRollbackPatchFromVersionEvent(
  event: ResearchAssetVersionEvent | undefined,
  {
    now = Date.now(),
    sourceMessageId,
  }: {
    now?: number;
    sourceMessageId?: string;
  } = {}
): ResearchAssetPatch | null {
  if (!event || event.action !== "applied_patch") return null;

  const changes = event.changes
    .map((change) => createRollbackChange(event.summary, change))
    .filter((change): change is ResearchAssetChange => Boolean(change));

  if (changes.length === 0) return null;

  return createResearchAssetPatch({
    id: `patch-rollback-${event.id}`,
    kind: event.assetKind,
    summary: `回滚：${event.summary}`,
    changes,
    createdAt: now,
    sourceMessageId,
  });
}

export function proposeRollbackPatchFromVersionEvent(
  project: ResearchProject,
  eventId: string,
  {
    now = Date.now(),
  }: {
    now?: number;
  } = {}
): ResearchProject {
  const session =
    project.researchSession ?? createInitialResearchSession(project.rawIdea);
  const event = session.assetVersionHistory?.find((item) => item.id === eventId);
  const patch = createRollbackPatchFromVersionEvent(event, {
    now,
    sourceMessageId: `msg-rollback-${eventId}`,
  });

  if (!patch) return project;

  const previousPatches = session.assetPatches ?? [];
  const nextPatches = [
    ...previousPatches.filter((item) => item.id !== patch.id),
    patch,
  ];

  return {
    ...project,
    researchSession: {
      ...session,
      assetPatches: nextPatches,
      assetSummary: {
        ...session.assetSummary,
        pendingDecision: {
          kind: getPendingDecisionKindForAsset(patch.kind),
          prompt: "已生成一条回滚建议。请先在右侧审核并应用，再继续推进研究。",
        },
        nextActions: [
          "审阅右侧待处理的回滚建议",
          "应用或拒绝回滚 patch",
          "应用后重新检查受影响资产",
        ],
      },
      messages: [
        ...session.messages,
        {
          id: `msg-rollback-patch-${eventId}-${now}`,
          role: "assistant",
          content:
            "我已根据这条历史记录生成一条回滚建议，放在右侧“待应用修改”里。它不会自动覆盖资产，需要你审核后再应用。",
          createdAt: now,
        },
      ],
    },
  };
}

function createPatchReviewVersionEvent({
  patch,
  status,
  now,
  rejectionReason,
}: {
  patch: ResearchAssetPatch;
  status: Extract<ResearchAssetPatchStatus, "applied" | "rejected">;
  now: number;
  rejectionReason?: string;
}): ResearchAssetVersionEvent {
  const note = patch.changes
    .map((change) => change.note?.trim())
    .find((value): value is string => Boolean(value));

  return {
    id: `asset-version-${patch.id}-${status}`,
    assetKind: patch.kind,
    action: status === "applied" ? "applied_patch" : "rejected_patch",
    patchId: patch.id,
    summary: patch.summary,
    changedPaths: patch.changes.map((change) => change.path),
    changes: patch.changes.map(createVersionChangeSnapshot),
    changeCount: patch.changes.length,
    createdAt: now,
    ...(status === "applied" ? { approvedBy: "user" as const } : {}),
    ...(patch.sourceMessageId ? { sourceMessageId: patch.sourceMessageId } : {}),
    ...(note ? { note } : {}),
    ...(status === "rejected" && rejectionReason
      ? { rejectionReason }
      : {}),
  };
}

function getPendingDecisionKindForAsset(
  assetKind: ResearchAssetPatch["kind"]
): ResearchSessionDecision["kind"] {
  switch (assetKind) {
    case "model":
      return "answer_model_question";
    case "equilibrium":
      return "solve_equilibrium";
    case "properties":
      return "analyze_properties";
    case "paper":
      return "draft_paper";
  }
}

function createVersionChangeSnapshot(
  change: ResearchAssetChange
): ResearchAssetChange {
  return {
    kind: change.kind,
    path: change.path,
    ...(change.previousValue !== undefined
      ? { previousValue: change.previousValue }
      : {}),
    ...(change.value !== undefined ? { value: change.value } : {}),
    ...(change.note ? { note: change.note } : {}),
  };
}

function createRollbackChange(
  summary: string,
  change: ResearchAssetChange
): ResearchAssetChange | null {
  if (change.kind === "append") {
    if (change.value === undefined) return null;

    return {
      kind: "remove",
      path: change.path,
      value: change.value,
      previousValue: change.value,
      note: `回滚“${summary}”的这一处新增内容。`,
    };
  }

  if (change.previousValue === undefined) return null;

  if (change.kind === "remove") {
    return {
      kind: "append",
      path: change.path,
      value: change.previousValue,
      note: `回滚“${summary}”的这一处删除内容。`,
    };
  }

  return {
    kind: "replace",
    path: change.path,
    value: change.previousValue,
    ...(change.value !== undefined ? { previousValue: change.value } : {}),
    note: `回滚“${summary}”的这一处修改。`,
  };
}
