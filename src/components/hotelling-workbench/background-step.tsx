"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createEmptyBackground } from "@/lib/hotelling-defaults";
import { useStore } from "@/lib/store";
import type { BackgroundStory, ResearchProject } from "@/lib/types";

const FIELDS: Array<{
  key: keyof Pick<
    BackgroundStory,
    | "scenario"
    | "puzzle"
    | "strategicInteraction"
    | "hotellingRationale"
    | "mechanismIntuition"
  >;
  label: string;
  placeholder: string;
  rows: number;
}> = [
  {
    key: "scenario",
    label: "研究情境",
    placeholder: "平台、市场、参与者与现实场景",
    rows: 3,
  },
  {
    key: "puzzle",
    label: "研究谜题",
    placeholder: "尚未被解释的反常现象、冲突或管理问题",
    rows: 3,
  },
  {
    key: "strategicInteraction",
    label: "策略互动",
    placeholder: "谁在竞争，谁在选择，关键策略变量是什么",
    rows: 3,
  },
  {
    key: "hotellingRationale",
    label: "Hotelling 适配理由",
    placeholder: "差异化、位置、匹配成本或用户异质性如何进入模型",
    rows: 3,
  },
  {
    key: "mechanismIntuition",
    label: "机制直觉",
    placeholder: "核心机制、方向性预测与可能的边界条件",
    rows: 3,
  },
];

export function BackgroundStep({ project }: { project: ResearchProject }) {
  const { dispatch } = useStore();
  const background = project.background ?? createEmptyBackground();

  function updateBackground(field: keyof BackgroundStory, value: string) {
    dispatch({
      type: "SET_BACKGROUND",
      payload: {
        ...background,
        [field]: value,
      },
    });
  }

  return (
    <section className="flex min-h-[520px] min-w-0 flex-col gap-4">
      <header className="border-b pb-3">
        <p className="text-xs font-medium text-muted-foreground">背景故事</p>
        <h3 className="mt-1 break-words text-base font-semibold">
          研究情境编辑
        </h3>
      </header>

      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="background-title" className="text-xs">
            项目线索
          </Label>
          <Input
            id="background-title"
            value={project.refinedIdea || project.rawIdea || ""}
            readOnly
            className="text-sm"
            placeholder="尚未填写项目线索"
          />
        </div>

        {FIELDS.map((field) => (
          <div key={field.key} className="grid min-w-0 gap-1.5">
            <Label htmlFor={`background-${field.key}`} className="text-xs">
              {field.label}
            </Label>
            <Textarea
              id={`background-${field.key}`}
              value={background[field.key]}
              onChange={(event) =>
                updateBackground(field.key, event.currentTarget.value)
              }
              rows={field.rows}
              placeholder={field.placeholder}
              className="min-h-20 resize-y text-sm leading-5"
            />
          </div>
        ))}
      </div>

      <div className="grid min-w-0 gap-1.5 border-t pt-3">
        <Label htmlFor="background-draft" className="text-xs">
          背景草稿
        </Label>
        <Textarea
          id="background-draft"
          value={background.draft}
          onChange={(event) =>
            updateBackground("draft", event.currentTarget.value)
          }
          rows={8}
          placeholder="把上面的材料压成可进入论文引言的背景段落。"
          className="min-h-44 resize-y text-sm leading-6"
        />
      </div>
    </section>
  );
}
