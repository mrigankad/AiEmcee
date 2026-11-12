# AiEmcee Studio (web)

The browser front end of AiEmcee: films, the editor with Rasa, script, review,
versions, share links, renders and team. Built with Next.js 16 (App Router,
Cache Components) and Tailwind CSS 4.

It has no engine of its own. Every `/api`, `/files` and `/s` request is
proxied to the studio server (`studio/server.mjs`), which runs the renders,
stores versions and comments, and talks to the models.

## Run it

```bash
# terminal 1, at the repo root: the studio server on http://127.0.0.1:4810
npm run web

# terminal 2: this app on http://localhost:3000
npm --prefix web install
npm --prefix web run dev
```

`AIEMCEE_STUDIO_URL` points the app at a studio server somewhere else.
A studio with users asks each browser for its token once.

## Layout

| Path | Holds |
| --- | --- |
| `src/app/page.tsx`, `films.tsx` | Films: every project, posters, status, sort and filter |
| `src/app/p/[project]/` | the film workspace: player, scene strip, tabs, Rasa |
| `src/app/renders/`, `src/app/team/` | the job queue; people and roles |
| `src/components/film/` | player, tabs (editor, script, review, versions, share, jobs), chat |
| `src/components/` | sidebar, top bar, select, buttons and the brand marks |
| `src/lib/api.ts` | the API client and the types it shares with the server |
| `src/lib/live.ts` | one shared event stream for live updates |
| `src/lib/session.tsx` | who is signed in, what the studio can do |

## Checks

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Next.js 16 differs from older versions in places (async `params`, Cache
Components, `proxy`); read `node_modules/next/dist/docs/` before changing
routing or caching. See `AGENTS.md`.
