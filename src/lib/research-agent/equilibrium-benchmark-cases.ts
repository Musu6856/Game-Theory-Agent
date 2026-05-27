import type {
  EquilibriumResult,
  HotellingModel,
  ResearchMathArtifact,
  ResearchMathVerificationCheck,
} from "../types";
import { evaluateEquilibriumCoverage } from "./equilibrium-coverage.ts";
import { evaluateEquilibriumOptimality } from "./equilibrium-optimality.ts";

export type EquilibriumBenchmarkCategory =
  | "simple_symmetric_hotelling"
  | "non_symmetric_no_half_collapse"
  | "two_stage_reaction_function"
  | "parameter_condition_insufficient"
  | "boundary_solution"
  | "soc_stationary_not_maximum"
  | "multi_decision_hessian"
  | "mechanism_rich_implicit";

export type EquilibriumBenchmarkPromotion =
  | "promote"
  | "manual_review"
  | "draft_only"
  | "repair_candidate";

export type EquilibriumBenchmarkForbiddenShortcut =
  | "default_symmetric_half_solution"
  | "foc_only_promotion"
  | "interior_foc_for_boundary"
  | "omitted_high_value_mechanism";

export interface EquilibriumBenchmarkCase {
  id: string;
  title: string;
  category: EquilibriumBenchmarkCategory;
  model: HotellingModel;
  equilibrium: EquilibriumResult;
  substitutions: Record<string, string>;
  expected: {
    allowedStatuses: EquilibriumResult["status"][];
    coverageStatus: ResearchMathVerificationCheck["status"];
    optimalityStatuses: Partial<
      Record<ResearchMathArtifact["kind"], ResearchMathVerificationCheck["status"]>
    >;
    promotion: EquilibriumBenchmarkPromotion;
    detectedForbiddenShortcuts: EquilibriumBenchmarkForbiddenShortcut[];
  };
  notes: string;
}

export interface EquilibriumBenchmarkEvaluation {
  id: string;
  coverage: ReturnType<typeof evaluateEquilibriumCoverage>;
  optimalityArtifacts: Partial<Record<ResearchMathArtifact["kind"], ResearchMathArtifact>>;
  promotion: EquilibriumBenchmarkPromotion;
  canPromote: boolean;
  detectedForbiddenShortcuts: EquilibriumBenchmarkForbiddenShortcut[];
}

export function listEquilibriumBenchmarkCases(): EquilibriumBenchmarkCase[] {
  return [
    simpleSymmetricHotellingCase(),
    nonSymmetricNoHalfCollapseCase(),
    twoStageReactionFunctionCase(),
    parameterConditionInsufficientCase(),
    boundarySolutionCase(),
    socStationaryNotMaximumCase(),
    multiDecisionHessianCase(),
    mechanismRichImplicitCase(),
  ];
}

export async function evaluateEquilibriumBenchmarkCase(
  benchmark: EquilibriumBenchmarkCase
): Promise<EquilibriumBenchmarkEvaluation> {
  const coverage = evaluateEquilibriumCoverage({
    model: benchmark.model,
    equilibrium: benchmark.equilibrium,
  });
  const optimality = await evaluateEquilibriumOptimality({
    compiledSystem: {
      variables: benchmark.model.timing.flatMap((stage) => stage.decisions),
      modelDecisionVariables: benchmark.model.timing.flatMap(
        (stage) => stage.decisions
      ),
      parameters: benchmark.model.symbols
        .filter((symbol) => symbol.role !== "decision")
        .map((symbol) => symbol.codeName),
      objectives: benchmark.model.profitFunctions.flatMap((profit) =>
        benchmark.model.timing
          .flatMap((stage) => stage.decisions)
          .filter((variable) =>
            profit.platform
              ? platformMatchesVariable(profit.platform, variable)
              : true
          )
          .map((variable) => ({
            profitFunctionId: profit.id,
            platform: profit.platform,
            expression: extractRightHandExpression(profit.expression),
            variable,
          }))
      ),
      assumptions: benchmark.model.assumptions,
      issues: [],
    },
    substitutions: benchmark.substitutions,
    equilibrium: benchmark.equilibrium,
    idPrefix: `benchmark-${benchmark.id}`,
    now: 1710000000000,
  });
  const optimalityArtifacts = Object.fromEntries(
    optimality.artifacts.map((artifact) => [artifact.kind, artifact])
  ) as Partial<Record<ResearchMathArtifact["kind"], ResearchMathArtifact>>;
  const detectedForbiddenShortcuts = detectForbiddenShortcuts({
    benchmark,
    coverage,
    optimalityArtifacts,
  });
  const canPromote =
    coverage.status === "passed" &&
    optimality.ok &&
    benchmark.equilibrium.status === "solved" &&
    detectedForbiddenShortcuts.length === 0;

  return {
    id: benchmark.id,
    coverage,
    optimalityArtifacts,
    promotion: classifyPromotion({
      equilibrium: benchmark.equilibrium,
      canPromote,
      optimalityArtifacts,
    }),
    canPromote,
    detectedForbiddenShortcuts,
  };
}

function classifyPromotion({
  equilibrium,
  canPromote,
  optimalityArtifacts,
}: {
  equilibrium: EquilibriumResult;
  canPromote: boolean;
  optimalityArtifacts: Partial<Record<ResearchMathArtifact["kind"], ResearchMathArtifact>>;
}): EquilibriumBenchmarkPromotion {
  if (canPromote) return "promote";
  if (equilibrium.status !== "solved") return "draft_only";
  if (
    Object.values(optimalityArtifacts).some(
      (artifact) => artifact?.status === "failed"
    )
  ) {
    return "repair_candidate";
  }
  return "manual_review";
}

function detectForbiddenShortcuts({
  benchmark,
  coverage,
  optimalityArtifacts,
}: {
  benchmark: EquilibriumBenchmarkCase;
  coverage: ReturnType<typeof evaluateEquilibriumCoverage>;
  optimalityArtifacts: Partial<Record<ResearchMathArtifact["kind"], ResearchMathArtifact>>;
}) {
  const shortcuts: EquilibriumBenchmarkForbiddenShortcut[] = [];
  const text = getEquilibriumText(benchmark.equilibrium);

  if (
    benchmark.category !== "simple_symmetric_hotelling" &&
    /1\s*\/\s*2|\\frac\{1\}\{2\}/.test(text)
  ) {
    shortcuts.push("default_symmetric_half_solution");
  }
  if (
    benchmark.equilibrium.status === "solved" &&
    !/second.?order|Hessian|concav|KKT|boundary|二阶|凹|边界/i.test(text)
  ) {
    shortcuts.push("foc_only_promotion");
  }
  if (optimalityArtifacts.boundary_kkt_check?.status === "condition_insufficient") {
    shortcuts.push("interior_foc_for_boundary");
  }
  if (coverage.omittedHighValueMechanisms.length > 0) {
    shortcuts.push("omitted_high_value_mechanism");
  }

  return [...new Set(shortcuts)].sort();
}

function simpleSymmetricHotellingCase(): EquilibriumBenchmarkCase {
  return {
    id: "simple-symmetric-hotelling",
    title: "Simple symmetric one-dimensional Hotelling case",
    category: "simple_symmetric_hotelling",
    model: createBaseModel({
      symbols: [
        decisionSymbol("tau-a", "tau_A", "platform A commission", "tau_A >= 0"),
        parameterSymbol("alpha-b", "alpha_B", "buyer network effect", "alpha_B > 0"),
      ],
      decisions: ["tau_A"],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "alpha_B*tau_A - tau_A^2",
          notes: "Simple concave reduced-form profit.",
        },
      ],
      assumptions: ["alpha_B > 0"],
    }),
    equilibrium: solvedEquilibrium({
      closedForm: "tau_A^* = alpha_B/2",
      focs: ["alpha_B - 2*tau_A = 0"],
      conditions: ["alpha_B > 0", "second-order condition: -2 < 0"],
      derivation: "FOC and second-order condition prove a local maximum.",
    }),
    substitutions: { tau_A: "alpha_B/2" },
    expected: {
      allowedStatuses: ["solved"],
      coverageStatus: "passed",
      optimalityStatuses: {
        second_order_conditions: "passed",
        hessian_check: "passed",
        boundary_kkt_check: "passed",
      },
      promotion: "promote",
      detectedForbiddenShortcuts: [],
    },
    notes: "A deliberately simple passing benchmark.",
  };
}

function nonSymmetricNoHalfCollapseCase(): EquilibriumBenchmarkCase {
  return {
    id: "non-symmetric-no-half-collapse",
    title: "Non-symmetric Hotelling case must not collapse to one-half",
    category: "non_symmetric_no_half_collapse",
    model: createBaseModel({
      symbols: [
        decisionSymbol("tau-a", "tau_A", "platform A commission", "tau_A >= 0"),
        parameterSymbol("alpha-a", "alpha_A", "A-side network effect", "alpha_A > 0"),
        parameterSymbol("alpha-b", "alpha_B", "B-side network effect", "alpha_B > 0"),
      ],
      decisions: ["tau_A"],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "alpha_A*tau_A - tau_A^2",
          notes: "Asymmetric objective depends on alpha_A.",
        },
      ],
      assumptions: ["alpha_A > 0", "alpha_B > 0", "alpha_A != alpha_B"],
      modelSetupDraft: "A non-symmetric model with alpha_A != alpha_B.",
    }),
    equilibrium: solvedEquilibrium({
      closedForm: "n_A^{B*}=1/2; tau_A^*=alpha_B/2",
      focs: ["alpha_A - 2*tau_A = 0"],
      conditions: ["alpha_A != alpha_B", "second-order condition: -2 < 0"],
      derivation: "The candidate collapses demand to the symmetric one-half core.",
    }),
    substitutions: { tau_A: "alpha_B/2" },
    expected: {
      allowedStatuses: ["solved"],
      coverageStatus: "passed",
      optimalityStatuses: {
        second_order_conditions: "passed",
        hessian_check: "passed",
      },
      promotion: "manual_review",
      detectedForbiddenShortcuts: ["default_symmetric_half_solution"],
    },
    notes: "This should be blocked by the benchmark shortcut detector.",
  };
}

function twoStageReactionFunctionCase(): EquilibriumBenchmarkCase {
  return {
    id: "two-stage-reaction-function",
    title: "Two-stage platform model with reaction functions",
    category: "two_stage_reaction_function",
    model: createBaseModel({
      symbols: [
        decisionSymbol("tau-a", "tau_A", "platform A commission", "tau_A >= 0"),
        decisionSymbol("tau-b", "tau_B", "platform B commission", "tau_B >= 0"),
        parameterSymbol("alpha", "alpha_B", "buyer network effect", "alpha_B > 0"),
        parameterSymbol("beta", "beta", "strategic interaction", "0 < beta < 2"),
      ],
      platforms: ["A", "B"],
      decisions: ["tau_A", "tau_B"],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "alpha_B*tau_A - tau_A^2 + beta*tau_A*tau_B",
          notes: "Platform A reaction function.",
        },
        {
          id: "profit-b",
          platform: "B",
          expression: "alpha_B*tau_B - tau_B^2 + beta*tau_A*tau_B",
          notes: "Platform B reaction function.",
        },
      ],
      assumptions: ["alpha_B > 0", "0 < beta < 2"],
    }),
    equilibrium: solvedEquilibrium({
      closedForm: "tau_A^*=alpha_B/(2-beta); tau_B^*=alpha_B/(2-beta)",
      focs: [
        "alpha_B - 2*tau_A + beta*tau_B = 0",
        "alpha_B - 2*tau_B + beta*tau_A = 0",
      ],
      conditions: ["alpha_B > 0", "0 < beta < 2", "second-order condition: -2 < 0"],
      derivation: "Reaction functions are solved jointly; each own objective is concave.",
    }),
    substitutions: {
      tau_A: "alpha_B/(2-beta)",
      tau_B: "alpha_B/(2-beta)",
    },
    expected: {
      allowedStatuses: ["solved"],
      coverageStatus: "passed",
      optimalityStatuses: {
        second_order_conditions: "passed",
        hessian_check: "passed",
      },
      promotion: "promote",
      detectedForbiddenShortcuts: [],
    },
    notes: "Allows strategic interaction across players without requiring global Hessian.",
  };
}

function parameterConditionInsufficientCase(): EquilibriumBenchmarkCase {
  return {
    id: "parameter-condition-insufficient",
    title: "Parameter-condition case with insufficient SOC sign",
    category: "parameter_condition_insufficient",
    model: createBaseModel({
      symbols: [
        decisionSymbol("tau-a", "tau_A", "platform A commission", "tau_A >= 0"),
        parameterSymbol("gamma", "gamma", "curvature parameter", ""),
      ],
      decisions: ["tau_A"],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "gamma*tau_A^2 + tau_A",
          notes: "Curvature sign depends on gamma.",
        },
      ],
      assumptions: [],
    }),
    equilibrium: solvedEquilibrium({
      closedForm: "tau_A^* = -1/(2*gamma)",
      focs: ["2*gamma*tau_A + 1 = 0"],
      conditions: ["gamma != 0"],
      derivation: "FOC gives a stationary point, but the sign of gamma is missing.",
    }),
    substitutions: { tau_A: "-1/(2*gamma)" },
    expected: {
      allowedStatuses: ["solved"],
      coverageStatus: "passed",
      optimalityStatuses: {
        second_order_conditions: "manual_review",
        hessian_check: "manual_review",
      },
      promotion: "manual_review",
      detectedForbiddenShortcuts: ["foc_only_promotion"],
    },
    notes: "The system must ask for curvature/existence conditions.",
  };
}

function boundarySolutionCase(): EquilibriumBenchmarkCase {
  return {
    id: "boundary-solution",
    title: "Boundary solution requires KKT or boundary-region analysis",
    category: "boundary_solution",
    model: createBaseModel({
      symbols: [
        decisionSymbol("s-a", "s_A", "platform A subsidy", "s_A >= 0"),
      ],
      decisions: ["s_A"],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "-s_A^2",
          notes: "Concave objective with boundary candidate.",
        },
      ],
      assumptions: ["s_A >= 0"],
    }),
    equilibrium: solvedEquilibrium({
      closedForm: "s_A^* = 0",
      focs: ["-2*s_A = 0"],
      conditions: ["s_A >= 0", "interior FOC"],
      derivation: "FOC gives s_A = 0.",
    }),
    substitutions: { s_A: "0" },
    expected: {
      allowedStatuses: ["solved"],
      coverageStatus: "passed",
      optimalityStatuses: {
        second_order_conditions: "passed",
        boundary_kkt_check: "condition_insufficient",
      },
      promotion: "manual_review",
      detectedForbiddenShortcuts: [
        "foc_only_promotion",
        "interior_foc_for_boundary",
      ],
    },
    notes: "FOC-only boundary solutions are not proof.",
  };
}

function socStationaryNotMaximumCase(): EquilibriumBenchmarkCase {
  return {
    id: "soc-stationary-not-maximum",
    title: "FOC-only stationary point with positive second derivative",
    category: "soc_stationary_not_maximum",
    model: createBaseModel({
      symbols: [
        decisionSymbol("tau-a", "tau_A", "platform A commission", ""),
      ],
      decisions: ["tau_A"],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression: "tau_A^2",
          notes: "Convex objective.",
        },
      ],
      assumptions: [],
    }),
    equilibrium: solvedEquilibrium({
      closedForm: "tau_A^* = 0",
      focs: ["2*tau_A = 0"],
      conditions: ["second-order condition claimed"],
      derivation: "FOC gives tau_A = 0, but this is a minimum.",
    }),
    substitutions: { tau_A: "0" },
    expected: {
      allowedStatuses: ["solved"],
      coverageStatus: "passed",
      optimalityStatuses: {
        second_order_conditions: "failed",
        concavity_check: "failed",
      },
      promotion: "repair_candidate",
      detectedForbiddenShortcuts: [],
    },
    notes: "The benchmark catches stationary points that are minima.",
  };
}

function multiDecisionHessianCase(): EquilibriumBenchmarkCase {
  return {
    id: "multi-decision-hessian",
    title: "One player with multiple decisions requires Hessian review",
    category: "multi_decision_hessian",
    model: createBaseModel({
      symbols: [
        decisionSymbol("tau-a", "tau_A", "platform A commission", "tau_A >= 0"),
        decisionSymbol("s-a", "s_A", "platform A subsidy", "s_A >= 0"),
        parameterSymbol("alpha", "alpha_B", "buyer network effect", "alpha_B > 0"),
      ],
      decisions: ["tau_A", "s_A"],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression:
            "alpha_B*tau_A + alpha_B*s_A - tau_A^2 - s_A^2 + 5*tau_A*s_A",
          notes: "Cross term makes Hessian review necessary.",
        },
      ],
      assumptions: ["alpha_B > 0"],
    }),
    equilibrium: solvedEquilibrium({
      closedForm: "tau_A^*=alpha_B/2; s_A^*=alpha_B/2",
      focs: ["alpha_B - 2*tau_A + 5*s_A = 0"],
      conditions: ["alpha_B > 0", "second-order condition claimed"],
      derivation: "Candidate checks own second derivatives but not the Hessian.",
    }),
    substitutions: { tau_A: "alpha_B/2", s_A: "alpha_B/2" },
    expected: {
      allowedStatuses: ["solved"],
      coverageStatus: "passed",
      optimalityStatuses: {
        hessian_check: "manual_review",
      },
      promotion: "manual_review",
      detectedForbiddenShortcuts: [],
    },
    notes: "Same-player multi-decision problems need Hessian or concavity proof.",
  };
}

function mechanismRichImplicitCase(): EquilibriumBenchmarkCase {
  return {
    id: "mechanism-rich-implicit",
    title: "Mechanism-rich model may remain implicit but must not simplify",
    category: "mechanism_rich_implicit",
    model: createBaseModel({
      symbols: [
        decisionSymbol("tau-a", "tau_A", "platform A commission", "tau_A >= 0"),
        decisionSymbol("q-a", "q_A", "quality investment", "q_A >= 0"),
        decisionSymbol("r-a", "r_A", "recommendation strength", "0 <= r_A <= 1"),
        parameterSymbol("theta", "theta", "quality sensitivity", "theta > 0"),
      ],
      decisions: ["tau_A", "q_A", "r_A"],
      profitFunctions: [
        {
          id: "profit-a",
          platform: "A",
          expression:
            "tau_A*(theta*q_A + r_A) - q_A^2 - r_A^2",
          notes: "Mechanism-rich objective.",
        },
      ],
      assumptions: ["tau_A >= 0", "q_A >= 0", "0 <= r_A <= 1", "theta > 0"],
      modelSetupDraft: "Quality and recommendation are strategic mechanisms.",
    }),
    equilibrium: {
      ...solvedEquilibrium({
        closedForm: "",
        focs: [
          "theta*q_A + r_A = 0",
          "theta*tau_A - 2*q_A = 0",
          "tau_A - 2*r_A = 0",
        ],
        conditions: ["theta > 0"],
        derivation:
          "The system keeps tau_A, q_A and r_A as an implicit system for manual review.",
      }),
      status: "implicit_system",
      solverScratchpad: {
        status: "implicit_system",
        implicitSystem: [
          "theta*q_A + r_A = 0",
          "theta*tau_A - 2*q_A = 0",
          "tau_A - 2*r_A = 0",
        ],
        attemptedSteps: ["Derived FOCs without collapsing mechanisms."],
      },
    },
    substitutions: {},
    expected: {
      allowedStatuses: ["implicit_system"],
      coverageStatus: "passed",
      optimalityStatuses: {
        second_order_conditions: "manual_review",
      },
      promotion: "draft_only",
      detectedForbiddenShortcuts: [],
    },
    notes: "Implicit/manual review is acceptable when mechanisms are preserved.",
  };
}

function createBaseModel({
  symbols,
  decisions,
  profitFunctions,
  platforms = ["A"],
  assumptions = [],
  modelSetupDraft = "Benchmark model.",
}: {
  symbols: HotellingModel["symbols"];
  decisions: string[];
  profitFunctions: HotellingModel["profitFunctions"];
  platforms?: string[];
  assumptions?: string[];
  modelSetupDraft?: string;
}): HotellingModel {
  return {
    symbols,
    sides: {
      consumerSideName: "buyers",
      merchantSideName: "sellers",
    },
    platforms,
    timing: [
      {
        id: "strategic-choice",
        order: 1,
        name: "Strategic choices",
        decisions,
      },
    ],
    utilityFunctions: [],
    demandDerivation: "Benchmark reduced-form demand.",
    profitFunctions,
    assumptions,
    modelSetupDraft,
  };
}

function solvedEquilibrium({
  closedForm,
  focs,
  conditions,
  derivation,
}: {
  closedForm: string;
  focs: string[];
  conditions: string[];
  derivation: string;
}): EquilibriumResult {
  return {
    status: "solved",
    concept: "Benchmark equilibrium candidate",
    solvingSteps: ["Write profit functions.", "Take FOCs.", "Review optimality."],
    focs,
    conditions,
    closedForm,
    derivation,
    code: "benchmark",
    warnings: [],
  };
}

function decisionSymbol(
  id: string,
  codeName: string,
  name: string,
  assumption: string
): HotellingModel["symbols"][number] {
  return {
    id,
    symbol: codeName,
    baseSymbol: codeName.split("_")[0] ?? codeName,
    subscript: codeName.split("_")[1],
    codeName,
    name,
    meaning: name,
    role: "decision",
    side: "platform",
    assumption,
    recommended: true,
  };
}

function parameterSymbol(
  id: string,
  codeName: string,
  name: string,
  assumption: string
): HotellingModel["symbols"][number] {
  return {
    id,
    symbol: codeName,
    baseSymbol: codeName,
    codeName,
    name,
    meaning: name,
    role: "parameter",
    side: "global",
    assumption,
    recommended: true,
  };
}

function extractRightHandExpression(expression: string) {
  const parts = expression.split("=").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? expression;
}

function platformMatchesVariable(platform: string, variable: string) {
  const platformToken = platform.match(/[A-Za-z]$/)?.[0]?.toUpperCase();
  if (!platformToken) return true;
  return new RegExp(`_${platformToken}$`, "i").test(variable);
}

function getEquilibriumText(equilibrium: EquilibriumResult) {
  return [
    equilibrium.concept,
    ...equilibrium.solvingSteps,
    ...equilibrium.focs,
    ...equilibrium.conditions,
    equilibrium.closedForm,
    equilibrium.derivation,
    ...equilibrium.warnings,
    ...(equilibrium.solverScratchpad?.implicitSystem ?? []),
    ...(equilibrium.solverScratchpad?.reactionFunctions ?? []),
    ...(equilibrium.solverScratchpad?.attemptedSteps ?? []),
  ].join("\n");
}
