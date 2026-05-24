import test from "node:test";
import assert from "node:assert/strict";

import { generateResearchProject } from "./ai-research-generation.ts";
import { createConversationFallbackAssetPatch } from "./research-generation/fallbacks.ts";
import { createExplorationProject } from "./research-session.ts";

test("conversation action answers casual messages without rebuilding research assets", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform pricing",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );
  const beforeModel = built.project.hotellingModel;
  const beforeEquilibrium = built.project.equilibriumResult;
  const assistantMessage =
    "你好，我在。你可以直接问我模型、均衡推导或性质分析哪里需要改。";
  const assetPatch = {
    kind: "update_model",
    summary: "把卖家参与条件收窄为单归属情形",
    changes: [
      {
        target: "hotellingModel.assumptions[2]",
        op: "set",
        value: "卖家只允许单归属，不考虑多归属。",
      },
    ],
  };

  const result = await generateResearchProject(
    {
      action: "continue_conversation",
      rawIdea: built.project.rawIdea,
      userMessage: "你好",
      project: built.project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage,
          assetPatch,
        }),
    }
  );
  const messages = result.project.researchSession?.messages ?? [];

  assert.equal(result.usedFallback, false);
  assert.equal(result.assistantMessage, assistantMessage);
  assert.deepEqual(result.assetPatch, assetPatch);
  assert.equal(result.project.researchSession?.phase, "model");
  assert.equal(result.project.hotellingModel, beforeModel);
  assert.equal(result.project.equilibriumResult, beforeEquilibrium);
  assert.equal(messages.at(-2)?.role, "user");
  assert.equal(messages.at(-2)?.content, "你好");
  assert.equal(messages.at(-1)?.role, "assistant");
  assert.equal(messages.at(-1)?.content, assistantMessage);
});

test("conversation action has a local fallback and preserves the current phase", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform pricing",
    now: 1710000000000,
  });

  const result = await generateResearchProject({
    action: "continue_conversation",
    rawIdea: project.rawIdea,
    userMessage: "你好",
    project,
  });
  const messages = result.project.researchSession?.messages ?? [];

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.researchSession?.phase, "direction");
  assert.equal(messages.at(-2)?.role, "user");
  assert.equal(messages.at(-2)?.content, "你好");
  assert.equal(messages.at(-1)?.role, "assistant");
  assert.match(messages.at(-1)?.content ?? "", /你好|模型|方向|均衡/);
});

test("conversation fallback proposes symbol patches for explicit notation edits", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform pricing",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject({
    action: "continue_conversation",
    rawIdea: built.project.rawIdea,
    userMessage: "把 tau_A 改成 f_A",
    project: built.project,
  });

  assert.equal(result.usedFallback, true);
  assert.equal(result.assetPatch?.kind, "update_model");
  assert.equal(result.assetPatch?.changes[0].target, "hotellingModel.symbols[tau_A].symbol");
  assert.equal(result.assetPatch?.changes[0].value, "f_A");
  assert.equal(result.project.hotellingModel, built.project.hotellingModel);
});

test("research-generation fallback module proposes symbol patches for explicit notation edits", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform pricing",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const patch = createConversationFallbackAssetPatch(
    built.project,
    "change tau_A to f_A"
  );

  assert.equal(patch?.kind, "update_model");
  assert.equal(patch?.changes[0].target, "hotellingModel.symbols[tau_A].symbol");
  assert.equal(patch?.changes[0].value, "f_A");
});

test("conversation confirmation of a prior model repair proposal creates a pending model patch", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "短视频平台内容垂直化与用户粘性",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );
  const repairProposal =
    "可以把不可求解的机制函数先具体化：\n" +
    "- \\psi_i(a_{d2}) = k_B a_{d2}\n" +
    "- \\phi_i(a_{d2}) = k_S a_{d2}\n" +
    "- C_i(a_{d2}) = \\frac{c}{2}a_{d2}^2\n" +
    "如果你接受这些修改，请回复确认，我会把它们写入模型设定。";
  const projectWithRepairProposal = {
    ...built.project,
    researchSession: {
      ...built.project.researchSession,
      messages: [
        ...(built.project.researchSession?.messages ?? []),
        {
          id: "msg-repair-proposal",
          role: "assistant",
          content: repairProposal,
          createdAt: 1710000000001,
        },
      ],
    },
  };

  const result = await generateResearchProject(
    {
      action: "continue_conversation",
      rawIdea: built.project.rawIdea,
      userMessage: "确认",
      project: projectWithRepairProposal,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage:
            "我再解释一下为什么这些函数形式可以降低求解难度，但还不会修改右侧模型。",
        }),
    }
  );

  assert.equal(result.assetPatch?.kind, "update_model");
  assert.match(result.assetPatch?.summary ?? "", /模型修复|上一轮/);
  assert.equal(
    result.assetPatch?.changes.some(
      (change) =>
        change.target === "hotellingModel.assumptions" &&
        change.op === "insert" &&
        String(change.value).includes("\\psi_i(a_{d2}) = k_B a_{d2}")
    ),
    true
  );
  assert.equal(
    result.assetPatch?.changes.some(
      (change) =>
        change.target === "hotellingModel.modelSetupDraft" &&
        change.op === "set" &&
        String(change.value).includes("\\phi_i(a_{d2}) = k_S a_{d2}")
    ),
    true
  );
  assert.equal(
    result.assetPatch?.changes.some(
      (change) =>
        change.target === "hotellingModel.symbols" &&
        typeof change.value === "object" &&
        change.value !== null &&
        "codeName" in change.value &&
        change.value.codeName === "a_d2"
    ),
    true
  );
  assert.equal(
    result.assetPatch?.changes.some(
      (change) =>
        change.target === "hotellingModel.symbols" &&
        typeof change.value === "object" &&
        change.value !== null &&
        "codeName" in change.value &&
        change.value.codeName === "a_d2_2"
    ),
    false
  );
  assert.match(result.assistantMessage, /右侧|待应用|应用/);
  assert.equal(result.project.hotellingModel, built.project.hotellingModel);
});

test("conversation confirmation with update wording applies prior repair proposal", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "短视频平台内容垂直化与用户粘性",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );
  const repairProposal =
    "当前模型存在关键问题：利润函数中缺少买家补贴成本项。\n\n" +
    "建议修改：\n" +
    "1. 将买家效用中的 -p_A 改为 +s_A，即 U_A^B = v_B + \\alpha_B n_A^S + s_A - t_B x。\n" +
    "2. 将利润函数中的 p_A n_A^B 改为 -s_A n_A^B。\n" +
    "3. 删除符号 p_A, p_B，保留 s_A, s_B 作为决策变量。\n" +
    "如果你同意这个修改，我可以直接更新模型设定，然后重新尝试符号求解。是否按这个方案修改？";
  const modelWithBuyerPrice = {
    ...built.project.hotellingModel,
    utilityFunctions: built.project.hotellingModel.utilityFunctions.map((entry) =>
      entry.id === "u-buyer-a"
        ? {
            ...entry,
            expression:
              "U_A^B = v_B + \\alpha_B n_A^S - p_A - t_B x",
          }
        : entry.id === "u-buyer-b"
          ? {
              ...entry,
              expression:
                "U_B^B = v_B + \\alpha_B n_B^S - p_B - t_B(1-x)",
            }
          : entry
    ),
    profitFunctions: built.project.hotellingModel.profitFunctions.map((entry) =>
      entry.id === "profit-a"
        ? {
            ...entry,
            expression: "Pi_A = p_A n_A^B + tau_A q n_A^S",
          }
        : entry.id === "profit-b"
          ? {
              ...entry,
              expression: "Pi_B = p_B n_B^B + tau_B q n_B^S",
            }
          : entry
    ),
  };
  const projectWithRepairProposal = {
    ...built.project,
    hotellingModel: modelWithBuyerPrice,
    researchSession: {
      ...built.project.researchSession,
      messages: [
        ...(built.project.researchSession?.messages ?? []),
        {
          id: "msg-repair-proposal-price",
          role: "assistant",
          content: repairProposal,
          createdAt: 1710000000001,
        },
      ],
    },
  };

  const result = await generateResearchProject(
    {
      action: "continue_conversation",
      rawIdea: built.project.rawIdea,
      userMessage: "更新吧",
      project: projectWithRepairProposal,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage:
            "好的，已按你的要求更新模型设定。",
        }),
    }
  );

  assert.equal(result.assetPatch?.kind, "update_model");
  assert.match(result.assistantMessage, /右侧|待应用|应用/);
  assert.equal(
    result.assetPatch?.changes.some((change) =>
      /^hotellingModel\.utilityFunctions\[.+\]\.expression$/.test(change.target) &&
      change.op === "set" &&
      /\+\s*s_A/.test(String(change.value))
    ),
    true
  );
  assert.equal(
    result.assetPatch?.changes.some((change) =>
      /^hotellingModel\.profitFunctions\[.+\]\.expression$/.test(change.target) &&
      change.op === "set" &&
      /-\s*s_A/.test(String(change.value)) &&
      !String(change.value).includes("p_A n_A^B")
    ),
    true
  );
  assert.equal(
    result.assetPatch?.changes.some((change) =>
      change.target === "hotellingModel.symbols[p_A]" &&
      change.op === "remove"
    ),
    true
  );
});

test("conversation strips malformed provider JSON instead of showing raw object text", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform pricing",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject(
    {
      action: "continue_conversation",
      rawIdea: built.project.rawIdea,
      userMessage: "求解均衡失败，帮我修复",
      project: built.project,
    },
    {
      complete: async () =>
        '{"assistantMessage":"好的，我来检查并修复均衡求解失败的问题。\\n\\n建议先把补贴写入利润函数。",',
    }
  );

  assert.doesNotMatch(result.assistantMessage ?? "", /^\s*\{/);
  assert.doesNotMatch(result.assistantMessage ?? "", /"assistantMessage"/);
  assert.match(result.assistantMessage ?? "", /补贴|修复|模型|均衡/);
});

test("conversation accepts provider property patch aliases for right-side review", async () => {
  const project = createExplorationProject({
    id: "11111111-1111-4111-8111-111111111111",
    rawIdea: "Research secondhand platform pricing",
    now: 1710000000000,
  });
  const built = await generateResearchProject(
    {
      action: "build_model",
      rawIdea: project.rawIdea,
      selectedDirectionId: "secondhand-commission-subsidy-hotelling",
      project,
    },
    {
      complete: async () => "{",
    }
  );

  const result = await generateResearchProject(
    {
      action: "continue_conversation",
      rawIdea: built.project.rawIdea,
      userMessage: "那你帮我生成这些性质分析吧。",
      project: built.project,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage:
            "已生成性质分析建议，右侧会显示为待应用修改，确认后再写入结构化资产。",
          assetPatch: {
            kind: "properties",
            summary: "新增三条性质分析",
            changes: [
              {
                path: "propertyAnalyses",
                op: "append",
                value: [
                  {
                    id: "alpha-b-fee",
                    target: "f_S",
                    parameter: "\\alpha_B",
                    operation: "differentiate",
                    symbolicResult: "\\partial f_S/\\partial \\alpha_B=-1",
                    signCondition: "负",
                    propositionDraft: "命题：买家侧网络外部性提高会降低卖家费用。",
                    proofSketch: "由 f_S=t_S-\\alpha_B 直接求导。",
                    intuition: "网络外部性提高后平台更愿意补贴卖家侧。",
                    warnings: [],
                  },
                ],
                reason: "用户要求生成性质分析。",
              },
            ],
          },
        }),
    }
  );

  assert.equal(result.assetPatch?.kind, "update_properties");
  assert.equal(result.assetPatch?.changes[0].op, "insert");
  assert.equal(result.assetPatch?.changes[0].target, "propertyAnalyses");
});
