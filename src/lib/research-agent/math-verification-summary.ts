import type { MathVerificationCheck } from "./math-verifier.ts";
import { verifyEquilibriumMathConsistency, verifyPropertyAnalysisMathConsistency } from "./math-verifier.ts";
import type { ResearchProject } from "../types";

export type MathVerificationSummaryStatus =
  | "passed"
  | "failed"
  | "review_needed"
  | "not_ready";

export type MathVerificationSummary = {
  status: MathVerificationSummaryStatus;
  headline: string;
  nextAction: string;
  issueCount: number;
  issues: string[];
  checkCounts: Record<MathVerificationCheck["status"], number>;
  checks: MathVerificationCheck[];
};

export type MathVerificationActionHint = {
  title: string;
  body: string;
};

export function selectMathVerificationPanelChecks(
  summary: Pick<MathVerificationSummary, "checks">,
  { compact = false }: { compact?: boolean } = {}
) {
  return summary.checks
    .filter(
      (check) =>
        check.status !== "passed" || check.kind === "sympy_execution"
    )
    .slice(0, compact ? 2 : 5);
}

export function buildProjectMathVerificationSummary(
  project: Pick<
    ResearchProject,
    "hotellingModel" | "equilibriumResult" | "propertyAnalyses" | "researchSession"
  >
): MathVerificationSummary {
  if (!project.hotellingModel || !project.equilibriumResult) {
    return {
      status: "not_ready",
      headline: "数学验证等待模型和均衡结果。",
      nextAction: "先确认模型并生成符号均衡",
      issueCount: 0,
      issues: [],
      checkCounts: createEmptyCheckCounts(),
      checks: [],
    };
  }

  const equilibriumResult = verifyEquilibriumMathConsistency({
    model: project.hotellingModel,
    equilibrium: project.equilibriumResult,
  });
  const propertyResult = verifyPropertyAnalysisMathConsistency({
    model: project.hotellingModel,
    equilibrium: project.equilibriumResult,
    analyses: project.propertyAnalyses ?? [],
  });
  const issues = [...equilibriumResult.issues, ...propertyResult.issues];
  const checks = [...equilibriumResult.checks, ...propertyResult.checks];
  const persistedChecks = project.researchSession?.mathVerificationChecks ?? [];
  const checksWithPersisted = mergeMathVerificationChecks([
    ...checks,
    ...persistedChecks,
  ]);
  const checkCounts = countChecks(checksWithPersisted);
  const status = getSummaryStatus(issues, checkCounts);

  return {
    status,
    headline: getSummaryHeadline(status, issues.length, checkCounts),
    nextAction: getSummaryNextAction(status),
    issueCount: issues.length,
    issues,
    checkCounts,
    checks: checksWithPersisted,
  };
}

export function getMathVerificationActionHints(
  summary: Pick<MathVerificationSummary, "status" | "checkCounts">
): MathVerificationActionHint[] {
  const hints: MathVerificationActionHint[] = [];

  if (
    summary.status === "failed" &&
    (summary.checkCounts.failed > 0 ||
      summary.checkCounts.condition_insufficient > 0)
  ) {
    hints.push({
      title: "需修正",
      body:
        "回到模型、均衡或性质分析里看对应检查说明；让 AI 生成修复时，只应用右侧出现的修改建议，不要把失败草稿直接覆盖成正式资产。",
    });
  }

  if (summary.checkCounts.condition_insufficient > 0) {
    hints.push({
      title: "条件不足",
      body:
        "补齐参数正负、取值区间或内点条件后再重跑；如果条件来自论文假设，优先在模型设定或均衡存在条件里补充。",
    });
  }

  if (
    summary.status === "review_needed" ||
    summary.checkCounts.unsupported > 0 ||
    summary.checkCounts.manual_review > 0
  ) {
    hints.push({
      title: "人工复核",
      body:
        "展开下方复核说明，看系统跳过或不敢自动判定的公式；如果数学关系看起来合理，可以继续推进，否则先让 AI 按这条说明生成修复建议。",
    });
  }

  if (summary.status === "passed") {
    hints.push({
      title: "可继续推进",
      body:
        "自动检查暂未发现阻塞项，可以继续求解、分析性质或整理论文草稿；核心资产仍以右侧待审核修改建议为准。",
    });
  }

  return hints;
}

function getSummaryStatus(
  issues: string[],
  counts: MathVerificationSummary["checkCounts"]
): MathVerificationSummaryStatus {
  if (
    issues.length > 0 ||
    counts.failed > 0 ||
    counts.condition_insufficient > 0
  ) {
    return "failed";
  }
  if (counts.unsupported > 0 || counts.manual_review > 0) return "review_needed";
  return "passed";
}

function getSummaryHeadline(
  status: MathVerificationSummaryStatus,
  issueCount: number,
  counts: MathVerificationSummary["checkCounts"]
) {
  switch (status) {
    case "failed":
      return `发现 ${issueCount} 个数学复核问题，需要先修正。`;
    case "review_needed":
      return `已有 ${counts.passed} 项自动检查通过，${counts.unsupported + counts.manual_review} 项需要人工复核。`;
    case "passed":
      return `数学验证通过 ${counts.passed} 项自动检查。`;
    case "not_ready":
      return "数学验证等待模型和均衡结果。";
  }
}

function getSummaryNextAction(status: MathVerificationSummaryStatus) {
  switch (status) {
    case "failed":
      return "先修正数学问题，再继续生成后续资产";
    case "review_needed":
      return "人工复核暂不支持自动复算的推导，再决定是否继续";
    case "passed":
      return "可以继续推进到下一项研究资产";
    case "not_ready":
      return "先确认模型并生成符号均衡";
  }
}

function countChecks(checks: MathVerificationCheck[]) {
  const counts = createEmptyCheckCounts();
  checks.forEach((check) => {
    counts[check.status] += 1;
  });
  return counts;
}

function createEmptyCheckCounts() {
  return {
    passed: 0,
    failed: 0,
    condition_insufficient: 0,
    unsupported: 0,
    manual_review: 0,
  };
}

function mergeMathVerificationChecks(checks: MathVerificationCheck[]) {
  const seen = new Set<string>();
  const merged: MathVerificationCheck[] = [];

  checks.forEach((check) => {
    const key = [
      check.kind,
      check.status,
      check.analysisId ?? "",
      check.analysisIndex ?? "",
      check.message,
    ].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(check);
  });

  return merged;
}
