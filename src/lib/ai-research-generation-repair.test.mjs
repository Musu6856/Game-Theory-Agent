import test from "node:test";
import assert from "node:assert/strict";

import { generateResearchProject } from "./ai-research-generation.ts";
import {
  createExplorationProject,
  generateSymbolicEquilibrium,
} from "./research-session.ts";

function createBaseProject() {
  return createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform commissions and subsidies",
    now: 1710000000000,
  });
}

function createValidHotellingModel() {
  return {
    symbols: [],
    sides: {
      consumerSideName: "buyers",
      merchantSideName: "sellers",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "platforms choose commission and subsidy",
        decisions: ["tau_i", "s_i"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + s_A - t_B x",
        notes: "Buyer utility on platform A.",
      },
    ],
    demandDerivation: "Derive demand from indifferent buyers and sellers.",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "Commission revenue net of subsidy.",
      },
    ],
    assumptions: ["Two platforms sit at the ends of a Hotelling line."],
    modelSetupDraft:
      "A two-platform Hotelling setup with commissions and buyer subsidies.",
  };
}

function createValidEquilibriumResult() {
  return {
    status: "solved",
    concept: "Symbolic equilibrium",
    solvingSteps: [
      "Set up the first-order conditions.",
      "Solve the symbolic system with SymPy.",
    ],
    focs: ["\\frac{\\partial \\Pi_A}{\\partial \\tau_A}=0"],
    conditions: ["t_B>0", "t_S>0"],
    closedForm: "\\tau_A^*=\\frac{t_S-2\\alpha_B}{q}",
    derivation:
      "The symbolic derivation keeps the model in closed form throughout.",
    code: "import sympy as sp\\nsp.solve([foc_tau_A], [tau_A])",
    warnings: ["No numerical substitution was used."],
  };
}

function createValidPropertyAnalyses() {
  return [
    {
      id: "analysis-1",
      target: "\\tau_A^*",
      parameter: "\\alpha_B",
      operation: "differentiate",
      symbolicResult: "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
      signCondition: "Negative when q>0.",
      propositionDraft: "Higher buyer-side differentiation reduces equilibrium commission.",
      proofSketch: "Differentiate the closed-form expression directly.",
      intuition: "A stronger buyer-side effect tightens the platform's commission choice.",
      warnings: ["Symbolic-only comparative statics."],
    },
    {
      id: "analysis-2",
      target: "s_A^*",
      parameter: "t_B",
      operation: "compare",
      symbolicResult: "\\frac{\\partial s_A^*}{\\partial t_B}=\\frac{1}{2}",
      signCondition: "Positive when the transport cost rises.",
      propositionDraft: "Higher horizontal differentiation increases subsidies.",
      proofSketch: "Use the implicit structure of the first-order conditions.",
      intuition: "Platforms can subsidize more when differentiation softens rivalry.",
      warnings: [],
    },
    {
      id: "analysis-3",
      target: "q^*",
      parameter: "\\alpha_S",
      operation: "threshold",
      symbolicResult: "\\frac{\\partial q^*}{\\partial \\alpha_S}>0",
      signCondition: "Positive under the maintained symbolic restrictions.",
      propositionDraft: "Seller-side strength expands the equilibrium market quantity.",
      proofSketch: "Track the symbolic comparative statics through equilibrium demand.",
      intuition: "More seller-side utility lifts the platform's matching volume.",
      warnings: [],
    },
  ];
}

test("build_model retries once when the provider returns an incomplete model", async () => {
  const project = createBaseProject();
  const prompts = [];

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async (messages) => {
        prompts.push(messages);
        if (prompts.length === 1) {
          return JSON.stringify({
            assistantMessage: "first draft",
            hotellingModel: {
              sides: {
                consumerSideName: "buyers",
                merchantSideName: "sellers",
              },
            },
          });
        }

        return JSON.stringify({
          assistantMessage: "repaired model",
          hotellingModel: createValidHotellingModel(),
        });
      },
    }
  );

  assert.equal(prompts.length, 2);
  assert.match(prompts[1][0].content, /repair/i);
  assert.equal(result.usedFallback, false);
  assert.equal(result.assistantMessage, "repaired model");
  assert.equal(result.project.projectType, "formal");
  assert.equal(result.project.researchSession?.phase, "model");
  assert.ok(result.project.hotellingModel);
});

test("solve_equilibrium retries once when the provider returns numeric output", async () => {
  const baseProject = createBaseProject();
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: baseProject.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project: baseProject,
    },
    {
      complete: async () => "{",
    }
  );
  const prompts = [];

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: modelProject.rawIdea,
      project: modelProject,
    },
    {
      complete: async (messages) => {
        prompts.push(messages);
        if (prompts.length === 1) {
          return JSON.stringify({
            assistantMessage: "numeric attempt",
            equilibriumResult: {
              status: "solved",
              concept: "Numerical equilibrium",
              solvingSteps: ["Substitute values numerically."],
              focs: ["tau_A = 0.5"],
              conditions: ["simulation converged"],
              closedForm: "tau_A = 0.5",
              derivation: "Monte Carlo simulation.",
              code: "simulate(seed)",
              warnings: [],
            },
          });
        }

        return JSON.stringify({
          assistantMessage: "symbolic repair",
          equilibriumResult: createValidEquilibriumResult(),
        });
      },
    }
  );

  assert.equal(prompts.length, 2);
  assert.match(prompts[1][0].content, /repair/i);
  assert.equal(result.usedFallback, false);
  assert.equal(result.assistantMessage, "symbolic repair");
  assert.equal(result.project.researchSession?.phase, "equilibrium");
  assert.equal(result.project.equilibriumResult?.status, "solved");
  assert.match(result.project.equilibriumResult?.closedForm ?? "", /\\tau_A\^\*/);
});

test("analyze_properties retries once when the provider returns fewer than three analyses", async () => {
  const baseProject = createBaseProject();
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: baseProject.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project: baseProject,
    },
    {
      complete: async () => "{",
    }
  );
  const equilibriumProject = generateSymbolicEquilibrium(modelProject, {
    acceptDefaultFallbackScope: true,
  });
  const prompts = [];

  const result = await generateResearchProject(
    {
      action: "analyze_properties",
      rawIdea: equilibriumProject.rawIdea,
      project: equilibriumProject,
    },
    {
      complete: async (messages) => {
        prompts.push(messages);
        if (prompts.length === 1) {
          return JSON.stringify({
            assistantMessage: "single analysis draft",
            propertyAnalyses: [
              {
                id: "analysis-1",
                target: "\\tau_A^*",
                parameter: "\\alpha_B",
                operation: "differentiate",
                symbolicResult: "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}",
                signCondition: "Negative when q>0.",
                propositionDraft: "A partial draft that still needs more analyses.",
                proofSketch: "Differentiate the closed form once.",
                intuition: "This is not enough on its own.",
                warnings: [],
              },
            ],
          });
        }

        return JSON.stringify({
          assistantMessage: "repaired analyses",
          propertyAnalyses: createValidPropertyAnalyses(),
        });
      },
    }
  );

  assert.equal(prompts.length, 2);
  assert.match(prompts[1][0].content, /repair/i);
  assert.equal(result.usedFallback, false);
  assert.equal(result.assistantMessage, "repaired analyses");
  assert.equal(result.project.propertyAnalyses?.length, 3);
  assert.equal(result.project.researchSession?.phase, "analysis");
});

test("repair loop is skipped when the provider fails before returning content", async () => {
  const project = createBaseProject();
  let attempts = 0;

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => {
        attempts += 1;
        throw new Error("provider unavailable");
      },
    }
  );

  assert.equal(attempts, 1);
  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "model");
});
