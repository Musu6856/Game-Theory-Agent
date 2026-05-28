import assert from "node:assert/strict";
import test from "node:test";

import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
} from "../research-session.ts";
import { createAgentRun } from "./state.ts";
import { appendAgentRunToProject } from "./trace.ts";
import { getAgentRecoverySuggestion } from "./recovery.ts";

test("recovery suggests retrying a failed agent run from the current next action", () => {
  const project = withAgentRun(createConfirmedProject(), "failed");

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion?.status, "retryable");
  assert.equal(suggestion?.actionKind, "solve_equilibrium");
  assert.equal(suggestion?.targetTab, "equilibrium");
});

test("recovery points paused approval runs to pending patch review", () => {
  const project = withPendingPatch(
    withAgentRun(createDirectionProject(), "paused", {
      requiresApproval: true,
      pauseReason: "Waiting for model patch review.",
    }),
    "model"
  );

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion?.status, "review_required");
  assert.equal(suggestion?.targetTab, "model");
  assert.equal(suggestion?.actionKind, undefined);
});

test("recovery can continue a paused controller run when no review item remains", () => {
  const project = withAgentRun(createConfirmedProject(), "paused", {
    pauseReason: "Page refreshed during controller progress.",
  });

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion?.status, "continuable");
  assert.equal(suggestion?.targetTab, "equilibrium");
  assert.equal(suggestion?.actionKind, "safe_continue");
});

test("recovery ignores stale running approval runs after their patch was applied", () => {
  const project = withAppliedPatch(
    withAgentRun(createConfirmedProject(), "running", {
      requiresApproval: true,
      pauseReason: "Waiting for the user to review and apply the model patch.",
      completedAt: 1710000000500,
    }),
    "model"
  );

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion, null);
});

test("recovery ignores orphan running runs that have no active checkpoint or review item", () => {
  const project = withAgentRun(createConfirmedProject(), "running", {
    currentStepId: undefined,
    plan: [
      {
        id: "prepare-equilibrium",
        kind: "reflection",
        title: "Prepare equilibrium target",
        status: "completed",
      },
      {
        id: "draft-equilibrium",
        kind: "tool",
        toolName: "research.solveEquilibrium",
        title: "Draft symbolic equilibrium candidate",
        status: "completed",
      },
      {
        id: "review-equilibrium",
        kind: "reflection",
        title: "Review equilibrium derivation quality",
        status: "completed",
      },
      {
        id: "propose-equilibrium-patch",
        kind: "approval",
        toolName: "asset.proposePatch",
        title: "Propose reviewable equilibrium patch",
        status: "pending",
      },
    ],
    checkpoints: [
      {
        id: "checkpoint-1",
        runId: "agent-running",
        stepId: "prepare-equilibrium",
        title: "Prepare equilibrium target",
        status: "completed",
        createdAt: 1710000000100,
      },
      {
        id: "checkpoint-2",
        runId: "agent-running",
        stepId: "draft-equilibrium",
        title: "Draft symbolic equilibrium candidate",
        status: "running",
        toolName: "research.solveEquilibrium",
        createdAt: 1710000000200,
      },
      {
        id: "checkpoint-3",
        runId: "agent-running",
        stepId: "draft-equilibrium",
        title: "Draft symbolic equilibrium candidate",
        status: "completed",
        toolName: "research.solveEquilibrium",
        createdAt: 1710000000300,
      },
      {
        id: "checkpoint-4",
        runId: "agent-running",
        stepId: "review-equilibrium",
        title: "Review equilibrium derivation quality",
        status: "completed",
        createdAt: 1710000000400,
      },
    ],
  });

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion, null);
});

test("recovery describes the latest failed checkpoint when retrying", () => {
  const project = withAgentRun(createConfirmedProject(), "failed", {
    checkpoints: [
      {
        id: "checkpoint-1",
        runId: "agent-failed",
        stepId: "prepare-equilibrium",
        title: "Prepare equilibrium target",
        status: "completed",
        createdAt: 1710000000100,
      },
      {
        id: "checkpoint-2",
        runId: "agent-failed",
        stepId: "draft-equilibrium",
        title: "Draft symbolic equilibrium candidate",
        status: "failed",
        toolName: "research.solveEquilibrium",
        createdAt: 1710000000200,
      },
    ],
  });

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion?.status, "retryable");
  assert.equal(suggestion?.checkpoint?.stepId, "draft-equilibrium");
  assert.match(suggestion?.reason ?? "", /Draft symbolic equilibrium candidate/);
});

test("recovery ignores completed runs", () => {
  const project = withAgentRun(createDirectionProject(), "completed");

  assert.equal(getAgentRecoverySuggestion(project), null);
});

function createDirectionProject() {
  return adoptResearchDirection(
    createExplorationProject({
      id: "11111111-1111-4111-8111-111111111111",
      rawIdea: "test platform pricing",
      now: 1710000000000,
    }),
    "secondhand-commission-subsidy-hotelling"
  );
}

function createConfirmedProject() {
  return confirmResearchModel(createDirectionProject());
}

function withAgentRun(project, status, overrides = {}) {
  const run = {
    ...createAgentRun({
      id: `agent-${status}`,
      goal: "test recovery suggestion",
      now: 1710000000001,
      plan: [
        {
          id: "step-1",
          kind: "tool",
          toolName: "research.solveEquilibrium",
          title: "Draft symbolic equilibrium candidate",
          status: status === "failed" ? "failed" : "running",
        },
      ],
    }),
    status,
    ...overrides,
  };

  return appendAgentRunToProject(project, run);
}

function withPendingPatch(project, kind) {
  return {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [
        ...(project.researchSession?.assetPatches ?? []),
        createPatch(kind, "proposed"),
      ],
    },
  };
}

function withAppliedPatch(project, kind) {
  const patch = createPatch(kind, "applied");
  return {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
      assetVersionHistory: [
        ...(project.researchSession?.assetVersionHistory ?? []),
        {
          id: `version-${kind}`,
          assetKind: kind,
          action: "applied_patch",
          patchId: patch.id,
          summary: patch.summary,
          changedPaths: patch.changes.map((change) => change.path),
          changes: patch.changes,
          changeCount: patch.changes.length,
          createdAt: 1710000001000,
          approvedBy: "user",
        },
      ],
    },
  };
}

function createPatch(kind, status) {
  return {
    id: `patch-${kind}`,
    kind,
    summary: "Reviewable asset patch",
    changes: [
      {
        kind: "replace",
        path: kind === "paper" ? "sections" : "hotellingModel",
        value: {},
      },
    ],
    status,
    createdAt: 1710000000000,
    ...(status === "applied" ? { appliedAt: 1710000001000 } : {}),
  };
}
