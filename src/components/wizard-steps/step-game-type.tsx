"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Loader2, X } from "lucide-react";
import type { GameTheoryModel } from "@/lib/types";

const GAME_TYPES = [
  { value: "simultaneous", label: "同时博弈", desc: "参与者同时选择策略" },
  { value: "sequential", label: "序贯博弈", desc: "参与者按顺序行动，后动者观察到先动者的选择" },
  { value: "repeated", label: "重复博弈", desc: "同一博弈重复多次，考虑长期合作与惩罚" },
  { value: "bargaining", label: "讨价还价", desc: "参与者通过谈判分配剩余价值" },
  { value: "signaling", label: "信号博弈", desc: "信息不对称下，一方通过行动传递信号" },
];

interface Props {
  model: GameTheoryModel | null;
  onUpdate: (partial: Partial<GameTheoryModel>) => void;
  onAiRefine: (input: string) => void;
  aiResponse: string;
  isLoading: boolean;
}

export function StepGameType({ model, onUpdate, onAiRefine, aiResponse, isLoading }: Props) {
  const [assumption, setAssumption] = useState("");
  const assumptions = model?.keyAssumptions || [];

  function addAssumption() {
    if (!assumption.trim()) return;
    onUpdate({ keyAssumptions: [...assumptions, assumption.trim()] });
    setAssumption("");
  }

  function removeAssumption(idx: number) {
    onUpdate({ keyAssumptions: assumptions.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        选择博弈类型并定义关键假设。
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {GAME_TYPES.map((gt) => (
          <button
            key={gt.value}
            className={`text-left p-3 rounded-lg border transition-colors ${
              model?.gameType === gt.value
                ? "border-primary bg-primary/5"
                : "hover:bg-accent"
            }`}
            onClick={() => onUpdate({ gameType: gt.value as GameTheoryModel["gameType"] })}
          >
            <div className="text-sm font-medium">{gt.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{gt.desc}</div>
          </button>
        ))}
      </div>

      <Separator />

      {/* Key assumptions */}
      <div className="space-y-2">
        <p className="text-sm font-medium">关键假设</p>
        {assumptions.map((a, i) => (
          <div key={i} className="flex items-center justify-between bg-muted p-2 rounded">
            <span className="text-sm">{a}</span>
            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeAssumption(i)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="如：完全信息、参与者理性..."
            value={assumption}
            onChange={(e) => setAssumption(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addAssumption()}
          />
          <Button variant="outline" size="sm" onClick={addAssumption} disabled={!assumption.trim()}>
            添加
          </Button>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">让 AI 分析博弈类型选择：</p>
        <div className="flex gap-2">
          <Input
            placeholder="描述你的博弈时序..."
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
              const el = document.querySelector<HTMLInputElement>('[placeholder="描述你的博弈时序..."]');
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
