import test from "node:test";
import assert from "node:assert/strict";

import { normalizeMarkdownMath } from "../lib/markdown-math.ts";

test("markdown renderer wraps bare symbolic tokens in inline math", () => {
  const normalized = normalizeMarkdownMath(
    "当 n_A^B 上升时，alpha_B 会改变 tau_A^* 的符号条件。"
  );

  assert.match(normalized, /\$n_A\^B\$/);
  assert.match(normalized, /\$alpha_B\$/);
  assert.match(normalized, /\$tau_A\^\*\$/);
});

test("markdown renderer preserves existing math delimiters", () => {
  const content = "已有 $n_A^B$ 与 \\(tau_A^*\\) 不应重复包裹。";

  assert.equal(
    normalizeMarkdownMath(content),
    "已有 $n_A^B$ 与 $tau_A^*$ 不应重复包裹。"
  );
});

test("markdown renderer preserves display math blocks without nested inline math", () => {
  const content = [
    "闭式解如下：",
    "",
    "$$",
    "\\tau_A^*=\\frac{t_S-2\\alpha_B}{q}",
    "$$",
    "",
    "其中 q>0。",
  ].join("\n");

  const normalized = normalizeMarkdownMath(content);

  assert.equal(
    normalized,
    [
      "闭式解如下：",
      "",
      "$$",
      "\\tau_A^*=\\frac{t_S-2\\alpha_B}{q}",
      "$$",
      "",
      "其中 q>0。",
    ].join("\n")
  );
  assert.doesNotMatch(normalized, /\$\s*\$\\tau_A/);
  assert.doesNotMatch(normalized, /\\tau_A\^\*=\$\\frac/);
});

test("markdown renderer leaves ordinary markdown and Chinese text untouched", () => {
  const content = "**命题**：网络效应增强会提高用户粘性。";

  assert.equal(normalizeMarkdownMath(content), content);
});

test("markdown renderer does not wrap tokens inside code spans or fences", () => {
  const content = [
    "正文里的 n_A^B 会渲染。",
    "",
    "`n_A_B = sp.symbols(\"n_A_B\")`",
    "",
    "```python",
    "tau_A, tau_B = sp.symbols(\"tau_A tau_B\")",
    "```",
  ].join("\n");
  const normalized = normalizeMarkdownMath(content);

  assert.match(normalized, /\$n_A\^B\$/);
  assert.match(normalized, /`n_A_B = sp\.symbols\("n_A_B"\)`/);
  assert.match(
    normalized,
    /```python\ntau_A, tau_B = sp\.symbols\("tau_A tau_B"\)\n```/
  );
});
