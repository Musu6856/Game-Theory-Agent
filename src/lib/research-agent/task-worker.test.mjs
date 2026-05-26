import assert from "node:assert/strict";
import test from "node:test";

import {
  claimLocalAgentTask,
  clearLocalAgentTaskStore,
  createLocalAgentTask,
} from "./task-store.ts";
import { runAgentTaskWorkerBatch } from "./task-worker.ts";

test("agent task worker batch runs claimable tasks with persisted owners only", async () => {
  clearLocalAgentTaskStore();
  createLocalAgentTask({
    id: "task-queued",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: { rawIdea: "queued" },
    now: 1710000000000,
  });
  createLocalAgentTask({
    id: "task-running-expired",
    ownerId: "user-2",
    projectId: "22222222-2222-4222-8222-222222222222",
    action: "analyze_properties",
    input: { rawIdea: "expired" },
    now: 1710000001000,
  });
  claimLocalAgentTask({
    id: "task-running-expired",
    ownerId: "user-2",
    workerId: "worker-old",
    leaseUntil: 1710000002000,
    now: 1710000001500,
  });
  createLocalAgentTask({
    id: "task-running-fresh",
    ownerId: "user-3",
    projectId: "33333333-3333-4333-8333-333333333333",
    action: "draft_paper",
    input: { rawIdea: "fresh" },
    now: 1710000003000,
  });
  claimLocalAgentTask({
    id: "task-running-fresh",
    ownerId: "user-3",
    workerId: "worker-fresh",
    leaseUntil: 1710000100000,
    now: 1710000004000,
  });
  const calls = [];

  const batch = await runAgentTaskWorkerBatch({
    workerId: "worker-auto",
    leaseMs: 60_000,
    now: 1710000010000,
    forceLocal: true,
    runTask: async (input) => {
      calls.push(input);
      return {
        id: input.id,
        ownerId: input.ownerId,
        projectId:
          input.id === "task-queued"
            ? "11111111-1111-4111-8111-111111111111"
            : "22222222-2222-4222-8222-222222222222",
        action:
          input.id === "task-queued"
            ? "solve_equilibrium"
            : "analyze_properties",
        status: "completed",
        input: {},
        checkpoints: [],
        workerId: input.workerId,
        createdAt: 1710000000000,
        updatedAt: 1710000010000,
        completedAt: 1710000010000,
      };
    },
  });

  assert.deepEqual(
    calls.map((call) => ({
      id: call.id,
      ownerId: call.ownerId,
      workerId: call.workerId,
      leaseMs: call.leaseMs,
      forceLocal: call.forceLocal,
      hasRuntimeModelSource: Object.prototype.hasOwnProperty.call(
        call,
        "runtimeModelSource"
      ),
    })),
    [
      {
        id: "task-queued",
        ownerId: "user-1",
        workerId: "worker-auto",
        leaseMs: 60_000,
        forceLocal: true,
        hasRuntimeModelSource: false,
      },
      {
        id: "task-running-expired",
        ownerId: "user-2",
        workerId: "worker-auto",
        leaseMs: 60_000,
        forceLocal: true,
        hasRuntimeModelSource: false,
      },
    ]
  );
  assert.equal(batch.attempted, 2);
  assert.equal(batch.completed, 2);
  assert.equal(batch.failed, 0);
});

test("agent task worker batch reports task-level failures without aborting the batch", async () => {
  clearLocalAgentTaskStore();
  createLocalAgentTask({
    id: "task-ok",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "solve_equilibrium",
    input: { rawIdea: "ok" },
    now: 1710000000000,
  });
  createLocalAgentTask({
    id: "task-fails",
    ownerId: "user-1",
    projectId: "11111111-1111-4111-8111-111111111111",
    action: "analyze_properties",
    input: { rawIdea: "fails" },
    now: 1710000001000,
  });

  const batch = await runAgentTaskWorkerBatch({
    workerId: "worker-auto",
    now: 1710000010000,
    forceLocal: true,
    runTask: async (input) => {
      if (input.id === "task-fails") {
        throw new Error("provider timeout");
      }
      return {
        id: input.id,
        ownerId: input.ownerId,
        projectId: "11111111-1111-4111-8111-111111111111",
        action: "solve_equilibrium",
        status: "completed",
        input: {},
        checkpoints: [],
        workerId: input.workerId,
        createdAt: 1710000000000,
        updatedAt: 1710000010000,
        completedAt: 1710000010000,
      };
    },
  });

  assert.equal(batch.attempted, 2);
  assert.equal(batch.completed, 1);
  assert.equal(batch.failed, 1);
  assert.deepEqual(
    batch.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      error: task.error,
    })),
    [
      { id: "task-ok", status: "completed", error: undefined },
      { id: "task-fails", status: "failed", error: "provider timeout" },
    ]
  );
});
