import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("vercel cron invokes the protected agent task worker route", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8"));

  assert.deepEqual(config.crons, [
    {
      path: "/api/research/agent/tasks/worker",
      schedule: "0 20 * * *",
    },
  ]);
});
