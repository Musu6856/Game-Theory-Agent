"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ModelSourceConfigurator } from "@/components/model-source-configurator";
import { Button } from "@/components/ui/button";
import {
  MODEL_SOURCE_CONFIGURED_EVENT,
  MODEL_SOURCE_STORAGE_KEY,
  markModelSourceSetupCompleted,
  normalizeModelSourceSettings,
} from "@/lib/model-source";
import type { ModelSourceSettings } from "@/lib/types";

export function ModelSourceStep({
  settings,
  onSettingsChange,
}: {
  settings: ModelSourceSettings;
  onSettingsChange: (settings: ModelSourceSettings) => void;
}) {
  const router = useRouter();

  function handleNext() {
    try {
      const normalized = normalizeModelSourceSettings(settings);
      window.localStorage.setItem(
        MODEL_SOURCE_STORAGE_KEY,
        JSON.stringify(normalized)
      );
      markModelSourceSetupCompleted(window.localStorage);
      window.dispatchEvent(new Event(MODEL_SOURCE_CONFIGURED_EVENT));
      onSettingsChange(normalized);
      router.push("/research");
    } catch (error) {
      toast.error("请补全模型来源配置", {
        description:
          error instanceof Error ? error.message : "当前配置无法用于生成研究。",
      });
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <ModelSourceConfigurator
        settings={settings}
        onSettingsChange={onSettingsChange}
      />

      <div className="mt-auto flex justify-end pt-8">
        <Button onClick={handleNext} className="h-10 gap-2 px-5">
          进入工作台
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
