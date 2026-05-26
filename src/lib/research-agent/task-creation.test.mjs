import assert from "node:assert/strict";
import test from "node:test";

import { hasAgentTaskProjectAccess } from "./task-creation.ts";

test("hasAgentTaskProjectAccess requires the project to belong to the owner", async () => {
  const calls = [];

  const allowed = await hasAgentTaskProjectAccess({
    ownerId: "user-1",
    projectId: "project-1",
    getProject: async (input) => {
      calls.push(input);
      return { id: input.projectId };
    },
  });
  const rejected = await hasAgentTaskProjectAccess({
    ownerId: "user-1",
    projectId: "project-2",
    getProject: async () => null,
  });

  assert.equal(allowed, true);
  assert.equal(rejected, false);
  assert.deepEqual(calls, [{ ownerId: "user-1", projectId: "project-1" }]);
});
