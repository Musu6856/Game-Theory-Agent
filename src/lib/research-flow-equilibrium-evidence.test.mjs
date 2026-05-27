import assert from "node:assert/strict";
import test from "node:test";

import { getResearchFlowState } from "./research-flow.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generateSymbolicEquilibrium,
} from "./research-session.ts";

test("research flow blocks analysis when solved equilibrium still needs optimality review", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test optimality evidence flow guard",
    now: 1710000000000,
  });
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    ),
    { acceptDefaultFallbackScope: true }
  );
  const withReviewNeeded = {
    ...solved,
    researchSession: {
      ...solved.researchSession,
      mathArtifacts: [
        {
          id: "boundary-review",
          stepId: "review-equilibrium",
          kind: "boundary_kkt_check",
          title: "Boundary and KKT check",
          status: "condition_insufficient",
          source: "sympy",
          createdAt: 1710000000000,
          issues: ["Boundary candidate needs KKT evidence."],
        },
      ],
    },
  };

  const state = getResearchFlowState(withReviewNeeded);

  assert.equal(state.canAnalyzeProperties, false);
  assert.match(state.analysisStatusLabel, /最优性|人工复核|条件不足|KKT/);
});
