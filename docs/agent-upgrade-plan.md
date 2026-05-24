# PaperForge-Agent 升级计划书

## 1. 背景与目标

PaperForge 已经形成一个初步闭环：中文理论研究工作台、结构化 AI 生成、研究资产管理、模型源配置、项目持久化、patch 审核和质量控制都已经存在。PaperForge-Agent 的目标不是从零重写，而是在这个闭环之上升级出一个可审计、可联网、可分步执行的研究 Agent。

最终目标：

PaperForge-Agent 最终应该像一个中文理论研究助理，而不是一次性论文生成器。用户输入一个模糊研究想法后，Agent 负责拆解、联网搜索、建模、检查、修正和记录；用户负责选择方向、批准关键假设、审阅资产变更。系统要能把想法逐步推进成可审阅、可修改、可导出的理论论文草稿。

目标形态：

- Agent 能根据研究目标制定下一步计划
- Agent 能调用明确的工具，而不是只做单轮聊天
- Agent 能联网搜索并整理来源依据，辅助选题方向
- Agent 能连续推进方向、模型、均衡、性质分析等阶段
- Agent 的每一步都有 trace，用户能看到输入、工具、结果和暂停原因
- 涉及研究资产变更时，Agent 先提出 patch，由用户审核后再应用

关键判断：

PaperForge 当前已经具备方向、建模、均衡、性质分析和论文输出等分步能力。后续阶段不是从零补这些功能，也不是把每个步骤重新命名为 Agent。Agent 化的核心是把“单步生成”升级成“围绕目标持续推进的小循环”：Agent 维护状态，制定计划，调用工具，观察结果，自检风险，必要时返工，并在关键资产变更前暂停等待用户批准。

因此，用户仍然可以一步一步参与；区别在于每一步背后都有计划、trace、质量判断和修正机制，而不是单次 prompt 输出。

终局流程：

1. 用户输入研究想法
2. Agent 搜索公开来源并整理可引用依据
3. Agent 提出多个可建模方向，用户选择一个方向
4. Agent 设计理论模型，并检查参数、假设和可解性
5. 用户审阅并批准关键模型资产变更
6. Agent 求解均衡，生成比较静态和命题
7. Agent 基于已确认资产生成论文草稿和导出结果
8. 全流程保留来源、计划、工具结果、失败原因和用户审批记录

不做的事：

- 不做一键自动生成整篇论文并直接覆盖项目资产
- 不做无限制网页爬虫
- 不把 PaperForge 原项目作为实验场继续大改
- 不照搬独立 Python/CLI Agent 模板到根目录

## 2. 项目关系

当前项目位于：

```text
D:\Agent测试\PaperForge-Agent
```

它从原 PaperForge 派生而来：

```text
D:\Agent测试\Claude code test\paperforge
```

原 PaperForge 是稳定底座，PaperForge-Agent 是 Agent 实验和升级主线。后续如果 Agent 能力稳定，再决定是否反向回合并或替换原项目。

## 3. 推荐架构

保留现有单步研究能力：

```text
src/lib/ai-research-generation.ts
src/lib/research-generation/
src/lib/research-session.ts
src/lib/research-flow.ts
src/lib/research-asset-patch-apply.ts
```

新增 Agent 编排层：

```text
src/lib/research-agent/
  planner.ts
  runner.ts
  state.ts
  guards.ts
  trace.ts
  tools/
    discover-directions.ts
    build-model.ts
    solve-equilibrium.ts
    analyze-properties.ts
    propose-patch.ts
    apply-patch.ts
    web-search.ts
    web-fetch-page.ts
    literature-search.ts
    evidence-pack.ts
  prompts/
    planner-prompt.ts
    direction-with-evidence-prompt.ts
    reflection-prompt.ts
```

未来 API 入口建议：

```text
src/app/api/research/agent/route.ts
```

现有接口继续保留：

```text
src/app/api/research/generate/route.ts
```

原则：`generate` 是单步工具层，`agent` 是编排层。

## 4. 核心数据概念

后续实现可以引入这些类型：

```ts
type AgentRun = {
  id: string;
  projectId?: string;
  goal: string;
  status: "idle" | "running" | "paused" | "completed" | "failed";
  plan: AgentStep[];
  currentStepId?: string;
  checkpoints?: AgentCheckpoint[];
  trace: AgentTraceEvent[];
  pauseReason?: string;
  requiresApproval?: boolean;
};

type AgentStep = {
  id: string;
  kind: "tool" | "approval" | "reflection";
  toolName?: string;
  title: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
};

type AgentCheckpoint = {
  id: string;
  runId: string;
  stepId: string;
  title: string;
  status: AgentStep["status"];
  toolName?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
};

type EvidencePack = {
  query: string;
  createdAt: number;
  sources: EvidenceSource[];
  summary: string;
};

type EvidenceSource = {
  title: string;
  url: string;
  sourceType: "web" | "paper" | "policy" | "industry";
  publishedAt?: string;
  retrievedAt: number;
  snippet: string;
  relevance: string;
};
```

`EvidencePack` 是内部类型名；用户界面统一称为“来源依据”或“联网来源”，避免把内部英文概念直接暴露给用户。

第一版可以先把 Agent 状态挂到 `researchSession`，等需要长任务恢复、历史回放或多人协作时，再拆独立表。

## 5. 工具体系

### 5.1 研究流程工具

第一批工具封装现有能力：

- `research.discoverDirections`
- `research.buildModel`
- `research.solveEquilibrium`
- `research.analyzeProperties`
- `asset.proposePatch`
- `asset.applyPatch`

这些工具内部可以继续调用现有 `generateResearchProject` 和 research session helpers。

### 5.2 联网与文献工具

第一阶段纳入联网检索，但范围收敛：

- `web.search`: 根据研究想法搜索公开网页
- `web.fetchPage`: 抽取指定页面标题、正文摘要、发布日期和来源
- `literature.search`: 查询开放学术元数据
- `evidence.pack`: 把检索结果压缩为精简来源依据

优先数据源：

- OpenAlex
- Semantic Scholar
- Crossref
- arXiv
- 公开网页搜索 API
- 政策文件、平台公告、公开新闻和行业报告页面

暂不直接爬取需要登录、付费、验证码或明确禁止自动访问的网站。

### 5.3 质量与修复工具

第二阶段后加入：

- `quality.validateModel`
- `quality.validateEquilibrium`
- `quality.validateEvidencePack`
- `math.sympyCheck`
- `agent.reflectAndRepair`

当前已先落地“数学验证 v1”：`src/lib/research-agent/math-verifier.ts` 会做轻量符号一致性检查，确认均衡和性质分析候选引用的数学符号是否来自已确认模型或均衡上下文。它会进入现有自检修复闭环。

“CAS 复算 v1”也已开始接入同一验证器：当均衡闭式解和性质分析里的偏导等式足够简单时，验证器会从闭式解中取出目标变量表达式，复算“目标变量对参数的偏导”，再与候选 `symbolicResult` 对比。当前覆盖线性表达式、简单分式、连等式和常见 LaTeX 写法；复杂隐式系统、矩阵雅可比和完整 SymPy 代数证明仍跳过，不作为拦截依据。

“数学验证 v2”已开始覆盖性质分析的符号条件：当复算出的偏导是单项表达式，并且模型假设、均衡条件或候选 `signCondition` 中明确给出参数正负时，验证器会判断候选写的“为正/为负/为零”是否与复算结果一致。当前只拦截明确写反的方向；非负/非正、条件强弱、多项表达式和隐式系统仍留给人工审核或后续更强 CAS。

“条件强弱检查 v1”已接入同一验证器：当候选给出明确方向判断，但复算表达式仍包含缺少正负条件的简单因子或分母时，验证器会提示 `signCondition` 条件不足。当前只覆盖显式缺少参数正负条件的简单单项表达式，不尝试证明完整不等式条件。

“命题组去重/冲突检查 v1”已接入性质分析 runner：同一组候选里如果多条命题重复分析同一个 `target + parameter + operation`，Agent 会要求合并；如果重复主题还给出相反方向结论，Agent 会提示命题组内部互相冲突，并进入同一个有边界修复闭环。

## 6. 联网安全边界

联网工具必须默认保守：

- 只允许 `http` 和 `https`
- 禁止 localhost、`127.0.0.0/8`、`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、link-local、metadata service 和 IPv6 私有地址
- 请求必须有超时
- 限制最大页面大小
- 限制单次搜索结果数量
- 限制单次 Agent run 抓取页面数量
- 保留 URL、标题、来源类型、抓取时间和摘要
- 不保存网页全文作为长期研究资产
- 不把网页全文直接传给模型

如果来源不可访问或质量低，Agent 应继续运行，但 trace 中要记录失败原因。

## 7. 分阶段路线

阶段命名原则：除长程记忆与版本管理外，前几阶段都不是新增一套平行功能，而是把已有研究能力逐步 Agent 化。

### Phase 1: 方向发现 Agent 化

目标：

- 输入研究想法后，Agent 先生成检索查询
- 调用联网/开放学术工具
- 形成精简来源依据
- 基于来源依据生成研究方向
- 在工作台展示来源依据

当前实现状态：

- `src/lib/research-agent/guards.ts` 已提供 `http`/`https`、localhost、私网 IP、link-local、metadata host 和 DNS 解析后的私网地址拦截。
- `src/lib/research-agent/query.ts` 已把中文研究想法扩展为多条英文 evidence query，用于提升 OpenAlex、Crossref、arXiv 和 Web Search 的召回。
- `src/lib/research-agent/tools/literature-search.ts` 已接入 OpenAlex、Crossref 和 arXiv 开放元数据检索，设置超时、结果数量限制和页面大小截断；OpenAlex 通过可选 `OPENALEX_API_KEY` 查询参数启用。
- `src/lib/research-agent/tools/web-search.ts` 已接入 Tavily 远程 MCP 和 Tavily REST Search API；配置 `TAVILY_MCP_URL` 时优先走 MCP，未配置或 MCP 失败时尝试 `TAVILY_API_KEY`，仍不可用时自动降级为空结果，不阻断方向发现。
- `src/lib/research-agent/tools/evidence-pack.ts` 已将候选来源压缩为只含标题、URL、类型、发布时间、检索时间、摘要和相关性说明的来源依据，不保留网页全文。
- `src/lib/research-agent/runner.ts` 已实现第一阶段 plan、多 query tool trace、来源依据生成、基于来源的方向发现 prompt 和兜底方向。
- `src/app/api/research/agent/route.ts` 已作为 Agent API 入口；前端的 `discover_directions`、`build_model`、`solve_equilibrium`、`analyze_properties` 和 `draft_paper` 请求已转向该 Agent 入口。
- 用户可在左侧设置中打开或关闭“联网搜索”；关闭后方向发现只使用模型推理，不发起联网搜索。
- 左侧“联网 / MCP”区域可检测 Tavily MCP 是否可用于方向发现，普通用户界面不展示 endpoint、tool count 或 key 等技术细节。
- 研究资产右侧已加入“来源”tab，展示检索 query、保留来源和 Agent 执行记录。

验收：

- 每个方向能看到至少一条参考来源或说明“无可靠来源”
- trace 记录检索查询、工具结果数量和失败信息
- 没有私密环境变量、缓存目录或原项目 Git 历史被带入新项目

当前边界：

- 选方向后出现模型设定、符号、参数、时间线、效用函数和利润函数，这些能力已经存在。
- 模型生成 Agent 化 v1 已完成，但底层候选模型仍复用 `src/lib/ai-research-generation.ts` 的单步建模能力。
- 均衡求解 Agent 化 v1 已完成，但底层候选均衡仍复用 `src/lib/ai-research-generation.ts` 的单步求解能力。
- 性质分析 Agent 化 v1 已完成，但底层候选命题仍复用 `src/lib/ai-research-generation.ts` 的单步性质分析能力。
- 论文输出 Agent 化 v1 已完成，当前会基于已应用资产确定性整理论文章节草稿，不额外自由补写新理论。
- Agent 层负责计划、trace、自检、审批暂停和待审核模型/均衡/性质分析/论文输出 patch；不是重复做参数展示。

### Phase 2: 模型生成 Agent 化

目标：

- Agent 在用户采纳方向后，先生成模型构建计划
- Agent 继承方向来源、理论假设和用户选择，不重新发散成另一个方向
- Agent 检查参与者、时间线、策略变量、参数、符号和函数是否一致
- Agent 评估模型是否太宽、太窄、参数冗余或难以求解
- Agent 先提出可审阅的模型 patch，再由用户批准应用
- Agent 将失败原因、简化建议和修正记录写入 trace

验收：

- 已完成：采纳方向后，右侧模型资产不是被静默覆盖，而是先出现待审核 patch。
- 已完成：模型 patch 包含参与者侧、平台集合、时间线、符号表、效用函数、利润函数、假设、模型草稿和需求推导。
- 已完成：AgentRun 会记录计划、模型候选生成、自检结果和暂停审批原因。
- 已完成 v1：模型候选如果没有通过自检，Agent 会带着具体问题进行一次有边界修复，再把较优候选作为待审核 patch。
- 已完成：未处理模型 patch 时不会直接进入“确认模型并求解均衡”。
- 已完成：单步生成接口仍可独立使用，Agent 层只是调用它作为候选生成能力。
- 待加强：模型风险检查和修复目前是轻量规则 + 单次重试，后续可扩展符号冲突、参数冗余、均衡可解性和比较静态目标检查。

### Phase 3: 均衡求解 Agent 化

目标：

- 把均衡求解拆成显式步骤：目标函数、FOC、内点/边界条件、反应函数、均衡表达式和存在性条件
- 失败时能建议简化模型，而不是直接输出含糊结论
- 保留符号推导 trace，方便用户定位错误

验收：

- 已完成：确认模型后，`solve_equilibrium` 请求走 `src/app/api/research/agent/route.ts` 的 Agent 入口。
- 已完成：`src/lib/research-agent/equilibrium-runner.ts` 会创建均衡求解计划、调用单步求解层生成候选均衡、记录 trace，并暂停等待用户审批。
- 已完成：候选均衡不会静默覆盖正式 `equilibriumResult`，而是以 `equilibrium` patch 形式进入右侧待审核修改建议。
- 已完成 v1：候选均衡如果缺少 solved 状态、闭式表达、FOC、推导步骤或存在条件，Agent 会带着自检问题重试一次，再决定提交哪版候选给用户审核。
- 已完成 v1：候选均衡会经过数学验证 v1，检查 FOC、条件、闭式解、推导和代码片段中引用的符号是否能在已确认模型中找到来源；如果出现未定义或未落地符号，Agent 会把问题写入 trace 并触发一次有边界修复。
- 已完成：未应用的均衡 patch 会阻止直接进入性质分析。
- 已完成：应用均衡 patch 后才把候选结果写入右侧均衡资产，并把下一步推进到性质分析。
- 待加强：当前自检修复主要覆盖 solved 状态、闭式表达、FOC、求解步骤、存在条件和符号一致性；后续可扩展内点/边界分类、完整 SymPy 复算、失败诊断和模型简化 patch 建议。

### Phase 4: 性质分析 Agent 化

目标：

- 基于已确认均衡结果寻找有价值的比较静态
- 生成 Proposition、Lemma、Corollary 和经济直觉
- 检查命题条件是否和模型假设一致

验收：

- 已完成：`analyze_properties` 请求走 `src/app/api/research/agent/route.ts` 的 Agent 入口。
- 已完成：`src/lib/research-agent/property-runner.ts` 会创建性质分析计划、调用单步性质分析层生成候选命题、记录 trace，并暂停等待用户审批。
- 已完成：候选性质分析不会静默覆盖正式 `propertyAnalyses`，而是以 `properties` patch 形式进入右侧待审核修改建议。
- 已完成 v1：候选性质分析如果数量不足、id 重复或缺少符号结果/条件/命题/证明草图，Agent 会带着自检问题重试一次，再把较优命题组作为待审核 patch。
- 已完成 v1：候选性质分析会经过数学验证 v1，检查目标变量、参数、符号结果、条件和证明草图引用的符号是否来自模型或已确认均衡；如果出现上下文中未出现的符号，Agent 会把问题写入 trace 并触发一次有边界修复。
- 已完成 v1：候选性质分析会经过 CAS 复算 v1；对“闭式解中的目标变量 = 表达式”与“目标变量对参数求偏导 = 候选结果”这类简单断言，Agent 会做内置代数复算，不一致时写入 trace 并触发一次有边界修复。
- 已完成 v2：候选性质分析会初步核对符号条件；当简单偏导可以复算出正、负或零，并且相关参数正负条件足够明确时，若候选把“为正/为负/为零”写反，Agent 会把问题写入 trace 并触发一次有边界修复。
- 已完成 v1：候选性质分析会初步检查符号条件是否过弱；如果偏导方向依赖某个因子或分母的正负，但候选没有写出对应参数条件，Agent 会提示条件不足并触发一次有边界修复。
- 已完成 v1：候选性质分析会经过命题组去重/冲突检查；同一 `target + parameter + operation` 重复出现时会提示合并，若方向相反会提示命题组内部互相冲突并触发一次有边界修复。
- 已完成：应用性质分析 patch 后才把候选比较静态和命题草稿写入右侧资产。
- 待加强：当前自检修复主要覆盖命题数量、重复 id、分析对象、参数、符号结果、符号条件、命题草稿、证明草图、符号一致性、简单偏导复算、明确符号方向写反、显式缺少参数正负条件和简单命题组去重/冲突；更复杂的条件强弱证明、语义近似命题合并、隐式系统复算和完整 SymPy/CAS 校验仍需继续拆成可审阅步骤。

### Phase 5: 论文输出 Agent 化

目标：

- 基于已确认研究资产生成论文结构和章节草稿
- 引言、模型、均衡、比较静态和讨论部分都能追踪到已有资产
- 导出 Markdown、LaTeX 或 PDF 时保留来源和执行记录

验收：

- 已完成：`draft_paper` 请求走 `src/app/api/research/agent/route.ts` 的 Agent 入口。
- 已完成：`src/lib/research-agent/paper-runner.ts` 会创建论文输出计划，从已应用方向、模型、均衡和性质分析整理章节草稿，并记录 trace。
- 已完成：候选论文草稿不会静默覆盖 `project.sections`，而是以 `paper` patch 形式进入右侧待审核修改建议。
- 已完成：应用论文 patch 后才把候选章节写入右侧论文输出。
- 待加强：当前论文草稿是基于稳定资产的确定性整理；后续可扩展章节级改写、引用格式、LaTeX/PDF 导出和来源引用一致性检查。

### Phase 6: 总控流程与自动下一步建议

目标：

- 根据当前资产状态判断下一步该做什么，而不是只靠用户找按钮
- 识别未应用 patch、资产过期、均衡失败、命题不足、论文草稿缺失等阻塞原因
- 支持用户选择“一步步确认”或“继续推进到下一个待审批点”
- 把总控决策、暂停原因和用户批准记录写入 Agent trace

当前实现状态：

- `src/lib/research-agent/controller.ts` 已提供确定性下一步建议：方向选择、模型确认、符号均衡、性质分析、论文草稿、已成稿和阻塞状态。
- 总控会优先检查未应用 patch；只要存在模型、均衡、性质分析或论文草稿修改建议，就停在对应资产页，要求用户先应用或拒绝。
- 总控能识别模型修改后的均衡过期、性质分析过期、符号求解失败和论文草稿缺失，并给出下一步原因。
- 右侧工作台顶部已加入“下一步 / 需处理 / 已成稿”建议条；可执行动作会直接触发已有 Agent action 或模型确认，不可自动执行的方向选择会引导用户去方向页。
- `src/lib/research-agent/controller.ts` 已提供 `planSafeContinuation`，用于规划“推进到审核点”的安全连续执行。
- “推进到审核点”支持模型确认后继续生成均衡候选，也支持从已确认模型、已完成均衡或已完成性质分析开始推进到下一条待审核 patch。
- 连续推进不会替用户选择研究方向，也不会自动应用或拒绝任何 patch；一旦出现待审核 patch 就停下。
- `src/lib/research-agent/trace.ts` 已提供 Agent run 历史归档和安全连续推进 trace 记录；每次 Agent 执行会保留到 `researchSession.agentRunHistory`，最近一次仍兼容保存在 `researchSession.agentRun`。
- `src/lib/research-agent/state.ts` 已为步骤状态变化记录 `checkpoints`，包含步骤、状态、工具名、时间和前一状态；右侧“来源”tab 会显示最近检查点。
- `src/lib/research-agent/resume.ts` 已提供 AgentRun 续跑工具：按 `runId` 找回历史 run，选择最近失败/运行中 checkpoint，把失败步骤重新置为 running，并保留同一条 trace/checkpoint 历史。
- `src/lib/research-agent/trace-replay.ts` 已提供步骤回放与审计导出：把 plan、trace event 和 checkpoint 合并为按步骤排列的回放项，标记失败、恢复、最近事件和未归属事件，并能生成单次 AgentRun Markdown 审计记录。
- 右侧“来源”tab 会展示最近多次 Agent 执行记录，包括连续推进的计划、已执行步骤、停止原因、阻塞项和步骤回放。
- 右侧“来源”tab 的执行记录支持按全部、异常、恢复、工具、模型和审核筛选，支持展开完整 trace/checkpoint 元数据，也支持导出单条执行记录。
- `src/lib/research-agent/recovery.ts` 已提供恢复建议 v1：根据最近一次 `AgentRun` 的 `failed`、`paused` 或 `running` 状态，结合最近 checkpoint 判断应重试当前步骤、继续推进到审核点，还是先处理待审核 patch。
- 右侧工作台顶部会在需要时显示恢复提示；恢复动作复用现有模型确认、Agent action 和“推进到审核点”，不会替用户选择方向，也不会自动应用 patch。对均衡、性质分析和论文草稿 action，恢复请求会把 `runId` 和 checkpoint 传回 Agent 入口。
- `src/lib/research-pending-patches-layout.ts` 已提供审核负担分层：模型和均衡 patch 默认是“重点审核”，普通性质分析 patch 是“标准审核”，论文草稿整理是“快速审核”；如果性质分析或论文 patch 带有数学自检风险，也会提升为“重点审核”。
- 总控阻塞项会带出同一套审核强度和原因，右侧待审核卡片也会展示简短徽标；这只降低用户判断负担，不改变“核心资产必须人工审核”的安全边界。
- `src/lib/research-agent/controller.test.mjs` 覆盖了待审核 patch 阻塞、方向选择、模型确认、均衡求解、性质分析、论文草稿、已成稿判断和安全连续推进计划。

验收：

- 已完成：用户在任意阶段都能看到下一步建议及其原因。
- 已完成：有未应用 patch 时，总控不会绕过审批继续推进。
- 已完成：当资产过期或符号失败时，总控能解释应先重算均衡、重做性质分析还是回到资产页处理。
- 已完成：用户可以选择“推进到审核点”，系统按安全计划连续推进，并在下一条待审核 patch 处停下。
- 已完成：总控连续推进会写入独立 Agent trace/history，便于回放“为什么推进到这里、在哪里停下”。
- 已完成 v1：待审核 patch 会按重点、标准和快速审核分层；论文草稿类修改不再和模型/均衡这类核心资产显示成同等审核负担。
- 已完成 v1：AgentRun 会记录步骤检查点；失败、暂停或疑似中断的最近一次 AgentRun 会被转译成带检查点的安全恢复提示。
- 已完成 v1：均衡、性质分析和论文草稿 runner 可沿用同一 `AgentRun.id` 从失败步骤重试，并跳过该 run 中已经完成的准备步骤。
- 已完成 v1：Agent 执行记录按步骤回放，用户能看到每一步的状态、最近说明、检查点数、事件数和恢复标记。
- 已完成 v1：模型、均衡和性质分析 runner 在自检失败时会最多重试一次候选生成，并在 trace 中记录 `repairAttempted`、剩余问题和是否修复成功。
- 已完成 v1：均衡和性质分析 runner 已接入数学验证 v1；未落地符号会被视为自检问题进入同一个修复闭环，但正式资产仍必须经过待审核 patch。
- 已完成 v1：性质分析 runner 已接入 CAS 复算 v1；支持的简单偏导等式如果与均衡闭式解不一致，会被视为自检问题进入同一个修复闭环。
- 已完成 v2：性质分析 runner 已接入符号条件一致性检查；支持的简单偏导如果方向与 `signCondition` 明确矛盾，会被视为自检问题进入同一个修复闭环。
- 已完成 v1：性质分析 runner 已接入条件强弱检查；支持的简单偏导如果缺少判断方向所需的参数正负条件，会被视为自检问题进入同一个修复闭环。
- 已完成 v1：性质分析 runner 已接入命题组去重/冲突检查；重复主题和相反方向结论会被视为自检问题进入同一个修复闭环。
- 已完成 v1：Agent 执行记录支持筛选、展开完整元数据和导出单次 AgentRun Markdown 审计记录。
- 待加强：checkpoint 续跑目前是“从失败步骤重试”，不是恢复半个 HTTP 请求或后台长任务进程；审计导出仍是单次 AgentRun 级别，跨版本完整审计报告和更强的自动修复仍需要继续拆成可审阅的 Agent 化步骤。

### Phase 7: 长程研究记忆与版本管理

目标：

- 支持研究资产版本比较、回滚和变更解释
- 支持长任务恢复和历史 trace 回放
- 支持多轮研究中的方向、模型、命题演化记录

验收：

- 已完成 v1：`src/lib/research-agent/version-history.ts` 会在应用或拒绝资产 patch 时记录 `researchSession.assetVersionHistory`。
- 已完成 v1：版本事件会保留每处修改的路径、操作类型、原值、新值和说明，供历史差异展示与回滚建议复用。
- 已完成 v1：右侧工作台加入“历史”tab，展示资产类型、应用/拒绝状态、审核时间、修改路径、差异摘要、说明和拒绝原因。
- 已完成 v1：用户能看到某个资产为什么被改、何时被批准，以及对应的 patch id / source message id。
- 已完成 v1：已应用历史记录可以生成“回滚建议”；回滚仍然进入待审核 patch 队列，由用户应用或拒绝，不会自动覆盖正式资产。
- 已完成 v1：关键 AgentRun 的 `paused` / `failed` / `running` 状态会进入恢复建议层，支持安全重试、继续推进或引导先审核 patch；步骤 checkpoint 会辅助说明最近停在哪里。
- 已完成 v1：恢复执行会把新的 trace/checkpoint 接回原 AgentRun 历史，避免每次重试都开一条孤立记录。
- 已完成 v1：右侧 Agent 执行记录以步骤回放展示历史 trace，方便用户理解“为什么推进到这里、哪里失败、是否恢复过”。
- 已完成 v1：执行记录可以按异常、恢复、工具、模型和审核筛选，展开完整元数据，并导出单次 AgentRun 审计 Markdown。
- 待加强：更完整的跨版本比较、跨项目审计报告、后台任务级续跑和批量恢复工具。

## 8. UI 方向

未来研究工作台可以加入 Agent 面板：

- 当前 Agent 目标
- 执行计划
- 正在运行的工具
- 暂停原因
- 来源依据
- trace 时间线
- 继续、暂停、重试、应用 patch、拒绝 patch 操作

UI 不应把 Agent 描述成“万能自动论文生成器”。它应该是研究者可审计、可打断、可修正的协作者。

## 9. 测试与验收

文档阶段：

- README 明确这是 Agent 派生项目
- AGENTS 明确新项目规则和目录约定
- 本计划书包含联网、工具调用、Agent loop、trace 和审核边界

实现阶段：

- 为来源压缩工具、URL 安全校验、工具 wrapper 写单元测试
- 为 Agent planner/runner 写状态流转测试
- 为 API route 写请求校验测试
- 前端至少验证 Agent 面板的空态、运行态、暂停态、失败态

基础检查：

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## 10. 默认决策

- 新 Agent 代码放在 `src/lib/research-agent/`
- 不在根目录创建独立 `agent/`
- 第一版重点是联网辅助选题方向
- 联网检索以精简来源依据形式进入 prompt
- Agent 对资产的修改默认只产生待审核 patch
- 原 PaperForge 保持稳定，不作为 Agent 实验目录
