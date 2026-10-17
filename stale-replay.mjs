#!/usr/bin/env node
// Do citations follow the code? At an older commit, cite every route's handler
// (one requirement per route, like a spec written then). Jump forward through
// real history and ask `veridic stale` what happened to each citation, then
// check against the truth at the later commit (Veridic's own route list there,
// compared by handler text):
//   - handler unchanged but moved  -> the citation must be rewritten to exactly its new lines;
//   - handler unchanged, not moved -> left alone;
//   - handler edited or removed    -> flagged.
// Writes stale-replay.json and STALE-REPLAY.md.
//
//   node stale-replay.mjs [--cache <dir>]   (reuses done-replay's clones)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const cache = path.resolve(args.includes("--cache") ? args[args.indexOf("--cache") + 1] : path.join(os.tmpdir(), "veridic-replay"));
const V = process.env.VERIDIC_PATH ?? path.dirname(createRequire(import.meta.url).resolve("veridic/package.json"));
const { ensureIndex } = await import(path.join(V, "core/indexer.mjs"));
const { openGraph } = await import(path.join(V, "core/graph.mjs"));
const { routeInventory } = await import(path.join(V, "core/routes.mjs"));
const { staleness } = await import(path.join(V, "core/staleness.mjs"));
const VERSION = JSON.parse(fs.readFileSync(path.join(V, "package.json"), "utf8")).version;

const REPOS = ["hackathon-starter", "juice-shop", "directus", "express-rest-boilerplate"];
const STEPS = [10, 25, 50, 100, 200];
const BACK = 200; // the spec is written this many first-parent commits before the newest
const git = (cwd, a) => execFileSync("git", a, { cwd, encoding: "utf8", maxBuffer: 256 << 20, stdio: ["ignore", "pipe", "ignore"] }).trim();

function checkout(dir, sha) {
  git(dir, ["checkout", "-q", "-f", sha]);
  git(dir, ["clean", "-qfd", "-e", ".codegraph"]);
  ensureIndex(dir, { build: true, sync: true, log: () => {} });
}
const handlers = (dir) => {
  const inv = routeInventory(openGraph(dir));
  const out = new Map();
  for (const r of inv.routes) {
    if (out.has(r.id)) continue; // keep the first of duplicate ids
    const lines = fs.readFileSync(path.join(dir, r.file), "utf8").split("\n").slice(r.start - 1, r.end);
    out.set(r.id, { file: r.file, start: r.start, end: r.end, text: lines.map((l) => l.trim()).join("\n") });
  }
  return out;
};

const results = [];
for (const name of REPOS) {
  const dir = path.join(cache, name);
  if (!fs.existsSync(path.join(dir, ".git"))) continue;
  const head = git(dir, ["rev-parse", "origin/HEAD"]);
  const line = git(dir, ["rev-list", "--first-parent", "-n", String(BACK + 1), head]).split("\n").reverse(); // oldest first
  if (line.length < 20) continue;
  const c0 = line[0];
  checkout(dir, c0);
  const before = handlers(dir);
  const ids = [...before.keys()].slice(0, 80);
  const spec = ids.map((id, i) => { const h = before.get(id); return `- **FR-${String(i + 1).padStart(3, "0")}**: ${id} [evidence: ${h.file}:${h.start}-${h.end}]`; }).join("\n") + "\n";
  for (const step of STEPS.filter((s) => s < line.length)) {
    const ck = line[step];
    checkout(dir, ck);
    const after = handlers(dir);
    const report = staleness(dir, spec, { range: `${c0}..${ck}` });
    const flagged = new Set(report.stale.map((s) => s.fr));
    const fix = new Map(report.fixes.map((f) => [f.fr, f.replacement]));
    const tally = { moved: 0, moved_right: 0, still: 0, still_right: 0, changed: 0, changed_flagged: 0, gone: 0, gone_flagged: 0, wrong: [] };
    ids.forEach((id, i) => {
      const fr = `FR-${String(i + 1).padStart(3, "0")}`;
      const b = before.get(id);
      const a = after.get(id);
      if (!a) {
        tally.gone++;
        if (flagged.has(fr) || report.unresolved.some((u) => u.fr === fr)) tally.gone_flagged++;
        else tally.wrong.push(`${id}: removed, not flagged`);
        return;
      }
      if (a.text !== b.text) {
        tally.changed++;
        if (flagged.has(fr)) tally.changed_flagged++;
        else tally.wrong.push(`${id}: handler edited, not flagged`);
        return;
      }
      const now = `${a.file}:${a.start}-${a.end}`;
      if (a.file === b.file && a.start === b.start && a.end === b.end) {
        tally.still++;
        if (!flagged.has(fr) && (!fix.has(fr) || fix.get(fr) === now)) tally.still_right++;
        else tally.wrong.push(`${id}: unchanged and unmoved, but ${flagged.has(fr) ? "flagged" : `rewritten to ${fix.get(fr)}`}`);
        return;
      }
      tally.moved++;
      if (!flagged.has(fr) && fix.get(fr) === now) tally.moved_right++;
      else tally.wrong.push(`${id}: moved to ${now}, but ${flagged.has(fr) ? "flagged" : fix.has(fr) ? `rewritten to ${fix.get(fr)}` : "not rewritten"}`);
    });
    results.push({ repo: name, from: c0.slice(0, 10), to: ck.slice(0, 10), commits: step, citations: ids.length, ...tally, wrong: tally.wrong.slice(0, 12) });
    process.stderr.write(`${name} +${step}: moved ${tally.moved_right}/${tally.moved}, still ${tally.still_right}/${tally.still}, changed ${tally.changed_flagged}/${tally.changed}, gone ${tally.gone_flagged}/${tally.gone}\n`);
  }
  git(dir, ["checkout", "-q", "-f", head]);
}

const sum = (k) => results.reduce((n, r) => n + r[k], 0);
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
const md = [
  "# Do citations follow the code?",
  "",
  `At a commit ${BACK} commits back, every route handler in ${new Set(results.map((r) => r.repo)).size} public repos was cited; \`veridic stale\` ${VERSION} was then asked about those citations ${STEPS.join(", ")} commits later, and checked against the routes at that commit. Reproduce with \`node stale-replay.mjs\`.`,
  "",
  "| Citation's code… | Expected | Got it right |",
  "|---|---|---|",
  `| moved, unchanged | rewritten to exactly the new lines | **${sum("moved_right")} of ${sum("moved")}** (${pct(sum("moved_right"), sum("moved"))}) |`,
  `| didn't move or change | left alone | **${sum("still_right")} of ${sum("still")}** (${pct(sum("still_right"), sum("still"))}) |`,
  `| was edited | flagged | **${sum("changed_flagged")} of ${sum("changed")}** (${pct(sum("changed_flagged"), sum("changed"))}) |`,
  `| was removed | flagged | **${sum("gone_flagged")} of ${sum("gone")}** (${pct(sum("gone_flagged"), sum("gone"))}) |`,
  "",
  "| Repo | Commits later | Moved right | Untouched right | Edits flagged | Removals flagged | Misses |",
  "|---|---:|---|---|---|---|---|",
  ...results.map((r) => `| ${r.repo} | ${r.commits} | ${r.moved_right}/${r.moved} | ${r.still_right}/${r.still} | ${r.changed_flagged}/${r.changed} | ${r.gone_flagged}/${r.gone} | ${r.wrong.map((w) => w.replace(/\|/g, "\\|")).join("<br>") || "—"} |`),
  "",
].join("\n");
fs.writeFileSync(path.join(import.meta.dirname, "stale-replay.json"), JSON.stringify({ veridic: VERSION, results }, null, 2) + "\n");
fs.writeFileSync(path.join(import.meta.dirname, "STALE-REPLAY.md"), md);
process.stderr.write("wrote STALE-REPLAY.md\n");
