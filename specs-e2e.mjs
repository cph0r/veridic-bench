#!/usr/bin/env node
// End to end: does `/veridic:specs` write good specs on its own? For each app it
// takes a fresh copy at the pinned commit, indexes it, and runs Claude Code
// unattended (`claude -p "/veridic:specs <modules>"`) on the riskiest modules.
// Then it scores each module's spec with Veridic itself:
//
//   written     a spec exists at the module's spec_path
//   citations   every [evidence: file:line] resolves (veridic cite)
//   claims      share of the facts requirements state that are found at their cited lines (veridic claims)
//   covered     the module's routes the spec covers
//   findings    the module's open findings recorded as risks or open questions,
//               not stated as requirements
//
// and the run's cost, time and turns from Claude Code's JSON output. Writes
// specs-e2e.json and SPECS-E2E.md. This spends Claude Code usage: --budget caps
// each app (USD, default 4), --modules how many modules per app (default 2).
//
//   node specs-e2e.mjs [--cache <dir>] [--modules 2] [--budget 4] [--model sonnet] [name …]

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
const perApp = Number(opt("--modules", 2));
const budget = Number(opt("--budget", 4));
const model = opt("--model", "sonnet");
const only = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const DEFAULT = ["realworld", "proshop-v2"];
const { repos } = JSON.parse(fs.readFileSync(path.join(HERE, "repos.json"), "utf8"));
const git = (cwd, a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const veridic = (cwd, a) => {
  const r = spawnSync(process.execPath, [VERIDIC, ...a, "--repo", cwd], { cwd, encoding: "utf8", maxBuffer: 64 << 20 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { error: (r.stderr || r.stdout).slice(0, 300) };
  }
};

/** A fresh copy at the pinned commit: the run writes into it, so never reuse one. */
function freshCopy(r) {
  const dir = fs.mkdtempSync(path.join(cache, `e2e-${r.name}-`));
  git(dir, ["init", "-q"]);
  git(dir, ["remote", "add", "origin", r.url]);
  git(dir, ["fetch", "-q", "--depth", "1", "origin", r.sha]);
  git(dir, ["checkout", "-q", "FETCH_HEAD"]);
  return dir;
}

const risk = (m) => (m.moves_money ? 1e6 : 0) + m.issues.high * 1e4 + m.issues.medium * 100 + m.routes;

/** Are the module's open findings recorded as risks/open questions (and not only as requirements)? */
function findingsRecorded(specText, findings) {
  const at = specText.search(/^##+ .*(risk|open question)/im);
  const risks = at >= 0 ? specText.slice(at) : "";
  const key = (f) => String(f.where).split(" ").pop().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:\w+/g, "[^\\s/`]+");
  return findings.map((f) => new RegExp(key(f)).test(risks) || risks.toLowerCase().includes(String(f.title ?? "").toLowerCase()));
}

fs.mkdirSync(cache, { recursive: true });
const results = [];
for (const r of repos.filter((x) => (only.length ? only : DEFAULT).includes(x.name))) {
  process.stderr.write(`${r.name}: copy `);
  const dir = freshCopy(r);
  process.stderr.write("index ");
  veridic(dir, ["init", "--no-specs", "--json"]);
  const before = veridic(dir, ["modules"]).modules ?? [];
  const chosen = before.filter((m) => !m.specs.length).sort((a, b) => risk(b) - risk(a)).slice(0, perApp);
  if (!chosen.length) {
    process.stderr.write("no modules\n");
    continue;
  }
  const report = veridic(dir, ["report", "--json"]);
  const ids = chosen.map((m) => m.id);
  process.stderr.write(`claude (${ids.join(", ")}) `);
  const t0 = Date.now();
  const run = spawnSync(
    "claude",
    ["-p", `/veridic:specs ${ids.join(" ")}`, "--plugin-dir", ROOT, "--output-format", "json", "--model", model, "--max-budget-usd", String(budget),
      "--permission-mode", "acceptEdits", "--allowedTools", "Bash(veridic:*) Bash(node:*) Read Write Edit Glob Grep Agent"],
    { cwd: dir, encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, PATH: `${path.join(ROOT, "bin")}:${process.env.PATH}` }, timeout: 60 * 60 * 1000 },
  );
  let out = {};
  try {
    out = JSON.parse(run.stdout);
  } catch {
    out = { is_error: true, result: (run.stderr || run.stdout || "").slice(0, 400) };
  }
  process.stderr.write(`$${(out.total_cost_usd ?? 0).toFixed(2)} score\n`);
  const after = veridic(dir, ["modules"]).modules ?? [];
  const modules = chosen.map((m) => {
    const now = after.find((x) => x.id === m.id) ?? m;
    const spec = now.specs[0] ?? m.spec_path;
    const file = path.join(dir, spec);
    const written = fs.existsSync(file);
    const cite = written ? veridic(dir, ["cite", "--spec", spec]) : null;
    const claims = written ? veridic(dir, ["claims", "--spec", spec]) : null;
    const findings = (report.findings ?? []).filter((f) => f.module === m.id && f.severity !== "low");
    const recorded = written ? findingsRecorded(fs.readFileSync(file, "utf8"), findings) : [];
    const n = cite?.numbers ?? cite?.summary ?? {};
    return {
      id: m.id,
      routes: m.routes,
      spec,
      written,
      requirements: n.requirements ?? 0,
      citations: n.citations ?? 0,
      resolving: n.resolving ?? 0,
      claims_support: claims?.summary?.support_rate ?? null,
      covered: now.specified ?? 0,
      findings: findings.length,
      findings_recorded: recorded.filter(Boolean).length,
    };
  });
  results.push({ repo: r.name, sha: r.sha.slice(0, 10), dir, model, modules, cost_usd: out.total_cost_usd ?? null, minutes: Math.round((Date.now() - t0) / 6000) / 10, turns: out.num_turns ?? null, error: out.is_error ? String(out.subtype ?? out.result).slice(0, 200) : null });
}

fs.writeFileSync(path.join(HERE, "specs-e2e.json"), JSON.stringify(results, null, 2) + "\n");
const rows = results.flatMap((x) => x.modules.map((m) => `| ${x.repo} | \`${m.id}\` | ${m.written ? "yes" : "**no**"} | ${m.requirements} | ${m.resolving}/${m.citations} | ${m.claims_support == null ? "—" : Math.round(m.claims_support * 100) + "%"} | ${m.covered}/${m.routes} | ${m.findings ? `${m.findings_recorded}/${m.findings}` : "—"} |`));
const total = results.reduce((n, x) => n + (x.cost_usd ?? 0), 0);
fs.writeFileSync(path.join(HERE, "SPECS-E2E.md"), [
  "# /veridic:specs end to end",
  "",
  `Claude Code (${model}) ran \`/veridic:specs\` unattended on fresh copies of ${results.length} public apps, on the ${perApp} riskiest modules of each. Each spec is scored with Veridic itself. Reproduce with \`node specs-e2e.mjs\` (it spends Claude Code usage).`,
  "",
  "| app | module | written | requirements | citations resolving | facts found at cited lines | routes covered | findings recorded as risks |",
  "|---|---|---|---|---|---|---|---|",
  ...rows,
  "",
  "| app | cost | minutes | turns | error |",
  "|---|---|---|---|---|",
  ...results.map((x) => `| ${x.repo} | $${(x.cost_usd ?? 0).toFixed(2)} | ${x.minutes} | ${x.turns ?? "—"} | ${x.error ?? "—"} |`),
  "",
  `Total: $${total.toFixed(2)}.`,
  "",
].join("\n"));
process.stdout.write(fs.readFileSync(path.join(HERE, "SPECS-E2E.md"), "utf8"));
