#!/usr/bin/env node
// Does `veridic impact` point at the right tests? For recent commits that changed
// server code and tests together, the tests the author changed are the ground truth
// for "the tests this change needs". At each commit, ask Veridic which tests reach
// the changed code, and measure:
//   - recall: how many of the author's tests it names;
//   - focus: what share of the whole test suite it selects (smaller runs faster).
// Writes impact-history.json and IMPACT.md. Reuses done-replay's clones.
//
//   node impact-history.mjs [--cache <dir>] [--per-repo 15]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const cache = path.resolve(opt("--cache", path.join(os.tmpdir(), "veridic-replay")));
const perRepo = Number(opt("--per-repo", 15));
const V = process.env.VERIDIC_PATH ?? path.dirname(createRequire(import.meta.url).resolve("veridic/package.json"));
const { ensureIndex } = await import(path.join(V, "core/indexer.mjs"));
const { testsReaching, testFilesOf } = await import(path.join(V, "core/tests.mjs"));
const VERSION = JSON.parse(fs.readFileSync(path.join(V, "package.json"), "utf8")).version;

const REPOS = ["hackathon-starter", "juice-shop", "node-express-boilerplate", "express-rest-boilerplate", "directus"];
const git = (cwd, a) => execFileSync("git", a, { cwd, encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "ignore"] }).trim();
const TEST = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const E2E = /(^|\/)(e2e[\w-]*|cypress|playwright)\//;
// A ground-truth test is a real test file (with test cases), on the server side like the code.
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const CLIENT = /(^|\/)(frontend|client|app\/src)\//;
const SOURCE = (f) => /\.[cm]?[jt]s$/.test(f) && !TEST.test(f) && !E2E.test(f) && !/(^|\/)(frontend|client|app\/src|docs?|scripts?|migrations?|templates?)\//.test(f) && !/\.d\.ts$/.test(f);

const results = [];
for (const name of REPOS) {
  const dir = path.join(cache, name);
  if (!fs.existsSync(path.join(dir, ".git"))) continue;
  const head = git(dir, ["rev-parse", "origin/HEAD"]);
  const commits = [];
  let cur = null;
  for (const line of git(dir, ["log", "--no-merges", "-n", "800", "--format=@%H", "--name-only", "--diff-filter=AM"]).split("\n")) {
    if (line.startsWith("@")) (cur = { sha: line.slice(1), files: [] }), commits.push(cur);
    else if (line.trim() && cur) cur.files.push(line.trim());
  }
  // Unit/integration tests only: end-to-end suites drive the whole app and reach everything.
  const picked = commits.filter((c) => c.files.some(SOURCE) && c.files.some((f) => TEST_FILE.test(f) && !E2E.test(f) && !CLIENT.test(f)) && c.files.length <= 40).slice(0, perRepo);
  for (const c of picked) {
    try {
      git(dir, ["checkout", "-q", "-f", c.sha]);
      git(dir, ["clean", "-qfd", "-e", ".codegraph"]);
    } catch {
      continue;
    }
    ensureIndex(dir, { build: true, sync: true, log: () => {} });
    const source = c.files.filter(SOURCE).filter((f) => fs.existsSync(path.join(dir, f)));
    const truth = c.files.filter((f) => TEST_FILE.test(f) && !E2E.test(f) && !CLIENT.test(f) && fs.existsSync(path.join(dir, f)));
    if (!source.length || !truth.length) continue;
    const reach = testsReaching(dir, source);
    const predicted = new Set([...reach.values()].flat().map((t) => t.file));
    const all = testFilesOf(dir).filter((f) => !E2E.test(f));
    const hit = truth.filter((t) => predicted.has(t));
    results.push({ repo: name, sha: c.sha.slice(0, 10), subject: git(dir, ["log", "-1", "--format=%s", c.sha]).slice(0, 80), source: source.length, truth: truth.length, found: hit.length, selected: predicted.size, suite: all.length, missed: truth.filter((t) => !predicted.has(t)) });
    process.stderr.write(`${name} ${c.sha.slice(0, 8)}: ${hit.length}/${truth.length} of the author's tests, selecting ${predicted.size}/${all.length}\n`);
  }
  git(dir, ["checkout", "-q", "-f", head]);
}

const sum = (k) => results.reduce((n, r) => n + r[k], 0);
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const focus = results.length ? Math.round((results.reduce((n, r) => n + r.selected / Math.max(1, r.suite), 0) / results.length) * 1000) / 10 : null;
const md = [
  "# Does `veridic impact` find the tests a change needs?",
  "",
  `${results.length} recent commits from ${new Set(results.map((r) => r.repo)).size} public repos that changed server code and its tests together. The tests the author changed are the ground truth; Veridic ${VERSION} was asked which tests reach the changed code. End-to-end suites are left out on both sides (they reach everything). Reproduce with \`node impact-history.mjs\`.`,
  "",
  "| Measure | Result |",
  "|---|---|",
  `| Author's tests that Veridic named | **${sum("found")} of ${sum("truth")}** (${pct(sum("found"), sum("truth"))}) |`,
  `| Share of the test suite it selects, on average | **${focus}%** |`,
  "",
  "| Repo | Commit | Author's tests found | Selected / suite | Missed |",
  "|---|---|---|---|---|",
  ...results.map((r) => `| ${r.repo} | \`${r.sha}\` ${r.subject.replace(/\|/g, "\\|")} | ${r.found}/${r.truth} | ${r.selected}/${r.suite} | ${r.missed.map((m) => `\`${m}\``).join("<br>") || "—"} |`),
  "",
].join("\n");
fs.writeFileSync(path.join(import.meta.dirname, "impact-history.json"), JSON.stringify({ veridic: VERSION, results }, null, 2) + "\n");
fs.writeFileSync(path.join(import.meta.dirname, "IMPACT.md"), md);
process.stderr.write("wrote IMPACT.md\n");
