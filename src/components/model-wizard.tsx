"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { chatStream } from "@/lib/api";
import { modelStepPrompt } from "@/lib/prompts";
import { toast } from "sonner";
import type { WizardStep, GameTheoryModel, ResearchProject } from "@/lib/types";
import { StepPlayers } from "./wizard-steps/step-players";
import { StepStrategies } from "./wizard-steps/step-strategies";
import { StepPayoffs } from "./wizard-steps/step-payoffs";
import { StepGameType } from "./wizard-steps/step-game-type";
import { StepPlatform } from "./wizard-steps/step-platform";
import {
  Users,
  Swords,
  Coins,
  Gamepad2,
  LayoutGrid,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const STEPS: { key: WizardStep; label: string; icon: React.ReactNode }[] = [
  { key: "players", label: "参与者", icon: <Users className="h-3.5 w-3.5" /> },
  { key: "strategies", label: "策略", icon: <Swords className="h-3.5 w-3.5" /> },
  { key: "payoffs", label: "收益", icon: <Coins className="h-3.5 w-3.5" /> },
  { key: "gameType", label: "博弈类型", icon: <Gamepad2 className="h-3.5 w-3.5" /> },
  { key: "platform", label: "平台属性", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { key: "review", label: "确认", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
];

const STEP_ORDER: WizardStep[] = [
  "players",
  "strategies",
  "payoffs",
  "gameType",
  "platform",
  "review",
];

function getModelContext(project: ResearchProject | null): string {
  if (!project) return "";
  let ctx = `原始 idea: ${project.rawIdea}\n\nAI 分析:\n${project.refinedIdea}\n\n`;
  if (project.model) {
    ctx += `已定义的模型:\n${JSON.stringify(project.model, null, 2)}`;
  }
  return ctx;
}


interface ModelWizardProps {
  onComplete: () => void;
}

export function ModelWizard({ onComplete }: ModelWizardProps) {
  const { state, dispatch } = useStore();
  const project = state.currentProject;
  const [aiResponse, setAiResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [slideDir, setSlideDir] = useState<"right" | "left">("right");

  if (!project) return null;

  const currentIdx = STEP_ORDER.indexOf(state.wizardStep);

  function canProceed(): boolean {
    if (!project || !project.model) return false;
    const m = project.model;
    switch (state.wizardStep) {
      case "players": return m.players.length >= 2;
      case "strategies": return m.strategies.length > 0;
      case "payoffs": return m.payoffs.description.length > 0;
      case "gameType": return m.gameType.length > 0;
      case "platform": return true;
      case "review": return true;
      default: return false;
    }
  }

  async function handleAiRefine(step: WizardStep, userInput: string) {
    setIsLoading(true);
    setAiResponse("");
    try {
      const context = getModelContext(project);
      await chatStream(
        [{ role: "user", content: modelStepPrompt(step, context, userInput) }],
        (text) => setAiResponse(text)
      );
      toast.success("AI 分析完成");
    } catch (e) {
      console.error("AI refine error", e);
      setAiResponse("AI 分析暂时不可用，请稍后重试。");
      toast.error("AI 分析失败", { description: "请稍后重试" });
    }
    setIsLoading(false);
  }

  function updateModel(partial: Partial<GameTheoryModel>) {
    if (!project) return;
    if (!project.model) {
      dispatch({
        type: "SET_MODEL",
        payload: {
          title: project.rawIdea.slice(0, 80),
          gameType: "simultaneous",
          players: [],
          strategies: [],
          payoffs: { description: "", type: "general" },
          keyAssumptions: [],
          ...partial,
        },
      });
    } else {
      dispatch({
        type: "SET_MODEL",
        payload: { ...project.model, ...partial },
      });
    }
  }

  function goNext() {
    if (currentIdx === STEP_ORDER.length - 1) {
      onComplete();
      return;
    }

    const nextIdx = currentIdx + 1;
    if (nextIdx < STEP_ORDER.length) {
      setSlideDir("right");
      setAiResponse("");
      dispatch({ type: "SET_WIZARD_STEP", payload: STEP_ORDER[nextIdx] });
    }
  }

  function goBack() {
    const prevIdx = currentIdx - 1;
    if (prevIdx >= 0) {
      setSlideDir("left");
      setAiResponse("");
      dispatch({ type: "SET_WIZARD_STEP", payload: STEP_ORDER[prevIdx] });
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Step indicator */}
      <div className="flex items-center gap-0 bg-card rounded-lg ring-1 ring-border p-1.5">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex-1 flex items-center justify-center">
            <div
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-all duration-300 ${
                i === currentIdx
                  ? "bg-primary text-primary-foreground shadow-sm font-medium"
                  : i < currentIdx
                  ? "text-primary"
                  : "text-muted-foreground/40"
              }`}
            >
              {i < currentIdx ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                s.icon
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-px flex-1 mx-1 ${i < currentIdx ? "bg-primary/40" : "bg-border"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <Card className="ring-1 ring-border">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
              {STEPS[currentIdx].icon}
            </div>
            <CardTitle className="text-sm font-medium">{STEPS[currentIdx].label}</CardTitle>
            <Badge variant="outline" className="ml-auto text-[10px]">
              {currentIdx + 1} / {STEP_ORDER.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div key={state.wizardStep} className={slideDir === "right" ? "animate-slide-in-right" : "animate-slide-in-left"}>
          {state.wizardStep === "players" && (
            <StepPlayers
              model={project.model}
              onUpdate={updateModel}
              onAiRefine={(input) => handleAiRefine("players", input)}
              aiResponse={aiResponse}
              isLoading={isLoading}
            />
          )}
          {state.wizardStep === "strategies" && (
            <StepStrategies
              model={project.model}
              onUpdate={updateModel}
              onAiRefine={(input) => handleAiRefine("strategies", input)}
              aiResponse={aiResponse}
              isLoading={isLoading}
            />
          )}
          {state.wizardStep === "payoffs" && (
            <StepPayoffs
              model={project.model}
              onUpdate={updateModel}
              onAiRefine={(input) => handleAiRefine("payoffs", input)}
              aiResponse={aiResponse}
              isLoading={isLoading}
            />
          )}
          {state.wizardStep === "gameType" && (
            <StepGameType
              model={project.model}
              onUpdate={updateModel}
              onAiRefine={(input) => handleAiRefine("gameType", input)}
              aiResponse={aiResponse}
              isLoading={isLoading}
            />
          )}
          {state.wizardStep === "platform" && (
            <StepPlatform
              model={project.model}
              onUpdate={updateModel}
              onAiRefine={(input) => handleAiRefine("platform", input)}
              aiResponse={aiResponse}
              isLoading={isLoading}
            />
          )}

          {/* Review step — two-column grid layout */}
          {state.wizardStep === "review" && (
            <div className="space-y-4">
              {!project.model ? (
                <p className="text-sm text-muted-foreground text-center py-4">暂无模型数据</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Players */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Users className="h-3 w-3" /> 参与者
                    </h4>
                    {project.model.players.length === 0 ? (
                      <p className="text-sm text-muted-foreground">未定义</p>
                    ) : (
                      <div className="space-y-1.5">
                        {project.model.players.map((p, i) => (
                          <div key={i} className="bg-muted/50 rounded-md px-3 py-2 text-sm">
                            <span className="font-medium">{p.name}</span>
                            {p.description && <span className="text-muted-foreground"> — {p.description}</span>}
                            {p.objective && <span className="text-muted-foreground block text-xs mt-0.5">目标: {p.objective}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Strategies */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Swords className="h-3 w-3" /> 策略
                    </h4>
                    {project.model.strategies.length === 0 ? (
                      <p className="text-sm text-muted-foreground">未定义</p>
                    ) : (
                      project.model.strategies.map((s, i) => (
                        <div key={i} className="text-sm mb-2">
                          <span className="font-medium">{s.player}:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.options.map((o, j) => (
                              <Badge key={j} variant="secondary" className="text-xs max-w-full">
                                <span className="truncate">{o}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Payoffs */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Coins className="h-3 w-3" /> 收益
                    </h4>
                    <div className="bg-muted/50 rounded-md px-3 py-2">
                      <p className="text-xs text-muted-foreground">类型: {project.model.payoffs.type === "matrix" ? "收益矩阵" : project.model.payoffs.type === "function" ? "效用函数" : "一般描述"}</p>
                      <p className="text-sm mt-1">{project.model.payoffs.description || "未定义"}</p>
                    </div>
                  </div>

                  {/* Game Type */}
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Gamepad2 className="h-3 w-3" /> 博弈类型
                    </h4>
                    <div className="flex items-center gap-2">
                      <Badge>{project.model.gameType === "simultaneous" ? "同时博弈" : project.model.gameType === "sequential" ? "序贯博弈" : project.model.gameType === "repeated" ? "重复博弈" : project.model.gameType === "bargaining" ? "讨价还价" : "信号博弈"}</Badge>
                    </div>
                    {project.model.keyAssumptions.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-muted-foreground mb-1">关键假设:</p>
                        <ul className="list-disc list-inside text-sm space-y-0.5">
                          {project.model.keyAssumptions.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Platform Context — spans full width */}
                  {project.model.platformContext && (
                    <div className="md:col-span-2">
                      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <LayoutGrid className="h-3 w-3" /> 平台属性
                      </h4>
                      <div className="bg-muted/50 rounded-md px-3 py-2 text-sm space-y-1">
                        <p>网络效应: {project.model.platformContext.hasCrossNetworkEffects ? "有" : "无"}</p>
                        {project.model.platformContext.sides.length > 0 && (
                          <p>参与边: {project.model.platformContext.sides.join(", ")}</p>
                        )}
                        {project.model.platformContext.pricingModel && (
                          <p>定价模式: {project.model.platformContext.pricingModel}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          </div>

          {/* Navigation */}
          <div className="flex justify-between pt-2">
            <Button variant="outline" size="sm" onClick={goBack} disabled={currentIdx === 0} className="gap-1">
              <ChevronLeft className="h-3 w-3" /> 上一步
            </Button>
            <Button size="sm" onClick={goNext} disabled={!canProceed() && state.wizardStep !== "review"} className="gap-1">
              {currentIdx === STEP_ORDER.length - 1 ? "完成" : "下一步"}
              {currentIdx < STEP_ORDER.length - 1 && <ChevronRight className="h-3 w-3" />}
            </Button>
          </div>
          {!canProceed() && state.wizardStep !== "review" && state.wizardStep !== "platform" && (
            <p className="text-xs text-muted-foreground text-right -mt-2">请完成此步骤的设置</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
