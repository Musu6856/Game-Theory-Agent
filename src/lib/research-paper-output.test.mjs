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

test("buildResearchProjectMarkdown still produces a preview when sections are empty", () => {
  const project = createExplorationProject({
    id: "33333333-3333-4333-8333-333333333333",
    rawIdea: "second-hand platform commissions and subsidies",
    now: 1710000000000,
  });
  const generated = generatePropertyAnalysis(
    generateSymbolicEquilibrium(
      confirmResearchModel(
        adoptResearchDirection(project, "secondhand-commission-subsidy-hotelling")
      )
    )
  );
  generated.sections = [];

  const markdown = buildResearchProjectMarkdown(generated);

  assert.match(markdown, /^# /m);
  assert.match(markdown, /## /m);
  assert.match(markdown, /second-hand platform commissions and subsidies/);
  assert.ok(markdown.length > 500);
});

test("getResearchProjectMarkdownFilename sanitizes punctuation and keeps the paperforge prefix", () => {
  const project = createExplorationProject({
    id: "44444444-4444-4444-8444-444444444444",
    rawIdea: "original idea",
    now: 1710000000000,
  });
  project.refinedIdea = "paper/output:preview?";

  const filename = getResearchProjectMarkdownFilename(project);

  assert.equal(filename, "paperforge-paper-output-preview.md");
  assert.ok(!filename.includes("/"));
  assert.ok(!filename.includes(":"));
  assert.ok(!filename.includes("?"));
});
