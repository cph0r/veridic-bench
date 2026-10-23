// The independent route scanner: a plain text scan that shares no code with
// Veridic, used as the reference count for route discovery.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const git = (cwd, a) => execFileSync("git", a, { cwd, encoding: "utf8", maxBuffer: 64 << 20 }).trim();

/** Drop comments, keeping strings intact (`"/api/*"` is a path, not the start of a comment) and line count. */
export function stripComments(src) {
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && !(c !== "`" && src[j] === "\n")) j += src[j] === "\\" ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j;
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      out += "\n".repeat((src.slice(i, end < 0 ? src.length : end).match(/\n/g) ?? []).length);
      i = end < 0 ? src.length : end + 1;
    } else out += c;
  }
  return out;
}

/**
 * Independent route count, per file: a plain text scan that shares no code with
 * Veridic. Comments skipped; test, client and fixture files left out.
 */
export function independentScan(repo) {
  const M = "(get|post|put|patch|delete|all|options|head)";
  const direct = new RegExp(`\\b(\\w+)\\s*\\.\\s*${M}\\s*\\(\\s*(['"\`])(/[^'"\`]*|\\*)\\3`, "g");
  const chain = new RegExp(`\\.\\s*route\\s*\\(\\s*(['"\`])([^'"\`]+)\\1\\s*\\)((?:\\s*\\.\\s*${M}\\s*\\((?:[^()]|\\((?:[^()]|\\([^()]*\\))*\\))*\\))+)`, "g");
  const notServer = new Set(["axios", "request", "http", "https", "supertest", "agent", "fetch", "client", "api", "$http", "cy", "res", "response", "Promise"]);
  const per = {};
  for (const f of git(repo, ["ls-files"]).split("\n")) {
    if (!/\.[cm]?[jt]s$/.test(f) || /(test|spec)\.|\/tests?\/|__tests__|node_modules|frontend\/|client\/|cypress|\.d\.ts$|codefixes\/|\/templates\//.test(f)) continue;
    const src = stripComments(fs.readFileSync(path.join(repo, f), "utf8"));
    let n = [...src.matchAll(direct)].filter((m) => !notServer.has(m[1])).length;
    for (const m of src.matchAll(chain)) n += (m[3].match(new RegExp(`\\.\\s*${M}\\s*\\(`, "g")) ?? []).length;
    if (n) per[f] = n;
  }
  return per;
}


/**
 * Independent route count for Next.js apps, per file, sharing no code with Veridic: in each
 * folder whose package.json depends on next, the verbs an app/**\/route file exports, the
 * methods a pages/api file compares req.method with (one route when it compares none), and
 * the exports of "use server" files plus inline "use server" functions.
 */
export function independentNextScan(repo) {
  const files = git(repo, ["ls-files"]).split("\n").filter((f) => f && !/node_modules\//.test(f));
  const apps = files
    .filter((f) => /(^|\/)package\.json$/.test(f))
    .filter((f) => { try { const p = JSON.parse(fs.readFileSync(path.join(repo, f), "utf8")); return !!(p.dependencies?.next ?? p.devDependencies?.next); } catch { return false; } })
    .map((f) => path.posix.dirname(f).replace(/^\.$/, ""));
  const appOf = (f) => apps.filter((a) => a === "" || f.startsWith(`${a}/`)).sort((a, b) => b.length - a.length)[0];
  const VERBS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  const per = {};
  for (const f of files) {
    const app = appOf(f);
    if (app == null || !/\.[cm]?[jt]sx?$/.test(f) || /\.d\.ts$|(test|spec)\.|__tests__\//.test(f)) continue;
    const rel = app ? f.slice(app.length + 1) : f;
    const src = stripComments(fs.readFileSync(path.join(repo, f), "utf8"));
    let n = 0;
    if (/^(src\/)?app\/(.*\/)?route\.[cm]?[jt]sx?$/.test(rel)) {
      const verbs = new Set();
      for (const v of VERBS)
        if (new RegExp(`export\\s+(async\\s+)?function\\s+${v}\\b|export\\s+const\\s+${v}\\b|export\\s*\\{[^}]*\\b${v}\\b[^}]*\\}|export\\s+const\\s*\\{[^}]*\\b${v}\\b`).test(src)) verbs.add(v);
      n = verbs.size;
    } else if (/^(src\/)?pages\/api\//.test(rel) && !/\/_[^/]*$/.test(rel)) {
      const methods = (text) => Math.max(1, new Set([...text.matchAll(/method\s*[!=]==?\s*["'`]([A-Z]+)["'`]|case\s*["'`]([A-Z]+)["'`]\s*:/g)].map((m) => m[1] ?? m[2]).filter((v) => VERBS.includes(v))).size);
      // `export { default } from "@/…"`: the handler, and its routes, are in that file.
      const re = src.match(/export\s*\{\s*(?:default|\w+\s+as\s+default)\s*\}\s*from\s*["']([^"']+)["']/);
      if (re) {
        const base = re[1].startsWith(".") ? path.posix.join(path.posix.dirname(f), re[1]) : re[1].startsWith("@/") ? path.posix.join(app, re[1].slice(2)) : null;
        const target = base && ["", ".ts", ".tsx", ".js", "/index.ts"].map((e) => path.posix.normalize(base + e)).find((t) => /\.[jt]sx?$/.test(t) && fs.existsSync(path.join(repo, t)));
        if (target) per[target] = (per[target] ?? 0) + methods(stripComments(fs.readFileSync(path.join(repo, target), "utf8")));
        else per[f] = 1;
        continue;
      }
      n = /export\s+default\b/.test(src) ? methods(src) : 0;
    } else {
      if (/^\s*["']use server["']/.test(src)) n += [...src.matchAll(/export\s+(?:async\s+)?(?:function\s+\w+|const\s+\w+\s*=)/g)].length;
      n += [...src.matchAll(/\{\s*["']use server["']/g)].length;
    }
    if (n) per[f] = n;
  }
  return per;
}
