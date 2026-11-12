/**
 * Choreography: what the browser does in each `from: "capture"` scene.
 *
 * Run narrate first and read each line's length: that is the scene's budget.
 * Hold after every action; never race the narration (capture pads the tail).
 *
 * The `s` argument is a Scene (scripts/lib/scene.mjs):
 *   s.goto(path)                 navigate, relative to capture.baseUrl
 *   s.wait(seconds)              hold
 *   s.click(sel, { after })      glide the cursor, ripple, click, hold `after` ms
 *   s.type(sel, text, delayMs)   type at a human cadence
 *   s.moveTo(sel)                glide the cursor onto something
 *   s.scroll(offset, ms, sel?)   eased scroll
 *   s.dragSlider(sel, [0.4, 0.7])
 */
export const SCENES = {
  "01-hello": async (s) => {
    await s.goto("/");
    await s.wait(1.5);
    await s.moveTo("main");
    await s.wait(2.0);
  },
};
