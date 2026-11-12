/**
 * Users, tokens and roles for a studio reachable beyond localhost.
 *
 *   owner     everything, including users and shares
 *   editor    edit sources, run jobs, chat with Rasa, comment
 *   approver  comment and approve or request changes
 *   viewer    read and comment
 *
 * Users live in <projects>/.aiemcee-users.json with only a SHA-256 of each
 * token. With no users file and no AIEMCEE_STUDIO_TOKEN the studio stays in
 * local mode: 127.0.0.1 only, everyone is the owner. SSO is planned, not built.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { readJson, writeJson } from "./store.mjs";

export const ROLES = ["viewer", "approver", "editor", "owner"];
const rank = (r) => ROLES.indexOf(r);
/** Constant-time comparison of two secrets. */
function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const hash = (t) => crypto.createHash("sha256").update(String(t)).digest("hex");

export function createAuth(projectsDir, envToken = null) {
  const file = path.join(projectsDir, ".aiemcee-users.json");
  const users = () => readJson(file, []);
  const mode = () => (envToken || (fs.existsSync(file) && users().length) ? "token" : "local");

  /** The user behind a request, or null. */
  function who(req, url) {
    if (mode() === "local") return { name: "you", role: "owner" };
    // ?token= only on reads: video, images and event streams cannot send headers.
    // A change always carries the Authorization header, so tokens in URLs never change anything.
    const fromQuery = req.method === "GET" ? url.searchParams.get("token") : null;
    const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1] ?? fromQuery;
    if (!bearer) return null;
    if (envToken && same(bearer, envToken)) return { name: "owner", role: "owner" };
    const h = hash(bearer);
    const u = users().find((x) => x.tokenHash === h);
    return u ? { name: u.name, role: u.role } : null;
  }

  const can = (user, role) => !!user && rank(user.role) >= rank(role);

  function addUser(name, role) {
    if (!/^[\w.@-]{1,60}$/.test(name)) throw new Error("name: letters, digits, . @ _ - only");
    if (!ROLES.includes(role)) throw new Error(`role must be one of ${ROLES.join(", ")}`);
    const token = `aie_${crypto.randomBytes(24).toString("base64url")}`;
    const all = users().filter((u) => u.name !== name);
    all.push({ name, role, tokenHash: hash(token), createdAt: new Date().toISOString() });
    writeJson(file, all);
    return token;
  }

  function removeUser(name) {
    const all = users();
    const left = all.filter((u) => u.name !== name);
    if (left.length === all.length) throw new Error(`no user ${name}`);
    writeJson(file, left);
  }

  const listUsers = () => users().map(({ tokenHash, ...u }) => u);

  return { who, can, mode, addUser, removeUser, listUsers };
}

/** The least role each API call needs. */
export function needs(method, parts) {
  const [, area, , sub] = parts;
  if (area === "users") return "owner";
  if (area === "chat" || area === "jobs") return method === "GET" ? "viewer" : "editor";
  if (area !== "projects") return "viewer";
  if (method === "GET") return "viewer";
  if (sub === "comments") return "viewer";
  if (sub === "approvals") return "approver";
  if (sub === "shares") return "owner";
  return "editor";
}
