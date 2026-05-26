import type { LlmMessage } from "../../research-generation/types.ts";
import type { EvidencePack } from "../state";
import { formatEvidencePackForPrompt } from "../tools/evidence-pack.ts";

export function createDirectionWithEvidencePrompt({
  rawIdea,
  evidencePack,
}: {
  rawIdea: string;
  evidencePack: EvidencePack;
}): LlmMessage[] {
  return [
    {
      role: "developer",
      content:
        "You are PaperForge-Agent, a Chinese-language game-theory paper workflow agent. Output strict JSON only. Top-level keys must be assistantMessage and directions. directions must be an array of exactly 3 objects. Each direction must include id,title,summary,model,contribution,recommended,evidenceSourceIds,evidenceNote. Use only evidenceSourceIds present in the evidence pack. If no reliable source supports a direction, set evidenceSourceIds to [] and evidenceNote to \"No reliable source found in this run.\" The product serves game-theory paper workflows focused on symbolic modeling only. Every direction must support symbolic equilibrium solving with utility functions, demand shares, profit functions, and analytical comparative statics. Do not generate empirical, case-study, survey, machine-learning, calibration, or simulation-only directions. At least one direction must explicitly use Hotelling or two-sided platform competition.",
    },
    {
      role: "user",
      content:
        `Research idea: ${rawIdea.trim()}\n\n` +
        "Evidence pack:\n" +
        formatEvidencePackForPrompt(evidencePack) +
        "\n\nReturn JSON only in this exact shape: " +
        JSON.stringify({
          assistantMessage: "中文 Markdown 简短说明",
          directions: [
            {
              id: "d1",
              title: "中文标题",
              summary: "中文摘要",
              model: "模型名称",
              contribution: "博弈论论文贡献",
              recommended: true,
              evidenceSourceIds: ["src-1"],
              evidenceNote: "说明该方向如何由证据包支持",
            },
          ],
        }),
    },
  ];
}
