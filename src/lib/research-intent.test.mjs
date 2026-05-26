import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyResearchInput,
  isCasualConversationStarter,
} from "./research-intent.ts";

test("classifies casual input as chat", () => {
  assert.equal(classifyResearchInput("你好"), "chat");
  assert.equal(classifyResearchInput("你好啊"), "chat");
  assert.equal(classifyResearchInput("这个结果是什么意思？"), "chat");
});

test("detects casual new-conversation starters", () => {
  assert.equal(isCasualConversationStarter("你好啊"), true);
  assert.equal(isCasualConversationStarter("你是谁"), true);
  assert.equal(isCasualConversationStarter("我想研究平台补贴对卖家多归属的影响"), false);
  assert.equal(isCasualConversationStarter("外卖平台佣金和补贴如何影响买卖双方参与"), false);
});

test("keeps explanation and correction requests in chat unless they ask for regeneration", () => {
  assert.equal(
    classifyResearchInput("这个性质分析不对，帮我解释一下为什么只有一条"),
    "chat"
  );
  assert.equal(
    classifyResearchInput("这段均衡推导我想确认一下是不是少了一个条件"),
    "chat"
  );
  assert.equal(
    classifyResearchInput("先别重做，给我解释一下当前模型哪里不一致"),
    "chat"
  );
});

test("classifies model refinement requests", () => {
  assert.equal(
    classifyResearchInput("把模型改成卖家也可以多归属，并加入平台审核成本"),
    "refine_model"
  );
  assert.equal(
    classifyResearchInput("收窄模型变量，只保留价格和质量两个策略"),
    "refine_model"
  );
});

test("classifies redo equilibrium requests", () => {
  assert.equal(classifyResearchInput("重新求均衡，给出完整闭式解"), "redo_equilibrium");
  assert.equal(classifyResearchInput("重做符号求解，不要只给价格"), "redo_equilibrium");
});

test("classifies redo property-analysis requests", () => {
  assert.equal(
    classifyResearchInput("重做性质分析，至少给我三条命题"),
    "redo_properties"
  );
  assert.equal(
    classifyResearchInput("重新生成比较静态，不要那个为零的废命题"),
    "redo_properties"
  );
});
