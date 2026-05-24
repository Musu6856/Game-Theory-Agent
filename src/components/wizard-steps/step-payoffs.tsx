"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import type { GameTheoryModel, PayoffStructure } from "@/lib/types";

interface Props {
  model: GameTheoryModel | null;
  onUpdate: (partial: Partial<GameTheoryModel>) => void;
  onAiRefine: (input: string) => void;
  aiResponse: string;
  isLoading: boolean;
}

export function StepPayoffs({ model, onUpdate, onAiRefine, aiResponse, isLoading }: Props) {
  const payoffs = model?.payoffs || { description: "", type: "general" as const };

  function updatePayoffs(partial: Partial<PayoffStructure>) {
    onUpdate({ payoffs: { ...payoffs, ...partial } });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        定义参与者的收益结构。收益可以是效用函数、利润函数或其他形式。
      </p>

      <div className="space-y-3 border rounded-lg p-4">
        <div>
          <label className="text-sm font-medium mb-1 block">收益形式</label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
            value={payoffs.type}
            onChange={(e) => updatePayoffs({ type: e.target.value as PayoffStructure["type"] })}
          >
            <option value="general">一般描述</option>
            <option value="function">效用/利润函数</option>
            <option value="matrix">收益矩阵</option>
          </select>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">收益描述</label>
          <Textarea
            placeholder="描述收益结构。例如：平台的利润 = 交易佣金收入 - 补贴支出。卖家的效用 = 交易额 - 平台费用。买家的效用 = 匹配质量 - 价格..."
            className="min-h-[100px]"
            value={payoffs.description}
            onChange={(e) => updatePayoffs({ description: e.target.value })}
          />
        </div>
      </div>

      {/* Validation hint */}
      {!payoffs.description.trim() && (
        <p className="text-xs text-muted-foreground">请填写收益结构描述</p>
      )}

      <Separator />

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">让 AI 帮你优化收益函数：</p>
        <div className="flex gap-2">
          <Textarea
            placeholder="描述你的收益结构想法..."
            className="min-h-[60px] text-sm"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (e.target as HTMLTextAreaElement).value) {
                onAiRefine((e.target as HTMLTextAreaElement).value);
                (e.target as HTMLTextAreaElement).value = "";
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            className="self-end"
            onClick={() => {
              const el = document.querySelector<HTMLTextAreaElement>('[placeholder="描述你的收益结构想法..."]');
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
