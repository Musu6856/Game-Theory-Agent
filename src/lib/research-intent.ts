export type ResearchInputIntent =
  | "chat"
  | "refine_model"
  | "redo_equilibrium"
  | "redo_properties";

export function classifyResearchInput(input: string): ResearchInputIntent {
  const text = normalizeResearchInput(input);
  if (!text) return "chat";

  if (isNegatedStructuredRequest(text)) {
    return "chat";
  }

  if (isExplicitPropertyRegeneration(text)) {
    return "redo_properties";
  }

  if (isExplicitEquilibriumRegeneration(text)) {
    return "redo_equilibrium";
  }

  if (isExplicitModelRefinement(text)) {
    return "refine_model";
  }

  if (isChatOnlyMessage(text)) {
    return "chat";
  }

  return "chat";
}

export function isCasualConversationStarter(input: string) {
  const text = normalizeResearchInput(input);
  if (!text) return false;
  return isBriefCasualStarter(text);
}

function normalizeResearchInput(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function isNegatedStructuredRequest(text: string) {
  return (
    /(先别|先不要|不要|别|暂时别|不用).{0,10}(重做|重新|再做|再生成|重写|生成|推导|求均衡|求解|改|修改)/.test(
      text
    ) ||
    /(别|不要|先别).{0,10}(改模型|改成|修改模型|重做均衡|重做性质分析|重新生成比较静态)/.test(
      text
    )
  );
}

function isExplicitPropertyRegeneration(text: string) {
  return (
    /(?:重做|重新(?:生成|做|推导)|再做|再生成|重写).*(?:性质分析|比较静态|命题|proposition|comparative statics|properties)/.test(
      text
    ) ||
    /(?:性质分析|比较静态|命题|proposition|comparative statics|properties).*(?:重做|重新(?:生成|做|推导)|再做|再生成|重写)/.test(
      text
    )
  );
}

function isExplicitEquilibriumRegeneration(text: string) {
  return (
    /(?:重做|重新(?:求|求解|生成|解)|再求|再解|重写).*(?:均衡|求均衡|闭式|符号求解|equilibrium|solve)/.test(
      text
    ) ||
    /(?:均衡|求均衡|闭式|符号求解|equilibrium|solve).*(?:重做|重新(?:求|求解|生成|解)|再求|再解|重写)/.test(
      text
    )
  );
}

function isExplicitModelRefinement(text: string) {
  return (
    /(?:修改|调整|改成|改为|改写|重写|收窄|扩大|补充|删掉|去掉|增加|加入|替换|换成|重新设定|重新定义|refine|change).*(?:模型|假设|变量|参数|效用|利润|时序|顺序|平台|需求|收益|成本|model|utility|profit|assumption|variable|timing)/.test(
      text
    ) ||
    /(?:模型|假设|变量|参数|效用|利润|时序|顺序|平台|需求|收益|成本|model|utility|profit|assumption|variable|timing).*(?:修改|调整|改成|改为|改写|重写|收窄|扩大|补充|删掉|去掉|增加|加入|替换|换成|重新设定|重新定义|refine|change)/.test(
      text
    )
  );
}

function isChatOnlyMessage(text: string) {
  return (
    isBriefCasualStarter(text) ||
    /(解释一下|帮我解释|说明一下|讲清楚|怎么理解|如何理解|为什么|哪里不对|有问题|写错了|修正一下|纠正一下|帮我看|看一下|核对一下|确认一下|梳理一下)/.test(
      text
    )
  );
}

function isBriefCasualStarter(text: string) {
  const compact = text.replace(/[!！。,.?？、\s]/g, "");
  return /^(你好|您好|哈喽|嗨|hi|hello|hey|在吗|在么|早上好|下午好|晚上好|你是谁|你能做什么|可以聊聊吗|能聊吗|有人吗)(啊|呀|呢|嘛|哈)?$/.test(
    compact
  );
}
