"use client";

import { Check, Copy, ExternalLink, MessageSquareReply, RotateCcw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Ctx } from "@/app/p/[project]/studio";
import {
  type Analytics,
  api,
  type Approval,
  can,
  clock,
  type Comment,
  type Job,
  type Line,
  projectUrl,
  type Share,
  type Version,
  when,
  withToken,
} from "@/lib/api";
import { useLive } from "@/lib/live";
import { useSession } from "@/lib/session";
import { toast, toastError } from "@/lib/toast";

import { Button, Card, Empty, Input, Kicker, Pill } from "../ui";

function useLoad<T>(load: () => Promise<T>, live: string[], project: string) {
  const [data, setData] = useState<T | null>(null);
  const refresh = useCallback(() => {
    load().then(setData).catch(toastError);
  }, [load]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useLive(live, (d) => {
    if (!d.project || d.project === project) refresh();
  });
  return [data, refresh] as const;
}

function parseLines(text: string | null): Line[] {
  try {
    const v = JSON.parse(text ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/* ---------------------------------------------------------------- */
/* Editor: the selected scene at a glance                            */
/* ---------------------------------------------------------------- */
export function EditorTab({ ctx }: { ctx: Ctx }) {
  const { info, scene } = ctx;
  const lines = useMemo(() => parseLines(info.narration), [info.narration]);
  const seg = info.timeline?.segments.find((s) => s.id === scene);
  const line = lines.find((l) => l.id === scene);
  const dur = scene ? info.durations?.[scene] : undefined;

  return (
    <div className="flex flex-col gap-5">
      {seg ? (
        <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
          <Card className="p-4">
            <Kicker>Scene · {seg.id}</Kicker>
            <div className="mt-1.5 text-[15px] capitalize">{seg.kind === "composition" ? "Motion graphic" : seg.kind === "video" ? "Screen capture" : seg.kind}</div>
            <div className="mt-1 text-[13px] text-mute">
              Starts {clock(seg.start)}
              {seg.transition && seg.transition !== "cut" ? ` · ${seg.transition} in` : " · cut in"}
              {seg.focus ? ` · ${seg.focus} focus move${seg.focus > 1 ? "s" : ""}` : ""}
            </div>
          </Card>
          <Card className="p-4">
            <Kicker>Title</Kicker>
            <div className="mt-1.5 text-[15px]">{seg.title ?? "No lower third"}</div>
            <div className="mt-1 text-[13px] text-mute">Change it in Direction, or ask Rasa</div>
          </Card>
          <Card className="p-4">
            <Kicker>Voice line</Kicker>
            <div className="mt-1.5 line-clamp-2 text-[15px]">{line ? `“${line.text}”` : "No line"}</div>
            <div className="mt-1 text-[13px] text-mute">{dur ? `${dur.toFixed(1)} s spoken` : "Not narrated yet"}</div>
          </Card>
        </div>
      ) : (
        <Card className="p-4 text-[14px] text-body">{info.timeline ? "Pick a scene in the strip." : "Render a draft to see the scene strip."}</Card>
      )}
      {info.sheets.length > 0 && (
        <section className="flex flex-col gap-3">
          <Kicker>Review stills</Kicker>
          {info.sheets.map((s) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={s.name} src={withToken(`${s.url}?t=${ctx.film?.mtime ?? 0}`)} alt={`Contact sheet ${s.name}`} className="w-full rounded-card border border-line" />
          ))}
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Script: one card per line                                         */
/* ---------------------------------------------------------------- */
export function ScriptTab({ ctx }: { ctx: Ctx }) {
  const { me } = useSession();
  const [lines, setLines] = useState<Line[]>(() => parseLines(ctx.info.narration));
  const [saved, setSaved] = useState(ctx.info.narration ?? "");
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState(ctx.info.narration ?? "");
  const editor = can(me, "editor");

  // Take the server's copy when it changes underneath (Rasa, undo), unless there are local edits.
  const text = `${JSON.stringify(lines, null, 2)}\n`;
  const dirty = raw ? rawText !== saved : JSON.stringify(lines) !== JSON.stringify(parseLines(saved));
  useEffect(() => {
    if (ctx.info.narration === saved || dirty) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(ctx.info.narration ?? "");
    setLines(parseLines(ctx.info.narration));
    setRawText(ctx.info.narration ?? "");
  }, [ctx.info.narration, saved, dirty]);

  const words = lines.reduce((t, l) => t + l.text.split(/\s+/).filter(Boolean).length, 0);
  const spoken = Object.values(ctx.info.durations ?? {}).reduce((a, b) => a + b, 0);

  async function save(then?: string) {
    const body = raw ? rawText : text;
    try {
      await api(`${projectUrl(ctx.project)}/files/narration.json`, { method: "PUT", json: { text: body } });
      setSaved(body);
      if (raw) setLines(parseLines(body));
      toast("Script saved");
      if (then) ctx.run(then);
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[14px] text-body">
          {lines.length} lines · {words} words · {spoken ? `${clock(spoken)} spoken` : "not narrated"} · about {Math.round(words / 2.5)} s at a calm pace
        </span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setRaw((r) => !r)}>
          {raw ? "Line view" : "JSON"}
        </Button>
        {editor && (
          <>
            <Button size="sm" disabled={!dirty} onClick={() => save()}>
              Save
            </Button>
            <Button size="sm" variant="primary" disabled={!dirty} onClick={() => save("narrate")}>
              Save and narrate
            </Button>
          </>
        )}
      </div>
      {raw ? (
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          readOnly={!editor}
          spellCheck={false}
          aria-label="narration.json"
          className="min-h-[420px] rounded-card border border-line bg-rail p-4 font-mono text-[13px] leading-relaxed outline-none focus:border-kicker"
        />
      ) : (
        lines.map((l, i) => {
          const d = ctx.info.durations?.[l.id];
          const n = l.text.split(/\s+/).filter(Boolean).length;
          return (
            <Card key={`${l.id}-${i}`} className={`p-4 ${l.id === ctx.scene ? "border-kicker" : ""}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="tabular text-[12px] font-bold text-mute">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[13px] font-bold">{l.id}</span>
                <div className="flex-1" />
                <span className="tabular text-[12px] text-mute">
                  {n} words{d ? ` · ${d.toFixed(1)} s` : ""}
                </span>
              </div>
              <textarea
                value={l.text}
                readOnly={!editor}
                onChange={(e) => setLines((ls) => ls.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
                aria-label={`Line ${l.id}`}
                className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none [field-sizing:content]"
              />
            </Card>
          );
        })
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Review: comments at the playhead, approve or request changes      */
/* ---------------------------------------------------------------- */
export function ReviewTab({ ctx }: { ctx: Ctx }) {
  const { me } = useSession();
  const base = projectUrl(ctx.project);
  const [comments, refresh] = useLoad(useCallback(() => api<Comment[]>(`${base}/comments`), [base]), ["comment"], ctx.project);
  const [approvals, refreshApprovals] = useLoad(useCallback(() => api<Approval[]>(`${base}/approvals`), [base]), ["approval"], ctx.project);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [show, setShow] = useState<"open" | "all">("open");
  const film = ctx.film?.name ?? null;
  const last = approvals?.filter((a) => a.film === film).at(-1);

  async function add() {
    if (!text.trim()) return;
    try {
      await api(`${base}/comments`, { method: "POST", json: { text, at: ctx.time, scene: ctx.scene, version: film } });
      setText("");
      refresh();
    } catch (e) {
      toastError(e);
    }
  }
  const patch = async (id: string, body: object) => {
    try {
      await api(`${base}/comments/${id}`, { method: "PATCH", json: body });
      refresh();
    } catch (e) {
      toastError(e);
    }
  };
  const decide = async (decision: "approved" | "changes") => {
    if (!film) return;
    try {
      await api(`${base}/approvals`, { method: "POST", json: { film, decision, note } });
      setNote("");
      refreshApprovals();
    } catch (e) {
      toastError(e);
    }
  };
  const { seek } = ctx;
  const list = (comments ?? []).filter((c) => show === "all" || c.status !== "resolved").slice().reverse();

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <Kicker>Approval · {film ?? "no film"}</Kicker>
          <div className="mt-1 flex items-center gap-2 text-[15px]">
            {last ? (
              <>
                <Pill tone={last.decision === "approved" ? "ok" : "bad"}>{last.decision === "approved" ? "Approved" : "Changes requested"}</Pill>
                <span className="truncate text-body">
                  by {last.by}, {when(last.at)}
                  {last.note ? ` · “${last.note}”` : ""}
                </span>
              </>
            ) : (
              <span className="text-body">Waiting for an approver</span>
            )}
          </div>
        </div>
        {can(me, "approver") && film && (
          <div className="flex flex-wrap items-center gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="w-48" />
            <Button onClick={() => decide("changes")}>
              <X size={14} /> Request changes
            </Button>
            <Button variant="primary" onClick={() => decide("approved")}>
              <Check size={14} /> Approve
            </Button>
          </div>
        )}
      </Card>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Pause on a frame and say what to change" className="flex-1" aria-label="Comment" />
        <Button type="submit" variant="dark" disabled={!text.trim()}>
          Comment at {clock(ctx.time)}
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <Kicker>{(comments ?? []).filter((c) => c.status !== "resolved").length} open</Kicker>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={() => setShow((s) => (s === "open" ? "all" : "open"))}>
          {show === "open" ? "Show resolved" : "Hide resolved"}
        </Button>
      </div>

      {list.length === 0 ? (
        <Empty>No comments here. Notes are pinned to the moment you pause on.</Empty>
      ) : (
        list.map((c) => (
          <Card key={c.id} className={`flex gap-3 p-3.5 ${c.status === "resolved" ? "opacity-55" : ""}`}>
            {c.at != null ? (
              <button type="button" onClick={() => seek(c.at!)} className="tabular h-7 shrink-0 rounded-md bg-peach px-2 text-[13px] font-bold text-action hover:bg-peach-2">
                {clock(c.at)}
              </button>
            ) : (
              <span className="w-10" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[14px]">{c.text}</div>
              <div className="mt-0.5 text-[12px] text-mute">
                {c.author} · {when(c.createdAt)}
                {c.scene ? ` · ${c.scene}` : ""}
                {c.status === "rasa" ? " · sent to Rasa" : ""}
              </div>
              {c.replies?.map((r, i) => (
                <div key={i} className="mt-1.5 border-l-2 border-line pl-2.5 text-[13px] text-body">
                  <b className="text-ink">{r.author}</b> {r.text}
                </div>
              ))}
            </div>
            <div className="flex shrink-0 items-start gap-1">
              <IconBtn
                label="Reply"
                onClick={() => {
                  const t = window.prompt("Reply");
                  if (t) patch(c.id, { reply: t });
                }}
              >
                <MessageSquareReply size={15} />
              </IconBtn>
              {can(me, "editor") && c.status !== "resolved" && (
                <IconBtn
                  label="Fix with Rasa"
                  onClick={() => {
                    patch(c.id, { status: "rasa" });
                    toast("Sent to Rasa: see the chat on the right");
                    window.dispatchEvent(
                      new CustomEvent("aiemcee:ask", { detail: `Review note${c.at != null ? ` at ${clock(c.at)}` : ""}${c.scene ? ` (scene ${c.scene})` : ""}: ${c.text}\nFix it and render a draft.` }),
                    );
                  }}
                >
                  <Sparkles size={15} />
                </IconBtn>
              )}
              <IconBtn label={c.status === "resolved" ? "Reopen" : "Resolve"} onClick={() => patch(c.id, { status: c.status === "resolved" ? "open" : "resolved" })}>
                {c.status === "resolved" ? <RotateCcw size={15} /> : <Check size={15} />}
              </IconBtn>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="grid size-7 place-items-center rounded-md text-body hover:bg-sunk hover:text-ink">
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Versions: every edit, Rasa turn and render                        */
/* ---------------------------------------------------------------- */
type DiffOp = { op: " " | "-" | "+" | "!"; line: string };

export function VersionsTab({ ctx }: { ctx: Ctx }) {
  const { me } = useSession();
  const base = projectUrl(ctx.project);
  const [versions, refresh] = useLoad(useCallback(() => api<Version[]>(`${base}/versions`), [base]), ["version"], ctx.project);
  const [label, setLabel] = useState("");
  const [diff, setDiff] = useState<{ id: number; files: Record<string, DiffOp[]> } | null>(null);
  const editor = can(me, "editor");

  const KIND_TONE = { before: "neutral", render: "ok", manual: "action", restore: "warn" } as const;

  return (
    <div className="flex flex-col gap-3">
      {editor && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api(`${base}/versions`, { method: "POST", json: { label: label.trim() || undefined } });
              setLabel("");
              refresh();
            } catch (err) {
              toastError(err);
            }
          }}
          className="flex gap-2"
        >
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name this version, e.g. sent to sales" className="flex-1" />
          <Button type="submit">Save version</Button>
        </form>
      )}
      {!versions?.length ? (
        <Empty>No versions yet. Every edit, Rasa turn and render saves one.</Empty>
      ) : (
        versions.map((v) => (
          <div key={v.id} className="flex flex-col">
            <Card className="flex items-center gap-3 px-4 py-3">
              <span className="tabular w-10 text-[13px] font-bold text-mute">#{v.id}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px]">{v.label}</div>
                <div className="text-[12px] text-mute">
                  {v.by} · {when(v.createdAt)}
                </div>
              </div>
              {v.undone && <Pill tone="warn">undone</Pill>}
              <Pill tone={KIND_TONE[v.kind as keyof typeof KIND_TONE] ?? "neutral"}>{v.kind}</Pill>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  if (diff?.id === v.id) return setDiff(null);
                  try {
                    setDiff({ id: v.id, files: await api(`${base}/versions/${v.id}/diff`) });
                  } catch (e) {
                    toastError(e);
                  }
                }}
              >
                {diff?.id === v.id ? "Hide diff" : "Diff vs now"}
              </Button>
              {editor && (
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm(`Restore #${v.id}? The current files are saved as a version first.`)) return;
                    try {
                      await api(`${base}/versions/${v.id}/restore`, { method: "POST" });
                      toast(`Restored #${v.id}`);
                      ctx.reload();
                    } catch (e) {
                      toastError(e);
                    }
                  }}
                >
                  Restore
                </Button>
              )}
            </Card>
            {diff?.id === v.id && (
              <div className="mx-2 rounded-b-card border border-t-0 border-line bg-rail p-3 font-mono text-[12px] leading-relaxed">
                {Object.keys(diff.files).length === 0 ? (
                  <div className="text-mute">#{v.id} matches the current files.</div>
                ) : (
                  Object.entries(diff.files).map(([name, ops]) => (
                    <div key={name} className="mb-2">
                      <div className="mb-1 font-bold text-ink">{name}</div>
                      {ops.map((o, i) => (
                        <div key={i} className={`whitespace-pre-wrap ${o.op === "+" ? "bg-ok-bg text-ok" : o.op === "-" ? "bg-bad-bg text-bad" : "text-body"}`}>
                          {o.op} {o.line}
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Share: public link, analytics, leads                              */
/* ---------------------------------------------------------------- */
export function ShareTab({ ctx }: { ctx: Ctx }) {
  const { me } = useSession();
  const base = projectUrl(ctx.project);
  const [shares, refresh] = useLoad(useCallback(() => api<Share[]>(`${base}/shares`), [base]), ["share", "lead"], ctx.project);
  const [title, setTitle] = useState("");
  const [cta, setCta] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [lead, setLead] = useState(false);
  const owner = can(me, "owner");
  const film = ctx.film?.name;

  return (
    <div className="flex flex-col gap-4">
      {owner && (
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <Kicker>New link · {film ?? "no film"}</Kicker>
            <div className="flex-1" />
            <span className="text-[12px] text-mute">Shows chapters and captions. The film must be approved when the studio has users.</span>
          </div>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Page title" />
          <div className="flex gap-2 max-sm:flex-col">
            <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Button label, e.g. Book a demo" className="flex-1" />
            <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://" className="flex-1" type="url" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={lead} onChange={(e) => setLead(e.target.checked)} className="size-4 accent-[#c9480a]" /> Lead form
            </label>
            <div className="flex-1" />
            <Button
              variant="primary"
              disabled={!film || film.startsWith("preview-")}
              onClick={async () => {
                try {
                  const s = await api<Share>(`${base}/shares`, {
                    method: "POST",
                    json: { film, title: title.trim() || undefined, cta: cta.trim() ? { label: cta.trim(), url: ctaUrl.trim() || null } : null, leadForm: lead },
                  });
                  await navigator.clipboard?.writeText(new URL(s.url, location.href).href).catch(() => {});
                  toast("Link created and copied");
                  setTitle("");
                  refresh();
                } catch (e) {
                  toastError(e);
                }
              }}
            >
              Create link
            </Button>
          </div>
        </Card>
      )}
      {!shares?.length ? <Empty>No links yet. Approve a film, then create one.</Empty> : shares.map((s) => <ShareRow key={s.id} s={s} base={base} owner={owner} onChange={refresh} />)}
    </div>
  );
}

function ShareRow({ s, base, owner, onChange }: { s: Share; base: string; owner: boolean; onChange: () => void }) {
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    api<Analytics>(`${base}/shares/${s.id}/analytics`).then(setA).catch(() => {});
  }, [base, s.id]);
  useLive(["share", "lead"], () => api<Analytics>(`${base}/shares/${s.id}/analytics`).then(setA).catch(() => {}));
  const link = typeof window === "undefined" ? s.url : new URL(s.url, window.location.href).href;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">{s.title}</div>
          <div className="truncate text-[13px] text-mute">
            {s.film} · by {s.by} · {when(s.createdAt)}
            {s.cta ? ` · button “${s.cta.label}”` : ""}
            {s.leadForm ? " · lead form" : ""}
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Link copied"))}>
          <Copy size={13} /> Copy
        </Button>
        <a href={s.url} target="_blank" rel="noopener" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-body hover:bg-sunk hover:text-ink">
          <ExternalLink size={13} /> Open
        </a>
        {owner && (
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              if (!window.confirm("Revoke this link? It stops working for everyone.")) return;
              try {
                await api(`${base}/shares/${s.id}`, { method: "DELETE" });
                onChange();
              } catch (e) {
                toastError(e);
              }
            }}
          >
            Revoke
          </Button>
        )}
      </div>
      {a && (
        <div className="grid grid-cols-[repeat(5,auto)_1fr] items-end gap-6 max-md:grid-cols-3">
          <Metric label="Views" value={a.views} />
          <Metric label="Viewers" value={a.viewers} />
          <Metric label="Avg watch" value={clock(a.avgWatch)} />
          <Metric label="CTA clicks" value={a.ctaClicks} />
          <Metric label="Leads" value={a.leads} />
          {a.retention.length > 0 && (
            <div className="min-w-0 max-md:col-span-3">
              <div className="mb-1 text-[12px] text-mute">Reached each scene</div>
              <div className="flex h-12 items-end gap-1">
                {a.retention.map((r) => (
                  <div key={r.scene} title={`${r.title}: ${Math.round(r.reached * 100)}%`} className="bar-orb flex-1 rounded-t" style={{ height: `${Math.max(4, r.reached * 100)}%` }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[12px] text-mute">{label}</div>
      <div className="tabular text-[22px] leading-tight font-bold">{value}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Jobs: the queue and a live log                                    */
/* ---------------------------------------------------------------- */
export function JobsTab({ ctx }: { ctx: Ctx }) {
  return <JobList project={ctx.project} watch={ctx.watch} setWatch={ctx.setWatch} />;
}

const DOT: Record<Job["status"], string> = { queued: "bg-line-strong", running: "bg-warn animate-pulse", done: "bg-ok", failed: "bg-bad", cancelled: "bg-mute" };

export function JobList({ project, watch, setWatch }: { project?: string; watch: number | null; setWatch: (id: number | null) => void }) {
  const { me } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<Job[]>([]);
  const [log, setLog] = useState("");

  const load = useCallback(() => {
    api<Job[]>("/api/jobs").then((j) => setJobs(project ? j.filter((x) => x.project === project) : j)).catch(() => {});
    if (project) api<Job[]>(`${projectUrl(project)}/jobs`).then(setHistory).catch(() => {});
  }, [project]);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["job"], load);

  // Follow one job's log over its own event stream.
  useEffect(() => {
    if (watch == null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLog("");
    const es = new EventSource(withToken(`/api/jobs/${watch}/events`));
    es.addEventListener("log", (e) => setLog((l) => (l + JSON.parse((e as MessageEvent).data)).slice(-200000)));
    es.onerror = () => es.close();
    return () => es.close();
  }, [watch]);

  // This session's jobs first, then the project's history from earlier sessions (ids restart per session).
  const rows = [...jobs, ...history.filter((h) => !jobs.some((j) => j.id === h.id && j.queued === h.queued))].slice(0, 40);
  const watched = rows.find((j) => j.id === watch);

  return (
    <div className="grid grid-cols-[minmax(0,320px)_1fr] gap-4 max-md:grid-cols-1">
      <div className="flex flex-col gap-1">
        {rows.length === 0 && <Empty>No renders yet.</Empty>}
        {rows.map((j) => (
          <button
            key={`${j.id}-${j.queued}`}
            type="button"
            onClick={() => (j.tail && !jobs.some((x) => x.id === j.id) ? (setWatch(null), setLog(j.tail)) : setWatch(j.id))}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] ${j.id === watch ? "bg-sunk" : "hover:bg-rail"}`}
          >
            <span className={`size-2 shrink-0 rounded-full ${DOT[j.status]}`} />
            <span className="min-w-0 flex-1 truncate">
              {!project && <b>{j.project} · </b>}
              {j.stage} {j.flags.join(" ")}
            </span>
            <span className="tabular shrink-0 text-mute">{j.seconds ? `${j.seconds.toFixed(1)} s` : j.status}</span>
          </button>
        ))}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {watched && (
          <div className="flex items-center gap-2 text-[13px]">
            <span className={`size-2 rounded-full ${DOT[watched.status]}`} />
            <b>
              #{watched.id} {watched.stage} {watched.flags.join(" ")}
            </b>
            <span className="text-mute">
              by {watched.by} · {watched.priority}
            </span>
            <div className="flex-1" />
            {(watched.status === "running" || watched.status === "queued") && can(me, "editor") && (
              <Button size="sm" onClick={() => api(`/api/jobs/${watched.id}/cancel`, { method: "POST" }).then(load).catch(toastError)}>
                Cancel
              </Button>
            )}
          </div>
        )}
        <pre className="max-h-[480px] min-h-[200px] scroll-dark overflow-auto rounded-card border border-line bg-ink p-4 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-[#e8e9eb]">
          {log || "Pick a job to see its log."}
        </pre>
      </div>
    </div>
  );
}
