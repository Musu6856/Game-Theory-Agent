import test from "node:test";
import assert from "node:assert/strict";

import {
  createDiscoverPrompt,
  extractFirstJsonObject,
  parseDirections,
  generateResearchProject,
} from "./ai-research-generation.ts";
import {
  createBuildPrompt,
  createDiscoverPrompt as createDiscoverPromptFromResearchGenerationPrompts,
} from "./research-generation/prompts.ts";
import {
  extractFirstJsonObject as extractFirstJsonObjectFromResearchGenerationParsers,
} from "./research-generation/parsers.ts";
import {
  isSymbolicEquilibriumResult,
} from "./research-generation/quality-gates.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generateSymbolicEquilibrium,
} from "./research-session.ts";

function createOpennessRevenueShareModel() {
  return {
    symbols: [
      {
        id: "sym-o-a",
        symbol: "o_A",
        baseSymbol: "o",
        subscript: "A",
        codeName: "o_A",
        name: "Platform A openness",
        meaning: "Platform A model openness level.",
        role: "decision",
        side: "platform",
        assumption: "0 <= o_A <= 1",
        recommended: true,
      },
      {
        id: "sym-o-b",
        symbol: "o_B",
        baseSymbol: "o",
        subscript: "B",
        codeName: "o_B",
        name: "Platform B openness",
        meaning: "Platform B model openness level.",
        role: "decision",
        side: "platform",
        assumption: "0 <= o_B <= 1",
        recommended: true,
      },
      {
        id: "sym-tau-a",
        symbol: "\\tau_A",
        baseSymbol: "\\tau",
        subscript: "A",
        codeName: "tau_A",
        name: "Platform A creator revenue share",
        meaning: "Share of generated revenue paid to creators on platform A.",
        role: "decision",
        side: "platform",
        assumption: "0 <= \\tau_A <= 1",
        recommended: true,
      },
      {
        id: "sym-tau-b",
        symbol: "\\tau_B",
        baseSymbol: "\\tau",
        subscript: "B",
        codeName: "tau_B",
        name: "Platform B creator revenue share",
        meaning: "Share of generated revenue paid to creators on platform B.",
        role: "decision",
        side: "platform",
        assumption: "0 <= \\tau_B <= 1",
        recommended: true,
      },
    ],
    sides: {
      consumerSideName: "users",
      merchantSideName: "creators",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-openness-share",
        order: 1,
        name: "Platforms choose openness and creator revenue share.",
        decisions: ["o_A", "o_B", "\\tau_A", "\\tau_B"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-user-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^U=v_U+\\beta o_A+\\eta n_A^C-t_U x",
        notes: "User utility on platform A.",
      },
      {
        id: "u-creator-a",
        side: "merchant",
        platform: "A",
        expression: "U_A^C=v_C+\\tau_A r n_A^U+\\gamma o_A-t_C y",
        notes: "Creator utility on platform A.",
      },
    ],
    demandDerivation:
      "Demand shares come from user and creator indifference conditions in openness and revenue-share differences.",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression:
          "\\Pi_A=(1-\\tau_A) r n_A^U n_A^C - \\frac{c_o}{2} o_A^2",
        notes: "Platform A keeps residual revenue and pays openness cost.",
      },
      {
        id: "profit-b",
        platform: "B",
        expression:
          "\\Pi_B=(1-\\tau_B) r n_B^U n_B^C - \\frac{c_o}{2} o_B^2",
        notes: "Platform B keeps residual revenue and pays openness cost.",
      },
    ],
    assumptions: [
      "Two generative AI platforms compete for users and creators.",
      "Platforms choose openness and creator revenue share.",
      "No buyer subsidy decision is present in this model.",
    ],
    modelSetupDraft:
      "Two generative AI platforms choose model openness and creator revenue share.",
  };
}

test("direction discovery prompt excludes empirical and simulation-only directions", () => {
  const messages = createDiscoverPrompt("研究二手交易平台佣金与补贴策略");
  const systemPrompt = messages[0].content;

  assert.match(systemPrompt, /Hotelling/);
  assert.match(systemPrompt, /symbolic equilibrium solving/);
  assert.match(systemPrompt, /empirical/);
  assert.match(systemPrompt, /simulation-only/);
  assert.equal(messages[0].role, "developer");
});

test("research-generation prompt module builds the discovery prompt", () => {
  const messages = createDiscoverPromptFromResearchGenerationPrompts(
    "Research secondhand platform pricing"
  );
  const systemPrompt = messages[0].content;

  assert.equal(messages[0].role, "developer");
  assert.match(systemPrompt, /Hotelling/);
  assert.match(systemPrompt, /symbolic equilibrium solving/);
});

test("model-building prompt asks for a solvable subsidy core", () => {
  const messages = createBuildPrompt(
    {
      action: "build_model",
      rawIdea: "研究二手平台佣金和买家补贴",
    },
    []
  );
  const systemPrompt = messages[0].content;
  const shapePrompt = messages[1].content;

  assert.match(systemPrompt, /two-decision solvable core/);
  assert.match(systemPrompt, /\+s_i/);
  assert.match(systemPrompt, /-s_i n_i\^B/);
  assert.match(shapePrompt, /s_A/);
  assert.match(shapePrompt, /\\tau_A q n_A\^S n_A\^B - s_A n_A\^B/);
});

test("direction parser accepts localized contribution keys from providers", () => {
  const directions = parseDirections([
    {
      id: "d1",
      title: "二手平台佣金与补贴策略",
      summary: "研究平台如何同时选择买家和卖家侧收费或补贴。",
      model: "双边 Hotelling 平台竞争模型",
      贡献: "刻画双边收费与补贴的均衡机制。",
      recommended: true,
    },
    {
      id: "d2",
      title: "质量披露与信任机制",
      summary: "研究验货机制如何影响参与。",
      model: "信号博弈模型",
      贡献: "解释质量筛选。",
      recommended: false,
    },
    {
      id: "d3",
      title: "卖家多归属",
      summary: "研究多平台入驻。",
      model: "双边平台竞争模型",
      贡献: "解释多归属定价。",
      recommended: false,
    },
    {
      id: "d4",
      title: "平台差异化定位",
      summary: "研究差异化成本。",
      model: "Hotelling 模型",
      贡献: "解释定位与收费。",
      recommended: false,
    },
  ]);

  assert.equal(directions?.[0].contribution, "刻画双边收费与补贴的均衡机制。");
});

test("direction parser infers model labels when providers omit model", () => {
  const directions = parseDirections([
    {
      id: "d1",
      title: "Hotelling 平台竞争下的佣金策略",
      summary: "研究平台收费与补贴。",
      contribution: "形成可求解模型。",
      recommended: true,
    },
    {
      id: "d2",
      title: "双边市场网络效应",
      summary: "研究双边用户参与。",
      contribution: "解释网络效应。",
      recommended: false,
    },
    {
      id: "d3",
      title: "信号披露机制",
      summary: "研究信号传递。",
      contribution: "解释信任机制。",
      recommended: false,
    },
  ]);

  assert.equal(directions?.[0].model, "Hotelling 平台竞争模型");
  assert.equal(directions?.[1].model, "双边平台竞争模型");
  assert.equal(directions?.[2].model, "信号博弈模型");
});

test("extracts the first JSON object from fenced assistant text", () => {
  const extracted = extractFirstJsonObject(`
Before
\`\`\`json
{
  "assistantMessage": "Pick a direction",
  "directions": [
    {
      "id": "market-maker",
      "title": "Market maker entry",
      "summary": "Study entry and pricing.",
      "model": "Two-sided Hotelling",
      "contribution": "Explains subsidy timing.",
      "recommended": true
    }
  ]
}
\`\`\`
After`);

  assert.equal(extracted?.assistantMessage, "Pick a direction");
  assert.equal(extracted?.directions[0].id, "market-maker");
});

test("research-generation parser module extracts JSON objects", () => {
  const extracted = extractFirstJsonObjectFromResearchGenerationParsers(
    "before {\"ok\":true,\"value\":2} after"
  );

  assert.deepEqual(extracted, { ok: true, value: 2 });
});

test("research-generation quality gate accepts symbolic equilibrium results", () => {
  assert.equal(
    isSymbolicEquilibriumResult({
      status: "solved",
      concept: "Interior symbolic equilibrium",
      solvingSteps: ["Write FOCs"],
      focs: ["\\frac{\\partial \\Pi_i}{\\partial \\tau_i}=0"],
      conditions: ["q>0"],
      closedForm: "\\tau_i^*=\\frac{t}{2q}",
      derivation: "Solve the first-order conditions symbolically.",
      code: "sp.solve(focs, [tau_A, tau_B])",
      warnings: [],
    }),
    true
  );
});

test("invalid JSON falls back to deterministic direction discovery", async () => {
  const result = await generateResearchProject(
    {
      action: "discover_directions",
      rawIdea: "研究二手交易平台相关模型",
    },
    {
      now: 1710000000000,
      id: "11111111-1111-4111-8111-111111111111",
      complete: async () => "not json",
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "direction");
  assert.equal(result.project.researchSession?.directions.length, 4);
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "choose_direction"
  );
});

test("discover fallback returns direction phase when provider is unavailable", async () => {
  const result = await generateResearchProject(
    {
      action: "discover_directions",
      rawIdea: "研究二手交易平台相关模型",
    },
    {
      now: 1710000000000,
      id: "11111111-1111-4111-8111-111111111111",
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.projectType, "exploration");
  assert.equal(result.project.researchSession?.phase, "direction");
});

test("discover generation stores only model source metadata", async () => {
  const result = await generateResearchProject(
    {
      action: "discover_directions",
      rawIdea: "研究二手交易平台相关模型",
      modelSource: {
        source: "own",
        provider: "openai-compatible",
        model: "deepseek-chat",
        baseUrl: "https://api.deepseek.com/v1",
        hasBrowserApiKey: true,
      },
    },
    {
      now: 1710000000000,
      id: "11111111-1111-4111-8111-111111111111",
    }
  );

  assert.equal(result.project.modelSource?.source, "own");
  assert.equal("apiKey" in result.project.modelSource, false);
});

test("successful direction generation returns a persistable exploration project", async () => {
  const result = await generateResearchProject(
    {
      action: "discover_directions",
      rawIdea: "研究二手交易平台相关模型",
    },
    {
      now: 1710000000000,
      id: "11111111-1111-4111-8111-111111111111",
      complete: async () =>
        JSON.stringify({
          assistantMessage: "可以先比较佣金、补贴和信任机制三个方向。",
          directions: [
            {
              id: "commission-subsidy",
              title: "佣金与补贴策略",
              summary: "研究平台如何对买卖双方收费或补贴。",
              model: "双边 Hotelling 平台竞争模型",
              contribution: "解释收费与补贴结构。",
              recommended: true,
            },
            {
              id: "trust",
              title: "信任机制",
              summary: "研究验货担保如何影响参与。",
              model: "信号博弈",
              contribution: "解释质量披露。",
              recommended: false,
            },
            {
              id: "multihoming",
              title: "多归属",
              summary: "研究卖家多平台入驻。",
              model: "双边平台竞争",
              contribution: "解释平台锁定。",
              recommended: false,
            },
          ],
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.project.projectType, "exploration");
  assert.equal(result.project.researchSession?.directions.length, 3);
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "choose_direction"
  );
});

test("build fallback enters model phase for a recommended direction", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.projectType, "formal");
  assert.equal(result.project.researchSession?.phase, "model");
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "answer_model_question"
  );
  assert.ok(result.project.hotellingModel);
  assert.ok(result.project.equilibriumResult);
});

test("build fallback honors a selected non-recommended direction", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform seller multihoming",
    now: 1710000000000,
  });

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "seller-multihoming-pricing",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.projectType, "formal");
  assert.equal(result.project.researchSession?.phase, "model");
  assert.equal(
    result.project.researchSession?.assetSummary.currentDirection?.id,
    "seller-multihoming-pricing"
  );
  assert.equal(
    result.project.refinedIdea,
    project.researchSession?.directions.find(
      (direction) => direction.id === "seller-multihoming-pricing"
    )?.title
  );
  assert.match(
    result.project.hotellingModel?.modelSetupDraft ?? "",
    /卖家多归属|多归属成本|符号求解/
  );
});

test("successful model generation appends userMessage before assistant message", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform pricing",
    now: 1710000000000,
  });
  const model = {
    symbols: [],
    sides: {
      consumerSideName: "buyers",
      merchantSideName: "sellers",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "platforms set commission and subsidy",
        decisions: ["\\tau_i", "s_i"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + s_A - t_B x",
        notes: "Buyer utility on platform A.",
      },
    ],
    demandDerivation: "Derive demand from indifferent buyers and sellers.",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "Commission revenue net of subsidy.",
      },
    ],
    assumptions: ["Two platforms sit at the ends of a Hotelling line."],
    modelSetupDraft: "A two-platform Hotelling setup with commissions and buyer subsidies.",
  };
  const userMessage = "Please include seller verification costs.";
  const assistantMessage = "I added verification costs to the model setup.";

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      userMessage,
      project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage,
          hotellingModel: model,
        }),
    }
  );

  const messages = result.project.researchSession?.messages ?? [];

  assert.equal(result.usedFallback, false);
  assert.equal(messages.at(-2)?.role, "user");
  assert.equal(messages.at(-2)?.content, userMessage);
  assert.equal(messages.at(-1)?.role, "assistant");
  assert.equal(messages.at(-1)?.content, assistantMessage);
  assert.ok(
    result.project.hotellingModel?.symbols.some(
      (symbol) => symbol.codeName === "tau_A" && symbol.meaning.includes("佣金")
    )
  );
  assert.ok(
    result.project.hotellingModel?.symbols.some(
      (symbol) => symbol.codeName === "s_A" && symbol.meaning.includes("补贴")
    )
  );
});

test("successful model generation includes an equilibrium scaffold for confirmation", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });
  const model = {
    symbols: [],
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "平台选择佣金和补贴",
        decisions: ["\\tau_i", "s_i"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + \\alpha_B n_A^S + s_A - t_B x",
        notes: "买家选择平台 A 的效用。",
      },
    ],
    demandDerivation: "由两侧无差异条件推导需求份额。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "佣金收入减补贴成本。",
      },
    ],
    assumptions: ["两平台位于 Hotelling 线段两端。"],
    modelSetupDraft: "考虑两个二手交易平台的佣金与补贴竞争。",
  };

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "我先给出一版可求解模型。",
          hotellingModel: model,
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.project.researchSession?.phase, "model");
  assert.ok(result.project.hotellingModel);
  assert.ok(result.project.equilibriumResult);
  assert.equal(result.project.equilibriumResult?.status, "needs_revision");
  assert.match(result.project.equilibriumResult?.derivation ?? "", /等待用户确认/);
});

test("successful model generation grounds the equilibrium scaffold in provider model decisions", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea:
      "Generative AI platform openness and creator revenue-share competition",
    now: 1710000000000,
  });

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage:
            "I drafted an openness and creator revenue-share model.",
          hotellingModel: createOpennessRevenueShareModel(),
        }),
    }
  );
  const equilibrium = result.project.equilibriumResult;
  const scaffoldText = [
    equilibrium?.concept,
    ...(equilibrium?.solvingSteps ?? []),
    ...(equilibrium?.focs ?? []),
    equilibrium?.closedForm,
    equilibrium?.derivation,
    ...(equilibrium?.warnings ?? []),
  ].join("\n");

  assert.equal(result.usedFallback, false);
  assert.equal(equilibrium?.status, "needs_revision");
  assert.match(scaffoldText, /o_A/);
  assert.match(scaffoldText, /\\tau_A/);
  assert.doesNotMatch(scaffoldText, /s_i|s_A|s_B/);
});

test("model generation narrows unresolved mechanism functions before storing assets", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research short-video vertical content and user stickiness",
    now: 1710000000000,
  });
  const unresolvedProviderModel = {
    symbols: [],
    sides: {
      consumerSideName: "users",
      merchantSideName: "creators",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-mechanism",
        order: 1,
        name: "platform mechanism choice",
        decisions: ["\\tau_A", "\\tau_B", "a_d"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-user-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + \\psi_A(\\mu_d) - t_B x",
        notes: "Provider left mechanism utility unresolved.",
      },
    ],
    demandDerivation: "Demand follows from indifference.",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B + R_A(\\mu_d) - C_A(a_d)",
        notes: "Provider left revenue and cost as functions.",
      },
    ],
    assumptions: ["Two platforms compete on a Hotelling line."],
    modelSetupDraft: "A direction-specific mechanism model with unresolved functions.",
  };

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "quality-disclosure-trust",
      project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "I drafted the mechanism model.",
          hotellingModel: unresolvedProviderModel,
        }),
    }
  );
  const storedModelText = [
    result.project.hotellingModel?.modelSetupDraft,
    ...(result.project.hotellingModel?.utilityFunctions.map((entry) => entry.expression) ?? []),
    ...(result.project.hotellingModel?.profitFunctions.map((entry) => entry.expression) ?? []),
  ].join("\n");

  assert.equal(result.usedFallback, false);
  assert.doesNotMatch(storedModelText, /\\(?:psi|phi)_|[RC]_[A-Z]\(/);
  assert.match(result.assistantMessage, /最小可求解|可求解模型/);
});

test("model generation does not keep floating exclusion multihoming symbols outside equations", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "外卖平台排他性协议与多归属",
    now: 1710000000000,
  });
  const floatingMechanismModel = {
    symbols: [
      {
        id: "a-d3",
        symbol: "a_d3",
        baseSymbol: "a",
        subscript: "d3",
        codeName: "a_d3",
        name: "排他协议与多归属机制强度",
        meaning: "平台排他性协议和商家多归属摩擦的机制占位符。",
        role: "decision",
        side: "platform",
        assumption: "0 <= a_d3 <= 1",
        recommended: true,
      },
    ],
    sides: {
      consumerSideName: "消费者",
      merchantSideName: "商家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "平台选择佣金和补贴",
        decisions: ["\\tau_A", "\\tau_B", "s_A", "s_B"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + s_A - t_B x",
        notes: "消费者效用没有写入 a_d3。",
      },
      {
        id: "u-seller-a",
        side: "merchant",
        platform: "A",
        expression: "U_A^S = v_S - \\tau_A q - t_S y",
        notes: "商家效用没有写入 a_d3。",
      },
    ],
    demandDerivation:
      "需求份额由买家和商家无差异条件推出；这里只在文字里提到排他协议和多归属。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "利润函数没有写入 a_d3。",
      },
      {
        id: "profit-b",
        platform: "B",
        expression: "\\Pi_B = \\tau_B q n_B^S n_B^B - s_B n_B^B",
        notes: "利润函数没有写入 a_d3。",
      },
    ],
    assumptions: [
      "平台位于 Hotelling 线段两端。",
      "排他协议与多归属机制暂时被写成 a_d3 占位符。",
    ],
    modelSetupDraft:
      "研究外卖平台排他性协议与多归属，但 a_d3 没有进入效用、需求或利润方程。",
  };

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "seller-multihoming-pricing",
      project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "我生成了排他协议与多归属模型。",
          hotellingModel: floatingMechanismModel,
        }),
    }
  );
  const storedModelText = [
    ...(result.project.hotellingModel?.symbols.map((entry) => entry.codeName) ?? []),
    result.project.hotellingModel?.modelSetupDraft,
    result.project.hotellingModel?.demandDerivation,
    ...(result.project.hotellingModel?.utilityFunctions.map((entry) => entry.expression) ?? []),
    ...(result.project.hotellingModel?.profitFunctions.map((entry) => entry.expression) ?? []),
  ].join("\n");

  assert.equal(result.usedFallback, false);
  assert.doesNotMatch(storedModelText, /a_d3/);
  assert.match(storedModelText, /多归属|multihoming|m_\{AB\}|m_AB|\\kappa/);
  assert.match(result.assistantMessage, /可求解|模型|机制/);
});

test("successful model generation populates right-side asset fields from the model", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });
  const model = {
    symbols: [],
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "平台选择佣金和补贴",
        decisions: ["\\tau_i", "s_i"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + s_A - t_B x",
        notes: "买家选择平台 A 的效用。",
      },
      {
        id: "u-seller-a",
        side: "merchant",
        platform: "A",
        expression: "U_A^S = v_S - \\tau_A q - t_S y",
        notes: "卖家选择平台 A 的效用。",
      },
    ],
    demandDerivation: "由两侧无差异条件推导需求份额。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "佣金收入减补贴成本。",
      },
    ],
    assumptions: ["两平台位于 Hotelling 线段两端。", "买卖双方单归属。"],
    modelSetupDraft: "考虑两个二手交易平台的佣金与补贴竞争。",
  };

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "我先给出一版可求解模型。",
          hotellingModel: model,
        }),
    }
  );
  const asset = result.project.researchSession?.assetSummary;

  assert.equal(result.usedFallback, false);
  assert.equal(asset?.currentDirection?.id, "secondhand-commission-subsidy-hotelling");
  assert.deepEqual(asset?.confirmedAssumptions, model.assumptions);
  assert.deepEqual(asset?.utilityFunctions, [
    "$U_A^B = v_B + s_A - t_B x$",
    "$U_A^S = v_S - \\tau_A q - t_S y$",
  ]);
  assert.equal(asset?.equilibriumStatus, "等待模型确认");
  assert.equal(asset?.pendingDecision?.kind, "answer_model_question");
  assert.ok(asset?.nextActions.includes("准备符号化一阶条件"));
});

test("successful model generation preserves provider asset summary fields", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });
  const model = {
    symbols: [],
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "平台选择佣金和补贴",
        decisions: ["\\tau_i", "s_i"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + s_A - t_B x",
        notes: "买家选择平台 A 的效用。",
      },
    ],
    demandDerivation: "由两侧无差异条件推导需求份额。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "佣金收入减补贴成本。",
      },
    ],
    assumptions: ["两平台位于 Hotelling 线段两端。"],
    modelSetupDraft: "考虑两个二手交易平台的佣金与补贴竞争。",
  };

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "我先给出一版可求解模型。",
          hotellingModel: model,
          assetSummary: {
            confirmedAssumptions: ["平台先同时选择双边收费。"],
            utilityFunctions: ["$U_i^B$", "$U_i^S$"],
            nextActions: ["确认双边收费符号", "准备一阶条件"],
            pendingDecision: {
              prompt: "请确认双边收费和补贴变量。",
            },
          },
        }),
    }
  );
  const asset = result.project.researchSession?.assetSummary;

  assert.equal(result.usedFallback, false);
  assert.deepEqual(asset?.confirmedAssumptions, ["平台先同时选择双边收费。"]);
  assert.deepEqual(asset?.utilityFunctions, ["$U_i^B$", "$U_i^S$"]);
  assert.equal(asset?.equilibriumStatus, "等待模型确认");
  assert.deepEqual(asset?.nextActions, ["确认双边收费符号", "准备一阶条件"]);
  assert.deepEqual(asset?.pendingDecision, {
    kind: "answer_model_question",
    prompt: "请确认双边收费和补贴变量。",
  });
});

test("successful model generation keeps the user's model refinement message", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });
  const model = {
    symbols: [],
    sides: {
      consumerSideName: "买家",
      merchantSideName: "卖家",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "stage-pricing",
        order: 1,
        name: "平台选择策略",
        decisions: ["\\tau_i", "s_i"],
      },
    ],
    utilityFunctions: [
      {
        id: "u-buyer-a",
        side: "consumer",
        platform: "A",
        expression: "U_A^B = v_B + s_A - t_B x",
        notes: "买家选择平台 A 的效用。",
      },
    ],
    demandDerivation: "由无差异条件推导需求份额。",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
        notes: "佣金收入减补贴成本。",
      },
    ],
    assumptions: ["平台可以收费也可以补贴。"],
    modelSetupDraft: "平台同时选择佣金与补贴。",
  };

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      userMessage: "把平台对买卖双方都可收费也可补贴写进模型。",
      project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "已将双边收费或补贴纳入策略变量。",
          hotellingModel: model,
        }),
    }
  );

  const contents = result.project.researchSession?.messages.map(
    (message) => message.content
  );

  assert.ok(
    contents?.some((content) =>
      content.includes("把平台对买卖双方都可收费也可补贴写进模型")
    )
  );
  assert.ok(
    contents?.some((content) =>
      content.includes("已将双边收费或补贴纳入策略变量")
    )
  );
});

test("build fallback keeps the user's model refinement message", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      userMessage: "买家和卖家都可能被收费或补贴。",
      project,
    },
    {
      complete: async () => "not json",
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "model");
  assert.ok(
    result.project.researchSession?.messages.some((message) =>
      message.content.includes("买家和卖家都可能被收费或补贴")
    )
  );
});

test("build fallback preserves userMessage before entering model phase", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform pricing",
    now: 1710000000000,
  });
  const userMessage = "Please include seller verification costs.";

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      userMessage,
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const messages = result.project.researchSession?.messages ?? [];
  const userMessageIndex = messages.findIndex(
    (message) => message.role === "user" && message.content === userMessage
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "model");
  assert.notEqual(userMessageIndex, -1);
  assert.equal(messages.at(-1)?.role, "assistant");
  assert.ok(result.project.hotellingModel);
});

test("conversation fallback returns a direct model patch for explicit symbol edits", async () => {
  const project = adoptResearchDirection(
    createExplorationProject({
      id: "11111111-1111-4111-8111-111111111111",
      rawIdea: "Research secondhand platform pricing",
      now: 1710000000000,
    }),
    "secondhand-commission-subsidy-hotelling"
  );

  const result = await generateResearchProject(
    {
      action: "continue_conversation",
      rawIdea: project.rawIdea,
      userMessage: "Change tau_A to f_A.",
      project,
    },
    {}
  );

  assert.equal(result.assetPatch?.kind, "update_model");
  assert.equal(result.assetPatch?.changes[0].target, "hotellingModel.symbols[tau_A].symbol");
  assert.equal(result.assetPatch?.changes[0].op, "set");
  assert.equal(result.assetPatch?.changes[0].value, "f_A");
  assert.match(result.assistantMessage, /右侧|待应用|应用/);
});

test("conversation confirmation creates a pending patch when provider omits assetPatch", async () => {
  const project = confirmResearchModel(
    adoptResearchDirection(
      createExplorationProject({
        id: "11111111-1111-4111-8111-111111111111",
        rawIdea: "Research platform pricing",
        now: 1710000000000,
      }),
      "secondhand-commission-subsidy-hotelling"
    )
  );
  const proposalMessage = [
    "好的，我们来将模型扩展为多归属设定。",
    "允许卖家多归属，而买家仍保持单归属。",
    "需要调整模型设定、符号、效用函数、需求推导和利润函数。",
    "如果你确认这个多归属设定，我将生成完整的符号模型。是否接受这个方向？",
  ].join("\n");
  const projectWithProposal = {
    ...project,
    researchSession: {
      ...project.researchSession,
      messages: [
        ...(project.researchSession?.messages ?? []),
        {
          id: "msg-multihoming-proposal",
          role: "assistant",
          content: proposalMessage,
          createdAt: 0,
        },
      ],
    },
  };

  const result = await generateResearchProject(
    {
      action: "continue_conversation",
      rawIdea: project.rawIdea,
      userMessage: "接受",
      project: projectWithProposal,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage:
            "这些修改将作为待审核的变更出现在右侧。你可以查看并决定是否接受。",
        }),
    }
  );

  assert.equal(result.assetPatch?.kind, "update_model");
  assert.equal(result.assetPatch?.summary, "应用卖家多归属模型扩展");
  assert.ok(
    result.assetPatch?.changes.some(
      (change) => change.target === "hotellingModel.symbols"
    )
  );
  assert.ok(
    result.assetPatch?.changes.some(
      (change) => change.target === "hotellingModel.utilityFunctions"
    )
  );
  assert.match(result.assistantMessage, /右侧|待应用|应用/);
});

test("build fallback can recover model phase from a project without directions", async () => {
  const project = {
    ...createExplorationProject({
      id: "11111111-1111-4111-8111-111111111111",
      rawIdea: "研究二手交易平台相关模型",
      now: 1710000000000,
    }),
    researchSession: undefined,
  };

  const result = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      project,
    },
    {
      complete: async () => "{",
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "model");
  assert.ok(result.project.hotellingModel);
});

test("equilibrium generation fallback produces a diagnostic draft", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金与补贴",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: modelProject.rawIdea,
      project: modelProject,
    },
    {}
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "equilibrium");
  assert.equal(result.project.equilibriumResult?.status, "derivation_draft");
  assert.ok(result.project.equilibriumResult?.closedForm);
  assert.doesNotMatch(
    result.project.equilibriumResult?.closedForm ?? "",
    /\\tau_A\^\*=\\tau_B\^\*=\\frac\{t_S-2\\alpha_B\}\{q\}/
  );
  assert.doesNotMatch(
    result.project.equilibriumResult?.closedForm ?? "",
    /s_A\^\*=s_B\^\*=\\frac\{t_S\+\\alpha_S-2t_B-2\\alpha_B\}\{2\}/
  );
  assert.match(result.project.equilibriumResult?.code ?? "", /sp\.diff/);
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
  assert.ok(result.project.researchSession?.assetSummary.nextActions.length);
  assert.ok(result.project.equilibriumResult?.warnings.length);
});

test("equilibrium generation rejects simulation-only provider output", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金与补贴",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: modelProject.rawIdea,
      project: modelProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "数值模拟得到一个均衡。",
          equilibriumResult: {
            status: "solved",
            concept: "Numerical equilibrium",
            solvingSteps: ["令 t_B = 1 后搜索最优反应"],
            focs: ["tau_A = 0.5"],
            conditions: ["simulation converged"],
            closedForm: "仿真结果显示 tau_A = 0.5, s_A = 0.1",
            derivation: "Monte Carlo simulation.",
            code: "for seed in range(1000): simulate(seed)",
            warnings: [],
          },
        }),
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "equilibrium");
  assert.doesNotMatch(
    [
      result.project.equilibriumResult?.closedForm,
      result.project.equilibriumResult?.derivation,
      result.project.equilibriumResult?.code,
    ].join("\n"),
    /Monte Carlo|仿真结果|数值模拟结果|simulate/
  );
});

test("equilibrium parse fallback stays grounded in the current model decisions", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea:
      "Generative AI platform openness and creator revenue-share competition",
    now: 1710000000000,
  });
  const adopted = adoptResearchDirection(
    project,
    "secondhand-commission-subsidy-hotelling"
  );
  const confirmed = confirmResearchModel({
    ...adopted,
    hotellingModel: createOpennessRevenueShareModel(),
  });

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: confirmed.rawIdea,
      project: confirmed,
    },
    {
      complete: async () =>
        "I derived the FOCs but forgot to return the required JSON object.",
    }
  );
  const equilibrium = result.project.equilibriumResult;
  const fallbackText = [
    equilibrium?.concept,
    ...(equilibrium?.solvingSteps ?? []),
    ...(equilibrium?.focs ?? []),
    ...(equilibrium?.conditions ?? []),
    equilibrium?.closedForm,
    equilibrium?.derivation,
    equilibrium?.code,
    ...(equilibrium?.warnings ?? []),
  ].join("\n");

  assert.equal(result.usedFallback, true);
  assert.equal(equilibrium?.status, "derivation_draft");
  assert.match(fallbackText, /o_A/);
  assert.match(fallbackText, /\\tau_A/);
  assert.doesNotMatch(fallbackText, /s_i|s_A|s_B/);
  assert.doesNotMatch(
    fallbackText,
    /\\tau_A\^\*=\\tau_B\^\*=\\frac\{t_S-2\\alpha_B\}\{q\}/
  );
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
});

test("equilibrium generation preserves symbolic failure as a draft without solved fallback", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究商家多归属的外卖平台竞争",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "seller-multihoming-pricing",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: modelProject.rawIdea,
      project: modelProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "当前只能得到隐式系统草稿。",
          equilibriumResult: {
            status: "symbolic_failure",
            concept: "隐式系统草稿",
            solvingSteps: ["列出一阶条件"],
            focs: ["F(z,\\theta)=0"],
            conditions: ["\\det J_zF\\ne0"],
            closedForm: "当前没有完整闭式解。",
            derivation: "只得到隐式系统。",
            code: "import sympy as sp\nprint('implicit system')",
            warnings: ["不是闭式均衡。"],
          },
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.project.equilibriumResult?.status, "symbolic_failure");
  assert.equal(result.project.researchSession?.phase, "equilibrium");
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
  assert.doesNotMatch(
    result.project.equilibriumResult?.closedForm ?? "",
    /\\tau_A\^\*=\\tau_B\^\*=\\frac\{t_S-2\\alpha_B\}\{q\}/
  );
  assert.match(
    result.project.researchSession?.messages.at(-1)?.content ?? "",
    /当前只能得到隐式系统草稿/
  );
});

test("equilibrium generation accepts implicit-system drafts without solved coercion", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究复杂平台推荐机制",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: modelProject.rawIdea,
      project: modelProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "我得到反应函数和隐式系统，但还不能声明闭式均衡。",
          equilibriumResult: {
            status: "implicit_system",
            concept: "隐式均衡系统",
            solvingSteps: ["写出利润函数", "列 FOC", "整理为 F(z,theta)=0"],
            focs: ["F_1(z,theta)=0", "F_2(z,theta)=0"],
            conditions: ["det J_z F != 0"],
            closedForm: "F(z,theta)=0",
            derivation: "系统停在隐式均衡方程，暂未通过二阶条件。",
            code: "import sympy as sp\n# implicit system",
            warnings: ["不能进入性质分析。"],
            solverScratchpad: {
              status: "implicit_system",
              implicitSystem: ["F_1(z,theta)=0", "F_2(z,theta)=0"],
              failedWithReason: "闭式求解条件不足。",
              needsModelClarification: ["补充推荐强度的边界约束。"],
            },
          },
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.project.equilibriumResult?.status, "implicit_system");
  assert.equal(
    result.project.equilibriumResult?.solverScratchpad?.status,
    "implicit_system"
  );
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
});

test("successful equilibrium generation uses symbolic provider result", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金与补贴",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: modelProject.rawIdea,
      project: modelProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "已给出符号均衡。",
          equilibriumResult: {
            status: "solved",
            concept: "符号内部纳什均衡",
            solvingSteps: ["由无差异条件得到需求份额", "联立 FOC 得到反应函数"],
            focs: ["\\frac{\\partial \\Pi_A}{\\partial \\tau_A}=0"],
            conditions: ["t_B>0", "t_S>0"],
            closedForm: "\\tau_A^*=R_{\\tau_A}(\\theta)",
            derivation: "全程保留符号表达式和反应函数，不进行参数赋值。",
            code: "import sympy as sp\nsp.solve([foc_tau_A], [tau_A])",
            warnings: ["闭式表达较长，保留反应函数。"],
          },
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.assistantMessage, "已给出符号均衡。");
  assert.equal(result.project.researchSession?.phase, "equilibrium");
  assert.equal(result.project.equilibriumResult?.status, "solved");
  assert.equal(result.project.equilibriumResult?.concept, "符号内部纳什均衡");
  assert.equal(
    result.project.researchSession?.assetSummary.equilibriumStatus,
    "solved"
  );
  assert.equal(
    result.project.researchSession?.messages.at(-2)?.content,
    "开始符号均衡求解。"
  );
});

test("successful equilibrium generation accepts unicode symbolic notation", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金与补贴",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: modelProject.rawIdea,
      project: modelProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "已给出符号均衡。",
          equilibriumResult: {
            status: "solved",
            concept: "子博弈精炼纳什均衡（对称均衡）",
            solvingSteps: ["由无差异条件得到市场份额", "联立一阶条件"],
            focs: ["∂Π_A/∂f_A^B = 0", "∂Π_A/∂f_A^S = 0"],
            conditions: ["t_B>α_B", "t_S>α_S"],
            closedForm: "τ_i^* = R_τ(α_B, α_S, t_B, t_S)",
            derivation: "全程使用符号一阶条件与反应函数，不进行数值代入。",
            code: "import sympy as sp\nsp.solve([foc_B, foc_S], [tau, s])",
            warnings: ["闭式表达较长，保留反应函数。"],
          },
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(
    result.project.equilibriumResult?.concept,
    "子博弈精炼纳什均衡（对称均衡）"
  );
});

test("property analysis fallback advances from equilibrium to analysis phase", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金与补贴",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );
  const equilibriumProject = generateSymbolicEquilibrium(modelProject, {
    acceptDefaultFallbackScope: true,
  });

  const result = await generateResearchProject(
    {
      action: "analyze_properties",
      rawIdea: equilibriumProject.rawIdea,
      project: equilibriumProject,
    },
    {}
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "analysis");
  assert.equal(result.project.propertyAnalyses?.length, 3);
  assert.match(result.project.propertyAnalyses?.[0].symbolicResult ?? "", /partial/);
  assert.equal(result.project.researchSession?.assetSummary.pendingDecision, undefined);
  assert.ok(
    result.project.researchSession?.assetSummary.nextActions.includes(
      "整理命题与证明草稿"
    )
  );
});

test("successful property analysis generation uses symbolic provider result", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金与补贴",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );
  const equilibriumProject = generateSymbolicEquilibrium(modelProject, {
    acceptDefaultFallbackScope: true,
  });

  const result = await generateResearchProject(
    {
      action: "analyze_properties",
      rawIdea: equilibriumProject.rawIdea,
      project: equilibriumProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "已生成符号性质分析。",
          propertyAnalyses: [
            {
            id: "provider-analysis",
            target: "\\tau_A^*",
            parameter: "\\alpha_B",
            operation: "differentiate",
            symbolicResult: "\\frac{\\partial \\tau_A^*}{\\partial \\alpha_B}",
            signCondition: "由 F_{\\tau_A,\\alpha_B} 与二阶项符号决定",
            propositionDraft: "命题：网络效应改变佣金反应函数。",
            proofSketch: "使用隐函数定理对符号 FOC 求导。",
            intuition: "需求反馈改变佣金边际收益。",
            warnings: ["不使用数值模拟。"],
            },
            {
              id: "provider-analysis-fee",
              target: "s_A^*",
              parameter: "t_B",
              operation: "compare",
              symbolicResult: "\\frac{\\partial s_A^*}{\\partial t_B}>0",
              signCondition: "Symbolic sign follows from t_B>0.",
              propositionDraft: "Higher horizontal differentiation changes subsidy response.",
              proofSketch: "Differentiate the symbolic equilibrium expression with respect to t_B.",
              intuition: "Softer rivalry changes the platform subsidy margin.",
              warnings: ["Symbolic-only comparative statics."],
            },
            {
              id: "provider-analysis-threshold",
              target: "q^*",
              parameter: "\\alpha_S",
              operation: "threshold",
              symbolicResult: "\\frac{\\partial q^*}{\\partial \\alpha_S}>0",
              signCondition: "Positive under the maintained symbolic restrictions.",
              propositionDraft: "Seller-side network strength expands equilibrium volume.",
              proofSketch: "Substitute the equilibrium into demand and differentiate symbolically.",
              intuition: "More seller-side utility raises platform matching value.",
              warnings: ["Symbolic-only comparative statics."],
            },
          ],
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.assistantMessage, "已生成符号性质分析。");
  assert.equal(result.project.researchSession?.phase, "analysis");
  assert.equal(result.project.propertyAnalyses?.length, 3);
  assert.equal(result.project.propertyAnalyses?.[0].id, "provider-analysis");
  assert.equal(
    result.project.researchSession?.messages.at(-2)?.content,
    "生成性质分析。"
  );
});

test("successful property analysis accepts unicode symbolic derivatives", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台佣金与补贴",
    now: 1710000000000,
  });
  const { project: modelProject } = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );
  const equilibriumProject = generateSymbolicEquilibrium(modelProject, {
    acceptDefaultFallbackScope: true,
  });

  const result = await generateResearchProject(
    {
      action: "analyze_properties",
      rawIdea: equilibriumProject.rawIdea,
      project: equilibriumProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "已生成符号性质分析。",
          propertyAnalyses: [
            {
            id: "provider-unicode-analysis",
            target: "f^B",
            parameter: "α_B",
            operation: "∂f^B/∂α_B",
            symbolicResult: "∂f^B/∂α_B = -α_S/(2 t_S)",
            signCondition: "负，因为 α_S>0 且 t_S>0",
            propositionDraft: "命题：买家网络外部性增强会降低买家收费。",
            proofSketch: "由对称均衡解对 α_B 求偏导即可得到该符号结果。",
            intuition: "平台通过降低买家费用吸引买家，再经跨边网络效应吸引卖家。",
              warnings: ["Symbolic-only comparative statics."],
            },
            {
              id: "provider-unicode-transport",
              target: "s_A^*",
              parameter: "t_B",
              operation: "differentiate",
              symbolicResult: "\\frac{\\partial s_A^*}{\\partial t_B}>0",
              signCondition: "Positive under the symbolic restrictions.",
              propositionDraft: "Horizontal differentiation changes the subsidy margin.",
              proofSketch: "Differentiate the symbolic equilibrium expression with respect to t_B.",
              intuition: "A wider horizontal gap softens rivalry and changes platform subsidies.",
              warnings: ["Symbolic-only comparative statics."],
            },
            {
              id: "provider-unicode-network",
              target: "q^*",
              parameter: "\\alpha_S",
              operation: "differentiate",
              symbolicResult: "\\frac{\\partial q^*}{\\partial \\alpha_S}>0",
              signCondition: "Positive under the symbolic restrictions.",
              propositionDraft: "Seller-side network strength raises equilibrium volume.",
              proofSketch: "Substitute the symbolic equilibrium into demand and differentiate.",
              intuition: "Seller-side value raises matching volume through cross-side utility.",
              warnings: ["Symbolic-only comparative statics."],
            },
          ],
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(
    result.project.propertyAnalyses?.[0].id,
    "provider-unicode-analysis"
  );
});

test("equilibrium fallback solves symbolically after explicit solve action", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "not json",
    }
  );

  const result = await generateResearchProject({
    action: "solve_equilibrium",
    rawIdea: built.project.rawIdea,
    project: built.project,
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "equilibrium");
  assert.equal(result.project.equilibriumResult?.status, "derivation_draft");
  assert.ok(result.project.equilibriumResult?.closedForm);
  assert.doesNotMatch(
    result.project.equilibriumResult?.closedForm ?? "",
    /n_A\^\{B\*\}=n_B\^\{B\*\}=n_A\^\{S\*\}=n_B\^\{S\*\}=\\frac\{1\}\{2\}/
  );
  assert.equal(
    result.project.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
});

test("property analysis fallback refuses to run from a draft fallback equilibrium", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手交易平台相关模型",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "not json",
    }
  );
  const solved = await generateResearchProject({
    action: "solve_equilibrium",
    rawIdea: built.project.rawIdea,
    project: built.project,
  });

  await assert.rejects(
    () =>
      generateResearchProject({
        action: "analyze_properties",
        rawIdea: solved.project.rawIdea,
        project: solved.project,
      }),
    /solved closed-form symbolic equilibrium/
  );
});
