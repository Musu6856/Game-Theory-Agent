import test from "node:test";
import assert from "node:assert/strict";

import { applyModelPatchToHotellingModel } from "./research-model-patch.ts";
import {
  adoptResearchDirection,
  createExplorationProject,
} from "./research-session.ts";

function createModel() {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const adopted = adoptResearchDirection(
    project,
    "secondhand-commission-subsidy-hotelling"
  );

  assert.ok(adopted.hotellingModel);
  return adopted.hotellingModel;
}

test("model patch updates assumptions and symbol notation together", () => {
  const model = createModel();
  const patched = applyModelPatchToHotellingModel(model, [
    {
      kind: "append",
      path: "hotellingModel.assumptions",
      value: "平台可把佣金变量改写为手续费符号。",
    },
    {
      kind: "replace",
      path: "hotellingModel.symbols[tau_A].symbol",
      value: "f_A",
    },
    {
      kind: "replace",
      path: "hotellingModel.symbols[f_A].meaning",
      value: "平台 A 对卖家收取的手续费率。",
    },
  ]);

  const feeSymbol = patched.symbols.find((symbol) => symbol.codeName === "f_A");

  assert.ok(
    patched.assumptions.includes("平台可把佣金变量改写为手续费符号。")
  );
  assert.equal(feeSymbol?.symbol, "f_A");
  assert.equal(feeSymbol?.baseSymbol, "f");
  assert.equal(feeSymbol?.subscript, "A");
  assert.equal(feeSymbol?.meaning, "平台 A 对卖家收取的手续费率。");
});

test("model patch can insert a complete new symbol definition", () => {
  const model = createModel();
  const patched = applyModelPatchToHotellingModel(model, [
    {
      kind: "append",
      path: "hotellingModel.symbols",
      value: {
        symbol: "F_A",
        baseSymbol: "F",
        subscript: "A",
        codeName: "F_A",
        name: "A 平台固定成本",
        meaning: "平台 A 的固定治理成本。",
        role: "cost",
        side: "platform",
        assumption: "nonnegative",
        recommended: false,
      },
    },
  ]);

  const fixedCost = patched.symbols.find((symbol) => symbol.codeName === "F_A");

  assert.equal(fixedCost?.name, "A 平台固定成本");
  assert.equal(fixedCost?.role, "cost");
  assert.equal(fixedCost?.meaning, "平台 A 的固定治理成本。");
});

test("model patch updates text fields used by repair proposals", () => {
  const model = createModel();
  const patched = applyModelPatchToHotellingModel(model, [
    {
      kind: "replace",
      path: "hotellingModel.modelSetupDraft",
      value:
        "在模型中令 \\psi_i(a_{d2}) = k_B a_{d2}，\\phi_i(a_{d2}) = k_S a_{d2}。",
    },
    {
      kind: "replace",
      path: "hotellingModel.demandDerivation",
      value: "需求推导沿用 Hotelling 无差异点。",
    },
    {
      kind: "replace",
      path: "hotellingModel.utilityFunctions[0].notes",
      value: "买家效用已代入线性机制收益。",
    },
    {
      kind: "replace",
      path: "hotellingModel.profitFunctions[profit-a].expression",
      value: "\\Pi_A = R_A - \\frac{c}{2}a_{d2}^2",
    },
  ]);

  assert.match(
    patched.modelSetupDraft,
    /\\psi_i\(a_\{d2\}\) = k_B a_\{d2\}/
  );
  assert.equal(patched.demandDerivation, "需求推导沿用 Hotelling 无差异点。");
  assert.equal(patched.utilityFunctions[0].notes, "买家效用已代入线性机制收益。");
  assert.equal(
    patched.profitFunctions.find((formula) => formula.id === "profit-a")?.expression,
    "\\Pi_A = R_A - \\frac{c}{2}a_{d2}^2"
  );
});

test("model patch can replace structural fields from an agent model candidate", () => {
  const model = createModel();
  const patched = applyModelPatchToHotellingModel(model, [
    {
      kind: "replace",
      path: "hotellingModel.sides",
      value: {
        consumerSideName: "读者",
        merchantSideName: "创作者",
      },
    },
    {
      kind: "replace",
      path: "hotellingModel.platforms",
      value: ["A", "B", "C"],
    },
    {
      kind: "replace",
      path: "hotellingModel.timing",
      value: [
        {
          id: "stage-quality",
          order: 1,
          name: "平台选择推荐质量",
          decisions: ["q_A", "q_B"],
        },
      ],
    },
  ]);

  assert.equal(patched.sides.consumerSideName, "读者");
  assert.equal(patched.sides.merchantSideName, "创作者");
  assert.deepEqual(patched.platforms, ["A", "B", "C"]);
  assert.equal(patched.timing[0].id, "stage-quality");
  assert.deepEqual(patched.timing[0].decisions, ["q_A", "q_B"]);
});
