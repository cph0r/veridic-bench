# /veridic:specs end to end

Claude Code (sonnet) ran `/veridic:specs` unattended on fresh copies of 2 public apps, on the 2 riskiest modules of each. Each spec is scored with Veridic itself. Reproduce with `node specs-e2e.mjs` (it spends Claude Code usage).

| app | module | written | requirements | citations resolving | facts found at cited lines | routes covered | findings recorded as risks |
|---|---|---|---|---|---|---|---|
| realworld | `articles` | yes | 33 | 48/48 | 100% | 11/11 | — |
| realworld | `auth` | yes | 24 | 35/35 | 100% | 4/4 | — |
| proshop-v2 | `orders` | yes | 20 | 36/36 | 100% | 6/6 | 1/1 |
| proshop-v2 | `users` | yes | 25 | 45/45 | 100% | 9/9 | — |

| app | cost | minutes | turns | error |
|---|---|---|---|---|
| realworld | $0.78 | 2.1 | 5 | — |
| proshop-v2 | $0.86 | 2.8 | 5 | — |

Total: $1.64.
