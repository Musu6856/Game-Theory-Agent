import type { ResearchProject, SymbolDefinition } from "../types";
import {
  createHotellingSymbolSeed,
  formatSymbolRegistryForPrompt,
  normalizeSymbolRegistry,
  validateSymbolGovernance,
} from "../symbol-governance.ts";
import { createResearchSymbolRegistryForDirection } from "../research-session.ts";
import type { LlmMessage, ResearchGenerationRequest } from "./types.ts";

export function createEquilibriumPrompt(project: ResearchProject): LlmMessage[] {
  const symbolContext = createSymbolPromptContext(project);
  return [
    {
      role: "developer",
      content:
        "You output strict JSON only. Top-level keys must be assistantMessage and equilibriumResult. assistantMessage must be the exact natural-language reply the user should see in chat, in Chinese Markdown text, without markdown fences or code fences. Use headings, bullet lists, bold text, and inline LaTeX when that improves readability. Wrap every formula or symbol token such as $n_A^B$, $\\alpha_B$, $\\tau_A^*$ in Markdown math delimiters. equilibriumResult must include status,concept,solvingSteps,focs,conditions,closedForm,derivation,code,warnings. Keep closedForm compact: use a pure formula, reaction system, or concise symbolic-failure statement; do not mix long prose into closedForm. Put explanations in derivation and warnings. The result must be symbolic: use FOC equations, reaction functions, closed-form expressions or exact symbolic-failure explanation plus reusable SymPy code. Do not use numeric substitution, simulation, calibration, Monte Carlo, empirical regression, or parameter assignment as equilibrium. Reuse the supplied symbol registry exactly; if a symbol is missing, define it explicitly and keep notation consistent with the current model.",
    },
    {
      role: "user",
      content:
        "Solve the Hotelling/two-sided platform model symbolically. Return JSON only.\n" +
        JSON.stringify({
          rawIdea: project.rawIdea,
          hotellingModel: project.hotellingModel,
          existingEquilibrium: project.equilibriumResult,
          symbolRegistry: symbolContext.symbolRegistry,
          symbolGovernanceIssues: symbolContext.symbolIssues,
          requiredShape: {
            assistantMessage: "中文 Markdown 回复",
            equilibriumResult: {
              status: "solved 或 symbolic_failure",
              concept: "均衡概念",
              solvingSteps: ["符号求解步骤"],
              focs: ["\\frac{\\partial \\Pi_i}{\\partial \\tau_i}=0"],
              conditions: ["参数约束"],
              closedForm: "纯公式闭式解、反应函数系统或简短符号失败说明",
              derivation: "符号推导说明",
              code: "可运行 SymPy 代码",
              warnings: ["仅保留符号解，不用数值模拟"],
            },
          },
        }),
    },
  ];
}

export function createPropertyAnalysisPrompt(project: ResearchProject): LlmMessage[] {
  const symbolContext = createSymbolPromptContext(project);
  return [
    {
      role: "developer",
      content:
        "You output strict JSON only. Top-level keys must be assistantMessage and propertyAnalyses. assistantMessage must be the exact natural-language reply the user should see in chat, in Chinese Markdown text, without markdown fences or code fences. Use headings, bullet lists, bold text, and inline LaTeX when that improves readability. Wrap every formula or symbol token such as $n_A^B$, $\\alpha_B$, $\\tau_A^*$ in Markdown math delimiters. propertyAnalyses must be an array of 3 to 5 objects. Each object must include id,target,parameter,operation,symbolicResult,signCondition,propositionDraft,proofSketch,intuition,warnings. The analyses must be useful symbolic comparative statics/proposition analysis, not simulation, numeric examples, or trivial zero derivatives caused only by a parameter being absent from the model. Reuse the supplied symbol registry exactly and state symbol meanings consistently.",
    },
    {
      role: "user",
      content:
        "Generate 3 to 5 symbolic property analyses from this equilibrium context. Return JSON only.\n" +
        JSON.stringify({
          rawIdea: project.rawIdea,
          hotellingModel: project.hotellingModel,
          equilibriumResult: project.equilibriumResult,
          symbolRegistry: symbolContext.symbolRegistry,
          symbolGovernanceIssues: symbolContext.symbolIssues,
          requiredShape: {
            assistantMessage: "中文 Markdown 回复，概述 3 条以上性质分析",
            propertyAnalyses: [
              {
                id: "analysis-id",
                target: "\\tau_i^*",
                parameter: "\\alpha_B",
                operation: "differentiate",
                symbolicResult:
                  "\\frac{\\partial \\tau_i^*}{\\partial \\alpha_B}",
                signCondition: "符号条件",
                propositionDraft: "命题草稿",
                proofSketch: "证明草稿",
                intuition: "经济直觉",
                warnings: ["不使用数值模拟"],
              },
            ],
          },
        }),
    },
  ];
}

export function createConversationPrompt(
  project: ResearchProject,
  userMessage: string
): LlmMessage[] {
  const session = project.researchSession;
  const symbolContext = createSymbolPromptContext(project);
  const recentMessages = session?.messages.slice(-10).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  return [
    {
      role: "developer",
      content:
        "You are PaperForge, a Chinese research assistant for theoretical game theory papers. Return strict JSON only. Top-level keys must be assistantMessage and optionally assetPatch. assistantMessage must be the exact natural-language reply the user should see in chat, in Chinese Markdown text, without markdown fences or code fences. Use headings, bullet lists, bold text, and inline LaTeX when that improves readability. Wrap every formula or symbol token such as $n_A^B$, $\\alpha_B$, $\\tau_A^*$ in Markdown math delimiters. Use assetPatch when the user explicitly asks for a structured edit to the current model, equilibrium result, or property analyses. A short confirmation such as “确认”, “接受”, “同意”, “按这个改”, or “你帮我处理好” counts as an explicit structured edit when recentMessages show that the assistant just proposed concrete model/equilibrium/property changes or asked whether to accept them. In that confirmation case, return the concrete assetPatch instead of repeating the proposal. If you include assetPatch, make it concrete, symbolic, and limited to the requested edit. When assetPatch is included, say the content will appear on the right as a pending change for review, not that it has already overwritten the asset. If you do not include assetPatch, do not claim the right-side asset has been updated. Reuse the supplied symbol registry and, when the user asks about notation, answer with the current symbol names or produce a symbol patch instead of a generic workflow reply. For symbol edits, use assetPatch.kind='update_model' and target paths such as hotellingModel.symbols[tau_A].symbol, hotellingModel.symbols[tau_A].meaning, or hotellingModel.symbols with op='insert' and a complete symbol object. For model text edits, use assetPatch.kind='update_model' and target paths such as hotellingModel.modelSetupDraft, hotellingModel.demandDerivation, hotellingModel.assumptions, hotellingModel.utilityFunctions[0].notes, or hotellingModel.profitFunctions[0].expression. For property edits, use assetPatch.kind='update_properties', target='propertyAnalyses', and op='insert'.",
    },
    {
      role: "user",
      content:
        "Continue this research conversation in Chinese.\n" +
        JSON.stringify({
          latestUserMessage: userMessage,
          rawIdea: project.rawIdea,
          phase: session?.phase,
          currentDirection: session?.assetSummary.currentDirection,
          pendingDecision: session?.assetSummary.pendingDecision,
          hotellingModel: project.hotellingModel,
          equilibriumResult: project.equilibriumResult,
          propertyAnalyses: project.propertyAnalyses,
          symbolRegistry: symbolContext.symbolRegistry,
          symbolGovernanceIssues: symbolContext.symbolIssues,
          recentMessages,
        }),
    },
  ];
}


type SymbolPromptContext = {
  symbolRegistry: string;
  symbolIssues: string[];
  symbolCount: number;
};

function createSymbolPromptContext(
  project?: ResearchProject,
  fallbackSymbols: SymbolDefinition[] = []
): SymbolPromptContext {
  const symbols = resolvePromptSymbols(project, fallbackSymbols);
  const issues = validateSymbolGovernance({ symbols });

  return {
    symbolRegistry: formatSymbolRegistryForPrompt(symbols),
    symbolIssues: issues.map((issue) => issue.message),
    symbolCount: symbols.length,
  };
}

export function resolvePromptSymbols(
  project?: ResearchProject,
  fallbackSymbols: SymbolDefinition[] = []
): SymbolDefinition[] {
  const projectSymbols = normalizeSymbolRegistry(project?.hotellingModel?.symbols);
  if (projectSymbols.length > 0) return projectSymbols;

  if (fallbackSymbols.length > 0) {
    const normalizedFallback = normalizeSymbolRegistry(fallbackSymbols);
    if (normalizedFallback.length > 0) return normalizedFallback;
  }

  const direction = project?.researchSession?.assetSummary.currentDirection;
  if (direction) {
    const directionSymbols = createResearchSymbolRegistryForDirection(direction);
    if (directionSymbols.length > 0) return directionSymbols;
  }

  return createHotellingSymbolSeed();
}

export function createDiscoverPrompt(rawIdea: string): LlmMessage[] {
  return [
    {
      role: "developer",
      content:
        "You output strict JSON only. Top-level keys must be assistantMessage and directions. directions must be an array of exactly 4 objects. Each direction must include id,title,summary,model,contribution,recommended. No markdown. No extra keys. No papers. The product serves theoretical game-theory modeling papers only. Every direction must support symbolic equilibrium solving with utility functions, demand shares, profit functions, and analytical comparative statics. Do not generate empirical, case-study, survey, machine-learning, calibration, or simulation-only directions. At least one direction must explicitly use Hotelling or two-sided platform competition.",
    },
    {
      role: "user",
      content:
        `Research idea: ${rawIdea}\n` +
        "Generate 4 Chinese theoretical modeling directions for Hotelling/two-sided platform symbolic equilibrium papers. Return JSON only in this exact shape: " +
        "{\"assistantMessage\":\"中文一句话\",\"directions\":[{\"id\":\"d1\",\"title\":\"中文标题\",\"summary\":\"中文摘要\",\"model\":\"模型名称\",\"contribution\":\"中文贡献\",\"recommended\":true}]}",
    },
  ];
}

export function createBuildPrompt(
  request: ResearchGenerationRequest,
  fallbackSymbols: SymbolDefinition[] = []
): LlmMessage[] {
  const symbolContext = createSymbolPromptContext(request.project, fallbackSymbols);
  return [
    {
      role: "developer",
      content:
        "You output strict JSON only. Top-level keys must be assistantMessage and hotellingModel. No markdown. No extra keys. hotellingModel must include symbols,sides,platforms,timing,utilityFunctions,demandDerivation,profitFunctions,assumptions,modelSetupDraft. The model must be suitable for symbolic equilibrium solving. Do not use numeric substitution, simulation, calibration, or empirical regression. Use LaTeX strings for utility functions, profit functions, and derivations. Reuse the supplied symbol registry exactly and keep every symbol defined; if you need a new symbol, add it explicitly in hotellingModel.symbols with name, meaning, role, side, and assumption. Every utility, demand, revenue, and cost term must be explicit enough for first-order conditions. Do not leave unresolved functions such as \\psi_i(...), \\phi_i(...), R_i(...), or C_i(...) in utility or profit functions unless you also define their closed-form expressions in the model itself. Prefer a two-decision solvable core such as platform i choosing buyer subsidy s_i and seller commission tau_i; keep buyer and seller demand shares derived from linear Hotelling indifference equations so SymPy can solve the FOCs. For subsidy models, write buyer subsidy as +s_i in buyer utility and as -s_i n_i^B in platform profit; do not introduce a separate buyer price p_i unless p_i is explicitly a decision variable with its own FOC and profit term. If the topic is secondhand platform commissions and subsidies, platforms may charge or subsidize both buyers and sellers; do not assume one side is always charged while the other is always subsidized.",
    },
    {
      role: "user",
      content:
        "Build a Chinese Hotelling/two-sided platform model from this context. Return JSON only.\n" +
        JSON.stringify({
          rawIdea: request.rawIdea,
          selectedDirectionId: request.selectedDirectionId,
          userMessage: request.userMessage,
          directions: request.project?.researchSession?.directions,
          symbolRegistry: symbolContext.symbolRegistry,
          symbolGovernanceIssues: symbolContext.symbolIssues,
          requiredShape: {
            assistantMessage: "中文说明",
            hotellingModel: {
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
                  name: "平台选择收费或补贴策略",
                  decisions: ["f_i^B", "f_i^S"],
                },
              ],
              utilityFunctions: [
                {
                  id: "u-buyer-a",
                  side: "consumer",
                  platform: "A",
                  expression: "U_A^B = v_B + \\alpha_B n_A^S + s_A - t_B x",
                  notes: "中文解释",
                },
              ],
              demandDerivation: "中文说明",
              profitFunctions: [
                {
                  id: "profit-a",
                  platform: "A",
                  expression: "\\Pi_A = \\tau_A q n_A^S n_A^B - s_A n_A^B",
                  notes: "中文解释",
                },
              ],
              assumptions: ["中文假设"],
              modelSetupDraft: "中文模型设定草稿",
            },
          },
        }),
    },
  ];
}

