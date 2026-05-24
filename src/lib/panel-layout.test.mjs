import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_RESEARCH_PANEL_LAYOUT,
  clampResearchPanelLayout,
  deserializeResearchPanelLayout,
  getExpandedPaneWidths,
  serializeResearchPanelLayout,
  toggleResearchPane,
} from "./panel-layout.ts";

test("panel layout defaults keep a usable center conversation column", () => {
  assert.deepEqual(DEFAULT_RESEARCH_PANEL_LAYOUT, {
    leftWidth: 280,
    rightWidth: 520,
    leftCollapsed: false,
    rightCollapsed: false,
  });
});

test("panel layout clamps side panes and protects center width", () => {
  const layout = clampResearchPanelLayout(
    {
      leftWidth: 900,
      rightWidth: 900,
      leftCollapsed: false,
      rightCollapsed: false,
    },
    1280
  );

  assert.equal(layout.leftWidth, 360);
  assert.equal(layout.rightWidth, 400);
  assert.equal(layout.leftCollapsed, false);
  assert.equal(layout.rightCollapsed, false);
});

test("collapsed panes keep their previous expanded widths", () => {
  const collapsed = toggleResearchPane(
    {
      leftWidth: 300,
      rightWidth: 520,
      leftCollapsed: false,
      rightCollapsed: false,
    },
    "right"
  );

  assert.equal(collapsed.rightCollapsed, true);
  assert.deepEqual(getExpandedPaneWidths(collapsed), {
    leftWidth: 300,
    rightWidth: 520,
  });
});

test("serialized panel layout rejects malformed data", () => {
  assert.equal(deserializeResearchPanelLayout("{bad json"), null);
  assert.equal(
    deserializeResearchPanelLayout(JSON.stringify({ leftWidth: "wide" })),
    null
  );

  const serialized = serializeResearchPanelLayout({
    leftWidth: 320,
    rightWidth: 600,
    leftCollapsed: true,
    rightCollapsed: false,
  });

  assert.deepEqual(deserializeResearchPanelLayout(serialized), {
    leftWidth: 320,
    rightWidth: 600,
    leftCollapsed: true,
    rightCollapsed: false,
  });
});
