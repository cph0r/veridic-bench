# veridic-bench

The reproducible benchmark for [Veridic](https://github.com/cph0r/veridic): how it does on 10 public Express apps (OWASP Juice Shop, OWASP NodeGoat, hackathon-starter, RealWorld and six more), each pinned to an exact commit.

**Results: [RESULTS.md](RESULTS.md).** In short: 353 of 353 routes found, 37 of 39 high and medium issues confirmed by hand (95% precision), 9 of 9 "tests that assert nothing" confirmed.

## Reproduce

```bash
npm install          # installs the Veridic version in package.json
node run.mjs         # clones the 10 apps at their pinned commits, runs Veridic, writes RESULTS.md
```

Needs Node 22.5 or newer and git. Clones go to `$TMPDIR/veridic-bench` (or `--cache <dir>`). It only reads the apps: it never installs their dependencies or runs their code.

## Files

- [repos.json](repos.json): the apps and their pinned commits; `dev` apps were used while improving Veridic, `holdout` apps only afterwards.
- [verdicts.json](verdicts.json): a hand verdict, with its reason, for every high and medium issue and every "asserts nothing" test.
- [run.mjs](run.mjs): the runner, including an independent route scanner that shares no code with Veridic.
- [results.json](results.json) / [RESULTS.md](RESULTS.md): the latest run.
