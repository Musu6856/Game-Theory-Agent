import test from "node:test";
import assert from "node:assert/strict";

import { generateResearchProject } from "./ai-research-generation.ts";
import {
  createExplorationProject,
  generateSymbolicEquilibrium,
} from "./research-session.ts";

async function createModelProject() {
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

  return built.project;
}

test("rejects malformed closed-form equilibrium output instead of presenting it as solved", async () => {
  const modelProject = await createModelProject();

  const result = await generateResearchProject(
    {
      action: "solve_equilibrium",
      rawIdea: modelProject.rawIdea,
      project: modelProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "已给出均衡价格。",
          equilibriumResult: {
            status: "solved",
            concept: "垂直差异化双寡头价格竞争均衡",
            solvingSteps: ["写出利润函数", "对价格求一阶条件"],
            focs: ["∂Π_A/∂p_A = 0", "∂Π_B/∂p_B = 0"],
            conditions: ["q_N > 0", "0 < δ < 1"],
            closedForm:
              "p_A** = q_N(1-δ)/3, p_B ** = 2q_N(1-δ)/3pA * = qN(1-δ)/3",
            derivation: "联立一阶条件即可得到上式。",
            code: "import sympy as sp\nsp.solve([foc_A, foc_B], [p_A, p_B])",
            warnings: [],
          },
        }),
    }
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.project.equilibriumResult?.status, "derivation_draft");
  assert.doesNotMatch(result.project.equilibriumResult?.closedForm ?? "", /p_A\*\*/);
});

test("rejects one-off zero property analysis caused by a missing parameter", async () => {
  const modelProject = await createModelProject();
  const solvedProject = generateSymbolicEquilibrium(modelProject, {
    acceptDefaultFallbackScope: true,
  });

  const result = await generateResearchProject(
    {
      action: "analyze_properties",
      rawIdea: solvedProject.rawIdea,
      project: solvedProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "以下是比较静态分析。",
          propertyAnalysis: {
            id: "zero-missing-parameter",
            target: "p_A^*",
            parameter: "\\alpha_B",
            operation: "differentiate",
            symbolicResult: "\\partial p_A^*/\\partial \\alpha_B = 0",
            signCondition: "零",
            propositionDraft:
              "若消费者效用仅取决于产品质量和价格，则均衡价格不受消费者网络效应影响。",
            proofSketch:
              "由均衡闭式解 p_A^*=q_N(1-δ)/3，该表达式不含 \\alpha_B，故偏导数为 0。",
            intuition: "网络效应未纳入效用函数。",
            warnings: [],
          },
        }),
    }
  );

  assert.equal(result.usedFallback, true);
  assert.ok((result.project.propertyAnalyses?.length ?? 0) >= 3);
  assert.doesNotMatch(
    result.project.propertyAnalyses?.[0].proofSketch ?? "",
    /不含 \\alpha_B|未纳入效用函数/
  );
});

test("rejects single provider property analysis even when symbolic", async () => {
  const modelProject = await createModelProject();
  const solvedProject = generateSymbolicEquilibrium(modelProject, {
    acceptDefaultFallbackScope: true,
  });

  const result = await generateResearchProject(
    {
      action: "analyze_properties",
      rawIdea: solvedProject.rawIdea,
      project: solvedProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "已生成一条符号性质。",
          propertyAnalysis: {
            id: "single-symbolic",
            target: "\\tau_i^*",
            parameter: "\\alpha_B",
            operation: "differentiate",
            symbolicResult:
              "\\frac{\\partial \\tau_i^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
            signCondition: "q>0 时为负",
            propositionDraft: "命题：买方网络效应降低均衡佣金。",
            proofSketch: "对闭式均衡佣金关于 \\alpha_B 求偏导。",
            intuition: "平台通过降低佣金扩大卖方参与以吸引买方。",
            warnings: ["不使用数值模拟"],
          },
        }),
    }
  );

  assert.equal(result.usedFallback, true);
  assert.ok((result.project.propertyAnalyses?.length ?? 0) >= 3);
});

test("keeps a provider property-analysis bundle instead of truncating to one item", async () => {
  const modelProject = await createModelProject();
  const solvedProject = generateSymbolicEquilibrium(modelProject, {
    acceptDefaultFallbackScope: true,
  });

  const result = await generateResearchProject(
    {
      action: "analyze_properties",
      rawIdea: solvedProject.rawIdea,
      project: solvedProject,
    },
    {
      complete: async () =>
        JSON.stringify({
          assistantMessage: "已生成三个可写成命题的符号性质。",
          propertyAnalyses: [
            {
              id: "buyer-network-effect",
              target: "\\tau_i^*",
              parameter: "\\alpha_B",
              operation: "differentiate",
              symbolicResult:
                "\\frac{\\partial \\tau_i^*}{\\partial \\alpha_B}=-\\frac{2}{q}",
              signCondition: "q>0 时为负",
              propositionDraft: "命题 1：买方网络效应降低均衡佣金。",
              proofSketch: "对闭式均衡佣金关于 \\alpha_B 求偏导。",
              intuition: "平台通过降低佣金扩大卖方参与以吸引买方。",
              warnings: ["不使用数值模拟"],
            },
            {
              id: "seller-transport-cost",
              target: "\\tau_i^*",
              parameter: "t_S",
              operation: "differentiate",
              symbolicResult:
                "\\frac{\\partial \\tau_i^*}{\\partial t_S}=\\frac{1}{q}",
              signCondition: "q>0 时为正",
              propositionDraft: "命题 2：卖方差异化成本提高均衡佣金。",
              proofSketch: "对闭式均衡佣金关于 t_S 求偏导。",
              intuition: "差异化增强平台定价能力。",
              warnings: ["不使用数值模拟"],
            },
            {
              id: "buyer-subsidy-threshold",
              target: "s_i^*",
              parameter: "t_B",
              operation: "threshold",
              symbolicResult:
                "s_i^*>0 \\Leftrightarrow t_S+\\alpha_S>2t_B+2\\alpha_B",
              signCondition: "阈值条件由补贴闭式解给出",
              propositionDraft: "命题 3：买方补贴存在一个符号阈值。",
              proofSketch: "令闭式补贴大于零并整理参数。",
              intuition: "当卖方侧价值足够高时，平台愿意补贴买方。",
              warnings: ["不使用数值模拟"],
            },
          ],
        }),
    }
  );

  assert.equal(result.usedFallback, false);
  assert.equal(result.project.propertyAnalyses?.length, 3);
  assert.deepEqual(
    result.project.propertyAnalyses?.map((analysis) => analysis.id),
    [
      "buyer-network-effect",
      "seller-transport-cost",
      "buyer-subsidy-threshold",
    ]
  );
});
