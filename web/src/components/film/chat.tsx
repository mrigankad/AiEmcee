"use client";

import { ArrowUp, Check, Paperclip, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Ctx } from "@/app/p/[project]/studio";
import { api, authHeaders, can, clock, projectUrl, type Version, withToken } from "@/lib/api";
import { useSession } from "@/lib/session";
import { toast, toastError } from "@/lib/toast";

import { Rasa } from "../brand";
import { Select } from "../select";
import { Button } from "../ui";

type Upload = { path: string; url: string };
type Msg =
  | { kind: "user"; text: string; images: Upload[] }
  | { kind: "rasa"; text: string }
  | { kind: "step"; name: string; detail: string; ok?: boolean }
  | { kind: "error"; text: string };

const SUGGESTIONS = ["Tighten the script and render a draft", "Make the intro line punchier", "Review the cut and list what to fix"];

const TOOL_LABEL: Record<string, string> = { list_files: "Looked at files", read_file: "Read", write_file: "Edited", run_stage: "Ran" };

export function Chat({ ctx }: { ctx: Ctx }) {
  const { me, status } = useSession();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [history, setHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState("claude");
  const scroller = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  // A fresh conversation per film.
  useEffect(() => {
    setMsgs([]);
    setHistory([]);
  }, [ctx.project]);
  useEffect(() => {
    const ready = status?.providers.find((p) => p.ready);
    if (ready) setProvider(ready.id);
  }, [status]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);
  // "Fix with Rasa" from a review comment drafts the request here.
  useEffect(() => {
    const ask = (e: Event) => setInput((e as CustomEvent<string>).detail);
    window.addEventListener("aiemcee:ask", ask);
    return () => window.removeEventListener("aiemcee:ask", ask);
  }, []);

  const editor = can(me, "editor");
  const current = status?.providers.find((p) => p.id === provider);

  async function upload(f: File) {
    const data = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.readAsDataURL(f);
    });
    const name = f.name && f.name !== "image.png" ? f.name : `pasted-${Date.now()}.${(f.type.split("/")[1] || "png").replace("jpeg", "jpg")}`;
    try {
      const res = await api<Upload>(`${projectUrl(ctx.project)}/upload`, { method: "POST", json: { name, data } });
      setPending((p) => [...p, res]);
    } catch (e) {
      toastError(e);
    }
  }

  async function send(text: string) {
    text = text.trim();
    if (!text || busy) return;
    const images = pending;
    setPending([]);
    setInput("");
    setBusy(true);
    setMsgs((m) => [...m, { kind: "user", text, images }]);
    let reply = "";
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          project: ctx.project,
          provider,
          history,
          message: images.length ? `${text}\n\n(attached: ${images.map((i) => i.path).join(", ")})` : text,
          images: images.map((i) => i.path),
        }),
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
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") {
            reply += (reply ? "\n\n" : "") + ev.text;
            setMsgs((m) => [...m, { kind: "rasa", text: ev.text }]);
          } else if (ev.type === "tool") {
            const detail = ev.input?.path ?? [ev.input?.stage, ...(ev.input?.flags ?? [])].filter(Boolean).join(" ") ?? "";
            setMsgs((m) => [...m, { kind: "step", name: ev.name, detail }]);
          } else if (ev.type === "tool_result") {
            setMsgs((m) => {
              const k = m.findLastIndex((x) => x.kind === "step" && x.name === ev.name && x.ok === undefined);
              if (k < 0) return m;
              const next = m.slice();
              next[k] = { ...(next[k] as Extract<Msg, { kind: "step" }>), ok: ev.ok };
              return next;
            });
          } else if (ev.type === "job") {
            ctx.setWatch(ev.job.id);
          } else if (ev.type === "error") {
            setMsgs((m) => [...m, { kind: "error", text: ev.text }]);
          }
        }
      }
    } catch (e) {
      setMsgs((m) => [...m, { kind: "error", text: e instanceof Error ? e.message : String(e) }]);
    }
    setHistory((h) => [...h, { role: "user", text }, ...(reply ? [{ role: "assistant" as const, text: reply }] : [])]);
    setBusy(false);
    ctx.reload();
  }

  async function undo() {
    try {
      const v = await api<Version>(`${projectUrl(ctx.project)}/undo`, { method: "POST" });
      toast(`Restored the files from before “${v.label.replace(/^before:?\s*/, "")}”`);
      ctx.reload();
    } catch (e) {
      toastError(e);
    }
  }

  return (
    <aside className="flex w-[352px] shrink-0 flex-col border-l border-line max-lg:hidden">
      <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        <Rasa size={30} busy={busy} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold">Rasa</div>
          <div className="truncate text-[12px] text-mute">{busy ? "Working…" : current ? `${current.model}${current.ready ? "" : " · no key"}` : "Director"}</div>
        </div>
        {editor && (
          <button type="button" onClick={undo} title="Restore the files from before the last change" className="grid size-8 place-items-center rounded-lg text-body hover:bg-sunk hover:text-ink">
            <RotateCcw size={15} />
          </button>
        )}
        <Select
          label="Model"
          size="sm"
          tone="motion"
          align="right"
          value={provider}
          onChange={setProvider}
          options={(status?.providers ?? [{ id: "claude", label: "Claude", model: "", ready: false }]).map((p) => ({
            value: p.id,
            label: p.label,
            description: p.model,
            hint: p.ready ? <span className="text-ok">ready</span> : "no key",
          }))}
        />
      </header>

      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        {msgs.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 pt-10 text-center">
            <Rasa size={56} />
            <p className="text-[15px] font-bold">Direct {ctx.project}</p>
            <p className="text-[13px] text-body">
              Ask for changes to the script, the scenes or the cut. Paste a screenshot to show what you mean. Every change can be undone in one step.
            </p>
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.kind === "user")
            return (
              <div key={i} className="ml-6 self-end rounded-xl bg-sunk px-3.5 py-2.5 text-[14px] whitespace-pre-wrap">
                {m.text}
                {m.images.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.images.map((img) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={img.path} src={withToken(img.url)} alt="" className="h-14 rounded-md border border-line" />
                    ))}
                  </div>
                )}
              </div>
            );
          if (m.kind === "rasa") return <div key={i} className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.text}</div>;
          if (m.kind === "step")
            return (
              <div key={i} className="flex items-center gap-2 text-[13px] text-body">
                <span className={`grid size-4 place-items-center rounded-full ${m.ok === undefined ? "animate-pulse bg-peach-2" : m.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>
                  {m.ok === undefined ? null : m.ok ? <Check size={10} strokeWidth={3} /> : <X size={10} strokeWidth={3} />}
                </span>
                <span>
                  {TOOL_LABEL[m.name] ?? m.name} <span className="text-ink">{m.detail}</span>
                </span>
              </div>
            );
          return (
            <div key={i} className="rounded-lg bg-bad-bg px-3 py-2 text-[13px] text-bad">
              {m.text}
            </div>
          );
        })}
      </div>

      {editor ? (
        <div className="flex flex-col gap-2.5 border-t border-line p-3">
          {msgs.length === 0 && (
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="h-7 rounded-full border border-line px-3 text-[13px] text-body hover:border-line-strong hover:text-ink">
                  {s}
                </button>
              ))}
              {ctx.scene && (
                <button type="button" onClick={() => setInput(`On scene ${ctx.scene} (${clock(ctx.time)}): `)} className="h-7 rounded-full border border-line px-3 text-[13px] text-body hover:border-line-strong hover:text-ink">
                  About scene {ctx.scene}…
                </button>
              )}
            </div>
          )}
          {pending.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pending.map((p) => (
                <span key={p.path} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={withToken(p.url)} alt="" className="h-12 rounded-md border border-line" />
                  <button type="button" aria-label="Remove image" onClick={() => setPending((xs) => xs.filter((x) => x !== p))} className="absolute -top-1.5 -right-1.5 grid size-4 place-items-center rounded-full bg-ink text-white">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2 rounded-xl border border-line px-2 py-1.5 focus-within:border-kicker"
          >
            <button type="button" onClick={() => file.current?.click()} aria-label="Attach image" className="grid size-8 shrink-0 place-items-center rounded-lg text-mute hover:text-ink">
              <Paperclip size={16} />
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={async (e) => {
                for (const f of Array.from(e.target.files ?? [])) await upload(f);
                e.target.value = "";
              }}
            />
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              onPaste={async (e) => {
                for (const item of Array.from(e.clipboardData.items)) {
                  if (item.type.startsWith("image/")) {
                    e.preventDefault();
                    const f = item.getAsFile();
                    if (f) await upload(f);
                  }
                }
              }}
              rows={1}
              placeholder="Ask Rasa to change the film…"
              aria-label="Message Rasa"
              className="max-h-40 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-[14px] outline-none placeholder:text-mute [field-sizing:content]"
            />
            <Button type="submit" variant="dark" size="sm" disabled={busy || !input.trim()} aria-label="Send" className="size-8 !px-0">
              <ArrowUp size={16} />
            </Button>
          </form>
        </div>
      ) : (
        <p className="border-t border-line p-4 text-[13px] text-mute">Rasa needs the editor role. You can still comment in Review.</p>
      )}
    </aside>
  );
}
