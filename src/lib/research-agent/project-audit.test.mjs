import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProjectAuditMarkdown,
  getProjectAuditMarkdownFilename,
} from "./project-audit.ts";

test("buildProjectAuditMarkdown exports a project-level audit report", () => {
  const project = {
    id: "project/audit:test",
    createdAt: 1710000000000,
    rawIdea: "研究二手平台佣金与补贴策略",
    refinedIdea: "二手平台佣金补贴与卖家多归属",
    projectType: "formal",
    model: null,
    wizardCompleted: true,
    sections: [{ id: "intro", title: "引言", content: "草稿" }],
    references: [],
    researchSession: {
      phase: "paper",
      directions: [
        {
          id: "seller-multihoming",
          title: "卖家多归属与平台佣金补贴",
          summary: "比较平台佣金与补贴对卖家多归属的影响。",
          model: "Hotelling 双边平台",
          contribution: "给出可解释的比较静态。",
          recommended: true,
          evidenceSourceIds: ["web-1"],
          evidenceNote: "来源支持平台补贴与卖家多归属的联系。",
        },
      ],
      messages: [],
      assetSummary: {
        currentDirection: {
          id: "seller-multihoming",
          title: "卖家多归属与平台佣金补贴",
          summary: "比较平台佣金与补贴对卖家多归属的影响。",
          model: "Hotelling 双边平台",
          contribution: "给出可解释的比较静态。",
          recommended: true,
          evidenceSourceIds: ["web-1"],
        },
        confirmedAssumptions: ["平台同时选择佣金和补贴。"],
        utilityFunctions: ["U_B = v - p + alpha n"],
        equilibriumStatus: "solved",
        nextActions: ["导出论文草稿"],
      },
      evidencePack: {
        query: "secondhand platform seller multihoming subsidy",
        createdAt: 1710000000100,
        summary: "检索显示佣金、补贴与卖家多归属是相关机制。",
        sources: [
          {
            id: "web-1",
            title: "Seller multihoming in platforms",
            url: "https://example.com/paper",
            sourceType: "paper",
            retrievedAt: 1710000000200,
            snippet: "Platforms compete for sellers.",
            summary: "讨论卖家多归属和平台竞争。",
            relevance: "支持研究方向。",
          },
        ],
      },
      agentRunHistory: [
        {
          id: "run-1",
          goal: "推进到下一个审核点",
          status: "paused",
          startedAt: 1710000000300,
          completedAt: 1710000000400,
          pauseReason: "等待用户审核论文草稿。",
          plan: [
            {
              id: "draft-paper",
              kind: "tool",
              toolName: "research.draftPaper",
              title: "生成论文草稿",
              status: "completed",
            },
            {
              id: "review-paper",
              kind: "approval",
              title: "等待审核论文草稿",
              status: "pending",
            },
          ],
          checkpoints: [
            {
              id: "checkpoint-1",
              runId: "run-1",
              stepId: "draft-paper",
              title: "生成论文草稿",
              status: "completed",
              createdAt: 1710000000350,
            },
          ],
          trace: [
            {
              id: "trace-1",
              runId: "run-1",
              stepId: "draft-paper",
              type: "tool_result",
              message: "Created paper patch.",
              createdAt: 1710000000360,
              metadata: { patchId: "patch-paper" },
            },
          ],
        },
      ],
      assetVersionHistory: [
        {
          id: "version-1",
          assetKind: "paper",
          action: "applied_patch",
          patchId: "patch-paper",
          summary: "应用论文草稿",
          changedPaths: ["sections"],
          changes: [
            {
              kind: "replace",
              path: "sections",
              previousValue: [],
              value: [{ id: "intro", title: "引言", content: "草稿" }],
            },
          ],
          changeCount: 1,
          createdAt: 1710000000500,
          approvedBy: "user",
          nextRecommendation: "论文草稿已写入；下一步可以导出 Markdown。",
          impact: {
            summary:
              "论文草稿已更新；正式模型、均衡和性质分析不受影响，重点复核文字组织、引用和导出。",
            affectedAssetKinds: [],
            reviewFocus: [
              "复核章节结构、命题引用、证明叙述和来源引用是否一致。",
              "确认导出的 Markdown 是否符合当前写作目标。",
            ],
            nextAction: "导出或继续改写论文",
          },
        },
      ],
      mathVerificationChecks: [
        {
          kind: "sympy_execution",
          status: "passed",
          message:
            "SymPy 模型利润函数生成 FOC 通过：得到 1 条可执行残差：alpha_B - 2*tau_A。",
        },
      ],
    },
    hotellingModel: {
      symbols: [],
      sides: {
        consumerSideName: "买家",
        merchantSideName: "卖家",
      },
      platforms: ["A"],
      timing: [],
      utilityFunctions: [],
      demandDerivation: "",
      profitFunctions: [],
      assumptions: [],
      modelSetupDraft: "测试模型。",
    },
    equilibriumResult: {
      status: "solved",
      concept: "测试均衡",
      solvingSteps: ["测试步骤"],
      focs: ["partial Pi_A / partial tau_A = 0"],
      conditions: ["alpha_B > 0"],
      closedForm: "tau_A^* = alpha_B/2",
      derivation: "测试推导。",
      code: "sp.solve([foc_tau_A], [tau_A])",
      warnings: [],
    },
  };

  const markdown = buildProjectAuditMarkdown(project);

  assert.match(markdown, /^# PaperForge 项目审计报告/);
  assert.match(markdown, /研究想法：研究二手平台佣金与补贴策略/);
  assert.match(markdown, /当前阶段：论文草稿/);
  assert.match(markdown, /## 联网搜索来源/);
  assert.match(markdown, /\[web-1\] Seller multihoming in platforms/);
  assert.match(markdown, /## 方向选择/);
  assert.match(markdown, /卖家多归属与平台佣金补贴/);
  assert.match(markdown, /## Agent 执行记录/);
  assert.match(markdown, /run-1/);
  assert.match(markdown, /生成论文草稿/);
  assert.match(markdown, /## 版本复盘摘要/);
  assert.match(markdown, /待复核：1 条/);
  assert.match(markdown, /最高优先级：低/);
  assert.match(markdown, /最近影响：论文草稿已更新/);
  assert.match(markdown, /## 数学验证摘要/);
  assert.match(markdown, /SymPy 模型利润函数生成 FOC/);
  assert.match(markdown, /alpha_B - 2\*tau_A/);
  assert.match(markdown, /## 章节复核摘要/);
  assert.match(markdown, /状态：可继续|状态：需复核/);
  assert.match(markdown, /## 资产审核历史/);
  assert.match(markdown, /后续建议：论文草稿已写入/);
  assert.match(markdown, /影响摘要：论文草稿已更新/);
  assert.match(markdown, /建议下一步：导出或继续改写论文/);
  assert.match(markdown, /"patchId": "patch-paper"/);
});

test("getProjectAuditMarkdownFilename sanitizes project ids", () => {
  assert.equal(
    getProjectAuditMarkdownFilename({
      id: "project/audit:test",
      createdAt: 1710000000000,
      rawIdea: "研究二手平台佣金与补贴策略",
      refinedIdea: "二手平台佣金补贴与卖家多归属",
      model: null,
      wizardCompleted: true,
      sections: [],
      references: [],
    }),
    "paperforge-project-audit-project-audit-test.md"
  );
});
