import test from "node:test";
import assert from "node:assert/strict";

import {
  getPendingAssetPatchPanelClassName,
  getPendingAssetPatchesForDisplay,
  getResearchAssetPatchReviewLoad,
} from "./research-pending-patches-layout.ts";

test("pending asset patch panel owns its overflow instead of growing past the right pane", () => {
  const className = getPendingAssetPatchPanelClassName();

  assert.match(className, /shrink-0/);
  assert.match(className, /overflow-y-auto/);
  assert.match(className, /max-h-/);
});

test("pending asset patches show proposed changes newest first", () => {
  const patches = [
    { id: "applied", status: "applied", createdAt: 30 },
    { id: "old", status: "proposed", createdAt: 10 },
    { id: "new", status: "proposed", createdAt: 20 },
  ];

  assert.deepEqual(
    getPendingAssetPatchesForDisplay(patches).map((patch) => patch.id),
    ["new", "old"]
  );
});

test("pending asset patches classify core model and equilibrium reviews as high attention", () => {
  const modelPatch = {
    id: "model",
    kind: "model",
    status: "proposed",
    createdAt: 10,
    summary: "模型修改",
    changes: [{ kind: "replace", path: "hotellingModel", value: {} }],
  };
  const equilibriumPatch = {
    id: "equilibrium",
    kind: "equilibrium",
    status: "proposed",
    createdAt: 11,
    summary: "均衡修改",
    changes: [{ kind: "replace", path: "equilibriumResult", value: {} }],
  };

  assert.equal(getResearchAssetPatchReviewLoad(modelPatch).level, "high");
  assert.equal(getResearchAssetPatchReviewLoad(equilibriumPatch).level, "high");
});

test("pending asset patches classify paper-only drafts as quick review", () => {
  const paperPatch = {
    id: "paper",
    kind: "paper",
    status: "proposed",
    createdAt: 10,
    summary: "论文草稿",
    changes: [{ kind: "replace", path: "sections", value: [] }],
  };

  const load = getResearchAssetPatchReviewLoad(paperPatch);

  assert.equal(load.level, "low");
  assert.match(load.label, /快速/);
});

test("pending asset patches elevate math-risk property reviews", () => {
  const propertiesPatch = {
    id: "properties",
    kind: "properties",
    status: "proposed",
    createdAt: 10,
    summary: "性质分析",
    changes: [
      {
        kind: "replace",
        path: "propertyAnalyses",
        value: [],
        note: "Agent 自检提示：第 1 条性质分析的偏导复算不一致。",
      },
    ],
  };

  const load = getResearchAssetPatchReviewLoad(propertiesPatch);

  assert.equal(load.level, "high");
  assert.match(load.reason, /数学/);
});
