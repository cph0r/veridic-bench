#!/usr/bin/env node
// End to end: does `/veridic:tests` turn a module's rules into real tests, and
// is it better than just asking Claude? For each app: a fresh copy at the pinned
// commit, its dependencies installed (scripts off), specs written for its two
// riskiest modules with `/veridic:specs` and committed. That copy is cloned twice:
//
//   B  `/veridic:tests <modules> --yes` (the work list, recipe and test-writer agent)
//   A  a plain prompt: "write tests for every rule in each module's spec, name
//      each test with its rule id; only change test files" (no Veridic plugin)
//
// Each arm is scored with Veridic (`veridic tests --module <id> --run --json`):
// rules counted (tested + broken) out of all, before and after; a mutation sample
// (--mutate 5: would the tests notice the cited code changing?); non-test files
// changed (must be 0); and cost, minutes and turns from Claude Code's JSON. Writes
// tests-e2e.json and TESTS-E2E.md. This runs the apps' tests and spends Claude
// Code usage: --budget caps each Claude run (USD, default 4).
//
//   node tests-e2e.mjs [--cache <dir>] [--budget 4] [--model sonnet] [name …]

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const HERE = import.meta.dirname;
const ROOT = path.dirname(createRequire(import.meta.url).resolve("veridic/package.json"));
const VERIDIC = path.join(ROOT, "bin/veridic");
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const cache = path.resolve(opt("--cache", path.join(os.tmpdir(), "veridic-bench")));
const budget = Number(opt("--budget", 4));
const model = opt("--model", "sonnet");
const only = args.filter((a, i) => !a.startsWith("--") && !(args[i - 1]?.startsWith("--") && args[i - 1] !== "--rescore"));
const DEFAULT = ["realworld"];
const { repos } = JSON.parse(fs.readFileSync(path.join(HERE, "repos.json"), "utf8"));
const TEST = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const git = (cwd, a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const veridic = (cwd, a) => {
  const r = spawnSync(process.execPath, [VERIDIC, ...a, "--repo", cwd], { cwd, encoding: "utf8", maxBuffer: 64 << 20, timeout: 30 * 60 * 1000 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: (r.stderr || r.stdout).slice(0, 300) };
  }
};
const claude = (cwd, prompt, withPlugin) => {
  const t0 = Date.now();
  const r = spawnSync(
    "claude",
    ["-p", prompt, ...(withPlugin ? ["--plugin-dir", ROOT] : []), "--output-format", "json", "--model", model, "--max-budget-usd", String(budget), "--permission-mode", "acceptEdits",
      "--allowedTools", `${withPlugin ? "Bash(veridic:*) Agent " : ""}Bash(npx:*) Bash(npm:*) Bash(node:*) Read Write Edit Glob Grep`],
    { cwd, encoding: "utf8", input: "", maxBuffer: 64 << 20, env: { ...process.env, PATH: `${path.join(ROOT, "bin")}:${process.env.PATH}` }, timeout: 90 * 60 * 1000 },
  );
  let out = {};
  try {
    out = JSON.parse(r.stdout);
  } catch {
    out = { is_error: true, result: (r.stderr || r.stdout || "").slice(0, 400) };
  }
  // A run that ends at once (a usage limit is reported as a normal result) must show why.
  return { cost: out.total_cost_usd ?? null, minutes: Math.round((Date.now() - t0) / 6000) / 10, turns: out.num_turns ?? null, error: out.is_error ? String(out.subtype ?? out.result).slice(0, 200) : null, reply: String(out.result ?? "").slice(0, 400) };
};
const risk = (m) => (m.moves_money ? 1e6 : 0) + m.issues.high * 1e4 + m.issues.medium * 100 + m.routes;

/** A fresh copy at the pinned commit, deps installed with scripts off, plus the app's own generators. */
function prepared(r) {
  const dir = fs.mkdtempSync(path.join(cache, `tests-${r.name}-`));
  git(dir, ["init", "-q"]);
  git(dir, ["remote", "add", "origin", r.url]);
  git(dir, ["fetch", "-q", "--depth", "1", "origin", r.sha]);
  git(dir, ["checkout", "-q", "FETCH_HEAD"]);
  spawnSync("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: dir, stdio: "ignore", timeout: 20 * 60 * 1000 });
  if (fs.existsSync(path.join(dir, "node_modules/.bin/prisma"))) spawnSync("npx", ["--no-install", "prisma", "generate"], { cwd: dir, stdio: "ignore", timeout: 5 * 60 * 1000 });
  return dir;
}
const snapshot = (dir) => {
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.name=bench", "-c", "user.email=bench@example.com", "commit", "-q", "-m", "specs", "--allow-empty"]);
};
const changedNonTest = (dir) => git(dir, ["status", "--porcelain"]).split("\n").filter(Boolean).map((l) => l.slice(3)).filter((f) => !TEST.test(f) && !/^(specs\/|\.veridic\/|\.codegraph\/)/.test(f) && !/\/traceability\.md$/.test(f));
function score(dir, ids) {
  return ids.map((id) => {
    const wl = veridic(dir, ["tests", "--module", id, "--run", "--json", "--mutate", "5"]);
    const t = wl.totals ?? {};
    return { id, rules: t.rules ?? 0, tested: t.tested ?? 0, broken: t.broken ?? 0, failing: t.failing ?? 0, weak: t.weak ?? 0, counted: (t.tested ?? 0) + (t.broken ?? 0), mutation: wl.mutation ? { caught: wl.mutation.caught, sampled: wl.mutation.sampled } : null, error: wl.error ?? null };
  });
}

fs.mkdirSync(cache, { recursive: true });
let results = [];
// --rescore: score the arms already on disk again (after a Veridic fix), with no new Claude runs.
// Each arm's copy is recorded by its folder name under --cache.
if (args.includes("--rescore")) {
  results = JSON.parse(fs.readFileSync(path.join(HERE, "tests-e2e.json"), "utf8"));
  for (const x of results) {
    for (const arm of Object.values(x.arms)) (arm.modules = score(path.join(cache, arm.dir), x.modules)), (arm.non_test_changes = changedNonTest(path.join(cache, arm.dir)));
  }
}
for (const r of args.includes("--rescore") ? [] : repos.filter((x) => (only.length ? only : DEFAULT).includes(x.name))) {
  process.stderr.write(`${r.name}: copy+install `);
  const base = prepared(r);
  veridic(base, ["init", "--no-specs", "--json"]);
  const ids = (veridic(base, ["modules"]).modules ?? []).sort((a, b) => risk(b) - risk(a)).slice(0, 2).map((m) => m.id);
  process.stderr.write(`specs (${ids.join(", ")}) `);
  const specs = claude(base, `/veridic:specs ${ids.join(" ")}`, true);
  if (!specs.turns || specs.turns < 3) throw new Error(`specs run ended early: ${specs.reply}`);
  snapshot(base);
  const before = score(base, ids);
  const arms = {};
  for (const [arm, prompt, plugin] of [
    ["B", `/veridic:tests ${ids.join(" ")} --yes`, true],
    ["A", `Write tests for every rule in the specs of these modules: ${ids.map((id) => `specs/${id}/spec.md`).join(", ")}. Name each test with its rule id, e.g. it("FR-001: ..."). Follow the repo's existing tests. Only change test files.`, false],
  ]) {
    const dir = fs.mkdtempSync(path.join(cache, `tests-${r.name}-${arm}-`));
    fs.cpSync(base, dir, { recursive: true });
    process.stderr.write(`${arm} `);
    const run = claude(dir, prompt, plugin);
    arms[arm] = { ...run, modules: score(dir, ids), non_test_changes: changedNonTest(dir), dir: path.basename(dir) };
  }
  results.push({ repo: r.name, sha: r.sha.slice(0, 10), model, modules: ids, specs_cost: specs.cost, before, arms });
  process.stderr.write("done\n");
}

fs.writeFileSync(path.join(HERE, "tests-e2e.json"), JSON.stringify(results, null, 2) + "\n");
const sum = (ms, k) => ms.reduce((n, m) => n + (m[k] ?? 0), 0);
const rows = results.flatMap((x) => ["A", "B"].map((arm) => { const a = x.arms[arm]; return `| ${x.repo} | ${arm === "B" ? "B: /veridic:tests" : "A: plain prompt"} | ${sum(x.before, "counted")}/${sum(x.before, "rules")} → **${sum(a.modules, "counted")}/${sum(a.modules, "rules")}** | ${sum(a.modules, "broken")} | ${sum(a.modules, "failing")} | ${(() => { const c = sum(a.modules.map((m) => m.mutation ?? {}), "caught"), n = sum(a.modules.map((m) => m.mutation ?? {}), "sampled"); return n ? `${c}/${n}` : "—"; })()} | ${a.non_test_changes.length} | $${(a.cost ?? 0).toFixed(2)} | ${a.minutes} | ${a.turns ?? "—"} |`; }));
fs.writeFileSync(path.join(HERE, "TESTS-E2E.md"), [
  "# /veridic:tests end to end",
  "",
  `Claude Code (${model}) on fresh copies of ${results.length} public app(s): specs written for the two riskiest modules with \`/veridic:specs\`, then the same copy given to two arms. B runs \`/veridic:tests\`; A gets a plain prompt with no Veridic plugin. Scored with \`veridic tests --module --run\`. Reproduce with \`node tests-e2e.mjs\` (it installs the apps' dependencies with scripts off, runs their tests, and spends Claude Code usage).`,
  "",
  "| app | arm | rules counted (before → after) | broken (proven) | failing | tests that caught a code change | non-test files changed | cost | minutes | turns |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows,
  "",
  "Counted = a passing test named with the rule id reaches its cited code, or an expected-failure test proves the code breaks it. B passes if it counts more rules than A whose tests catch a code change at least as often, at no more cost, and changes no non-test file.",
  "",
].join("\n"));
process.stdout.write(fs.readFileSync(path.join(HERE, "TESTS-E2E.md"), "utf8"));
