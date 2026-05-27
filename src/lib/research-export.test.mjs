import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResearchProjectMarkdown,
  getResearchProjectMarkdownFilename,
} from "./research-export.ts";
import {
  adoptResearchDirection,
  confirmResearchModel,
  createExplorationProject,
  generatePropertyAnalysis,
  generateSymbolicEquilibrium,
} from "./research-session.ts";
import { applyResearchAssetPatchToProject } from "./research-asset-patch-apply.ts";

function createGeneratedResearchProject(rawIdea = "secondhand platform subsidy") {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea,
    now: 1710000000000,
  });

  return generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      ),
      { acceptDefaultFallbackScope: true }
    )
  );
}

test("getResearchProjectMarkdownFilename returns a stable sanitized Markdown filename", () => {
  const project = {
    ...createGeneratedResearchProject(),
    refinedIdea: '  A/B: platform <commission> "subsidy"? *policy*  ',
  };

  assert.equal(
    getResearchProjectMarkdownFilename(project),
    "paperforge-A-B-platform-commission-subsidy-policy.md"
  );
  assert.equal(
    getResearchProjectMarkdownFilename(project),
    "paperforge-A-B-platform-commission-subsidy-policy.md"
  );
});

test("buildResearchProjectMarkdown produces non-empty paper markdown for a fully generated project", () => {
  const analyzed = createGeneratedResearchProject();

  const markdown = buildResearchProjectMarkdown(analyzed);

  assert.ok(markdown.trim().length > 0);
  assert.match(markdown, /^# /);
  assert.match(markdown, /\n## /);
});

test("buildResearchProjectMarkdown includes the core research assets", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究二手平台佣金与补贴策略",
    now: 1710000000000,
  });
  const analyzed = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      ),
      { acceptDefaultFallbackScope: true }
    )
  );

  const markdown = buildResearchProjectMarkdown(analyzed);

  assert.match(markdown, /^# /m);
  assert.match(markdown, /## 研究方向/);
  assert.match(markdown, /## 模型设定/);
  assert.match(markdown, /## 符号均衡/);
  assert.match(markdown, /## 性质分析/);
  assert.match(markdown, /二手平台佣金与补贴策略/);
  assert.match(markdown, /命题草稿/);
});

test("buildResearchProjectMarkdown includes applied paper draft sections", () => {
  const analyzed = createGeneratedResearchProject();
  const patch = {
    id: "patch-paper-export",
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
            id: "paper-introduction",
            title: "引言与研究问题",
            content: "这是已经应用到论文输出资产里的引言章节。",
            status: "generated",
          },
          {
            id: "paper-model",
            title: "模型设定",
            content: "这是已经应用到论文输出资产里的模型章节。",
            status: "generated",
          },
        ],
      },
    ],
  };
  const projectWithPatch = {
    ...analyzed,
    researchSession: {
      ...analyzed.researchSession,
      assetPatches: [...(analyzed.researchSession?.assetPatches ?? []), patch],
    },
  };
  const applied = applyResearchAssetPatchToProject(projectWithPatch, patch, {
    now: 1710000000002,
  });

  const markdown = buildResearchProjectMarkdown(applied);

  assert.match(markdown, /## 论文输出/);
  assert.match(markdown, /### 引言与研究问题/);
  assert.match(markdown, /这是已经应用到论文输出资产里的引言章节。/);
  assert.match(markdown, /### 模型设定/);
  assert.match(markdown, /这是已经应用到论文输出资产里的模型章节。/);
});

test("buildResearchProjectMarkdown includes saved math artifacts", () => {
  const analyzed = {
    ...createGeneratedResearchProject(),
    researchSession: {
      ...createGeneratedResearchProject().researchSession,
      mathArtifacts: [
        {
          id: "artifact-residual",
          runId: "agent-equilibrium-test",
          stepId: "review-equilibrium",
          patchId: "patch-equilibrium-test",
          kind: "sympy_residual_check",
          title: "SymPy FOC 残差回代",
          status: "passed",
          source: "sympy",
          input: {
            residuals: ["2*tau_A-alpha_B"],
            substitutions: { tau_A: "alpha_B/2" },
          },
          output: { residuals: ["0"] },
          createdAt: 1710000000000,
        },
      ],
    },
  };

  const markdown = buildResearchProjectMarkdown(analyzed);

  assert.match(markdown, /## 数学产物记录/);
  assert.match(markdown, /SymPy FOC 残差回代/);
  assert.match(markdown, /agent-equilibrium-test/);
  assert.match(markdown, /"residuals": \[\s+"0"\s+\]/);
});

test("buildResearchProjectMarkdown exports a reproducible SymPy review script", () => {
  const analyzed = createGeneratedResearchProject();

  const markdown = buildResearchProjectMarkdown(analyzed);

  assert.match(markdown, /## 可复核 SymPy 脚本/);
  assert.match(markdown, /from sympy\.parsing\.sympy_parser import parse_expr/);
  assert.match(markdown, /symbol_names =/);
  assert.match(markdown, /profit_functions =/);
  assert.match(markdown, /\("Pi_A", "tau_A q n_A_S n_A_B - s_A n_A_B"\)/);
  assert.match(markdown, /raw_profit_foc_residuals =/);
  assert.match(markdown, /equilibrium_residual_inputs =/);
  assert.match(markdown, /foc_residuals = list\(equilibrium_residuals\)/);
  assert.match(markdown, /candidate_solution =/);
  assert.match(markdown, /\("tau_A", "\(t_S-2alpha_B\)\/\(q\)"\)/);
  assert.match(markdown, /\("tau", "\(t_S-2alpha_B\)\/\(q\)"\)/);
  assert.match(markdown, /candidate_residuals/);
  assert.match(markdown, /sp\.solve\(foc_residuals/);
  assert.match(markdown, /property_claims =/);
  assert.match(markdown, /'target_names': \["tau_A", "tau_B"\]/);
});

test("buildResearchProjectMarkdown does not export symbolic failures as closed form solutions", () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "研究商家多归属的外卖平台竞争",
    now: 1710000000000,
  });
  const solved = {
    ...confirmResearchModel(
      adoptResearchDirection(project, "seller-multihoming-pricing")
    ),
    equilibriumResult: {
      status: "symbolic_failure",
      concept: "隐式系统草稿",
      solvingSteps: ["列出一阶条件。"],
      focs: ["F(z,\\theta)=0"],
      conditions: ["\\det J_zF\\ne0"],
      closedForm: "当前只得到隐式系统草稿，尚未得到闭式均衡解。",
      derivation: "只得到符号推导草稿。",
      code: "print('implicit system')",
      warnings: ["不是闭式均衡。"],
    },
  };

  const markdown = buildResearchProjectMarkdown(solved);

  assert.equal(solved.equilibriumResult?.status, "symbolic_failure");
  assert.doesNotMatch(markdown, /### 闭式解/);
  assert.match(markdown, /### 未得到闭式解/);
  assert.match(markdown, /隐式系统草稿|符号推导草稿/);
});
