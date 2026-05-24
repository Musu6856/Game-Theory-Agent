import type { HotellingModel } from "./types";

export type HotellingModelSolvabilityResult = {
  ok: boolean;
  issues: string[];
};

const unresolvedMechanismFunctionPattern =
  /\\(?:psi|phi|Psi|Phi)(?:_\{?[A-Za-z0-9]+\}?|)\s*\(|\b(?:R|C|Revenue|Cost)_[A-Za-z0-9]+\s*\(/;

export function evaluateHotellingModelSolvability(
  model: HotellingModel
): HotellingModelSolvabilityResult {
  const issues: string[] = [];
  const expressionFields = [
    ...model.utilityFunctions.map((entry) => entry.expression),
    ...model.profitFunctions.map((entry) => entry.expression),
    model.demandDerivation,
    model.modelSetupDraft,
  ];

  if (expressionFields.some((entry) => unresolvedMechanismFunctionPattern.test(entry))) {
    issues.push(
      "unresolved mechanism function: replace psi/phi/R_i(...)/C_i(...) with concrete symbolic terms before solving"
    );
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}
