"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2, Plus, X } from "lucide-react";
import type { GameTheoryModel } from "@/lib/types";

interface Props {
  model: GameTheoryModel | null;
  onUpdate: (partial: Partial<GameTheoryModel>) => void;
  onAiRefine: (input: string) => void;
  aiResponse: string;
  isLoading: boolean;
}

export function StepStrategies({ model, onUpdate, onAiRefine, aiResponse, isLoading }: Props) {
  const [player, setPlayer] = useState("");
  const [customPlayerName, setCustomPlayerName] = useState("");
  const [option, setOption] = useState("");

  const strategies = model?.strategies || [];
  const players = model?.players || [];

  function addStrategy() {
    const effectivePlayer = player === "__custom__" ? customPlayerName.trim() : player.trim();
    if (!effectivePlayer || !option.trim()) return;
    const existing = strategies.find((s) => s.player === effectivePlayer);
    if (existing) {
      onUpdate({
        strategies: strategies.map((s) =>
          s.player === effectivePlayer
            ? { ...s, options: [...s.options, option.trim()] }
            : s
        ),
      });
    } else {
      onUpdate({
        strategies: [...strategies, { player: effectivePlayer, options: [option.trim()] }],
      });
    }
    setOption("");
  }

  function removeOption(playerName: string, optIdx: number) {
    const updated = strategies
      .map((s) => {
        if (s.player === playerName) {
          const newOptions = s.options.filter((_, i) => i !== optIdx);
          return { ...s, options: newOptions };
        }
        return s;
      })
      .filter((s) => s.options.length > 0);
    onUpdate({ strategies: updated });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        为每个参与者定义可选策略集。
      </p>

      {/* Current strategies */}
      {strategies.map((s, i) => (
        <div key={i} className="bg-muted p-3 rounded-lg">
          <p className="text-sm font-medium mb-2">{s.player} 的策略集:</p>
          <div className="flex flex-wrap gap-1.5">
            {s.options.map((opt, j) => (
              <Badge key={j} variant="secondary" className="gap-1 max-w-full">
                <span className="truncate">{opt}</span>
                <button onClick={() => removeOption(s.player, j)} className="hover:text-destructive shrink-0">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      ))}

      {/* Add strategy form */}
      <div className="space-y-2 border rounded-lg p-3">
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
        >
          <option value="">选择参与者</option>
          {players.map((p, i) => (
            <option key={i} value={p.name}>{p.name}</option>
          ))}
          <option value="__custom__">自定义...</option>
        </select>
        {player === "__custom__" && (
          <Input
            placeholder="输入参与者名称"
            value={customPlayerName}
            onChange={(e) => setCustomPlayerName(e.target.value)}
          />
        )}
        <Input
          placeholder="策略选项（如：高定价、低定价）"
          value={option}
          onChange={(e) => setOption(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addStrategy()}
        />
        <Button variant="outline" size="sm" onClick={addStrategy} disabled={!player || !option}>
          <Plus className="h-3 w-3 mr-1" /> 添加策略
        </Button>
      </div>

      {/* Validation hint */}
      {strategies.length === 0 && (
        <p className="text-xs text-muted-foreground">需至少添加一个策略选项才能继续</p>
      )}

      <Separator />

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">让 AI 分析策略设计：</p>
        <div className="flex gap-2">
          <Input
            placeholder="描述你的策略设定..."
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
              const el = document.querySelector<HTMLInputElement>('[placeholder="描述你的策略设定..."]');
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
