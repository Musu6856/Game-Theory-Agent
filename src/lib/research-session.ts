import type {
  EquilibriumResult,
  HotellingModel,
  ModelSourceMetadata,
  ModelSourceProvider,
  ModelSourceSettings,
  PropertyAnalysis,
  ResearchDirection,
  ResearchProject,
  ResearchSession,
  ResearchSessionMessage,
  SymbolDefinition,
  UtilityFunction,
} from "./types";
import {
  createHotellingSymbolSeed,
  createSymbolDraft,
  mergeSymbolRegistries,
  normalizeSymbolRegistry,
} from "./symbol-governance.ts";

const DEFAULT_ID = "secondhand-commission-subsidy-hotelling";
const SELLER_MULTIHOMING_ID = "seller-multihoming-pricing";
const COMPATIBLE_PROVIDERS = new Set<ModelSourceProvider>([
  "openai-compatible",
]);

export function createInitialResearchSession(rawIdea: string): ResearchSession {
  const trimmedIdea = rawIdea.trim();
  const directionCards = createDirectionCards();

  return {
    phase: "direction",
    directions: directionCards,
    messages: [
      {
        id: "msg-user-initial",
        role: "user",
        content: trimmedIdea,
        createdAt: 0,
      },
      {
        id: "msg-assistant-directions",
        role: "assistant",
        content:
          "我先把研究想法整理成 4 个可推进方向。每个方向都保留可建模的经济机制，你可以先选择一个最想发展的方向。",
        createdAt: 0,
      },
    ],
    assetSummary: {
      confirmedAssumptions: [],
      utilityFunctions: [],
      equilibriumStatus: "not_started",
      nextActions: ["选择一个研究方向"],
      pendingDecision: {
        kind: "choose_direction",
        prompt: "请选择一个研究方向，之后我们会一起细化模型设定。",
      },
    },
  };
}

export function createExplorationProject({
  id = createProjectId(),
  rawIdea,
  now = Date.now(),
  modelSource,
}: {
  id?: string;
  rawIdea: string;
  now?: number;
  modelSource?: Partial<ModelSourceSettings>;
}): ResearchProject {
  const normalizedIdea = rawIdea.trim();
  return {
    id,
    createdAt: now,
    rawIdea: normalizedIdea,
    refinedIdea: normalizedIdea,
    projectType: "exploration",
    model: null,
    wizardCompleted: true,
    sections: [],
    references: [],
    researchSession: createInitialResearchSession(normalizedIdea),
    modelSource: normalizeProjectModelSource(modelSource),
  };
}

export function adoptResearchDirection(
  project: ResearchProject,
  directionId: string
): ResearchProject {
  const session = project.researchSession ?? createInitialResearchSession(project.rawIdea);
  const direction = session.directions.find((card) => card.id === directionId);

  if (!direction) {
    throw new Error("Unknown research direction.");
  }

  const model = createFallbackModelForDirection(direction);
  const equilibriumResult = createModelAwareEquilibriumScaffoldResult(
    model,
    direction
  );
  const messages: ResearchSessionMessage[] = [
    ...session.messages,
    {
      id: `msg-adopt-${direction.id}`,
      role: "user",
      content: `选择方向：${direction.title}。`,
      createdAt: 0,
    },
    {
      id: `msg-model-question-${direction.id}`,
      role: "assistant",
      content:
        `我们先采用${direction.title}这个方向。下一步需要先把模型设定、关键变量和机制口径确认清楚，再继续推进。`,
      createdAt: 0,
    },
  ];

  return {
    ...project,
    projectType: "formal",
    refinedIdea: direction.title,
    researchSession: {
      ...session,
      phase: "model",
      messages,
      assetSummary: {
        currentDirection: direction,
        confirmedAssumptions: model.assumptions,
        utilityFunctions: model.utilityFunctions.map(
          (entry) => `$${entry.expression}$`
        ),
        equilibriumStatus: "等待模型确认",
        nextActions: [
          "确认佣金和补贴的策略变量",
          "检查买卖双方效用函数",
          "整理符号化一阶条件",
        ],
        pendingDecision: {
          kind: "answer_model_question",
          prompt: "请确认佣金、补贴和买卖双方差异化成本的基本设定。",
        },
      },
    },
    hotellingModel: model,
    equilibriumResult,
  };
}

export function confirmResearchModel(project: ResearchProject): ResearchProject {
  const session = project.researchSession ?? createInitialResearchSession(project.rawIdea);

  if (!project.hotellingModel) {
    throw new Error("A research model must exist before confirmation.");
  }

  const messages: ResearchSessionMessage[] = [
    ...session.messages,
    {
      id: `msg-confirm-model-${Date.now()}`,
      role: "user",
      content: "确认当前模型设定，准备进入均衡求解。",
      createdAt: 0,
    },
    {
      id: `msg-ready-to-solve-${Date.now()}`,
      role: "assistant",
      content:
        "模型设定已经确认，我已经把工作台切到均衡页。下一步不会自动跳到性质分析；请先检查需求份额、一阶条件和约束是否与你的论文设定一致，然后点击“开始符号求解”。这一步将生成符号推导过程、闭式均衡表达或符号爆炸说明，以及可复用的 SymPy 求解代码。",
      createdAt: 0,
    },
  ];

  return {
    ...project,
    researchSession: {
      ...session,
      phase: "equilibrium",
      messages,
      assetSummary: {
        ...session.assetSummary,
        equilibriumStatus: "等待开始求解",
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt:
            "模型已确认。请检查需求份额、一阶条件和约束是否符合你的论文设定；确认后点击开始符号求解。",
        },
        nextActions: [
          "确认需求份额和一阶条件",
          "点击开始符号求解后进入均衡求解阶段",
          "解析解完成后再进入性质分析",
        ],
      },
    },
  };
}

export function generateSymbolicEquilibrium(
  project: ResearchProject
): ResearchProject {
  const session =
    project.researchSession ?? createInitialResearchSession(project.rawIdea);

  if (!project.hotellingModel) {
    throw new Error("A confirmed Hotelling model is required before solving.");
  }

  const messages: ResearchSessionMessage[] = [
    ...session.messages,
    {
      id: `msg-start-equilibrium-${Date.now()}`,
      role: "user",
      content: "开始符号均衡求解。",
      createdAt: 0,
    },
    {
      id: `msg-equilibrium-solved-${Date.now()}`,
      role: "assistant",
      content:
        "我先给出一版可写入论文推导的符号均衡资产：从两侧无差异条件得到需求份额，再把需求代入平台利润函数，并在对称内部候选均衡下联立一阶条件得到佣金与补贴的闭式解。右侧会停在均衡页，方便先检查闭式解、一阶条件和存在条件；确认可用后再进入性质分析。若后续模型加入非对称平台或更多状态变量，应继续做一般符号求解，而不是改用数值模拟。",
      createdAt: 0,
    },
  ];

  return applySymbolicEquilibriumResult(project, session, messages);
}

export function generatePropertyAnalysis(project: ResearchProject): ResearchProject {
  const session =
    project.researchSession ?? createInitialResearchSession(project.rawIdea);

  if (
    !project.equilibriumResult ||
    project.equilibriumResult.status !== "solved"
  ) {
    throw new Error(
      "A solved closed-form symbolic equilibrium asset is required before analysis."
    );
  }

  const analyses = createPropertyAnalysesForDirection(
    getActiveDirection(session),
    project.equilibriumResult
  );
  const messages: ResearchSessionMessage[] = [
    ...session.messages,
    {
      id: `msg-start-analysis-${Date.now()}`,
      role: "user",
      content: "生成性质分析。",
      createdAt: 0,
    },
    {
      id: `msg-analysis-ready-${Date.now()}`,
      role: "assistant",
      content:
        "我基于对称内部闭式解整理了一组性质分析：直接对佣金、补贴和内部解条件做符号求导与阈值整理。这里仍然只使用符号求导、相减和符号条件，不用数值代入替代理论分析。",
      createdAt: 0,
    },
  ];

  return {
    ...project,
    propertyAnalyses: analyses,
    researchSession: {
      ...session,
      phase: "analysis",
      messages,
      assetSummary: {
        ...session.assetSummary,
        equilibriumStatus: project.equilibriumResult.status,
        pendingDecision: undefined,
        nextActions: [
          "整理命题与证明草稿",
          "检查符号条件是否符合论文假设",
          "必要时回到模型设定收窄变量",
        ],
      },
    },
  };
}

function applySymbolicEquilibriumResult(
  project: ResearchProject,
  session: ResearchSession,
  messages: ResearchSessionMessage[]
): ResearchProject {
  const direction = getActiveDirection(session);
  const equilibriumResult = createEquilibriumFallbackForProject(project, direction);
  const hasSolvedEquilibrium = equilibriumResult.status === "solved";

  return {
    ...project,
    equilibriumResult,
    researchSession: {
      ...session,
      phase: "equilibrium",
      messages,
      assetSummary: {
        ...session.assetSummary,
        equilibriumStatus: equilibriumResult.status,
        pendingDecision: hasSolvedEquilibrium ? {
          kind: "analyze_properties",
          prompt:
            "符号均衡资产已经生成。下一步可以对佣金、补贴、网络效应和差异化成本做符号性质分析。",
        } : {
          kind: "solve_equilibrium",
          prompt:
            "当前只生成了与模型绑定的符号条件草稿，尚未得到可用的闭式均衡解。请修正模型或重新生成符号均衡。",
        },
        nextActions: hasSolvedEquilibrium ? [
          "检查符号均衡推导",
          "复制并运行 SymPy 求解代码",
          "基于解析对象生成性质分析",
          "生成性质分析",
        ] : [
          "检查当前模型的策略变量",
          "补全需求函数与利润函数",
          "重新生成符号均衡",
        ],
      },
    },
  };
}

export function normalizeResearchProjectForWorkspace(
  project: ResearchProject
): ResearchProject {
  const workspaceProject = normalizeProjectSymbols(project);
  const session = workspaceProject.researchSession;

  if (
    session?.phase === "equilibrium" &&
    session.assetSummary.equilibriumStatus === "待推导解析解" &&
    workspaceProject.equilibriumResult?.status === "needs_revision" &&
    !workspaceProject.equilibriumResult.closedForm
  ) {
    return {
      ...workspaceProject,
      researchSession: {
        ...session,
        phase: "model",
        assetSummary: {
          ...session.assetSummary,
          equilibriumStatus: "等待开始求解",
          nextActions: [
            "确认需求份额和一阶条件",
            "点击开始符号求解后进入均衡求解阶段",
            "解析解完成后再进入性质分析",
          ],
          pendingDecision: {
            kind: "solve_equilibrium",
            prompt:
              "模型已确认。请检查需求份额、一阶条件和约束是否符合你的论文设定；确认后点击开始符号求解。",
          },
        },
      },
    };
  }

  if (
    session &&
    workspaceProject.equilibriumResult?.status === "symbolic_failure" &&
    (session.phase !== "equilibrium" ||
      session.assetSummary.pendingDecision?.kind === "analyze_properties")
  ) {
    return {
      ...workspaceProject,
      researchSession: {
        ...session,
        phase: "equilibrium",
        assetSummary: {
          ...session.assetSummary,
          equilibriumStatus: "symbolic_failure",
          pendingDecision: {
            kind: "solve_equilibrium",
            prompt:
              "当前均衡草稿还没有闭式解，不能进入性质分析。请修正模型或重新生成符号均衡。",
          },
          nextActions: [
            "检查当前一阶条件草稿",
            "补全需求份额、利润函数或闭式求解步骤",
            "重新生成符号均衡",
          ],
        },
      },
    };
  }

  return workspaceProject;
}

function normalizeProjectSymbols(project: ResearchProject): ResearchProject {
  if (!project.hotellingModel) return project;

  return {
    ...project,
    hotellingModel: {
      ...project.hotellingModel,
      symbols: normalizeSymbolRegistry(project.hotellingModel.symbols),
    },
  };
}

function createDirectionCards(): ResearchDirection[] {
  return [
    {
      id: DEFAULT_ID,
      title: "二手平台佣金与补贴策略",
      summary:
        "研究两个二手交易平台如何同时选择卖家佣金和买家补贴，并通过双边网络效应影响成交规模。",
      model: "两边 Hotelling 平台竞争模型",
      contribution:
        "刻画佣金收入、补贴成本和跨边网络效应之间的权衡，解释平台何时偏向补贴买家或降低卖家佣金。",
      recommended: true,
    },
    {
      id: "quality-disclosure-trust",
      title: "商品质量披露与信任机制",
      summary:
        "研究平台验货、担保和信息披露如何缓解二手商品质量不确定性，并改变买卖双方参与决策。",
      model: "信号博弈与平台筛选模型",
      contribution:
        "比较强披露和弱披露机制下的交易量、平台利润与低质量商品进入门槛。",
      recommended: false,
    },
    {
      id: "seller-multihoming-pricing",
      title: "卖家多归属与平台定价",
      summary:
        "研究卖家是否同时入驻多个平台时，平台佣金、流量分配和买家匹配效率的变化。",
      model: "双边平台多归属竞争模型",
      contribution:
        "说明多归属如何削弱平台锁定能力，并影响平台对卖家侧和买家侧的收费结构。",
      recommended: false,
    },
    {
      id: "green-reuse-policy",
      title: "绿色再流通政策与平台激励",
      summary:
        "研究补贴、认证和低碳标签如何提升二手交易参与度，并影响平台对环保属性的策略选择。",
      model: "政策激励下的平台竞争模型",
      contribution:
        "连接循环经济政策与平台商业模式，分析公共补贴和平台补贴之间的替代或互补关系。",
      recommended: false,
    },
  ];
}

function getActiveDirection(
  session: ResearchSession
): ResearchDirection | undefined {
  return session.assetSummary.currentDirection;
}

function isSellerMultihomingDirection(direction?: ResearchDirection): boolean {
  return direction?.id === SELLER_MULTIHOMING_ID;
}

export function createResearchSymbolRegistryForDirection(
  direction?: ResearchDirection
): SymbolDefinition[] {
  const coreSymbols = createHotellingSymbolSeed();

  if (isSellerMultihomingDirection(direction)) {
    return mergeSymbolRegistries(coreSymbols, createSellerMultihomingSymbols());
  }

  if (direction && direction.id !== DEFAULT_ID) {
    return mergeSymbolRegistries(
      coreSymbols,
      createGenericDirectionSpecificSymbols(direction)
    );
  }

  return coreSymbols;
}

function createSellerMultihomingSymbols(): SymbolDefinition[] {
  return [
    createSymbolDraft({
      symbol: "p_A",
      baseSymbol: "p",
      subscript: "A",
      codeName: "p_A",
      name: "A-side price",
      meaning: "Buyer-side generalized price or payment on platform A.",
      role: "parameter",
      side: "platform",
      assumption: "positive",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: "p_B",
      baseSymbol: "p",
      subscript: "B",
      codeName: "p_B",
      name: "B-side price",
      meaning: "Buyer-side generalized price or payment on platform B.",
      role: "parameter",
      side: "platform",
      assumption: "positive",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: "m_A",
      baseSymbol: "m",
      subscript: "A",
      codeName: "m_A",
      name: "A-only seller mass",
      meaning: "Mass of sellers who join only platform A.",
      role: "demand",
      side: "merchant",
      assumption: "in_[0,1]",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: "m_B",
      baseSymbol: "m",
      subscript: "B",
      codeName: "m_B",
      name: "只入驻 B 的卖家规模",
      meaning: "只入驻平台 B 的卖家质量或规模。",
      role: "demand",
      side: "merchant",
      assumption: "in_[0,1]",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: "m_{AB}",
      baseSymbol: "m",
      subscript: "AB",
      codeName: "m_AB",
      name: "多归属卖家规模",
      meaning: "同时入驻平台 A 和平台 B 的卖家规模。",
      role: "demand",
      side: "merchant",
      assumption: "in_[0,1]",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: "m_i",
      baseSymbol: "m",
      subscript: "i",
      codeName: "m_i",
      name: "平台可见卖家规模",
      meaning: "平台 i 上可见的卖家规模，包括多归属卖家。",
      role: "derived",
      side: "merchant",
      assumption: "nonnegative",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: "\\kappa",
      baseSymbol: "kappa",
      codeName: "kappa",
      name: "卖家多归属成本",
      meaning: "卖家同时维持两个平台入驻时支付的固定成本。",
      role: "cost",
      side: "merchant",
      assumption: "nonnegative",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: "\\rho",
      baseSymbol: "rho",
      codeName: "rho",
      name: "共享卖家可见性效应",
      meaning: "同时出现在两个平台上的卖家给买家侧带来的额外价值。",
      role: "parameter",
      side: "consumer",
      assumption: "real",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "C_A",
      baseSymbol: "C",
      subscript: "A",
      codeName: "C_A",
      name: "平台 A 治理成本",
      meaning: "平台 A 入驻、治理或服务卖家产生的符号化成本。",
      role: "cost",
      side: "platform",
      assumption: "nonnegative",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "C_B",
      baseSymbol: "C",
      subscript: "B",
      codeName: "C_B",
      name: "平台 B 治理成本",
      meaning: "平台 B 入驻、治理或服务卖家产生的符号化成本。",
      role: "cost",
      side: "platform",
      assumption: "nonnegative",
      recommended: false,
    }),
  ];
}

function createGenericDirectionSpecificSymbols(
  direction: ResearchDirection
): SymbolDefinition[] {
  const safeDirectionId = direction.id.replace(/[^A-Za-z0-9_]/g, "_");

  return [
    createSymbolDraft({
      symbol: `\\mu_{${safeDirectionId}}`,
      baseSymbol: "mu",
      subscript: safeDirectionId,
      codeName: `mu_${safeDirectionId}`,
      name: "机制状态",
      meaning: `${direction.title} 的符号机制状态变量。`,
      role: "parameter",
      side: "global",
      assumption: "real",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: `a_{${safeDirectionId}}`,
      baseSymbol: "a",
      subscript: safeDirectionId,
      codeName: `a_${safeDirectionId}`,
      name: "机制努力",
      meaning: `${direction.title} 中由平台选择的机制努力或机制强度变量。`,
      role: "decision",
      side: "platform",
      assumption: "real",
      recommended: true,
    }),
    createSymbolDraft({
      symbol: "p_A",
      baseSymbol: "p",
      subscript: "A",
      codeName: "p_A",
      name: "平台 A 买家侧价格",
      meaning: `${direction.title} 中平台 A 的买家侧广义价格或支付。`,
      role: "parameter",
      side: "platform",
      assumption: "positive",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "p_B",
      baseSymbol: "p",
      subscript: "B",
      codeName: "p_B",
      name: "平台 B 买家侧价格",
      meaning: `${direction.title} 中平台 B 的买家侧广义价格或支付。`,
      role: "parameter",
      side: "platform",
      assumption: "positive",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "psi_A",
      baseSymbol: "psi",
      subscript: "A",
      codeName: "psi_A",
      name: "平台 A 买家侧机制效用",
      meaning: `${direction.title} 在平台 A 买家侧效用中的机制项。`,
      role: "utility",
      side: "consumer",
      assumption: "real",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "psi_B",
      baseSymbol: "psi",
      subscript: "B",
      codeName: "psi_B",
      name: "平台 B 买家侧机制效用",
      meaning: `${direction.title} 在平台 B 买家侧效用中的机制项。`,
      role: "utility",
      side: "consumer",
      assumption: "real",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "phi_A",
      baseSymbol: "phi",
      subscript: "A",
      codeName: "phi_A",
      name: "平台 A 卖家侧机制效用",
      meaning: `${direction.title} 在平台 A 卖家侧效用中的机制项。`,
      role: "utility",
      side: "merchant",
      assumption: "real",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "phi_B",
      baseSymbol: "phi",
      subscript: "B",
      codeName: "phi_B",
      name: "平台 B 卖家侧机制效用",
      meaning: `${direction.title} 在平台 B 卖家侧效用中的机制项。`,
      role: "utility",
      side: "merchant",
      assumption: "real",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "R_A",
      baseSymbol: "R",
      subscript: "A",
      codeName: "R_A",
      name: "平台 A 机制收益",
      meaning: `${direction.title} 在平台 A 产生的符号化收益项。`,
      role: "derived",
      side: "platform",
      assumption: "real",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "R_B",
      baseSymbol: "R",
      subscript: "B",
      codeName: "R_B",
      name: "平台 B 机制收益",
      meaning: `${direction.title} 在平台 B 产生的符号化收益项。`,
      role: "derived",
      side: "platform",
      assumption: "real",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "C_A",
      baseSymbol: "C",
      subscript: "A",
      codeName: "C_A",
      name: "平台 A 机制成本",
      meaning: `${direction.title} 在平台 A 产生的符号化成本项。`,
      role: "cost",
      side: "platform",
      assumption: "nonnegative",
      recommended: false,
    }),
    createSymbolDraft({
      symbol: "C_B",
      baseSymbol: "C",
      subscript: "B",
      codeName: "C_B",
      name: "平台 B 机制成本",
      meaning: `${direction.title} 在平台 B 产生的符号化成本项。`,
      role: "cost",
      side: "platform",
      assumption: "nonnegative",
      recommended: false,
    }),
  ];
}

function createFallbackModelForDirection(
  direction?: ResearchDirection
): HotellingModel {
  if (!direction || direction.id === DEFAULT_ID) {
    return createSecondhandCommissionSubsidyModel(direction);
  }

  if (isSellerMultihomingDirection(direction)) {
    return createSellerMultihomingModel(direction);
  }

  return createGenericDirectionSpecificModel(direction);
}

function createEquilibriumFallbackForDirection(
  direction?: ResearchDirection
): EquilibriumResult {
  if (!direction || direction.id === DEFAULT_ID) {
    return createSymbolicHotellingFallbackResult();
  }

  if (isSellerMultihomingDirection(direction)) {
    return createSellerMultihomingEquilibriumFallback();
  }

  return createGenericDirectionSpecificEquilibriumFallback(direction);
}

function createEquilibriumFallbackForProject(
  project: ResearchProject,
  direction?: ResearchDirection
): EquilibriumResult {
  const model = project.hotellingModel;

  if (!model) {
    return createEquilibriumFallbackForDirection(direction);
  }

  if (isSellerMultihomingDirection(direction)) {
    return createSellerMultihomingEquilibriumFallback();
  }

  if (isDefaultCommissionSubsidyDecisionCore(model)) {
    return createEquilibriumFallbackForDirection(direction);
  }

  return createModelGroundedEquilibriumFallback(model, direction);
}

function createModelGroundedEquilibriumFallback(
  model: HotellingModel,
  direction?: ResearchDirection,
  status: "needs_revision" | "symbolic_failure" = "symbolic_failure"
): EquilibriumResult {
  const decisions = collectStrategicDecisionSymbols(model);
  const decisionText = decisions.length > 0 ? decisions.join(", ") : "current platform decisions";
  const profitText = model.profitFunctions
    .map((entry) => `${entry.platform}: ${entry.expression}`)
    .join("; ");
  const waitsForConfirmation = status === "needs_revision";

  return {
    status,
    concept: "当前模型绑定的符号均衡草稿（待闭式求解）",
    solvingSteps: [
      `读取当前模型的一阶策略变量：${decisionText}。`,
      "将当前利润函数作为求导对象，不套用默认佣金-补贴闭式解。",
      "对每个平台自身的策略变量写出一阶条件；若需求份额或利润函数尚未闭合，则停在可审阅的符号系统。",
      "闭式均衡、反应函数或隐式比较静态需要重新调用模型或由研究者补全后再确认。",
    ],
    focs: createModelGroundedFocs(model, decisions),
    conditions: [
      ...model.assumptions.slice(0, 4),
      "所有需求份额必须位于 [0,1]，且二阶条件需在当前利润函数下重新检查。",
      direction
        ? `当前研究方向：${direction.title}。`
        : "当前研究方向来自用户自定义模型。",
    ],
    closedForm: waitsForConfirmation
      ? ""
      : "尚未得到闭式均衡解；当前只保留与模型一致的一阶条件系统。",
    derivation:
      waitsForConfirmation
        ? `等待用户确认当前模型后继续推导符号均衡。当前利润函数为：${profitText || "未提供利润函数"}。`
        : `上游模型输出未能解析为合格 JSON，因此本地兜底只生成审阅草稿。当前利润函数为：${profitText || "未提供利润函数"}。` +
          "这些条件只说明应如何从当前模型继续求解，不声称已经得到可用于性质分析的闭式均衡。",
    code: createModelGroundedSympyScaffold(model, decisions),
    warnings: waitsForConfirmation
      ? [
          "当前仅搭建与模型一致的符号均衡条件，不进行数值模拟。",
          "确认模型后需要重新生成闭式均衡或可审阅的隐式系统。",
        ]
      : [
          "当前模型包含不属于默认佣金-补贴核心的策略变量，不能复用本地默认闭式解。",
          "该结果不会解锁性质分析；请先重新生成或人工确认闭式均衡。",
        ],
  };
}

function isDefaultCommissionSubsidyDecisionCore(model: HotellingModel) {
  const decisions = collectStrategicDecisionSymbols(model);
  if (decisions.length === 0) return false;

  const normalized = decisions.map(normalizeDecisionToken);
  const hasCommission = normalized.some(isCommissionDecision);
  const hasSubsidy = normalized.some(isSubsidyDecision);
  const onlyDefaultControls = normalized.every(
    (decision) => isCommissionDecision(decision) || isSubsidyDecision(decision)
  );

  return hasCommission && hasSubsidy && onlyDefaultControls;
}

function collectStrategicDecisionSymbols(model: HotellingModel) {
  const orderedStages = [...model.timing].sort((left, right) => left.order - right.order);
  const firstStageDecisions =
    orderedStages.find((stage) => stage.decisions.length > 0)?.decisions ?? [];
  const source =
    firstStageDecisions.length > 0
      ? firstStageDecisions
      : orderedStages.flatMap((stage) => stage.decisions);

  return [...new Set(source.map(cleanDecisionSymbol).filter(Boolean))];
}

function createModelGroundedFocs(
  model: HotellingModel,
  decisions: string[]
) {
  const platforms = model.platforms.length > 0 ? model.platforms : ["A", "B"];
  const focs = platforms.flatMap((platform) => {
    const platformDecisions = decisions.filter((decision) =>
      decisionTargetsPlatform(decision, platform)
    );

    return platformDecisions.map(
      (decision) => `\\frac{\\partial \\Pi_${platform}}{\\partial ${decision}}=0`
    );
  });

  if (focs.length > 0) return focs;

  return decisions.map(
    (decision) => `\\frac{\\partial \\Pi_i}{\\partial ${decision}}=0`
  );
}

function createModelGroundedSympyScaffold(
  model: HotellingModel,
  decisions: string[]
) {
  const symbolNames = decisions.map(toSympyIdentifier).filter(Boolean);
  const uniqueSymbolNames = [...new Set(symbolNames)];
  const symbolLine =
    uniqueSymbolNames.length > 0
      ? `${uniqueSymbolNames.join(", ")} = sp.symbols("${uniqueSymbolNames.join(" ")}", real=True)`
      : "# Define current model decision symbols here.";
  const profitComments = model.profitFunctions
    .map((entry) => `# ${entry.platform}: ${entry.expression}`)
    .join("\n");
  const exampleFocs = createModelGroundedSympyFocExamples(model, decisions);
  const focLine =
    exampleFocs.length > 0
      ? `# focs = [${exampleFocs.join(", ")}]`
      : "# focs = []  # Add first-order conditions after defining profit functions.";

  return `# SymPy scaffold for the current model only.
import sympy as sp

${symbolLine}

# Fill in demand shares from the current model before solving.
${profitComments || "# Profit functions were not provided."}
# Example next step:
${focLine}
# solution = sp.solve(focs, [${uniqueSymbolNames.join(", ")}], dict=True, simplify=True)`;
}

function createModelGroundedSympyFocExamples(
  model: HotellingModel,
  decisions: string[]
) {
  const platforms = model.platforms.length > 0 ? model.platforms : ["A", "B"];
  const focs = platforms.flatMap((platform) => {
    const platformDecisions = decisions.filter((decision) =>
      decisionTargetsPlatform(decision, platform)
    );

    return platformDecisions
      .map((decision) => toSympyIdentifier(decision))
      .filter(Boolean)
      .map((decision) => `sp.diff(Pi_${platform}, ${decision})`);
  });

  if (focs.length > 0) return [...new Set(focs)];

  return [
    ...new Set(
      decisions
        .map((decision) => toSympyIdentifier(decision))
        .filter(Boolean)
        .map((decision) => `sp.diff(Pi_i, ${decision})`)
    ),
  ];
}

function cleanDecisionSymbol(value: string) {
  return value
    .trim()
    .replace(/^\$|\$$/g, "")
    .replace(/^\\\(|\\\)$/g, "")
    .trim();
}

function normalizeDecisionToken(value: string) {
  return normalizeGreekDecisionAliases(cleanDecisionSymbol(value))
    .replace(/\\/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function normalizeGreekDecisionAliases(value: string) {
  return value.replace(
    /[\u03a4\u03c4\u{1d6bb}\u{1d6d5}\u{1d6f5}\u{1d70f}\u{1d72f}\u{1d749}\u{1d769}\u{1d783}\u{1d7a3}\u{1d7bd}]/gu,
    "tau"
  );
}

function isCommissionDecision(decision: string) {
  return /^tau(?:_[abi])?$/.test(decision);
}

function isSubsidyDecision(decision: string) {
  return /^s(?:_[abi])?$/.test(decision);
}

function decisionTargetsPlatform(decision: string, platform: string) {
  const normalizedDecision = normalizeDecisionToken(decision);
  const normalizedPlatform = normalizeDecisionToken(platform);

  return (
    normalizedDecision.endsWith(`_${normalizedPlatform}`) ||
    normalizedDecision.endsWith("_i") ||
    !/_[a-z0-9]+$/.test(normalizedDecision)
  );
}

function toSympyIdentifier(value: string) {
  return normalizeDecisionToken(value)
    .replace(/^tau(?=_|$)/, "tau")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function createPropertyAnalysesForDirection(
  direction: ResearchDirection | undefined,
  equilibrium: EquilibriumResult
): PropertyAnalysis[] {
  if (!direction || direction.id === DEFAULT_ID) {
    return createDefaultPropertyAnalyses(equilibrium);
  }

  if (isSellerMultihomingDirection(direction)) {
    return createSellerMultihomingPropertyAnalyses(equilibrium);
  }

  return createGenericDirectionSpecificPropertyAnalyses(direction, equilibrium);
}

function createSecondhandCommissionSubsidyModel(
  direction?: ResearchDirection
): HotellingModel {
  const selectedDirectionAssumption = direction && !direction.recommended
    ? `当前采用的研究方向：${direction.title}。`
    : null;
  const selectedDirectionDraft = direction
    ? `当前采用的研究方向：${direction.title}。\n\n${direction.summary}\n\n模型路线：${direction.model}。\n\n预期贡献：${direction.contribution}。\n\n本地草稿会先把它放进可符号求解的双边 Hotelling 框架，方便继续细化机制变量，再进入均衡推导。`
    : null;
  const utilityFunctions: UtilityFunction[] = [
    {
      id: "u-buyer-a",
      side: "consumer",
      platform: "A",
      expression: "U_{A}^{B} = v_B + \\alpha_B n_{A}^{S} + s_A - p - t_B x",
      notes: "买家位于 Hotelling 线段 x，选择平台 A 时获得卖家规模带来的跨边网络效应和买家补贴。",
    },
    {
      id: "u-buyer-b",
      side: "consumer",
      platform: "B",
      expression: "U_{B}^{B} = v_B + \\alpha_B n_{B}^{S} + s_B - p - t_B (1 - x)",
      notes: "买家选择平台 B 时承担到右端平台的差异化成本。",
    },
    {
      id: "u-seller-a",
      side: "merchant",
      platform: "A",
      expression: "U_{A}^{S} = v_S + \\alpha_S n_{A}^{B} - \\tau_A q - t_S y",
      notes: "卖家位于 Hotelling 线段 y，平台 A 对成交额收取佣金 tau_A q。",
    },
    {
      id: "u-seller-b",
      side: "merchant",
      platform: "B",
      expression: "U_{B}^{S} = v_S + \\alpha_S n_{B}^{B} - \\tau_B q - t_S (1 - y)",
      notes: "卖家选择平台 B 时在佣金和买家规模之间权衡。",
    },
  ];

  return {
    symbols: createResearchSymbolRegistryForDirection(direction),
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-commission-subsidy",
        order: 1,
        name: "平台选择佣金和补贴",
        decisions: ["\\tau_A", "\\tau_B", "s_A", "s_B"],
      },
      {
        id: "stage-participation",
        order: 2,
        name: "买家和卖家选择平台",
        decisions: ["x", "y"],
      },
      {
        id: "stage-transaction",
        order: 3,
        name: "平台撮合交易并获得收益",
        decisions: ["n_i^B", "n_i^S"],
      },
    ],
    utilityFunctions,
    demandDerivation:
      "由买家无差异条件 U_A^B = U_B^B 和卖家无差异条件 U_A^S = U_B^S 推导两侧需求份额，再代入平台利润函数。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "Pi_A = tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "平台 A 的佣金收入来自卖家成交，补贴成本按买家参与规模计。",
      },
      {
        id: "profit-b",
        platform: "B",
        expression: "Pi_B = tau_B q n_B^S n_B^B - s_B n_B^B",
        notes: "平台 B 采用相同结构，便于比较对称与非对称策略。",
      },
    ],
    assumptions: [
      "两个平台位于 Hotelling 线段两端，买家和卖家各自单归属。",
      "买家和卖家均受到对侧参与规模的正向跨边网络效应影响。",
      "平台先同时选择卖家佣金 \\tau_i 和买家补贴 s_i。",
      "佣金按单位成交价值 q 收取，补贴按买家参与规模支付。",
      "均衡分析仅采用符号化一阶条件与参数约束，不进行数值模拟。",
      ...(selectedDirectionAssumption ? [selectedDirectionAssumption] : []),
    ],
    modelSetupDraft:
      selectedDirectionDraft ??
      "考虑两个竞争性二手交易平台 A 与 B。平台通过卖家佣金和买家补贴影响双边参与规模，并在跨边网络效应下形成策略互动。",
  };
}

function createSellerMultihomingModel(direction?: ResearchDirection): HotellingModel {
  const utilityFunctions: UtilityFunction[] = [
    {
      id: "u-buyer-a-multihoming",
      side: "consumer",
      platform: "A",
      expression:
        "U_A^B = v_B + \\alpha_B(m_A+m_{AB}) + \\rho m_{AB} - p_A - t_B x",
      notes:
        "平台 A 的买家效用取决于 A 独占卖家 m_A 和多归属卖家 m_{AB}。",
    },
    {
      id: "u-buyer-b-multihoming",
      side: "consumer",
      platform: "B",
      expression:
        "U_B^B = v_B + \\alpha_B(m_B+m_{AB}) + \\rho m_{AB} - p_B - t_B(1-x)",
      notes:
        "平台 B 的买家效用同样使用多归属卖家存量，同时保持买家侧单归属。",
    },
    {
      id: "u-seller-a-membership",
      side: "merchant",
      platform: "A",
      expression:
        "U_A^S = v_S + \\alpha_S n_A^B - \\tau_A q n_A^B - t_S y",
      notes:
        "只入驻 A 的卖家剩余取决于平台 A 买家规模，以及预期匹配中支付的交易佣金。",
    },
    {
      id: "u-seller-b-membership",
      side: "merchant",
      platform: "B",
      expression:
        "U_B^S = v_S + \\alpha_S n_B^B - \\tau_B q n_B^B - t_S(1-y)",
      notes:
        "只入驻 B 的卖家剩余与 A 侧入驻方程对称。",
    },
    {
      id: "u-seller-ab-membership",
      side: "merchant",
      platform: "AB",
      expression: "U_{AB}^S = U_A^S + U_B^S - \\kappa",
      notes:
        "多归属选项把两个平台的入驻剩余相加，并扣除符号化多归属固定成本 \\kappa。",
    },
  ];

  return {
    symbols: createResearchSymbolRegistryForDirection(direction),
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-platform-pricing",
        order: 1,
        name: "平台选择符号化佣金",
        decisions: ["\\tau_A", "\\tau_B"],
      },
      {
        id: "stage-seller-membership",
        order: 2,
        name: "卖家选择只入驻 A、只入驻 B 或多归属",
        decisions: ["m_A", "m_B", "m_{AB}", "m_i", "\\kappa"],
      },
      {
        id: "stage-buyer-choice",
        order: 3,
        name: "买家观察卖家可见规模后单归属选择平台",
        decisions: ["n_A^B", "n_B^B", "x"],
      },
    ],
    utilityFunctions,
    demandDerivation:
      "买家需求由 U_A^B=U_B^B 推出；卖家入驻由包含多归属成本 \\kappa 的 U_A^S、U_B^S、U_{AB}^S 截止或互补条件刻画，整个系统保持符号形式。",
    profitFunctions: [
      {
        id: "profit-a-multihoming",
        platform: "A",
        expression:
          "Pi_A = \\tau_A q n_A^B(m_A+m_{AB}) - C_A(m_A,m_{AB})",
        notes:
          "平台 A 从可见卖家规模中获得佣金收入，并扣除符号化的入驻或治理成本。",
      },
      {
        id: "profit-b-multihoming",
        platform: "B",
        expression:
          "Pi_B = \\tau_B q n_B^B(m_B+m_{AB}) - C_B(m_B,m_{AB})",
        notes:
          "平台 B 与 A 对称，但显式保留多归属卖家规模，而不退化成默认佣金-补贴模型。",
      },
    ],
    assumptions: [
      "买家在平台 A 和 B 之间单归属，卖家可以选择只入驻 A、只入驻 B 或同时多归属。",
      "m_A、m_B 和 m_{AB} 表示符号化的卖家入驻规模，m_i 表示平台 i 可见的卖家规模。",
      "多归属成本 \\kappa 保持符号形式，并在平台一阶条件求解之前进入卖家参与条件。",
      "平台利润用卖家可见规模来写，而不是套用默认佣金-补贴项 tau_i q n_i^S n_i^B - s_i n_i^B。",
      "均衡和性质分析必须使用符号一阶条件、反应函数或隐函数比较静态，不用数值模拟替代理论推导。",
    ],
    modelSetupDraft:
      `当前采用的研究方向：${direction?.title ?? "卖家多归属与平台定价"}。\n\n` +
      "这版本地草稿把卖家多归属写成可检查的符号系统：$m_A$、$m_B$、$m_{AB}$ 分别表示只入驻 A、只入驻 B 和多归属卖家规模，$m_i$ 表示平台 $i$ 可见的卖家规模，$\\kappa$ 表示多归属成本。\n\n" +
      "平台先选择佣金 $\\tau_A$ 与 $\\tau_B$，随后卖家决定入驻 A、B 或两者。这里刻意不复用默认佣金-补贴闭式解，而是为后续 seller-multihoming-pricing 机制保留独立的符号求解入口。",
  };
}

function createGenericDirectionSpecificModel(direction: ResearchDirection): HotellingModel {
  const directionSlug = direction.id;
  const mechanismState = `\\mu_{${directionSlug}}`;
  const mechanismEffort = `a_{${directionSlug}}`;
  const utilityFunctions: UtilityFunction[] = [
    {
      id: `u-buyer-a-${directionSlug}`,
      side: "consumer",
      platform: "A",
      expression:
        `U_A^B = v_B + \\alpha_B n_A^S + \\psi_A(${mechanismState}) - p_A - t_B x`,
      notes:
        `平台 A 的买家效用保留 ${direction.title} 机制状态，不先做数值化。`,
    },
    {
      id: `u-buyer-b-${directionSlug}`,
      side: "consumer",
      platform: "B",
      expression:
        `U_B^B = v_B + \\alpha_B n_B^S + \\psi_B(${mechanismState}) - p_B - t_B(1-x)`,
      notes:
        "平台 B 的买家效用与 A 对称，并保留同一个机制状态变量。",
    },
    {
      id: `u-seller-a-${directionSlug}`,
      side: "merchant",
      platform: "A",
      expression:
        `U_A^S = v_S + \\alpha_S n_A^B + \\phi_A(${mechanismState}) - \\tau_A q - t_S y`,
      notes:
        "卖家效用把机制收益保持为符号项，避免用数值代入替代理论求解。",
    },
    {
      id: `u-seller-b-${directionSlug}`,
      side: "merchant",
      platform: "B",
      expression:
        `U_B^S = v_S + \\alpha_S n_B^B + \\phi_B(${mechanismState}) - \\tau_B q - t_S(1-y)`,
      notes:
        "平台 B 的卖家效用与 A 对称，并显式保留该研究方向的机制通道。",
    },
  ];

  return {
    symbols: createResearchSymbolRegistryForDirection(direction),
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: `stage-mechanism-${directionSlug}`,
        order: 1,
        name: "平台选择该方向的机制变量",
        decisions: ["\\tau_A", "\\tau_B", mechanismEffort, mechanismState],
      },
      {
        id: `stage-participation-${directionSlug}`,
        order: 2,
        name: "买家和卖家观察机制后选择平台",
        decisions: ["n_A^B", "n_B^B", "n_A^S", "n_B^S", "x", "y"],
      },
    ],
    utilityFunctions,
    demandDerivation:
      `需求由 U_A^B=U_B^B 与 U_A^S=U_B^S 推出，同时保留 ${direction.title} 的机制状态。这个本地草稿不把该方向折叠成默认佣金-补贴 Hotelling 闭式解。`,
    profitFunctions: [
      {
        id: `profit-a-${directionSlug}`,
        platform: "A",
        expression:
          `Pi_A = \\tau_A q n_A^S n_A^B + R_A(${mechanismState},n_A^B,n_A^S) - C_A(${mechanismEffort})`,
        notes:
          "平台 A 的利润把机制收益与机制成本保留为符号项，供后续闭式求解或隐函数求解使用。",
      },
      {
        id: `profit-b-${directionSlug}`,
        platform: "B",
        expression:
          `Pi_B = \\tau_B q n_B^S n_B^B + R_B(${mechanismState},n_B^B,n_B^S) - C_B(${mechanismEffort})`,
        notes:
          "平台 B 与 A 对称，保留该研究方向的机制项，而不是导入默认补贴成本项。",
      },
    ],
    assumptions: [
      `当前采用的研究方向：${direction.title}。`,
      `方向标识 ${direction.id} 会使用独立机制变量进入符号系统。`,
      "机制变量在用户或模型生成步骤确认具体经济通道前保持符号形式。",
      "均衡分析必须使用符号一阶条件、反应函数或隐函数比较静态。",
      "不使用数值代入或仿真替代理论分析。",
    ],
    modelSetupDraft:
      `当前采用的研究方向：${direction.title}。\n\n${direction.summary}\n\n模型路线：${direction.model}。\n\n预期贡献：${direction.contribution}。\n\n这版本地草稿引入机制状态 ${mechanismState} 和机制努力 ${mechanismEffort}，并把需求、利润、一阶条件和性质分析都绑定到 ${direction.id}，避免复用默认佣金-补贴闭式解。`,
  };
}

function createSymbolicEquilibriumScaffold(
  direction?: ResearchDirection
): EquilibriumResult {
  if (isSellerMultihomingDirection(direction)) {
    return {
      ...createSymbolicEquilibriumScaffoldResult(),
      concept: "卖家多归属定价方向的符号求解草稿",
      solvingSteps: [
        "定义买家单归属份额 n_A^B、n_B^B，以及卖家入驻规模 m_A、m_B、m_{AB}。",
        "写出只入驻 A、只入驻 B 和多归属三类卖家的参与剩余，并纳入多归属成本 \\kappa。",
        "先把卖家规模代入平台利润，再对 \\tau_A 和 \\tau_B 写出一阶条件。",
        "在多归属参与规则确认之前，先保持为符号系统。",
      ],
      focs: [
        "\\frac{\\partial \\Pi_A}{\\partial \\tau_A}=0",
        "\\frac{\\partial \\Pi_B}{\\partial \\tau_B}=0",
        "G_m(m_A,m_B,m_{AB};\\tau_A,\\tau_B,\\kappa)=0",
      ],
      conditions: [
        "\\kappa \\ge 0",
        "m_A,m_B,m_{AB}\\in[0,1]",
        "n_A^B+n_B^B=1",
      ],
      derivation:
        "这版草稿服务于卖家多归属定价方向，不复用佣金-补贴 Hotelling 闭式解。",
      warnings: [
        "当前只是卖家多归属的符号草稿；不使用数值代入或仿真替代理论推导。",
      ],
    };
  }

  return createSymbolicEquilibriumScaffoldResult();
}

export function createModelAwareEquilibriumScaffoldResult(
  model: HotellingModel,
  direction?: ResearchDirection
): EquilibriumResult {
  if (isSellerMultihomingDirection(direction)) {
    return createSymbolicEquilibriumScaffold(direction);
  }

  if (isDefaultCommissionSubsidyDecisionCore(model)) {
    return createSymbolicEquilibriumScaffold(direction);
  }

  return createModelGroundedEquilibriumFallback(model, direction, "needs_revision");
}

export function createSymbolicEquilibriumScaffoldResult(): EquilibriumResult {
  return {
    status: "needs_revision",
    concept: "符号化子博弈精炼均衡",
    solvingSteps: [
      "写出买家侧和卖家侧无差异条件。",
      "求得两侧需求份额并代入平台利润函数。",
      "对 \\tau_i 和 s_i 写出符号化一阶条件。",
      "整理均衡存在所需的内部解和二阶条件。",
    ],
    focs: [
      "\\frac{\\partial \\Pi_i}{\\partial \\tau_i}=0",
      "\\frac{\\partial \\Pi_i}{\\partial s_i}=0",
    ],
    conditions: [
      "t_B > 0",
      "t_S > 0",
      "\\alpha_B 和 \\alpha_S 保证需求份额位于 [0, 1]",
    ],
    closedForm: "",
    derivation: "等待用户确认模型设定后继续推导符号化均衡。",
    code: "",
    warnings: ["当前仅搭建符号化均衡条件，不进行数值模拟。"],
  };
}

function createSymbolicHotellingFallbackResult(): EquilibriumResult {
  return {
    status: "solved",
    concept: "对称内部纳什均衡（本地符号闭式解）",
    solvingSteps: [
      "由买家无差异条件 U_A^B=U_B^B 得到买家侧平台 A 份额 n_A^B。",
      "由卖家无差异条件 U_A^S=U_B^S 得到卖家侧平台 A 份额 n_A^S。",
      "令 D=t_Bt_S-\\alpha_B\\alpha_S，并把 n_i^B 与 n_i^S 代入平台利润函数 \\Pi_i=\\tau_i q n_i^S n_i^B-s_i n_i^B。",
      "在对称内部候选均衡 \\tau_A=\\tau_B=\\tau, s_A=s_B=s 下整理一阶条件。",
      "联立对称一阶条件得到闭式 \\tau^* 与 s^*，再列出内部解和局部二阶条件。",
    ],
    focs: [
      "D-q\\tau(t_B+\\alpha_B)+2\\alpha_B s=0",
      "q\\tau(t_S+\\alpha_S)-2D-2t_Ss=0",
      "D=t_Bt_S-\\alpha_B\\alpha_S",
    ],
    conditions: [
      "D=t_Bt_S-\\alpha_B\\alpha_S>0，保证两侧需求反馈可解。",
      "\\tau^*=(t_S-2\\alpha_B)/q；若论文要求卖家佣金非负，需要 t_S\\ge 2\\alpha_B。",
      "s^*=(t_S+\\alpha_S-2t_B-2\\alpha_B)/2；若论文要求买家补贴非负，需要 t_S+\\alpha_S\\ge 2(t_B+\\alpha_B)。",
      "对称候选给出 n_A^{B*}=n_A^{S*}=1/2；内部解还需满足局部二阶条件。",
      "局部二阶条件可用 Hessian 负定检验：\\Pi_{\\tau\\tau}<0 且 \\det(H)>0。",
    ],
    closedForm:
      "在对称内部均衡中：$\\tau_A^*=\\tau_B^*=\\frac{t_S-2\\alpha_B}{q}$，$s_A^*=s_B^*=\\frac{t_S+\\alpha_S-2t_B-2\\alpha_B}{2}$，且 $n_A^{B*}=n_B^{B*}=n_A^{S*}=n_B^{S*}=\\frac{1}{2}$。",
    derivation:
      "由买家无差异条件和卖家无差异条件可得 $n_A^B=\\frac{1}{2}+\\frac{t_S\\Delta s-\\alpha_B q\\Delta\\tau}{2D}$，$n_A^S=\\frac{1}{2}+\\frac{\\alpha_S\\Delta s-qt_B\\Delta\\tau}{2D}$，其中 $\\Delta s=s_A-s_B$，$\\Delta\\tau=\\tau_A-\\tau_B$，$D=t_Bt_S-\\alpha_B\\alpha_S$。代入 $\\Pi_A=\\tau_A q n_A^Sn_A^B-s_A n_A^B$ 后，在对称候选 $\\tau_A=\\tau_B=\\tau$、$s_A=s_B=s$ 处，一阶条件化为 $D-q\\tau(t_B+\\alpha_B)+2\\alpha_Bs=0$ 和 $q\\tau(t_S+\\alpha_S)-2D-2t_Ss=0$。联立解得 $\\tau^*=(t_S-2\\alpha_B)/q$，$s^*=(t_S+\\alpha_S-2t_B-2\\alpha_B)/2$。该本地结果只声明对称内部闭式解；若研究方向需要非对称或多机制扩展，应继续调用模型生成链路做一般符号求解。",
    code: `# sympy symbolic symmetric equilibrium
import sympy as sp

tau_A, tau_B, s_A, s_B, tau, s, q = sp.symbols(
    "tau_A tau_B s_A s_B tau s q", positive=True
)
t_B, t_S = sp.symbols("t_B t_S", positive=True)
alpha_B, alpha_S = sp.symbols("alpha_B alpha_S", real=True)
nA_B, nA_S = sp.symbols("nA_B nA_S", real=True)

nB_B = 1 - nA_B
nB_S = 1 - nA_S

buyer_indifference = sp.Eq(
    nA_B,
    (t_B + s_A - s_B + alpha_B * (nA_S - nB_S)) / (2 * t_B),
)
seller_indifference = sp.Eq(
    nA_S,
    (t_S - q * (tau_A - tau_B) + alpha_S * (nA_B - nB_B)) / (2 * t_S),
)

demand_solution = sp.solve(
    [buyer_indifference, seller_indifference],
    [nA_B, nA_S],
    dict=True,
    simplify=True,
)

nA_B_expr = sp.simplify(demand_solution[0][nA_B])
nA_S_expr = sp.simplify(demand_solution[0][nA_S])
Pi_A = tau_A * q * nA_S_expr * nA_B_expr - s_A * nA_B_expr

foc_tau_sym = sp.factor(
    sp.diff(Pi_A, tau_A).subs({tau_A: tau, tau_B: tau, s_A: s, s_B: s})
)
foc_s_sym = sp.factor(
    sp.diff(Pi_A, s_A).subs({tau_A: tau, tau_B: tau, s_A: s, s_B: s})
)
symmetric_solution = sp.solve(
    [foc_tau_sym, foc_s_sym],
    [tau, s],
    dict=True,
    simplify=True,
)

print("nA_B =", nA_B_expr)
print("nA_S =", nA_S_expr)
print("symmetric FOC_tau =", foc_tau_sym)
print("symmetric FOC_s =", foc_s_sym)
print("symmetric solution =", symmetric_solution)`,
    warnings: [
      "当前本地结果给出的是对称内部闭式解，不声称覆盖一般非对称均衡。",
      "均衡求解阶段不使用数值模拟；数值代入只应出现在后续仿真模块。",
      "如果继续加入非对称平台、质量验证努力或多期状态变量，应重新做一般符号求解。",
    ],
  };
}

function createSellerMultihomingEquilibriumFallback(): EquilibriumResult {
  const core = createSymbolicHotellingFallbackResult();
  return {
    ...core,
    concept: "卖家多归属方向的收窄对称内部均衡（本地闭式解）",
    solvingSteps: [
      "把卖家多归属方向先收窄为可求解的内部区域：活跃卖家可同时出现在两个平台，记作 m_{AB}^*=1，平台竞争仍由两侧 Hotelling 份额决定。",
      ...core.solvingSteps,
      "把多归属机制作为当前闭式核心的适用区域说明保留；如果要让 m_A、m_B、m_{AB} 内生变化，需要另行求解包含互补条件的完整系统。",
    ],
    focs: core.focs,
    conditions: [
      ...core.conditions,
      "卖家多归属方向在当前闭式核心中采用活跃多归属区域：m_{AB}^*=1，且多归属成本 \\kappa 不高到破坏该区域。",
      "如果论文需要内生 m_A、m_B、m_{AB}，应把卖家入驻互补条件加入系统后重新求解。"
    ],
    closedForm: `${core.closedForm}\n\n在当前收窄的多归属活跃区域中，$m_{AB}^*=1$，$m_A^*=m_B^*=0$ 作为外生区域条件保留；佣金、补贴和需求份额由上述对称内部闭式解给出。`,
    derivation:
      `${core.derivation}\n\n这一步没有声称已经完整内生求出卖家多归属选择，而是把卖家多归属方向收窄到“多归属区域已经活跃”的可求解核心。这样主流程能得到真正的星号闭式解；若论文问题的重点是多归属规模本身，则下一轮应把 m_A、m_B、m_{AB} 的截止条件补全后再做完整均衡。`,
    code: core.code,
    warnings: [
      "这是卖家多归属方向的收窄可求解核心，不是包含所有入驻互补条件的完整多归属均衡。",
      ...core.warnings,
    ],
  };
}

function createGenericDirectionSpecificEquilibriumFallback(
  direction: ResearchDirection | undefined
): EquilibriumResult {
  const core = createSymbolicHotellingFallbackResult();
  const directionId = direction?.id ?? "custom-direction";
  const title = direction?.title ?? directionId;

  return {
    ...core,
    concept: `${title} 的可求解核心均衡（本地闭式解）`,
    solvingSteps: [
      `把 ${title} 先收窄到两平台、两侧线性 Hotelling 的可求解核心，机制差异暂时作为适用区域和后续扩展说明保留。`,
      ...core.solvingSteps,
      `后续若要把 ${directionId} 的专属机制变量内生化，应在这个闭式核心上新增机制方程后重新求解。`,
    ],
    focs: core.focs,
    conditions: [
      ...core.conditions,
      `${title} 的机制项当前不进入一阶条件，只作为收窄模型的论文语境和后续扩展方向。`,
    ],
    closedForm: core.closedForm,
    derivation:
      `${core.derivation}\n\n这是 ${title} 的可求解核心版本：它保留研究方向语境，但先不把 ${directionId} 的专属机制变量写入平台一阶条件。这样可以优先得到可检查、可导出的闭式均衡解，避免主流程停在隐式草稿。`,
    code: core.code,
    warnings: [
      `这是 ${title} 的收窄可求解核心，不是 ${directionId} 的完整机制均衡。`,
      ...core.warnings,
    ],
  };
}

function createSellerMultihomingPropertyAnalyses(
  equilibrium: EquilibriumResult
): PropertyAnalysis[] {
  const sharedWarnings = [
    "卖家多归属性质分析只使用符号隐式求导。",
    "不使用数值代入、仿真、校准或参数赋值替代理论分析。",
    "符号方向需要依赖卖家多归属系统中的雅可比条件和二阶条件。",
  ];

  return [
    {
      id: "analysis-multihoming-cost-membership",
      target: "m_i^*, m_{AB}^*",
      parameter: "kappa (\\kappa)",
      operation: "differentiate",
      symbolicResult:
        "\\frac{\\partial z^*}{\\partial \\kappa}=-J_zF(z^*,\\theta)^{-1}F_{\\kappa}(z^*,\\theta),\\quad z=(\\tau_A,\\tau_B,m_A,m_B,m_{AB})",
      signCondition:
        "如果活跃的卖家多归属方程满足 G_{AB,\\kappa}<0，且约化后的卖家入驻模块稳定，则 \\partial m_{AB}^*/\\partial \\kappa<0。",
      propositionDraft:
        "命题 1：在活跃的内部多归属区域内，更高的卖家多归属成本 \\kappa 会弱化均衡多归属规模 m_{AB}^*。",
      proofSketch:
        `使用 ${equilibrium.concept}，把活跃符号系统写成 F(z,\\theta)=0。对 \\kappa 求导得到 J_zF dz^*/d\\kappa + F_\\kappa=0，因此 dz^*/d\\kappa=-J_zF^{-1}F_\\kappa。m_AB 分量的符号由卖家入驻模块和维持的稳定条件决定，不引入任何数值参数。`,
      intuition:
        "更大的 \\kappa 会降低卖家同时入驻两个平台的吸引力；除非平台佣金反应完全抵消额外成本，否则多归属规模会下降。",
      warnings: sharedWarnings,
    },
    {
      id: "analysis-multihoming-commission-pressure",
      target: "\\tau_i^*",
      parameter: "m_i",
      operation: "custom",
      symbolicResult:
        "\\frac{\\partial \\tau_i^*}{\\partial m_i}=-\\frac{F_{i,m_i}}{F_{i,\\tau_i}}\\quad \\text{on the reduced reaction equation }F_i(\\tau_i,m_i;\\theta)=0",
      signCondition:
        "当 F_{i,\\tau_i}<0，且卖家可见规模既提高买家需求又削弱卖家锁定时，符号由交叉偏导 F_{i,m_i} 决定。",
      propositionDraft:
        "命题 2：卖家多归属通过可见卖家规模 m_i 与平台佣金 \\tau_i 之间的反应函数交叉偏导改变佣金压力。",
      proofSketch:
        "代入卖家入驻方程后，把平台 i 的一阶条件约化为 F_i=0。对 m_i 做符号求导得到 d\\tau_i^*/dm_i=-F_{i,m_i}/F_{i,\\tau_i}。这是由符号一阶条件导出的理论比较静态，不是数值实验。",
      intuition:
        "更多可见卖家会提高买家侧价值，但多归属也让卖家不那么被单个平台锁定。因此佣金反应取决于约化一阶条件中哪个符号通道占优。",
      warnings: sharedWarnings,
    },
    {
      id: "analysis-multihoming-existence-region",
      target: "卖家多归属内部均衡",
      parameter: "J_zF, \\kappa",
      operation: "threshold",
      symbolicResult:
        "\\det J_zF\\ne0,\\quad 0<m_A^*,m_B^*,m_{AB}^*<1,\\quad U_{AB}^S-U_A^S\\ge0,\\quad U_{AB}^S-U_B^S\\ge0",
      signCondition:
        "符号内部区域需要非零雅可比行列式、可行的卖家规模，以及包含 \\kappa 的多归属剩余不等式。",
      propositionDraft:
        "命题 3：卖家多归属定价草稿只在活跃多归属约束和局部二阶条件成立的符号参数区域内有效。",
      proofSketch:
        "先列出卖家入驻规模的可行性不等式和活跃多归属剩余比较，再与 \\det J_zF\\ne0 和平台 Hessian 条件结合。这些符号限制先定义性质分析的理论区域，再考虑任何数值校准。",
      intuition:
        "分析必须说明多归属在什么区域内真正活跃。离开该区域后，模型会切换到只入驻 A 或只入驻 B 的 regime，需要作为另一个符号区域重新求解。",
      warnings: sharedWarnings,
    },
  ];
}

function createGenericDirectionSpecificPropertyAnalyses(
  direction: ResearchDirection | undefined,
  equilibrium: EquilibriumResult
): PropertyAnalysis[] {
  const directionId = direction?.id ?? "custom-direction";
  const sharedWarnings = [
    `${direction?.title ?? directionId} 的性质分析只使用符号隐式求导。`,
    "不使用数值代入、仿真、校准或参数赋值替代理论分析。",
    "符号方向取决于机制方程、雅可比秩和二阶条件。",
  ];

  return [
    {
      id: `analysis-${directionId}-mechanism`,
      target: `\\mu_{${directionId}}^*`,
      parameter: `a_{${directionId}}`,
      operation: "differentiate",
      symbolicResult:
        "\\frac{\\partial z^*}{\\partial a}=-J_zF(z^*,\\theta)^{-1}F_a(z^*,\\theta)",
      signCondition:
        `符号方向取决于 ${direction?.title ?? directionId} 机制在 F_a 中的交叉偏导，以及符号雅可比逆 J_zF^{-1}。`,
      propositionDraft:
        `命题 1：在 ${direction?.title ?? directionId} 机制区域内，机制变量通过符号反应系统改变均衡结果，而不是通过默认佣金-补贴闭式解起作用。`,
      proofSketch:
        `使用 ${equilibrium.concept}。把活跃方程写为 F(z,\\theta)=0，其中 z 收集佣金、需求份额和 ${direction?.title ?? directionId} 的机制状态。对机制变量求导得到 dz^*/da=-J_zF^{-1}F_a。这是符号比较静态，不给定参数值。`,
      intuition:
        `${direction?.title ?? directionId} 机制会直接改变参与激励，因此理论效应必须从一阶条件和机制约束中读取。`,
      warnings: sharedWarnings,
    },
    {
      id: `analysis-${directionId}-existence`,
      target: `${direction?.title ?? directionId} 的符号均衡区域`,
      parameter: "J_zF",
      operation: "threshold",
      symbolicResult:
        "\\det J_zF\\ne0,\\quad n_i^B,n_i^S\\in[0,1],\\quad \\text{active mechanism constraints hold}",
      signCondition:
        "该草稿只在可行性约束和活跃机制约束同时满足的符号区域内有效。",
      propositionDraft:
        `命题 2：${direction?.title ?? directionId} 先定义一个符号区域；若要声称闭式解，需要先证明可行性、活跃约束和局部最优性。`,
      proofSketch:
        "收集可行性不等式、活跃机制约束、非零雅可比行列式，以及 Hessian 或 bordered-Hessian 条件。这些符号限制先界定定理区域，再考虑任何仿真模块。",
      intuition:
        "机制约束一旦绑定，模型可能切换区域。因此性质分析必须先说明符号区域，再报告符号方向。",
      warnings: sharedWarnings,
    },
  ];
}

function createDefaultPropertyAnalyses(
  equilibrium: EquilibriumResult
): PropertyAnalysis[] {
  const sharedWarnings = [
    "性质分析基于对称内部闭式解和内部解条件，不使用数值模拟。",
    "若后续扩展到非对称平台或多机制模型，需要重新做一般符号求解后再更新比较静态。",
  ];

  return [
    {
      id: "analysis-reaction-network",
      target: "\\tau_i^*",
      parameter: "\\alpha_B",
      operation: "differentiate",
      symbolicResult:
        "\\frac{\\partial \\tau_i^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
      signCondition:
        "q>0 时，买家侧跨边网络效应增强会降低对称均衡佣金。",
      propositionDraft:
        "命题 1：在对称内部均衡中，买家侧跨边网络效应增强会降低平台卖家佣金。",
      proofSketch:
        `由 ${equilibrium.concept} 的闭式解 \\tau_i^*=(t_S-2\\alpha_B)/q 直接对 \\alpha_B 求偏导，得到 \\partial \\tau_i^*/\\partial \\alpha_B=-2/q。该分析不需要给参数赋值。`,
      intuition:
        "买家侧网络效应越强，平台越有动力通过降低卖家佣金来扩大卖家规模，从而间接提高买家侧效用。",
      warnings: sharedWarnings,
    },
    {
      id: "analysis-subsidy-commission-balance",
      target: "s_i^*",
      parameter: "\\alpha_S",
      operation: "differentiate",
      symbolicResult:
        "\\frac{\\partial s_i^*}{\\partial \\alpha_S}=\\frac{1}{2}",
      signCondition:
        "\\partial s_i^*/\\partial \\alpha_S>0，因此卖家侧网络效应增强会提高对称均衡买家补贴。",
      propositionDraft:
        "命题 2：在对称内部均衡中，卖家侧网络效应增强会提高平台对买家的补贴。",
      proofSketch:
        `由闭式解 s_i^*=(t_S+\\alpha_S-2t_B-2\\alpha_B)/2 直接对 \\alpha_S 求偏导，得到 1/2。该命题不需要给定任何数值参数。`,
      intuition:
        "卖家侧网络效应越强，吸引买家的边际价值越高，平台更愿意用买家补贴扩大买家参与并稳定双边规模。",
      warnings: sharedWarnings,
    },
    {
      id: "analysis-transport-threshold",
      target: "n_i^{B*}, n_i^{S*}",
      parameter: "t_B,t_S",
      operation: "threshold",
      symbolicResult:
        "n_i^{B*}=n_i^{S*}=\\frac{1}{2},\\quad D=t_Bt_S-\\alpha_B\\alpha_S>0",
      signCondition:
        "D>0 保证需求反馈系统可解；若再要求 \\tau_i^*\\ge0 与 s_i^*\\ge0，则需 t_S\\ge2\\alpha_B 且 t_S+\\alpha_S\\ge2(t_B+\\alpha_B)。",
      propositionDraft:
        "命题 3：对称内部均衡存在要求差异化成本足以约束跨边网络反馈，并满足收费或补贴符号约束。",
      proofSketch:
        "把 \\tau_i^* 与 s_i^* 代回需求份额，得到四侧份额均为 1/2；再由需求联立方程分母 D 得到反馈可解条件，由策略变量的非负要求得到额外阈值。",
      intuition:
        "如果网络效应过强或差异化过弱，用户会集中到某个平台，Hotelling 内部解就不再成立；因此性质分析必须先说明均衡所在的符号参数区域。",
      warnings: sharedWarnings,
    },
  ];
}

function createProjectId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  throw new Error("crypto.randomUUID is required to create a research project.");
}

function normalizeProjectModelSource(
  value: Partial<ModelSourceSettings> | undefined
): ModelSourceMetadata {
  const input = (value ?? {}) as Partial<OwnModelSourceInput>;
  const source = input.source ?? "paperforge";

  if (source !== "paperforge" && source !== "own") {
    throw new Error("Unknown model source.");
  }

  if (source === "paperforge") {
    return { source: "paperforge" };
  }

  const provider = input.provider;
  if (!provider) {
    throw new Error("Model provider is required for own model source.");
  }
  if (!isModelSourceProvider(provider)) {
    throw new Error(
      "Only OpenAI and OpenAI-compatible model providers are supported."
    );
  }
  const apiKey = trimOptional(input.apiKey);
  if (!apiKey) {
    throw new Error("API key is required for own model source.");
  }
  const model = trimOptional(input.model);
  if (!model) {
    throw new Error("Model is required for own model source.");
  }

  const metadata: ModelSourceMetadata = {
    source,
    provider,
    model,
    hasBrowserApiKey: true,
  };
  const baseUrl = trimEndpoint(input.baseUrl);

  if (COMPATIBLE_PROVIDERS.has(provider)) {
    if (!baseUrl) {
      throw new Error("Base URL is required for compatible model provider.");
    }
    metadata.baseUrl = baseUrl;
  } else if (baseUrl) {
    metadata.baseUrl = baseUrl;
  }

  return metadata;
}

type OwnModelSourceInput = {
  source: string;
  provider?: string;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
};

function isModelSourceProvider(value: string): value is ModelSourceProvider {
  return (
    value === "openai" ||
    value === "openai-compatible"
  );
}

function trimOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function trimEndpoint(value: unknown): string | undefined {
  const trimmed = trimOptional(value);
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, "");
}
