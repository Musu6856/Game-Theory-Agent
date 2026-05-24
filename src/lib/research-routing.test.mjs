import test from "node:test";
import assert from "node:assert/strict";
import {
  getResearchIndexDestination,
  getResearchIndexWorkspaceProject,
} from "./research-routing.ts";

test("research index opens the newest project when records exist", () => {
  const destination = getResearchIndexDestination([
    { id: "project-newer" },
    { id: "project-older" },
  ]);

  assert.equal(destination, "/research/project-newer");
});

test("research index can stay on a blank composing workspace when requested", () => {
  const destination = getResearchIndexDestination(
    [{ id: "project-newer" }],
    { composeNew: true }
  );

  assert.equal(destination, null);
});

test("research index stays on the workspace when no records exist", () => {
  const destination = getResearchIndexDestination([]);

  assert.equal(destination, null);
});

test("research index does not seed the workspace with a project being deleted", () => {
  const project = getResearchIndexWorkspaceProject(
    [{ id: "project-being-deleted" }],
    {
      composeNew: true,
      deletingProjectId: "project-being-deleted",
    }
  );

  assert.equal(project, null);
});

test("research index can keep another project available while composing after deletion", () => {
  const project = getResearchIndexWorkspaceProject(
    [{ id: "project-being-deleted" }, { id: "remaining-project" }],
    {
      composeNew: true,
      deletingProjectId: "project-being-deleted",
    }
  );

  assert.deepEqual(project, { id: "remaining-project" });
});
