# Equilibrium Reliability R&D Plan

> **For future agents:** this is the next work plan after the 2026-05-27 productization pass. Implement it checkpoint by checkpoint. Do not treat the current pretty closed-form Hotelling fallback as the final goal. The goal is to make equilibrium solving honest before making it stronger.

**Goal:** Rework PaperForge-Agent's equilibrium flow so it first produces a visible derivation draft, then only promotes a result to a right-side equilibrium patch when the derivation is grounded in the confirmed model.

**Core judgment:** The current system is too eager to produce a `solved` structured equilibrium asset. That pressure pushes model generation and fallback code toward a narrow symmetric Hotelling core, often yielding clean `1/2` style equilibria that look complete but may not preserve the user's actual mechanism. It also treats FOC evidence as too close to a proof: first-order conditions are necessary conditions, not sufficient evidence that a profit maximum or equilibrium has been established.

**Non-goal:** This plan does not promise a universal CAS or an automatic solver for arbitrary game-theory models. It first prevents false confidence and model simplification, then builds measurable solver capability.

---

## 1. Root Cause Summary

The current behavior is not just a model-quality issue. It is encouraged by the product flow and code shape.

1. `src/lib/research-generation/prompts.ts` asks model generation to prefer a solvable two-decision core such as subsidy `s_i` and commission `tau_i`, with linear Hotelling demand, so SymPy can solve the FOCs.
2. `src/lib/research-generation/fallbacks.ts` can narrow a provider model to a minimal solvable two-sided Hotelling structure with decisions `tau_A`, `tau_B`, `s_A`, `s_B`.
3. `src/lib/ai-research-generation.ts` currently validates equilibrium provider output as `status === "solved"` and requiring `closedForm`; invalid output falls back through `generateSymbolicEquilibrium`.
4. `src/lib/research-session.ts` contains a local symmetric Hotelling fallback with `n_A^{B*}=n_A^{S*}=1/2` and a clean closed-form commission/subsidy solution.
5. `src/lib/research-chat-view.ts` hides older provider draft messages once an Agent review message exists, so the middle chat loses the detailed derivation feel and mostly points the user to right-side review.
6. `src/lib/research-agent/sympy-equilibrium-review.ts` mostly verifies the candidate system it can parse. If the candidate has already collapsed the model to a simplified symmetric core, verification can check that simplified core without proving the original mechanism was preserved.
7. The current review path emphasizes FOC residuals and independent solve checks, but it does not make second-order conditions, Hessian negative definiteness, concavity, KKT conditions, or boundary analysis a promotion gate for formal equilibrium assets.

The main risk is therefore not just "cannot solve." It is "looks solved after simplification."

---

## 2. Implementation Stages

### Stage 1: Two-Stage Equilibrium Flow

**Purpose:** Stop forcing every equilibrium attempt into a formal `solved` right-side asset.

**Files likely touched:**

- `src/lib/types.ts`
- `src/lib/research-generation/prompts.ts`
- `src/lib/ai-research-generation.ts`
- `src/lib/research-agent/equilibrium-runner.ts`
- `src/lib/research-chat-view.ts`
- `src/components/research-workspace/research-assets-panel.tsx`
- `src/lib/research-agent/equilibrium-runner.test.mjs`
- `src/lib/ai-research-generation.test.mjs`
- `src/lib/research-chat-view.test.mjs`

**Tasks:**

- [x] Add an `equilibriumDraft` or `solverScratchpad` structure for first-stage output.
- [x] Allow first-stage statuses such as `derivation_draft`, `implicit_system`, `reaction_functions`, `failed_with_reason`, and `needs_model_clarification`.
- [x] Update the equilibrium prompt so the first model call can produce long-form derivation, FOCs, attempted solving steps, and explicit uncertainty without requiring `status: "solved"`.
- [x] Keep the full first-stage derivation visible in the middle chat; do not hide it behind a short Agent review message.
- [x] Only create a right-side `equilibrium` patch when the draft passes promotion checks.
- [x] Promotion checks must require second-order evidence: single-variable decisions need a negative second derivative or explicit concavity argument; multi-variable decisions need Hessian negative definiteness or a justified concavity/KKT/boundary analysis.
- [x] If the result is only an implicit system or failed draft, keep it as a draft/diagnostic artifact and do not unlock property analysis.
- [x] Add tests proving a non-solved derivation draft is visible in chat and does not become an applied or proposed formal equilibrium patch.

**Stage 1 evidence, 2026-05-27:**

- Added `EquilibriumResult.solverScratchpad` plus draft statuses in `src/lib/types.ts` and parser/schema support in `src/lib/research-generation/parsers.ts`.
- Updated `createEquilibriumPrompt` so the model may return `derivation_draft`, `implicit_system`, `reaction_functions`, `failed_with_reason`, or `needs_model_clarification` instead of forcing `solved`.
- Changed generation and Agent runner behavior so non-solved drafts remain visible in chat, do not create formal equilibrium patches, and keep `solve_equilibrium` as the next decision.
- Added a Stage 1 promotion gate that blocks FOC-only `solved` candidates from formal equilibrium patches unless they include second-order/Hessian/concavity/KKT/boundary evidence. This is a textual/evidence gate; full executable SOC/Hessian/KKT verification remains Stage 4.
- Kept existing bounded repair and solver-kernel artifact persistence for `solved` candidates with repairable risks.

**Acceptance checks:**

- [x] A complex model can produce a visible draft with FOCs and failed/implicit solving notes.
- [x] A draft without a trustworthy closed-form result does not create a normal equilibrium patch.
- [x] Property analysis remains locked unless a confirmed formal equilibrium exists.
- [x] A candidate that only satisfies FOC, with no SOC/Hessian/concavity/KKT evidence, remains draft/manual-review and cannot be promoted as a formal solved equilibrium.
- [x] The user can see what the model tried in the middle conversation, not only a right-side patch summary.

**Verification run, 2026-05-27:**

- `node --test src\lib\ai-research-generation.test.mjs`
- `node --test src\lib\research-agent\equilibrium-runner.test.mjs`
- `node --test src\lib\research-chat-view.test.mjs`
- `node --test src\lib\research-flow.test.mjs`
- `node --test src\lib\research-asset-patch-apply.test.mjs`
- `node --test src\lib\research-agent\controller-reliability.test.mjs src\lib\research-agent\controller.test.mjs`
- `npx tsc --noEmit`
- `git diff --check`
- `npm test` (`465` tests: `464` pass, `1` skipped, `0` failed)

### Stage 2: Stop Pretty Fallbacks From Masquerading As Solved Equilibria

**Purpose:** Keep deterministic fallbacks useful as scaffolds, but never let them pretend to be the real answer for a complex model.

**Files likely touched:**

- `src/lib/research-session.ts`
- `src/lib/research-generation/fallbacks.ts`
- `src/lib/ai-research-generation.ts`
- `src/lib/research-generation-result.ts`
- `src/lib/research-flow.ts`
- `src/lib/research-session.test.mjs`
- `src/lib/research-generation-result.test.mjs`

**Tasks:**

- [x] Change symmetric Hotelling fallback results to `needs_revision` or draft-only unless the current model exactly matches the default commission/subsidy core and the user explicitly accepts that scope.
- [x] Preserve fallback text as an example scaffold or diagnostic derivation, not as a formal `solved` asset.
- [x] Make `generateSymbolicEquilibrium` return a draft/diagnostic when the current model has non-default mechanism variables.
- [x] Ensure fallback-generated results cannot unlock `analyze_properties`.
- [x] Add tests proving a non-default direction does not receive the default `1/2` solved equilibrium as a formal asset.

**Stage 2 evidence, 2026-05-27:**

- Changed `generateSymbolicEquilibrium(project)` so the default local fallback now returns `derivation_draft` with a model-grounded diagnostic system instead of a formal `solved` symmetric Hotelling result.
- Added the explicit test/demo escape hatch `generateSymbolicEquilibrium(project, { acceptDefaultFallbackScope: true })` for cases that intentionally need the default commission/subsidy Hotelling closed-form fixture.
- Kept non-default directions and mechanism-rich models on draft/diagnostic fallback even when local generation is used, so they do not silently receive the default `$1/2$` closed-form result.
- Updated persistability and downstream fixture tests so draft fallback projects do not unlock `analyze_properties`, while explicitly accepted solved fixtures remain available for controller, paper, export, and property-analysis tests.

**Acceptance checks:**

- [x] Generic or mechanism-rich directions no longer receive a formal solved fallback with `n_A^{B*}=1/2`.
- [x] The UI labels fallback output as draft/scaffold/diagnostic.
- [x] The next action after a fallback is model clarification or derivation review, not property analysis.

**Verification run, 2026-05-27:**

- `node --test src\lib\ai-research-generation.test.mjs src\lib\research-session.test.mjs src\lib\research-generation-result.test.mjs`
- `node --test src\lib\research-flow.test.mjs src\lib\research-agent\controller.test.mjs src\lib\research-agent\property-runner.test.mjs src\lib\research-agent\paper-runner.test.mjs src\lib\research-agent\paper-section-runner.test.mjs src\lib\research-export.test.mjs src\lib\research-paper-output.test.mjs src\lib\research-agent\equilibrium-dynamic-planner.test.mjs src\lib\research-asset-patch-apply.test.mjs`
- `node --test src\lib\ai-research-generation-repair.test.mjs src\lib\research-quality-gates.test.mjs`
- `npx tsc --noEmit`
- `git diff --check`
- `npm test` (`465` tests: `464` pass, `1` skipped, `0` failed)

### Stage 3: Model Coverage And Anti-Simplification Checks

**Purpose:** Show whether the derivation actually used the confirmed model.

**Files likely touched:**

- Create `src/lib/research-agent/equilibrium-coverage.ts`
- Create `src/lib/research-agent/equilibrium-coverage.test.mjs`
- Modify `src/lib/research-agent/equilibrium-runner.ts`
- Modify `src/lib/research-agent/equilibrium-solver-kernel.ts`
- Modify `src/components/research-workspace/research-assets-panel.tsx`
- Modify `src/lib/types.ts`

**Tasks:**

- [x] Compute model coverage: decision variables, parameters, demand variables, mechanism terms, utility functions, and profit functions.
- [x] Compute derivation coverage: which model variables appear in FOCs, residuals, closed-form expressions, and derivation text.
- [x] Flag omitted high-value mechanism terms, especially quality, subsidy, commission, recommendation strength, multihoming, verification effort, asymmetry, and boundary constraints.
- [x] Flag suspicious simplification when a mechanism-rich model yields only default `tau/s/1/2` style results.
- [x] Surface coverage findings in the draft, right-side math panel, and audit export.
- [x] Add tests where a model with quality investment `q_i` or recommendation strength `r_i` produces a simplified equilibrium; expected result is a warning/blocker, not a clean formal patch.

**Stage 3 evidence, 2026-05-27:**

- Added `src/lib/research-agent/equilibrium-coverage.ts` and tests for model-vs-derivation coverage, omitted high-value mechanisms, and suspicious default Hotelling simplification.
- Added the `model_coverage_check` math artifact kind. The solver kernel now records coverage evidence before SymPy artifacts, and the runner blocks promotion when the candidate omits strategic high-value mechanisms such as quality investment `q_A` or recommendation strength `r_A`.
- Kept the gate conservative: ordinary commission/subsidy or closed-form mistakes still flow through the existing bounded repair path; mechanism-rich simplification stays draft/manual-review and does not create a formal equilibrium patch.
- Right-side technical validation records now display the coverage artifact, and project audit export includes a dedicated model coverage section with used symbols, omitted symbols, omitted high-value mechanisms, and suspicious-simplification status.

**Acceptance checks:**

- [x] The system lists variables and mechanisms used by the derivation.
- [x] The system lists variables and mechanisms not used by the derivation.
- [x] A simplified equilibrium cannot be promoted without an explicit warning and user-visible scope limitation.

**Verification run, 2026-05-27:**

- `node --test src\lib\research-agent\equilibrium-coverage.test.mjs src\lib\research-agent\equilibrium-solver-kernel.test.mjs src\lib\research-agent\equilibrium-runner.test.mjs`
- `node --test src\lib\research-agent\equilibrium-display.test.mjs src\lib\research-agent\project-audit.test.mjs`

### Stage 4: Second-Order And Boundary Verification

**Purpose:** Prevent FOC-only candidates from being treated as profit-maximizing equilibria.

**Files likely touched:**

- Create `src/lib/research-agent/equilibrium-optimality.ts`
- Create `src/lib/research-agent/equilibrium-optimality.test.mjs`
- Modify `src/lib/research-agent/equilibrium-solver-kernel.ts`
- Modify `src/lib/research-agent/sympy-equilibrium-review.ts`
- Modify `src/lib/research-agent/sympy-checker.ts`
- Modify `src/components/research-workspace/math-artifact.tsx`
- Modify `src/lib/types.ts`

**Tasks:**

- [ ] Add math artifact kinds for `second_order_conditions`, `hessian_check`, `concavity_check`, and `boundary_kkt_check`.
- [ ] For one-dimensional platform decisions, compute or parse the second derivative and require it to be negative at the candidate optimum, unless a stronger global concavity argument is provided.
- [ ] For multi-dimensional decisions, compute or parse the Hessian with respect to each player's own decision vector and require negative definiteness, negative semidefiniteness with a qualification note, or an explicit manual-review status.
- [ ] For constrained decisions such as subsidy nonnegativity, commission bounds, participation shares, or quality investment nonnegativity, require KKT or boundary-region analysis instead of only an interior FOC.
- [ ] Mark unsupported SOC/Hessian/KKT checks as `manual_review` or `condition_insufficient`, not `passed`.
- [ ] Add tests where FOC holds but SOC fails; expected result is no formal equilibrium promotion.
- [ ] Add tests where FOC holds but the optimum is on a boundary; expected result is boundary/KKT draft or manual review, not an interior closed-form proof.

**Acceptance checks:**

- [ ] Every promoted formal equilibrium has either SOC/Hessian/concavity evidence or an explicit, user-visible manual-review exception.
- [ ] A FOC-only candidate cannot unlock property analysis.
- [ ] The right-side math artifacts show whether the result proves a local maximum, only a stationary point, or a boundary/manual-review case.

### Stage 5: Benchmark Suite

**Purpose:** Stop judging solver quality by impressions. Use cases should prove what the system can and cannot do.

**Files likely touched:**

- Create `docs/equilibrium-benchmarks.md`
- Create `src/lib/research-agent/equilibrium-benchmark-cases.ts`
- Create `src/lib/research-agent/equilibrium-benchmark-cases.test.mjs`
- Modify `docs/group-trial-test-plan.md`
- Modify `docs/release-checklist.md`

**Benchmark categories:**

- [ ] Simple symmetric Hotelling case that should pass.
- [ ] Non-symmetric Hotelling case that should not collapse to `1/2`.
- [ ] Two-stage platform model with a reaction function.
- [ ] Parameter-condition model where the system must identify insufficient conditions.
- [ ] Boundary-solution model where the system must not report only an interior optimum.
- [ ] FOC-only stationary point where the second derivative or Hessian shows the candidate is not a maximum.
- [ ] Multi-decision platform problem requiring Hessian or concavity checks before promotion.
- [ ] Mechanism-rich model where implicit system or manual review is acceptable, but silent simplification is not.

**Acceptance checks:**

- [ ] Each benchmark has expected model coverage, expected optimality evidence, expected allowed status, and forbidden shortcuts.
- [ ] Tests can detect a regression where default symmetric fallback appears in a non-default case.
- [ ] Release checklist includes running benchmark checks before claiming solver improvement.

### Stage 6: Solver v3 After Honesty Gates

**Purpose:** Improve actual solving only after the system stops pretending.

**Files likely touched:**

- `src/lib/research-agent/equilibrium-solver-kernel.ts`
- `src/lib/research-agent/sympy-equilibrium-review.ts`
- `src/lib/research-agent/sympy-checker.ts`
- New focused solver modules under `src/lib/research-agent/`
- Corresponding `*.test.mjs` files

**Tasks:**

- [ ] Compile model assets into executable equations instead of relying mainly on generated LaTeX text.
- [ ] Separate players, strategic variables, state/demand variables, parameters, constraints, and timing.
- [ ] Generate FOCs from structured profit functions when safe.
- [ ] Generate second derivatives, Hessians, and KKT/boundary conditions when safe.
- [ ] Try multiple bounded solving strategies: linear systems, reaction functions, explicit FOC solve, residual substitution, and implicit-system fallback.
- [ ] Classify failures as model gap, unsupported expression, condition insufficiency, SOC/Hessian failure, boundary/multiple-equilibrium issue, or solver timeout.
- [ ] Keep arbitrary model-generated Python code forbidden.

**Acceptance checks:**

- [ ] Solver v3 improves benchmark outcomes without reintroducing pretty solved fallbacks.
- [ ] Every failed solve has a user-readable reason and a next action.
- [ ] Every successful solve has residual, coverage, and optimality evidence tied to the confirmed model.

### Stage 7: Reconnect Property Analysis And Paper Output

**Purpose:** Keep downstream writing honest about the equilibrium status.

**Files likely touched:**

- `src/lib/research-agent/property-runner.ts`
- `src/lib/research-agent/paper-runner.ts`
- `src/lib/research-agent/paper-section-runner.ts`
- `src/lib/research-export.ts`
- `src/components/research-workspace/research-assets-panel.tsx`
- Tests for each runner/export path

**Tasks:**

- [ ] Formal comparative statics require a confirmed formal equilibrium.
- [ ] If only an implicit system exists, generate only implicit comparative-statics draft language.
- [ ] Paper output must state whether the equilibrium is closed form, reaction-function based, implicit, draft-only, or manual-review.
- [ ] Paper output must state whether the equilibrium is a proven maximum, a stationary point under manual review, or a boundary/KKT case.
- [ ] Audit export must include model coverage, omitted mechanisms, optimality evidence, and promotion decisions.

**Acceptance checks:**

- [ ] Paper output cannot cite a draft/scaffold or FOC-only stationary point as if it were a proved equilibrium.
- [ ] Property analysis cannot silently use a simplified fallback equilibrium.
- [ ] Exported audit tells a future reviewer exactly which equilibrium status the paper used.

---

## 3. Work Order

Recommended order:

1. Stage 1: Two-stage equilibrium flow.
2. Stage 2: Stop pretty fallbacks from masquerading as solved equilibria.
3. Stage 3: Model coverage and anti-simplification checks.
4. Stage 4: Second-order and boundary verification.
5. Stage 5: Benchmark suite.
6. Stage 6: Solver v3 after honesty gates.
7. Stage 7: Reconnect property analysis and paper output.

Do not start Solver v3 before Stages 1-5. Otherwise, the system can still route complex work into a simplified solved asset or promote a stationary point without maximum evidence.

---

## 4. Checkpoint Rules

After each stage:

- Run the focused unit tests for that stage.
- Run `npm test` if the touched surface is broad.
- Run `npx tsc --noEmit` before claiming type safety.
- Browser-test the research workspace if UI behavior changed.
- Update this file by checking off completed tasks and adding short evidence notes.
- Commit the stage separately with a message that names the stage.

Stop and re-evaluate if three consecutive fixes still produce simplified solved outputs for non-default benchmark cases. That means the architecture is still pushing toward false completion.

---

## 5. Current Decision Record

As of 2026-05-27:

- The next immediate implementation target is Stage 3: model coverage and anti-simplification checks.
- The project should not continue presenting the default symmetric Hotelling fallback as a reliable final answer for mechanism-rich directions.
- The project should not treat FOC-only evidence as sufficient for a formal profit-maximizing equilibrium. Second-order, Hessian, concavity, KKT, or boundary evidence must be visible before promotion.
- The middle chat should become useful again for long derivations and solver scratch work.
- The right-side patch system remains valuable, but only as the promotion/review layer after derivation quality is established.
