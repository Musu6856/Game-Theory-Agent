# PaperForge-Agent 维护者 Runbook

这份 runbook 面向小范围试用维护者，用于上线前配置、日常检查、故障处理和回滚。目标是支持 10-15 人课题组试用，不覆盖大规模多租户运维。

## 上线前准备

- 使用 Clerk production keys，不要用 `pk_test_` 或 `sk_test_`。
- 配置 Neon/Postgres `DATABASE_URL`。
- 至少配置一个服务端模型 key。代码里的默认 fallback 顺序是 `DEEPSEEK_API_KEY` -> `OPENAI_COMPATIBLE_API_KEY` -> `MIMO_API_KEY` -> `OPENAI_API_KEY`。
- 推荐配置 `OPENALEX_API_KEY`，并配置 `TAVILY_MCP_URL` 或 `TAVILY_API_KEY` 以获得更稳定的联网搜索。
- 确认 `.env.local`、部署平台环境变量和日志里都不暴露密钥。

## 部署检查

在 `D:\Agent测试\PaperForge-Agent` 执行：

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run build
```

上线前还要完成 `docs/release-checklist.md` 中的浏览器冒烟测试。

## 后台任务 worker

- Vercel 环境变量里设置 `AGENT_TASK_WORKER_SECRET`。
- 同时设置 `CRON_SECRET`，建议和 `AGENT_TASK_WORKER_SECRET` 使用同一个值；Vercel Cron 会用 `Authorization: Bearer $CRON_SECRET` 调用 worker。
- `vercel.json` 已配置每日触发 `/api/research/agent/tasks/worker`。Hobby 计划按每日触发；需要立刻执行时仍使用产品里的显式任务 run 入口。
- worker `POST` 入口仅给维护者手动触发，`limit` 最大 3，`leaseMs` 最大 15 分钟，避免一次触发占用过多执行时间。
- worker 成功响应会返回 `batch` 和 `worker` 元信息；排查时优先看 `worker.trigger`、`worker.durationMs`、`batch.attempted`、`batch.completed`、`batch.failed` 和每个 task 的 status。
- 如果 worker 返回 401/403，先检查 Vercel 的 `CRON_SECRET` 和应用里的 `AGENT_TASK_WORKER_SECRET` 是否一致；不要把 secret 写进 Git。

## 数据库

开发或小范围试用前执行：

```powershell
npm run db:push
$env:RUN_AGENT_TASK_DB_PROBE="1"; node --test src\lib\research-agent\task-store-db-probe.test.mjs
```

DB probe 会创建并删除自己的 `codex-agent-task-db-*` 临时任务，用来确认 `agent_tasks` 能真实完成 queued -> running -> completed、checkpoint 写入、结果脱敏和清理。

若迁移失败：

- 先保存终端错误和部署日志。
- 不要手工删除生产表。
- 检查 `DATABASE_URL` 是否指向预期环境。
- 在修复前暂停邀请新用户。

## 常见故障

模型服务不可用：

- 检查 provider key、base URL 和模型名。
- 运行应用内 provider health check。
- 若只有联网搜索失败，方向发现应能降级运行，但来源会减少。

生产服务全站 500：

- 先查看部署日志或本地 `next start` stderr。
- 若日志包含 `@clerk/nextjs: Missing publishableKey`，检查 `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` 是否已配置且为 `pk_live_`。
- 同时检查 `CLERK_SECRET_KEY` 是否已配置且为 `sk_live_`；小范围试用不要用测试 key。
- 修正环境变量后重新启动服务，再打开 `/sign-in` 和 `/research` 做冒烟测试。

联网搜索无结果：

- 检查 `OPENALEX_API_KEY`、`TAVILY_MCP_URL` 或 `TAVILY_API_KEY`。
- 查看“来源”页的 Agent 执行记录，确认是未配置、超时、无匹配还是安全规则过滤。
- 不要放宽 localhost、私有 IP 或 metadata service 限制。

Agent run 卡在 running：

- 刷新项目页，查看右侧恢复卡片。
- 若有待审核 patch，先应用或拒绝 patch。
- 若没有待审核 patch，可使用恢复提示继续到下一个审核点。
- 当前版本只支持步骤级重试，不恢复半个 HTTP 请求。

数学验证失败：

- 不要继续生成论文输出作为正式结果。
- 优先修正或重新生成相关模型、均衡或性质分析。
- “人工复核”不是失败，也不是已证明，需要研究者自行判断。

patch 行为异常：

- 若 patch 应用到错误资产，立即停止试用。
- 导出项目审计报告，保留项目 ID、patch ID、AgentRun ID 和时间。
- 使用版本历史里的回滚建议生成回滚 patch，仍需人工审阅后应用。

## 回滚与暂停

触发以下任一情况，应暂停试用：

- 项目无法保存或刷新后丢失。
- patch 应用到错误资产。
- failed math verification 被显示为 passed。
- UI、日志或导出报告暴露 provider key、Clerk secret、Tavily MCP URL 等私密信息。

暂停步骤：

1. 通知试用者停止新建项目和应用 patch。
2. 导出受影响项目审计报告。
3. 记录部署版本、环境变量变更和最近一次操作。
4. 修复后重新跑全量 release checklist。

## 维护记录模板

```text
日期：
维护者：
部署/检查范围：
自动检查结果：
浏览器冒烟结果：
发现的问题：
处理方式：
是否允许继续试用：
```
