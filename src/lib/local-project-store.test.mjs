import test from "node:test";
import assert from "node:assert/strict";

import {
  clearLocalProjectStore,
  deleteLocalProject,
  getLocalProject,
  listLocalProjects,
  shouldUseLocalProjectStore,
  upsertLocalProject,
} from "./local-project-store.ts";

function project(id, createdAt) {
  return {
    id,
    createdAt,
    rawIdea: `idea-${id}`,
    refinedIdea: `idea-${id}`,
    projectType: "exploration",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
  };
}

test("local project store keeps development projects when DATABASE_URL is absent", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  process.env.NODE_ENV = "development";
  delete process.env.DATABASE_URL;

  assert.equal(shouldUseLocalProjectStore(), true);

  clearLocalProjectStore();
  upsertLocalProject("owner-a", project("older", 1));
  upsertLocalProject("owner-a", project("newer", 2));
  upsertLocalProject("owner-b", project("other-owner", 3));

  assert.deepEqual(
    listLocalProjects("owner-a").map((item) => item.id),
    ["newer", "older"]
  );
  assert.equal(getLocalProject("owner-a", "newer")?.rawIdea, "idea-newer");
  assert.equal(getLocalProject("owner-a", "other-owner"), null);
  assert.equal(deleteLocalProject("owner-a", "older"), true);
  assert.deepEqual(
    listLocalProjects("owner-a").map((item) => item.id),
    ["newer"]
  );

  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
  if (previousDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = previousDatabaseUrl;
  }
});
