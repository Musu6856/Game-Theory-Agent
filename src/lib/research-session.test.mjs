import test from "node:test";
import assert from "node:assert/strict";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createModelAwareEquilibriumScaffoldResult,
  createInitialResearchSession,
  createExplorationProject,
  generatePropertyAnalysis,
  generateSymbolicEquilibrium,
  normalizeResearchProjectForWorkspace,
} from "./research-session.ts";
import { verifyEquilibriumMathConsistency } from "./research-agent/math-verifier.ts";

test("creates direction discovery state with four direction cards and a pending decision", () => {
  const session = createInitialResearchSession(
    "研究二手平台佣金和补贴策略"
  );

  assert.equal(session.phase, "direction");
  assert.equal(session.assetSummary.currentDirection, undefined);
  assert.equal(session.directions.length, 4);
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[0].role, "user");
  assert.equal(session.messages[1].role, "assistant");
  assert.equal(session.assetSummary.pendingDecision?.kind, "choose_direction");
  assert.match(
    session.assetSummary.pendingDecision?.prompt ?? "",
    /选择一个研究方向/
  );
  assert.deepEqual(session.assetSummary.confirmedAssumptions, []);
  assert.deepEqual(session.assetSummary.utilityFunctions, []);
  assert.equal(session.assetSummary.equilibriumStatus, "not_started");
  assert.ok(session.assetSummary.nextActions.includes("选择一个研究方向"));

  const first = session.directions[0];
  assert.equal(first.id, "secondhand-commission-subsidy-hotelling");
  assert.match(first.title, /二手平台佣金与补贴策略/);
  assert.match(first.model, /两边 Hotelling 平台竞争模型/);
});

test("creates an exploration project payload with research session and model source metadata", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
    modelSource: {
      source: "own",
      provider: "openai",
      apiKey: "sk-secret",
      model: "gpt-4.1",
    },
  });

  assert.equal(project.createdAt, 1710000000000);
  assert.equal(project.id, "11111111-1111-4111-8111-111111111111");
  assert.equal(project.projectType, "exploration");
  assert.equal(project.rawIdea, "研究二手平台佣金和补贴策略");
  assert.equal(project.refinedIdea, "研究二手平台佣金和补贴策略");
  assert.equal(project.wizardCompleted, true);
  assert.equal(project.researchSession?.phase, "direction");
  assert.deepEqual(project.modelSource, {
    source: "own",
    provider: "openai",
    model: "gpt-4.1",
    hasBrowserApiKey: true,
  });
  assert.equal("apiKey" in project.modelSource, false);
});

test("adopts a research direction into model co-creation phase", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });

  const adopted = adoptResearchDirection(
    project,
    "secondhand-commission-subsidy-hotelling"
  );

  assert.equal(adopted.projectType, "formal");
  assert.equal(adopted.researchSession?.phase, "model");
  assert.equal(
    adopted.researchSession?.assetSummary.currentDirection?.id,
    "secondhand-commission-subsidy-hotelling"
  );
  assert.equal(
    adopted.researchSession?.assetSummary.pendingDecision?.kind,
    "answer_model_question"
  );
  assert.ok(adopted.researchSession?.messages.length >= 4);
  assert.equal(adopted.hotellingModel?.assumptions.length, 5);
  assert.equal(adopted.hotellingModel?.utilityFunctions.length, 4);
  assert.match(adopted.hotellingModel?.utilityFunctions[0].expression ?? "", /x/);
  assert.equal(adopted.researchSession?.assetSummary.confirmedAssumptions.length, 5);
  assert.equal(adopted.researchSession?.assetSummary.utilityFunctions.length, 4);
  assert.match(
    adopted.researchSession?.assetSummary.utilityFunctions[0] ?? "",
    /^\$.*\$$/
  );
  assert.equal(
    adopted.researchSession?.assetSummary.equilibriumStatus,
    "等待模型确认"
  );
  assert.ok(
    adopted.researchSession?.assetSummary.nextActions.includes(
      "确认佣金和补贴的策略变量"
    )
  );
  assert.equal(adopted.equilibriumResult?.status, "needs_revision");
  assert.equal(adopted.equilibriumResult?.closedForm, "");
  assert.deepEqual(adopted.equilibriumResult?.warnings, [
    "当前仅搭建符号化均衡条件，不进行数值模拟。",
  ]);
  assert.ok(
    adopted.hotellingModel?.symbols.some(
      (symbol) => symbol.codeName === "tau_A" && symbol.meaning.includes("佣金")
    )
  );
  assert.ok(
    adopted.hotellingModel?.symbols.some(
      (symbol) => symbol.codeName === "s_A" && symbol.meaning.includes("补贴")
    )
  );
});

test("adopts a non-recommended research direction instead of blocking it", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform seller multihoming",
    now: 1710000000000,
  });

  const adopted = adoptResearchDirection(project, "seller-multihoming-pricing");

  assert.equal(adopted.projectType, "formal");
  assert.equal(adopted.researchSession?.phase, "model");
  assert.equal(
    adopted.researchSession?.assetSummary.currentDirection?.id,
    "seller-multihoming-pricing"
  );
  assert.equal(
    adopted.researchSession?.assetSummary.pendingDecision?.kind,
    "answer_model_question"
  );
  assert.ok(adopted.hotellingModel);
  assert.ok(adopted.equilibriumResult);
  assert.match(
    adopted.hotellingModel?.modelSetupDraft ?? "",
    /卖家多归属|多归属成本|符号求解/
  );
  assert.match(
    adopted.researchSession?.messages.at(-1)?.content ?? "",
    /卖家多归属与平台定价/
  );
});

test("adopts seller multihoming with a direction-specific fallback scaffold", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform seller multihoming",
    now: 1710000000000,
  });

  const adopted = adoptResearchDirection(project, "seller-multihoming-pricing");
  const modelText = [
    adopted.hotellingModel?.modelSetupDraft,
    ...(adopted.hotellingModel?.timing.flatMap((stage) => stage.decisions) ?? []),
    ...(adopted.hotellingModel?.utilityFunctions.map((entry) => entry.expression) ?? []),
    ...(adopted.hotellingModel?.profitFunctions.map((entry) => entry.expression) ?? []),
  ].join("\n");
  const profitText =
    adopted.hotellingModel?.profitFunctions
      .map((entry) => entry.expression)
      .join("\n") ?? "";

  assert.match(modelText, /multihoming|m_i|m_A|m_B/i);
  assert.match(modelText, /\\kappa|kappa|multi/i);
  assert.doesNotMatch(
    profitText,
    /tau_A q n_A\^S n_A\^B - s_A n_A\^B/
  );
});

test("seller-multihoming equilibrium fallback returns a narrowed closed-form core", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform seller multihoming",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "seller-multihoming-pricing")
  );

  const solved = generateSymbolicEquilibrium(confirmed);

  assert.equal(solved.researchSession?.phase, "equilibrium");
  assert.equal(solved.equilibriumResult?.status, "solved");
  assert.match(
    solved.equilibriumResult?.closedForm ?? "",
    /\\tau_A\^\*=\\tau_B\^\*=\\frac\{t_S-2\\alpha_B\}\{q\}/
  );
  assert.match(
    solved.equilibriumResult?.closedForm ?? "",
    /m_{AB}\^\*=1/
  );
  assert.match(
    [
      solved.equilibriumResult?.concept,
      solved.equilibriumResult?.derivation,
      ...(solved.equilibriumResult?.warnings ?? []),
    ].join("\n"),
    /卖家多归属|收窄|对称内部/
  );
  assert.equal(
    solved.researchSession?.assetSummary.pendingDecision?.kind,
    "analyze_properties"
  );
});

test("non-recommended property fallback avoids default commission subsidy comparative statics", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform seller multihoming",
    now: 1710000000000,
  });
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "seller-multihoming-pricing")
    )
  );

  const analyzed = generatePropertyAnalysis(solved);
  const analysisText = (analyzed.propertyAnalyses ?? [])
    .map((analysis) =>
      [
        analysis.target,
        analysis.parameter,
        analysis.symbolicResult,
        analysis.propositionDraft,
        analysis.proofSketch,
        analysis.intuition,
        ...(analysis.warnings ?? []),
      ].join("\n")
    )
    .join("\n");

  assert.equal(analyzed.researchSession?.phase, "analysis");
  assert.doesNotMatch(
    analysisText,
    /\\frac\{\\partial \\tau_i\^\*\}\{\\partial \\alpha_B\}=-\\frac\{2\}\{q\}/
  );
  assert.match(analysisText, /multihoming|m_i|kappa|seller/i);
});

test("other non-default directions stop at a model-grounded symbolic scaffold", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform quality disclosure",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "quality-disclosure-trust")
  );

  const solved = generateSymbolicEquilibrium(confirmed);
  const combinedText = [
    solved.hotellingModel?.modelSetupDraft,
    ...(solved.hotellingModel?.profitFunctions.map((entry) => entry.expression) ?? []),
    solved.equilibriumResult?.status,
    ...(solved.equilibriumResult?.focs ?? []),
    solved.equilibriumResult?.closedForm,
    solved.equilibriumResult?.derivation,
    ...(solved.equilibriumResult?.warnings ?? []),
  ].join("\n");

  assert.equal(solved.equilibriumResult?.status, "symbolic_failure");
  assert.equal(
    solved.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
  assert.match(combinedText, /quality-disclosure-trust|当前模型绑定/);
  assert.match(combinedText, /\\frac\{\\partial \\Pi_A\}\{\\partial \\tau_A\}=0/);
  assert.match(
    combinedText,
    /\\frac\{\\partial \\Pi_A\}\{\\partial a_\{quality-disclosure-trust\}\}=0/
  );
  assert.doesNotMatch(
    combinedText,
    /\\tau_A\^\*=\\tau_B\^\*=\\frac\{t_S-2\\alpha_B\}\{q\}/
  );
  assert.match(
    combinedText,
    /质量|披露|符号|机制/
  );
});

test("model-aware equilibrium scaffold does not leak decisions outside the current model", () => {
  const hotellingModel = {
    symbols: [
      {
        id: "tau_A",
        symbol: "tau_A",
        baseSymbol: "tau",
        subscript: "A",
        codeName: "tau_A",
        name: "A commission",
        meaning: "Platform A commission.",
        role: "decision",
        side: "platform",
        assumption: "real",
        recommended: true,
      },
      {
        id: "tau_B",
        symbol: "tau_B",
        baseSymbol: "tau",
        subscript: "B",
        codeName: "tau_B",
        name: "B commission",
        meaning: "Platform B commission.",
        role: "decision",
        side: "platform",
        assumption: "real",
        recommended: true,
      },
      {
        id: "q",
        symbol: "q",
        baseSymbol: "q",
        codeName: "q",
        name: "transaction value",
        meaning: "Transaction value.",
        role: "parameter",
        side: "global",
        assumption: "positive",
        recommended: true,
      },
    ],
    sides: {
      consumerSideName: "buyers",
      merchantSideName: "sellers",
    },
    platforms: ["A", "B"],
    timing: [
      {
        id: "pricing",
        order: 1,
        name: "platform pricing",
        decisions: ["tau_A", "tau_B"],
      },
    ],
    utilityFunctions: [],
    demandDerivation: "n_A^B and n_A^S come from indifference conditions.",
    profitFunctions: [
      {
        id: "profit-a",
        platform: "A",
        expression: "Pi_A = tau_A * q * n_A^B * n_A^S",
        notes: "Platform A profit.",
      },
      {
        id: "profit-b",
        platform: "B",
        expression: "Pi_B = tau_B * q * n_B^B * n_B^S",
        notes: "Platform B profit.",
      },
    ],
    assumptions: ["q > 0"],
    modelSetupDraft: "Two-platform commission model.",
  };

  const equilibrium = createModelAwareEquilibriumScaffoldResult(
    hotellingModel,
    {
      status: "needs_revision",
    }
  );
  const verification = verifyEquilibriumMathConsistency({
    model: hotellingModel,
    equilibrium,
  });

  assert.doesNotMatch(equilibrium.code, /o_A|o_B/);
  assert.match(equilibrium.code, /sp\.diff\(Pi_A, tau_a\)/);
  assert.match(equilibrium.code, /sp\.diff\(Pi_B, tau_b\)/);
  assert.equal(verification.ok, true);
});

test("non-default local scaffolds avoid English fallback copy in user-facing assets", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台质量披露",
    now: 1710000000000,
  });
  const solved = generateSymbolicEquilibrium(
    confirmResearchModel(adoptResearchDirection(project, "quality-disclosure-trust"))
  );
  const userFacingText = [
    solved.hotellingModel?.modelSetupDraft,
    solved.equilibriumResult?.concept,
    solved.equilibriumResult?.closedForm,
    solved.equilibriumResult?.derivation,
    ...(solved.equilibriumResult?.warnings ?? []),
  ].join("\n");

  assert.doesNotMatch(userFacingText, /Selected direction|fallback|direction-specific/i);
  assert.match(userFacingText, /质量|披露|符号|机制/);
});

test("confirms the model and marks the session ready for symbolic solving", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const adopted = adoptResearchDirection(
    project,
    "secondhand-commission-subsidy-hotelling"
  );

  const confirmed = confirmResearchModel(adopted);

  assert.equal(confirmed.researchSession?.phase, "equilibrium");
  assert.equal(
    confirmed.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
  assert.equal(
    confirmed.researchSession?.assetSummary.equilibriumStatus,
    "等待开始求解"
  );
  assert.equal(confirmed.equilibriumResult?.status, "needs_revision");
  assert.equal(confirmed.equilibriumResult?.closedForm, "");
  assert.ok(
    confirmed.researchSession?.assetSummary.nextActions.includes(
      "点击开始符号求解后进入均衡求解阶段"
    )
  );
  assert.equal(confirmed.researchSession?.messages.at(-2)?.role, "user");
  assert.equal(confirmed.researchSession?.messages.at(-1)?.role, "assistant");
  assert.match(
    confirmed.researchSession?.messages.at(-1)?.content ?? "",
    /开始符号求解/
  );
});

test("generates symbolic equilibrium and moves the session into equilibrium phase", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );

  const solved = generateSymbolicEquilibrium(confirmed);

  assert.equal(solved.researchSession?.phase, "equilibrium");
  assert.equal(solved.equilibriumResult?.status, "solved");
  assert.ok(solved.equilibriumResult?.closedForm);
  assert.match(
    solved.equilibriumResult?.closedForm ?? "",
    /\\tau_A\^\*=\\tau_B\^\*=\\frac\{t_S-2\\alpha_B\}\{q\}/
  );
  assert.match(
    solved.equilibriumResult?.closedForm ?? "",
    /s_A\^\*=s_B\^\*=\\frac\{t_S\+\\alpha_S-2t_B-2\\alpha_B\}\{2\}/
  );
  assert.match(
    solved.equilibriumResult?.derivation ?? "",
    /n_A\^B=\\frac\{1\}\{2\}\+\\frac\{t_S\\Delta s-\\alpha_B q\\Delta\\tau\}\{2D\}/
  );
  assert.match(solved.equilibriumResult?.code ?? "", /sp\.solve/);
  assert.equal(solved.researchSession?.assetSummary.equilibriumStatus, "solved");
  assert.equal(
    solved.researchSession?.assetSummary.pendingDecision?.kind,
    "analyze_properties"
  );
  assert.ok(
    solved.researchSession?.assetSummary.nextActions.includes("生成性质分析")
  );
  assert.match(
    solved.researchSession?.assetSummary.pendingDecision?.prompt ?? "",
    /性质分析/
  );
  assert.match(
    solved.researchSession?.messages.at(-1)?.content ?? "",
    /符号均衡/
  );
});

test("recognizes unicode tau decisions as commission controls", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "unicode tau commission subsidy model",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );
  assert.ok(confirmed.hotellingModel);

  const unicodeTauProject = {
    ...confirmed,
    hotellingModel: {
      ...confirmed.hotellingModel,
      timing: confirmed.hotellingModel.timing.map((stage) =>
        stage.order === 1
          ? { ...stage, decisions: ["s_A", "s_B", "τ_A", "τ_B"] }
          : stage
      ),
    },
  };

  const solved = generateSymbolicEquilibrium(unicodeTauProject);

  assert.equal(solved.equilibriumResult?.status, "solved");
  assert.match(
    solved.equilibriumResult?.closedForm ?? "",
    /\\tau_A\^\*=\\tau_B\^\*/
  );
  assert.equal(
    solved.researchSession?.assetSummary.pendingDecision?.kind,
    "analyze_properties"
  );
});

test("tracks session decisions from direction discovery to solve readiness", () => {
  const initial = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const adopted = adoptResearchDirection(
    initial,
    "secondhand-commission-subsidy-hotelling"
  );
  const confirmed = confirmResearchModel(adopted);

  assert.deepEqual(
    [
      initial.researchSession?.phase,
      adopted.researchSession?.phase,
      confirmed.researchSession?.phase,
      generateSymbolicEquilibrium(confirmed).researchSession?.phase,
      generatePropertyAnalysis(generateSymbolicEquilibrium(confirmed))
      .researchSession?.phase,
    ],
    [
      "direction",
      "model",
      "equilibrium",
      "equilibrium",
      "analysis",
    ]
  );
  assert.deepEqual(
    [
      initial.researchSession?.assetSummary.pendingDecision?.kind,
      adopted.researchSession?.assetSummary.pendingDecision?.kind,
      confirmed.researchSession?.assetSummary.pendingDecision?.kind,
      generateSymbolicEquilibrium(confirmed).researchSession?.assetSummary
        .pendingDecision?.kind,
      generatePropertyAnalysis(generateSymbolicEquilibrium(confirmed))
        .researchSession?.assetSummary.pendingDecision?.kind,
    ],
    [
      "choose_direction",
      "answer_model_question",
      "solve_equilibrium",
      "analyze_properties",
      undefined,
    ]
  );
});

test("keeps right-side asset fields populated through model confirmation", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const adopted = adoptResearchDirection(
    project,
    "secondhand-commission-subsidy-hotelling"
  );
  const confirmed = confirmResearchModel(adopted);
  const asset = confirmed.researchSession?.assetSummary;

  assert.equal(asset?.currentDirection?.id, "secondhand-commission-subsidy-hotelling");
  assert.equal(asset?.currentDirection?.title, confirmed.refinedIdea);
  assert.equal(asset?.confirmedAssumptions.length, confirmed.hotellingModel?.assumptions.length);
  assert.equal(asset?.utilityFunctions.length, confirmed.hotellingModel?.utilityFunctions.length);
  assert.ok(asset?.utilityFunctions.every((entry) => entry.startsWith("$") && entry.endsWith("$")));
  assert.equal(asset?.equilibriumStatus, "等待开始求解");
  assert.equal(asset?.pendingDecision?.kind, "solve_equilibrium");
  assert.match(asset?.pendingDecision?.prompt ?? "", /开始符号求解/);
  assert.equal(confirmed.equilibriumResult?.status, "needs_revision");
  assert.ok(asset?.nextActions.length);
});

test("keeps right-side asset fields populated after generating equilibrium", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );

  const solved = generateSymbolicEquilibrium(confirmed);
  const asset = solved.researchSession?.assetSummary;

  assert.equal(asset?.currentDirection?.id, "secondhand-commission-subsidy-hotelling");
  assert.equal(asset?.confirmedAssumptions.length, solved.hotellingModel?.assumptions.length);
  assert.equal(asset?.utilityFunctions.length, solved.hotellingModel?.utilityFunctions.length);
  assert.equal(asset?.equilibriumStatus, "solved");
  assert.equal(asset?.pendingDecision?.kind, "analyze_properties");
  assert.ok(asset?.nextActions.includes("生成性质分析"));
  assert.ok(solved.equilibriumResult?.closedForm);
  assert.ok(solved.equilibriumResult?.focs.length);
});

test("generates a symbolic property analysis and moves the session into analysis phase", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const adopted = adoptResearchDirection(
    project,
    "secondhand-commission-subsidy-hotelling"
  );
  const equilibriumProject = generateSymbolicEquilibrium(confirmResearchModel(adopted));

  const analyzed = generatePropertyAnalysis(equilibriumProject);

  assert.equal(analyzed.researchSession?.phase, "analysis");
  assert.equal(analyzed.researchSession?.assetSummary.pendingDecision, undefined);
  assert.equal(analyzed.researchSession?.assetSummary.currentDirection?.id, "secondhand-commission-subsidy-hotelling");
  assert.equal(analyzed.researchSession?.assetSummary.equilibriumStatus, "solved");
  assert.equal(analyzed.propertyAnalyses?.length, 3);
  const analysis = analyzed.propertyAnalyses?.[0];
  assert.equal(analysis?.operation, "differentiate");
  assert.match(analysis?.symbolicResult ?? "", /\\frac\{\\partial \\tau_i\^\*\}\{\\partial \\alpha_B\}=-\\frac\{2\}\{q\}/);
  assert.ok(analyzed.researchSession?.assetSummary.nextActions.includes("整理命题与证明草稿"));
  assert.doesNotMatch(
    [
      analysis?.symbolicResult,
      analysis?.signCondition,
      analysis?.proofSketch,
      analysis?.intuition,
    ].join("\n"),
    /Monte Carlo|仿真结果|数值模拟结果|令\s+\w+\s*=\s*\d/
  );
});

test("does not allow property analysis before symbolic solving starts", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );

  assert.throws(
    () => generatePropertyAnalysis(confirmed),
    /symbolic equilibrium asset/
  );
});

test("does not allow property analysis after a symbolic failure draft", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "research platform pricing",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );
  const symbolicFailureProject = {
    ...confirmed,
    equilibriumResult: {
      status: "symbolic_failure",
      concept: "Implicit symbolic system only",
      solvingSteps: ["Write FOCs."],
      focs: ["F(z,theta)=0"],
      conditions: ["det(J)!=0"],
      closedForm: "No closed-form equilibrium yet.",
      derivation: "This is not usable for comparative statics.",
      code: "",
      warnings: ["Manual review required."],
    },
  };

  assert.throws(
    () => generatePropertyAnalysis(symbolicFailureProject),
    /closed-form symbolic equilibrium/
  );
});

test("normalizes legacy scaffolded equilibrium sessions back to solve readiness", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });
  const adopted = adoptResearchDirection(
    project,
    "secondhand-commission-subsidy-hotelling"
  );
  const legacy = {
    ...adopted,
    researchSession: {
      ...adopted.researchSession,
      phase: "equilibrium",
      assetSummary: {
        ...adopted.researchSession.assetSummary,
        equilibriumStatus: "待推导解析解",
        pendingDecision: {
          kind: "solve_equilibrium",
          prompt:
            "模型已确认。请检查一阶条件和约束是否符合你的论文设定；性质分析暂时锁定，直到解析均衡解完成。",
        },
        nextActions: [
          "查看符号化一阶条件",
          "确认内部解与二阶条件",
          "解析解可用后进入性质分析",
        ],
      },
    },
  };

  const normalized = normalizeResearchProjectForWorkspace(legacy);

  assert.equal(normalized.researchSession?.phase, "model");
  assert.equal(
    normalized.researchSession?.assetSummary.equilibriumStatus,
    "等待开始求解"
  );
  assert.match(
    normalized.researchSession?.assetSummary.pendingDecision?.prompt ?? "",
    /开始符号求解/
  );
  assert.ok(
    normalized.researchSession?.assetSummary.nextActions.includes(
      "点击开始符号求解后进入均衡求解阶段"
    )
  );
  assert.equal(legacy.researchSession?.phase, "equilibrium");
});

test("normalizes symbolic failure projects that were incorrectly advanced to analysis", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "research platform pricing",
    now: 1710000000000,
  });
  const confirmed = confirmResearchModel(
    adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
  );
  const staleAdvanced = {
    ...confirmed,
    equilibriumResult: {
      status: "symbolic_failure",
      concept: "Current model-bound symbolic system draft",
      solvingSteps: ["Write FOCs."],
      focs: ["F(z,theta)=0"],
      conditions: ["det(J)!=0"],
      closedForm: "No closed-form equilibrium yet.",
      derivation: "This draft must not unlock property analysis.",
      code: "",
      warnings: ["Manual review required."],
    },
    researchSession: {
      ...confirmed.researchSession,
      phase: "analysis",
      assetSummary: {
        ...confirmed.researchSession.assetSummary,
        equilibriumStatus: "symbolic_failure",
        pendingDecision: {
          kind: "analyze_properties",
          prompt: "Incorrectly advanced to property analysis.",
        },
        nextActions: ["Generate property analysis"],
      },
    },
  };

  const normalized = normalizeResearchProjectForWorkspace(staleAdvanced);

  assert.equal(normalized.researchSession?.phase, "equilibrium");
  assert.equal(
    normalized.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
  assert.match(
    normalized.researchSession?.assetSummary.pendingDecision?.prompt ?? "",
    /闭式解|符号均衡/
  );
});
