import test from "node:test";
import assert from "node:assert/strict";
import { cleanWorkbenchTitle } from "./workbench-format.ts";

test("cleanWorkbenchTitle removes markdown markers and extracts a concise Chinese title", () => {
  const raw =
    "## 已识别的建模要素\n- **研究对象**：二手交易平台的运行机制与市场效率问题，可能涉及平台定价、用户行为、产品质量信息不对称等核心议题。\n- **参与者**：平台、买家、卖家。";

  assert.equal(
    cleanWorkbenchTitle(raw, "研究二手交易平台相关的"),
    "二手交易平台的运行机制与市场效率问题"
  );
});

test("cleanWorkbenchTitle falls back to the raw idea without markdown debris", () => {
  assert.equal(
    cleanWorkbenchTitle("", "## **研究对象**：平台补贴机制"),
    "平台补贴机制"
  );
});
