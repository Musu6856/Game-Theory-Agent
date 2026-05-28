import assert from "node:assert/strict";
import test from "node:test";

import {
  isAgentTaskInProgress,
  selectVisibleActiveAgentTask,
} from "./workspace-agent-task-state.ts";

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

test("isAgentTaskInProgress treats only queued and actively leased running tasks as busy", () => {
  const now = 1710000010000;

  assert.equal(isAgentTaskInProgress(createTask({ status: "queued" }), now), true);
  assert.equal(
    isAgentTaskInProgress(
      createTask({ status: "running", leaseUntil: now + 60_000 }),
      now
    ),
    true
  );
  assert.equal(
    isAgentTaskInProgress(
      createTask({ status: "running", leaseUntil: now - 1 }),
      now
    ),
    false
  );
  assert.equal(isAgentTaskInProgress(createTask({ status: "failed" }), now), false);
  assert.equal(isAgentTaskInProgress(createTask({ status: "completed" }), now), false);
});

test("selectVisibleActiveAgentTask releases an optimistic running task after the server reports failure", () => {
  const selected = selectVisibleActiveAgentTask({
    activeTask: createTask({
      id: "task-1",
      status: "running",
      updatedAt: 1710000001000,
    }),
    tasks: [
      createTask({
        id: "task-1",
        status: "failed",
        updatedAt: 1710000002000,
      }),
    ],
    projectId: "project-1",
    now: 1710000010000,
  });

  assert.equal(selected, null);
});

test("selectVisibleActiveAgentTask trusts a server terminal status even when the local task timestamp is newer", () => {
  const selected = selectVisibleActiveAgentTask({
    activeTask: createTask({
      id: "task-1",
      status: "running",
      leaseUntil: 1710000100000,
      updatedAt: 1710000003000,
    }),
    tasks: [
      createTask({
        id: "task-1",
        status: "failed",
        updatedAt: 1710000002000,
      }),
    ],
    projectId: "project-1",
    now: 1710000010000,
  });

  assert.equal(selected, null);
});

test("selectVisibleActiveAgentTask keeps a current running task while its lease is active", () => {
  const now = 1710000010000;
  const selected = selectVisibleActiveAgentTask({
    activeTask: createTask({
      id: "task-1",
      status: "running",
      leaseUntil: now + 60_000,
      updatedAt: now,
    }),
    tasks: [],
    projectId: "project-1",
    now,
  });

  assert.equal(selected?.id, "task-1");
});
