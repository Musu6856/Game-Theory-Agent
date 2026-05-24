export type ResearchPanelLayout = {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
};

export const RESEARCH_PANEL_LAYOUT_STORAGE_KEY =
  "paperforge:research-panel-layout:v2";

export const DEFAULT_RESEARCH_PANEL_LAYOUT: ResearchPanelLayout = {
  leftWidth: 280,
  rightWidth: 520,
  leftCollapsed: false,
  rightCollapsed: false,
};

const MIN_LEFT_WIDTH = 240;
const MAX_LEFT_WIDTH = 360;
const MIN_RIGHT_WIDTH = 360;
const MAX_RIGHT_WIDTH = 760;
const MIN_CENTER_WIDTH = 520;
const COLLAPSED_PANE_WIDTH = 56;

export function clampResearchPanelLayout(
  layout: ResearchPanelLayout,
  viewportWidth: number
): ResearchPanelLayout {
  const leftWidth = clamp(layout.leftWidth, MIN_LEFT_WIDTH, MAX_LEFT_WIDTH);
  const leftPaneWidth = layout.leftCollapsed ? COLLAPSED_PANE_WIDTH : leftWidth;
  const maxRightWidth = Math.max(
    MIN_RIGHT_WIDTH,
    viewportWidth - leftPaneWidth - MIN_CENTER_WIDTH
  );
  const rightWidth = clamp(
    Math.min(layout.rightWidth, maxRightWidth),
    MIN_RIGHT_WIDTH,
    MAX_RIGHT_WIDTH
  );

  return {
    leftWidth,
    rightWidth,
    leftCollapsed: layout.leftCollapsed,
    rightCollapsed: layout.rightCollapsed,
  };
}

export function toggleResearchPane(
  layout: ResearchPanelLayout,
  pane: "left" | "right"
): ResearchPanelLayout {
  return pane === "left"
    ? { ...layout, leftCollapsed: !layout.leftCollapsed }
    : { ...layout, rightCollapsed: !layout.rightCollapsed };
}

export function getExpandedPaneWidths(layout: ResearchPanelLayout) {
  return {
    leftWidth: layout.leftWidth,
    rightWidth: layout.rightWidth,
  };
}

export function serializeResearchPanelLayout(layout: ResearchPanelLayout): string {
  return JSON.stringify(layout);
}

export function deserializeResearchPanelLayout(
  value: string | null
): ResearchPanelLayout | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<ResearchPanelLayout>;
    if (
      typeof parsed.leftWidth !== "number" ||
      typeof parsed.rightWidth !== "number" ||
      typeof parsed.leftCollapsed !== "boolean" ||
      typeof parsed.rightCollapsed !== "boolean"
    ) {
      return null;
    }

    return {
      leftWidth: parsed.leftWidth,
      rightWidth: parsed.rightWidth,
      leftCollapsed: parsed.leftCollapsed,
      rightCollapsed: parsed.rightCollapsed,
    };
  } catch {
    return null;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
