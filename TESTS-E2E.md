# /veridic:tests end to end

Claude Code (sonnet) on fresh copies of 1 public app(s): specs written for the two riskiest modules with `/veridic:specs`, then the same copy given to two arms. B runs `/veridic:tests`; A gets a plain prompt with no Veridic plugin. Scored with `veridic tests --module --run`. Reproduce with `node tests-e2e.mjs` (it installs the apps' dependencies with scripts off, runs their tests, and spends Claude Code usage).

| app | arm | rules counted (before → after) | broken (proven) | failing | tests that caught a code change | non-test files changed | cost | minutes | turns |
|---|---|---|---|---|---|---|---|---|---|
| realworld | A: plain prompt | 0/40 → **14/40** | 0 | 0 | 3/6 | 0 | $0.70 | 43.8 | 24 |
| realworld | B: /veridic:tests | 0/40 → **39/40** | 2 | 0 | 6/8 | 0 | $2.67 | 108.7 | 6 |

Counted = a passing test named with the rule id reaches its cited code, or an expected-failure test proves the code breaks it. B passes if it counts more rules than A whose tests catch a code change at least as often, at no more cost, and changes no non-test file.
