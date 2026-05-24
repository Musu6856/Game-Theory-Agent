"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, X } from "lucide-react";
import type { GameTheoryModel, PlatformContext } from "@/lib/types";

interface Props {
  model: GameTheoryModel | null;
  onUpdate: (partial: Partial<GameTheoryModel>) => void;
  onAiRefine: (input: string) => void;
  aiResponse: string;
  isLoading: boolean;
}

const PRICING_MODELS = [
  { value: "subscription", label: "订阅制" },
  { value: "transaction", label: "交易抽成" },
  { value: "freemium", label: "免费+增值" },
  { value: "ad-supported", label: "广告支持" },
];

export function StepPlatform({ model, onUpdate, onAiRefine, aiResponse, isLoading }: Props) {
  const [sideName, setSideName] = useState("");
  const platform = model?.platformContext;

  function updatePlatform(partial: Partial<PlatformContext>) {
    onUpdate({
      platformContext: { ...platform || { hasCrossNetworkEffects: false, sides: [] }, ...partial },
    });
  }

  function addSide() {
    if (!sideName.trim()) return;
    updatePlatform({ sides: [...(platform?.sides || []), sideName.trim()] });
    setSideName("");
  }

  function removeSide(idx: number) {
    const sides = platform?.sides || [];
    updatePlatform({ sides: sides.filter((_, i) => i !== idx) });
  }

  // If no platform context yet, suggest adding it
  if (!platform) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          你的研究是否涉及双边市场或多边平台？
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() =>
              onUpdate({
                platformContext: {
                  hasCrossNetworkEffects: false,
                  sides: [],
                },
              })
            }
          >
            不涉及，跳过
          </Button>
          <Button
            onClick={() =>
              onUpdate({
                platformContext: {
                  hasCrossNetworkEffects: true,
                  sides: [],
                },
              })
            }
          >
            是的，涉及平台
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="network-effects"
          checked={platform.hasCrossNetworkEffects}
          onChange={(e) => updatePlatform({ hasCrossNetworkEffects: e.target.checked })}
          className="h-4 w-4"
        />
        <label htmlFor="network-effects" className="text-sm">
          存在跨边网络效应
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">平台参与边</p>
        {platform.sides.map((s, i) => (
          <div key={i} className="flex items-center justify-between bg-muted p-2 rounded">
            <span className="text-sm">{s}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeSide(i)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="如：买家、卖家、广告商..."
            value={sideName}
            onChange={(e) => setSideName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addSide()}
          />
          <Button variant="outline" size="sm" onClick={addSide} disabled={!sideName.trim()}>
            <Plus className="h-3 w-3 mr-1" /> 添加
          </Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">定价模式</p>
        <div className="flex flex-wrap gap-2">
          {PRICING_MODELS.map((pm) => (
            <Badge
              key={pm.value}
              variant={platform.pricingModel === pm.value ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => updatePlatform({ pricingModel: pm.value as PlatformContext["pricingModel"] })}
            >
              {pm.label}
            </Badge>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">让 AI 分析平台结构：</p>
        <div className="flex gap-2">
          <Input
            placeholder="描述你的平台设计思路..."
            className="text-sm"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLInputElement).value) {
                onAiRefine((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
          <Button variant="secondary" size="sm" disabled={isLoading}
            onClick={() => {
              const el = document.querySelector<HTMLInputElement>('[placeholder="描述你的平台设计思路..."]');
              if (el?.value) {
                onAiRefine(el.value);
                el.value = "";
              }
            }}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "AI 分析"}
          </Button>
        </div>
        {aiResponse && (
          <div className="bg-muted p-3 rounded-lg text-sm animate-fade-in">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-[10px] font-medium text-primary uppercase tracking-wider">AI 分析结果</span>
            </div>
            <div className="text-muted-foreground whitespace-pre-wrap">{aiResponse}</div>
          </div>
        )}
      </div>
    </div>
  );
}
