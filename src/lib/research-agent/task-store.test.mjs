import assert from "node:assert/strict";
import test from "node:test";

import {
  agentTaskFromRow,
  appendLocalAgentTaskCheckpoint,
  claimLocalAgentTask,
  claimAgentTask,
  clearLocalAgentTaskStore,
  createAgentTask,
  completeLocalAgentTask,
  createLocalAgentTask,
  failLocalAgentTask,
  getLocalAgentTask,
  listClaimableAgentTasks,
  listLocalClaimableAgentTasks,
  listLocalAgentTasksForProject,
  renewLocalAgentTaskLease,
  runTaskDbOperationWithRetry,
} from "./task-store.ts";

test("local agent task store creates and claims a durable task envelope", () => {
  clearLocalAgentTaskStore();

  const task = createLocalAgentTask({
    id: "task-1",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    input: { rawIdea: "研究平台佣金" },
    now: 1710000000000,
  });

  assert.equal(task.status, "queued");
  assert.equal(task.action, "solve_equilibrium");
  assert.equal(task.checkpoints.length, 0);

  const claimed = claimLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    leaseUntil: 1710000060000,
    now: 1710000001000,
  });

  assert.equal(claimed?.status, "running");
  assert.equal(claimed?.workerId, "worker-1");
  assert.equal(
    claimLocalAgentTask({
      id: task.id,
      ownerId: "user-1",
      workerId: "worker-2",
      leaseUntil: 1710000060000,
      now: 1710000002000,
    }),
    null
  );
});

test("agent task store strips runtime model secrets from persisted and returned tasks", async () => {
  clearLocalAgentTaskStore();

  const task = await createAgentTask({
    id: "task-secret-redaction",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    input: {
      rawIdea: "研究平台佣金",
      action: "solve_equilibrium",
      projectId: "project-1",
      runtimeModelSource: {
        source: "own",
        provider: "openai-compatible",
        apiKey: "secret-token-123",
        model: "deepseek-chat",
      },
    },
    now: 1710000000000,
    forceLocal: true,
  });
  const stored = getLocalAgentTask("user-1", task.id);

  assert.equal(JSON.stringify(task).includes("secret-token-123"), false);
  assert.equal(JSON.stringify(stored).includes("secret-token-123"), false);
  assert.equal("runtimeModelSource" in task.input, false);
  assert.equal("runtimeModelSource" in stored.input, false);
});

test("agent task row mapper redacts legacy task rows before API output", () => {
  const task = agentTaskFromRow({
    id: "task-legacy-secret",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    status: "completed",
    input: {
      rawIdea: "研究平台佣金",
      runtimeModelSource: {
        source: "own",
        apiKey: "secret-token-legacy",
      },
    },
    checkpoints: [
      {
        id: "checkpoint-1",
        stepId: "review-equilibrium",
        status: "completed",
        title: "Review equilibrium",
        createdAt: 1710000002000,
        metadata: {
          apiKey: "secret-token-checkpoint",
          safe: "kept",
        },
      },
    ],
    workerId: "worker-1",
    leaseUntil: null,
    result: { projectId: "project-1", apiKey: "secret-token-result" },
    error: null,
    createdAt: new Date(1710000000000),
    updatedAt: new Date(1710000003000),
    completedAt: new Date(1710000003000),
    failedAt: null,
  });

  const serialized = JSON.stringify(task);

  assert.equal(serialized.includes("secret-token-legacy"), false);
  assert.equal(serialized.includes("secret-token-checkpoint"), false);
  assert.equal(serialized.includes("secret-token-result"), false);
  assert.equal("runtimeModelSource" in task.input, false);
  assert.equal(task.checkpoints[0].metadata.safe, "kept");
});

test("agent task store redacts common secret key variants from nested task fields", () => {
  clearLocalAgentTaskStore();

  const task = createLocalAgentTask({
    id: "task-secret-variants",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    input: {
      rawIdea: "test idea",
      openaiApiKey: "secret-openai",
      DEEPSEEK_API_KEY: "secret-deepseek",
      headers: {
        "x-api-key": "secret-header",
        Authorization: "Bearer secret-authorization",
      },
      nested: {
        token: "secret-token",
        secret: "secret-generic",
      },
    },
    now: 1710000000000,
  });
  claimLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    leaseUntil: 1710000060000,
    now: 1710000001000,
  });
  appendLocalAgentTaskCheckpoint({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    checkpoint: {
      id: "checkpoint-secret-variants",
      stepId: "review-equilibrium",
      status: "completed",
      title: "Review equilibrium",
      createdAt: 1710000002000,
      metadata: {
        refreshToken: "secret-refresh-token",
        clerkSecretKey: "secret-clerk",
        safe: "kept",
      },
    },
    now: 1710000002000,
  });
  const completed = completeLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    result: {
      projectId: "project-1",
      apiKey: "secret-result-api-key",
      xApiKey: "secret-result-x-api-key",
      safe: "kept",
    },
    now: 1710000003000,
  });

  const serialized = JSON.stringify(completed);

  for (const secret of [
    "secret-openai",
    "secret-deepseek",
    "secret-header",
    "secret-authorization",
    "secret-token",
    "secret-generic",
    "secret-refresh-token",
    "secret-clerk",
    "secret-result-api-key",
    "secret-result-x-api-key",
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(completed?.checkpoints[0].metadata.safe, "kept");
  assert.equal(completed?.result.safe, "kept");
});

test("local agent task store appends checkpoints and finishes tasks", () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-2",
    ownerId: "user-1",
    projectId: "project-1",
    action: "analyze_properties",
    input: { rawIdea: "研究平台佣金" },
    now: 1710000000000,
  });

  appendLocalAgentTaskCheckpoint({
    id: task.id,
    ownerId: "user-1",
    checkpoint: {
      id: "checkpoint-1",
      stepId: "draft-properties",
      status: "running",
      title: "Draft property candidates",
      createdAt: 1710000001000,
    },
    now: 1710000001000,
  });
  const completed = completeLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    result: { projectId: "project-1", patchId: "patch-properties" },
    now: 1710000002000,
  });

  assert.equal(completed?.status, "completed");
  assert.equal(completed?.checkpoints.length, 1);
  assert.deepEqual(completed?.result, {
    projectId: "project-1",
    patchId: "patch-properties",
  });
  assert.equal(completed?.completedAt, 1710000002000);
});

test("local agent task store keeps failed tasks available for retry planning", () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-3",
    ownerId: "user-1",
    projectId: "project-1",
    action: "draft_paper",
    input: { rawIdea: "研究平台佣金" },
    now: 1710000000000,
  });

  const failed = failLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    error: "provider timeout",
    now: 1710000003000,
  });

  assert.equal(failed?.status, "failed");
  assert.equal(failed?.error, "provider timeout");
  assert.equal(getLocalAgentTask("user-1", task.id)?.status, "failed");
  assert.deepEqual(
    listLocalAgentTasksForProject("user-1", "project-1").map((item) => item.id),
    ["task-3"]
  );
});

test("local agent task store fences checkpoint and completion updates by worker", () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-worker-fence",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    input: { rawIdea: "研究平台佣金" },
    now: 1710000000000,
  });
  claimLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    leaseUntil: 1710000060000,
    now: 1710000001000,
  });

  const staleCheckpoint = appendLocalAgentTaskCheckpoint({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-2",
    checkpoint: {
      id: "checkpoint-stale",
      stepId: "review-equilibrium",
      status: "completed",
      title: "Review equilibrium",
      createdAt: 1710000002000,
    },
    now: 1710000002000,
  });
  const staleComplete = completeLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-2",
    result: { projectId: "project-1" },
    now: 1710000003000,
  });
  const currentComplete = completeLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    result: { projectId: "project-1" },
    now: 1710000004000,
  });

  assert.equal(staleCheckpoint, null);
  assert.equal(staleComplete, null);
  assert.equal(currentComplete?.status, "completed");
  assert.equal(currentComplete?.checkpoints.length, 0);
});

test("agent task store local fallback derives a lease deadline from a duration", async () => {
  clearLocalAgentTaskStore();
  const task = await createAgentTask({
    id: "task-lease",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    input: { rawIdea: "研究平台佣金" },
    now: 1710000000000,
    forceLocal: true,
  });

  const claimed = await claimAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    leaseMs: 60_000,
    now: 1710000001000,
    forceLocal: true,
  });

  assert.equal(claimed?.status, "running");
  assert.equal(claimed?.leaseUntil, 1710000061000);
});

test("agent task DB retry helper retries transient Neon fetch failures", async () => {
  let attempts = 0;

  const result = await runTaskDbOperationWithRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error("Failed query", {
          cause: new Error("Error connecting to database: TypeError: fetch failed"),
        });
      }
      return "ok";
    },
    { retryDelaysMs: [0, 0] }
  );

  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("agent task DB retry helper does not retry non-transient failures", async () => {
  let attempts = 0;

  await assert.rejects(
    () =>
      runTaskDbOperationWithRetry(
        async () => {
          attempts += 1;
          throw new Error("violates check constraint");
        },
        { retryDelaysMs: [0, 0] }
      ),
    /violates check constraint/
  );

  assert.equal(attempts, 1);
});

test("local agent task store renews only the current worker lease", () => {
  clearLocalAgentTaskStore();
  const task = createLocalAgentTask({
    id: "task-renew-lease",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    input: { rawIdea: "test idea" },
    now: 1710000000000,
  });
  claimLocalAgentTask({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    leaseUntil: 1710000060000,
    now: 1710000001000,
  });

  const staleRenewal = renewLocalAgentTaskLease({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-2",
    leaseUntil: 1710000120000,
    now: 1710000002000,
  });
  const currentRenewal = renewLocalAgentTaskLease({
    id: task.id,
    ownerId: "user-1",
    workerId: "worker-1",
    leaseUntil: 1710000120000,
    now: 1710000003000,
  });

  assert.equal(staleRenewal, null);
  assert.equal(currentRenewal?.workerId, "worker-1");
  assert.equal(currentRenewal?.leaseUntil, 1710000120000);
  assert.equal(getLocalAgentTask("user-1", task.id)?.leaseUntil, 1710000120000);
});

test("agent task store lists only queued and expired running tasks for workers", async () => {
  clearLocalAgentTaskStore();
  createLocalAgentTask({
    id: "task-queued",
    ownerId: "user-1",
    projectId: "project-1",
    action: "solve_equilibrium",
    input: { rawIdea: "queued" },
    now: 1710000000000,
  });
  createLocalAgentTask({
    id: "task-running-fresh",
    ownerId: "user-1",
    projectId: "project-1",
    action: "analyze_properties",
    input: { rawIdea: "fresh" },
    now: 1710000001000,
  });
  claimLocalAgentTask({
    id: "task-running-fresh",
    ownerId: "user-1",
    workerId: "worker-fresh",
    leaseUntil: 1710000060000,
    now: 1710000002000,
  });
  createLocalAgentTask({
    id: "task-running-expired",
    ownerId: "user-2",
    projectId: "project-2",
    action: "draft_paper",
    input: { rawIdea: "expired" },
    now: 1710000003000,
  });
  claimLocalAgentTask({
    id: "task-running-expired",
    ownerId: "user-2",
    workerId: "worker-old",
    leaseUntil: 1710000005000,
    now: 1710000004000,
  });
  const failed = createLocalAgentTask({
    id: "task-failed",
    ownerId: "user-2",
    projectId: "project-2",
    action: "draft_paper",
    input: { rawIdea: "failed" },
    now: 1710000006000,
  });
  failLocalAgentTask({
    id: failed.id,
    ownerId: failed.ownerId,
    error: "failed",
    now: 1710000007000,
  });

  assert.deepEqual(
    listLocalClaimableAgentTasks({ now: 1710000010000 }).map((task) => task.id),
    ["task-queued", "task-running-expired"]
  );
  assert.deepEqual(
    (
      await listClaimableAgentTasks({
        now: 1710000010000,
        limit: 1,
        forceLocal: true,
      })
    ).map((task) => task.id),
    ["task-queued"]
  );
});

test("agent task row mapper normalizes persisted database timestamps", () => {
  const task = agentTaskFromRow({
    id: "task-db",
    ownerId: "user-1",
    projectId: "project-1",
    action: "analyze_properties",
    status: "completed",
    input: { rawIdea: "研究平台佣金" },
    checkpoints: [
      {
        id: "checkpoint-1",
        stepId: "draft-properties",
        status: "completed",
        title: "Draft properties",
        createdAt: 1710000002000,
      },
    ],
    workerId: "worker-1",
    leaseUntil: null,
    result: { projectId: "project-1", patchIds: ["patch-1"] },
    error: null,
    createdAt: new Date(1710000000000),
    updatedAt: new Date(1710000003000),
    completedAt: new Date(1710000003000),
    failedAt: null,
  });

  assert.equal(task.createdAt, 1710000000000);
  assert.equal(task.updatedAt, 1710000003000);
  assert.equal(task.completedAt, 1710000003000);
  assert.deepEqual(task.result, {
    projectId: "project-1",
    patchIds: ["patch-1"],
  });
});
