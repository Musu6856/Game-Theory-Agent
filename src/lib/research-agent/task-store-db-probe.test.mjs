import assert from "node:assert/strict";
import test from "node:test";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;

test("agent task DB lifecycle probe persists checkpoints, redacts secrets, and cleans up", async (t) => {
  loadEnvConfig(process.cwd());
  if (process.env.RUN_AGENT_TASK_DB_PROBE !== "1") {
    t.skip("Set RUN_AGENT_TASK_DB_PROBE=1 to run the external DB lifecycle probe");
    return;
  }
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL is not configured");
    return;
  }

  const { runAgentTaskStoreDbLifecycleProbe } = await import(
    "./task-store-db-probe.ts"
  );

  const result = await runAgentTaskStoreDbLifecycleProbe({
    idPrefix: "codex-agent-task-db",
    now: 1710000000000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.statuses, ["queued", "running", "completed"]);
  assert.equal(result.checkpointCount, 1);
  assert.deepEqual(result.patchIds, ["patch-db-probe"]);
  assert.deepEqual(result.mathArtifactIds, ["artifact-db-probe"]);
  assert.equal(result.redactedSecrets, true);
  assert.equal(result.cleanedUp, true);
});
