"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import type { LiteratureAnalysis, ResearchProject } from "@/lib/types";

type DecompositionKey = keyof Pick<
  LiteratureAnalysis,
  | "researchQuestion"
  | "modelStructure"
  | "timing"
  | "utilityDesign"
  | "equilibriumMethod"
>;

const DECOMPOSITION_FIELDS: Array<{
  key: DecompositionKey;
  label: string;
  placeholder: string;
}> = [
  {
    key: "researchQuestion",
    label: "研究问题",
    placeholder: "这篇文献解释什么现象或决策问题？",
  },
  {
    key: "modelStructure",
    label: "模型结构",
    placeholder: "参与者、市场结构、关键状态变量",
  },
  {
    key: "timing",
    label: "时序",
    placeholder: "阶段、先后手、观察信息",
  },
  {
    key: "utilityDesign",
    label: "效用设计",
    placeholder: "效用、成本、外部性或匹配项如何写入",
  },
  {
    key: "equilibriumMethod",
    label: "均衡方法",
    placeholder: "求解概念、FOC、阈值或比较静态方法",
  },
];

function linesToList(value: string) {
  if (!value) return [];
  return value.split(/\r?\n/);
}

function listToLines(value: string[]) {
  return value.join("\n");
}

export function LiteratureStep({ project }: { project: ResearchProject }) {
  const { dispatch } = useStore();
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const analyses = project.literatureAnalyses ?? [];

  function setAnalyses(nextAnalyses: LiteratureAnalysis[]) {
    dispatch({
      type: "SET_LITERATURE_ANALYSES",
      payload: nextAnalyses,
    });
  }

  function updateAnalysis(
    id: string,
    updater: (analysis: LiteratureAnalysis) => LiteratureAnalysis
  ) {
    setAnalyses(
      analyses.map((analysis) =>
        analysis.id === id ? updater(analysis) : analysis
      )
    );
  }

  function updateTextField(
    id: string,
    field: DecompositionKey,
    value: string
  ) {
    updateAnalysis(id, (analysis) => ({
      ...analysis,
      [field]: value,
    }));
  }

  function updateListField(
    id: string,
    field: "borrowableIdeas" | "differentiationPoints",
    value: string
  ) {
    updateAnalysis(id, (analysis) => ({
      ...analysis,
      [field]: linesToList(value),
    }));
  }

  function addAnalysis() {
    const cleanTitle = title.trim();
    const cleanSourceText = sourceText.trim();
    if (!cleanTitle && !cleanSourceText) return;

    const nextAnalysis: LiteratureAnalysis = {
      id: crypto.randomUUID(),
      title: cleanTitle || "未命名文献",
      sourceText: cleanSourceText,
      researchQuestion: "",
      modelStructure: "",
      timing: "",
      utilityDesign: "",
      equilibriumMethod: "",
      borrowableIdeas: [],
      differentiationPoints: [],
    };

    setAnalyses([...analyses, nextAnalysis]);
    setTitle("");
    setSourceText("");
  }

  function deleteAnalysis(id: string) {
    setAnalyses(analyses.filter((analysis) => analysis.id !== id));
  }

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col gap-4">
      <header className="border-b pb-3">
        <p className="text-xs font-medium text-muted-foreground">文献启发</p>
        <h3 className="mt-1 break-words text-base font-semibold">
          文献导入与拆解
        </h3>
      </header>

      <div className="grid min-w-0 gap-3 border-b pb-4">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="literature-title" className="text-xs">
            标题
          </Label>
          <Input
            id="literature-title"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            placeholder="论文标题、作者或短标签"
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="literature-source" className="text-xs">
            原文/摘要/笔记
          </Label>
          <Textarea
            id="literature-source"
            value={sourceText}
            onChange={(event) => setSourceText(event.currentTarget.value)}
            rows={5}
            placeholder="粘贴摘要、模型段落或自己的阅读笔记。"
            className="min-h-28 resize-y text-sm leading-6"
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={addAnalysis}>
            添加文献
          </Button>
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">
          已导入 {analyses.length} 篇
        </p>

        {analyses.length === 0 ? (
          <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
            暂无文献。先导入一段摘要或模型笔记，再逐步补全可借鉴思路与差异化切入点。
          </p>
        ) : (
          <div className="min-w-0 divide-y rounded-lg border">
            {analyses.map((analysis, index) => {
              const completedFields = DECOMPOSITION_FIELDS.filter((field) =>
                analysis[field.key].trim()
              ).length;
              const titleText = analysis.title || "未命名文献";

              return (
                <article key={analysis.id} className="min-w-0 space-y-3 p-3">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-medium leading-5">
                        {titleText}
                      </h4>
                      <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
                        {analysis.sourceText || "暂无原文片段"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => deleteAnalysis(analysis.id)}
                      aria-label={`删除文献：${titleText}`}
                    >
                      删除
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={completedFields ? "secondary" : "outline"}>
                      拆解 {completedFields}/{DECOMPOSITION_FIELDS.length}
                    </Badge>
                    <Badge
                      variant={
                        analysis.borrowableIdeas.some((idea) => idea.trim())
                          ? "secondary"
                          : "outline"
                      }
                    >
                      可借鉴{" "}
                      {analysis.borrowableIdeas.filter((idea) => idea.trim())
                        .length}
                    </Badge>
                    <Badge
                      variant={
                        analysis.differentiationPoints.some((point) =>
                          point.trim()
                        )
                          ? "secondary"
                          : "outline"
                      }
                    >
                      差异化{" "}
                      {
                        analysis.differentiationPoints.filter((point) =>
                          point.trim()
                        ).length
                      }
                    </Badge>
                  </div>

                  <div className="grid min-w-0 gap-2 md:grid-cols-2">
                    {DECOMPOSITION_FIELDS.map((field) => (
                      <div key={field.key} className="grid min-w-0 gap-1.5">
                        <Label
                          htmlFor={`${analysis.id}-${field.key}`}
                          className="text-xs"
                        >
                          {field.label}
                        </Label>
                        <Textarea
                          id={`${analysis.id}-${field.key}`}
                          value={analysis[field.key]}
                          onChange={(event) =>
                            updateTextField(
                              analysis.id,
                              field.key,
                              event.currentTarget.value
                            )
                          }
                          rows={2}
                          placeholder={field.placeholder}
                          className="min-h-16 resize-y text-sm leading-5"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="grid min-w-0 gap-2 border-t pt-3 md:grid-cols-2">
                    <div className="grid min-w-0 gap-1.5">
                      <Label
                        htmlFor={`${analysis.id}-borrowableIdeas`}
                        className="text-xs"
                      >
                        可借鉴思路
                      </Label>
                      <Textarea
                        id={`${analysis.id}-borrowableIdeas`}
                        value={listToLines(analysis.borrowableIdeas)}
                        onChange={(event) =>
                          updateListField(
                            analysis.id,
                            "borrowableIdeas",
                            event.currentTarget.value
                          )
                        }
                        rows={3}
                        placeholder="每行一个可借鉴点"
                        className="min-h-20 resize-y text-sm leading-5"
                      />
                    </div>
                    <div className="grid min-w-0 gap-1.5">
                      <Label
                        htmlFor={`${analysis.id}-differentiationPoints`}
                        className="text-xs"
                      >
                        差异化切入点
                      </Label>
                      <Textarea
                        id={`${analysis.id}-differentiationPoints`}
                        value={listToLines(analysis.differentiationPoints)}
                        onChange={(event) =>
                          updateListField(
                            analysis.id,
                            "differentiationPoints",
                            event.currentTarget.value
                          )
                        }
                        rows={3}
                        placeholder="每行一个差异化点"
                        className="min-h-20 resize-y text-sm leading-5"
                      />
                    </div>
                  </div>

                  <p className="text-right text-[11px] leading-4 text-muted-foreground">
                    #{index + 1}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
