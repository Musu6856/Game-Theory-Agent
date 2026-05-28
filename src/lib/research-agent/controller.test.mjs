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

test("controller distinguishes quick paper review from high attention asset review", () => {
  const project = withPendingPatch(
    generatePropertyAnalysis(
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
        ),
        { acceptDefaultFallbackScope: true }
      )
    ),
    "paper"
  );

  const recommendation = recommendNextAgentStep(project);

  assert.equal(recommendation.status, "blocked");
  assert.equal(recommendation.blocker?.kind, "pending_patch");
  assert.equal(recommendation.blocker?.patchKind, "paper");
  assert.equal(recommendation.blocker?.reviewLoad?.level, "low");
  assert.match(recommendation.blocker?.description ?? "", /快速审核/);
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

test("controller recommends model repair when an equilibrium draft has already stalled", () => {
  const confirmed = confirmResearchModel(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "鐮旂┒澶栧崠骞冲彴鎺掍粬鍗忚",
        now: 1710000000000,
      }),
      "seller-multihoming-pricing"
    )
  );
  const stalledDraft = {
    ...confirmed,
    equilibriumResult: {
      status: "derivation_draft",
      concept: "FOC 草稿",
      solvingSteps: ["列出一阶条件"],
      focs: ["\\partial \\Pi_A / \\partial s_A = 0"],
      conditions: ["需要二阶条件"],
      closedForm: "尚未得到闭式均衡解。",
      derivation: "只得到 FOC，缺少二阶/Hessian/KKT。",
      code: "",
      warnings: ["不能进入性质分析"],
    },
    researchSession: {
      ...confirmed.researchSession,
      phase: "equilibrium",
      assetSummary: {
        ...confirmed.researchSession.assetSummary,
        equilibriumStatus: "derivation_draft",
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt: "需要补充二阶条件、Hessian 或边界/KKT 后再求解。",
        },
      },
    },
  };

  const recommendation = recommendNextAgentStep(stalledDraft);

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "answer_model_question");
  assert.equal(recommendation.action?.agentAction, "build_model");
  assert.equal(recommendation.targetTab, "model");
  assert.match(recommendation.reason, /二阶|Hessian|KKT|模型/);
});

test("controller routes model-coverage draft loops to model repair instead of blind re-solve", () => {
  const confirmed = confirmResearchModel(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "外卖平台排他性协议与多归属",
        now: 1710000000000,
      }),
      "seller-multihoming-pricing"
    )
  );
  const project = {
    ...confirmed,
    equilibriumResult: {
      status: "derivation_draft",
      concept: "FOC draft",
      solvingSteps: ["Provider fallback only produced a draft."],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["Needs model coverage review."],
      closedForm: "No closed form.",
      derivation: "The candidate omitted a_d3 and multihoming mechanisms.",
      code: "",
      warnings: ["Coverage/manual review required."],
    },
    researchSession: {
      ...confirmed.researchSession,
      phase: "equilibrium",
      assetSummary: {
        ...confirmed.researchSession.assetSummary,
        equilibriumStatus: "derivation_draft",
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt: "Repeated fallback draft needs model repair.",
        },
      },
      mathArtifacts: [
        {
          id: "coverage-blocker",
          runId: "agent-equilibrium-coverage",
          stepId: "review-equilibrium",
          kind: "model_coverage_check",
          title: "Model coverage check",
          status: "failed",
          source: "model",
          input: { mechanismTerms: ["a_d3"] },
          output: {
            omittedHighValueMechanisms: [
              { symbol: "a_d3", label: "multihoming", mechanism: "multihoming" },
            ],
            suspiciousSimplification: true,
          },
          issues: [
            "The derivation omits high-value model mechanisms: a_d3 (multihoming).",
          ],
          createdAt: 1710000001000,
        },
      ],
    },
  };

  const recommendation = recommendNextAgentStep(project);
  const continuation = planSafeContinuation(project);

  assert.equal(recommendation.status, "ready");
  assert.equal(recommendation.action?.kind, "answer_model_question");
  assert.equal(recommendation.action?.agentAction, "build_model");
  assert.equal(recommendation.targetTab, "model");
  assert.match(recommendation.reason, /模型|model|coverage|机制|变量/i);
  assert.equal(continuation.status, "blocked");
  assert.equal(continuation.stopReason, "manual_choice_required");
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
      ),
      { acceptDefaultFallbackScope: true }
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
        ),
        { acceptDefaultFallbackScope: true }
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
        ),
        { acceptDefaultFallbackScope: true }
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
          ),
          { acceptDefaultFallbackScope: true }
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
    ),
    { acceptDefaultFallbackScope: true }
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
