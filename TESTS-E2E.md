# /veridic:tests end to end

Claude Code (sonnet) on fresh copies of 1 public app(s): specs written for the two riskiest modules with `/veridic:specs`, then the same copy given to two arms. B runs `/veridic:tests`; A gets a plain prompt with no Veridic plugin. Scored with `veridic tests --module --run`. Both arms run without the user's own plugins, hooks and MCP servers. Reproduce with `node tests-e2e.mjs` (it installs the apps' dependencies with scripts off, runs their tests, and spends Claude Code usage).

| app | arm | rules counted (before → after) | broken (proven) | failing | tests that caught a code change | non-test files changed | cost | minutes | turns |
|---|---|---|---|---|---|---|---|---|---|
| realworld | A: plain prompt | 0/38 → **33/38** | 0 | 0 | 7/10 | 0 | $0.69 | 3.4 (3.2 model) | 29 |
| realworld | B: /veridic:tests | 0/38 → **38/38** | 3 | 0 | 6/10 | 0 | $0.62 | 2.5 (3.4 model) | 8 |

Counted = a passing test named with the rule id reaches its cited code, or an expected-failure test proves the code breaks it. B passes if it counts more rules than A whose tests catch a code change at least as often, at no more cost, and changes no non-test file.
