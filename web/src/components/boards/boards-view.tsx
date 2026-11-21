"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Topbar } from "@/components/topbar";
import { api, can, type ProjectInfo, projectUrl } from "@/lib/api";
import type { Board, BoardsFile, Catalog, Op, OpEntry, Patch } from "@/lib/boards";
import { applyLocal, applyOps, chatTurn, opBoardId, fetchStill, getBoards, getCatalog, hashBoard, newId, resolveStyle, useBoardsEvents } from "@/lib/boards";
import { useSession } from "@/lib/session";
import { toastError } from "@/lib/toast";

import { AgentPanel } from "./agent";
import { Canvas } from "./canvas";
import { Inspector } from "./inspector";
import { Rail, type RowState } from "./rail";

let seq = 0;
const key = () => `${Date.now()}-${seq++}`;

/** Where the agent cursor goes for an op: a stable spot per changed field. */
const SPOTS: Record<string, [number, number]> = {
  kicker: [0.12, 0.22], headline: [0.2, 0.34], sub: [0.2, 0.48], glyph: [0.7, 0.5], mark: [0.5, 0.4], title: [0.5, 0.6], tagline: [0.5, 0.7],
  steps: [0.5, 0.62], layers: [0.62, 0.55], metrics: [0.5, 0.62], highlight: [0.62, 0.45], template: [0.5, 0.5], style: [0.85, 0.15],
};
function cursorFor(o: Op): { label: string; x: number; y: number } {
  if (o.op !== "update") return { label: `Agent · ${o.op === "add" ? "adding board" : o.op === "move" ? "moving board" : "removing"}`, x: 0.5, y: 0.5 };
  const field = Object.keys(o.patch.props ?? {})[0] ?? Object.keys(o.patch)[0] ?? "template";
  const [x, y] = SPOTS[field] ?? [0.5, 0.5];
  const glyph = (o.patch.props?.glyph ?? o.patch.props?.mark) as string | undefined;
  return { label: `Agent · placing ${glyph ? glyph[0].toUpperCase() + glyph.slice(1) : field}`, x, y };
}

export function BoardsView({ project }: { project: string }) {
  const { me, status } = useSession();
  const readOnly = !!me && !can(me, "editor");
  const [file, setFile] = useState<BoardsFile | null>(null);
  const [missing, setMissing] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [picked, setSelected] = useState<string | null>(null);
  const [t, setT] = useState(3);
  const [log, setLog] = useState<OpEntry[]>([]);
  const [drawing, setDrawing] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<{ label: string; x: number; y: number; key: string; id: string } | null>(null);
  const [still, setStill] = useState<string | null>(null);
  // What the server has saved. Previews render from the server's copy, so they key on this,
  // never on the optimistic local edit (which would fetch the old frame before the save lands).
  const [saved, setSaved] = useState<BoardsFile | null>(null);
  const [stillDone, setStillDone] = useState<{ key: string; error: string | null }>({ key: "", error: null });
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [chat, setChat] = useState({ busy: false, reply: "" });
  const [tab, setTab] = useState<"agent" | "board">("agent");

  /* ---------- load ---------- */
  useEffect(() => {
    let live = true;
    getBoards(project)
      .then(({ file, missing }) => {
        if (!live) return;
        setFile(file);
        setSaved(file);
        setMissing(missing);
        setSelected((s) => s ?? file.boards[0]?.id ?? null);
      })
      .catch((e) => (toastError(e), setFile({ version: 1, boards: [] })));
    getCatalog().then((c) => live && setCatalog(c));
    api<ProjectInfo>(projectUrl(project))
      .then((p) => live && setDurations(p.durations ?? {}))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [project]);

  /* ---------- writes: optimistic, debounced per board ---------- */
  const pending = useRef<Map<string, Patch>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sent = useRef<Set<string>>(new Set());

  const post = useCallback(
    async (ops: Op[]) => {
      if (!ops.length) return;
      const stamp = JSON.stringify(ops);
      sent.current.add(stamp);
      setLog((l) => [...l, ...ops.map((op) => ({ key: key(), at: Date.now(), by: "you", op }))]);
      try {
        const next = await applyOps(project, ops);
        if (next?.boards) {
          setSaved(next);
          setFile(pending.current.size ? applyLocal(next, pendingOps()) : next);
        }
      } catch (e) {
        toastError(e);
        getBoards(project).then(({ file }) => (setFile(file), setSaved(file))).catch(() => {});
      }
    },
    [project],
  );

  function pendingOps(): Op[] {
    return [...pending.current].map(([id, patch]) => ({ op: "update" as const, id, patch }));
  }

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const ops = pendingOps();
    pending.current.clear();
    void post(ops);
  }, [post]);

  useEffect(() => () => flush(), [flush]);

  function run(ops: Op[], debounce = false) {
    if (readOnly) return;
    setFile((f) => (f ? applyLocal(f, ops) : f));
    if (!debounce) return void post(ops);
    for (const o of ops) {
      if (o.op !== "update") continue;
      const prev = pending.current.get(o.id) ?? {};
      pending.current.set(o.id, { ...prev, ...o.patch, props: o.patch.props || prev.props ? { ...prev.props, ...o.patch.props } : undefined });
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  }

  /* ---------- live ops from the agent (and other tabs) ---------- */
  useBoardsEvents(project, (e) => {
    const stamp = JSON.stringify(e.ops ?? []);
    const ours = sent.current.has(stamp);
    if (ours) sent.current.delete(stamp);
    if (e.boards) {
      setSaved(e.boards);
      setFile(pending.current.size ? applyLocal(e.boards, pendingOps()) : e.boards);
    }
    if (ours || !e.ops?.length) return;
    const by = e.by ?? "agent";
    const now = Date.now();
    setLog((l) => [...l, ...e.ops!.map((op) => ({ key: key(), at: now, by, op }))].slice(-200));
    const touched = e.ops.map(opBoardId).filter((id): id is string => !!id);
    setDrawing((d) => ({ ...d, ...Object.fromEntries(touched.map((id) => [id, now])) }));
    const last = e.ops[e.ops.length - 1];
    const id = opBoardId(last);
    if (!id) return; // a film-wide style change has no spot on the board to point at
    setCursor({ ...cursorFor(last), key: key(), id });
  });

  // "Agent drawing…" fades 4 s after the last op on a board.
  useEffect(() => {
    if (!Object.keys(drawing).length) return;
    const id = setTimeout(() => {
      const now = Date.now();
      setDrawing((d) => Object.fromEntries(Object.entries(d).filter(([, at]) => now - at < 4000)));
      setCursor((c) => (c && now - Number(c.key.split("-")[0]) > 4000 ? null : c));
    }, 1000);
    return () => clearTimeout(id);
  }, [drawing]);

  /* ---------- derived ---------- */
  const boards = useMemo(() => file?.boards ?? [], [file]);
  const selected = picked && boards.some((b) => b.id === picked) ? picked : (boards[0]?.id ?? null);
  const index = boards.findIndex((b) => b.id === selected);
  const board: Board | undefined = boards[index];
  const tpl = catalog?.templates.find((x) => x.id === board?.template);
  const filmStyle = useMemo(() => {
    if (!file) return "iso-clay";
    const styles = new Set(file.boards.map((b) => b.style ?? ""));
    return styles.size === 1 && [...styles][0] ? [...styles][0] : resolveStyle(undefined, file, catalog);
  }, [file, catalog]);
  const style = file ? resolveStyle(board, file, catalog) : filmStyle;
  const seconds = Math.max(1, (board && durations[board.id]) || 6);
  const savedBoard = saved?.boards.find((b) => b.id === board?.id);
  const version = savedBoard && saved ? hashBoard(savedBoard, resolveStyle(savedBoard, saved, catalog)) : "";


  const stateOf = (b: Board): RowState => {
    if (drawing[b.id]) return "drawing";
    if (b.status === "approved") return "approved";
    const ex = catalog?.templates.find((x) => x.id === b.template)?.example;
    if (ex && Object.entries(ex).every(([k, v]) => JSON.stringify(b.props[k]) === JSON.stringify(v))) return "template";
    return "queued";
  };

  /* ---------- still preview: debounced, cancellable, 503-tolerant ---------- */
  const tSettled = useDebounced(t, 220);
  const vSettled = useDebounced(version, 700);
  const stillKey = `${board?.id}|${tSettled}|${vSettled}`;
  const stillState = { loading: !missing && stillDone.key !== stillKey, error: stillDone.key === stillKey ? stillDone.error : null };
  useEffect(() => {
    if (!board || missing) return;
    const ctl = new AbortController();
    const k = stillKey;
    fetchStill(project, board.id, tSettled, vSettled, ctl.signal)
      .then((res) => {
        if (ctl.signal.aborted) return;
        if ("error" in res) return setStillDone({ key: k, error: res.error });
        const url = res.url;
        setStill((old) => (old && !Object.values(thumbs).includes(old) && URL.revokeObjectURL(old), url));
        setThumbs((th) => ({ ...th, [board.id]: url }));
        setStillDone({ key: k, error: null });
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setStillDone({ key: k, error: "Preview unavailable" });
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, board?.id, tSettled, vSettled, missing]);

  function select(id: string) {
    flush();
    setSelected(id);
    setStill(thumbs[id] ?? null);
  }

  async function ask(text: string) {
    if (!board) return;
    setChat({ busy: true, reply: "" });
    const provider = status?.providers.find((p) => p.ready)?.id ?? "claude";
    const message = `On the Boards page, about board "${board.id}" (template ${board.template}, style ${style}) in boards.json: ${text}\n\nChange only this board, using the boards_apply tool.`;
    try {
      await chatTurn({ project, provider, message }, (ev) => {
        if (ev.type === "text") setChat((c) => ({ ...c, reply: (c.reply ? c.reply + "\n\n" : "") + String(ev.text) }));
        if (ev.type === "error") setChat((c) => ({ ...c, reply: String(ev.text) }));
      });
    } catch (e) {
      toastError(e);
    } finally {
      setChat((c) => ({ ...c, busy: false }));
    }
  }

  const crumbs = [{ label: "Films", href: "/" }, { label: project, href: `/p/${encodeURIComponent(project)}` }, { label: "Boards" }];

  return (
    <div className="flex h-dvh min-h-0 flex-1 flex-col">
      <Topbar crumbs={crumbs}>{missing && <span className="text-[12px] text-warn">Boards API not available on this studio yet</span>}</Topbar>
      <div className="flex min-h-0 flex-1">
        <Rail
          film={project}
          boards={boards}
          stateOf={stateOf}
          selected={selected}
          onSelect={select}
          onMove={(id, i) => run([{ op: "move", id, index: i }])}
          onRemove={(id) => run([{ op: "remove", id }])}
          onAdd={(template) => {
            const ex = catalog?.templates.find((x) => x.id === template)?.example ?? {};
            const id = newId(boards, template);
            run([{ op: "add", board: { id, template, props: structuredClone(ex), status: "draft" } }]);
            setSelected(id);
            setStill(null);
          }}
          catalog={catalog}
          style={filmStyle}
          onStyle={(s) => {
            // The film style; boards follow it unless they override it in the inspector.
            run([{ op: "style", style: s, clearOverrides: true }]);
          }}
          thumbs={thumbs}
          readOnly={readOnly}
        />
        {file === null ? (
          <div className="flex flex-1 items-center justify-center bg-[#FAFAFB] text-sm text-mute">Loading boards…</div>
        ) : !board ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 bg-[#FAFAFB] text-center">
            <p className="text-[15px] font-semibold text-ink">No boards yet</p>
            <p className="max-w-sm text-sm text-mute">Add one from a template in the rail, or ask Rasa to draw the film as boards.</p>
          </div>
        ) : (
          <>
            <Canvas
              board={board}
              index={index}
              tpl={tpl}
              seconds={seconds}
              t={Math.min(t, seconds)}
              onT={setT}
              still={still}
              loading={stillState.loading}
              error={missing ? "Preview needs the boards API" : stillState.error}
              cursor={cursor && cursor.id === board.id ? cursor : null}
              onApprove={() => run([{ op: "update", id: board.id, patch: { status: "approved" } }])}
              readOnly={readOnly}
            />
            <aside className="flex w-[320px] shrink-0 flex-col border-l border-line bg-page">
              <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-3" role="tablist">
                {(["agent", "board"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={tab === k}
                    onClick={() => setTab(k)}
                    className={`h-8 rounded-lg px-3 text-[13px] font-semibold ${tab === k ? "bg-sunk text-ink" : "text-mute hover:text-ink"}`}
                  >
                    {k === "agent" ? "Agent" : "Edit board"}
                  </button>
                ))}
              </div>
              {tab === "agent" ? (
                <AgentPanel board={board} ops={log} drawing={!!drawing[board.id] || chat.busy} reply={chat.reply} busy={chat.busy} onAsk={ask} readOnly={readOnly} />
              ) : (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <Inspector board={board} catalog={catalog} filmStyle={filmStyle} onPatch={(patch) => run([{ op: "update", id: board.id, patch }], true)} readOnly={readOnly} />
                </div>
              )}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

