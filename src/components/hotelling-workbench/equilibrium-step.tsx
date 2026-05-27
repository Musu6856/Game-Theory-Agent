"use client";

import { useState } from "react";
import { AlertTriangle, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { chatStream } from "@/lib/api";
import { createIdleEquilibrium } from "@/lib/hotelling-defaults";
import { equilibriumSolvePrompt } from "@/lib/prompts";
import { useStore } from "@/lib/store";
import type { EquilibriumResult, ResearchProject } from "@/lib/types";
import { CodeBlock } from "./code-block";

const STATUS_OPTIONS: Array<{
  value: EquilibriumResult["status"];
  label: string;
}> = [
  { value: "idle", label: "待求解" },
  { value: "solved", label: "已求解" },
  { value: "needs_revision", label: "需修正" },
  { value: "derivation_draft", label: "推导草稿" },
  { value: "implicit_system", label: "隐式系统" },
  { value: "reaction_functions", label: "反应函数" },
  { value: "failed_with_reason", label: "求解失败" },
  { value: "needs_model_clarification", label: "需补模型" },
  { value: "symbolic_failure", label: "符号失败" },
];

function linesToList(value: string) {
  if (!value.trim()) return [];
  return value.split(/\r?\n/);
}

function listToLines(value: string[]) {
  return value.join("\n");
}

export function EquilibriumStep({ project }: { project: ResearchProject }) {
  const { dispatch } = useStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const model = project.hotellingModel;
  const equilibrium = project.equilibriumResult ?? createIdleEquilibrium();

  function setEquilibrium(nextEquilibrium: EquilibriumResult) {
    dispatch({
      type: "SET_EQUILIBRIUM_RESULT",
      payload: nextEquilibrium,
    });
  }

  function updateEquilibrium(nextFields: Partial<EquilibriumResult>) {
    setEquilibrium({
      ...equilibrium,
      ...nextFields,
    });
  }

  async function generateDerivation() {
    if (!model || isGenerating) return;

    setIsGenerating(true);
    setError("");

    const baseResult: EquilibriumResult = {
      ...createIdleEquilibrium(),
      ...equilibrium,
      status: "idle",
      derivation: "",
      warnings: equilibrium.warnings,
    };

    setEquilibrium(baseResult);

    try {
      const prompt = equilibriumSolvePrompt(JSON.stringify(model, null, 2));
      const finalText = await chatStream(
        [{ role: "user", content: prompt }],
        (content) => {
          setEquilibrium({
            ...baseResult,
            status: "needs_revision",
            derivation: content,
          });
        }
      );

      setEquilibrium({
        ...baseResult,
        status: "needs_revision",
        derivation: finalText,
      });
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : "模型请求失败";

      setError(message);
      setEquilibrium({
        ...baseResult,
        status: "needs_revision",
        warnings: [
          ...baseResult.warnings,
          `模型请求失败：${message}。本步骤没有生成数值代入结果，请简化模型或重试。`,
        ],
      });
    } finally {
      setIsGenerating(false);
    }
  }

  if (!model) {
    return (
      <section className="flex min-h-[520px] min-w-0 flex-col gap-4">
        <header className="border-b pb-3">
          <p className="text-xs font-medium text-muted-foreground">
            均衡求解
          </p>
          <h3 className="mt-1 break-words text-base font-semibold">
            符号均衡求解
          </h3>
        </header>
        <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
          请先建立 Hotelling 模型。均衡求解需要结构化符号、需求构造、时序和利润函数。
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col gap-4">
      <header className="border-b pb-3">
        <p className="text-xs font-medium text-muted-foreground">
          均衡求解
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h3 className="break-words text-base font-semibold">
            符号均衡推导
          </h3>
          <Button
            size="sm"
            onClick={generateDerivation}
            disabled={isGenerating}
          >
            <Wand2 aria-hidden="true" />
            {isGenerating ? "生成中" : "生成符号均衡推导"}
          </Button>
        </div>
      </header>

      <div className="flex min-w-0 gap-2 border-l-2 border-amber-500/70 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 break-words">
          这里只接受符号解析结果。数值代入、仿真或校准例子不能作为均衡解；如果闭式解发生符号爆炸，请记录失败原因，并从假设、时序或参数范围上简化模型。
        </p>
      </div>

      {error ? (
        <p className="border-l border-destructive pl-3 text-sm leading-6 text-destructive">
          生成失败：{error}
        </p>
      ) : null}

      <section className="grid min-w-0 gap-3 md:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="equilibrium-concept" className="text-xs">
            均衡概念
          </Label>
          <Input
            id="equilibrium-concept"
            value={equilibrium.concept}
            onChange={(event) =>
              updateEquilibrium({ concept: event.currentTarget.value })
            }
            disabled={isGenerating}
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="equilibrium-status" className="text-xs">
            状态
          </Label>
          <select
            id="equilibrium-status"
            value={equilibrium.status}
            onChange={(event) =>
              updateEquilibrium({
                status: event.currentTarget
                  .value as EquilibriumResult["status"],
              })
            }
            disabled={isGenerating}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 md:grid-cols-2">
        <EditableList
          id="equilibrium-solving-steps"
          label="求解步骤，每行一个"
          value={equilibrium.solvingSteps}
          onChange={(solvingSteps) => updateEquilibrium({ solvingSteps })}
          disabled={isGenerating}
        />
        <EditableList
          id="equilibrium-focs"
          label="一阶条件，每行一个"
          value={equilibrium.focs}
          onChange={(focs) => updateEquilibrium({ focs })}
          disabled={isGenerating}
        />
      </section>

      <section className="grid min-w-0 gap-3 md:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="equilibrium-closed-form" className="text-xs">
            闭式均衡解
          </Label>
          <Textarea
            id="equilibrium-closed-form"
            value={equilibrium.closedForm}
            onChange={(event) =>
              updateEquilibrium({ closedForm: event.currentTarget.value })
            }
            disabled={isGenerating}
            rows={5}
            placeholder="仅填写符号闭式表达式。"
            className="min-h-28 resize-y font-mono text-sm leading-6"
          />
        </div>
        <EditableList
          id="equilibrium-conditions"
          label="成立条件，每行一个"
          value={equilibrium.conditions}
          onChange={(conditions) => updateEquilibrium({ conditions })}
          disabled={isGenerating}
          rows={5}
        />
      </section>

      <div className="grid min-w-0 gap-1.5">
        <Label htmlFor="equilibrium-derivation" className="text-xs">
          推导过程
        </Label>
        <Textarea
          id="equilibrium-derivation"
          value={equilibrium.derivation}
          onChange={(event) =>
            updateEquilibrium({ derivation: event.currentTarget.value })
          }
          disabled={isGenerating}
          rows={9}
          placeholder="生成的符号推导过程会显示在这里。"
          className="min-h-52 resize-y text-sm leading-6"
        />
      </div>

      <section className="grid min-w-0 gap-3 border-t pt-4 md:grid-cols-2">
        <EditableList
          id="equilibrium-warnings"
          label="警告与修正建议，每行一个"
          value={equilibrium.warnings}
          onChange={(warnings) => updateEquilibrium({ warnings })}
          disabled={isGenerating}
          rows={5}
        />
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="equilibrium-code" className="text-xs">
            SymPy 求解代码
          </Label>
          <Textarea
            id="equilibrium-code"
            value={equilibrium.code}
            onChange={(event) =>
              updateEquilibrium({ code: event.currentTarget.value })
            }
            disabled={isGenerating}
            rows={5}
            className="min-h-28 resize-y font-mono text-sm leading-5"
          />
        </div>
      </section>

      <CodeBlock code={equilibrium.code} />
    </section>
  );
}

function EditableList({
  id,
  label,
  value,
  onChange,
  rows = 4,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={id}
        value={listToLines(value)}
        onChange={(event) => onChange(linesToList(event.currentTarget.value))}
        disabled={disabled}
        rows={rows}
        className="min-h-24 resize-y text-sm leading-5"
      />
    </div>
  );
}
