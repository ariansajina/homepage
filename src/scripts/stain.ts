// Landing stain driver: paints a white cover over the masked video and clears it pixel
// by pixel, following the model in src/lib/stain-model.ts with the settings from
// src/config/landing.yaml (passed in on the canvas as data-stain).
//
// The shape is planned once per tab and the clock starts at the first landing visit, so
// leaving the landing page and coming back picks up where the stain was.
import {
  planStain,
  clearedAt,
  maskAlpha,
  loadImage,
  seededRandom,
  type StainPlan,
} from "../lib/stain-model";
import type { StainConfig } from "../lib/landing-config";

let planning: Promise<StainPlan> | null = null;
let t0 = 0; // when the landing page was first shown
let stop: (() => void) | null = null;

function start(canvas: HTMLCanvasElement) {
  const cfg: StainConfig = JSON.parse(canvas.dataset.stain || "{}");
  const mask = canvas.dataset.mask || "";
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    canvas.style.display = "none";
    return () => {};
  }
  const W = canvas.width,
    H = canvas.height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  if (!t0) t0 = performance.now();
  if (!planning)
    planning = loadImage(mask).then((img) =>
      planStain(
        img ? maskAlpha(img, W, H) : null,
        W,
        H,
        cfg,
        cfg.seed === null ? Math.random : seededRandom(cfg.seed),
      ),
    );

  let done = 0;
  let timer: number | undefined;
  let plan: StainPlan | null = null;
  const grow = () => {
    if (!plan) return;
    const n = clearedAt(plan, (performance.now() - t0) / 1000 - cfg.delaySeconds, cfg);
    if (n >= plan.order.length) {
      // Finished (also when coming back to the landing page later): drop the cover.
      window.clearInterval(timer);
      canvas.style.display = "none";
      return;
    }
    for (let q = done; q < n; q++) {
      const i = plan.order[q];
      ctx.clearRect(i % W, Math.floor(i / W), 1, 1);
    }
    done = Math.max(done, n);
  };
  let alive = true;
  planning.then((p) => {
    if (!alive) return;
    plan = p;
    grow();
    timer = window.setInterval(grow, 100);
  });
  return () => {
    alive = false;
    window.clearInterval(timer);
  };
}

document.addEventListener("astro:page-load", () => {
  stop?.();
  stop = null;
  const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-stain]");
  if (canvas) stop = start(canvas);
});
document.addEventListener("astro:before-swap", () => {
  stop?.();
  stop = null;
});
