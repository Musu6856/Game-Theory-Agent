import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = [
  "src/components/hotelling-workbench/workbench.tsx",
  "src/components/hotelling-workbench/model-step.tsx",
  "src/components/hotelling-workbench/symbol-editor.tsx",
  "src/components/hotelling-workbench/equilibrium-step.tsx",
  "src/components/hotelling-workbench/analysis-step.tsx",
];

const forbiddenVisibleCopy = [
  "代码名",
  "Hotelling model builder",
  "Symbol dictionary",
  "No meaning recorded",
  "Consumer side name",
  "Merchant side name",
  "Platforms, one per line",
  "Timing stages",
  "Utility functions",
  "Demand derivation",
  "Profit functions",
  "Assumptions, one per line",
  "Model setup draft",
  "Symbolic equilibrium",
  "Generation failed",
  "Equilibrium concept",
  "Solving steps, one per line",
  "Closed-form equilibrium",
  "Streamed derivation",
  "Symbolic property analysis",
  "Target expression",
  "Property analyses",
  "Untitled symbolic target",
  "No symbolic",
  "Warnings",
  "Parameter:",
  "not specified",
];

test("Hotelling workbench user-facing copy stays localized", () => {
  const combined = files
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  const remaining = forbiddenVisibleCopy.filter((copy) =>
    combined.includes(copy)
  );

  assert.deepEqual(remaining, []);
});
