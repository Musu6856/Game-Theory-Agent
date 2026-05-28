import test from "node:test";
import assert from "node:assert/strict";

import {
  createResearchAssetPatch,
  rejectResearchAssetPatch,
  validateResearchAssetPatch,
} from "./research-asset-patch.ts";

test("rejects malformed research asset patch payloads", () => {
  const result = validateResearchAssetPatch({
    id: "patch-1",
    kind: "model",
    summary: "tighten the model",
    status: "proposed",
    createdAt: 1710000000000,
    changes: [
      {
        kind: "replace",
        path: "",
        value: "U_A = v_A - p",
      },
    ],
  });

  assert.equal(result, null);
});

test("rejected research asset patches keep audit data", () => {
  const patch = createResearchAssetPatch({
    id: "patch-2",
    kind: "equilibrium",
    summary: "refresh equilibrium after model edit",
    sourceMessageId: "msg-7",
    createdAt: 1710000000000,
    changes: [
      {
        kind: "replace",
        path: "closedForm",
        value: "p_A^* = \\tau_A^*",
        previousValue: "p_A^* = 1/2",
      },
    ],
  });

  const rejected = rejectResearchAssetPatch(
    patch,
    "equilibrium draft is stale",
    1710000005000
  );

  assert.equal(rejected.id, patch.id);
  assert.equal(rejected.kind, patch.kind);
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.createdAt, patch.createdAt);
  assert.equal(rejected.sourceMessageId, "msg-7");
  assert.equal(rejected.rejectedAt, 1710000005000);
  assert.equal(rejected.rejectionReason, "equilibrium draft is stale");
  assert.deepEqual(rejected.changes, patch.changes);
  assert.deepEqual(validateResearchAssetPatch(rejected), rejected);
});

test("research asset patch changes keep structured review risk metadata", () => {
  const patch = createResearchAssetPatch({
    id: "patch-3",
    kind: "equilibrium",
    summary: "review coverage-blocked equilibrium candidate",
    createdAt: 1710000000000,
    changes: [
      {
        kind: "replace",
        path: "equilibriumResult",
        value: { status: "solved" },
        note: "Coverage/manual review required.",
        reviewRisk: "coverage_blocked",
      },
    ],
  });

  assert.equal(patch.changes[0].reviewRisk, "coverage_blocked");
  assert.equal(
    validateResearchAssetPatch(patch)?.changes[0].reviewRisk,
    "coverage_blocked"
  );
});
