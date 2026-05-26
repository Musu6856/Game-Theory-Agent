import assert from "node:assert/strict";
import test from "node:test";

import { authenticateAgentTaskWorkerRequest } from "./task-worker-auth.ts";

test("agent task worker auth rejects missing server secret", () => {
  const result = authenticateAgentTaskWorkerRequest({
    request: new Request("https://example.com/api/research/agent/tasks/worker"),
    secret: "",
  });

  assert.deepEqual(result, {
    ok: false,
    status: 503,
    code: "worker_secret_not_configured",
    message: "Agent task worker secret is not configured",
  });
});

test("agent task worker auth accepts bearer or worker-secret header", () => {
  assert.deepEqual(
    authenticateAgentTaskWorkerRequest({
      request: new Request("https://example.com/api/research/agent/tasks/worker", {
        headers: { Authorization: "Bearer worker-secret" },
      }),
      secret: "worker-secret",
    }),
    { ok: true }
  );
  assert.deepEqual(
    authenticateAgentTaskWorkerRequest({
      request: new Request("https://example.com/api/research/agent/tasks/worker", {
        headers: { "x-agent-worker-secret": "worker-secret" },
      }),
      secret: "worker-secret",
    }),
    { ok: true }
  );
});

test("agent task worker auth rejects missing or mismatched client secret", () => {
  assert.deepEqual(
    authenticateAgentTaskWorkerRequest({
      request: new Request("https://example.com/api/research/agent/tasks/worker"),
      secret: "worker-secret",
    }),
    {
      ok: false,
      status: 401,
      code: "worker_secret_required",
      message: "Agent task worker secret is required",
    }
  );
  assert.deepEqual(
    authenticateAgentTaskWorkerRequest({
      request: new Request("https://example.com/api/research/agent/tasks/worker", {
        headers: { Authorization: "Bearer wrong-secret" },
      }),
      secret: "worker-secret",
    }),
    {
      ok: false,
      status: 403,
      code: "worker_secret_invalid",
      message: "Agent task worker secret is invalid",
    }
  );
});
