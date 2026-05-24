"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDefaultHotellingModel } from "@/lib/hotelling-defaults";
import { useStore } from "@/lib/store";
import type {
  HotellingModel,
  ModelStage,
  ProfitFunction,
  ResearchProject,
  SymbolDefinition,
  UtilityFunction,
} from "@/lib/types";
import { MathChip } from "./math-chip";
import { SymbolEditor } from "./symbol-editor";

function linesToList(value: string) {
  return value.split(/\r?\n/);
}

function listToLines(value: string[]) {
  return value.join("\n");
}

function createSymbol(): SymbolDefinition {
  return {
    id: crypto.randomUUID(),
    symbol: "x_i",
    baseSymbol: "x",
    subscript: "i",
    superscript: "",
    codeName: "x_i",
    name: "",
    meaning: "",
    role: "parameter",
    side: "global",
    assumption: "real",
    recommended: false,
  };
}

function createUtility(platform: string): UtilityFunction {
  return {
    id: crypto.randomUUID(),
    side: "consumer",
    platform,
    expression: "",
    notes: "",
  };
}

function createProfit(platform: string): ProfitFunction {
  return {
    id: crypto.randomUUID(),
    platform,
    expression: "",
    notes: "",
  };
}

function createStage(order: number): ModelStage {
  return {
    id: crypto.randomUUID(),
    order,
    name: `阶段 ${order}`,
    decisions: [],
  };
}

export function ModelStep({ project }: { project: ResearchProject }) {
  const { dispatch } = useStore();
  const [editingSymbolId, setEditingSymbolId] = useState<string | null>(null);
  const model = project.hotellingModel;

  useEffect(() => {
    if (project.hotellingModel) return;

    dispatch({
      type: "SET_HOTELLING_MODEL",
      payload: createDefaultHotellingModel(),
    });
  }, [dispatch, project.hotellingModel]);

  const completedCounts = useMemo(() => {
    if (!project.hotellingModel) {
      return { symbols: 0, utilities: 0, profits: 0, assumptions: 0 };
    }

    return {
      symbols: project.hotellingModel.symbols.length,
      utilities: project.hotellingModel.utilityFunctions.filter((entry) =>
        entry.expression.trim()
      ).length,
      profits: project.hotellingModel.profitFunctions.filter((entry) =>
        entry.expression.trim()
      ).length,
      assumptions: project.hotellingModel.assumptions.filter((entry) =>
        entry.trim()
      ).length,
    };
  }, [project.hotellingModel]);

  if (!model) {
    return (
      <section className="flex min-h-[520px] min-w-0 flex-col gap-4">
        <header className="border-b pb-3">
          <p className="text-xs font-medium text-muted-foreground">模型建立</p>
          <h3 className="mt-1 break-words text-base font-semibold">
            正在初始化 Hotelling 模型
          </h3>
        </header>
        <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
          正在创建默认双边平台设定。
        </p>
      </section>
    );
  }

  const activeModel = model;

  function setModel(nextModel: HotellingModel) {
    dispatch({
      type: "SET_HOTELLING_MODEL",
      payload: nextModel,
    });
  }

  function updateModel(updater: (current: HotellingModel) => HotellingModel) {
    setModel(updater(activeModel));
  }

  function updateSymbol(nextSymbol: SymbolDefinition) {
    updateModel((current) => ({
      ...current,
      symbols: current.symbols.map((symbol) =>
        symbol.id === nextSymbol.id ? nextSymbol : symbol
      ),
    }));
  }

  function deleteSymbol(id: string) {
    updateModel((current) => ({
      ...current,
      symbols: current.symbols.filter((symbol) => symbol.id !== id),
    }));
    if (editingSymbolId === id) {
      setEditingSymbolId(null);
    }
  }

  function addSymbol() {
    const nextSymbol = createSymbol();
    updateModel((current) => ({
      ...current,
      symbols: [...current.symbols, nextSymbol],
    }));
    setEditingSymbolId(nextSymbol.id);
  }

  function updateStage(stageId: string, nextStage: Partial<ModelStage>) {
    updateModel((current) => ({
      ...current,
      timing: current.timing.map((stage) =>
        stage.id === stageId ? { ...stage, ...nextStage } : stage
      ),
    }));
  }

  function deleteStage(stageId: string) {
    updateModel((current) => ({
      ...current,
      timing: current.timing
        .filter((stage) => stage.id !== stageId)
        .map((stage, index) => ({ ...stage, order: index + 1 })),
    }));
  }

  function addStage() {
    updateModel((current) => ({
      ...current,
      timing: [...current.timing, createStage(current.timing.length + 1)],
    }));
  }

  function updateUtility(id: string, nextEntry: Partial<UtilityFunction>) {
    updateModel((current) => ({
      ...current,
      utilityFunctions: current.utilityFunctions.map((entry) =>
        entry.id === id ? { ...entry, ...nextEntry } : entry
      ),
    }));
  }

  function updateProfit(id: string, nextEntry: Partial<ProfitFunction>) {
    updateModel((current) => ({
      ...current,
      profitFunctions: current.profitFunctions.map((entry) =>
        entry.id === id ? { ...entry, ...nextEntry } : entry
      ),
    }));
  }

  const editingSymbol =
    model.symbols.find((symbol) => symbol.id === editingSymbolId) ??
    model.symbols[0] ??
    null;

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col gap-5">
      <header className="border-b pb-3">
        <p className="text-xs font-medium text-muted-foreground">模型建立</p>
        <h3 className="mt-1 break-words text-base font-semibold">
          Hotelling 模型构建器
        </h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {completedCounts.symbols} 个符号，{completedCounts.utilities} 个效用函数，
          {completedCounts.profits} 个利润函数，{completedCounts.assumptions} 条假设。
        </p>
      </header>

      <section className="min-w-0 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-sm font-semibold">符号字典</h4>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              建议用 n_i^C 与 n_i^M 表示消费者侧和商家侧数量，除非论文明确需要单独的 m 记号。
            </p>
          </div>
          <Button size="sm" onClick={addSymbol}>
            <Plus aria-hidden="true" />
            符号
          </Button>
        </div>

        <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 divide-y rounded-lg border">
            {model.symbols.map((symbol) => (
              <div
                key={symbol.id}
                className="flex min-w-0 items-start justify-between gap-3 p-2.5"
              >
                <button
                  type="button"
                  onClick={() => setEditingSymbolId(symbol.id)}
                  className="flex min-w-0 flex-1 items-start gap-2 rounded-md text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <MathChip symbol={symbol} />
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium">
                      {symbol.name || symbol.codeName || symbol.symbol}
                    </span>
                    <span className="mt-0.5 block line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
                      {symbol.meaning || "未记录含义"}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => deleteSymbol(symbol.id)}
                  aria-label={`删除 ${symbol.name || symbol.codeName}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>

          <div className="min-w-0 rounded-lg border p-3">
            {editingSymbol ? (
              <SymbolEditor symbol={editingSymbol} onChange={updateSymbol} />
            ) : (
              <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
                添加一个符号后即可开始整理字典。
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-3 border-t pt-4 md:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="consumer-side-name" className="text-xs">
            消费者侧名称
          </Label>
          <Input
            id="consumer-side-name"
            value={model.sides.consumerSideName}
            onChange={(event) =>
              updateModel((current) => ({
                ...current,
                sides: {
                  ...current.sides,
                  consumerSideName: event.currentTarget.value,
                },
              }))
            }
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="merchant-side-name" className="text-xs">
            商家侧名称
          </Label>
          <Input
            id="merchant-side-name"
            value={model.sides.merchantSideName}
            onChange={(event) =>
              updateModel((current) => ({
                ...current,
                sides: {
                  ...current.sides,
                  merchantSideName: event.currentTarget.value,
                },
              }))
            }
            className="text-sm"
          />
        </div>
        <div className="grid min-w-0 gap-1.5 md:col-span-2">
          <Label htmlFor="platforms" className="text-xs">
            平台列表，每行一个
          </Label>
          <Textarea
            id="platforms"
            value={listToLines(model.platforms)}
            onChange={(event) =>
              updateModel((current) => ({
                ...current,
                platforms: linesToList(event.currentTarget.value),
              }))
            }
            rows={2}
            className="min-h-16 resize-y text-sm leading-5"
          />
        </div>
      </section>

      <section className="min-w-0 space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">时序阶段</h4>
          <Button size="sm" variant="outline" onClick={addStage}>
            <Plus aria-hidden="true" />
            阶段
          </Button>
        </div>
        <div className="min-w-0 divide-y rounded-lg border">
          {model.timing.map((stage) => (
            <div key={stage.id} className="grid min-w-0 gap-2 p-3 md:grid-cols-5">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={`${stage.id}-order`} className="text-xs">
                  顺序
                </Label>
                <Input
                  id={`${stage.id}-order`}
                  type="number"
                  min={1}
                  value={stage.order}
                  onChange={(event) =>
                    updateStage(stage.id, {
                      order: Number(event.currentTarget.value) || stage.order,
                    })
                  }
                  className="text-sm"
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <Label htmlFor={`${stage.id}-name`} className="text-xs">
                  阶段名称
                </Label>
                <Input
                  id={`${stage.id}-name`}
                  value={stage.name}
                  onChange={(event) =>
                    updateStage(stage.id, { name: event.currentTarget.value })
                  }
                  className="text-sm"
                />
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${stage.id}-decisions`} className="text-xs">
                    决策内容，每行一个
                  </Label>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => deleteStage(stage.id)}
                    aria-label={`删除 ${stage.name}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <Textarea
                  id={`${stage.id}-decisions`}
                  value={listToLines(stage.decisions)}
                  onChange={(event) =>
                    updateStage(stage.id, {
                      decisions: linesToList(event.currentTarget.value),
                    })
                  }
                  rows={2}
                  className="min-h-16 resize-y text-sm leading-5"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <EditableFunctionSection
        title="效用函数"
        addLabel="条目"
        emptyLabel="暂无条目。"
        sideLabel="参与侧"
        platformLabel="平台"
        expressionLabel="表达式"
        notesLabel="备注"
        deleteLabel="删除效用函数条目"
        entries={model.utilityFunctions}
        platforms={model.platforms}
        onAdd={() =>
          updateModel((current) => ({
            ...current,
            utilityFunctions: [
              ...current.utilityFunctions,
              createUtility(current.platforms[0]?.trim() || "A"),
            ],
          }))
        }
        onDelete={(id) =>
          updateModel((current) => ({
            ...current,
            utilityFunctions: current.utilityFunctions.filter(
              (entry) => entry.id !== id
            ),
          }))
        }
        onUpdate={updateUtility}
        withSide
      />

      <section className="grid min-w-0 gap-1.5 border-t pt-4">
        <Label htmlFor="demand-derivation" className="text-xs">
          需求推导
        </Label>
        <Textarea
          id="demand-derivation"
          value={model.demandDerivation}
          onChange={(event) =>
            updateModel((current) => ({
              ...current,
              demandDerivation: event.currentTarget.value,
            }))
          }
          rows={5}
          placeholder="无差异用户条件、市场覆盖条件，以及推导得到的 n_i^C / n_i^M 表达式。"
          className="min-h-28 resize-y text-sm leading-6"
        />
      </section>

      <EditableFunctionSection
        title="利润函数"
        addLabel="条目"
        emptyLabel="暂无条目。"
        platformLabel="平台"
        expressionLabel="表达式"
        notesLabel="备注"
        deleteLabel="删除利润函数条目"
        entries={model.profitFunctions}
        platforms={model.platforms}
        onAdd={() =>
          updateModel((current) => ({
            ...current,
            profitFunctions: [
              ...current.profitFunctions,
              createProfit(current.platforms[0]?.trim() || "A"),
            ],
          }))
        }
        onDelete={(id) =>
          updateModel((current) => ({
            ...current,
            profitFunctions: current.profitFunctions.filter(
              (entry) => entry.id !== id
            ),
          }))
        }
        onUpdate={updateProfit}
      />

      <section className="grid min-w-0 gap-3 border-t pt-4 md:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="assumptions" className="text-xs">
            假设条件，每行一个
          </Label>
          <Textarea
            id="assumptions"
            value={listToLines(model.assumptions)}
            onChange={(event) =>
              updateModel((current) => ({
                ...current,
                assumptions: linesToList(event.currentTarget.value),
              }))
            }
            rows={7}
            className="min-h-40 resize-y text-sm leading-6"
          />
        </div>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="model-setup-draft" className="text-xs">
            模型设定草稿
          </Label>
          <Textarea
            id="model-setup-draft"
            value={model.modelSetupDraft}
            onChange={(event) =>
              updateModel((current) => ({
                ...current,
                modelSetupDraft: event.currentTarget.value,
              }))
            }
            rows={7}
            placeholder="用于论文模型设定部分的正式表述。"
            className="min-h-40 resize-y text-sm leading-6"
          />
        </div>
      </section>
    </section>
  );
}

function EditableFunctionSection<T extends UtilityFunction | ProfitFunction>({
  title,
  addLabel = "条目",
  emptyLabel = "暂无条目。",
  sideLabel = "参与侧",
  platformLabel = "平台",
  expressionLabel = "表达式",
  notesLabel = "备注",
  deleteLabel = "删除条目",
  entries,
  platforms,
  onAdd,
  onDelete,
  onUpdate,
  withSide = false,
}: {
  title: string;
  addLabel?: string;
  emptyLabel?: string;
  sideLabel?: string;
  platformLabel?: string;
  expressionLabel?: string;
  notesLabel?: string;
  deleteLabel?: string;
  entries: T[];
  platforms: string[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, entry: Partial<T>) => void;
  withSide?: boolean;
}) {
  return (
    <section className="min-w-0 space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus aria-hidden="true" />
          {addLabel}
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="border-l border-dashed pl-3 text-sm leading-6 text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="min-w-0 divide-y rounded-lg border">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="grid min-w-0 gap-2 p-3 md:grid-cols-6"
            >
              {withSide ? (
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor={`${entry.id}-side`} className="text-xs">
                    {sideLabel}
                  </Label>
                  <select
                    id={`${entry.id}-side`}
                    value={(entry as UtilityFunction).side}
                    onChange={(event) =>
                      onUpdate(entry.id, {
                        side: event.currentTarget
                          .value as UtilityFunction["side"],
                      } as unknown as Partial<T>)
                    }
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="consumer">消费者</option>
                    <option value="merchant">商家</option>
                  </select>
                </div>
              ) : null}
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor={`${entry.id}-platform`} className="text-xs">
                  {platformLabel}
                </Label>
                <Input
                  id={`${entry.id}-platform`}
                  value={entry.platform}
                  onChange={(event) =>
                    onUpdate(entry.id, {
                      platform: event.currentTarget.value,
                    } as Partial<T>)
                  }
                  list={`${entry.id}-platforms`}
                  className="text-sm"
                />
                <datalist id={`${entry.id}-platforms`}>
                  {platforms
                    .map((platform) => platform.trim())
                    .filter(Boolean)
                    .map((platform) => (
                      <option key={platform} value={platform} />
                    ))}
                </datalist>
              </div>
              <div className="grid min-w-0 gap-1.5 md:col-span-3">
                <Label htmlFor={`${entry.id}-expression`} className="text-xs">
                  {expressionLabel}
                </Label>
                <Textarea
                  id={`${entry.id}-expression`}
                  value={entry.expression}
                  onChange={(event) =>
                    onUpdate(entry.id, {
                      expression: event.currentTarget.value,
                    } as Partial<T>)
                  }
                  rows={2}
                  className="min-h-16 resize-y font-mono text-sm leading-5"
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`${entry.id}-notes`} className="text-xs">
                    {notesLabel}
                  </Label>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onDelete(entry.id)}
                    aria-label={deleteLabel}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                <Textarea
                  id={`${entry.id}-notes`}
                  value={entry.notes}
                  onChange={(event) =>
                    onUpdate(entry.id, {
                      notes: event.currentTarget.value,
                    } as Partial<T>)
                  }
                  rows={2}
                  className="min-h-16 resize-y text-sm leading-5"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
