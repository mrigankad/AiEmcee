/**
 * The API your scenes.mjs choreography is written against.
 *
 * Playwright drives a real browser but draws no cursor, so the page gets one
 * of its own: an SVG arrow injected before any page script runs, moved with
 * eased interpolation so the footage reads as a person using the product
 * rather than a robot teleporting between elements.
 */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** easeInOutQuad — slow out of rest, quick through the middle, slow into the target. */
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/**
 * Built as a string because it is injected with addInitScript and must run in
 * the page, before any application code, on every document in the context.
 */
export function cursorInitScript(tokens, hideSelectors) {
  const c = tokens.cursor;
  const size = c.size;
  const hideCss = hideSelectors.length
    ? `${hideSelectors.join(",")}{display:none!important}`
    : "";

  return `
window.__cursor = null;

function ensureCursor() {
  if (window.__cursor && document.body.contains(window.__cursor)) return window.__cursor;
  const el = document.createElement('div');
  el.setAttribute('data-capture-cursor', '');
  el.style.cssText = [
    'position:fixed','z-index:2147483647','left:0','top:0',
    'width:${size}px','height:${size}px','pointer-events:none',
    'transition:transform 40ms linear','will-change:transform'
  ].join(';');
  el.innerHTML =
    '<svg width="${size}" height="${size}" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 2 L4 17 L8.2 13.2 L11 19.5 L13.6 18.3 L10.9 12.2 L16.5 12.2 Z" ' +
    'fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.2" stroke-linejoin="round"/></svg>';
  document.body.appendChild(el);
  window.__cursor = el;
  return el;
}

window.__cursorTo = (x, y) => {
  ensureCursor().style.transform = 'translate(' + x + 'px,' + y + 'px)';
};

window.__cursorRipple = (x, y) => {
  const r = document.createElement('div');
  r.style.cssText =
    'position:fixed;z-index:2147483646;left:' + (x - 14) + 'px;top:' + (y - 14) + 'px;' +
    'width:28px;height:28px;border-radius:999px;border:2px solid ${c.ripple};' +
    'pointer-events:none;transition:transform 420ms ease-out,opacity 420ms ease-out';
  document.body.appendChild(r);
  requestAnimationFrame(() => { r.style.transform = 'scale(2.2)'; r.style.opacity = '0'; });
  setTimeout(() => r.remove(), 460);
};

const hide = document.createElement('style');
hide.textContent = ${JSON.stringify(hideCss)};
document.documentElement.appendChild(hide);
`;
}

export class Scene {
  constructor(page, config) {
    this.page = page;
    this.config = config;
    this.x = config.capture.viewport.width / 2;
    this.y = config.capture.viewport.height / 2;
  }

  /** Pause. Seconds, because narration is written in seconds. */
  async wait(seconds) {
    await sleep(seconds * 1000);
  }

  /** Navigate to a path relative to capture.baseUrl, then let the page settle. */
  async goto(urlPath) {
    await this.page.goto(this.config.capture.baseUrl + urlPath, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    // Pages with live timers or polling never reach networkidle, so settle on
    // a fixed beat instead of waiting for a state that will not arrive.
    await sleep(this.config.capture.settleAfterNavigation * 1000);
  }

  /** Glide the virtual cursor to an absolute viewport coordinate. */
  async cursorTo(x, y, ms = 520) {
    const steps = Math.max(8, Math.round(ms / 16));
    const x0 = this.x;
    const y0 = this.y;

    for (let i = 1; i <= steps; i++) {
      const e = ease(i / steps);
      const nx = x0 + (x - x0) * e;
      const ny = y0 + (y - y0) * e;
      await this.page.evaluate(([a, b]) => window.__cursorTo(a, b), [nx, ny]);
      await this.page.mouse.move(nx, ny);
      await sleep(16);
    }

    this.x = x;
    this.y = y;
  }

  /** Scroll an element into view and glide the cursor onto it. */
  async moveTo(selector, opts = {}) {
    const el = this.page.locator(selector).first();
    await el.waitFor({ state: "visible", timeout: opts.timeout ?? 15000 });
    await el.scrollIntoViewIfNeeded();
    await sleep(180);

    const box = await el.boundingBox();
    if (!box) return null;

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await this.cursorTo(x, y, opts.ms ?? 520);
    return { el, x, y };
  }

  /** Move, ripple, click, then hold. `after` is the hold in milliseconds. */
  async click(selector, opts = {}) {
    const hit = await this.moveTo(selector, opts);
    if (!hit) return;

    await this.page.evaluate(([a, b]) => window.__cursorRipple(a, b), [hit.x, hit.y]);
    await sleep(120);
    // force: true because the ripple element can briefly sit over the target.
    await hit.el.click({ force: true }).catch(() => {});
    await sleep(opts.after ?? 420);
  }

  /** Clear a field and type into it at a human cadence. */
  async type(selector, text, delay = 55) {
    const hit = await this.moveTo(selector);
    if (!hit) return;

    await hit.el.click({ force: true }).catch(() => {});
    await hit.el.fill("");
    await hit.el.pressSequentially(text, { delay });
    await sleep(260);
  }

  /**
   * Eased scroll to an absolute offset.
   *
   * With no selector, the largest actually-scrollable element wins — marketing
   * pages usually scroll the document, app shells usually scroll <main>, and
   * guessing wrong produces a clip where nothing moves.
   */
  async scroll(to, ms = 1200, selector = null) {
    await this.page.evaluate(
      async ([target, duration, sel]) => {
        const pick = () => {
          if (sel) return document.querySelector(sel);

          let best = document.scrollingElement;
          let bestDelta = best ? best.scrollHeight - best.clientHeight : 0;

          for (const el of document.querySelectorAll("main,div")) {
            if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
            const delta = el.scrollHeight - el.clientHeight;
            if (delta > bestDelta) {
              best = el;
              bestDelta = delta;
            }
          }
          return best;
        };

        const scroller = pick() ?? document.documentElement;
        const start = scroller.scrollTop;
        const delta = target - start;
        const t0 = performance.now();

        await new Promise((done) => {
          const step = (now) => {
            const t = Math.min(1, (now - t0) / duration);
            const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
            scroller.scrollTop = start + delta * e;
            if (t < 1) requestAnimationFrame(step);
            else done();
          };
          requestAnimationFrame(step);
        });
      },
      [to, ms, selector],
    );
  }

  /** Drag a range input through a series of positions, cursor following. */
  async dragSlider(selector, fractions, ms = 420) {
    const slider = this.page.locator(selector).first();
    const box = await slider.boundingBox();
    if (!box) return;

    const y = box.y + box.height / 2;
    await this.cursorTo(box.x + box.width * 0.5, y, 500);

    for (const frac of fractions) {
      await this.cursorTo(box.x + box.width * frac, y, ms);
      await slider.fill(String(Math.round(frac * 100)));
      await sleep(160);
    }
  }

  /** Convenience selector for the scroll region of a typical app shell. */
  get main() {
    return "main";
  }
}
