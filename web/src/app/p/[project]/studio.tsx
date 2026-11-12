"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { Chat } from "@/components/film/chat";
import { Player } from "@/components/film/player";
import { EditorTab, JobsTab, ReviewTab, ScriptTab, ShareTab, VersionsTab } from "@/components/film/tabs";
import { Topbar } from "@/components/topbar";
import { Button, Pill } from "@/components/ui";
import { api, ApiError, can, type Film, type Job, projectUrl, type ProjectInfo } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useSession } from "@/lib/session";
import { toastError } from "@/lib/toast";

export type Ctx = {
  project: string;
  info: ProjectInfo;
  film: Film | null;
  setFilm: (f: Film | null) => void;
  video: React.RefObject<HTMLVideoElement | null>;
  /** Jump the player to `t` seconds and play. */
  seek: (t: number) => void;
  time: number;
  scene: string | null;
  setScene: (id: string) => void;
  run: (stage: string, flags?: string[]) => Promise<Job | null>;
  watch: number | null;
  setWatch: (id: number | null) => void;
  reload: () => void;
};

export function Studio({ project }: { project: string }) {
  const { me } = useSession();
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [film, setFilm] = useState<Film | null>(null);
  const [time, setTime] = useState(0);
  const [scene, setScene] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [watch, setWatch] = useState<number | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const want = useRef<string | null>(null); // film to select after the next reload (e.g. a fresh preview)

  const reload = useCallback(() => {
    api<ProjectInfo>(projectUrl(project))
      .then((i) => {
        setInfo(i);
        setError(null);
        // Read and clear the wanted film here, not in the updater: updaters must be pure.
        const wanted = want.current && i.films.find((f) => f.name === want.current);
        if (wanted) want.current = null;
        setFilm((cur) => wanted || i.films.find((f) => f.name === cur?.name) || i.films.find((f) => !f.name.startsWith("preview-")) || i.films[0] || null);
      })
      .catch((e: ApiError) => setError(e.status === 404 ? `There is no film called ${project}.` : e.message));
    api<Job[]>("/api/jobs").then(setJobs).catch(() => {});
  }, [project]);

  useEffect(() => {
    reload();
  }, [reload]);

  useLive(["job"], (d) => {
    if (d.project !== project) return;
    api<Job[]>("/api/jobs").then(setJobs).catch(() => {});
    if (d.status === "done") reload();
  });
  useLive(["file", "version"], (d) => {
    if (d.project === project && d.action !== "created") reload();
  });

  // Follow the playhead: which scene is on screen.
  useEffect(() => {
    const segs = info?.timeline?.segments;
    if (!segs?.length || film?.name.startsWith("preview-")) return;
    let cur = segs[0].id;
    for (const s of segs) if (time >= s.start) cur = s.id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScene((prev) => (prev === cur ? prev : cur));
  }, [time, info, film]);

  const seek = useCallback((t: number) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = t;
    v.play().catch(() => {});
  }, []);

  const run = useCallback(
    async (stage: string, flags: string[] = []) => {
      try {
        const job = await api<Job>("/api/jobs", { method: "POST", json: { project, stage, flags } });
        setWatch(job.id);
        if (flags[0] === "--preview") want.current = `preview-${flags[1]}.mp4`;
        return job;
      } catch (e) {
        toastError(e);
        return null;
      }
    },
    [project],
  );

  if (error) {
    return (
      <>
        <Topbar crumbs={[{ label: "Films", href: "/" }, { label: project }]} />
        <p className="p-8 text-body">{error}</p>
      </>
    );
  }

  const mine = jobs.filter((j) => j.project === project && (j.status === "running" || j.status === "queued"));
  const editor = can(me, "editor");
  const ctx: Ctx | null = info ? { project, info, film, setFilm, video, seek, time, scene, setScene, run, watch, setWatch, reload } : null;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar crumbs={[{ label: "Films", href: "/" }, { label: project }]}>
          {mine.length > 0 && <Pill tone="warn">{mine[0].status === "running" ? `${mine[0].stage} ${mine[0].flags.join(" ")}…` : `${mine.length} queued`}</Pill>}
          {editor && (
            <>
              <Button size="sm" variant="ghost" onClick={() => run("narrate")} title="Synthesize the voice for changed lines">
                Narrate
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run("capture")} title="Record the product scenes again">
                Capture
              </Button>
              <Button onClick={() => run("compose", ["--draft"])} title="Fast, lower quality cut for checking">
                Draft
              </Button>
              <Button variant="primary" onClick={() => run("compose", ["--fast"])} title="Deliverable quality">
                Render film
              </Button>
            </>
          )}
        </Topbar>
        <main className="min-h-0 flex-1 overflow-auto">
          {ctx ? (
            <div className="mx-auto flex max-w-[1000px] flex-col gap-5 px-5 py-5">
              <Player ctx={ctx} onTime={setTime} />
              <Suspense>
                <Tab ctx={ctx} />
              </Suspense>
            </div>
          ) : (
            <div className="mx-auto max-w-[1000px] p-5">
              <div className="aspect-video animate-pulse rounded-2xl bg-sunk" />
            </div>
          )}
        </main>
      </div>
      {ctx && <Chat ctx={ctx} />}
    </div>
  );
}

function Tab({ ctx }: { ctx: Ctx }) {
  const tab = useSearchParams().get("tab") ?? "editor";
  switch (tab) {
    case "script":
      return <ScriptTab ctx={ctx} />;
    case "review":
      return <ReviewTab ctx={ctx} />;
    case "versions":
      return <VersionsTab ctx={ctx} />;
    case "share":
      return <ShareTab ctx={ctx} />;
    case "jobs":
      return <JobsTab ctx={ctx} />;
    default:
      return <EditorTab ctx={ctx} />;
  }
}
