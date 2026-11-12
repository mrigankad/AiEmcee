"use client";

import { Pause, Play, Zap } from "lucide-react";
import { useEffect, useState } from "react";

import type { Ctx } from "@/app/p/[project]/studio";
import { can, clock, withToken } from "@/lib/api";
import { useSession } from "@/lib/session";

import { Button } from "../ui";

const KIND: Record<string, string> = {
  capture: "border-line bg-page",
  video: "border-line bg-page",
  composition: "border-motion/30 bg-motion-bg",
  still: "border-teal/30 bg-[#e8f6f6]",
};

export function Player({ ctx, onTime }: { ctx: Ctx; onTime: (t: number) => void }) {
  const { me } = useSession();
  const { info, film, video, scene, setScene } = ctx;
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(0);
  const segs = info.timeline?.segments ?? [];
  const total = info.timeline?.seconds ?? length;
  const isPreview = !!film?.name.startsWith("preview-");

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const t = () => {
      setTime(v.currentTime);
      onTime(v.currentTime);
    };
    const p = () => setPlaying(!v.paused);
    const d = () => setLength(v.duration || 0);
    v.addEventListener("timeupdate", t);
    v.addEventListener("play", p);
    v.addEventListener("pause", p);
    v.addEventListener("loadedmetadata", d);
    return () => {
      v.removeEventListener("timeupdate", t);
      v.removeEventListener("play", p);
      v.removeEventListener("pause", p);
      v.removeEventListener("loadedmetadata", d);
    };
    // The <video> is keyed by film, so re-bind when the film changes.
  }, [video, onTime, film?.url, film?.mtime]);

  // Autoplay a fresh scene preview: that is why it was asked for.
  useEffect(() => {
    if (isPreview) video.current?.play().catch(() => {});
  }, [film?.name, film?.mtime, isPreview, video]);

  const { seek } = ctx;
  const ends = segs.map((s, i) => (segs[i + 1]?.start ?? total) - s.start);

  return (
    <section className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-2xl bg-ink">
        {film ? (
          <video
            ref={video}
            key={film.url + film.mtime}
            src={withToken(`${film.url}?t=${film.mtime}`)}
            poster={film.poster ? withToken(`${film.poster}?t=${film.mtime}`) : undefined}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full bg-ink"
          />
        ) : (
          <div className="grid aspect-video place-items-center text-center text-white/70">
            <div>
              <p className="text-lg font-bold text-white">No film yet</p>
              <p className="text-sm">Narrate, capture, then render a draft.</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => (video.current?.paused ? video.current.play() : video.current?.pause())}
          className="grid size-8 place-items-center rounded-full bg-ink text-white"
          disabled={!film}
        >
          {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
        </button>
        <span className="tabular text-[15px] font-bold">{clock(time)}</span>
        <span className="tabular text-[14px] text-mute">/ {clock(isPreview ? length : total)}</span>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-1.5">
          {info.films.map((f) => (
            <button
              key={f.name}
              type="button"
              onClick={() => ctx.setFilm(f)}
              className={`h-7 rounded-full border px-3 text-[13px] ${f.name === film?.name ? "border-ink bg-ink text-white" : "border-line text-body hover:border-line-strong"}`}
            >
              {f.name.replace(/\.mp4$/, "")}
            </button>
          ))}
        </div>
      </div>

      {segs.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1" role="list" aria-label="Scenes">
            {segs.map((s, i) => {
              const on = s.id === scene;
              return (
                <button
                  key={s.id}
                  role="listitem"
                  type="button"
                  title={`${s.id} · ${s.kind} · ${clock(s.start)}`}
                  onClick={() => {
                    setScene(s.id);
                    if (!isPreview) seek(s.start);
                  }}
                  style={{ flexGrow: Math.max(0.6, ends[i]), flexBasis: 0 }}
                  className={`min-w-0 rounded-lg border px-2.5 py-2 text-left transition ${on ? "border-kicker bg-peach ring-1 ring-kicker" : KIND[s.kind] ?? KIND.capture} hover:border-kicker/60`}
                >
                  <div className={`truncate text-[12px] font-bold ${on ? "text-action" : s.kind === "composition" ? "text-motion" : "text-ink"}`}>{s.id}</div>
                  <div className={`truncate text-[12px] ${on ? "text-action" : "text-body"}`}>
                    {s.kind === "composition" ? "motion" : s.kind === "video" ? "capture" : s.kind}
                    {s.focus ? ` · ${s.focus} focus` : ""}
                  </div>
                </button>
              );
            })}
          </div>
          {!isPreview && total > 0 && (
            <div className="relative h-1.5 overflow-hidden rounded-full bg-sunk">
              <div className="bar-orb absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (time / total) * 100)}%` }} />
            </div>
          )}
          {scene && can(me, "editor") && (
            <div className="flex items-center gap-2 text-[13px] text-body">
              <span>
                Scene <b className="text-ink">{scene}</b>
              </span>
              <Button size="sm" onClick={() => ctx.run("compose", ["--preview", scene])} title="Draft of this scene and its sound, in a second or two">
                <Zap size={13} /> Preview this scene
              </Button>
              {isPreview && (
                <button type="button" className="text-action hover:underline" onClick={() => ctx.setFilm(info.films.find((f) => !f.name.startsWith("preview-")) ?? null)}>
                  Back to the full film
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
