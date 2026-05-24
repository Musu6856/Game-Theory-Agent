"use client";

import { useState } from "react";
import { AlertTriangle, Trash2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { chatStream } from "@/lib/api";
import { propertyAnalysisPrompt } from "@/lib/prompts";
import { useStore } from "@/lib/store";
import type { PropertyAnalysis, ResearchProject } from "@/lib/types";

type Operation = PropertyAnalysis["operation"];

const OPERATION_LABELS: Record<Operation, string> = {
  differentiate: "求导",
  compare: "相减比较",
  threshold: "阈值条件",
  custom: "自定义",
};

function linesToList(value: string) {
  if (!value.trim()) return [];
  return value.split(/\r?\n/);
}

function listToLines(value: string[]) {
  return value.join("\n");
}

function createAnalysis(
  target: string,
  parameter: string,
  operation: Operation
): PropertyAnalysis {
  return {
    id: crypto.randomUUID(),
    target,
    parameter,
    operation,
    symbolicResult: "",
    signCondition: "",
    propositionDraft: "",
    proofSketch: "",
    intuition: "",
    warnings: [],
  };
}

export function AnalysisStep({ project }: { project: ResearchProject }) {
  const { dispatch } = useStore();
  const [target, setTarget] = useState("");
  const [parameter, setParameter] = useState("");
  const [operation, setOperation] = useState<Operation>("differentiate");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState("");
  const model = project.hotellingModel;
  const equilibrium = project.equilibriumResult;
  const analyses = project.propertyAnalyses ?? [];
  const hasEquilibriumContext = Boolean(
    equilibrium?.derivation.trim() ||
      equilibrium?.closedForm.trim() ||
      equilibrium?.focs.some((foc) => foc.trim())
  );

  function setAnalyses(nextAnalyses: PropertyAnalysis[]) {
    dispatch({
      type: "SET_PROPERTY_ANALYSES",
      payload: nextAnalyses,
    });
  }

  function updateAnalysis(
    id: string,
    updater: (analysis: PropertyAnalysis) => PropertyAnalysis
  ) {
    if (isGenerating) return;

    setAnalyses(
      analyses.map((analysis) =>
        analysis.id === id ? updater(analysis) : analysis
      )
    );
  }

  function deleteAnalysis(id: string) {
    if (isGenerating) return;

    setAnalyses(analyses.filter((analysis) => analysis.id !== id));
  }

  async function generateAnalysis() {
    if (!model || !hasEquilibriumContext || isGenerating) return;

    const request = {
      target: target.trim(),
      parameter: parameter.trim(),
      operation,
    };

    const hasTargetLikeRequest = Boolean(request.target || request.parameter);

    if (
      (operation === "custom" && !hasTargetLikeRequest) ||
      (operation !== "custom" && (!request.target || !request.parameter))
    ) {
      setError(
        operation === "custom"
          ? "请在分析对象或参数栏写明自定义符号分析请求。"
          : "请同时填写分析对象和参数，再做符号性质分析。"
      );
      return;
    }

    setIsGenerating(true);
    setError("");

    const nextAnalysis = createAnalysis(
      request.target || "自定义分析对象",
      request.parameter || "自定义请求",
      operation
    );
    const baseAnalyses = [...analyses, nextAnalysis];
    setAnalyses(baseAnalyses);

    try {
      const prompt = propertyAnalysisPrompt(
        JSON.stringify(
          {
            model,
            equilibrium,
            request,
          },
          null,
          2
        )
      );

      const finalText = await chatStream(
        [{ role: "user", content: prompt }],
        (content) => {
          setAnalyses(
            baseAnalyses.map((analysis) =>
              analysis.id === nextAnalysis.id
                ? { ...analysis, proofSketch: content }
                : analysis
            )
          );
        }
      );

      setAnalyses(
        baseAnalyses.map((analysis) =>
          analysis.id === nextAnalysis.id
            ? { ...analysis, proofSketch: finalText }
            : analysis
        )
      );
      setTarget("");
      setParameter("");
    } catch (generationError) {
      const message =
        generationError instanceof Error
          ? generationError.message
          : "模型请求失败";

      setError(message);
      setAnalyses(
        baseAnalyses.map((analysis) =>
          analysis.id === nextAnalysis.id
            ? {
                ...analysis,
                warnings: [
                  ...analysis.warnings,
                  `模型请求失败：${message}。本步骤没有生成数值比较静态，请简化表达式或补充符号假设。`,
                ],
              }
            : analysis
        )
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col gap-4">
      <header className="border-b pb-3">
        <p className="text-xs font-medium text-muted-foreground">性质分析</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <h3 className="break-words text-base font-semibold">
            符号性质分析
          </h3>
          <Button
            size="sm"
            onClick={generateAnalysis}
            disabled={!model || !hasEquilibriumContext || isGenerating}
          >
            <Wand2 aria-hidden="true" />
            {isGenerating ? "生成中" : "生成符号性质分析"}
          </Button>
        </div>
      </header>

      <div className="flex min-w-0 gap-2 border-l-2 border-amber-500/70 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 break-words">
          这里只做符号分析：求导、相减比较、阈值条件、符号条件、命题草稿和证明思路。V1 不包含数值仿真，也不使用数值比较静态替代性质分析。
        </p>
      </div>

      {!model ? (
        <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
          请先建立 Hotelling 模型，并完成符号均衡求解，再请求性质分析。
        </p>
      ) : !hasEquilibriumContext ? (
        <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
          请先补充符号均衡推导或闭式结果。性质分析需要可求导、可相减或可构造阈值的符号表达式。
        </p>
      ) : null}

      {error ? (
        <p className="border-l border-destructive pl-3 text-sm leading-6 text-destructive">
          生成失败：{error}
        </p>
      ) : null}

      <section className="grid min-w-0 gap-3 border-b pb-4 md:grid-cols-4">
        <div className="grid min-w-0 gap-1.5 md:col-span-2">
          <Label htmlFor="analysis-target" className="text-xs">
            分析对象
          </Label>
          <Input
            id="analysis-target"
            value={target}
            onChange={(event) => setTarget(event.currentTarget.value)}
            disabled={isGenerating}
            placeholder="如 p_A^*、profit_A^* - profit_B^*"
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="analysis-parameter" className="text-xs">
            参数
          </Label>
          <Input
            id="analysis-parameter"
            value={parameter}
            onChange={(event) => setParameter(event.currentTarget.value)}
            disabled={isGenerating}
            placeholder="如 t、alpha、beta"
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="analysis-operation" className="text-xs">
            操作
          </Label>
          <select
            id="analysis-operation"
            value={operation}
            onChange={(event) =>
              setOperation(event.currentTarget.value as Operation)
            }
            disabled={isGenerating}
            className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {Object.entries(OPERATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="min-w-0 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          已有性质分析：{analyses.length} 项
        </p>

        {analyses.length === 0 ? (
          <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
            尚无分析。选择分析对象、参数和操作后，可以生成适合整理成命题的符号结果。
          </p>
        ) : (
          <div className="min-w-0 divide-y rounded-lg border">
            {analyses.map((analysis, index) => (
              <article key={analysis.id} className="min-w-0 space-y-3 p-3">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="break-words text-sm font-medium leading-5">
                      {OPERATION_LABELS[analysis.operation]}:{" "}
                      {analysis.target || "未命名分析对象"}
                    </h4>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                      参数：{analysis.parameter || "未指定"} · #
                      {index + 1}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => deleteAnalysis(analysis.id)}
                    disabled={isGenerating}
                    aria-label={`删除分析 ${index + 1}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>

                <div className="grid min-w-0 gap-2 md:grid-cols-3">
                  <AnalysisInput
                    id={`${analysis.id}-target`}
                    label="分析对象"
                    value={analysis.target}
                    disabled={isGenerating}
                    onChange={(value) =>
                      updateAnalysis(analysis.id, (current) => ({
                        ...current,
                        target: value,
                      }))
                    }
                  />
                  <AnalysisInput
                    id={`${analysis.id}-parameter`}
                    label="参数"
                    value={analysis.parameter}
                    disabled={isGenerating}
                    onChange={(value) =>
                      updateAnalysis(analysis.id, (current) => ({
                        ...current,
                        parameter: value,
                      }))
                    }
                  />
                  <div className="grid min-w-0 gap-1.5">
                    <Label
                      htmlFor={`${analysis.id}-operation`}
                      className="text-xs"
                    >
                      操作
                    </Label>
                    <select
                      id={`${analysis.id}-operation`}
                      value={analysis.operation}
                      onChange={(event) =>
                        updateAnalysis(analysis.id, (current) => ({
                          ...current,
                          operation: event.currentTarget.value as Operation,
                        }))
                      }
                      disabled={isGenerating}
                      className="h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {Object.entries(OPERATION_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>

                <div className="grid min-w-0 gap-2 md:grid-cols-2">
                  <AnalysisTextarea
                    id={`${analysis.id}-symbolic-result`}
                    label="符号结果"
                    value={analysis.symbolicResult}
                    disabled={isGenerating}
                    onChange={(value) =>
                      updateAnalysis(analysis.id, (current) => ({
                        ...current,
                        symbolicResult: value,
                      }))
                    }
                  />
                  <AnalysisTextarea
                    id={`${analysis.id}-sign-condition`}
                    label="符号或阈值条件"
                    value={analysis.signCondition}
                    disabled={isGenerating}
                    onChange={(value) =>
                      updateAnalysis(analysis.id, (current) => ({
                        ...current,
                        signCondition: value,
                      }))
                    }
                  />
                  <AnalysisTextarea
                    id={`${analysis.id}-proposition`}
                    label="命题草稿"
                    value={analysis.propositionDraft}
                    disabled={isGenerating}
                    onChange={(value) =>
                      updateAnalysis(analysis.id, (current) => ({
                        ...current,
                        propositionDraft: value,
                      }))
                    }
                  />
                  <AnalysisTextarea
                    id={`${analysis.id}-intuition`}
                    label="经济直觉"
                    value={analysis.intuition}
                    disabled={isGenerating}
                    onChange={(value) =>
                      updateAnalysis(analysis.id, (current) => ({
                        ...current,
                        intuition: value,
                      }))
                    }
                  />
                </div>

                <AnalysisTextarea
                  id={`${analysis.id}-proof`}
                  label="证明思路"
                  value={analysis.proofSketch}
                  disabled={isGenerating}
                  onChange={(value) =>
                    updateAnalysis(analysis.id, (current) => ({
                      ...current,
                      proofSketch: value,
                    }))
                  }
                  rows={6}
                />

                <AnalysisTextarea
                  id={`${analysis.id}-warnings`}
                  label="警告与修正建议，每行一个"
                  value={listToLines(analysis.warnings)}
                  disabled={isGenerating}
                  onChange={(value) =>
                    updateAnalysis(analysis.id, (current) => ({
                      ...current,
                      warnings: linesToList(value),
                    }))
                  }
                  rows={3}
                />
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function AnalysisInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
        className="text-sm"
      />
    </div>
  );
}

function AnalysisTextarea({
  id,
  label,
  value,
  onChange,
  rows = 4,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={disabled}
        rows={rows}
        className="min-h-24 resize-y text-sm leading-5"
      />
    </div>
  );
}
