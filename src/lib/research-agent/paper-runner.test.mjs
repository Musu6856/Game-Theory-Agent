import assert from "node:assert/strict";
import test from "node:test";

import { runPaperOutputAgent } from "./paper-runner.ts";
import { applyResearchAssetPatchToProject } from "../research-asset-patch-apply.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generatePropertyAnalysis,
  generateSymbolicEquilibrium,
} from "../research-session.ts";

function createAnalyzedProject() {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金和补贴策略",
    now: 1710000000000,
  });

  return generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      ),
      { acceptDefaultFallbackScope: true }
    )
  );
}

test("paper output agent proposes reviewable draft sections with trace", async () => {
  const project = createAnalyzedProject();

  const result = await runPaperOutputAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "paper-agent-test",
      now: 1710000000000,
    }
  );

  const session = result.project.researchSession;
  const patch = session?.assetPatches?.[0];
  const rootChange = patch?.changes.find((change) => change.path === "sections");

  assert.equal(result.usedFallback, false);
  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, true);
  assert.equal(session?.agentRun?.status, "paused");
  assert.equal(session?.phase, "paper");
  assert.equal(session?.assetSummary.pendingDecision?.kind, "draft_paper");
  assert.equal(patch?.kind, "paper");
  assert.equal(patch?.status, "proposed");
  assert.equal(rootChange?.kind, "replace");
  assert.equal(Array.isArray(rootChange?.value), true);
  assert.equal(rootChange.value.length >= 4, true);
  assert.equal(
    rootChange.value.every(
      (section) =>
        typeof section.id === "string" &&
        typeof section.title === "string" &&
        typeof section.content === "string" &&
        section.status === "generated"
    ),
    true
  );
  assert.equal(
    result.agentRun.trace.some((event) => event.type === "tool_result"),
    true
  );
  assert.equal(
    result.agentRun.trace.some((event) => event.type === "model_result"),
    true
  );
});

test("paper output agent keeps draft sections pending until applied", async () => {
  const project = createAnalyzedProject();

  const result = await runPaperOutputAgent(
    {
      rawIdea: project.rawIdea,
      project,
    },
    {
      id: "paper-agent-pending-test",
      now: 1710000000000,
    }
  );

  const patch = result.project.researchSession?.assetPatches?.[0];
  const rootChange = patch?.changes.find((change) => change.path === "sections");

  assert.equal(project.sections.length, 0);
  assert.equal(result.project.sections.length, 0);
  assert.equal(Array.isArray(rootChange?.value), true);

  const applied = applyResearchAssetPatchToProject(result.project, patch, {
    now: 1710000000001,
  });

  assert.equal(applied.sections.length >= 4, true);
  assert.equal(applied.sections[0].status, "generated");
  assert.equal(applied.researchSession?.assetPatches?.[0].status, "applied");
  assert.equal(applied.researchSession?.assetSummary.pendingDecision, undefined);
  assert.equal(applied.researchSession?.phase, "paper");
});
