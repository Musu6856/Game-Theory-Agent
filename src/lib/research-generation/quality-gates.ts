import type { EquilibriumResult, PropertyAnalysis } from "../types";

export function isSymbolicEquilibriumResult(result: EquilibriumResult) {
  if (result.status === "idle" || result.status === "needs_revision") {
    return false;
  }

  const combined = [
    result.concept,
    ...result.solvingSteps,
    ...result.focs,
    ...result.conditions,
    result.closedForm,
    result.derivation,
    result.code,
    ...result.warnings,
  ].join("\n");

  if (containsSimulationOnlyText(combined)) return false;
  if (containsMalformedClosedForm(result.closedForm)) return false;

  const draftSignals = [
    "derivation_draft",
    "implicit_system",
    "reaction_functions",
    "failed_with_reason",
    "needs_model_clarification",
    "symbolic_failure",
  ];
  const symbolicSignals = [
    /\\frac/,
    /\\partial/,
    /∂/,
    /Π/,
    /τ/,
    /α|β/,
    /FOC|foc/i,
    /sp\.solve/,
    /sympy/i,
    /反应函数|无差异|闭式|解析|符号/,
    /R_\{/,
    /implicit|隐式|F\(.+\)\s*=\s*0/i,
    /reaction function|反应函数/i,
  ];

  return (
    draftSignals.includes(result.status) ||
    symbolicSignals.some((pattern) => pattern.test(combined))
  );
}

export function isSymbolicPropertyAnalysis(analysis: PropertyAnalysis) {
  const combined = [
    analysis.target,
    analysis.parameter,
    analysis.symbolicResult,
    analysis.signCondition,
    analysis.propositionDraft,
    analysis.proofSketch,
    analysis.intuition,
    ...analysis.warnings,
  ].join("\n");

  if (containsSimulationOnlyText(combined)) return false;
  if (isTrivialMissingParameterProperty(analysis)) return false;

  return /\\frac|\\partial|∂|α|β|隐函数|符号|FOC|反应函数|阈值|Leftrightarrow/i.test(
    combined
  );
}

function containsMalformedClosedForm(text: string) {
  return (
    /\*\*/.test(text) ||
    /\b[A-Za-z]\w*\s*\*\s*=/.test(text) ||
    /\d(?:\s*)[A-Za-z_]\w*\s*\*/.test(text) ||
    /[A-Za-z_]\w*\s*\*\s*=\s*[^,;，；\n]+[A-Za-z_]\w*\s*\*/.test(text)
  );
}

function isTrivialMissingParameterProperty(analysis: PropertyAnalysis) {
  const resultText = analysis.symbolicResult.replace(/\s+/g, "");
  const explanation = [
    analysis.signCondition,
    analysis.propositionDraft,
    analysis.proofSketch,
    analysis.intuition,
    ...analysis.warnings,
  ].join("\n");

  const claimsZero =
    /=0(?:$|[^-9])/.test(resultText) ||
    /零|zero/i.test(analysis.signCondition);
  const missingParameterReason =
    /不含|未纳入|未进入|未包含|没有纳入|缺少|absent|not included|does not include|doesn't include/i.test(
      explanation
    );

  return claimsZero && missingParameterReason;
}

function containsSimulationOnlyText(text: string) {
  return /Monte Carlo|simulate|simulation|仿真结果|数值模拟结果|数值仿真|令\s+\w+\s*=\s*\d/i.test(
    text
  );
}

