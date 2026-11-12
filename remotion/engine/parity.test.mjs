/**
 * The runtime's maths (spring, interpolate, Easing) must match what the scenes
 * were timed against: Remotion 4.0.518, the engine before AiEmcee Motion.
 * Its outputs are frozen in parity.golden.json: every spring config and
 * easing the scenes use, frame by frame.
 *
 *   node remotion/engine/parity.test.mjs            check against the golden file
 *   node remotion/engine/parity.test.mjs --record   rewrite it from an installed
 *                                                   `remotion` package (one-off)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN = path.join(here, "parity.golden.json");

/** Every case: [kind, args]. The same list drives recording and checking. */
function cases() {
  const tones = JSON.parse(fs.readFileSync(path.join(here, "..", "src", "film", "tones.json"), "utf8"));
  const springs = [
    {},
    ...Object.values(tones).map((t) => t.spring).filter(Boolean),
    { damping: 16, mass: 0.8, stiffness: 90 },
    { damping: 18, mass: 0.5, stiffness: 160 },
    { damping: 11, mass: 0.8, stiffness: 120 },
    { damping: 9, mass: 0.6, stiffness: 150 },
    { damping: 14, mass: 0.7, stiffness: 140 },
    { damping: 16, mass: 0.8, stiffness: 120 },
    { damping: 11, mass: 0.5, stiffness: 200 },
    { damping: 16, mass: 0.6, stiffness: 140 },
    { damping: 18, mass: 0.7, stiffness: 120 },
    { damping: 20, mass: 0.6, stiffness: 150 },
    { damping: 200, mass: 1, stiffness: 100 },
    { damping: 12, mass: 1, stiffness: 100, overshootClamping: true },
  ];
  const out = [];
  for (const config of springs) {
    for (const fps of [30, 60]) {
      for (let k = -10; k < 480; k++) out.push(["spring", { frame: k / 2, fps, config }]);
      for (let f = 0; f < 120; f++) out.push(["spring", { frame: f, fps, config, from: 20, to: -40 }]);
    }
  }
  const curves = [[0.33, 0, 0.3, 1], [0.45, 0, 0.25, 1], [0.5, 0, 0.9, 0.5], [0.16, 1, 0.3, 1], [0.65, 0, 0.35, 1], [0.6, 0, 0.2, 1], [0.5, 0, 0.8, 0.6], [0.5, 0, 0.6, 1], [0.45, 0, 0.2, 1], [0.3, 0, 0.5, 1], [0.2, 0.7, 0.3, 1], [0.42, 0, 1, 1]];
  const named = ["linear", "out(cubic)", "inOut(quad)", "inOut(cubic)", "in(sin)", "out(exp)", "inOut(circle)", "bounce", "out(back(1.5))", "elastic(1)", "ease"];
  for (let k = -100; k <= 1100; k++) {
    const t = k / 1000;
    for (const c of curves) out.push(["bezier", { c, t }]);
    for (const n of named) out.push(["easing", { n, t }]);
  }
  const opts = [{}, { extrapolateLeft: "clamp", extrapolateRight: "clamp" }, { extrapolateRight: "clamp" }, { extrapolateLeft: "identity" }, { easing: "out(cubic)", extrapolateLeft: "clamp", extrapolateRight: "clamp" }];
  const ranges = [[[0, 1], [0, 100]], [[10, 40], [1, 0]], [[0, 12, 30, 60], [0, 1, 1, 0]], [[-20, 0, 20], [-1, 0.5, 3]]];
  for (const [inR, outR] of ranges) for (let k = -160; k <= 360; k++) for (const o of opts) out.push(["interpolate", { x: k / 4, inR, outR, o }]);
  return out;
}

function named(E, n) {
  return { linear: E.linear, "out(cubic)": E.out(E.cubic), "inOut(quad)": E.inOut(E.quad), "inOut(cubic)": E.inOut(E.cubic), "in(sin)": E.in(E.sin), "out(exp)": E.out(E.exp), "inOut(circle)": E.inOut(E.circle), bounce: E.bounce, "out(back(1.5))": E.out(E.back(1.5)), "elastic(1)": E.elastic(1), ease: E.ease }[n];
}

function evaluate(lib, [kind, a]) {
  if (kind === "spring") return lib.spring(a);
  if (kind === "bezier") return lib.Easing.bezier(...a.c)(a.t);
  if (kind === "easing") return named(lib.Easing, a.n)(a.t);
  const o = { ...a.o, ...(a.o.easing ? { easing: named(lib.Easing, a.o.easing) } : {}) };
  return lib.interpolate(a.x, a.inR, a.outR, o);
}

const list = cases();

if (process.argv.includes("--record")) {
  const remotion = await import("remotion");
  fs.writeFileSync(GOLDEN, JSON.stringify({ source: "remotion 4.0.518", values: list.map((c) => evaluate(remotion, c)) }));
  console.log(`recorded ${list.length} values -> ${path.relative(process.cwd(), GOLDEN)}`);
  process.exit(0);
}

// Inside the scene package, so the bundle's external imports (react) resolve.
const cache = path.join(here, "..", "node_modules", ".cache");
fs.mkdirSync(cache, { recursive: true });
const out = path.join(cache, `motion-parity-${process.pid}.mjs`);
await esbuild.build({ entryPoints: [path.join(here, "runtime.tsx")], bundle: true, format: "esm", platform: "node", outfile: out, jsx: "automatic", logLevel: "error", packages: "external", absWorkingDir: path.join(here, "..") });
const ours = await import(pathToFileURL(out).href);
fs.rmSync(out);

const golden = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));
if (golden.values.length !== list.length) throw new Error(`golden file has ${golden.values.length} values, the cases ${list.length}: re-record`);
let worst = 0;
list.forEach((c, i) => {
  const d = Math.abs(evaluate(ours, c) - golden.values[i]);
  worst = Math.max(worst, d);
  if (!(d < 1e-9)) throw new Error(`${c[0]} ${JSON.stringify(c[1])}: ours ${evaluate(ours, c)} vs ${golden.source} ${golden.values[i]}`);
});
console.log(`parity ok: ${list.length} values match ${golden.source}, worst difference ${worst.toExponential(2)}`);
