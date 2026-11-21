"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";
import { Check, Loader2, Maximize2, Minus, Pause, Play, Plus } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "@/components/ui";
import type { Board, TemplateDef } from "@/lib/boards";
import { titleOf } from "@/lib/boards";

gsap.registerPlugin(Draggable, InertiaPlugin, useGSAP);

const W = 1920;
const H = 1080;

export type Beat = { name: string; at: number; hint: string };

/** Beat times: props.beats wins, else spread the template's beats over the entrance (~0.4–2.5 s). */
export function beatsFor(board: Board, tpl: TemplateDef | undefined): Beat[] {
  const names = Object.entries(tpl?.beats ?? {});
  return names.map(([name, hint], i) => ({ name, hint, at: board.props.beats?.[name] ?? 0.4 + (names.length > 1 ? (2.1 * i) / (names.length - 1) : 0) }));
}

export function Canvas({
  board,
  index,
  tpl,
  seconds,
  t,
  onT,
  still,
  loading,
  error,
  cursor,
  onApprove,
  readOnly,
}: {
  board: Board;
  index: number;
  tpl: TemplateDef | undefined;
  seconds: number;
  t: number;
  onT: (t: number) => void;
  still: string | null;
  loading: boolean;
  error: string | null;
  cursor: { label: string; x: number; y: number; key: string } | null;
  onApprove: () => void;
  readOnly: boolean;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const pan = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const cur = useRef<HTMLDivElement>(null);
  const placed = useRef(false);
  const [fit, setFit] = useState(0.4);
  const [zoom, setZoom] = useState(1); // relative to fit
  const [playing, setPlaying] = useState(false);
  const beats = beatsFor(board, tpl);
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Fit the 1920×1080 frame into the stage.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min((el.clientWidth - 96) / W, (el.clientHeight - 96) / H)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pan with inertia; transform-only.
  useGSAP(
    () => {
      if (!pan.current) return;
      const [d] = Draggable.create(pan.current, { type: "x,y", inertia: !reduce, cursor: "grab", activeCursor: "grabbing", allowContextMenu: true });
      return () => d.kill();
    },
    { scope: stage },
  );

  // Scale the frame before paint: the first fit lands instantly, later zooms ease.
  useLayoutEffect(() => {
    if (!frame.current) return;
    const first = !placed.current;
    placed.current = true;
    gsap.to(frame.current, { scale: fit * zoom, duration: first || reduce ? 0 : 0.35, ease: "power3.out", overwrite: true });
  }, [fit, zoom, reduce]);

  function resetView() {
    setZoom(1);
    gsap.to(pan.current, { x: 0, y: 0, duration: reduce ? 0 : 0.4, ease: "power3.out" });
  }

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) && Math.abs(e.deltaY) < 1) return;
      e.preventDefault();
      setZoom((z) => Math.min(4, Math.max(0.4, z * Math.exp(-e.deltaY * 0.0015))));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // The agent cursor glides to where it is placing things.
  const cx = useRef<((v: number) => void) | null>(null);
  const cy = useRef<((v: number) => void) | null>(null);
  useGSAP(
    () => {
      if (!cur.current) return;
      gsap.set(cur.current, { left: W / 2, top: H / 2 });
      cx.current = gsap.quickTo(cur.current, "left", { duration: reduce ? 0 : 0.9, ease: "power3.inOut" });
      cy.current = gsap.quickTo(cur.current, "top", { duration: reduce ? 0 : 0.9, ease: "power3.inOut" });
    },
    { dependencies: [!!cursor], scope: stage },
  );
  useEffect(() => {
    if (!cursor) return;
    cx.current?.(cursor.x * W);
    cy.current?.(cursor.y * H);
  }, [cursor]);

  // "Play beats" steps through each beat and then the settled frame.
  useEffect(() => {
    if (!playing) return;
    const stops = [...beats.map((b) => b.at + 0.35), Math.min(seconds, 3.2)];
    let i = 0;
    onT(stops[0]);
    const id = setInterval(() => {
      i++;
      if (i >= stops.length) return setPlaying(false);
      onT(stops[i]);
    }, 1400);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  const scale = fit * zoom;
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-page">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <div className="min-w-[96px] flex-1">
          <div className="truncate text-[14px] font-bold text-ink">
            {String(index + 1).padStart(2, "0")} · {titleOf(board)}
          </div>
        </div>
        <span className="tabular hidden shrink-0 whitespace-nowrap text-[12px] text-mute xl:inline">
          1920 × 1080 · {seconds.toFixed(1)} s narration
        </span>
        <div className="flex items-center rounded-lg border border-line">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.4, z / 1.25))} className="flex h-7 w-7 items-center justify-center text-mute hover:text-ink">
            <Minus size={13} />
          </button>
          <button type="button" onClick={resetView} title="Fit" className="tabular h-7 w-12 text-[12px] font-semibold text-body hover:text-ink">
            {Math.round(scale * 100)}%
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z * 1.25))} className="flex h-7 w-7 items-center justify-center text-mute hover:text-ink">
            <Plus size={13} />
          </button>
        </div>
        <Button size="sm" variant="ghost" onClick={resetView} aria-label="Fit to screen">
          <Maximize2 size={13} />
        </Button>
        <Button size="sm" onClick={() => setPlaying((p) => !p)} disabled={!beats.length}>
          {playing ? <Pause size={13} /> : <Play size={13} />} Play beats
        </Button>
        {board.status === "approved" ? (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-ok-bg px-2.5 text-[13px] font-bold text-ok">
            <Check size={13} /> Approved
          </span>
        ) : (
          <Button size="sm" variant="primary" onClick={onApprove} disabled={readOnly}>
            <Check size={13} /> Approve board
          </Button>
        )}
      </div>

      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden bg-[#FAFAFB] [background-image:radial-gradient(#e3e3e8_1px,transparent_1px)] [background-size:20px_20px]">
        <div ref={pan} className="absolute inset-0 flex items-center justify-center">
          <div ref={frame} className="relative shrink-0 origin-center" style={{ width: W, height: H }}>
            <div className="absolute inset-0 overflow-hidden rounded-[6px] bg-page shadow-[0_0_0_1px_#16181d14,0_24px_64px_-12px_#16181d33]">
              {still && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={still} alt={`Board ${board.id} at ${t.toFixed(1)} s`} draggable={false} className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${loading ? "opacity-60" : "opacity-100"}`} />
              )}
              {!still && !error && <Shimmer />}
              {(loading || error) && (
                <div className="absolute right-3 bottom-3 flex items-center gap-2 rounded-full bg-ink/85 max-w-[640px] px-3 py-1.5 text-[12px] font-semibold text-white" style={{ transform: `scale(${1 / scale})`, transformOrigin: "bottom right" }}>
                  {error ? error : (
                    <>
                      <Loader2 className="animate-spin" size={12} /> Rendering still…
                    </>
                  )}
                </div>
              )}
            </div>
            {cursor && (
              <div ref={cur} className="pointer-events-none absolute z-10" style={{ transform: `scale(${1 / scale})`, transformOrigin: "0 0" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" className="drop-shadow">
                  <path d="M4 3l7 18 2.5-7.5L21 11z" fill="#16a06a" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
                <span className="absolute top-4 left-3.5 rounded-full bg-ok px-2.5 py-1 text-[12px] font-bold whitespace-nowrap text-white shadow">{cursor.label}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <BeatStrip beats={beats} seconds={seconds} t={t} onT={onT} />
    </section>
  );
}

function Shimmer() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[linear-gradient(110deg,#f4f4f6_30%,#ececf0_50%,#f4f4f6_70%)] bg-[length:200%_100%] motion-safe:animate-[shimmer_1.6s_linear_infinite]">
      <style>{`@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}`}</style>
    </div>
  );
}

function BeatStrip({ beats, seconds, t, onT }: { beats: Beat[]; seconds: number; t: number; onT: (t: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / seconds) * 100))}%`;
  function at(e: React.PointerEvent) {
    const r = bar.current!.getBoundingClientRect();
    onT(Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * seconds * 10) / 10);
  }
  return (
    <div className="shrink-0 border-t border-line px-4 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.08em] text-mute uppercase">
        Beats
        <span className="tabular ml-auto font-semibold tracking-normal normal-case">
          {t.toFixed(1)} s / {seconds.toFixed(1)} s
        </span>
      </div>
      <div
        ref={bar}
        role="slider"
        tabIndex={0}
        aria-label="Preview time"
        aria-valuemin={0}
        aria-valuemax={seconds}
        aria-valuenow={t}
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), at(e))}
        onPointerMove={(e) => e.buttons && at(e)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") onT(Math.min(seconds, +(t + 0.1).toFixed(1)));
          if (e.key === "ArrowLeft") onT(Math.max(0, +(t - 0.1).toFixed(1)));
        }}
        className="relative h-9 cursor-pointer touch-none rounded-md bg-rail"
      >
        <div className="bar-orb absolute inset-y-0 left-0 rounded-l-md opacity-15" style={{ width: pct(t) }} />
        {beats.map((b) => (
          <button
            key={b.name}
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onT(b.at + 0.35)}
            title={`${b.name} · ${b.hint} · ${b.at.toFixed(1)} s`}
            className="group absolute top-1 bottom-1 -translate-x-1/2"
            style={{ left: pct(b.at) }}
          >
            <span className="absolute inset-y-0 left-1/2 w-px bg-kicker" />
            <span className="relative top-0.5 rounded bg-page px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-action shadow-[0_0_0_1px_var(--color-line)] group-hover:text-ink">{b.name}</span>
          </button>
        ))}
        <div className="pointer-events-none absolute inset-y-[-3px] w-0.5 rounded bg-ink" style={{ left: pct(t) }} />
      </div>
    </div>
  );
}
