import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateEquilibriumCoverage,
  createEquilibriumCoverageArtifact,
} from "./equilibrium-coverage.ts";

function createMechanismRichModel() {
  return {
    symbols: [
      {
        id: "tau-a",
        symbol: "\\tau_A",
        baseSymbol: "tau",
        subscript: "A",
        codeName: "tau_A",
        name: "Platform A commission",
        meaning: "Commission chosen by platform A",
        role: "decision",
        side: "platform",
        assumption: "tau_A >= 0",
        recommended: true,
      },
      {
        id: "s-a",
        symbol: "s_A",
        baseSymbol: "s",
        subscript: "A",
        codeName: "s_A",
        name: "Platform A subsidy",
        meaning: "Subsidy chosen by platform A",
        role: "decision",
        side: "platform",
        assumption: "s_A >= 0",
        recommended: true,
      },
      {
        id: "q-a",
        symbol: "q_A",
        baseSymbol: "q",
        subscript: "A",
        codeName: "q_A",
        name: "Quality investment",
        meaning: "Quality investment chosen by platform A",
        role: "decision",
        side: "platform",
        assumption: "q_A >= 0",
        recommended: true,
      },
      {
        id: "r-a",
        symbol: "r_A",
        baseSymbol: "r",
        subscript: "A",
        codeName: "r_A",
        name: "Recommendation strength",
        meaning: "Recommendation strength chosen by platform A",
        role: "decision",
        side: "platform",
        assumption: "0 <= r_A <= 1",
        recommended: true,
      },
      {
        id: "theta",
        symbol: "\\theta",
        baseSymbol: "theta",
        codeName: "theta",
        name: "Quality sensitivity",
        meaning: "Consumer sensitivity to quality",
        role: "parameter",
        side: "consumer",
        assumption: "theta > 0",
        recommended: true,
      },
    ],
    sides: {
      consumerSideName: "buyers",
      merchantSideName: "sellers",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "platform-choice",
        order: 1,
        name: "Platforms choose commission, subsidy, quality, recommendation",
        decisions: ["tau_A", "s_A", "q_A", "r_A"],
      },
    ],
    utilityFunctions: [
      {
        id: "buyer-a",
        side: "consumer",
        platform: "A",
        expression: "v + theta*q_A + r_A - p_A - t*x",
        notes: "Quality and recommendation both affect demand.",
      },
    ],
    demandDerivation:
      "Buyer demand n_A^B depends on tau_A, s_A, q_A and r_A through utility.",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression:
          "Pi_A = tau_A*n_A^S - s_A*n_A^B - c_q*q_A^2/2 - c_r*r_A^2/2",
        notes: "Quality and recommendation are costly strategic mechanisms.",
      },
    ],
    assumptions: ["theta > 0", "c_q > 0", "c_r > 0"],
    modelSetupDraft:
      "Mechanism-rich model with quality investment and recommendation strength.",
  };
}

function createSimplifiedEquilibrium() {
  return {
    status: "solved",
    concept: "Simplified symmetric Hotelling equilibrium",
    solvingSteps: [
      "Write platform FOCs for tau and subsidy",
      "Solve the symmetric interior system",
      "Check Hessian is negative definite for tau and subsidy decisions",
    ],
    focs: [
      "partial Pi_A / partial tau_A = 0",
      "partial Pi_A / partial s_A = 0",
    ],
    conditions: [
      "t > alpha",
      "Second-order condition: Hessian is negative definite.",
    ],
    closedForm:
      "n_A^{B*}=1/2; n_A^{S*}=1/2; tau_A^*=(t-alpha)/2; s_A^*=alpha/2",
    derivation:
      "The symmetric Hotelling core gives a clean one-half allocation.",
    code: "sp.solve([foc_tau_A, foc_s_A], [tau_A, s_A])",
    warnings: [],
  };
}

test("evaluateEquilibriumCoverage flags omitted quality and recommendation mechanisms", () => {
  const result = evaluateEquilibriumCoverage({
    model: createMechanismRichModel(),
    equilibrium: createSimplifiedEquilibrium(),
  });

  assert.equal(result.status, "failed");
  assert.equal(result.canPromote, false);
  assert.deepEqual(result.model.decisionVariables.sort(), [
    "q_A",
    "r_A",
    "s_A",
    "tau_A",
  ]);
  assert.ok(result.derivation.usedSymbols.includes("tau_A"));
  assert.ok(result.derivation.usedSymbols.includes("s_A"));
  assert.ok(result.omittedHighValueMechanisms.some((item) => item.symbol === "q_A"));
  assert.ok(result.omittedHighValueMechanisms.some((item) => item.symbol === "r_A"));
  assert.ok(
    result.issues.some((issue) =>
      /quality investment|recommendation strength/i.test(issue)
    )
  );
  assert.ok(result.suspiciousSimplification);
});

test("evaluateEquilibriumCoverage allows a derivation that uses rich mechanisms explicitly", () => {
  const equilibrium = {
    ...createSimplifiedEquilibrium(),
    focs: [
      "partial Pi_A / partial tau_A = 0",
      "partial Pi_A / partial s_A = 0",
      "partial Pi_A / partial q_A = theta*n_A^B - c_q*q_A = 0",
      "partial Pi_A / partial r_A = n_A^B - c_r*r_A = 0",
    ],
    closedForm:
      "tau_A^*=tau(q_A,r_A); s_A^*=s(q_A,r_A); q_A^*=theta*n_A^B/c_q; r_A^*=n_A^B/c_r",
    derivation:
      "The equilibrium keeps quality q_A and recommendation r_A in the FOCs and closed-form candidate.",
  };

  const result = evaluateEquilibriumCoverage({
    model: createMechanismRichModel(),
    equilibrium,
  });

  assert.equal(result.status, "passed");
  assert.equal(result.canPromote, true);
  assert.deepEqual(result.omittedHighValueMechanisms, []);
  assert.equal(result.suspiciousSimplification, false);
});

test("createEquilibriumCoverageArtifact records model and derivation coverage", () => {
  const coverage = evaluateEquilibriumCoverage({
    model: createMechanismRichModel(),
    equilibrium: createSimplifiedEquilibrium(),
  });
  const artifact = createEquilibriumCoverageArtifact({
    coverage,
    id: "coverage-test",
    runId: "run-coverage-test",
    now: 1710000000000,
  });

  assert.equal(artifact.kind, "model_coverage_check");
  assert.equal(artifact.status, "failed");
  assert.equal(artifact.source, "model");
  assert.ok(artifact.issues?.some((issue) => issue.includes("q_A")));
  assert.deepEqual(artifact.output?.omittedHighValueMechanisms?.map((item) => item.symbol), [
    "q_A",
    "r_A",
  ]);
});
