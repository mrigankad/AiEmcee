"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ArrowUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import type { Board, OpEntry } from "@/lib/boards";
import { opBoardId, summarize } from "@/lib/boards";

gsap.registerPlugin(useGSAP);

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function AgentPanel({
  board,
  ops,
  drawing,
  reply,
  busy,
  onAsk,
  readOnly,
}: {
  board: Board;
  ops: OpEntry[];
  drawing: boolean;
  reply: string;
  busy: boolean;
  onAsk: (text: string) => void;
  readOnly: boolean;
}) {
  const [text, setText] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const mine = ops.filter((o) => opBoardId(o.op) === board.id);

  // New entries stagger in from the top.
  useGSAP(
    () => {
      const el = list.current;
      if (!el) return;
      const fresh = [...el.querySelectorAll<HTMLElement>("[data-key]")].filter((n) => !seen.current.has(n.dataset.key!));
      const first = seen.current.size === 0;
      fresh.forEach((n) => seen.current.add(n.dataset.key!));
      if (first || !fresh.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(fresh, { opacity: 0, y: -8, duration: 0.35, ease: "power2.out", stagger: 0.07 });
    },
    { dependencies: [mine.length, board.id], scope: list },
  );

  function send() {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    onAsk(t);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className={`relative flex h-2 w-2 ${drawing ? "" : "opacity-60"}`}>
            {drawing && <span className="absolute inset-0 rounded-full bg-ok opacity-60 motion-safe:animate-ping" />}
            <span className={`relative h-2 w-2 rounded-full ${drawing ? "bg-ok" : "bg-line-strong"}`} />
          </span>
          <span className={drawing ? "text-ok" : "text-mute"}>{drawing ? "Drawing live" : "Idle"}</span>
        </div>
        {board.notes && <p className="mt-3 rounded-lg bg-rail p-3 text-[13px] leading-relaxed text-body">{board.notes}</p>}
        {reply && <p className="mt-3 rounded-lg border border-line p-3 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{reply}</p>}

        <div className="mt-5 mb-2 text-[11px] font-bold tracking-[0.08em] text-mute uppercase">Operations</div>
        {mine.length ? (
          <ol ref={list} className="space-y-1.5">
            {mine
              .slice()
              .reverse()
              .map((o) => (
                <li key={o.key} data-key={o.key} className="flex items-baseline gap-2 font-mono text-[12px]">
                  <span className="tabular shrink-0 text-mute">{time(o.at)}</span>
                  <span className="min-w-0 flex-1 truncate text-ink" title={summarize(o.op)}>
                    {summarize(o.op)}
                  </span>
                  <span className={`shrink-0 font-sans text-[11px] font-semibold ${o.by === "you" ? "text-mute" : "text-ok"}`}>{o.by}</span>
                </li>
              ))}
          </ol>
        ) : (
          <p className="text-[13px] text-mute">No changes to this board yet in this session.</p>
        )}
        <p className="mt-4 text-[12px] leading-relaxed text-mute">
          Every change is an op on <code className="rounded bg-sunk px-1 font-mono text-[11px] text-body">boards.json</code> for{" "}
          <code className="rounded bg-sunk px-1 font-mono text-[11px] text-body">{board.id}</code>, logged and undoable.
        </p>
      </div>
      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-xl border border-line-strong bg-page p-2 focus-within:border-kicker">
          <textarea
            rows={2}
            value={text}
            disabled={readOnly}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask the agent to change this board…"
            className="min-h-0 flex-1 resize-none bg-transparent px-1 text-[13px] text-ink placeholder:text-mute focus:outline-none"
          />
          <button type="button" aria-label="Send" onClick={send} disabled={busy || !text.trim()} className="btn-orb flex h-7 w-7 shrink-0 items-center justify-center rounded-lg disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowUp size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
