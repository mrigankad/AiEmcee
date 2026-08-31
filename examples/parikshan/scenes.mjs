/**
 * Choreography for the Parikshan demo, as shipped.
 *
 * Read alongside narration.json and durations.json in this directory — every
 * hold below was chosen against a specific clause in a specific line.
 *
 * The patterns worth stealing are marked in the comments.
 */

const PROJECT = "/projects/shopstack";

export const SCENES = {
  /* 13.3s — the promise, acted out in the hero field. */
  "01-hook": async (s) => {
    await s.goto("/");
    await s.wait(0.9);

    // Typing a URL into the hero input IS the product's promise. It is the
    // single most valuable three seconds in the film.
    await s.type("#hero-url", "https://shopstack.demo", 70);
    await s.moveTo("form button");
    await s.wait(0.6);

    await s.scroll(420, 1600);
    await s.wait(0.8);
  },

  /* 16.2s — three clicks, each held long enough to register. */
  "03-onboarding": async (s) => {
    await s.goto("/onboarding");
    await s.wait(0.9);

    await s.click("text=Continue", { after: 700 });
    await s.wait(0.5);
    await s.click("text=Paste a live URL", { after: 600 });
    await s.click("text=Does this app need login?", { after: 900 });
    await s.wait(0.9);

    await s.click("text=Continue", { after: 800 });
    await s.wait(0.9);
  },

  /* 12.5s — the page animates itself. The scene's only job is to keep out of the way. */
  "04-discovery": async (s) => {
    await s.goto(`${PROJECT}/discovery`);
    await s.wait(9.8); // the crawl animation runs on its own
    await s.wait(1.2);
  },

  /* 13.9s — open a panel, read it, close it, open the next. */
  "05-map": async (s) => {
    await s.goto(`${PROJECT}/map`);
    await s.wait(0.9);

    await s.click("text=Checkout", { after: 900 });
    await s.wait(1.6);

    await s.click("[aria-label='Close inspector']", { after: 500 });
    await s.click("text=API inventory", { after: 900 });
    await s.wait(1.4);
  },

  /* 14.3s — show an action, not just a screen. */
  "06-plan": async (s) => {
    await s.goto(`${PROJECT}/plan`);
    await s.wait(1.1);

    await s.scroll(240, 1100, s.main);
    await s.wait(1.0);

    // The cards in the open groups are already approved, so a collapsed
    // journey is expanded to find an unapproved one to accept on camera.
    // Demoing an action beats demoing a state.
    await s.click('button:has-text("Product search")', { after: 800 });
    await s.wait(0.5);
    await s.click("button[aria-label^='Approve']", { after: 900 });
    await s.wait(0.9);

    await s.scroll(760, 1500, s.main);
    await s.wait(1.4);
  },

  /* 24.7s — the longest scene in the film, and the one that earns trust. */
  "07-prd": async (s) => {
    await s.goto(`${PROJECT}/prd`);
    await s.wait(0.7);

    await s.click("text=Analyse a PRD", { after: 550 });
    await s.click("text=Use the sample PRD", { after: 650 });
    await s.scroll(200, 700, s.main);
    await s.wait(0.9); // the sample document in view

    await s.click("text=Analyse document", { after: 400 });
    await s.wait(4.8); // six processing stages at 620ms, then the redirect
    await s.wait(0.8); // results land

    // This page scrolls an inner overflow container, not <main>, so the
    // auto-picked scroller is the right one here.
    await s.scroll(360, 900);
    await s.wait(1.7); // "could not test as written" — the honest bit

    await s.click('button:has-text("Traceability")', { after: 400 });
    await s.wait(0.25);
    await s.page.locator("text=Requirement to test coverage").first().scrollIntoViewIfNeeded();
    await s.wait(0.4);
    await s.moveTo("text=Requirement to test coverage");
    await s.wait(2.4); // hold on the matrix while the narrator lands the point
  },

  /* 11.3s — point at the thing being discussed. */
  "08-code": async (s) => {
    await s.goto(`${PROJECT}/tests/tc-checkout-expired`);
    await s.wait(1.4);

    await s.scroll(260, 1500, s.main);
    await s.wait(2.2);

    // The cursor is the pointing finger. No click needed.
    await s.moveTo("text=Copy");
    await s.wait(1.2);
  },

  /* 11.3s — arrive, then let the shards flip in. */
  "09-run": async (s) => {
    await s.goto(`${PROJECT}/runs/137`);
    await s.wait(4.2); // shards flip one by one
    await s.scroll(320, 1400, s.main);
    await s.wait(2.4);
  },

  /* 20.6s — four locations in one scene, because the narration links them. */
  "10-triage": async (s) => {
    await s.goto(`${PROJECT}/runs/137/results/tc-checkout-expired`);
    await s.wait(1.6);

    // Overshoot and settle: past the target, back, then land. That is what a
    // person does with a comparison slider; a linear sweep is not.
    await s.dragSlider("input[type=range]", [0.62, 0.74, 0.4, 0.55]);
    await s.wait(0.9);

    await s.click("text=Heal locator", { after: 1400 });
    await s.wait(1.2);

    await s.goto(`${PROJECT}/healing`);
    await s.wait(1.0);
    await s.scroll(320, 1500, s.main);
    await s.wait(2.0);

    await s.goto(`${PROJECT}/quarantine`);
    await s.wait(2.6);
  },

  /* 9.8s — two pages, one point: it fits where you already work. */
  "11-analytics": async (s) => {
    await s.goto(`${PROJECT}/analytics`);
    await s.wait(1.2);
    await s.scroll(380, 1600, s.main);
    await s.wait(1.8);

    await s.goto(`${PROJECT}/integrations`);
    await s.wait(0.9);
    await s.scroll(980, 1800, s.main);
    await s.wait(2.2);
  },

  /* 10.8s — the opening shot again, now addressed to the viewer. */
  "12-cta": async (s) => {
    await s.goto("/");
    await s.wait(1.2);

    await s.type("#hero-url", "https://your-app.com", 65);
    await s.moveTo("form button");
    await s.wait(1.6);
  },
};
