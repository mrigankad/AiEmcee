/**
 * Share pages: a public link to one film with chapters, captions, a call to
 * action and an optional lead form, plus the viewer analytics behind it.
 *
 *   <projects>/.aiemcee-shares.json          id -> { project, film, title, cta, leadForm }
 *   <project>/.aiemcee/analytics/<id>.ndjson  view / progress / cta / complete events
 *   <project>/.aiemcee/leads.json             captured leads (also POSTed to AIEMCEE_LEADS_WEBHOOK)
 *
 * Publishing straight to YouTube or LinkedIn needs an OAuth app per workspace;
 * that is planned, not built. Download the film or share the link instead.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { publish } from "./events.mjs";
import { readJson, stateDir, writeJson } from "./store.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fail = (status, message) => Object.assign(new Error(message), { status });

export function createShares(projectsDir, projectDir) {
  const file = path.join(projectsDir, ".aiemcee-shares.json");
  const all = () => readJson(file, {});

  function get(id) {
    const s = all()[id];
    if (!s || s.revoked) throw fail(404, "no such share");
    return { id, ...s, dir: projectDir(s.project) };
  }

  function create(project, { film, title, cta, leadForm = false }, user) {
    const dir = projectDir(project);
    const name = path.basename(String(film));
    if (!fs.existsSync(path.join(dir, "out", name))) throw fail(404, `no film ${name}`);
    if (cta?.url && !/^https?:\/\//i.test(cta.url)) throw fail(400, "cta.url must be http(s)");
    const id = crypto.randomBytes(9).toString("base64url");
    const shares = all();
    shares[id] = {
      project,
      film: name,
      title: String(title || name).slice(0, 140),
      cta: cta?.label ? { label: String(cta.label).slice(0, 60), url: cta.url ?? null } : null,
      leadForm: !!leadForm,
      by: user.name,
      createdAt: new Date().toISOString(),
    };
    writeJson(file, shares);
    publish("share", { project, id, action: "created" });
    return { id, url: `/s/${id}`, ...shares[id] };
  }

  function revoke(id) {
    const shares = all();
    if (!shares[id]) throw fail(404, "no such share");
    shares[id].revoked = new Date().toISOString();
    writeJson(file, shares);
    publish("share", { project: shares[id].project, id, action: "revoked" });
    return { id, revoked: true };
  }

  const list = (project) =>
    Object.entries(all())
      .filter(([, s]) => s.project === project && !s.revoked)
      .map(([id, s]) => ({ id, url: `/s/${id}`, ...s }));

  /** Chapters come from the build's timeline, titled from lower thirds or the script. */
  function chapters(dir) {
    const t = readJson(path.join(dir, "work", "timeline.json"), null);
    if (!t) return [];
    const script = readJson(path.join(dir, "narration.json"), []);
    return t.segments.map((s) => ({ id: s.id, start: s.start, title: s.lowerThird?.title ?? script.find((l) => l.id === s.id)?.title ?? s.id }));
  }

  /** Captions: each line's SRT shifted to where its scene starts in the film. */
  function captions(id) {
    const { dir } = get(id);
    const t = readJson(path.join(dir, "work", "timeline.json"), null);
    if (!t) return "WEBVTT\n";
    const sec = (h, m, s, ms) => +h * 3600 + +m * 60 + +s + +ms / 1000;
    const fmt = (x) => new Date(Math.max(0, x) * 1000).toISOString().slice(11, 23);
    const cues = [];
    for (const seg of t.segments) {
      const srt = path.join(dir, "tts", `${seg.id}.srt`);
      if (!fs.existsSync(srt)) continue;
      const off = seg.start + (seg.lead ?? 0);
      for (const block of fs.readFileSync(srt, "utf8").split(/\r?\n\r?\n/)) {
        const m = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\r?\n([\s\S]+)/.exec(block.trim());
        if (m) cues.push(`${fmt(off + sec(m[1], m[2], m[3], m[4]))} --> ${fmt(off + sec(m[5], m[6], m[7], m[8]))}\n${m[9].trim()}`);
      }
    }
    return `WEBVTT\n\n${cues.join("\n\n")}\n`;
  }

  function record(id, event) {
    const s = get(id);
    const type = String(event.type);
    if (!["view", "progress", "cta", "complete"].includes(type)) throw fail(400, "bad event");
    const row = { type, t: Math.min(36000, Math.max(0, Number(event.t) || 0)), session: String(event.session ?? "").slice(0, 40), at: Date.now() };
    const dir = path.join(stateDir(s.dir), "analytics");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${id}.ndjson`), `${JSON.stringify(row)}\n`);
  }

  /** Views, viewers, average watch, CTA clicks, leads, and how many viewers reached each chapter. */
  function analytics(id) {
    const s = get(id);
    const f = path.join(stateDir(s.dir), "analytics", `${id}.ndjson`);
    const rows = fs.existsSync(f) ? fs.readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
    const reach = new Map();
    let views = 0;
    let ctas = 0;
    // A viewer is a session that pressed play; events from a page that was
    // only opened or seeked do not count towards viewers or retention.
    const played = new Set(rows.filter((r) => r.type === "view").map((r) => r.session));
    for (const r of rows) {
      if (r.type === "view") views++;
      if (r.type === "cta") ctas++;
      if (played.has(r.session)) reach.set(r.session, Math.max(reach.get(r.session) ?? 0, r.t));
    }
    // Sorted once: each chapter then counts its viewers with a binary search,
    // O(V log V + C log V) instead of a pass over every viewer per chapter.
    const watched = [...reach.values()].sort((x, y) => x - y);
    const reachedFrom = (start) => {
      let lo = 0;
      let hi = watched.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (watched[mid] < start) lo = mid + 1;
        else hi = mid;
      }
      return watched.length - lo; // viewers whose furthest point is at or past start
    };
    const n = watched.length;
    const leads = readJson(path.join(stateDir(s.dir), "leads.json"), []).filter((l) => l.share === id).length;
    return {
      id,
      views,
      viewers: n,
      avgWatch: n ? +(watched.reduce((a, b) => a + b, 0) / n).toFixed(1) : 0,
      ctaClicks: ctas,
      leads,
      retention: chapters(s.dir).map((c) => ({ scene: c.id, title: c.title, reached: n ? +(reachedFrom(c.start) / n).toFixed(3) : 0 })),
    };
  }

  function lead(id, input) {
    const s = get(id);
    if (!s.leadForm) throw fail(400, "this share has no lead form");
    const email = String(input.email ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, "a valid email is required");
    const entry = { share: id, film: s.film, name: String(input.name ?? "").slice(0, 120), email: email.slice(0, 200), company: String(input.company ?? "").slice(0, 120), at: new Date().toISOString() };
    const f = path.join(stateDir(s.dir), "leads.json");
    const leads = readJson(f, []);
    leads.push(entry);
    writeJson(f, leads);
    publish("lead", { project: s.project, share: id });
    const hook = process.env.AIEMCEE_LEADS_WEBHOOK;
    if (hook) fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(entry) }).catch((e) => console.error(`leads webhook: ${e.message}`));
    return { ok: true };
  }

  const filmFile = (id) => {
    const s = get(id);
    return path.join(s.dir, "out", s.film);
  };
  const posterFile = (id) => filmFile(id).replace(/\.mp4$/, ".jpg");

  function page(id) {
    const s = get(id);
    const ch = chapters(s.dir);
    const poster = fs.existsSync(posterFile(id));
    const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.title)}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20256%20256%22%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22g%22%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%221%22%20y2%3D%221%22%3E%3Cstop%20offset%3D%220%22%20stop-color%3D%22%23FFB547%22%2F%3E%3Cstop%20offset%3D%22.45%22%20stop-color%3D%22%23F98620%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23D9400B%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3Crect%20width%3D%22256%22%20height%3D%22256%22%20rx%3D%2260%22%20fill%3D%22url(%23g)%22%2F%3E%3Cpath%20d%3D%22M98%2076Q98%2062%20110%2069L180%20112Q192%20120%20180%20128L110%20171Q98%20178%2098%20164Z%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%22196%22%20cy%3D%2270%22%20r%3D%2215%22%20fill%3D%22%23fff%22%2F%3E%3C%2Fsvg%3E">
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#fff;--ink:#16181D;--mute:#5b6070;--line:#e6e6ea;--band:#FFF3EC}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "Urbanist",system-ui,sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 64px}h1{font-size:32px;line-height:1.15;margin:0 0 20px}
video{width:100%;border-radius:14px;background:#000;display:block}
.row{display:grid;grid-template-columns:1fr 300px;gap:24px;margin-top:20px}@media(max-width:760px){.row{grid-template-columns:1fr}}
.ch button{display:flex;gap:12px;width:100%;text-align:left;border:0;background:none;padding:10px 12px;border-radius:10px;font:inherit;color:inherit;cursor:pointer}
.ch button:hover,.ch button.on{background:var(--band)}.ch time{color:var(--mute);font-variant-numeric:tabular-nums;min-width:44px}
.cta{display:inline-block;padding:12px 20px;border-radius:999px;color:#fff;font-weight:700;text-decoration:none;background:linear-gradient(135deg,#FFA12B,#F0731A 50%,#DC440C)}
form{background:var(--band);border-radius:14px;padding:16px;display:grid;gap:10px;margin-top:16px}
input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px}
form button{font:inherit;font-weight:700;padding:10px;border:0;border-radius:10px;background:var(--ink);color:#fff;cursor:pointer}
</style></head><body><main>
<h1>${esc(s.title)}</h1>
<video id="v" controls playsinline preload="metadata"${poster ? ` poster="/s/${id}/poster"` : ""} src="/s/${id}/video"><track kind="captions" src="/s/${id}/captions.vtt" srclang="en" label="English" default></video>
<div class="row"><div class="ch">${ch.map((c) => `<button data-t="${c.start}"><time>${clock(c.start)}</time><span>${esc(c.title)}</span></button>`).join("")}</div>
<div>${s.cta ? `<a class="cta" id="cta" href="${esc(s.cta.url ?? "#")}" target="_blank" rel="noopener">${esc(s.cta.label)}</a>` : ""}
${s.leadForm ? `<form id="lead"><strong>Get in touch</strong><input name="name" placeholder="Name" autocomplete="name"><input name="email" type="email" required placeholder="Work email" autocomplete="email"><input name="company" placeholder="Company" autocomplete="organization"><button>Send</button></form>` : ""}</div></div>
</main><script>
const v=document.getElementById("v"),id=${JSON.stringify(id)};
let sid=Math.random().toString(36).slice(2);try{sid=sessionStorage.getItem("aie")||sid;sessionStorage.setItem("aie",sid)}catch{}
const send=(type)=>navigator.sendBeacon("/s/"+id+"/events",new Blob([JSON.stringify({type,t:v.currentTime,session:sid})],{type:"application/json"}));
let viewed=false,last=0;
v.addEventListener("play",()=>{if(!viewed){viewed=true;send("view")}});
v.addEventListener("ended",()=>send("complete"));
const btns=[...document.querySelectorAll(".ch button")];
btns.forEach(b=>b.onclick=()=>{v.currentTime=+b.dataset.t;v.play()});
v.addEventListener("timeupdate",()=>{if(viewed&&!v.paused&&Math.abs(v.currentTime-last)>=5){last=v.currentTime;send("progress")}let k=-1;btns.forEach((b,i)=>{if(v.currentTime>=+b.dataset.t)k=i});btns.forEach((b,i)=>b.classList.toggle("on",i===k))});
document.getElementById("cta")?.addEventListener("click",()=>send("cta"));
const f=document.getElementById("lead");
f?.addEventListener("submit",async e=>{e.preventDefault();const r=await fetch("/s/"+id+"/lead",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(Object.fromEntries(new FormData(f)))});f.innerHTML=r.ok?"<strong>Thanks, we will be in touch.</strong>":"<strong>Could not send. Check the email and try again.</strong>"});
</script></body></html>`;
  }

  return { get, create, revoke, list, captions, record, analytics, lead, page, filmFile, posterFile };
}
