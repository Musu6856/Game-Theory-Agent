import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateEquilibriumBenchmarkCase,
  listEquilibriumBenchmarkCases,
} from "./equilibrium-benchmark-cases.ts";

const REQUIRED_CATEGORIES = [
  "simple_symmetric_hotelling",
  "non_symmetric_no_half_collapse",
  "two_stage_reaction_function",
  "parameter_condition_insufficient",
  "boundary_solution",
  "soc_stationary_not_maximum",
  "multi_decision_hessian",
  "mechanism_rich_implicit",
];

test("equilibrium benchmark catalog covers the required solver categories", () => {
  const categories = new Set(
    listEquilibriumBenchmarkCases().map((benchmark) => benchmark.category)
  );

  assert.deepEqual([...categories].sort(), REQUIRED_CATEGORIES.sort());
});

test("equilibrium benchmark cases declare expected outcomes and forbidden shortcuts", async () => {
  for (const benchmark of listEquilibriumBenchmarkCases()) {
    const result = await evaluateEquilibriumBenchmarkCase(benchmark);

    assert.ok(
      benchmark.expected.allowedStatuses.includes(benchmark.equilibrium.status),
      `${benchmark.id} should use an allowed equilibrium status`
    );
    assert.equal(
      result.coverage.status,
      benchmark.expected.coverageStatus,
      `${benchmark.id} coverage status`
    );
    assert.equal(
      result.promotion,
      benchmark.expected.promotion,
      `${benchmark.id} promotion classification`
    );
    assert.deepEqual(
      result.detectedForbiddenShortcuts.sort(),
      benchmark.expected.detectedForbiddenShortcuts.sort(),
      `${benchmark.id} forbidden shortcuts`
    );

    for (const [kind, status] of Object.entries(
      benchmark.expected.optimalityStatuses
    )) {
      assert.equal(
        result.optimalityArtifacts[kind]?.status,
        status,
        `${benchmark.id} ${kind} status`
      );
    }
  }
});

test("non-default benchmark cases detect the default one-half shortcut", async () => {
  const shortcutCases = listEquilibriumBenchmarkCases().filter((benchmark) =>
    benchmark.expected.detectedForbiddenShortcuts.includes(
      "default_symmetric_half_solution"
    )
  );

  assert.ok(shortcutCases.length >= 1);

  for (const benchmark of shortcutCases) {
    const result = await evaluateEquilibriumBenchmarkCase(benchmark);

    assert.equal(result.canPromote, false);
    assert.ok(
      result.detectedForbiddenShortcuts.includes(
        "default_symmetric_half_solution"
      )
    );
  }
});
