import assert from "node:assert/strict";
import test from "node:test";

import { runPaperSectionRevisionAgent } from "./paper-section-runner.ts";
import { applyResearchAssetPatchToProject } from "../research-asset-patch-apply.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generatePropertyAnalysis,
  generateSymbolicEquilibrium,
} from "../research-session.ts";

function createPaperProject() {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金和补贴策略",
    now: 1710000000000,
  });
  const analyzed = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      ),
      { acceptDefaultFallbackScope: true }
    )
  );

  return {
    ...analyzed,
    sections: [
      {
        id: "paper-introduction",
        title: "引言与研究问题",
        content: "旧版引言。",
        status: "generated",
      },
      {
        id: "paper-model",
        title: "模型设定",
        content: "旧版模型设定。",
        status: "generated",
      },
      {
        id: "paper-discussion",
        title: "讨论与后续扩展",
        content: "旧版讨论。",
        status: "generated",
      },
    ],
  };
}

test("paper section revision agent proposes a single-section patch with trace", async () => {
  const project = createPaperProject();

  const result = await runPaperSectionRevisionAgent(
    {
      rawIdea: project.rawIdea,
      project,
      sectionId: "paper-model",
      instruction: "强调参与方、决策变量和时序。",
    },
    {
      id: "paper-section-test",
      now: 1710000000000,
    }
  );

  const session = result.project.researchSession;
  const patch = session?.assetPatches?.at(-1);
  const sectionChange = patch?.changes.find(
    (change) => change.path === "sections[paper-model]"
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.agentRun.status, "paused");
  assert.equal(result.agentRun.requiresApproval, true);
  assert.equal(session?.agentRun?.status, "paused");
  assert.equal(session?.phase, "paper");
  assert.equal(session?.assetSummary.pendingDecision?.kind, "revise_paper_section");
  assert.equal(patch?.kind, "paper");
  assert.equal(patch?.status, "proposed");
  assert.equal(patch?.summary.includes("模型设定"), true);
  assert.equal(sectionChange?.kind, "replace");
  assert.equal(sectionChange?.note?.includes("来源依据"), true);
  assert.equal(sectionChange?.note?.includes("模型"), true);
  assert.equal(sectionChange?.note?.includes("均衡"), true);
  assert.equal(sectionChange?.note?.includes("性质"), true);
  assert.equal(sectionChange?.value.id, "paper-model");
  assert.equal(sectionChange?.value.title, "模型设定");
  assert.equal(sectionChange?.value.status, "generated");
  assert.equal(sectionChange?.value.content.includes("强调参与方"), true);
  assert.equal(
    result.agentRun.trace.some((event) => event.type === "model_result"),
    true
  );
  assert.equal(
    result.agentRun.trace.some((event) => event.type === "tool_result"),
    true
  );
});

test("paper section revision keeps the target section pending until applied", async () => {
  const project = createPaperProject();

  const result = await runPaperSectionRevisionAgent(
    {
      rawIdea: project.rawIdea,
      project,
      sectionId: "paper-model",
    },
    {
      id: "paper-section-pending-test",
      now: 1710000000000,
    }
  );

  const patch = result.project.researchSession?.assetPatches?.at(-1);

  assert.equal(project.sections[1].content, "旧版模型设定。");
  assert.equal(result.project.sections[1].content, "旧版模型设定。");

  const applied = applyResearchAssetPatchToProject(result.project, patch, {
    now: 1710000000001,
  });

  assert.equal(applied.sections.length, 3);
  assert.equal(applied.sections[0].content, "旧版引言。");
  assert.notEqual(applied.sections[1].content, "旧版模型设定。");
  assert.equal(applied.sections[2].content, "旧版讨论。");
  assert.equal(applied.researchSession?.assetPatches?.at(-1)?.status, "applied");
});

test("paper section revision resume does not duplicate an already proposed section patch", async () => {
  const project = createPaperProject();
  const first = await runPaperSectionRevisionAgent(
    {
      rawIdea: project.rawIdea,
      project,
      sectionId: "paper-model",
      instruction: "强化模型设定段落",
    },
    {
      id: "paper-section-repeat-resume",
      now: 1710000000000,
    }
  );
  const firstPatch = first.project.researchSession?.assetPatches?.at(-1);
  const completedCheckpoint = first.agentRun.checkpoints
    ?.filter(
      (checkpoint) =>
        checkpoint.stepId === "propose-section-patch" &&
        checkpoint.status === "completed"
    )
    .at(-1);

  const resumed = await runPaperSectionRevisionAgent(
    {
      rawIdea: project.rawIdea,
      project: first.project,
      sectionId: "paper-model",
      instruction: "强化模型设定段落",
      resume: {
        runId: first.agentRun.id,
        checkpointId: completedCheckpoint?.id,
      },
    },
    {
      now: 1710000000100,
    }
  );

  const proposedSectionPatches =
    resumed.project.researchSession?.assetPatches?.filter(
      (patch) =>
        patch.status === "proposed" &&
        patch.kind === "paper" &&
        patch.changes.some((change) => change.path === "sections[paper-model]")
    ) ?? [];

  assert.equal(completedCheckpoint?.metadata?.patchId, firstPatch?.id);
  assert.equal(completedCheckpoint?.metadata?.stopReason, "approval_required");
  assert.equal(proposedSectionPatches.length, 1);
  assert.equal(proposedSectionPatches[0]?.id, firstPatch?.id);
  assert.equal(
    resumed.agentRun.trace.some(
      (event) =>
        event.stepId === "propose-section-patch" &&
        event.type === "tool_result" &&
        event.metadata?.reusedPatchId === firstPatch?.id
    ),
    true
  );
});
