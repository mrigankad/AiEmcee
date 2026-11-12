"use client";

import { Clapperboard, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Rasa } from "@/components/brand";
import { Select } from "@/components/select";
import { Card, Pill } from "@/components/ui";
import { ago, api, clock, type Job, type Project, withToken } from "@/lib/api";
import { useLive } from "@/lib/live";

type Filter = "all" | "rendered" | "unrendered";
type Sort = "recent" | "name" | "longest" | "shortest";
const SORTS: Record<Sort, (a: Project, b: Project) => number> = {
  recent: (a, b) => b.updated - a.updated || a.name.localeCompare(b.name),
  name: (a, b) => a.name.localeCompare(b.name),
  longest: (a, b) => (b.seconds ?? 0) - (a.seconds ?? 0),
  shortest: (a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity),
};
const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Recently rendered" },
  { value: "name", label: "Name" },
  { value: "longest", label: "Longest" },
  { value: "shortest", label: "Shortest" },
];

export function Films() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const [month, setMonth] = useState(0); // 30 days before the list loaded

  const load = useCallback(() => {
    api<Project[]>("/api/projects")
      .then((p) => {
        setProjects(p);
        setMonth(Date.now() - 30 * 86400 * 1000);
      })
      .catch(() => setProjects([]));
    api<Job[]>("/api/jobs").then(setJobs).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["job", "version"], load);

  const busy = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) if (j.status === "running" || j.status === "queued") m.set(j.project, j);
    return m;
  }, [jobs]);

  const shipped = projects?.filter((p) => p.updated > month) ?? [];
  const minutes = shipped.reduce((t, p) => t + (p.seconds ?? 0), 0) / 60;
  const list = (projects ?? [])
    .filter((p) => (filter === "all" ? true : filter === "rendered" ? p.films > 0 : p.films === 0))
    .sort(SORTS[sort]);

  return (
    <main className="flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-8 py-7 max-md:px-4">
        <section className="grid grid-cols-[1fr_360px] gap-6 max-lg:grid-cols-1">
          <div className="flex flex-col justify-center gap-4 rounded-2xl bg-peach px-6 py-6">
            <div className="flex items-center gap-3">
              <Rasa size={28} />
              <h1 className="text-[28px] leading-tight font-bold">What should we film today?</h1>
            </div>
            <p className="max-w-xl text-[15px] text-body">
              Open a film to direct it with Rasa: rewrite the script, move a focus, preview a scene in a couple of seconds, then send it for review and share it.
            </p>
            <div className="text-[13px] text-body">
              New film from the terminal: <code className="rounded bg-page px-1.5 py-0.5 text-ink">aiemcee init projects/&lt;name&gt;</code>
            </div>
          </div>
          <div className="grid grid-rows-3 gap-3 max-lg:grid-cols-3 max-lg:grid-rows-1 max-sm:grid-cols-1">
            <Stat label="Rendering now" value={busy.size} detail={[...busy.keys()].join(", ") || "Queue is clear"} tone={busy.size ? "action" : "ink"} />
            <Stat label="Updated this month" value={shipped.length} detail={`${minutes.toFixed(1)} min of film`} />
            <Stat label="Not rendered yet" value={projects?.filter((p) => !p.films).length ?? 0} detail="No film in out/" />
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-[20px] font-bold">All films</h2>
            <span className="tabular text-[14px] text-mute">{projects?.length ?? ""}</span>
            <div className="flex-1" />
            <Select label="Sort" showLabel align="right" value={sort} onChange={setSort} className="w-[230px]" options={SORT_OPTIONS} />
            {(["all", "rendered", "unrendered"] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`h-8 rounded-full border px-3.5 text-[14px] transition ${filter === f ? "border-ink bg-ink text-white" : "border-line text-ink hover:border-line-strong"}`}
              >
                {{ all: "All", rendered: "Rendered", unrendered: "Not rendered" }[f]}
              </button>
            ))}
          </div>

          {projects === null ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-4 gap-y-6">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-card bg-sunk" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-4 gap-y-6">
              {list.map((p) => (
                <FilmCard key={p.name} p={p} job={busy.get(p.name)} />
              ))}
              <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-card border border-dashed border-line-strong text-center text-[14px] text-body">
                <Plus size={20} className="text-action" />
                <span>
                  New film: <code className="rounded bg-sunk px-1">aiemcee init</code>
                </span>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value, detail, tone = "ink" }: { label: string; value: number; detail: string; tone?: "ink" | "action" }) {
  return (
    <Card className="flex items-center gap-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-mute">{label}</div>
        <div className="truncate text-[15px]">{detail}</div>
      </div>
      <div className={`tabular text-[32px] leading-none font-bold ${tone === "action" ? "text-action" : "text-ink"}`}>{value}</div>
    </Card>
  );
}

function FilmCard({ p, job }: { p: Project; job?: Job }) {
  return (
    <Link href={`/p/${encodeURIComponent(p.name)}`} className="group flex flex-col gap-2">
      <div className="relative aspect-video overflow-hidden rounded-card bg-ink">
        {p.poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the studio, sized by CSS
          <img src={withToken(`${p.poster}?t=${p.updated}`)} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="grid size-full place-items-center bg-gradient-to-br from-[#2a1a12] to-ink">
            <Clapperboard size={28} className="text-white/40" />
          </div>
        )}
        <div className="absolute top-2.5 right-2.5">
          {job ? <Pill tone="warn">{job.status === "running" ? `Rendering · ${job.stage}` : "Queued"}</Pill> : p.films ? <Pill tone="ok">Ready</Pill> : <Pill>No film yet</Pill>}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="truncate text-[15px] font-bold">{p.name}</span>
        <span className="flex-1" />
        <span className="tabular shrink-0 text-[13px] text-mute">
          {p.seconds ? `${clock(p.seconds)} · ` : ""}
          {ago(p.updated)}
        </span>
      </div>
    </Link>
  );
}
