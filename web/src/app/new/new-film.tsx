"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Glyph } from "@/components/glyph";
import { Select } from "@/components/select";
import { TemplatePreview } from "@/components/template-preview";
import { Button, Input } from "@/components/ui";
import { can, type Catalog, createProject, getStyles, slug } from "@/lib/api";
import { useEntrance } from "@/lib/motion";
import { useSession } from "@/lib/session";
import { toastError } from "@/lib/toast";

/** New film: name it, say what it is about, pick a style, and let the agent draft boards in it. */
export function NewFilm() {
  const router = useRouter();
  const { me } = useSession();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [failed, setFailed] = useState(false);
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [brief, setBrief] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [style, setStyle] = useState("");
  const [busy, setBusy] = useState(false);
  const scope = useRef<HTMLFormElement>(null);
  const cards = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getStyles()
      .then((c) => {
        setCatalog(c);
        setStyle((s) => s || c.defaultStyle || c.styles[0]?.id || "");
      })
      .catch(() => setFailed(true));
  }, []);

  useEntrance(scope, "[data-enter]", []);
  useEntrance(cards, "[data-card]", [catalog, style], { y: 10, stagger: 0.04 });

  const folder = nameTouched ? slug(name) : slug(title);
  const current = catalog?.styles.find((s) => s.id === style);
  const editor = can(me, "editor");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!folder || busy) return;
    setBusy(true);
    try {
      const { name: created } = await createProject({
        name: folder,
        title: title.trim() || undefined,
        style: style || undefined,
        brief: brief.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      });
      router.push(`/p/${encodeURIComponent(created)}/boards`);
    } catch (err) {
      toastError(err);
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 overflow-auto">
      <form ref={scope} onSubmit={submit} className="mx-auto flex max-w-[1180px] flex-col gap-9 px-8 py-8 max-md:px-4">
        <section data-enter className="grid grid-cols-[1fr_300px] items-end gap-8 max-lg:grid-cols-1">
          <div className="flex flex-col gap-2">
            <div className="text-[13px] font-medium text-action">New film</div>
            <h1 className="text-[40px] leading-[1.1] font-bold tracking-[-0.02em] max-md:text-[30px]">Pick a style to start from</h1>
            <p className="max-w-[600px] text-[15px] leading-relaxed text-body">
              Each style ships with a kit of shapes and a set of scene templates. The agent drafts your boards in it; you can still change any scene later.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-mute">Style</span>
            {catalog ? (
              <Select
                label="Style"
                value={style}
                onChange={setStyle}
                align="right"
                menuWidth={300}
                options={catalog.styles.map((s) => ({ value: s.id, label: s.label, description: s.bestFor ? `Best for ${s.bestFor}` : undefined, hint: <Swatch colors={s.swatch} /> }))}
              />
            ) : (
              <div className={`h-9 rounded-lg ${failed ? "border border-line px-3 text-[13px] leading-9 text-mute" : "animate-pulse bg-sunk"}`}>{failed ? "Styles unavailable" : ""}</div>
            )}
          </div>
        </section>

        <section data-enter className="grid grid-cols-3 gap-4 max-lg:grid-cols-1">
          <Field label="Title" hint={folder ? `Folder: projects/${folder}` : "Shown on the title card"}>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Every release, on the record" aria-label="Title" autoFocus />
          </Field>
          <Field label="Name" hint="Lowercase letters, numbers and dashes">
            <Input
              value={nameTouched ? name : folder}
              onChange={(e) => {
                setNameTouched(true);
                setName(e.target.value);
              }}
              placeholder="release-film"
              aria-label="Name"
              className="font-mono text-[13px]"
            />
          </Field>
          <Field label="Product URL" hint="Optional: where the captures start">
            <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://app.example.com" type="url" aria-label="Product URL" />
          </Field>
          <Field label="Brief" hint="Who watches it, what they should remember. The agent writes the script from this." className="col-span-3 max-lg:col-span-1">
            <textarea
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
              placeholder="A 60 second launch film for QA leads: tests written from plain requirements, with proof for every check."
              aria-label="Brief"
              className="min-h-[84px] resize-y rounded-lg border border-line bg-page px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-mute focus:border-kicker focus:outline-none"
            />
          </Field>
        </section>

        <section data-enter className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-[20px] font-bold">In this style</h2>
            <span className="text-[13px] text-mute">
              {catalog ? `${catalog.templates.length} scene templates` : "Loading templates"}
              {current ? ` · ${current.description}` : ""}
            </span>
          </div>
          <div ref={cards} className="grid grid-cols-5 gap-4 max-xl:grid-cols-3 max-md:grid-cols-2">
            {catalog && current
              ? catalog.templates.map((t) => (
                  <div key={`${style}-${t.id}`} data-card className="flex flex-col gap-2.5">
                    <div className="aspect-[240/136] overflow-hidden rounded-card border border-line">
                      <TemplatePreview template={t.id} style={current} />
                    </div>
                    <div className="text-[15px] font-bold">{t.label}</div>
                    <div className="text-[13px] leading-snug text-body">{t.description}</div>
                  </div>
                ))
              : Array.from({ length: 5 }, (_, i) => <div key={i} className="aspect-[240/136] animate-pulse rounded-card bg-sunk" />)}
          </div>
        </section>

        <section data-enter className="flex flex-wrap items-center gap-5 border-t border-line pt-6">
          <Button type="submit" variant="primary" disabled={!folder || busy || !editor} className="h-10 px-5 text-[15px]">
            <Glyph name="boards" size={16} accent="#fff" />
            {busy ? "Creating…" : "Draft boards in this style"}
          </Button>
          <p className="min-w-0 flex-1 text-[13px] text-body">
            {editor ? (
              <>
                The agent picks a template per scene from your brief. A style is a folder of templates plus an entry in <code className="font-mono text-[12px] text-ink">catalog.json</code>, so teams can add their own.
              </>
            ) : (
              "Only editors can start a film."
            )}
          </p>
        </section>
      </form>
    </main>
  );
}

function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[13px] font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="truncate text-[12px] text-mute">{hint}</span>}
    </label>
  );
}

export function Swatch({ colors }: { colors: string[] }) {
  return (
    <span className="flex shrink-0 overflow-hidden rounded-full border border-line">
      {colors.map((c) => (
        <span key={c} className="size-2.5" style={{ background: c }} />
      ))}
    </span>
  );
}
