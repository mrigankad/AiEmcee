"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { Select } from "@/components/select";
import type { Board, Catalog } from "@/lib/boards";
import { titleOf } from "@/lib/boards";

import { BoardGlyph } from "./glyph";

gsap.registerPlugin(Flip, useGSAP);

export type RowState = "approved" | "drawing" | "queued" | "template";

const STATE: Record<RowState, { label: string; dot: string; text: string }> = {
  approved: { label: "Approved", dot: "bg-ok", text: "text-ok" },
  drawing: { label: "Agent drawing…", dot: "bg-kicker", text: "text-action" },
  queued: { label: "Queued", dot: "bg-line-strong", text: "text-mute" },
  template: { label: "From template", dot: "bg-motion", text: "text-motion" },
};

const ICON: Record<string, string> = { hero: "film", pipeline: "connect", stack: "data", metrics: "growth", endcard: "approve" };

export function Rail({
  film,
  boards,
  stateOf,
  selected,
  onSelect,
  onMove,
  onRemove,
  onAdd,
  catalog,
  style,
  onStyle,
  thumbs,
  readOnly,
}: {
  film: string;
  boards: Board[];
  stateOf: (b: Board) => RowState;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, index: number) => void;
  onRemove: (id: string) => void;
  onAdd: (template: string) => void;
  catalog: Catalog | null;
  style: string;
  onStyle: (s: string) => void;
  thumbs: Record<string, string>;
  readOnly: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const flip = useRef<Flip.FlipState | null>(null);
  const known = useRef<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const order = boards.map((b) => b.id).join("|");

  // Rows FLIP from where they were at the last layout; new rows slide in.
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fresh = [...el.querySelectorAll<HTMLElement>("[data-flip-id]")].filter((n) => !known.current.has(n.dataset.flipId!));
    const first = known.current.size === 0;
    known.current = new Set(boards.map((b) => b.id));
    const prev = flip.current;
    flip.current = Flip.getState(el.querySelectorAll("[data-flip-id]"));
    if (reduce) return;
    if (prev) Flip.from(prev, { targets: el.querySelectorAll("[data-flip-id]"), duration: 0.45, ease: "power3.out" });
    if (!first && fresh.length) gsap.fromTo(fresh, { opacity: 0, x: -14, scale: 0.97 }, { opacity: 1, x: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)", stagger: 0.06, clearProps: "transform" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-rail">
      <div className="px-4 pt-4 pb-3">
        <div className="truncate text-[15px] font-bold text-ink">{film}</div>
        <div className="mt-0.5 text-[11px] font-bold tracking-[0.08em] text-mute uppercase">
          Boards · {boards.length} {boards.length === 1 ? "scene" : "scenes"}
        </div>
      </div>
      <ol ref={list} className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2">
        {boards.map((b, i) => {
          const st = STATE[stateOf(b)];
          const on = b.id === selected;
          return (
            <li key={b.id} data-flip-id={b.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(b.id)}
                className={`flex w-full items-center gap-3 rounded-[10px] p-2 text-left transition-colors ${on ? "bg-page shadow-[0_0_0_1px_var(--color-line-strong),0_1px_3px_#16181d14]" : "hover:bg-sunk"}`}
              >
                <span className="relative flex aspect-video w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-[#FAFAFB] text-mute">
                  {thumbs[b.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbs[b.id]} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <BoardGlyph name={ICON[b.template] ?? "boards"} size={18} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">
                    <span className="tabular text-mute">{String(i + 1).padStart(2, "0")} · </span>
                    {titleOf(b)}
                  </span>
                  <span className={`mt-1 flex items-center gap-1.5 text-[11px] font-semibold ${st.text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                    {st.label}
                  </span>
                </span>
              </button>
              {!readOnly && (
                <span className="absolute top-1.5 right-1.5 hidden items-center gap-0.5 rounded-md bg-page/95 p-0.5 shadow-sm group-focus-within:flex group-hover:flex">
                  <IconBtn label="Move up" disabled={i === 0} onClick={() => onMove(b.id, i - 1)}>
                    <ArrowUp size={12} />
                  </IconBtn>
                  <IconBtn label="Move down" disabled={i === boards.length - 1} onClick={() => onMove(b.id, i + 1)}>
                    <ArrowDown size={12} />
                  </IconBtn>
                  <IconBtn label="Remove board" onClick={() => confirm(`Remove board ${b.id}? Its narration line goes too.`) && onRemove(b.id)}>
                    <Trash2 size={12} />
                  </IconBtn>
                </span>
              )}
            </li>
          );
        })}
        {!readOnly && (
          <li>
            {adding ? (
              <div className="grid grid-cols-2 gap-1 rounded-[10px] border border-dashed border-line-strong p-2">
                {(catalog?.templates ?? []).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => (setAdding(false), onAdd(t.id))}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] font-semibold text-body hover:bg-page hover:text-ink"
                  >
                    <BoardGlyph name={ICON[t.id] ?? "boards"} size={14} />
                    {t.label}
                  </button>
                ))}
                <button type="button" onClick={() => setAdding(false)} className="col-span-2 pt-1 text-[11px] text-mute hover:text-ink">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={!catalog}
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 rounded-[10px] px-2 py-2.5 text-[13px] font-semibold text-mute hover:bg-sunk hover:text-ink disabled:opacity-50"
              >
                <Plus size={14} /> Add board
              </button>
            )}
          </li>
        )}
      </ol>
      <div className="border-t border-line p-3">
        <div className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-mute uppercase">Style</div>
        <Select
          label="Film style"
          value={style}
          onChange={onStyle}
          className="w-full"
          menuWidth={240}
          options={(catalog?.styles ?? [{ id: style, label: style, description: "" }]).map((s) => ({
            value: s.id,
            label: s.label,
            description: s.bestFor,
            hint: <Swatch colors={s.swatch} />,
          }))}
        />
      </div>
    </aside>
  );
}

export function Swatch({ colors = [] }: { colors?: string[] }) {
  return (
    <span className="flex -space-x-1">
      {colors.map((c) => (
        <span key={c} className="h-3 w-3 rounded-full border border-page" style={{ background: c }} />
      ))}
    </span>
  );
}

function IconBtn({ label, children, ...p }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" aria-label={label} title={label} {...p} className="flex h-6 w-6 items-center justify-center rounded text-mute hover:bg-sunk hover:text-ink disabled:opacity-30">
      {children}
    </button>
  );
}
