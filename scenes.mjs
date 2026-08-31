/**
 * Choreography: what the browser does during each captured scene.
 *
 * One exported function per scene id. Only ids marked `from: "capture"` in
 * video.config.mjs are recorded — motion scenes are Remotion's job.
 *
 * How to write one
 * ----------------
 * Run `npm run narrate` first and read the printed length for the scene. That
 * number is your budget. Then storyboard the line into beats and give each
 * beat roughly the seconds it is spoken over:
 *
 *   "It crawls every page"        -> land on the crawl view, hold 3s
 *   "maps complete journeys"      -> scroll to the map, hold 2s
 *   "and discovers your APIs"     -> click the API tab, hold 2s
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
 */

export const SCENES = {
  "01-hook": async (s) => {
    await s.goto("/");
    await s.wait(0.9);

    // Typing into the hero field is the whole product promise in one gesture.
    await s.type("#hero-url", "https://acme.demo", 70);
    await s.moveTo("form button");
    await s.wait(0.6);

    await s.scroll(420, 1600);
    await s.wait(0.8);
  },

  "03-onboarding": async (s) => {
    await s.goto("/onboarding");
    await s.wait(0.9);

    await s.click("text=Continue", { after: 700 });
    await s.click("text=Paste a live URL", { after: 600 });
    await s.wait(0.9);

    await s.click("text=Continue", { after: 800 });
    await s.wait(0.9);
  },

  "04-feature": async (s) => {
    await s.goto("/projects/demo/discovery");
    // This page animates itself for about ten seconds; the scene's only job is
    // to arrive on time and get out of the way.
    await s.wait(9.8);
    await s.wait(1.2);
  },

  "05-cta": async (s) => {
    await s.goto("/");
    await s.wait(1.2);

    // Close the loop: the same field as the opening shot, now addressed to
    // the viewer's own app.
    await s.type("#hero-url", "https://your-app.com", 65);
    await s.moveTo("form button");
    await s.wait(1.6);
  },
};
