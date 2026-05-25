# PaperForge-Agent Productization Implementation Plan

> **For agentic workers:** implement this plan task by task. Keep asset edits reviewable, keep new Agent code under `src/lib/research-agent/`, and do not introduce cross-project memory in this release.

**Goal:** Bring PaperForge-Agent from an Agent v1 prototype to a productized small-group release that can be used by one game-theory research group before external resume/case-study packaging.

**Architecture:** This release hardens the current single-project Agent workflow rather than replacing it. It keeps `src/lib/ai-research-generation.ts` as the single-step capability layer, adds narrowly scoped Agent runners and reviewable patches where needed, and makes production readiness observable through checks, docs, and smoke tests.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Clerk, Neon + Drizzle, DeepSeek/OpenAI-compatible providers, Tavily/OpenAlex/Crossref/arXiv, KaTeX, existing `src/lib/research-agent/` orchestration.

---

## Release Boundary

This release includes:

1. 上线基础包
2. 章节级论文 Agent v2
3. CAS/SymPy v2
4. 长任务续跑 v1
5. 产品交付包
6. 小范围测试准备

This release excludes:

- 跨版本/跨项目记忆
- 跨项目审计报告
- 后台队列级大规模任务编排
- 自动绕过模型、均衡、性质分析或论文 patch 审核

## Task 1: 上线基础包

**Files:**

- Modify: `package.json`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/agent-upgrade-plan.md`
- Create: `docs/release-checklist.md`
- Optional create: `src/lib/release-readiness.ts`
- Optional test: `src/lib/release-readiness.test.mjs`

- [x] Add a single `npm test` script that runs every `*.test.mjs` file under `src/`.

  Command:

  ```powershell
  npm test
  ```

  Expected: exits `0` and reports zero failed test files.

- [x] Add a release checklist that covers Clerk production keys, Neon `DATABASE_URL`, model provider keys, Tavily/OpenAlex configuration, `npm run lint`, `npm test`, `npx tsc --noEmit`, `npm run build`, and a browser smoke test.

- [x] Make `.env.example` production-readable: separate required production variables from optional online-search variables, and warn that development Clerk keys are not acceptable for the small-group release.

- [x] If a release readiness helper is added, make it pure and testable. It classifies missing configuration as `blocking`, `degraded`, or `ready`, without printing secrets.

- [x] Verify:

  ```powershell
  npm run lint
  npm test
  npx tsc --noEmit
  npm run build
  ```

## Task 2: 章节级论文 Agent v2

**Files:**

- Create: `src/lib/research-agent/paper-section-runner.ts`
- Create: `src/lib/research-agent/paper-section-runner.test.mjs`
- Modify: `src/app/api/research/agent/route.ts`
- Modify: `src/lib/api.ts`
- Modify: `src/components/research-workspace/research-assets-panel.tsx`
- Modify: `src/lib/research-asset-patch.ts`
- Modify: `src/lib/research-asset-patch-apply.ts`

- [x] Add an Agent action for one selected paper section, separate from whole-paper `draft_paper`.

  Proposed action name:

  ```ts
  "revise_paper_section"
  ```

- [x] The request must include `project`, `sectionId`, and `rawIdea`. It may include a user instruction such as "加强文献动机" or "重写模型设定段落".

- [x] The runner should create a traceable AgentRun, identify the section's dependencies, generate a candidate revised section, and create a `paper` patch scoped to that section.

- [x] The patch must not overwrite `project.sections` until the user applies it.

- [x] UI must support selecting one section, generating a section rewrite suggestion, previewing the patch, and applying or rejecting it through the existing patch review flow.

- [x] The section patch records why the section changed through the patch note: 联网来源 count, model/equilibrium/property dependencies, and Agent self-review issues. The full latest asset-version context remains available in the History tab and audit export.

- [x] Verify with tests that a section patch only changes the intended section and that rejecting it leaves sections unchanged.

Current boundary: this v2 is a deterministic, reviewable section-revision loop. It does not yet call a separate LLM prompt for high-polish academic rewriting, and it does not bypass paper patch approval.

## Task 3: CAS/SymPy v2

**Files:**

- Modify: `src/lib/research-agent/math-verifier.ts`
- Modify: `src/lib/research-agent/math-verifier.test.mjs`
- Modify: `src/lib/research-agent/math-verification-summary.ts`
- Modify: `src/lib/research-agent/math-verification-summary.test.mjs`
- Optional create: `src/lib/research-agent/sympy-checker.ts`
- Optional test: `src/lib/research-agent/sympy-checker.test.mjs`

- [x] Expand the verifier from simple derivative checks to a structured verification result for each mathematical claim.

  Required statuses:

  ```ts
  "passed" | "failed" | "condition_insufficient" | "unsupported" | "manual_review"
  ```

- [x] Add tests for linear expressions, simple fractions, chained equations, parameter sign conditions, unsupported implicit systems, and failed derivative claims.

- [x] If SymPy is invoked, isolate it behind a small wrapper with timeouts and input limits. The app must keep working when Python/SymPy is unavailable.

- [x] The UI summary must never present unsupported expressions as proven. Unsupported or too-complex checks should route to artificial review language, not failure language.

- [x] Failed checks should block unsafe continuation to paper output until the user reviews or regenerates the relevant asset.

Current boundary: this release keeps CAS/SymPy optional and does not invoke an external Python/SymPy process. Unsupported or too-complex expressions are classified for manual review; condition-insufficient and failed checks block unsafe continuation.

## Task 4: 长任务续跑 v1

**Files:**

- Modify: `src/lib/research-agent/state.ts`
- Modify: `src/lib/research-agent/resume.ts`
- Modify: `src/lib/research-agent/recovery.ts`
- Modify: `src/lib/research-agent/trace.ts`
- Modify: `src/components/research-workspace/research-assets-panel.tsx`
- Modify: `src/components/research-workspace/research-workspace.tsx`

- [x] Persist enough AgentRun state in `researchSession.agentRunHistory` for refresh recovery: action, step status, checkpoint, patch ids, and stop reason.

- [x] Show a clear recovery card when the latest run is failed, paused, or suspiciously running.

- [x] Retry from the failed step without duplicating already proposed patches.

- [x] Continue to the next approval point only when there is no pending patch.

- [x] Do not try to resume half of an HTTP request in this release. The v1 contract is step-level retry and trace continuity.

- [x] Verify with tests that repeated retry does not create duplicate review patches for the same successful step.

## Task 5: 产品交付包

**Files:**

- Create: `docs/group-trial-guide.md`
- Create: `docs/operator-runbook.md`
- Create: `docs/demo-scenarios.md`
- Modify: `README.md`

- [x] Write a group trial guide for research users. It should explain what the Agent can do, what must be manually reviewed, and how to interpret "联网来源", "来源依据", "待审核修改", "数学验证", and "人工复核".

- [x] Write an operator runbook for the maintainer. It should cover setup, deployment, environment variables, database migration, common failures, and rollback.

- [x] Create three demo scenarios from realistic game-theory research prompts. Each scenario should list expected checkpoints, expected patches, and known limitations.

- [x] Add a feedback template for the later small-group test: useful step, confusing step, trust level, failure point, and desired improvement.

## Task 6: 小范围测试准备

**Files:**

- Create: `docs/group-trial-test-plan.md`
- Modify: `docs/release-checklist.md`

- [x] Define the trial cohort: 10-15 users from the research group, one maintainer, and a fixed trial window.

- [x] Define success metrics before testing starts:

  - at least 3 complete idea-to-paper-patch runs
  - no data loss after refresh
  - all core asset changes appear as reviewable patches
  - users can identify which math claims are verified and which need manual review
  - users can export an audit report for each trial project

- [x] Define stop conditions:

  - project data cannot be saved or restored
  - patch application changes the wrong asset
  - failed math verification is displayed as passed
  - provider secrets or private keys are exposed in UI, logs, or exported reports

- [x] Run the release checklist and record results before inviting trial users.

Current boundary: the checklist and recording templates are ready; actual trial run results are filled in by the maintainer immediately before inviting users.

## Final Release Gate

The release can move to small-group testing only when all of these pass:

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

And these manual checks are complete:

- A fresh account can create and save a project.
- A real prompt can reach direction discovery with online sources.
- A selected direction produces a reviewable model patch.
- Confirmed model flow produces a reviewable equilibrium patch.
- Applied equilibrium flow produces reviewable property patches.
- Applied properties flow produces paper or section-level paper patches.
- Refreshing the page does not lose the latest saved project or AgentRun history.
- Project audit export contains sources, traces, patches, version history, math summary, and paper review context.
