import assert from "node:assert/strict";
import test from "node:test";

import { buildResearchProjectMarkdown } from "./research-export.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generateSymbolicEquilibrium,
} from "./research-session.ts";

function createProject() {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "test downstream equilibrium evidence",
    now: 1710000000000,
  });

  return generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    ),
    { acceptDefaultFallbackScope: true }
  );
}

test("export labels implicit equilibrium as draft-only", () => {
  const project = {
    ...createProject(),
    equilibriumResult: {
      ...createProject().equilibriumResult,
      status: "implicit_system",
      closedForm: "",
      solverScratchpad: {
        status: "implicit_system",
        implicitSystem: ["F_tau = 0", "F_s = 0"],
      },
    },
  };

  const markdown = buildResearchProjectMarkdown(project);

  assert.match(markdown, /隐式|草稿|不能作为正式闭式均衡/);
  assert.doesNotMatch(markdown, /### 闭式解/);
});

test("export reports unresolved optimality evidence", () => {
  const project = {
    ...createProject(),
    researchSession: {
      ...createProject().researchSession,
      mathArtifacts: [
        {
          id: "hessian-review",
          stepId: "review-equilibrium",
          kind: "hessian_check",
          title: "Hessian check",
          status: "manual_review",
          source: "sympy",
          createdAt: 1710000000000,
          issues: ["Same-player multi-decision objective needs Hessian review."],
        },
      ],
    },
  };

  const markdown = buildResearchProjectMarkdown(project);

  assert.match(markdown, /Hessian|人工复核|最优性/);
});
