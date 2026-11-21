# Styles, templates and boards

AiEmcee ships film **styles**. Each style draws the same five **scene templates**
with the same props, so a film can change style without being rewritten. A
**board** is one scene of a film as data: a template, its props and a status.
The agent edits boards, the studio shows them live, and the film renders them.

Design reference: Paper file "AiEmcee Studio", page "22 · Boards · in-app canvas & templates".

## Pieces and where they live

| Piece | Path |
|---|---|
| Template + style contract | `remotion/src/templates/types.ts` |
| Style catalog (labels, swatches, example props) | `remotion/src/templates/catalog.json` |
| Style registry | `remotion/src/templates/registry.ts` |
| Shared drawing kit (isometric blocks, text, layout) | `remotion/src/templates/kit/` |
| Styles | `remotion/src/templates/styles/<style-id>/index.tsx` exports `style: StyleDef` |
| GSAP on the film clock | `remotion/src/motion/gsap.ts` (`useGsapTimeline`, `beatAt`) |
| Emcee Glyphs (icon data) | `assets/glyphs/emcee-glyphs.json` |
| Emcee Glyphs (film component) | `remotion/src/glyphs/Glyph.tsx` |
| Boards file | `projects/<film>/boards.json` |
| Boards server logic | `studio/lib/boards.mjs` |

## Styles (v1)

`iso-clay`, `iso-blueprint`, `swiss`, `glass`, `hand-drawn`, `dark-cinematic`.
Templates: `hero`, `pipeline`, `stack`, `metrics`, `endcard` (props in `types.ts`).

Rules for every template:

- 1920×1080 design space; the film may render at other sizes, so lay out in that space and scale.
- All motion is one paused GSAP timeline from `useGsapTimeline`. No `Date.now`, no CSS
  transitions or animations, no `requestAnimationFrame`, no GSAP ticker: the frame is the only clock.
- Times come from `beatAt(props.beats, "<name>", fallback)` using the beat names in `catalog.json`.
  Entrances finish by ~2.5 s by default; a scene must look complete and calm from ~3 s on,
  with at most slow ambient motion (float, drift) after that.
- Fonts: Geist (`fontSans` from `remotion/src/fonts.ts`) unless the style says otherwise.
- `props.accent` overrides the style's accent.
- Icons: Emcee Glyphs only, via `<Glyph name stroke accent size draw? />`.
- Text must fit: long labels shrink or wrap within their box, never overflow the frame.

## Using templates in a film

In `video.config.mjs`:

```js
style: "iso-clay",                      // film default, optional
sequence: [
  { id: "01-hook", from: "motion", template: "hero", props: { headline: "…" } },
  { id: "02-how",  from: "motion", template: "pipeline", style: "iso-blueprint", props: { steps: [ … ] } },
  { id: "03-arch", from: "board" },     // template, style and props come from boards.json
]
```

Style resolution: entry `style` → board `style` → `boards.json` `style` → config `style` → `catalog.defaultStyle`.
Every id still needs a line in `narration.json`; the narration sets the scene length.

## boards.json

```json
{
  "version": 1,
  "style": "iso-clay",
  "boards": [
    {
      "id": "01-hook",
      "template": "hero",
      "style": "swiss",
      "props": { "headline": "Every release, on the record." },
      "status": "draft",
      "notes": "free text from the agent"
    }
  ]
}
```

`status` is `draft` | `approved`. A board's `id` matches a narration line and a sequence entry.

## Studio API (studio/server.mjs)

| Method and path | Body | Returns |
|---|---|---|
| `GET /api/styles` | | `catalog.json` as is |
| `POST /api/projects` | `{ name, title?, style?, brief?, baseUrl? }` | `{ name }`; scaffolds `projects/<slug>/` from `projects/_template`, writes `boards.json` with one board per template (catalog example props), a matching `narration.json` and a `sequence` of `from: "board"` entries |
| `GET /api/projects/:p/boards` | | `boards.json` (empty `{version:1, boards:[]}` if missing) |
| `POST /api/projects/:p/boards/ops` | `{ ops: Op[] }` | the new `boards.json`; also publishes SSE event `boards` `{ project, boards, ops, by }` |
| `GET /api/projects/:p/boards/:id/still.png?t=<seconds>` | | PNG preview of that board at time t (cached by content hash) |

```ts
type Op =
  | { op: "add"; board: Board; index?: number }
  | { op: "update"; id: string; patch: { template?; style?; props?; status?; notes? } } // props deep-merge; arrays replace
  | { op: "remove"; id: string }
  | { op: "move"; id: string; index: number };
```

Ops are validated (known template and style, required props present, list lengths in range),
applied atomically, appended to `projects/<p>/.aiemcee/board-ops.jsonl` and snapshotted for undo.
Adding a board also adds its narration line (placeholder text) and sequence entry, and removing one removes them.

The chat agent (`studio/agent.mjs`) gets the same ops as tools: `boards_get`, `boards_catalog`,
`boards_apply`.

## Memory: lean mode

`AIEMCEE_PROFILE=lean|standard|auto` (default `auto`: lean below 12 GB total RAM). Lean caps render
concurrency at 2, the video cache at 512 MB, captures drafts at 1× before the master, and runs heavy
stages at below-normal priority. See `scripts/lib/resources.mjs`.

## Desktop

`desktop/` builds `AiEmcee.exe`: a Node single-executable launcher that starts the studio and opens it
in an Edge `--app` window (no Electron). See `desktop/README.md`.
