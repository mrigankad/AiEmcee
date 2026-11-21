"use client";

import { useEffect, useRef } from "react";

import { api, ApiError, authHeaders, projectUrl, withToken } from "./api";

/* Shapes from docs/15-styles-and-boards.md */
export type BoardStatus = "draft" | "approved";
export type Props = Record<string, unknown> & { beats?: Record<string, number> };
export type Board = { id: string; template: string; style?: string; props: Props; status: BoardStatus; notes?: string; from?: string };
export type BoardsFile = { version: number; style?: string; boards: Board[] };
export type Patch = Partial<Pick<Board, "template" | "props" | "status" | "notes">> & { style?: string | null };
export type Op =
  | { op: "add"; board: Board; index?: number }
  | { op: "update"; id: string; patch: Patch }
  | { op: "remove"; id: string }
  | { op: "move"; id: string; index: number }
  | { op: "style"; style: string; clearOverrides?: boolean };

export type TemplateDef = { id: string; label: string; description: string; beats: Record<string, string>; example: Props };
export type StyleDef = { id: string; label: string; description: string; bestFor?: string; tone?: string; swatch?: string[] };
export type Catalog = { version: number; defaultStyle: string; templates: TemplateDef[]; styles: StyleDef[] };

/** The board an op touches; the film-wide style op touches none. */
export const opBoardId = (o: Op): string | null => (o.op === "add" ? o.board.id : o.op === "style" ? null : o.id);

export type OpEntry = { key: string; at: number; by: string; op: Op };

export const boardsUrl = (p: string) => `${projectUrl(p)}/boards`;

/** GET boards.json; a missing endpoint degrades to an empty file. */
export async function getBoards(p: string): Promise<{ file: BoardsFile; missing: boolean }> {
  try {
    return { file: await api<BoardsFile>(boardsUrl(p)), missing: false };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 405)) return { file: { version: 1, boards: [] }, missing: true };
    throw e;
  }
}

export async function getCatalog(): Promise<Catalog | null> {
  try {
    return await api<Catalog>("/api/styles");
  } catch {
    return null;
  }
}

export const applyOps = (p: string, ops: Op[]) => api<BoardsFile>(`${boardsUrl(p)}/ops`, { method: "POST", json: { ops } });

/** Local mirror of the server's op semantics, for optimistic updates. */
export function applyLocal(file: BoardsFile, ops: Op[]): BoardsFile {
  let boards = file.boards.slice();
  let style = file.style;
  for (const o of ops) {
    if (o.op === "style") {
      style = o.style;
      if (o.clearOverrides) boards = boards.map((b) => {
        const next = { ...b };
        delete next.style;
        return next;
      });
    } else if (o.op === "add") {
      const i = o.index ?? boards.length;
      boards.splice(Math.max(0, Math.min(i, boards.length)), 0, o.board);
    } else if (o.op === "remove") boards = boards.filter((b) => b.id !== o.id);
    else if (o.op === "move") {
      const from = boards.findIndex((b) => b.id === o.id);
      if (from < 0) continue;
      const [b] = boards.splice(from, 1);
      boards.splice(Math.max(0, Math.min(o.index, boards.length)), 0, b);
    } else if (o.op === "update") {
      boards = boards.map((b) => {
        if (b.id !== o.id) return b;
        const { style, ...rest } = o.patch;
        const next: Board = { ...b, ...rest, props: o.patch.props ? merge(b.props, o.patch.props) : b.props };
        if (style === null) delete next.style;
        else if (style !== undefined) next.style = style;
        return next;
      });
    }
  }
  return { ...file, style, boards };
}

/** Deep merge; arrays replace. */
function merge(a: Props, b: Props): Props {
  const out: Props = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const prev = out[k];
    out[k] = v && typeof v === "object" && !Array.isArray(v) && prev && typeof prev === "object" && !Array.isArray(prev) ? merge(prev as Props, v as Props) : v;
  }
  return out;
}

export function summarize(o: Op): string {
  if (o.op === "add") return `add ${o.board.template} · ${o.board.id}`;
  if (o.op === "remove") return `remove ${o.id}`;
  if (o.op === "style") return `film style → ${o.style}`;
  if (o.op === "move") return `move ${o.id} → ${String(o.index + 1).padStart(2, "0")}`;
  const keys = [...Object.keys(o.patch).filter((k) => k !== "props"), ...Object.keys(o.patch.props ?? {})];
  if (o.patch.status === "approved") return `approve ${o.id}`;
  return `update ${o.id} · ${keys.join(", ") || "props"}`;
}

export const resolveStyle = (b: Board | undefined, file: BoardsFile, cat: Catalog | null) => b?.style ?? file.style ?? cat?.defaultStyle ?? "iso-clay";

/** Stable short hash of a board, so stills re-fetch only when it changes. */
export function hashBoard(b: Board, style: string): string {
  const s = JSON.stringify([b.template, style, b.props]);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Fetches a still as an object URL. The renderer is serial and answers 503
 * while busy: retry with backoff until `signal` aborts.
 */
export async function fetchStill(p: string, id: string, t: number, v: string, signal: AbortSignal): Promise<{ url: string } | { error: string }> {
  const url = withToken(`${boardsUrl(p)}/${encodeURIComponent(id)}/still.png?t=${t.toFixed(2)}&v=${v}`);
  let error = "Preview unavailable";
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await fetch(url, { headers: authHeaders(), signal });
    if (r.ok) return { url: URL.createObjectURL(await r.blob()) };
    error = ((await r.json().catch(() => ({}))) as { error?: string }).error ?? `Preview unavailable (${r.status})`;
    if (r.status !== 503 && r.status !== 429) return { error };
    const wait = Number(r.headers.get("retry-after")) * 1000 || 600 * 1.6 ** attempt;
    await new Promise((res, rej) => {
      const tm = setTimeout(res, wait);
      signal.addEventListener("abort", () => (clearTimeout(tm), rej(new DOMException("aborted", "AbortError"))), { once: true });
    });
  }
  return { error };
}

export type BoardsEvent = { project?: string; boards?: BoardsFile; ops?: Op[]; by?: string };

/**
 * The shared app EventSource (lib/live.ts) does not listen for `boards`, so
 * this page keeps its own small one for that event type.
 */
export function useBoardsEvents(project: string, handler: (e: BoardsEvent) => void) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      es = new EventSource(withToken("/api/events"));
      es.addEventListener("boards", (e) => {
        try {
          const d = JSON.parse((e as MessageEvent).data) as BoardsEvent;
          if (!d.project || d.project === project) ref.current(d);
        } catch {}
      });
      es.onerror = () => {
        if (es?.readyState === EventSource.CLOSED) timer = setTimeout(open, 3000);
      };
    };
    open();
    return () => {
      clearTimeout(timer);
      es?.close();
    };
  }, [project]);
}

/** Sends one chat turn and streams NDJSON events back. */
export async function chatTurn(body: { project: string; provider: string; message: string }, onEvent: (e: { type: string; [k: string]: unknown }) => void) {
  const r = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify({ ...body, history: [], images: [] }),
  });
  if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line));
        } catch {}
      }
    }
  }
}

export function newId(boards: Board[], template: string): string {
  const n = boards.length + 1;
  let id = `${String(n).padStart(2, "0")}-${template}`;
  let k = 2;
  while (boards.some((b) => b.id === id)) id = `${String(n).padStart(2, "0")}-${template}-${k++}`;
  return id;
}

export const titleOf = (b: Board) => String(b.props.headline ?? b.props.title ?? b.id);
