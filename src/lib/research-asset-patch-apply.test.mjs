import test from "node:test";
import assert from "node:assert/strict";

import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generateSymbolicEquilibrium,
} from "./research-session.ts";
import {
  applyQuickReviewAssetPatchesToProject,
  applyResearchAssetPatchToProject,
  markProjectPatchStatus,
} from "./research-asset-patch-apply.ts";
import { getResearchFlowState } from "./research-flow.ts";

function createSolvedProject() {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金和补贴策略",
    now: 1710000000000,
  });

  return generateSymbolicEquilibrium(
    confirmResearchModel(
      adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
    )
  );
}

test("applies a proposed properties patch to the right-side property analyses", () => {
  const project = createSolvedProject();
  const patch = {
    id: "patch-properties",
    kind: "properties",
    summary: "新增两条性质分析",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "append",
        path: "propertyAnalyses",
        value: [
          {
            id: "alpha-b-fee",
            target: "\\tau_i^*",
            parameter: "\\alpha_B",
            operation: "differentiate",
            symbolicResult:
              "\\frac{\\partial \\tau_i^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
            signCondition: "当 q>0 时为负。",
            propositionDraft: "命题：买家侧网络效应提高会降低均衡佣金。",
            proofSketch: "由闭式解直接对 \\alpha_B 求偏导。",
            intuition: "买家侧外部性越强，平台越有动机降低佣金以扩大交易。",
            warnings: [],
          },
          {
            id: "alpha-s-subsidy",
            target: "s_i^*",
            parameter: "\\alpha_S",
            operation: "differentiate",
            symbolicResult:
              "\\frac{\\partial s_i^*}{\\partial \\alpha_S}=\\frac{1}{2}",
            signCondition: "恒为正。",
            propositionDraft: "命题：卖家侧网络效应提高会抬高均衡补贴。",
            proofSketch: "由闭式解直接对 \\alpha_S 求偏导。",
            intuition: "卖家侧价值越高，平台越愿意通过补贴吸引卖家。",
            warnings: [],
          },
        ],
      },
    ],
  };

  const nextProject = applyResearchAssetPatchToProject(project, patch, {
    now: 1710000000002,
  });

  assert.equal(nextProject.propertyAnalyses?.length, 2);
  assert.equal(nextProject.propertyAnalyses?.[0].id, "alpha-b-fee");
  assert.equal(nextProject.propertyAnalyses?.[1].id, "alpha-s-subsidy");
  assert.equal(nextProject.researchSession?.phase, "analysis");
  assert.equal(nextProject.researchSession?.assetFreshness?.properties, "fresh");
  assert.equal(nextProject.researchSession?.assetSummary.pendingDecision, undefined);
  assert.ok(
    nextProject.researchSession?.messages
      .at(-1)
      ?.content.includes("性质分析资产")
  );
});

test("applies a paper patch to the right-side draft sections", () => {
  const project = createSolvedProject();
  const patch = {
    id: "patch-paper",
    kind: "paper",
    summary: "生成论文草稿章节",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "sections",
        value: [
          {
            id: "intro",
            title: "引言",
            content: "本文研究二手交易平台佣金与补贴策略。",
            status: "generated",
          },
          {
            id: "model",
            title: "模型设定",
            content: "本节整理参与者、时序和收益函数。",
            status: "generated",
          },
        ],
      },
    ],
  };

  const projectWithPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
      phase: "paper",
      assetSummary: {
        ...project.researchSession.assetSummary,
        pendingDecision: {
          kind: "draft_paper",
          prompt: "请先审阅并应用论文草稿建议。",
        },
      },
    },
  };

  const nextProject = applyResearchAssetPatchToProject(projectWithPatch, patch, {
    now: 1710000000002,
  });

  assert.equal(nextProject.sections.length, 2);
  assert.equal(nextProject.sections[0].title, "引言");
  assert.equal(nextProject.sections[1].status, "generated");
  assert.equal(nextProject.researchSession?.phase, "paper");
  assert.equal(nextProject.researchSession?.assetSummary.pendingDecision, undefined);
  assert.equal(nextProject.researchSession?.assetPatches?.at(-1)?.status, "applied");
  assert.equal(
    nextProject.researchSession?.assetVersionHistory?.at(-1)?.action,
    "applied_patch"
  );
  assert.equal(
    nextProject.researchSession?.assetVersionHistory?.at(-1)?.patchId,
    "patch-paper"
  );
  assert.ok(
    nextProject.researchSession?.messages
      .at(-1)
      ?.content.includes("论文草稿")
  );
});

test("applies a paper patch to only the targeted section", () => {
  const project = {
    ...createSolvedProject(),
    sections: [
      {
        id: "paper-introduction",
        title: "引言",
        content: "Original introduction.",
        status: "generated",
      },
      {
        id: "paper-model",
        title: "模型设定",
        content: "Original model section.",
        status: "generated",
      },
      {
        id: "paper-discussion",
        title: "讨论",
        content: "Original discussion.",
        status: "generated",
      },
    ],
  };
  const patch = {
    id: "patch-paper-section-model",
    kind: "paper",
    summary: "改写模型设定章节",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "sections[paper-model]",
        value: {
          id: "paper-model",
          title: "模型设定",
          content: "Revised model section.",
          status: "generated",
        },
      },
    ],
  };
  const projectWithPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
      phase: "paper",
      assetSummary: {
        ...project.researchSession.assetSummary,
        pendingDecision: {
          kind: "draft_paper",
          prompt: "请先审阅本章改写建议。",
        },
      },
    },
  };

  const nextProject = applyResearchAssetPatchToProject(projectWithPatch, patch, {
    now: 1710000000002,
  });

  assert.equal(nextProject.sections.length, 3);
  assert.equal(nextProject.sections[0].content, "Original introduction.");
  assert.equal(nextProject.sections[1].id, "paper-model");
  assert.equal(nextProject.sections[1].content, "Revised model section.");
  assert.equal(nextProject.sections[2].content, "Original discussion.");
  assert.equal(
    nextProject.researchSession?.assetPatches?.find(
      (item) => item.id === "patch-paper-section-model"
    )?.status,
    "applied"
  );
  assert.equal(nextProject.researchSession?.assetSummary.pendingDecision, undefined);
});

test("removes only the targeted paper section", () => {
  const project = {
    ...createSolvedProject(),
    sections: [
      {
        id: "paper-introduction",
        title: "引言",
        content: "Original introduction.",
        status: "generated",
      },
      {
        id: "paper-model",
        title: "模型设定",
        content: "Original model section.",
        status: "generated",
      },
      {
        id: "paper-discussion",
        title: "讨论",
        content: "Original discussion.",
        status: "generated",
      },
    ],
  };
  const patch = {
    id: "patch-paper-section-remove-model",
    kind: "paper",
    summary: "移除模型设定章节",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "remove",
        path: "paper.sections[paper-model]",
      },
    ],
  };
  const projectWithPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
      phase: "paper",
    },
  };

  const nextProject = applyResearchAssetPatchToProject(projectWithPatch, patch, {
    now: 1710000000002,
  });

  assert.deepEqual(
    nextProject.sections.map((section) => section.id),
    ["paper-introduction", "paper-discussion"]
  );
});

test("rejecting a targeted paper section patch leaves sections unchanged", () => {
  const project = {
    ...createSolvedProject(),
    sections: [
      {
        id: "paper-introduction",
        title: "引言",
        content: "Original introduction.",
        status: "generated",
      },
      {
        id: "paper-model",
        title: "模型设定",
        content: "Original model section.",
        status: "generated",
      },
    ],
  };
  const patch = {
    id: "patch-paper-section-reject-model",
    kind: "paper",
    summary: "改写模型设定章节",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "sections[paper-model]",
        value: {
          id: "paper-model",
          title: "模型设定",
          content: "Rejected model section.",
          status: "generated",
        },
      },
    ],
  };
  const projectWithPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
      phase: "paper",
    },
  };

  const nextProject = markProjectPatchStatus(
    projectWithPatch,
    patch.id,
    "rejected",
    1710000000002
  );

  assert.equal(nextProject.sections[0].content, "Original introduction.");
  assert.equal(nextProject.sections[1].content, "Original model section.");
  assert.equal(
    nextProject.researchSession?.assetPatches?.at(-1)?.status,
    "rejected"
  );
});

test("quick review application only applies low-risk paper patches", () => {
  const project = createSolvedProject();
  const modelPatch = {
    id: "patch-model",
    kind: "model",
    summary: "修改模型",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "append",
        path: "hotellingModel.assumptions",
        value: "这条核心模型修改不应被快速应用。",
      },
    ],
  };
  const riskyPaperPatch = {
    id: "patch-paper-risk",
    kind: "paper",
    summary: "论文草稿但带数学风险",
    status: "proposed",
    createdAt: 1710000000002,
    changes: [
      {
        kind: "replace",
        path: "sections",
        value: [],
        note: "Agent 自检提示：符号条件不足。",
      },
    ],
  };
  const quickPaperPatch = {
    id: "patch-paper-quick",
    kind: "paper",
    summary: "生成论文草稿章节",
    status: "proposed",
    createdAt: 1710000000003,
    changes: [
      {
        kind: "replace",
        path: "sections",
        value: [
          {
            id: "intro",
            title: "引言",
            content: "本文研究二手交易平台佣金与补贴策略。",
            status: "generated",
          },
        ],
      },
    ],
  };
  const projectWithPatches = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [
        ...(project.researchSession?.assetPatches ?? []),
        modelPatch,
        riskyPaperPatch,
        quickPaperPatch,
      ],
    },
  };

  const result = applyQuickReviewAssetPatchesToProject(
    projectWithPatches,
    ["patch-model", "patch-paper-risk", "patch-paper-quick"],
    { now: 1710000000010 }
  );

  assert.equal(result.appliedCount, 1);
  assert.equal(result.project.sections[0]?.id, "intro");
  assert.equal(
    result.project.researchSession?.assetPatches?.find(
      (patch) => patch.id === "patch-paper-quick"
    )?.status,
    "applied"
  );
  assert.equal(
    result.project.researchSession?.assetPatches?.find(
      (patch) => patch.id === "patch-model"
    )?.status,
    "proposed"
  );
  assert.equal(
    result.project.researchSession?.assetPatches?.find(
      (patch) => patch.id === "patch-paper-risk"
    )?.status,
    "proposed"
  );
});

test("applies an equilibrium patch to the right-side equilibrium result", () => {
  const project = createSolvedProject();
  const patch = {
    id: "patch-equilibrium",
    kind: "equilibrium",
    summary: "改写闭式解和存在条件",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "equilibriumResult.closedForm",
        value:
          "\\tau_A^*=\\tau_B^*=\\frac{t_S-2\\alpha_B}{q},\\quad s_A^*=s_B^*=\\frac{t_S+\\alpha_S}{2}",
      },
      {
        kind: "append",
        path: "equilibriumResult.conditions",
        value: "二阶条件要求 q>0 且 D>0。",
      },
    ],
  };

  const nextProject = applyResearchAssetPatchToProject(project, patch, {
    now: 1710000000002,
  });

  assert.match(
    nextProject.equilibriumResult?.closedForm ?? "",
    /\\frac\{t_S-2\\alpha_B\}\{q\}/
  );
  assert.ok(
    nextProject.equilibriumResult?.conditions.includes("二阶条件要求 q>0 且 D>0。")
  );
  assert.equal(nextProject.researchSession?.assetFreshness?.equilibrium, "fresh");
  assert.equal(nextProject.researchSession?.assetFreshness?.properties, "stale");
  assert.equal(
    nextProject.researchSession?.assetSummary.pendingDecision?.kind,
    "analyze_properties"
  );
  assert.deepEqual(
    nextProject.researchSession?.assetVersionHistory?.at(-1)?.changedPaths,
    ["equilibriumResult.closedForm", "equilibriumResult.conditions"]
  );
});

test("applying a symbolic failure equilibrium patch keeps solving as the next step", () => {
  const project = createSolvedProject();
  const patch = {
    id: "patch-equilibrium-symbolic-failure",
    kind: "equilibrium",
    summary: "Equilibrium draft did not reach a closed form",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "equilibriumResult",
        value: {
          status: "symbolic_failure",
          concept: "Current model-bound symbolic system draft",
          solvingSteps: ["Write first-order conditions for the current model."],
          focs: ["F(z,theta)=0"],
          conditions: ["det(J)!=0"],
          closedForm: "No closed-form equilibrium yet.",
          derivation:
            "This draft records the symbolic system but does not unlock property analysis.",
          code: "print('manual review required')",
          warnings: ["Not a solved closed-form equilibrium."],
        },
      },
    ],
  };

  const nextProject = applyResearchAssetPatchToProject(project, patch, {
    now: 1710000000002,
  });
  const flow = getResearchFlowState(nextProject);

  assert.equal(nextProject.equilibriumResult?.status, "symbolic_failure");
  assert.equal(nextProject.researchSession?.phase, "equilibrium");
  assert.equal(
    nextProject.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
  assert.equal(flow.canAnalyzeProperties, false);
  assert.equal(flow.canSolveEquilibrium, true);
});

test("rejecting a proposed asset patch records a version history event", () => {
  const project = createSolvedProject();
  const patch = {
    id: "patch-reject-equilibrium",
    kind: "equilibrium",
    summary: "不采用这版均衡候选",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "equilibriumResult.closedForm",
        value: "\\tau^*=1",
      },
    ],
  };
  const projectWithPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
    },
  };

  const nextProject = markProjectPatchStatus(
    projectWithPatch,
    patch.id,
    "rejected",
    1710000000002
  );
  const event = nextProject.researchSession?.assetVersionHistory?.at(-1);

  assert.equal(
    nextProject.researchSession?.assetPatches?.at(-1)?.status,
    "rejected"
  );
  assert.equal(event?.action, "rejected_patch");
  assert.equal(event?.patchId, "patch-reject-equilibrium");
  assert.equal(event?.assetKind, "equilibrium");
  assert.deepEqual(event?.changedPaths, ["equilibriumResult.closedForm"]);
});

test("applies several model symbol operations and marks downstream assets stale", () => {
  const project = createSolvedProject();
  const patch = {
    id: "patch-model-symbols",
    kind: "model",
    summary: "Rename seller fee symbol and add platform fixed cost",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "hotellingModel.symbols[\\tau_A].symbol",
        value: "f_A",
      },
      {
        kind: "replace",
        path: "hotellingModel.symbols[f_A].meaning",
        value: "Platform A seller transaction fee rate.",
      },
      {
        kind: "append",
        path: "hotellingModel.symbols",
        value: {
          symbol: "F_A",
          baseSymbol: "F",
          subscript: "A",
          codeName: "F_A",
          name: "Platform A fixed cost",
          meaning: "Platform A fixed operating cost.",
          role: "cost",
          side: "platform",
          assumption: "nonnegative",
          recommended: false,
        },
      },
      {
        kind: "append",
        path: "hotellingModel.assumptions",
        value: "Platforms have fixed operating costs.",
      },
    ],
  };

  const projectWithPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
    },
  };

  const nextProject = applyResearchAssetPatchToProject(projectWithPatch, patch, {
    now: 1710000000002,
  });
  const symbols = nextProject.hotellingModel?.symbols ?? [];
  const feeSymbols = symbols.filter(
    (symbol) => symbol.symbol === "f_A" || symbol.codeName === "f_A"
  );
  const oldFeeSymbols = symbols.filter(
    (symbol) => symbol.symbol === "tau_A" || symbol.codeName === "tau_A"
  );
  const fixedCost = symbols.find((symbol) => symbol.codeName === "F_A");
  const appliedPatch = nextProject.researchSession?.assetPatches?.find(
    (item) => item.id === "patch-model-symbols"
  );

  assert.equal(feeSymbols.length, 1);
  assert.equal(oldFeeSymbols.length, 0);
  assert.equal(feeSymbols[0].meaning, "Platform A seller transaction fee rate.");
  assert.equal(fixedCost?.role, "cost");
  assert.ok(
    nextProject.hotellingModel?.assumptions.includes(
      "Platforms have fixed operating costs."
    )
  );
  assert.equal(appliedPatch?.status, "applied");
  assert.equal(appliedPatch?.appliedAt, 1710000000002);
  assert.equal(nextProject.researchSession?.assetFreshness?.model, "fresh");
  assert.equal(nextProject.researchSession?.assetFreshness?.equilibrium, "stale");
  assert.equal(nextProject.researchSession?.assetFreshness?.properties, "stale");
  assert.equal(
    nextProject.researchSession?.assetSummary.pendingDecision?.kind,
    "solve_equilibrium"
  );
});

test("applies model text patches for confirmed repair proposals", () => {
  const project = createSolvedProject();
  const patch = {
    id: "patch-model-repair-text",
    kind: "model",
    summary: "补充可求解机制函数设定",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "hotellingModel.modelSetupDraft",
        value:
          "在模型中令 \\psi_i(a_{d2}) = k_B a_{d2}，\\phi_i(a_{d2}) = k_S a_{d2}。",
      },
      {
        kind: "replace",
        path: "hotellingModel.demandDerivation",
        value:
          "需求推导沿用 Hotelling 无差异点，并代入 \\psi_i(a_{d2}) = k_B a_{d2}。",
      },
      {
        kind: "append",
        path: "hotellingModel.assumptions",
        value: "\\psi_i(a_{d2}) = k_B a_{d2}",
      },
    ],
  };
  const projectWithPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
    },
  };

  const nextProject = applyResearchAssetPatchToProject(projectWithPatch, patch, {
    now: 1710000000002,
  });

  assert.match(
    nextProject.hotellingModel?.modelSetupDraft ?? "",
    /\\psi_i\(a_\{d2\}\) = k_B a_\{d2\}/
  );
  assert.match(
    nextProject.hotellingModel?.demandDerivation ?? "",
    /Hotelling 无差异点/
  );
  assert.ok(
    nextProject.hotellingModel?.assumptions.includes(
      "\\psi_i(a_{d2}) = k_B a_{d2}"
    )
  );
  assert.equal(nextProject.researchSession?.assetFreshness?.equilibrium, "stale");
});

test("applies multi-symbol model patches with several inserts and replacements", () => {
  const project = createSolvedProject();
  const patch = {
    id: "patch-model-many-symbols",
    kind: "model",
    summary: "Batch update model symbols",
    status: "proposed",
    createdAt: 1710000000001,
    changes: [
      {
        kind: "replace",
        path: "hotellingModel.symbols[tau_A].symbol",
        value: "r_A",
      },
      {
        kind: "replace",
        path: "hotellingModel.symbols[tau_B].name",
        value: "Platform B seller fee rate",
      },
      {
        kind: "append",
        path: "hotellingModel.symbols",
        value: {
          symbol: "F_A",
          baseSymbol: "F",
          subscript: "A",
          codeName: "F_A",
          name: "Platform A fixed cost",
          meaning: "Platform A fixed operating cost.",
          role: "cost",
          side: "platform",
          assumption: "nonnegative",
          recommended: false,
        },
      },
      {
        kind: "append",
        path: "hotellingModel.symbols",
        value: {
          symbol: "F_B",
          baseSymbol: "F",
          subscript: "B",
          codeName: "F_B",
          name: "Platform B fixed cost",
          meaning: "Platform B fixed operating cost.",
          role: "cost",
          side: "platform",
          assumption: "nonnegative",
          recommended: false,
        },
      },
    ],
  };
  const projectWithPatch = {
    ...project,
    researchSession: {
      ...project.researchSession,
      assetPatches: [...(project.researchSession?.assetPatches ?? []), patch],
    },
  };

  const nextProject = applyResearchAssetPatchToProject(projectWithPatch, patch, {
    now: 1710000000002,
  });
  const symbols = nextProject.hotellingModel?.symbols ?? [];
  const appliedPatch = nextProject.researchSession?.assetPatches?.find(
    (item) => item.id === "patch-model-many-symbols"
  );

  assert.equal(
    symbols.some((symbol) => symbol.symbol === "r_A" && symbol.codeName === "r_A"),
    true
  );
  assert.equal(
    symbols.some((symbol) => symbol.codeName === "tau_A"),
    false
  );
  assert.equal(
    symbols.find((symbol) => symbol.codeName === "tau_B")?.name,
    "Platform B seller fee rate"
  );
  assert.equal(symbols.find((symbol) => symbol.codeName === "F_A")?.role, "cost");
  assert.equal(symbols.find((symbol) => symbol.codeName === "F_B")?.role, "cost");
  assert.equal(appliedPatch?.status, "applied");
  assert.equal(nextProject.researchSession?.assetFreshness?.model, "fresh");
  assert.equal(nextProject.researchSession?.assetFreshness?.equilibrium, "stale");
  assert.equal(nextProject.researchSession?.assetFreshness?.properties, "stale");
});
