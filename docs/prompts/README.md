# Prompt library

Copy-paste prompts for driving this repo with Claude Code. Fill in the
`<angle brackets>`, delete what does not apply.

Read **[08 Prompting Claude](../08-prompting-claude.md)** first — it explains
why these are shaped the way they are.

| Prompt | Produces | Verify with |
| --- | --- | --- |
| **[01 Script](01-script.md)** | `narration.json` | `npm run narrate` |
| **[02 Choreography](02-choreography.md)** | `video.config.mjs` + `scenes.mjs` | `npm run capture` |
| **[03 Motion](03-remotion.md)** | Remotion compositions | `npm run motion` |
| **[04 Design system](04-design-system.md)** | `design.tokens.json` + font swap | a rendered frame |
| **[05 Fix and iterate](05-fix-and-iterate.md)** | targeted fixes | the matching command |

## Run them in this order

```
01 script  →  narrate, listen
02 config + choreography  →  capture, watch
03 motion  →  render, check a frame
04 brand   →  render, check a frame
05 iterate →  as needed
```

The script has to come first. Scene lengths come from it, and re-cutting
choreography after a script rewrite is the whole job twice.

## Two rules

**Give Claude the product.** It cannot see your app. Point it at the product's
repo, or paste the routes and selectors. Everything else it can infer; this it
cannot.

**End every prompt with the verification command.** "Then run `npm run narrate`
and show me the wpm column" turns a guess into a checkable result.
