# PaperForge-Agent Release Checklist

Use this checklist before inviting the research group to a small trial. The goal is to verify that the productized single-project Agent loop is stable enough for 10-15 users, not to certify cross-project memory or fully autonomous paper generation.

## 1. Environment

- [ ] Use Clerk production keys, not development keys:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
- [ ] Set a production Neon/Postgres `DATABASE_URL`.
- [ ] Run database migration or push:

  ```powershell
  npm run db:push
  ```

- [ ] Configure at least one server-side model provider. Fallback order:
  - `DEEPSEEK_API_KEY`
  - `OPENAI_COMPATIBLE_API_KEY`
  - `MIMO_API_KEY`
  - `OPENAI_API_KEY`
- [ ] Configure online search for best results:
  - `OPENALEX_API_KEY`
  - `TAVILY_MCP_URL` or `TAVILY_API_KEY`
- [ ] Configure the protected background worker:
  - `AGENT_TASK_WORKER_SECRET`
  - `CRON_SECRET` set to the same value for Vercel Cron authorization
- [ ] Confirm `vercel.json` includes one cron pointing to `/api/research/agent/tasks/worker`.
- [ ] Confirm no private keys are committed to Git.

## 2. Automated Checks

Run from `D:\Agent测试\PaperForge-Agent`:

```powershell
npm run lint
npm test
$env:RUN_AGENT_TASK_DB_PROBE="1"; node --test src\lib\research-agent\task-store-db-probe.test.mjs
npx tsc --noEmit
npm run build
```

Expected:

- `npm run lint` exits 0 with no warnings.
- `npm test` exits 0.
- The DB lifecycle probe exits 0 and reports one passing task-store DB probe. It creates and deletes only its own `codex-agent-task-db-*` task rows.
- `npx tsc --noEmit` exits 0.
- `npm run build` exits 0.

Release readiness can also be checked from code via `buildReleaseReadinessReport` in `src/lib/release-readiness.ts`. It classifies missing configuration as `blocking`, `degraded`, or `ready` without printing secrets.

## 3. Browser Smoke Test

- [ ] Open the deployed app or local production build.
- [ ] Sign in with a fresh test account.
- [ ] Create a new research project from a Chinese game-theory idea.
- [ ] Confirm the project is saved and appears after refresh.
- [ ] Turn on 联网搜索.
- [ ] Run direction discovery and confirm the 来源 tab shows queries, sources, or a clear no-source explanation.
- [ ] Adopt one direction and confirm a model patch appears instead of silently overwriting formal assets.
- [ ] Apply or reject the model patch.
- [ ] Continue to symbolic equilibrium and confirm an equilibrium patch appears.
- [ ] Continue to property analysis and confirm property patches appear.
- [ ] Continue to paper output and confirm paper or section-level paper patches appear.
- [ ] Open the paper preview and confirm display math blocks render as formulas, not as nested or broken inline math.
- [ ] Export project audit Markdown and confirm it contains sources, Agent trace, pending/applied patches, version history, math summary, and paper review context.

## 4. Safety Checks

- [ ] Pending model/equilibrium/property/paper patches block automatic continuation until reviewed.
- [ ] Failed math verification is not displayed as passed.
- [ ] Math verification states are actionable: 需修正 explains that the user should return to model/equilibrium/properties and generate a reviewable fix; 条件不足 explains which assumptions to add; 人工复核 explains that the user should inspect skipped or unsupported checks before continuing.
- [ ] Unsupported math verification is displayed as 人工复核 or 暂不支持, not as proof.
- [ ] The math verification panel merges persisted `researchSession.mathVerificationChecks` from async/SymPy runs into the visible summary.
- [ ] Refreshing during or after an Agent run does not lose saved project data.
- [ ] Retrying an Agent run does not duplicate an already proposed patch.
- [ ] The protected worker route rejects missing/wrong secrets and accepts `GET` with a valid worker secret.
- [ ] A valid worker request returns `batch` plus worker metadata (`id`, `trigger`, requested batch limits, `durationMs`) without exposing secrets.
- [ ] Completed background task results list only patch/artifact ids from the current AgentRun, not old project history.
- [ ] The Agent 任务审计 panel shows queued/running/completed tasks, recent checkpoints, math artifact snapshots, and patch/artifact counts for a solve-equilibrium task.
- [ ] Exported audit reports do not contain API keys, Tavily MCP URLs, Clerk secrets, or raw provider keys.

## 5. Trial Readiness

- [ ] `docs/group-trial-guide.md` exists and has been reviewed.
- [ ] `docs/operator-runbook.md` exists and has been reviewed.
- [ ] `docs/demo-scenarios.md` includes at least three realistic game-theory prompts.
- [ ] `docs/group-trial-test-plan.md` defines trial users, success metrics, stop conditions, and feedback collection.
- [ ] Create one trial record per project using the template in `docs/group-trial-test-plan.md`.
- [ ] Collect one feedback template per trial user from `docs/group-trial-guide.md`.
- [ ] The maintainer knows how to pause the trial and preserve project data if a stop condition is triggered.

## 6. Final Go/No-Go Acceptance

Use this table immediately before inviting the research group. Every `Go` line must be true; any `No-Go` line blocks the release until fixed.

| Area | Go | No-Go |
| --- | --- | --- |
| Production config | Clerk live keys, production `DATABASE_URL`, at least one model provider, and no committed secrets are confirmed. | Any test Clerk key, missing database URL, missing model provider, or exposed secret is found. |
| Automated checks | `npm run lint`, `npm test`, `npx tsc --noEmit`, and `npm run build` all pass in the release environment. | Any command fails, or a warning/error is ignored without a written reason. |
| Core Agent loop | A fresh project can run direction discovery, adopt a direction, review model/equilibrium/property/paper patches, and export an audit report. | Any core asset is silently overwritten, the flow cannot reach a reviewable patch, or export fails. |
| Controller guidance | The next-step banner opens the actionable asset tab for pending patches, stale assets, version-review impact, math failures, and completed drafts. | The banner sends users to a passive tab when the wording asks them to regenerate or review an actionable asset. |
| Math safety | Passed, failed, condition-insufficient, unsupported, and manual-review math states are distinguishable in UI and audit export. | Unsupported math is shown as proven, failed math is shown as passed, or failed math does not block unsafe paper output. |
| Recovery and trace | Failed, paused, or suspiciously running Agent runs show a safe retry/continue/review suggestion and preserve trace history. | Retry duplicates already proposed patches, loses the original run context, or bypasses patch approval. |
| Background worker | `AGENT_TASK_WORKER_SECRET` / `CRON_SECRET` are configured, Vercel Cron targets `/api/research/agent/tasks/worker`, the DB lifecycle probe passes, worker responses include safe observability metadata, and worker results are scoped to the current AgentRun. | The worker route is unauthenticated, cron is missing, DB task persistence cannot be verified, worker output is opaque, or a completed task reports unrelated old patches/artifacts as its own result. |
| Small-group docs | Trial guide, operator runbook, demo scenarios, and trial test plan have been reviewed by the maintainer. | Trial users would need unstated setup steps, or the maintainer lacks stop-condition and rollback instructions. |
| Trial start | One maintainer is assigned, 10-15 users are scheduled, and feedback records are prepared before the first invitation. | Trial starts before owner, cohort, stop conditions, and feedback templates are ready. |

## Release Decision

Move to small-group testing only if every automated check passes and no safety check fails. If a safety check fails, fix it before inviting trial users.
