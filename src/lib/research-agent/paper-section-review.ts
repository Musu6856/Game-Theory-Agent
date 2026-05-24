import type { PaperSection, ResearchProject } from "../types";
import {
  buildVersionReviewSummary,
  type VersionReviewPriority,
} from "./version-review-summary.ts";

export type PaperSectionReviewStatus =
  | "passed"
  | "review_needed"
  | "not_ready";

export type PaperSectionReviewTask = {
  sectionId: string;
  title: string;
  priority: Exclude<VersionReviewPriority, "none">;
  dependsOn: Array<"direction" | "evidence" | "model" | "equilibrium" | "properties">;
  reason: string;
  nextAction: string;
};

export type PaperSectionReview = {
  status: PaperSectionReviewStatus;
  headline: string;
  nextAction: string;
  tasks: PaperSectionReviewTask[];
};

export function buildPaperSectionReview({
  project,
}: {
  project: Pick<ResearchProject, "sections" | "researchSession">;
}): PaperSectionReview {
  if (project.sections.length === 0) {
    return {
      status: "not_ready",
      headline: "还没有可复核的论文章节。",
      nextAction: "先基于稳定资产整理论文草稿",
      tasks: [],
    };
  }

  const versionSummary = buildVersionReviewSummary(
    project.researchSession?.assetVersionHistory ?? []
  );
  const tasks = project.sections.map((section) =>
    createSectionReviewTask(section, versionSummary.highestPriority)
  );
  const highPriorityCount = tasks.filter((task) => task.priority === "high").length;

  return {
    status: highPriorityCount > 0 ? "review_needed" : "passed",
    headline:
      highPriorityCount > 0
        ? `${tasks.length} 个章节需要复核，其中 ${highPriorityCount} 个优先级较高。`
        : `${tasks.length} 个章节已有基础复核任务。`,
    nextAction:
      highPriorityCount > 0
        ? "优先复核模型、均衡和命题相关章节"
        : "按章节继续补充引用、证明叙述和讨论",
    tasks,
  };
}

function createSectionReviewTask(
  section: PaperSection,
  projectPriority: VersionReviewPriority
): PaperSectionReviewTask {
  const dependsOn = inferSectionDependencies(section);
  const priority = getSectionPriority(dependsOn, projectPriority);

  return {
    sectionId: section.id,
    title: section.title,
    priority,
    dependsOn,
    reason: getSectionReviewReason(dependsOn),
    nextAction: getSectionNextAction(dependsOn),
  };
}

function inferSectionDependencies(
  section: PaperSection
): PaperSectionReviewTask["dependsOn"] {
  const text = `${section.id} ${section.title} ${section.content}`.toLowerCase();

  if (/equilibrium|均衡|闭式|foc|一阶|closed/.test(text)) {
    return ["model", "equilibrium"];
  }
  if (/proposition|命题|比较静态|偏导|性质|证明/.test(text)) {
    return ["model", "equilibrium", "properties"];
  }
  if (/model|模型|假设|效用|利润|时序|参与方/.test(text)) {
    return ["model"];
  }
  return ["direction", "evidence"];
}

function getSectionPriority(
  dependsOn: PaperSectionReviewTask["dependsOn"],
  projectPriority: VersionReviewPriority
): PaperSectionReviewTask["priority"] {
  if (
    projectPriority === "high" &&
    (dependsOn.includes("model") ||
      dependsOn.includes("equilibrium") ||
      dependsOn.includes("properties"))
  ) {
    return "high";
  }
  if (dependsOn.includes("equilibrium") || dependsOn.includes("properties")) {
    return "medium";
  }
  return "low";
}

function getSectionReviewReason(
  dependsOn: PaperSectionReviewTask["dependsOn"]
) {
  if (dependsOn.includes("properties")) {
    return "本章引用命题、证明或比较静态，需要和当前性质分析保持一致。";
  }
  if (dependsOn.includes("equilibrium")) {
    return "本章引用均衡推导或闭式解，需要确认没有沿用旧模型下的结果。";
  }
  if (dependsOn.includes("model")) {
    return "本章依赖模型设定，需要复核参与方、假设、函数和符号是否一致。";
  }
  return "本章主要承担研究动机和来源定位，需要补齐来源引用和问题表述。";
}

function getSectionNextAction(dependsOn: PaperSectionReviewTask["dependsOn"]) {
  if (dependsOn.includes("properties")) {
    return "核对命题编号、符号结果、证明草图和经济直觉";
  }
  if (dependsOn.includes("equilibrium")) {
    return "核对闭式解、存在条件和推导叙述";
  }
  if (dependsOn.includes("model")) {
    return "核对模型假设、效用函数、利润函数和符号表";
  }
  return "补充来源引用，并确认研究问题表述准确";
}
