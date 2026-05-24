import test from "node:test";
import assert from "node:assert/strict";

import { getProviderTimeoutMs } from "./research-generation-timeout.ts";

test("model-building provider calls have enough time for structured DeepSeek output", () => {
  assert.equal(getProviderTimeoutMs("build_model"), 45000);
});

test("symbolic provider calls keep the longer timeout window", () => {
  assert.equal(getProviderTimeoutMs("solve_equilibrium"), 45000);
  assert.equal(getProviderTimeoutMs("analyze_properties"), 45000);
});
