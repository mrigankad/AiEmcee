"use client";

import { Clapperboard, FileText, GitBranch, Link2, ListChecks, MessageSquare, RotateCw, Search, SquarePlay, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { api, can, type Job, type Project } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useSession } from "@/lib/session";

import { Logo } from "./brand";

export const FILM_TABS = [
  { tab: "editor", label: "Editor", icon: SquarePlay },
  { tab: "script", label: "Script", icon: FileText },
  { tab: "review", label: "Review", icon: MessageSquare },
  { tab: "versions", label: "Versions", icon: GitBranch },
  { tab: "share", label: "Share", icon: Link2 },
  { tab: "jobs", label: "Jobs", icon: ListChecks },
] as const;

function Item({ href, icon: Icon, label, count, on, badge }: { href: string; icon: typeof Search; label: string; count?: string | number; on: boolean; badge?: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[14px] transition ${on ? "border border-line bg-page font-bold text-ink shadow-[0_1px_2px_#16181d0d]" : "border border-transparent text-ink hover:bg-sunk"}`}
    >
      <Icon size={16} strokeWidth={1.75} className={on ? "text-ink" : "text-body"} />
      <span className="flex-1 truncate">{label}</span>
      {badge}
      {count != null && count !== "" && <span className="tabular text-[12px] text-mute">{count}</span>}
    </Link>
  );
}

export function Sidebar() {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { me } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    api<Project[]>("/api/projects").then(setProjects).catch(() => {});
    api<Job[]>("/api/jobs").then((j) => setActive(j.filter((x) => x.status === "running" || x.status === "queued").length)).catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useLive(["job"], load);

  const film = path.startsWith("/p/") ? decodeURIComponent(path.split("/")[2] ?? "") : null;
  const tab = params.get("tab") ?? "editor";
  const hits = q ? projects.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];

  return (
    <aside className="flex h-dvh w-[232px] shrink-0 flex-col gap-3 border-r border-line bg-rail px-2.5 py-3.5 max-md:hidden">
      <Link href="/" className="flex items-center gap-2.5 px-1.5 py-0.5">
        <Logo />
        <span className="text-[17px] leading-[22px] font-bold">AiEmcee</span>
        <span className="text-[13px] text-mute">Studio</span>
      </Link>

      <div className="relative">
        <label className="flex h-9 items-center gap-2 rounded-lg border border-line bg-page px-3">
          <Search size={14} className="text-mute" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[0]) {
                router.push(`/p/${encodeURIComponent(hits[0].name)}`);
                setQ("");
              }
            }}
            placeholder="Search films"
            aria-label="Search films"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-mute"
          />
        </label>
        {hits.length > 0 && (
          <div className="absolute inset-x-0 top-10 z-20 rounded-lg border border-line bg-page p-1 shadow-lg">
            {hits.map((p) => (
              <Link key={p.name} href={`/p/${encodeURIComponent(p.name)}`} onClick={() => setQ("")} className="block truncate rounded-md px-2.5 py-1.5 text-[13px] hover:bg-sunk">
                {p.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      <nav className="flex flex-col gap-0.5">
        <Item href="/" icon={Clapperboard} label="Films" count={projects.length || ""} on={path === "/"} />
        <Item
          href="/renders"
          icon={RotateCw}
          label="Renders"
          on={path === "/renders"}
          badge={active ? <span className="tabular rounded-full bg-warn-bg px-1.5 text-[11px] font-bold text-warn">{active}</span> : null}
        />
        {can(me, "owner") && <Item href="/team" icon={Users} label="Team" on={path === "/team"} />}
      </nav>

      {film && (
        <nav className="flex flex-col gap-0.5">
          <div className="truncate px-2.5 pt-2 pb-1 text-[11px] font-bold tracking-[0.08em] text-mute uppercase">This film · {film}</div>
          {FILM_TABS.map((t) => (
            <Item key={t.tab} href={`/p/${encodeURIComponent(film)}${t.tab === "editor" ? "" : `?tab=${t.tab}`}`} icon={t.icon} label={t.label} on={tab === t.tab} />
          ))}
        </nav>
      )}

      <div className="flex-1" />
      <div className="flex items-center gap-2.5 border-t border-line px-1.5 pt-3">
        <span className="grid size-8 place-items-center rounded-full bg-ink text-[13px] font-bold text-white">{(me?.name ?? "?").slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <div className="truncate text-[14px]">{me ? (me.name === "you" ? "Local studio" : me.name) : "Not signed in"}</div>
          <div className="text-[12px] text-mute">{me ? (me.name === "you" ? "Owner · this computer" : me.role[0].toUpperCase() + me.role.slice(1)) : "Token needed"}</div>
        </div>
      </div>
    </aside>
  );
}
