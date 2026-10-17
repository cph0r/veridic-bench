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

