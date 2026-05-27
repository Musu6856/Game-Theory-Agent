import type {
  EquilibriumResult,
  ResearchAssetPatch,
  ResearchMathArtifact,
  ResearchMathArtifactKind,
  ResearchMathVerificationCheck,
} from "../types";

const EQUILIBRIUM_ARTIFACT_KINDS = new Set<ResearchMathArtifactKind>([
  "equilibrium_candidate",
  "compiled_game_system",
  "closed_form_substitutions",
  "foc_residuals",
  "generated_foc_system",
  "model_coverage_check",
  "model_profit_foc",
  "second_order_conditions",
  "hessian_check",
  "concavity_check",
  "boundary_kkt_check",
  "solver_attempt",
  "sympy_residual_check",
  "sympy_solve_check",
]);
const EQUILIBRIUM_ROOT_PATHS = new Set(["equilibriumResult", "equilibrium"]);
const EQUILIBRIUM_TEXT_FIELDS = new Set<keyof EquilibriumResult>([
  "concept",
  "closedForm",
  "derivation",
  "code",
]);
const EQUILIBRIUM_ARRAY_FIELDS = new Set<keyof EquilibriumResult>([
  "solvingSteps",
  "focs",
  "conditions",
  "warnings",
]);
const EQUILIBRIUM_STATUSES = new Set<EquilibriumResult["status"]>([
  "idle",
  "solved",
  "needs_revision",
  "derivation_draft",
  "implicit_system",
  "reaction_functions",
  "failed_with_reason",
  "needs_model_clarification",
  "symbolic_failure",
]);

export function selectPendingEquilibriumCandidate(
  patches: ResearchAssetPatch[] | undefined
): EquilibriumResult | undefined {
  const latestPatch = patches
    ?.filter((patch) => patch.kind === "equilibrium" && patch.status === "proposed")
    .sort((left, right) => left.createdAt - right.createdAt)
    .at(-1);

  if (!latestPatch) return undefined;

  const rootCandidate = latestPatch.changes
    .map((change) =>
      EQUILIBRIUM_ROOT_PATHS.has(normalizePatchPath(change.path))
        ? change.value
        : undefined
    )
    .find(isEquilibriumResult);
  if (rootCandidate) return rootCandidate;

  return reconstructEquilibriumCandidate(latestPatch.changes);
}

export function selectEquilibriumMathArtifactsForDisplay(
  artifacts: ResearchMathArtifact[] | undefined,
  limit = 8
) {
  return (artifacts ?? [])
    .filter(isEquilibriumArtifactForDisplay)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit);
}

export function getMathArtifactKindLabel(kind: ResearchMathArtifactKind) {
  switch (kind) {
    case "equilibrium_candidate":
      return "均衡候选";
    case "compiled_game_system":
      return "模型系统";
    case "closed_form_substitutions":
      return "闭式解代入";
    case "foc_residuals":
      return "候选 FOC";
    case "generated_foc_system":
      return "生成 FOC";
    case "model_coverage_check":
      return "模型覆盖";
    case "model_profit_foc":
      return "利润 FOC";
    case "second_order_conditions":
      return "二阶条件";
    case "hessian_check":
      return "Hessian 检查";
    case "concavity_check":
      return "凹性证据";
    case "boundary_kkt_check":
      return "边界/KKT";
    case "solver_attempt":
      return "求解尝试";
    case "sympy_residual_check":
      return "残差复核";
    case "sympy_solve_check":
      return "独立求解";
  }
}

export function getMathArtifactStatusLabel(
  status: ResearchMathVerificationCheck["status"]
) {
  switch (status) {
    case "passed":
      return "已通过";
    case "failed":
      return "需修正";
    case "condition_insufficient":
      return "条件不足";
    case "unsupported":
      return "暂不支持";
    case "manual_review":
      return "人工复核";
  }
}

function isEquilibriumArtifactForDisplay(artifact: ResearchMathArtifact) {
  if (!EQUILIBRIUM_ARTIFACT_KINDS.has(artifact.kind)) return false;

  const scopeText = [
    artifact.stepId,
    artifact.runId ?? "",
    artifact.patchId ?? "",
  ].join(" ");

  return !/propert|analy[sz]e_properties|review-properties|性质分析/i.test(
    scopeText
  );
}

function reconstructEquilibriumCandidate(
  changes: ResearchAssetPatch["changes"]
): EquilibriumResult | undefined {
  const candidate: Partial<EquilibriumResult> = {};

  for (const change of changes) {
    const field = parseEquilibriumFieldPath(change.path);
    if (!field) continue;

    if (field === "status") {
      const status = parseEquilibriumStatus(change.value);
      if (status) candidate.status = status;
      continue;
    }

    if (EQUILIBRIUM_TEXT_FIELDS.has(field)) {
      if (typeof change.value === "string") {
        assignEquilibriumTextField(candidate, field, change.value.trim());
      }
      continue;
    }

    if (EQUILIBRIUM_ARRAY_FIELDS.has(field)) {
      const items = parseStringArray(change.value);
      if (items) assignEquilibriumArrayField(candidate, field, items);
    }
  }

  return isEquilibriumResult(candidate) ? candidate : undefined;
}

function assignEquilibriumTextField(
  candidate: Partial<EquilibriumResult>,
  field: keyof EquilibriumResult,
  value: string
) {
  if (field === "concept") candidate.concept = value;
  if (field === "closedForm") candidate.closedForm = value;
  if (field === "derivation") candidate.derivation = value;
  if (field === "code") candidate.code = value;
}

function assignEquilibriumArrayField(
  candidate: Partial<EquilibriumResult>,
  field: keyof EquilibriumResult,
  value: string[]
) {
  if (field === "solvingSteps") candidate.solvingSteps = value;
  if (field === "focs") candidate.focs = value;
  if (field === "conditions") candidate.conditions = value;
  if (field === "warnings") candidate.warnings = value;
}

function parseEquilibriumFieldPath(path: string): keyof EquilibriumResult | null {
  const match = normalizePatchPath(path).match(
    /^equilibrium(?:Result)?\.([A-Za-z_][A-Za-z0-9_]*)$/
  );
  if (!match) return null;

  const field = match[1] as keyof EquilibriumResult;
  if (
    field === "status" ||
    EQUILIBRIUM_TEXT_FIELDS.has(field) ||
    EQUILIBRIUM_ARRAY_FIELDS.has(field)
  ) {
    return field;
  }

  return null;
}

function normalizePatchPath(path: string) {
  return path.trim().replace(/^project\./, "");
}

function parseEquilibriumStatus(
  value: unknown
): EquilibriumResult["status"] | null {
  return typeof value === "string" &&
    EQUILIBRIUM_STATUSES.has(value as EquilibriumResult["status"])
    ? (value as EquilibriumResult["status"])
    : null;
}

function parseStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((item) => typeof item === "string")
    ? value.map((item) => item.trim())
    : null;
}

function isEquilibriumResult(value: unknown): value is EquilibriumResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EquilibriumResult>;

  return (
    typeof candidate.status === "string" &&
    typeof candidate.concept === "string" &&
    Array.isArray(candidate.solvingSteps) &&
    Array.isArray(candidate.focs) &&
    Array.isArray(candidate.conditions) &&
    typeof candidate.closedForm === "string" &&
    typeof candidate.derivation === "string" &&
    typeof candidate.code === "string" &&
    Array.isArray(candidate.warnings)
  );
}
