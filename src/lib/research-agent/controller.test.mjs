import assert from "node:assert/strict";
import test from "node:test";

import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generatePropertyAnalysis,
  generateSymbolicEquilibrium,
} from "../research-session.ts";
import {
  planSafeContinuation,
  recommendNextAgentStep,
} from "./controller.ts";

test("controller blocks continuation while a model patch is waiting for review", () => {
  const project = withPendingPatch(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "研究二手平台佣金与补贴策略",
        now: 1710000000000,
      }),
      "secondhand-commission-subsidy-hotelling"
    ),
    "model"
  );

  const recommendation = recommendNextAgentStep(project);

  assert.equal(recommendation.status, "blocked");
  assert.equal(recommendation.blocker?.kind, "pending_patch");
  assert.equal(recommendation.blocker?.patchKind, "model");
  assert.equal(recommendation.action, undefined);
  assert.match(recommendation.reason, /修改建议/);
});

test("controller recommends adopting a direction before model generation", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });

  const recommendation = recommendNextAgentStep(project);

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "choose_direction");
  assert.equal(recommendation.targetTab, "directions");
  assert.match(recommendation.reason, /方向/);
});

test("controller recommends confirming a drafted model before solving equilibrium", () => {
  const project = adoptResearchDirection(
    createExplorationProject({
      id: "11111111-1111-4111-8111-111111111111",
      rawIdea: "研究二手平台佣金与补贴策略",
      now: 1710000000000,
    }),
    "secondhand-commission-subsidy-hotelling"
  );

  const recommendation = recommendNextAgentStep(project);

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "confirm_model");
  assert.equal(recommendation.targetTab, "model");
  assert.match(recommendation.reason, /模型/);
});

test("controller recommends symbolic solving after model confirmation", () => {
  const project = confirmResearchModel(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "研究二手平台佣金与补贴策略",
        now: 1710000000000,
      }),
      "secondhand-commission-subsidy-hotelling"
    )
  );

  const recommendation = recommendNextAgentStep(project);

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "solve_equilibrium");
  assert.equal(recommendation.action?.agentAction, "solve_equilibrium");
  assert.equal(recommendation.targetTab, "equilibrium");
});

test("controller recommends property analysis after solved equilibrium", () => {
  const project = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(
        createExplorationProject({
          id: "11111111-1111-4111-8111-111111111111",
          rawIdea: "研究二手平台佣金与补贴策略",
          now: 1710000000000,
        }),
        "secondhand-commission-subsidy-hotelling"
      )
    )
  );

  const recommendation = recommendNextAgentStep(project);

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "analyze_properties");
  assert.equal(recommendation.action?.agentAction, "analyze_properties");
  assert.equal(recommendation.targetTab, "properties");
});

test("controller recommends paper drafting after stable property analysis", () => {
  const project = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(
          createExplorationProject({
            id: "11111111-1111-4111-8111-111111111111",
            rawIdea: "研究二手平台佣金与补贴策略",
            now: 1710000000000,
          }),
          "secondhand-commission-subsidy-hotelling"
        )
      )
    )
  );

  const recommendation = recommendNextAgentStep(project);

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "draft_paper");
  assert.equal(recommendation.action?.agentAction, "draft_paper");
  assert.equal(recommendation.targetTab, "paper");
});

test("controller recommends redoing stale property analysis", () => {
  const analyzed = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(
          createExplorationProject({
            id: "11111111-1111-4111-8111-111111111111",
            rawIdea: "研究二手平台佣金与补贴策略",
            now: 1710000000000,
          }),
          "secondhand-commission-subsidy-hotelling"
        )
      )
    )
  );
  const staleProperties = {
    ...analyzed,
    researchSession: {
      ...analyzed.researchSession,
      assetFreshness: {
        model: "fresh",
        equilibrium: "fresh",
        properties: "stale",
      },
    },
  };

  const recommendation = recommendNextAgentStep(staleProperties);

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "analyze_properties");
  assert.equal(recommendation.action?.agentAction, "analyze_properties");
  assert.equal(recommendation.targetTab, "properties");
  assert.match(recommendation.reason, /性质分析/);
});

test("controller marks the current loop complete after paper sections exist", () => {
  const project = {
    ...generatePropertyAnalysis(
      generateSymbolicEquilibrium(
        confirmResearchModel(
          adoptResearchDirection(
            createExplorationProject({
              id: "11111111-1111-4111-8111-111111111111",
              rawIdea: "研究二手平台佣金与补贴策略",
              now: 1710000000000,
            }),
            "secondhand-commission-subsidy-hotelling"
          )
        )
      )
    ),
    sections: [
      {
        id: "introduction",
        title: "引言",
        content: "研究平台佣金与补贴。",
        status: "draft",
      },
    ],
  };

  const recommendation = recommendNextAgentStep(project);

  assert.equal(recommendation.status, "complete");
  assert.equal(recommendation.action, undefined);
  assert.equal(recommendation.targetTab, "paper");
});

test("safe continuation refuses to choose a direction for the user", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });

  const plan = planSafeContinuation(project);

  assert.equal(plan.status, "blocked");
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.blocker?.kind, "manual_choice");
  assert.equal(plan.targetTab, "directions");
});

test("safe continuation confirms the model and then solves until an equilibrium patch review point", () => {
  const project = adoptResearchDirection(
    createExplorationProject({
      id: "11111111-1111-4111-8111-111111111111",
      rawIdea: "研究二手平台佣金与补贴策略",
      now: 1710000000000,
    }),
    "secondhand-commission-subsidy-hotelling"
  );

  const plan = planSafeContinuation(project);

  assert.equal(plan.status, "ready");
  assert.deepEqual(
    plan.steps.map((step) => step.kind),
    ["confirm_model", "solve_equilibrium"]
  );
  assert.equal(plan.targetTab, "equilibrium");
  assert.equal(plan.stopReason, "approval_required");
});

test("safe continuation starts from the next agent action when the model is already confirmed", () => {
  const project = confirmResearchModel(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "研究二手平台佣金与补贴策略",
        now: 1710000000000,
      }),
      "secondhand-commission-subsidy-hotelling"
    )
  );

  const plan = planSafeContinuation(project);

  assert.equal(plan.status, "ready");
  assert.deepEqual(
    plan.steps.map((step) => step.kind),
    ["solve_equilibrium"]
  );
  assert.equal(plan.targetTab, "equilibrium");
});

test("safe continuation stops when there is an existing pending patch", () => {
  const project = withPendingPatch(
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
    "equilibrium"
  );

  const plan = planSafeContinuation(project);

  assert.equal(plan.status, "blocked");
  assert.equal(plan.steps.length, 0);
  assert.equal(plan.blocker?.kind, "pending_patch");
  assert.equal(plan.blocker?.patchKind, "equilibrium");
});

test("safe continuation plans the later one-step runs to the next review point", () => {
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(
        createExplorationProject({
          id: "11111111-1111-4111-8111-111111111111",
          rawIdea: "研究二手平台佣金与补贴策略",
          now: 1710000000000,
        }),
        "secondhand-commission-subsidy-hotelling"
      )
    )
  );
  const analyzed = generatePropertyAnalysis(solved);

  const propertyPlan = planSafeContinuation(solved);
  const paperPlan = planSafeContinuation(analyzed);

  assert.deepEqual(
    propertyPlan.steps.map((step) => step.kind),
    ["analyze_properties"]
  );
  assert.equal(propertyPlan.targetTab, "properties");
  assert.deepEqual(
    paperPlan.steps.map((step) => step.kind),
    ["draft_paper"]
  );
  assert.equal(paperPlan.targetTab, "paper");
});

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
