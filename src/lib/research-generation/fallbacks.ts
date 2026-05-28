import type {
  EquilibriumResult,
  HotellingModel,
  PropertyAnalysis,
  ResearchDirection,
  ResearchProject,
  ResearchSessionMessage,
  SymbolDefinition,
} from "../types";
import {
  adoptResearchDirection,
  createExplorationProject,
  createResearchSymbolRegistryForDirection,
} from "../research-session.ts";
import {
  mergeSymbolRegistries,
  normalizeSymbolRegistry,
} from "../symbol-governance.ts";
import { filterFloatingMechanismSymbols } from "../research-model-solvability.ts";
import { createConfirmedRepairProposalPatch } from "../research-confirmed-repair-patch.ts";
import { resolvePromptSymbols } from "./prompts.ts";
import type { JsonValue, ResearchAssetPatch, ResearchGenerationResponse } from "./types.ts";

export function createBuildFallback(
  project: ResearchProject,
  selectedDirectionId: string | undefined,
  userMessage: string | undefined
): ResearchGenerationResponse {
  const scaffoldProject =
    project.researchSession?.directions.length
      ? project
      : createExplorationProject({
          id: project.id,
          rawIdea: project.rawIdea,
          now: project.createdAt,
        });
  const directionId =
    selectedDirectionId ??
    scaffoldProject.researchSession?.directions.find((direction) => direction.recommended)?.id ??
    scaffoldProject.researchSession?.directions[0]?.id;

  if (!directionId) {
    return {
      project: scaffoldProject,
      usedFallback: true,
      assistantMessage: scaffoldProject.researchSession?.messages.at(-1)?.content ?? "",
    };
  }

  try {
    const adopted = appendUserMessageToProject(
      adoptResearchDirection(scaffoldProject, directionId),
      userMessage
    );
    return {
      project: adopted,
      usedFallback: true,
      assistantMessage: adopted.researchSession?.messages.at(-1)?.content ?? "",
    };
  } catch {
    const recommended = scaffoldProject.researchSession?.directions.find((direction) => direction.recommended);
    if (recommended && recommended.id !== directionId) {
      const adopted = appendUserMessageToProject(
        adoptResearchDirection(scaffoldProject, recommended.id),
        userMessage
      );
      return {
        project: adopted,
        usedFallback: true,
        assistantMessage: adopted.researchSession?.messages.at(-1)?.content ?? "",
      };
    }
    throw new Error("No deterministic model scaffold is available.");
  }
}

export function appendUserMessageToProject(
  project: ResearchProject,
  userMessage: string | undefined
): ResearchProject {
  const trimmed = userMessage?.trim();
  if (!trimmed || !project.researchSession) return project;
  const messages = project.researchSession.messages;
  const insertIndex =
    messages.length > 0 && messages[messages.length - 1].role === "assistant"
      ? messages.length - 1
      : messages.length;
  const userEntry: ResearchSessionMessage = {
    id: `msg-user-model-fallback-${Date.now()}`,
    role: "user",
    content: trimmed,
    createdAt: 0,
  };

  return {
    ...project,
    researchSession: {
      ...project.researchSession,
      messages: [
        ...messages.slice(0, insertIndex),
        userEntry,
        ...messages.slice(insertIndex),
      ],
    },
  };
}

export function createMinimalSolvableModelForDirection(
  direction: ResearchDirection | undefined,
  providerModel: HotellingModel
): HotellingModel {
  const directionLine = direction
    ? `当前研究方向：${direction.title}。`
    : "当前研究方向保留为用户选择的主题。";

  return {
    symbols: mergeSymbolRegistries(
      createResearchSymbolRegistryForDirection(direction),
      filterFloatingMechanismSymbols(
        providerModel,
        normalizeSymbolRegistry(providerModel.symbols)
      )
    ),
    sides: providerModel.sides,
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing-solvable",
        order: 1,
        name: "平台同时选择买方补贴与卖方佣金",
        decisions: ["\\tau_A", "\\tau_B", "s_A", "s_B"],
      },
      {
        id: "stage-participation-solvable",
        order: 2,
        name: "买家和卖家根据 Hotelling 无差异条件选择平台",
        decisions: ["n_A^B", "n_B^B", "n_A^S", "n_B^S"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a-solvable",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + \\alpha_B n_A^S + s_A - p - t_B x",
        notes:
          "买家选择平台 A 时获得卖家规模带来的跨边效应和平台 A 的补贴。",
      },
      {
        id: "u-buyer-b-solvable",
        side: "consumer",
        platform: "B",
        expression: "U_B^B = v_B + \\alpha_B n_B^S + s_B - p - t_B(1-x)",
        notes: "买家选择平台 B 时承担到右端平台的差异化成本。",
      },
      {
        id: "u-seller-a-solvable",
        side: "merchant",
        platform: "A",
        expression: "U_A^S = v_S + \\alpha_S n_A^B - \\tau_A q - t_S y",
        notes:
          "卖家选择平台 A 时获得买家规模效应，并按成交价值支付佣金。",
      },
      {
        id: "u-seller-b-solvable",
        side: "merchant",
        platform: "B",
        expression: "U_B^S = v_S + \\alpha_S n_B^B - \\tau_B q - t_S(1-y)",
        notes: "卖家选择平台 B 的效用与 A 侧保持对称结构。",
      },
    ],
    demandDerivation:
      "由买家无差异条件 U_A^B=U_B^B 与卖家无差异条件 U_A^S=U_B^S 推出 n_A^B、n_A^S，再代入平台利润函数写一阶条件。",
    profitFunctions: [
      {
        id: "profit-a-solvable",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "平台 A 的佣金收入减去买方补贴成本。",
      },
      {
        id: "profit-b-solvable",
        platform: "B",
        expression: "\\Pi_B = \\tau_B q n_B^S n_B^B - s_B n_B^B",
        notes: "平台 B 使用相同结构，便于形成可求解的一阶条件系统。",
      },
    ],
    assumptions: [
      "两个平台位于 Hotelling 线段两端，买家和卖家均单归属。",
      "买家和卖家均受到对侧参与规模的正向跨边网络效应影响。",
      "平台先同时选择卖方佣金 \\tau_i 与买方补贴 s_i。",
      "本轮先把机制项收窄为最小可求解结构，避免未定义函数进入均衡求解。",
      directionLine,
    ],
    modelSetupDraft:
      `${directionLine}\n\n` +
      "模型已收窄为最小可求解的双边 Hotelling 结构：平台选择 \\tau_A、\\tau_B、s_A、s_B，用户参与份额由两侧无差异条件推出，平台利润为佣金收入扣除补贴成本。\n\n" +
      "如果后续要恢复更具体的机制变量，应先给出显式效用项、成本项和收益项，再重新生成符号均衡。",
  };
}

export function createNarrowedModelAssistantMessage(
  assistantMessage: string,
  issues: string[]
) {
  return [
    "我已把模型设定收窄为一版最小可求解模型，右侧模型页会先使用这版进入符号均衡。",
    "",
    assistantMessage,
    "",
    `收窄原因：${issues.join("；")}。`,
  ].join("\n");
}

export function appendConversationMessages(
  project: ResearchProject,
  userMessage: string,
  assistantMessage: string
): ResearchProject {
  const session =
    project.researchSession ??
    createExplorationProject({
      id: project.id,
      rawIdea: project.rawIdea,
      now: project.createdAt,
    }).researchSession;
  if (!session) return project;
  const createdAt = Date.now();

  return {
    ...project,
    researchSession: {
      ...session,
      directions: session.directions,
      messages: [
        ...session.messages,
        {
          id: `msg-user-conversation-${createdAt}`,
          role: "user",
          content: userMessage,
          createdAt: 0,
        },
        {
          id: `msg-assistant-conversation-${createdAt}`,
          role: "assistant",
          content: assistantMessage,
          createdAt: 0,
        },
      ],
      assetSummary: session.assetSummary ?? {
        confirmedAssumptions: [],
        utilityFunctions: [],
        equilibriumStatus: "not_started",
        nextActions: ["选择一个研究方向"],
      },
    },
  };
}

export function attachEquilibriumResult(
  project: ResearchProject,
  equilibriumResult: EquilibriumResult,
  assistantMessage: string
): ResearchProject {
  const session =
    project.researchSession ?? createExplorationProject({
      id: project.id,
      rawIdea: project.rawIdea,
      now: project.createdAt,
    }).researchSession;
  const messages: ResearchSessionMessage[] = [
    ...(session?.messages ?? []),
    {
      id: `msg-start-equilibrium-provider-${Date.now()}`,
      role: "user",
      content: "开始符号均衡求解。",
      createdAt: 0,
    },
    {
      id: `msg-equilibrium-provider-${Date.now()}`,
      role: "assistant",
      content: assistantMessage,
      createdAt: 0,
    },
  ];
  const hasSolvedEquilibrium = equilibriumResult.status === "solved";

  return {
    ...project,
    equilibriumResult,
    researchSession: {
      ...session,
      phase: "equilibrium",
      directions: session?.directions ?? [],
      messages,
      assetSummary: {
        ...(session?.assetSummary ?? {
          confirmedAssumptions: [],
          utilityFunctions: [],
          equilibriumStatus: "not_started" as const,
          nextActions: [],
        }),
        equilibriumStatus: equilibriumResult.status,
        pendingDecision: hasSolvedEquilibrium
          ? {
              kind: "analyze_properties",
              prompt:
                "符号均衡结果已经生成。下一步可以对佣金、补贴、网络效应和差异化成本做符号性质分析。",
            }
          : {
              kind: "solve_equilibrium",
              prompt:
                "当前只得到符号推导草稿，还没有闭式均衡解。请先收窄模型或重新生成符号均衡。",
            },
        nextActions: hasSolvedEquilibrium
          ? [
              "检查符号均衡推导",
              "复制并运行 SymPy 求解代码",
              "生成性质分析",
            ]
          : [
              "检查模型是否过于复杂",
              "收窄策略变量或机制方程",
              "重新生成闭式均衡",
            ],
      },
    },
  };
}

export function attachPropertyAnalyses(
  project: ResearchProject,
  analyses: PropertyAnalysis[],
  assistantMessage: string
): ResearchProject {
  const session =
    project.researchSession ?? createExplorationProject({
      id: project.id,
      rawIdea: project.rawIdea,
      now: project.createdAt,
    }).researchSession;
  const messages: ResearchSessionMessage[] = [
    ...(session?.messages ?? []),
    {
      id: `msg-start-analysis-provider-${Date.now()}`,
      role: "user",
      content: "生成性质分析。",
      createdAt: 0,
    },
    {
      id: `msg-analysis-provider-${Date.now()}`,
      role: "assistant",
      content: assistantMessage,
      createdAt: 0,
    },
  ];

  return {
    ...project,
    propertyAnalyses: analyses,
    researchSession: {
      ...session,
      phase: "analysis",
      directions: session?.directions ?? [],
      messages,
      assetSummary: {
        ...(session?.assetSummary ?? {
          confirmedAssumptions: [],
          utilityFunctions: [],
          equilibriumStatus: project.equilibriumResult?.status ?? "not_started",
          nextActions: [],
        }),
        equilibriumStatus: project.equilibriumResult?.status ?? "not_started",
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

export function createConversationFallbackMessage(
  project: ResearchProject,
  userMessage: string
) {
  if (createConversationFallbackAssetPatch(project, userMessage)) {
    return "I created a pending model change for the right-side review panel. Apply it there when the edit looks correct.";
  }

  const symbolHighlights = resolvePromptSymbols(project)
    .filter((symbol) => symbol.recommended)
    .slice(0, 4)
    .map((symbol) => symbol.symbol)
    .join("、");

  if (/^(你好|hello|hi|嗨|在吗)[！!。.\s]*$/i.test(userMessage)) {
    return `你好，我在。当前符号表里已经有 ${symbolHighlights || "一些核心记号"}。你可以直接问我某个符号是什么意思，或者说要把哪一个记号改成你想用的写法。`;
  }

  if (/(符号|记号|notation|变量|字母|tau|alpha|beta|kappa|kappa|f\b)/i.test(userMessage)) {
    return `我已经看见你在问记号了。当前可用的核心符号包括 ${symbolHighlights || "当前模型符号"}。你可以直接说要改哪个符号、补哪个定义，或者让我把右侧符号表展开出来。`;
  }

  const phase = project.researchSession?.phase;
  if (phase === "direction") {
    return `我已经记录这个想法。当前还在方向发现阶段，你可以直接问我这条方向为什么成立、怎么收窄，或者让我先把符号表补齐到可建模状态。`;
  }

  if (phase === "model") {
    return `我已经保留当前模型草稿。你可以直接问我某个假设为什么这样写，或者明确说要改哪一个符号。`;
  }

  if (phase === "equilibrium") {
    return `我已经保留当前均衡草稿。你可以直接问我推导哪一步，或者明确要求我重做均衡并沿用现有符号。`;
  }

  return `我已经保留当前性质分析草稿。你可以直接问我哪条命题为什么这样写，或者明确要求我重做性质分析并统一符号。`;
}

export function createConversationPatchFallbackMessage(patch: ResearchAssetPatch) {
  const kindLabel =
    patch.kind === "update_model"
      ? "模型"
      : patch.kind === "update_equilibrium"
        ? "均衡"
        : "性质分析";

  return `已生成一条${kindLabel}修改建议，右侧会显示为待应用修改。你可以先查看具体改动，确认无误后点击“应用”；应用后再重新生成受影响的后续资产。`;
}

export function createConversationFallbackAssetPatch(
  project: ResearchProject,
  userMessage: string
): ResearchAssetPatch | null {
  if (!project.hotellingModel) return null;

  const affirmedModelProposalPatch = createAffirmedModelProposalPatch(
    project,
    userMessage
  );
  if (affirmedModelProposalPatch) return affirmedModelProposalPatch;

  const confirmedRepairPatch = createConfirmedRepairProposalPatch(
    project,
    userMessage
  );
  if (confirmedRepairPatch) return confirmedRepairPatch;

  const englishRenameMatch = userMessage.match(
    /(?:change|rename|replace)\s+([\\A-Za-z][\\A-Za-z0-9_{}^]*)\s+(?:to|as|with)\s+([\\A-Za-z][\\A-Za-z0-9_{}^]*)/i
  );
  if (englishRenameMatch) {
    const currentSymbol = findSymbolByNotation(
      project.hotellingModel.symbols,
      englishRenameMatch[1]
    );
    const nextNotation = englishRenameMatch[2];
    if (!currentSymbol) return null;

    return {
      kind: "update_model",
      summary: `Rename symbol ${currentSymbol.symbol} to ${nextNotation}`,
      changes: [
        {
          target: `hotellingModel.symbols[${currentSymbol.codeName}].symbol`,
          op: "set",
          value: nextNotation,
          reason: "User requested a symbol notation change.",
        },
      ],
    };
  }

  const renameMatch = userMessage.match(
    /把\s*([\\A-Za-z][\\A-Za-z0-9_{}^]*)\s*(?:这个)?(?:符号|记号|变量)?\s*(?:改成|改为|换成)\s*([\\A-Za-z][\\A-Za-z0-9_{}^]*)/i
  );
  if (renameMatch) {
    const currentSymbol = findSymbolByNotation(
      project.hotellingModel.symbols,
      renameMatch[1]
    );
    const nextNotation = renameMatch[2];
    if (!currentSymbol) return null;

    return {
      kind: "update_model",
      summary: `把符号 ${currentSymbol.symbol} 改为 ${nextNotation}`,
      changes: [
        {
          target: `hotellingModel.symbols[${currentSymbol.codeName}].symbol`,
          op: "set",
          value: nextNotation,
          reason: "用户要求统一符号写法。",
        },
      ],
    };
  }

  const definitionMatch = userMessage.match(
    /(?:把\s*)?([\\A-Za-z][\\A-Za-z0-9_{}^]*)\s*(?:定义为|设为|表示|含义是)\s*([^。；;\n]{2,80})/i
  );
  if (definitionMatch) {
    const notation = definitionMatch[1];
    const meaning = definitionMatch[2].trim();
    const currentSymbol = findSymbolByNotation(project.hotellingModel.symbols, notation);

    if (currentSymbol) {
      return {
        kind: "update_model",
        summary: `补充符号 ${currentSymbol.symbol} 的含义`,
        changes: [
          {
            target: `hotellingModel.symbols[${currentSymbol.codeName}].meaning`,
            op: "set",
            value: meaning,
            reason: "用户要求补充符号定义。",
          },
        ],
      };
    }

    return {
      kind: "update_model",
      summary: `新增符号 ${notation} 的定义`,
      changes: [
        {
          target: "hotellingModel.symbols",
          op: "insert",
          value: createSymbolPatchValue(notation, meaning),
          reason: "用户要求新增符号定义。",
        },
      ],
    };
  }

  return null;
}

function createAffirmedModelProposalPatch(
  project: ResearchProject,
  userMessage: string
): ResearchAssetPatch | null {
  const model = project.hotellingModel;
  if (!model || !isAffirmativeConversationConfirmation(userMessage)) {
    return null;
  }

  const proposal = findRecentAssistantModelProposal(project);
  if (!proposal) return null;

  if (/多归属|multi[-\s]?homing|multihoming/i.test(proposal)) {
    return createSellerMultihomingPatch(model);
  }

  return null;
}

function isAffirmativeConversationConfirmation(userMessage: string) {
  const text = userMessage.trim().toLowerCase();
  if (!text) return false;
  if (/(不接受|先不|不要|拒绝|取消|算了)/.test(text)) return false;

  return (
    /^(确认|接受|同意|可以|好的|好|行|按这个|就这样|采纳|应用|批准)[。！？!?\s]*$/.test(
      text
    ) ||
    /(确认|接受|同意|按这个|就这样|采纳|应用|批准).{0,12}(修改|方案|方向|模型|写入|处理|执行|生成|更新|应用)?/.test(
      text
    )
  );
}

function findRecentAssistantModelProposal(project: ResearchProject) {
  const messages = project.researchSession?.messages ?? [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;

    const content = message.content.trim();
    if (!content) continue;

    const asksForAcceptance = /(是否接受|是否确认|如果你确认|如果确认|确认这个|接受这个|下一步)/.test(
      content
    );
    const hasModelProposal = /(模型|设定|效用函数|需求推导|利润函数|符号|均衡)/.test(
      content
    );

    if (asksForAcceptance && hasModelProposal) return content;
  }

  return null;
}

function createSellerMultihomingPatch(
  model: HotellingModel
): ResearchAssetPatch {
  const changes: ResearchAssetPatch["changes"] = [];
  const multihomingAssumption =
    "买家仍保持单归属，卖家可以选择只加入平台 A、只加入平台 B 或同时加入两个平台。";
  const singleHomingIndex = model.assumptions.findIndex(
    (assumption) => /买家.*卖家.*单归属|卖家.*单归属/.test(assumption)
  );

  changes.push({
    target:
      singleHomingIndex >= 0
        ? `hotellingModel.assumptions[${singleHomingIndex}]`
        : "hotellingModel.assumptions",
    op: singleHomingIndex >= 0 ? "set" : "insert",
    value: multihomingAssumption,
    reason: "用户确认采用卖家多归属扩展。",
  });

  if (
    !model.symbols.some(
      (symbol) =>
        symbol.codeName === "n_AB_S" || symbol.symbol === "n_{AB}^S"
    )
  ) {
    changes.push({
      target: "hotellingModel.symbols",
      op: "insert",
      value: {
        id: "symbol-n-ab-s",
        symbol: "n_{AB}^S",
        baseSymbol: "n",
        subscript: "AB",
        superscript: "S",
        codeName: "n_AB_S",
        name: "双归属卖家规模",
        meaning: "同时加入平台 A 和平台 B 的卖家数量或份额。",
        role: "demand",
        side: "merchant",
        assumption: "0 <= n_{AB}^S <= 1",
        recommended: true,
      },
      reason: "卖家多归属模型需要记录同时加入两个平台的卖家规模。",
    });
  }

  if (
    !model.utilityFunctions.some((utility) => utility.id === "u-seller-ab")
  ) {
    changes.push({
      target: "hotellingModel.utilityFunctions",
      op: "insert",
      value: {
        id: "u-seller-ab",
        side: "merchant",
        platform: "AB",
        expression:
          "U_{AB}^S = v_S + \\alpha_S (n_A^B + n_B^B) - (\\tau_A + \\tau_B) q - t_S",
        notes:
          "卖家同时加入两个平台的效用；运输或运营成本先以线性叠加形式保留，后续可再细化为独立多归属成本。",
      },
      reason: "用户确认引入卖家同时加入两个平台的效用。",
    });
  }

  changes.push({
    target: "hotellingModel.demandDerivation",
    op: "set",
    value: appendUniqueParagraphs(model.demandDerivation, [
      "卖家多归属扩展：买家仍满足 n_A^B+n_B^B=1；卖家可只加入 A、只加入 B 或同时加入两边，因此总卖家规模满足 n_A^S+n_B^S-n_{AB}^S=1。后续求解应比较 U_A^S、U_B^S 与 U_{AB}^S 的参与剩余，再把对应的卖家规模代入平台利润函数。",
    ]),
    reason: "把已确认的多归属参与条件写入需求推导，避免后续均衡仍按单归属求解。",
  });

  changes.push({
    target: "hotellingModel.modelSetupDraft",
    op: "set",
    value: appendUniqueParagraphs(model.modelSetupDraft, [
      "用户已确认采用卖家多归属扩展：卖家可以同时加入两个平台，买家暂保持单归属。模型需要显式跟踪 n_A^S、n_B^S 与 n_{AB}^S，并在均衡求解前说明当前使用的是完整多归属系统还是收窄后的活跃多归属区域。",
    ]),
    reason: "把聊天中确认的模型扩展同步到结构化模型摘要。",
  });

  return {
    kind: "update_model",
    summary: "应用卖家多归属模型扩展",
    changes,
  };
}

function appendUniqueParagraphs(base: string, paragraphs: string[]) {
  const additions = paragraphs
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph && !base.includes(paragraph));
  if (additions.length === 0) return base;

  return [base.trim(), ...additions].filter(Boolean).join("\n\n");
}

function findSymbolByNotation(
  symbols: SymbolDefinition[],
  notation: string
): SymbolDefinition | undefined {
  const needle = notation.trim();
  return symbols.find(
    (symbol) =>
      symbol.symbol === needle ||
      symbol.codeName === needle ||
      symbol.baseSymbol === needle ||
      `${symbol.baseSymbol}_${symbol.subscript ?? ""}` === needle
  );
}

function createSymbolPatchValue(notation: string, meaning: string): JsonValue {
  const parsed = parseSimpleNotation(notation);
  return {
    symbol: formatSimpleNotation(parsed),
    baseSymbol: parsed.baseSymbol,
    subscript: parsed.subscript,
    superscript: parsed.superscript,
    codeName: [parsed.baseSymbol, parsed.subscript, parsed.superscript]
      .filter(Boolean)
      .join("_")
      .replace(/\\/g, "")
      .replace(/[^A-Za-z0-9_]/g, "_"),
    name: formatSimpleNotation(parsed),
    meaning,
    role: "parameter",
    side: "global",
    assumption: "real",
    recommended: false,
  };
}

function parseSimpleNotation(notation: string) {
  const cleaned = notation.trim();
  const match = cleaned.match(/^(.+?)(?:_\{?([^}^{]+)\}?)?(?:\^\{?([^}^{]+)\}?)?$/);
  return {
    baseSymbol: match?.[1]?.trim() || cleaned || "x",
    subscript: match?.[2]?.trim() ?? "",
    superscript: match?.[3]?.trim() ?? "",
  };
}

function formatSimpleNotation({
  baseSymbol,
  subscript,
  superscript,
}: {
  baseSymbol: string;
  subscript?: string;
  superscript?: string;
}) {
  return `${baseSymbol}${subscript ? `_${subscript}` : ""}${
    superscript ? `^${superscript}` : ""
  }`;
}
