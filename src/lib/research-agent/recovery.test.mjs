import assert from "node:assert/strict";
import test from "node:test";

import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
} from "../research-session.ts";
import { createAgentRun } from "./state.ts";
import { appendAgentRunToProject } from "./trace.ts";
import { getAgentRecoverySuggestion } from "./recovery.ts";

test("recovery suggests retrying a failed agent run from the current next action", () => {
  const project = withAgentRun(
    confirmResearchModel(
      adoptResearchDirection(
        createExplorationProject({
          id: "11111111-1111-4111-8111-111111111111",
          rawIdea: "研究二手平台佣金与补贴策略",
          now: 1710000000000,
        }),
        "secondhand-commission-subsidy-hotelling"
      )
    ),
    "failed"
  );

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion?.status, "retryable");
  assert.equal(suggestion?.actionKind, "solve_equilibrium");
  assert.equal(suggestion?.targetTab, "equilibrium");
  assert.match(suggestion?.title ?? "", /重试/);
});

test("recovery points paused approval runs to pending patch review", () => {
  const project = withPendingPatch(
    withAgentRun(
      adoptResearchDirection(
        createExplorationProject({
          id: "11111111-1111-4111-8111-111111111111",
          rawIdea: "研究二手平台佣金与补贴策略",
          now: 1710000000000,
        }),
        "secondhand-commission-subsidy-hotelling"
      ),
      "paused",
      { requiresApproval: true, pauseReason: "等待用户审阅并应用模型修改建议。" }
    ),
    "model"
  );

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion?.status, "review_required");
  assert.equal(suggestion?.targetTab, "model");
  assert.equal(suggestion?.actionKind, undefined);
  assert.match(suggestion?.reason ?? "", /审核/);
});

test("recovery can continue a paused controller run when no review item remains", () => {
  const project = withAgentRun(
    confirmResearchModel(
      adoptResearchDirection(
        createExplorationProject({
          id: "11111111-1111-4111-8111-111111111111",
          rawIdea: "研究二手平台佣金与补贴策略",
          now: 1710000000000,
        }),
        "secondhand-commission-subsidy-hotelling"
      )
    ),
    "paused",
    { pauseReason: "页面刷新或任务暂停。" }
  );

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion?.status, "continuable");
  assert.equal(suggestion?.targetTab, "equilibrium");
  assert.equal(suggestion?.actionKind, "safe_continue");
});

test("recovery describes the latest failed checkpoint when retrying", () => {
  const project = withAgentRun(
    confirmResearchModel(
      adoptResearchDirection(
        createExplorationProject({
          id: "11111111-1111-4111-8111-111111111111",
          rawIdea: "研究二手平台佣金与补贴策略",
          now: 1710000000000,
        }),
        "secondhand-commission-subsidy-hotelling"
      )
    ),
    "failed",
    {
      checkpoints: [
        {
          id: "checkpoint-1",
          runId: "agent-failed",
          stepId: "prepare-equilibrium",
          title: "准备均衡目标",
          status: "completed",
          createdAt: 1710000000100,
        },
        {
          id: "checkpoint-2",
          runId: "agent-failed",
          stepId: "draft-equilibrium",
          title: "生成符号均衡",
          status: "failed",
          toolName: "research.solveEquilibrium",
          createdAt: 1710000000200,
        },
      ],
    }
  );

  const suggestion = getAgentRecoverySuggestion(project);

  assert.equal(suggestion?.status, "retryable");
  assert.equal(suggestion?.checkpoint?.stepId, "draft-equilibrium");
  assert.match(suggestion?.reason ?? "", /生成符号均衡/);
  assert.match(suggestion?.reason ?? "", /检查点/);
});

test("recovery ignores completed runs", () => {
  const project = withAgentRun(
    createExplorationProject({
      id: "11111111-1111-4111-8111-111111111111",
      rawIdea: "研究二手平台佣金与补贴策略",
      now: 1710000000000,
    }),
    "completed"
  );

  assert.equal(getAgentRecoverySuggestion(project), null);
});

function withAgentRun(project, status, overrides = {}) {
  const run = {
    ...createAgentRun({
      id: `agent-${status}`,
      goal: "测试恢复建议",
      now: 1710000000001,
      plan: [
        {
          id: "step-1",
          kind: "tool",
          toolName: "research.solveEquilibrium",
          title: "生成符号均衡",
          status: status === "failed" ? "failed" : "running",
        },
      ],
    }),
    status,
    ...overrides,
  };

  return appendAgentRunToProject(project, run);
}

function withPendingPatch(project, kind) {
  return {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [
        ...(project.researchSession?.assetPatches ?? []),
        {
          id: `patch-${kind}`,
          kind,
          summary: "请审阅修改建议",
          changes: [
            {
              kind: "replace",
              path: kind === "paper" ? "sections" : "hotellingModel",
              value: {},
            },
          ],
          status: "proposed",
          createdAt: 1710000000000,
        },
      ],
    },
  };
}
