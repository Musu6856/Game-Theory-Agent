import test from "node:test";
import assert from "node:assert/strict";

import {
  formatMathArtifactContent,
  shouldRenderAsPlainMath,
} from "../../lib/math-artifact-format.ts";

test("math artifact renders pure formulas as math", () => {
  assert.equal(
    shouldRenderAsPlainMath("\\frac{\\partial \\Pi_A}{\\partial f_A}=0"),
    true
  );
  assert.equal(
    formatMathArtifactContent("\\frac{\\partial \\Pi_A}{\\partial f_A}=0"),
    "$\\frac{\\partial \\Pi_A}{\\partial f_A}=0$"
  );
});

test("math artifact does not wrap Chinese explanation in math delimiters", () => {
  const mixed = "对称均衡费用：f_B = t_B - α，平台利润为 Π。";

  assert.equal(shouldRenderAsPlainMath(mixed), false);
  assert.equal(formatMathArtifactContent(mixed), mixed);
});

test("math artifact preserves existing markdown math delimiters", () => {
  const content = "闭式解为 $f_B=t_B-\\alpha$。";

  assert.equal(formatMathArtifactContent(content), content);
});

test("math artifact unwraps whole Chinese sentences accidentally wrapped as math", () => {
  const content = "$对称均衡费用：f_B=t_B-\\alpha，市场份额为 1/2。$";

  assert.equal(
    formatMathArtifactContent(content),
    "对称均衡费用：f_B=t_B-\\alpha，市场份额为 1/2。"
  );
});

test("math artifact leaves mixed Chinese explanations for markdown rendering", () => {
  const content = "对称均衡下，f_A^B=f_B^B=f_B，其中 f_B=t_B-\\alpha_S";

  assert.equal(shouldRenderAsPlainMath(content), false);
  assert.equal(formatMathArtifactContent(content), content);
});
