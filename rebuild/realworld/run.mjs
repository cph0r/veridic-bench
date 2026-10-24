#!/usr/bin/env node
// The RealWorld rebuild benchmark: the same three measures against any running API.
//
//   node rebuild/realworld/run.mjs --veridic <veridic checkout> --url <api> [--compare <other api>]
//
//   visible   checks.json: what `veridic conform` generated from the specs (signed-out,
//             another user refused, worked examples, journeys). The rebuilder saw the examples.
//   held-out  held-out.md: rows written from the rules' text alone, never shown to the rebuilder.
//   compare   twenty edge requests to both APIs: status and body shape must match.
// Each API is seeded through its own HTTP API by seed.mjs (two users, an article, a comment).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const veridic = path.resolve(arg("veridic") ?? "../veridic"), url = arg("url"), compare = arg("compare");
if (!url) { console.error("usage: run.mjs --veridic <veridic checkout> --url <api> [--compare <api>]"); process.exit(2); }
const here = path.dirname(new URL(import.meta.url).pathname);
const { conformChecksFrom } = await import(path.join(veridic, "core/conform/generate.mjs"));
const { runChecks, checkUrl } = await import(path.join(veridic, "core/conform/run.mjs"));
for (const u of [url, compare].filter(Boolean)) { const bad = checkUrl(u); if (bad) { console.error(bad); process.exit(2); } }
const seedOf = (u) => JSON.parse(execFileSync(process.execPath, [path.join(here, "seed.mjs")], { encoding: "utf8", env: { ...process.env, VERIDIC_CONFORM_URL: u } }));
const score = async (checks, u) => { const s = seedOf(u); return runChecks(checks, { url: u, users: s.users, seeds: s.seeds }); };

const visible = await score(JSON.parse(fs.readFileSync(path.join(here, "checks.json"), "utf8")), url);
const heldOut = await score(conformChecksFrom({ routes: [], specs: [{ folder: "held-out", text: fs.readFileSync(path.join(here, "held-out.md"), "utf8") }] }), url);
const byKind = {};
for (const c of JSON.parse(fs.readFileSync(path.join(here, "checks.json"), "utf8"))) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
const failedKinds = {};
for (const f of visible.failed) { const k = f.id.split(":")[0]; failedKinds[k] = (failedKinds[k] ?? 0) + 1; }
const out = {
  url,
  visible: { passed: visible.passed, checks: visible.checks, fidelity_pct: visible.fidelity_pct, by_kind: Object.fromEntries(Object.entries(byKind).map(([k, n]) => [k, `${n - (failedKinds[k] ?? 0)}/${n}`])), failed: visible.failed, not_run: visible.not_run },
  held_out: { passed: heldOut.passed, checks: heldOut.checks, fidelity_pct: heldOut.fidelity_pct, failed: heldOut.failed, not_run: heldOut.not_run },
};

if (compare) {
  const shape = (v) => (Array.isArray(v) ? [v.length ? shape(v[0]) : "[]"] : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])])) : typeof v);
  const REQ = [
    ["GET", "/api/articles?limit=abc"], ["GET", "/api/articles?offset=-1"], ["GET", "/api/articles/:slug", null, "owner"],
    ["GET", "/api/articles/no-such-0/comments"], ["POST", "/api/articles/no-such-0/comments", { comment: { body: "x" } }, "owner"],
    ["POST", "/api/articles/no-such-0/favorite", null, "owner"], ["POST", "/api/profiles/no-such-user-0/follow", null, "owner"],
    ["GET", "/api/profiles/no-such-user-0"], ["PUT", "/api/user", { user: { username: "{other}" } }, "owner"],
    ["POST", "/api/articles", { article: { title: "Hello World", description: "d", body: "b" } }, "owner"],
    ["POST", "/api/articles", {}, "owner"], ["POST", "/api/users", {}], ["POST", "/api/users/login", {}],
    ["GET", "/api/user", null, "bad"], ["GET", "/api/articles", null, "bad"], ["POST", "/api/articles/:slug/comments", { comment: { body: "c" } }, "owner"],
    ["GET", "/api/articles/:slug/comments", null, "owner"], ["DELETE", "/api/articles/:slug/comments/999999", null, "owner"],
    ["PUT", "/api/articles/:slug", { article: { title: "Renamed" } }, "owner"], ["GET", "/api/tags", null, "owner"],
  ];
  const probe = async (u) => {
    const s = seedOf(u), rows = [];
    for (const [m, p, body, as] of REQ) {
      const b = body && JSON.parse(JSON.stringify(body).replace("{other}", s.seeds.other_username));
      const headers = { "content-type": "application/json", ...(as === "bad" ? { authorization: "Token garbage" } : as ? s.users[as].headers : {}) };
      const res = await fetch(new URL(p.replace(":slug", s.seeds.slug), u), { method: m, headers, body: b ? JSON.stringify(b) : undefined });
      let j = null; try { j = await res.json(); } catch {}
      rows.push({ request: `${m} ${p}${as ? ` as ${as}` : ""}`, status: res.status, shape: JSON.stringify(shape(j)) });
    }
    return rows;
  };
  const [a, b] = [await probe(url), await probe(compare)];
  out.compare = { against: compare, same: a.filter((r, i) => r.status === b[i].status && r.shape === b[i].shape).length, requests: a.length, differences: a.map((r, i) => ({ request: r.request, here: `${r.status} ${r.shape}`, there: `${b[i].status} ${b[i].shape}` })).filter((d) => d.here !== d.there) };
}
console.log(JSON.stringify(out, null, 1));
