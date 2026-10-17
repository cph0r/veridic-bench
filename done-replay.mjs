#!/usr/bin/env node
// Replay real commits through `veridic done`. For recent commits that changed
// route code and tests together (well-tested human work), check each out and run:
//   1. done, claiming the routes the commit really touched: any NOT DONE is a
//      possible false alarm (read by hand, verdicts in done-verdicts.json);
//   2. the same, with a stray planted: a no-op line inside a route the commit
//      didn't touch, which must be caught;
//   3. the same, with a planted test that asserts nothing, which must be caught.
// Writes done-replay.json and DONE-REPLAY.md. Only reads and indexes the apps.
//
//   node done-replay.mjs [--cache <dir>] [--per-repo 12]

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const cache = path.resolve(opt("--cache", path.join(os.tmpdir(), "veridic-replay")));
const perRepo = Number(opt("--per-repo", 12));
const V = process.env.VERIDIC_PATH ?? path.dirname(createRequire(import.meta.url).resolve("veridic/package.json"));
const { doneWithoutSpec } = await import(path.join(V, "core/seam.mjs"));
const { ensureIndex } = await import(path.join(V, "core/indexer.mjs"));
const { openGraph } = await import(path.join(V, "core/graph.mjs"));
const { routeInventory } = await import(path.join(V, "core/routes.mjs"));
const { footprintOf } = await import(path.join(V, "core/impact.mjs"));
const VERSION = JSON.parse(fs.readFileSync(path.join(V, "package.json"), "utf8")).version;

const REPOS = [
  { name: "hackathon-starter", url: "https://github.com/sahat/hackathon-starter" },
  { name: "juice-shop", url: "https://github.com/juice-shop/juice-shop" },
  { name: "node-express-boilerplate", url: "https://github.com/hagopj13/node-express-boilerplate" },
  { name: "express-rest-boilerplate", url: "https://github.com/danielfsousa/express-rest-boilerplate" },
  { name: "directus", url: "https://github.com/directus/directus" },
];
const git = (cwd, a) => execFileSync("git", a, { cwd, encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "ignore"] }).trim();
const TEST = /(^|\/)(__tests__|tests?|e2e|cypress)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const SOURCE = (f) => /\.[cm]?[jt]s$/.test(f) && !TEST.test(f) && !/(^|\/)(frontend|client|app\/src|docs?|scripts?|migrations?|templates?)\//.test(f) && !/\.d\.ts$/.test(f);

const results = [];
for (const r of REPOS) {
  const dir = path.join(cache, r.name);
  if (!fs.existsSync(path.join(dir, ".git"))) {
    fs.mkdirSync(cache, { recursive: true });
    execFileSync("git", ["clone", "-q", "--filter=blob:none", r.url, dir], { stdio: "ignore" });
  }
  git(dir, ["checkout", "-q", "-f", git(dir, ["rev-parse", "origin/HEAD"])]);
  // Recent non-merge commits that changed server source and tests together.

  const picked = [];
  let cur = null;
  for (const line of git(dir, ["log", "--no-merges", "-n", "600", "--format=@%H", "--name-only"]).split("\n")) {
    if (line.startsWith("@")) (cur = { sha: line.slice(1), files: [] }), picked.push(cur);
    else if (line.trim() && cur) cur.files.push(line.trim());
  }
  const candidates = picked.filter((c) => c.files.some(SOURCE) && c.files.some((f) => TEST.test(f) && /\.[cm]?[jt]s$/.test(f)) && c.files.length <= 40).slice(0, perRepo * 3);
  let done = 0;
  for (const c of candidates) {
    if (done >= perRepo) break;
    try {
      git(dir, ["checkout", "-q", "-f", c.sha]);
      git(dir, ["clean", "-qfd", "-e", ".codegraph"]);
    } catch {
      continue;
    }
    ensureIndex(dir, { build: true, sync: true, log: () => {} });
    const range = `${c.sha}^..${c.sha}`;
    let base;
    try {
      base = await doneWithoutSpec(dir, { claims: [], range });
    } catch (e) {
      continue;
    }
    const touched = [...new Set(base.files.flatMap((f) => f.routes))];
    if (!touched.length) continue; // the commit changed no route's code
    done++;
    const claimed = await doneWithoutSpec(dir, { claims: touched, range });

    // 2. Plant a stray: a no-op line inside a route the commit didn't touch.
    const g = openGraph(dir);
    const inv = routeInventory(g);
    const claimedLines = new Set(touched.flatMap((id) => inv.routes.filter((x) => x.id === id).flatMap((x) => footprintOf(g, x).map((n) => `${n.file}:${n.start}`))));
    const other = inv.routes.find((x) => !touched.includes(x.id) && x.end > x.start && !claimedLines.has(`${x.file}:${x.start}`) && !c.files.includes(x.file));
    let stray = null;
    if (other) {
      const file = path.join(dir, other.file);
      const orig = fs.readFileSync(file, "utf8");
      const lines = orig.split("\n");
      lines.splice(other.end - 1, 0, "  void 0; // planted by done-replay");
      fs.writeFileSync(file, lines.join("\n"));
      const d = await doneWithoutSpec(dir, { claims: touched, range: `${c.sha}^` });
      stray = { route: other.id, caught: d.problems.some((p) => p.startsWith("stray:") && p.includes(other.file)) };
      fs.writeFileSync(file, orig);
    }

    // 3. Plant a test that asserts nothing, next to a changed file.
    const target = c.files.find(SOURCE);
    const planted = path.join(dir, path.dirname(target), `__planted__.test.js`);
    fs.writeFileSync(planted, `const m = require("./${path.basename(target).replace(/\.[cm]?[jt]s$/, "")}");\nit("does something", () => { m; });\n`);
    const e = await doneWithoutSpec(dir, { claims: touched, range: `${c.sha}^` });
    fs.rmSync(planted);

    results.push({
      repo: r.name,
      sha: c.sha.slice(0, 10),
      subject: git(dir, ["log", "-1", "--format=%s", c.sha]).slice(0, 90),
      routes: touched.length,
      verdict: claimed.done ? "DONE" : "NOT DONE",
      problems: claimed.problems,
      stray,
      empty_test_caught: e.problems.some((p) => p.includes("asserts nothing") && p.includes("__planted__")),
    });
    process.stderr.write(`${r.name} ${c.sha.slice(0, 8)} ${claimed.done ? "DONE" : "NOT DONE"} stray:${stray ? (stray.caught ? "caught" : "MISSED") : "-"} empty:${results.at(-1).empty_test_caught ? "caught" : "MISSED"}\n`);
  }
  git(dir, ["checkout", "-q", "-f", git(dir, ["rev-parse", "origin/HEAD"])]);
}

// --- report -------------------------------------------------------------------
const verdicts = fs.existsSync(path.join(import.meta.dirname, "done-verdicts.json")) ? JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "done-verdicts.json"), "utf8")) : {};
const n = results.length;
const notDone = results.filter((x) => x.verdict === "NOT DONE");
const judged = notDone.map((x) => verdicts[`${x.repo}@${x.sha}`]?.[0]);
const falseAlarms = judged.filter((v) => v === "false alarm").length;
const realGaps = judged.filter((v) => v === "real gap").length;
const strays = results.filter((x) => x.stray);
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const md = [
  "# `veridic done` on real commits",
  "",
  `${n} recent commits from ${new Set(results.map((x) => x.repo)).size} public repos that changed route code and tests together, replayed through \`veridic done\` ${VERSION}, each claiming the routes it really touched. Reproduce with \`node done-replay.mjs\`.`,
  "",
  "| Measure | Result |",
  "|---|---|",
  `| Said DONE on real, tested commits | **${n - notDone.length} of ${n}** |`,
  `| Said NOT DONE | ${notDone.length}: ${realGaps} a real gap (a changed route no test names), ${falseAlarms} a false alarm${judged.some((v) => v == null) ? `, ${judged.filter((v) => v == null).length} not yet reviewed` : ""} |`,
  `| Planted stray edits caught | **${strays.filter((x) => x.stray.caught).length} of ${strays.length}** (${pct(strays.filter((x) => x.stray.caught).length, strays.length)}) |`,
  `| Planted tests that assert nothing caught | **${results.filter((x) => x.empty_test_caught).length} of ${n}** |`,
  "",
  "| Repo | Commit | Routes | Verdict | Why | Review |",
  "|---|---|---:|---|---|---|",
  ...results.map((x) => {
    const v = verdicts[`${x.repo}@${x.sha}`];
    return `| ${x.repo} | \`${x.sha}\` ${x.subject.replace(/\|/g, "\\|")} | ${x.routes} | ${x.verdict} | ${x.problems.map((p) => p.replace(/\|/g, "\\|").slice(0, 140)).join("<br>") || "—"} | ${v ? `${v[0]}: ${v[1]}` : x.verdict === "DONE" ? "—" : "not reviewed"} |`;
  }),
  "",
].join("\n");
fs.writeFileSync(path.join(import.meta.dirname, "done-replay.json"), JSON.stringify({ veridic: VERSION, results }, null, 2) + "\n");
fs.writeFileSync(path.join(import.meta.dirname, "DONE-REPLAY.md"), md);
process.stderr.write(`wrote DONE-REPLAY.md (${n} commits)\n`);
