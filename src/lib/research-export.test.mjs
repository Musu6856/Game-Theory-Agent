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
      )
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
      )
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
