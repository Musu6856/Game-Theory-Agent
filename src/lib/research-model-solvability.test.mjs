import test from "node:test";
import assert from "node:assert/strict";

import { evaluateHotellingModelSolvability } from "./research-model-solvability.ts";

const baseModel = {
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
      name: "platform pricing",
      decisions: ["\\tau_A", "\\tau_B", "s_A", "s_B"],
    },
  ],
  utilityFunctions: [
    {
      id: "u-buyer-a",
      side: "consumer",
      platform: "A",
      expression: "U_A^B = v_B + s_A - t_B x",
      notes: "Buyer utility on A.",
    },
    {
      id: "u-seller-a",
      side: "merchant",
      platform: "A",
      expression: "U_A^S = v_S - \\tau_A q - t_S y",
      notes: "Seller utility on A.",
    },
  ],
  demandDerivation: "Demand shares come from buyer and seller indifference.",
  profitFunctions: [
    {
      id: "profit-a",
      platform: "A",
      expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
      notes: "Commission revenue net of subsidy.",
    },
    {
      id: "profit-b",
      platform: "B",
      expression: "\\Pi_B = \\tau_B q n_B^S n_B^B - s_B n_B^B",
      notes: "Commission revenue net of subsidy.",
    },
  ],
  assumptions: ["Two platforms sit at the ends of a Hotelling line."],
  modelSetupDraft: "A two-sided Hotelling model.",
};

test("model solvability gate accepts concrete Hotelling profit and utility expressions", () => {
  const result = evaluateHotellingModelSolvability(baseModel);

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("model solvability gate rejects unresolved mechanism functions", () => {
  const result = evaluateHotellingModelSolvability({
    ...baseModel,
    utilityFunctions: [
      {
        ...baseModel.utilityFunctions[0],
        expression: "U_A^B = v_B + \\psi_A(\\mu_d) - t_B x",
      },
    ],
    profitFunctions: [
      {
        ...baseModel.profitFunctions[0],
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B + R_A(\\mu_d) - C_A(a_d)",
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /unresolved mechanism function/i);
});

test("model solvability gate rejects common LaTeX mechanism function variants", () => {
  const result = evaluateHotellingModelSolvability({
    ...baseModel,
    utilityFunctions: [
      {
        ...baseModel.utilityFunctions[0],
        expression: "U_A^B = v_B + \\psi_{A}(\\mu_d) + \\Psi_A(a_d) - t_B x",
      },
    ],
    profitFunctions: [
      {
        ...baseModel.profitFunctions[0],
        expression:
          "\\Pi_A = \\tau_A q n_A^S n_A^B + Revenue_A(a_d) - Cost_A(a_d)",
      },
    ],
  });

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /unresolved mechanism function/i);
});
