import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectAuditMarkdown } from "./project-audit.ts";

function createAuditProject() {
  return {
    id: "audit-equilibrium-evidence",
    createdAt: 1710000000000,
    rawIdea: "test audit equilibrium evidence",
    refinedIdea: "test audit equilibrium evidence",
    projectType: "formal",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    researchSession: {
      phase: "paper",
      directions: [],
      messages: [],
      assetSummary: {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "solved",
        nextActions: [],
      },
      mathArtifacts: [],
    },
    equilibriumResult: {
      status: "solved",
      concept: "Interior Nash equilibrium",
      solvingSteps: ["Solve FOCs."],
      focs: ["F_tau = 0"],
      conditions: ["FOC holds."],
      closedForm: "tau_A^* = 1/2",
      derivation: "FOC derivation.",
      code: "",
      warnings: [],
    },
  };
}

test("project audit includes optimality evidence and promotion decision", () => {
  const project = {
    ...createAuditProject(),
    researchSession: {
      ...createAuditProject().researchSession,
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

  const markdown = buildProjectAuditMarkdown(project);

  assert.match(markdown, /均衡最优性证据/);
  assert.match(markdown, /不能用于正式比较静态|条件不足|KKT|最优性/);
});
