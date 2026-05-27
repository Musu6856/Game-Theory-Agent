import assert from "node:assert/strict";
import test from "node:test";

import {
  assessEquilibriumEvidence,
  isFormalEquilibriumReady,
} from "./equilibrium-evidence.ts";

const baseEquilibrium = {
  status: "solved",
  concept: "Interior Nash equilibrium",
  solvingSteps: ["Solve FOCs."],
  focs: ["F_tau = 0"],
  conditions: ["Second-order conditions passed."],
  closedForm: "tau_A^* = 1/2",
  derivation: "The Hessian is negative definite.",
  code: "",
  warnings: [],
};

test("assessEquilibriumEvidence treats implicit systems as draft-only", () => {
  const assessment = assessEquilibriumEvidence({
    equilibrium: {
      ...baseEquilibrium,
      status: "implicit_system",
      closedForm: "",
      solverScratchpad: {
        status: "implicit_system",
        implicitSystem: ["F_tau = 0", "F_s = 0"],
      },
    },
  });

  assert.equal(assessment.status, "draft");
  assert.equal(assessment.canUseForFormalComparativeStatics, false);
  assert.equal(assessment.representation, "implicit_system");
  assert.match(assessment.summary, /隐式|草稿|不能作为正式闭式均衡/);
  assert.equal(isFormalEquilibriumReady(assessment), false);
});

test("assessEquilibriumEvidence blocks solved results with unresolved optimality artifacts", () => {
  const assessment = assessEquilibriumEvidence({
    equilibrium: baseEquilibrium,
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
  });

  assert.equal(assessment.status, "review_required");
  assert.equal(assessment.canUseForFormalComparativeStatics, false);
  assert.match(assessment.summary, /KKT|最优性|人工复核|条件不足/);
  assert.equal(assessment.blockingArtifacts.length, 1);
});

test("assessEquilibriumEvidence accepts solved results with passed optimality artifacts", () => {
  const assessment = assessEquilibriumEvidence({
    equilibrium: baseEquilibrium,
    mathArtifacts: [
      {
        id: "soc-passed",
        stepId: "review-equilibrium",
        kind: "second_order_conditions",
        title: "Second-order conditions",
        status: "passed",
        source: "sympy",
        createdAt: 1710000000000,
      },
      {
        id: "kkt-passed",
        stepId: "review-equilibrium",
        kind: "boundary_kkt_check",
        title: "Boundary and KKT check",
        status: "passed",
        source: "sympy",
        createdAt: 1710000000001,
      },
    ],
  });

  assert.equal(assessment.status, "formal");
  assert.equal(assessment.canUseForFormalComparativeStatics, true);
  assert.match(assessment.summary, /二阶|最优性|闭式/);
  assert.equal(isFormalEquilibriumReady(assessment), true);
});
