"use client";

import { Plus, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Select } from "@/components/select";
import type { Board, Catalog, Patch, Props } from "@/lib/boards";

import { BoardGlyph, GLYPH_NAMES } from "./glyph";
import { Swatch } from "./rail";

type Item = Record<string, unknown>;
const LIMITS: Record<string, { key: string; min: number; max: number; blank: Item }> = {
  pipeline: { key: "steps", min: 3, max: 6, blank: { label: "Step", hint: "", glyph: "fast" } },
  stack: { key: "layers", min: 2, max: 5, blank: { label: "Layer", hint: "", glyph: "data" } },
  metrics: { key: "metrics", min: 1, max: 4, blank: { value: 10, suffix: "", label: "label" } },
};

/** Edits one board. Every change goes through `onPatch`; the page debounces the POST. */
export function Inspector({
  board,
  catalog,
  filmStyle,
  onPatch,
  readOnly,
}: {
  board: Board;
  catalog: Catalog | null;
  filmStyle: string;
  onPatch: (patch: Patch) => void;
  readOnly: boolean;
}) {
  const p = board.props;
  const set = (k: string, v: unknown) => onPatch({ props: { [k]: v } });
  const list = LIMITS[board.template];
  const items = list ? ((p[list.key] as Item[] | undefined) ?? []) : [];
  const setItems = (next: Item[]) => list && set(list.key, next);
  const setItem = (i: number, k: string, v: unknown) => setItems(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)));
  const style = catalog?.styles.find((s) => s.id === filmStyle);

  return (
    <fieldset disabled={readOnly} className="space-y-4 p-4">
      <Field label="Template">
        <Select
          label="Template"
          value={board.template}
          onChange={(t) => {
            // A template change brings that template's example props for anything missing.
            const ex = catalog?.templates.find((x) => x.id === t)?.example ?? {};
            onPatch({ template: t, props: { ...ex, ...pick(p, ["kicker", "headline"]) } });
          }}
          className="w-full"
          options={(catalog?.templates ?? [{ id: board.template, label: board.template, description: "" }]).map((t) => ({ value: t.id, label: t.label, description: t.description }))}
        />
      </Field>
      <Field label="Style">
        <Select
          label="Style override"
          value={board.style ?? ""}
          onChange={(s) => onPatch({ style: s || null })}
          className="w-full"
          menuWidth={250}
          options={[
            { value: "", label: `Film default${style ? ` · ${style.label}` : ""}`, hint: <Swatch colors={style?.swatch} /> },
            ...(catalog?.styles ?? []).map((s) => ({ value: s.id, label: s.label, hint: <Swatch colors={s.swatch} /> })),
          ]}
        />
      </Field>

      <div className="h-px bg-line" />

      {board.template !== "endcard" && (
        <>
          <Text label="Kicker" value={p.kicker} onChange={(v) => set("kicker", v)} />
          <Text label="Headline" value={p.headline} onChange={(v) => set("headline", v)} area />
        </>
      )}
      {board.template === "hero" && (
        <>
          <Text label="Sub" value={p.sub} onChange={(v) => set("sub", v)} area />
          <Field label="Glyph">
            <GlyphPick value={String(p.glyph ?? "")} onChange={(g) => set("glyph", g)} />
          </Field>
        </>
      )}
      {board.template === "endcard" && (
        <>
          <Text label="Kicker" value={p.kicker} onChange={(v) => set("kicker", v)} />
          <Text label="Title" value={p.title} onChange={(v) => set("title", v)} />
          <Text label="Tagline" value={p.tagline} onChange={(v) => set("tagline", v)} />
          <Field label="Mark">
            <GlyphPick value={String(p.mark ?? "")} onChange={(g) => set("mark", g)} />
          </Field>
        </>
      )}

      {list && (
        <Field label={`${list.key} · ${items.length} of ${list.min}–${list.max}`}>
          <ol className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className={`rounded-lg border bg-page p-2 ${board.template === "stack" && p.highlight === i ? "border-kicker" : "border-line"}`}>
                <div className="flex items-center gap-1.5">
                  <span className="tabular w-5 text-[11px] font-bold text-mute">{i + 1}</span>
                  {board.template === "metrics" ? (
                    <>
                      <input aria-label="Value" type="number" step="any" value={Number(it.value ?? 0)} onChange={(e) => setItem(i, "value", Number(e.target.value))} className={`${INPUT} w-20`} />
                      <input aria-label="Suffix" value={String(it.suffix ?? "")} onChange={(e) => setItem(i, "suffix", e.target.value)} placeholder="%" className={`${INPUT} w-12`} />
                    </>
                  ) : (
                    <GlyphPick compact value={String(it.glyph ?? "")} onChange={(g) => setItem(i, "glyph", g)} />
                  )}
                  <input aria-label="Label" value={String(it.label ?? "")} onChange={(e) => setItem(i, "label", e.target.value)} className={`${INPUT} min-w-0 flex-1`} />
                  <button
                    type="button"
                    aria-label="Remove"
                    disabled={items.length <= list.min}
                    onClick={() => setItems(items.filter((_, j) => j !== i))}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-mute hover:bg-sunk hover:text-ink disabled:opacity-30"
                  >
                    <X size={13} />
                  </button>
                </div>
                {board.template !== "metrics" && (
                  <input aria-label="Hint" value={String(it.hint ?? "")} placeholder="Hint" onChange={(e) => setItem(i, "hint", e.target.value)} className={`${INPUT} mt-1.5 w-full`} />
                )}
                {board.template === "stack" && (
                  <label className="mt-1.5 flex items-center gap-1.5 text-[12px] text-body">
                    <input type="radio" name="highlight" checked={p.highlight === i} onChange={() => set("highlight", i)} className="accent-[var(--color-action)]" /> Lit layer
                  </label>
                )}
              </li>
            ))}
          </ol>
          <button
            type="button"
            disabled={items.length >= list.max}
            onClick={() => setItems([...items, { ...list.blank }])}
            className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-action hover:text-action-deep disabled:text-mute disabled:opacity-60"
          >
            <Plus size={13} /> Add {list.key.replace(/s$/, "")}
          </button>
        </Field>
      )}

      <div className="h-px bg-line" />
      <Text label="Notes" value={board.notes} onChange={(v) => onPatch({ notes: v })} area />
    </fieldset>
  );
}

const INPUT = "h-7 rounded-md border border-line bg-page px-2 text-[13px] text-ink focus:border-kicker focus:outline-none";

function pick(o: Props, keys: string[]) {
  return Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold tracking-[0.08em] text-mute uppercase">{label}</div>
      {children}
    </div>
  );
}

function Text({ label, value, onChange, area }: { label: string; value: unknown; onChange: (v: string) => void; area?: boolean }) {
  const cls = "w-full rounded-lg border border-line bg-page px-3 text-sm text-ink placeholder:text-mute focus:border-kicker focus:outline-none";
  return (
    <Field label={label}>
      {area ? (
        <textarea rows={2} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={`${cls} resize-y py-2 leading-snug`} />
      ) : (
        <input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className={`${cls} h-9`} />
      )}
    </Field>
  );
}

function GlyphPick({ value, onChange, compact }: { value: string; onChange: (g: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => (document.removeEventListener("pointerdown", close), document.removeEventListener("keydown", esc));
  }, [open]);
  return (
    <div ref={root} className={`relative ${compact ? "shrink-0" : ""}`}>
      <button
        type="button"
        aria-label={`Glyph: ${value || "none"}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-md border border-line bg-page text-ink hover:border-mute ${compact ? "h-7 w-7 justify-center" : "h-9 w-full px-3 text-sm"}`}
      >
        <BoardGlyph name={value} size={compact ? 15 : 17} />
        {!compact && <span>{value || "None"}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 grid w-[232px] grid-cols-6 gap-1 rounded-lg border border-line bg-page p-2 shadow-[0_8px_24px_#16181d1f]">
          {GLYPH_NAMES.map((g) => (
            <button
              key={g}
              type="button"
              title={g}
              aria-label={g}
              onClick={() => (onChange(g), setOpen(false))}
              className={`flex h-8 w-8 items-center justify-center rounded-md text-ink hover:bg-sunk ${g === value ? "bg-peach-2 ring-1 ring-kicker" : ""}`}
            >
              <BoardGlyph name={g} size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
