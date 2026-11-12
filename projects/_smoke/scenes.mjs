/** Smoke choreography: one captured scene against the local fixture in ./site. */
export const SCENES = {
  "01-ui": async (s) => {
    await s.goto("/");
    await s.wait(1.2);
    await s.moveTo("#tiny table");
    await s.wait(1.5);
    await s.click("#go", { after: 900 });
    await s.wait(1.5);
    await s.moveTo("#tiny");
    await s.wait(1.0);
  },
};
