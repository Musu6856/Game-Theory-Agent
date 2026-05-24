import test from "node:test";
import assert from "node:assert/strict";

import {
  getPendingAssetPatchPanelClassName,
  getPendingAssetPatchesForDisplay,
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
