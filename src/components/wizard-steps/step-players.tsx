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

export function StepPlayers({ model, onUpdate, onAiRefine, aiResponse, isLoading }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [objective, setObjective] = useState("");

  const players = model?.players || [];

  function addPlayer() {
    if (!name.trim()) return;
    onUpdate({
      players: [...players, { name: name.trim(), description: description.trim(), objective: objective.trim() }],
    });
    setName("");
    setDescription("");
    setObjective("");
  }

  function removePlayer(idx: number) {
    onUpdate({ players: players.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        定义博弈中的参与者（至少 2 个）。每个参与者应该有明确的角色和目标函数。
      </p>

      {/* Existing players */}
      {players.length > 0 && (
        <div className="space-y-2">
          {players.map((p, i) => (
            <div key={i} className="flex items-start justify-between bg-muted p-3 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Badge>Player {i + 1}</Badge>
                  <span className="font-medium text-sm">{p.name}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{p.description}</p>
                {p.objective && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    目标: {p.objective}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removePlayer(i)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add player form */}
      <div className="space-y-2 border rounded-lg p-3">
        <Input
          placeholder="参与者名称（如：平台、卖家、买家）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          placeholder="角色描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Input
          placeholder="目标函数（如：最大化利润、最大化效用）"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
        />
        <Button variant="outline" size="sm" onClick={addPlayer} disabled={!name.trim()}>
          <Plus className="h-3 w-3 mr-1" /> 添加参与者
        </Button>
      </div>

      {/* Validation hint */}
      {players.length > 0 && players.length < 2 && (
        <p className="text-xs text-destructive">需要至少 2 个参与者（当前 {players.length} 个）</p>
      )}

      <Separator />

      {/* AI refine */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          让 AI 帮你分析参与者定义是否完整：
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="描述你的参与者设定想法..."
            className="text-sm"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLInputElement).value) {
                onAiRefine((e.target as HTMLInputElement).value);
                (e.target as HTMLInputElement).value = "";
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const el = document.querySelector<HTMLInputElement>('[placeholder="描述你的参与者设定想法..."]');
              if (el?.value) {
                onAiRefine(el.value);
                el.value = "";
              }
            }}
            disabled={isLoading}
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
