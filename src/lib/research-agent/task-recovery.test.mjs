import assert from "node:assert/strict";
import test from "node:test";

import {
  isRecoverableAgentTask,
  selectRecoverableAgentTaskForProject,
} from "./task-recovery.ts";

function createTask(overrides = {}) {
  return {
    id: "task-base",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    status: "queued",
    input: {},
    checkpoints: [],
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    ...overrides,
  };
}

test("isRecoverableAgentTask only treats queued and expired running tasks as recoverable", () => {
  const now = 1710000010000;
  assert.equal(isRecoverableAgentTask(createTask({ status: "queued" })), true);
  assert.equal(isRecoverableAgentTask(createTask({ status: "running" }), now), true);
  assert.equal(
    isRecoverableAgentTask(
      createTask({ status: "running", leaseUntil: now - 1 }),
      now
    ),
    true
  );
  assert.equal(
    isRecoverableAgentTask(
      createTask({ status: "running", leaseUntil: now + 60_000 }),
      now
    ),
    false
  );
  assert.equal(isRecoverableAgentTask(createTask({ status: "completed" })), false);
  assert.equal(isRecoverableAgentTask(createTask({ status: "failed" })), false);
  assert.equal(isRecoverableAgentTask(createTask({ status: "cancelled" })), false);
});

test("selectRecoverableAgentTaskForProject picks the newest recoverable task for the current project", () => {
  const selected = selectRecoverableAgentTaskForProject(
    [
      createTask({
        id: "task-old-running",
        status: "running",
        updatedAt: 1710000001000,
      }),
      createTask({
        id: "task-completed-newer",
        status: "completed",
        updatedAt: 1710000005000,
      }),
      createTask({
        id: "task-other-project",
        projectId: "project-2",
        status: "running",
        updatedAt: 1710000006000,
      }),
      createTask({
        id: "task-new-queued",
        status: "queued",
        updatedAt: 1710000004000,
      }),
    ],
    "project-1",
    1710000010000
  );

  assert.equal(selected?.id, "task-new-queued");
});

test("selectRecoverableAgentTaskForProject ignores running tasks with an active lease", () => {
  const now = 1710000010000;
  const selected = selectRecoverableAgentTaskForProject(
    [
      createTask({
        id: "task-active-elsewhere",
        status: "running",
        leaseUntil: now + 60_000,
        updatedAt: now,
      }),
    ],
    "project-1",
    now
  );

  assert.equal(selected, null);
});

test("selectRecoverableAgentTaskForProject returns null when no task should be resumed", () => {
  const selected = selectRecoverableAgentTaskForProject(
    [
      createTask({ id: "task-completed", status: "completed" }),
      createTask({ id: "task-failed", status: "failed" }),
      createTask({
        id: "task-other-project",
        projectId: "project-2",
        status: "running",
      }),
    ],
    "project-1"
  );

  assert.equal(selected, null);
});
