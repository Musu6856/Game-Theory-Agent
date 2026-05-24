import type {
  BackgroundStory,
  EquilibriumResult,
  HotellingModel,
} from "./types";
import { createHotellingSymbolSeed } from "./symbol-governance.ts";

export function createEmptyBackground(): BackgroundStory {
  return {
    scenario: "",
    puzzle: "",
    strategicInteraction: "",
    hotellingRationale: "",
    mechanismIntuition: "",
    contributionCandidates: [],
    draft: "",
  };
}

export function createDefaultHotellingModel(): HotellingModel {
  return {
    symbols: createHotellingSymbolSeed(),
    sides: {
      consumerSideName: "消费者",
      merchantSideName: "商家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: crypto.randomUUID(),
        order: 1,
        name: "非价格决策",
        decisions: [],
      },
      {
        id: crypto.randomUUID(),
        order: 2,
        name: "价格或补贴决策",
        decisions: [],
      },
      {
        id: crypto.randomUUID(),
        order: 3,
        name: "用户选择",
        decisions: [],
      },
    ],
    utilityFunctions: [],
    demandDerivation: "",
    profitFunctions: [],
    assumptions: [],
    modelSetupDraft: "",
  };
}

export function createIdleEquilibrium(): EquilibriumResult {
  return {
    status: "idle",
    concept: "子博弈精炼均衡",
    solvingSteps: [],
    focs: [],
    conditions: [],
    closedForm: "",
    derivation: "",
    code: "",
    warnings: [],
  };
}
