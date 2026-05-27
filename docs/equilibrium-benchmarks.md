# Equilibrium Benchmark Suite

This suite keeps PaperForge-Agent honest about equilibrium solving. It is not a promise that every game-theory model can be solved automatically. It is a regression suite for what the system may promote, what it must leave as draft/manual review, and which shortcuts are forbidden.

Run it with:

```powershell
node --test src\lib\research-agent\equilibrium-benchmark-cases.test.mjs
```

## Benchmark Cases

| Case | Expected Outcome | Forbidden Shortcut |
| --- | --- | --- |
| `simple-symmetric-hotelling` | Promotable solved candidate with model coverage, residual/solve review, and negative second derivative evidence. | None. |
| `non-symmetric-no-half-collapse` | Manual review if a non-symmetric model collapses to `1/2` or the wrong parameter. | Default symmetric one-half solution. |
| `two-stage-reaction-function` | Promotable reaction-function equilibrium when each player has one own decision and own SOC evidence passes. | Treating strategic interaction as unsupported merely because rival actions enter payoffs. |
| `parameter-condition-insufficient` | Manual review when curvature or existence conditions are missing. | FOC-only promotion. |
| `boundary-solution` | Manual review / condition insufficient unless KKT or boundary-region analysis is present. | Interior FOC proof for a boundary candidate. |
| `soc-stationary-not-maximum` | Candidate repair when the second derivative proves a minimum. | Treating a stationary point as a maximum. |
| `multi-decision-hessian` | Manual review for same-player multi-decision objectives unless Hessian/concavity proof is supplied. | Checking only separate own second derivatives. |
| `mechanism-rich-implicit` | Draft-only implicit system is acceptable when quality/recommendation mechanisms are preserved. | Simplifying a mechanism-rich model to the default Hotelling core. |

## Release Rule

Before claiming solver improvement or inviting a group trial, run this benchmark along with the broader test suite:

```powershell
node --test src\lib\research-agent\equilibrium-benchmark-cases.test.mjs
npm test
npx tsc --noEmit
```

If a case fails, do not weaken the expected outcome just to make the suite pass. Update expectations only when the solver genuinely gains new evidence, such as executable Hessian definiteness or KKT verification.
