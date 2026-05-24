"use client";

import type { ResearchAssetsTab } from "@/lib/research-flow";

type ResearchAssetsTabsProps = {
  activeTab: ResearchAssetsTab;
  onActiveTabChange: (tab: ResearchAssetsTab) => void;
};

const tabs: Array<{ id: ResearchAssetsTab; label: string }> = [
  { id: "directions", label: "方向" },
  { id: "evidence", label: "来源" },
  { id: "model", label: "模型" },
  { id: "equilibrium", label: "均衡" },
  { id: "properties", label: "性质" },
  { id: "paper", label: "论文输出" },
  { id: "history", label: "历史" },
  { id: "quality", label: "质检" },
];

export function ResearchAssetsTabs({
  activeTab,
  onActiveTabChange,
}: ResearchAssetsTabsProps) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b px-3 py-2" role="tablist" aria-label="研究资产">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className="shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors aria-selected:bg-primary aria-selected:text-primary-foreground"
          onClick={() => onActiveTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
