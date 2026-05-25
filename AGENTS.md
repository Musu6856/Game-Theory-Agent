<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project facts

- PaperForge-Agent is the Agent-focused fork of PaperForge, located at `D:\Agent测试\PaperForge-Agent`.
- The source PaperForge project at `D:\Agent测试\Claude code test\paperforge` should remain a stable baseline. Do not modify it when working in this fork unless the user explicitly asks.
- PaperForge-Agent is a Chinese theoretical research Agent system for online-source-backed direction discovery, symbolic equilibrium, comparative statics, and paper export.
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
- CAS/SymPy v2 boundary: the current release uses the bounded internal math verifier plus optional restricted Python/SymPy checks for safe property-analysis derivatives, explicit equilibrium FOC residuals, independent `sympy.solve` comparison for explicit FOC systems, and FOC residual generation from safe structured profit expressions; proposed equilibrium patches record SymPy review notes when checks run. Python/SymPy unavailability, unsafe input, and unsupported expressions route to manual review. External SymPy is not yet the primary equilibrium solver for arbitrary models and must not execute arbitrary model-generated Python code.
- Product delivery docs now live in `docs/group-trial-guide.md`, `docs/operator-runbook.md`, `docs/demo-scenarios.md`, and `docs/group-trial-test-plan.md`.
- The next Agent milestone is cross-project memory, background-task-level execution, and stronger automatic repair support.
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
