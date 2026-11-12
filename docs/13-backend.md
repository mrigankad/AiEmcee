# 13 · Backend plan

The studio screens (Paper file "AiEmcee — Engine plan", page 01) need a backend.
This is that backend: what it stores, what it exposes, and the order it is built in.

## Principles

1. **The project files stay the source of truth.** `narration.json`, `scenes.mjs`,
   `video.config.mjs` and `design.tokens.json` are what the CLI, the studio and
   Rasa all edit. The backend never keeps a second copy of the film in a database.
2. **Everything else lives next to the project**, in `<project>/.aiemcee/`:
   versions, comments, job history, chat sessions. It is plain JSON, git-ignorable,
   and it travels with the project folder.
3. **One process, one queue.** A render uses every core, so stages run one at a
   time; draft and fast jobs from a person jump ahead of batch jobs.
4. **Every change is undoable.** Rasa's edits and human edits both go through a
   snapshot first.

## Resources

| Resource | Stored in | API |
| --- | --- | --- |
| Projects | `projects/<name>/` | `GET /api/projects`, `GET /api/projects/:p` |
| Script | `narration.json` | `PUT /api/projects/:p/narration` |
| Source files | the four source files | `GET/PUT /api/projects/:p/files/:name` |
| Jobs | memory + `.aiemcee/jobs.json` | `POST /api/jobs`, `GET /api/jobs`, `POST /api/jobs/:id/cancel`, `GET /api/jobs/:id/events` |
| Events | memory | `GET /api/events` (one SSE stream: jobs, versions, comments) |
| Versions | `.aiemcee/versions/NNN/` | `GET /api/projects/:p/versions`, `GET .../versions/:v/diff`, `POST .../versions/:v/restore`, `POST .../undo` |
| Comments | `.aiemcee/comments.json` | `GET/POST /api/projects/:p/comments`, `PATCH .../comments/:id` |
| Uploads | `assets/uploads/` | `POST /api/projects/:p/upload` |
| Chat (Rasa) | `.aiemcee/chat.json` | `POST /api/chat` (NDJSON stream) |
| Media | `out/`, `assets/` | `GET /files/:p/...` (with Range support) |

### Versions

A version is a copy of the four source files plus a small `meta.json` (label,
time, who made it, job id). One is taken:

- before every Rasa turn that writes files (label `before: <prompt>`)
- after every successful `compose` (label `render <mode>`), so each film on disk
  has the exact source that produced it

`undo` restores the newest `before:` snapshot. `diff` is a line diff of each file
against the current source. The Review screen's "v6 ↔ v7" uses this.

### Comments

`{ id, author, at: seconds | null, scene, text, x, y, status, createdAt }`.
`at` + `x/y` pin a comment to a frame and a point. Status is `open`, `resolved`
or `rasa` (handed to the agent). The Review screen reads and writes these.

### Jobs

`{ id, project, stage, flags, priority, status, code, queued, started, seconds }`.
Status is `queued`, `running`, `done`, `failed` or `cancelled`. Cancel kills the
child process (or removes a queued job). The last 200 jobs persist across restarts.

## Phases

| Phase | Ships | Status |
| --- | --- | --- |
| B1 | Job queue with priority, cancel, persistence; global event stream | built |
| B2 | Versions: snapshot, list, diff, restore, undo; auto snapshots around Rasa and renders | built |
| B3 | Comments API, pinned to frames | built |
| B4 | Source file API (read and write with validation) for the Script, Direction and Scenes screens | built |
| B5 | Scene preview: `compose --preview <scene>` renders only that scene and its two seams at draft quality, with its slice of the soundtrack (about 1 to 2 s when cached). A cached draft compose measured 4.2 s, so warm browsers were dropped | built |
| B6 | CI webhook and nightly selector check | dropped |
| B7 | Share pages (`/s/:id`: chapters, captions, CTA, lead form), viewer analytics (views, average watch, retention per scene), leads with `AIEMCEE_LEADS_WEBHOOK`. Direct publishing to YouTube or LinkedIn needs OAuth apps: planned | built |
| B8 | Users and tokens (`aiemcee studio user add <name> <role>`), roles viewer < approver < editor < owner, approvals with a publish gate, `--host` only once users exist. SSO: planned | built |

## Security

The server binds to `127.0.0.1` by default. File access is confined to the project
directory, writes are limited to the source files and `assets/uploads/`, and JSON
and modules are validated before they are written.

Once users exist (`<projects>/.aiemcee-users.json`, which stores only a SHA-256 of
each token) or `AIEMCEE_STUDIO_TOKEN` is set, every `/api` and `/files` request
needs `Authorization: Bearer <token>` (or `?token=` for EventSource and media), and
each call needs a role:

| Role | Can |
|---|---|
| viewer | read, play, comment |
| approver | + approve a film or request changes |
| editor | + edit sources, run jobs, chat with Rasa, restore versions |
| owner | + share links, users |

`--host 0.0.0.0` is refused until there are users. Put TLS in front (a reverse
proxy) before exposing it. Authors on comments, versions and jobs come from the
token, not the request body.

A film can be shared only after its latest decision is "approved". The gate is on
by default when the studio has users; `.aiemcee/approvals-config.json` with
`{ "gate": false }` turns it off for one project. Share pages under `/s/` are
public by design: they serve only that one film, its poster and captions, and
accept only view events and lead submissions (validated, size-limited).
