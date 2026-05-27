<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project facts

- PaperForge-Agent is the Agent-focused fork of PaperForge, located at `D:\Agent测试\PaperForge-Agent`.
- The source PaperForge project at `D:\Agent测试\Claude code test\paperforge` should remain a stable baseline. Do not modify it when working in this fork unless the user explicitly asks.
- PaperForge-Agent is a game-theory paper workflow Agent system for online-source-backed direction discovery, symbolic equilibrium, comparative statics, and paper export.
- Root docs that matter now: `README.md`, `docs/agent-upgrade-plan.md`, and `src/`.
- The active model source fallback order in code is `DEEPSEEK_API_KEY` → `OPENAI_COMPATIBLE_API_KEY` → `MIMO_API_KEY` → `OPENAI_API_KEY`.

## Agent upgrade direction

- Keep `src/lib/ai-research-generation.ts` as the single-step research capability layer unless a future refactor explicitly replaces it.
- Put new Agent orchestration code under `src/lib/research-agent/`.
- The Agent layer should own planning, running, state transitions, approval guards, traces, tool wrappers, and Agent-specific prompts.
- First-stage Agent work prioritizes user-controlled online search and source-backed direction discovery before full automatic paper generation.
- Model generation after a direction is adopted is agentified in v1: it should create traceable model candidates and reviewable model patches instead of silently overwriting assets.
- Symbolic equilibrium solving after model confirmation is agentified in v1: it should create traceable equilibrium candidates and reviewable equilibrium patches instead of silently overwriting assets.
- Property analysis after equilibrium application is agentified in v1: it should create traceable proposition candidates and reviewable property-analysis patches instead of silently overwriting assets.
- Paper output after property analysis is agentified in v1: it should create traceable section drafts and reviewable paper patches instead of silently overwriting `project.sections`.
- Chapter-level paper revision is agentified in v2: `revise_paper_section` creates traceable single-section paper patches such as `sections[paper-model]`; applying or rejecting the patch must affect only the targeted section.
- The controller flow is agentified in v1: it provides automatic next-step suggestions, blocker detection, safe continuation to the next approval point, and trace/history records for controller decisions.
- Version memory v1 records auditable asset-version events in `researchSession.assetVersionHistory`; applied events retain change snapshots and can generate reviewable rollback patches.
- Recovery suggestions v1: `src/lib/research-agent/recovery.ts` turns paused/failed/running AgentRun state into safe retry, continue, or review-required prompts without bypassing patch approval.
- AgentRun checkpoints v1: `src/lib/research-agent/state.ts` records step-level checkpoints, action, patch id, and stop reason for trace display and safer recovery suggestions.
- Executable checkpoint resume v1: `src/lib/research-agent/resume.ts` lets selected Agent actions retry from a failed checkpoint while preserving the original AgentRun id/history.
- Trace replay v1: `src/lib/research-agent/trace-replay.ts` groups plan steps, trace events, and checkpoints into a user-readable execution replay.
- CAS/SymPy v2 boundary: the current release uses the bounded internal math verifier plus optional restricted Python/SymPy checks for safe property-analysis derivatives, explicit equilibrium FOC residuals, independent `sympy.solve` comparison for explicit FOC systems, and FOC residual generation from safe structured profit expressions. Equilibrium review now records `compiled_game_system`, `generated_foc_system`, `sympy_residual_check`, `solver_attempt`, and `sympy_solve_check` math artifacts even when execution is skipped, and emits those artifacts incrementally so task checkpoints can persist step-level math evidence before the final patch is produced. The restricted dynamic planner can distinguish model repair, candidate-equilibrium repair, full re-solve, and manual review; the equilibrium runner must act on those decisions by creating a model repair patch for `repair_model`, doing only one bounded candidate repair for `repair_equilibrium_candidate`, switching back to model repair if the bounded repair exposes model input gaps, and keeping unsupported SymPy cases as manual review instead of silent failure. Proposed equilibrium/model patches, `researchSession.mathVerificationChecks`, and task checkpoints record SymPy review notes when checks run. Python/SymPy unavailability, unsafe input, and unsupported expressions route to manual review. External SymPy is not yet the primary equilibrium solver for arbitrary models and must not execute arbitrary model-generated Python code.
- Math verification UI must make review states actionable: `failed`/需修正 should tell users to return to model, equilibrium, or properties and create a reviewable fix patch; `condition_insufficient` should point to missing assumptions or existence conditions; `unsupported`/`manual_review` should explain what evidence to inspect before continuing. The right-side summary must merge persisted `researchSession.mathVerificationChecks`, not only freshly computed checks.
- Background task v1 boundary: `agent_tasks` stores task envelopes, status, lease, checkpoints, result, and failure reason; explicit task run routes and the protected worker GET/POST batch route can claim and execute tasks while saving the resulting project server-side. Task creation validates project ownership; task storage and API output must strip `runtimeModelSource`, API-key-shaped fields, token fields, and secret fields; browser-provided model keys are transient run inputs only. The worker batch route must use the persisted task ownerId and server-side model environment only, never browser-provided runtime model keys. Vercel Cron may call the worker GET route when `CRON_SECRET`/`AGENT_TASK_WORKER_SECRET` are configured; manual POST options must remain bounded and worker responses should include safe observability metadata. Runners renew the current worker lease and verify it before checkpoint/project writes so stale workers do not save over a re-claimed task. Completed task results should only report patch/artifact ids produced by the current AgentRun. Solve-equilibrium tasks should write math-artifact checkpoints as artifacts are produced, including artifact id/kind/status and a sanitized snapshot, while official project assets still enter through reviewable patches. `RUN_AGENT_TASK_DB_PROBE=1 node --test src\lib\research-agent\task-store-db-probe.test.mjs` verifies DB-backed queued -> running -> completed lifecycle and cleanup. This is not yet a fully managed queue, does not recover half-finished provider requests, and must not bypass reviewable asset patches.
- Markdown/KaTeX rendering boundary: `src/lib/markdown-math.ts` should protect existing `$...$`, `$$...$$`, `\(...\)`, `\[...\]`, inline code, and fenced code before wrapping bare symbolic tokens. Do not reintroduce formula normalization that can nest inline math inside display math blocks, especially in paper preview/export.
- Product delivery docs now live in `docs/group-trial-guide.md`, `docs/operator-runbook.md`, `docs/demo-scenarios.md`, and `docs/group-trial-test-plan.md`.
- The current Agent milestone has game-theory solver-kernel agentification, step-level math artifact persistence, restricted dynamic planning, and background task execution in place; cross-project memory remains the next separate milestone after product validation.
- Asset edits must remain reviewable: model, equilibrium, property-analysis, and paper-output changes should be proposed as patches before application.

## Future directory convention

```text
src/lib/research-agent/
  planner.ts
  runner.ts
  state.ts
  guards.ts
  trace.ts
  tools/
  prompts/
```

Do not create a separate root-level `agent/` framework unless the user explicitly changes the project architecture. This is a product-style Next.js Agent project, not a standalone Python/CLI Agent template.

## Web and literature tool safety

- Prefer search APIs and open scholarly APIs over unrestricted crawling.
- Only allow `http` and `https` URLs.
- Block localhost, private IP ranges, metadata services, and non-public network targets.
- Enforce timeout, page-size, and result-count limits.
- Store source URL, title, retrieval time, and a concise summary instead of passing full pages directly to the model.
- User-facing Chinese copy should say “联网搜索”, “来源依据”, or “联网来源” instead of literal English internal jargon.

## Documentation boundaries

- `docs/agent-upgrade-plan.md` is the living plan for this fork.
- Do not reintroduce `docs/superpowers/`, `.agents/`, `skills-lock.json`, or old root planning artifacts unless the user explicitly restores them.
- Keep README and AGENTS aligned when the Agent architecture changes.
