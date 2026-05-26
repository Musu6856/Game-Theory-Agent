import assert from "node:assert/strict";
import test from "node:test";

import { runAgentTaskWorkerRoute } from "./task-worker-route.ts";

test("agent task worker route accepts cron GET requests with bearer auth", async () => {
  const calls = [];

  const response = await runAgentTaskWorkerRoute({
    request: new Request("https://example.com/api/research/agent/tasks/worker", {
      headers: {
        Authorization: "Bearer cron-secret",
      },
    }),
    secrets: ["worker-secret", "cron-secret"],
    createWorkerId: () => "worker-route-test",
    now: (() => {
      const values = [1710000000000, 1710000000123];
      return () => values.shift() ?? 1710000000123;
    })(),
    runBatch: async (input) => {
      calls.push(input);
      return {
        workerId: input.workerId,
        attempted: 0,
        completed: 0,
        failed: 0,
        tasks: [],
      };
    },
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(calls, [
    {
      workerId: "worker-route-test",
      limit: undefined,
      leaseMs: undefined,
    },
  ]);
  assert.deepEqual(body.batch, {
    workerId: "worker-route-test",
    attempted: 0,
    completed: 0,
    failed: 0,
    tasks: [],
  });
  assert.deepEqual(body.worker, {
    id: "worker-route-test",
    method: "GET",
    trigger: "cron",
    requestedLimit: null,
    requestedLeaseMs: null,
    startedAt: 1710000000000,
    finishedAt: 1710000000123,
    durationMs: 123,
  });
});

test("agent task worker route rejects missing and invalid worker secrets", async () => {
  const noServerSecret = await runAgentTaskWorkerRoute({
    request: new Request("https://example.com/api/research/agent/tasks/worker"),
    secrets: [],
    runBatch: async () => {
      throw new Error("should not execute");
    },
  });
  const missingClientSecret = await runAgentTaskWorkerRoute({
    request: new Request("https://example.com/api/research/agent/tasks/worker"),
    secrets: ["worker-secret"],
    runBatch: async () => {
      throw new Error("should not execute");
    },
  });
  const wrongClientSecret = await runAgentTaskWorkerRoute({
    request: new Request("https://example.com/api/research/agent/tasks/worker", {
      headers: {
        Authorization: "Bearer wrong-secret",
      },
    }),
    secrets: ["worker-secret"],
    runBatch: async () => {
      throw new Error("should not execute");
    },
  });

  assert.equal(noServerSecret.status, 503);
  assert.equal((await noServerSecret.json()).code, "worker_secret_not_configured");
  assert.equal(missingClientSecret.status, 401);
  assert.equal((await missingClientSecret.json()).code, "worker_secret_required");
  assert.equal(wrongClientSecret.status, 403);
  assert.equal((await wrongClientSecret.json()).code, "worker_secret_invalid");
});

test("agent task worker route validates POST JSON and bounds batch options", async () => {
  const invalidJson = await runAgentTaskWorkerRoute({
    request: new Request("https://example.com/api/research/agent/tasks/worker", {
      method: "POST",
      headers: {
        Authorization: "Bearer worker-secret",
      },
      body: "{",
    }),
    secrets: ["worker-secret"],
    runBatch: async () => {
      throw new Error("should not execute");
    },
  });
  const oversizedLimit = await runAgentTaskWorkerRoute({
    request: new Request("https://example.com/api/research/agent/tasks/worker", {
      method: "POST",
      headers: {
        Authorization: "Bearer worker-secret",
      },
      body: JSON.stringify({ limit: 999, leaseMs: 60_000 }),
    }),
    secrets: ["worker-secret"],
    runBatch: async () => {
      throw new Error("should not execute");
    },
  });
  const oversizedLease = await runAgentTaskWorkerRoute({
    request: new Request("https://example.com/api/research/agent/tasks/worker", {
      method: "POST",
      headers: {
        Authorization: "Bearer worker-secret",
      },
      body: JSON.stringify({ limit: 1, leaseMs: 999_999_999 }),
    }),
    secrets: ["worker-secret"],
    runBatch: async () => {
      throw new Error("should not execute");
    },
  });

  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).code, "invalid_json");
  assert.equal(oversizedLimit.status, 400);
  assert.equal((await oversizedLimit.json()).code, "invalid_worker_options");
  assert.equal(oversizedLease.status, 400);
  assert.equal((await oversizedLease.json()).code, "invalid_worker_options");
});

test("agent task worker route forwards bounded POST options to the worker batch", async () => {
  const calls = [];

  const response = await runAgentTaskWorkerRoute({
    request: new Request("https://example.com/api/research/agent/tasks/worker", {
      method: "POST",
      headers: {
        "x-agent-worker-secret": "worker-secret",
      },
      body: JSON.stringify({ limit: 2, leaseMs: 120_000 }),
    }),
    secrets: ["worker-secret"],
    createWorkerId: () => "worker-route-post",
    runBatch: async (input) => {
      calls.push(input);
      return {
        workerId: input.workerId,
        attempted: 0,
        completed: 0,
        failed: 0,
        tasks: [],
      };
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [
    {
      workerId: "worker-route-post",
      limit: 2,
      leaseMs: 120_000,
    },
  ]);
});
