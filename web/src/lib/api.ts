"use client";

/**
 * Talks to the studio server through the /api rewrite. A local studio needs no
 * token; a shared one stores the user's token in this browser.
 */
const KEY = "aiemcee.token";

export function getToken(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setToken(token: string) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {}
}

/** Adds ?token= for URLs the browser loads itself: video, images, EventSource. */
export function withToken(url: string): string {
  const t = getToken();
  return t ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}` : url;
}

export function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const r = await fetch(url, {
    ...rest,
    body: json === undefined ? rest.body : JSON.stringify(json),
    headers: { "content-type": "application/json", ...authHeaders(), ...(rest.headers ?? {}) },
  });
  if (r.status === 401) window.dispatchEvent(new Event("aiemcee:login"));
  const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError((data as { error?: string }).error ?? r.statusText, r.status);
  return data as T;
}

export const projectUrl = (p: string) => `/api/projects/${encodeURIComponent(p)}`;

/* ---------------------------------------------------------------- */
/* Types mirror studio/server.mjs                                    */
/* ---------------------------------------------------------------- */
export type Project = { name: string; films: number; updated: number; poster: string | null; seconds: number | null };
export type Film = { name: string; url: string; poster: string | null; mtime: number };
export type Segment = { id: string; start: number; kind: string; transition: string | null; title: string | null; focus: number };
export type ProjectInfo = {
  name: string;
  narration: string | null;
  durations: Record<string, number> | null;
  films: Film[];
  sheets: { name: string; url: string }[];
  timeline: { fps: number; seconds: number; segments: Segment[] } | null;
};
export type Line = { id: string; text: string; title?: string; [k: string]: unknown };
export type Job = {
  id: number;
  project: string;
  stage: string;
  flags: string[];
  priority: string;
  by: string;
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  code: number | null;
  queued: number;
  started?: number;
  seconds?: number;
  tail?: string;
};
export type Comment = {
  id: string;
  author: string;
  text: string;
  at: number | null;
  scene: string | null;
  x: number | null;
  y: number | null;
  version: string | null;
  status: "open" | "resolved" | "rasa";
  createdAt: string;
  replies?: { author: string; text: string; at: string }[];
};
export type Version = { id: number; label: string; kind: string; by: string; createdAt: string; files: string[]; undone?: boolean };
export type Approval = { film: string; decision: "approved" | "changes"; note: string; by: string; role: string; at: string };
export type Share = { id: string; url: string; project: string; film: string; title: string; cta: { label: string; url: string | null } | null; leadForm: boolean; by: string; createdAt: string };
export type Analytics = {
  id: string;
  views: number;
  viewers: number;
  avgWatch: number;
  ctaClicks: number;
  leads: number;
  retention: { scene: string; title: string; reached: number }[];
};
export type Provider = { id: string; label: string; model: string; ready: boolean };
export type Me = { name: string; role: "viewer" | "approver" | "editor" | "owner" };
export type Status = { providers: Provider[]; projectsDir: string; auth: "local" | "token" };

export const ROLE_RANK = { viewer: 0, approver: 1, editor: 2, owner: 3 } as const;
export const can = (me: Me | null, role: Me["role"]) => !!me && ROLE_RANK[me.role] >= ROLE_RANK[role];

export const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
export function ago(ms: number) {
  if (!ms) return "never";
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return `${Math.floor(s / 86400 / 7)} w ago`;
}
export const when = (iso: string) => new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
