import test from "node:test";
import assert from "node:assert/strict";

import {
  describeResearchAssetChange,
  getResearchAssetPatchSummaryLine,
} from "./research-asset-patch-display.ts";

test("summarizes model patches with readable Chinese counts", () => {
  const patch = {
    id: "patch-model",
    kind: "model",
    summary: "更新模型",
    status: "proposed",
    createdAt: 1710000000000,
    changes: [
      {
        kind: "replace",
        path: "hotellingModel.symbols[tau_A].meaning",
        value: "平台 A 佣金率。",
      },
      {
        kind: "append",
        path: "hotellingModel.symbols",
        value: {
          symbol: "F_A",
          name: "平台 A 固定成本",
        },
      },
      {
        kind: "append",
        path: "hotellingModel.assumptions",
        value: "固定成本非负。",
      },
    ],
  };

  assert.equal(
    getResearchAssetPatchSummaryLine(patch),
    "模型修改：2 条符号修改，1 条假设修改"
  );
});

test("describes model symbol and assumption changes as user-facing actions", () => {
  assert.equal(
    describeResearchAssetChange(
      {
        kind: "replace",
        path: "hotellingModel.symbols[tau_A].symbol",
        value: "f_A",
      },
      "model"
    ),
    "重命名符号 tau_A -> f_A"
  );

  assert.equal(
    describeResearchAssetChange(
      {
        kind: "append",
        path: "hotellingModel.symbols",
        value: {
          symbol: "F_A",
          name: "平台 A 固定成本",
        },
      },
      "model"
    ),
    "新增符号 F_A - 平台 A 固定成本"
  );

  assert.equal(
    describeResearchAssetChange(
      {
        kind: "replace",
        path: "hotellingModel.symbols[tau_A].meaning",
        value: "平台 A 佣金率。",
      },
      "model"
    ),
    "更新 tau_A 的含义：平台 A 佣金率。"
  );

  assert.equal(
    describeResearchAssetChange(
      {
        kind: "append",
        path: "hotellingModel.assumptions",
        value: "固定成本非负。",
      },
      "model"
    ),
    "新增假设：固定成本非负。"
  );
});
