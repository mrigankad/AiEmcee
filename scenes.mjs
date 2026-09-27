/**
 * Choreography: what the browser does during each captured scene.
 *
 * This film has none. RE-DOMS is not running on this machine, so every product
 * scene is cut out of the existing screen recording instead — see the
 * `from: "clip"` entries in video.config.mjs and scripts/clip.mjs.
 *
 * When RE-DOMS can be run in production mode against capture.baseUrl, moving a
 * scene to live capture is two edits: flip its `from` to "capture" in
 * video.config.mjs, and write its function here. Everything downstream —
 * timing, lower thirds, the cut — is identical either way, because both
 * sources land the same file in raw/.
 *
 * How to write one
 * ----------------
 * Run `npm run narrate` first and read the printed length for the scene. That
 * number is your budget. Then storyboard the line into beats and give each
 * beat roughly the seconds it is spoken over:
 *
 *   "Type any module serial number"   -> type into the search box, hold 2s
 *   "and the whole history comes back" -> submit, hold 3s
 *   "and the electroluminescence image" -> scroll to the EL panel, hold 3s
 *
 * Rules that keep footage watchable
 * ---------------------------------
 * - Hold after every action. A click with no pause is invisible at speed.
 * - One idea per scene. If you need two, that is two scenes.
 * - Never race the narration. Overrunning is fine, capture.mjs pads the tail;
 *   finishing early leaves a frozen frame while the voice is still talking.
 * - Prefer text= and role selectors over CSS. They survive a redesign, and
 *   they read as intent when someone else opens this file.
 *
 * The `s` argument is a Scene — see scripts/lib/scene.mjs:
 *   s.goto(path)                       navigate, relative to capture.baseUrl
 *   s.wait(seconds)                    hold
 *   s.click(sel, { after })            glide, ripple, click, hold `after` ms
 *   s.type(sel, text, delayMs)         type at a human cadence
 *   s.moveTo(sel)                      glide the cursor onto something
 *   s.scroll(offset, ms, sel?)         eased scroll, auto-picks the scroller
 *   s.dragSlider(sel, [0.4, 0.7])      drag a range input
 *   s.main                             "main", the usual app-shell scroller
 *
 * A worked example, for when the app is available:
 *
 *   "04-traceability": async (s) => {
 *     await s.goto("/traceability");
 *     await s.wait(1.4);
 *     await s.type("input[placeholder*='Scan or Search']", "WS09249038922215", 60);
 *     await s.click("button[type=submit]", { after: 1200 });
 *     await s.wait(3.2);                          // the EL image resolves
 *     await s.scroll(320, 1400, s.main);          // down to the flash values
 *     await s.wait(2.4);
 *   },
 */

export const SCENES = {};
