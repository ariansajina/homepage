// Behaviour of the dev-only stain preview (/dev/stain). Uses the same model as the
// landing page (src/lib/stain-model.ts), so what you see here is what visitors get.
import {
  planStain,
  clearedAt,
  stageAt,
  maskAlpha,
  loadImage,
  seededRandom,
  type StainPlan,
} from "../lib/stain-model";
import type { StainConfig } from "../lib/landing-config";

type Settings = { stain: StainConfig; mask: string; maskSize: { width: number; height: number } };

const root = document.querySelector<HTMLElement>("[data-preview]")!;
const { stain: initial, mask, maskSize }: Settings = JSON.parse(root.dataset.preview!);
const form = root.querySelector<HTMLFormElement>("[data-form]")!;
const canvas = root.querySelector<HTMLCanvasElement>("[data-cover]")!;
const frame = root.querySelector<HTMLElement>(".frame")!;
const originDot = root.querySelector<HTMLElement>("[data-origin]")!;
const timeInput = root.querySelector<HTMLInputElement>("[data-time]")!;
const status = root.querySelector<HTMLOutputElement>("[data-status]")!;
const playBtn = root.querySelector<HTMLButtonElement>("[data-play]")!;
const speedSel = root.querySelector<HTMLSelectElement>("[data-speed]")!;
const yamlOut = root.querySelector<HTMLTextAreaElement>("[data-yaml]")!;

let cfg: StainConfig = structuredClone(initial);
// Without a fixed seed, pick one so the shape on screen can be pinned by copying it.
let seed = cfg.seed ?? Math.floor(Math.random() * 1e9);
let plan: StainPlan | null = null;
let image: HTMLImageElement | null = null;
let t = 0; // seconds since page load (the slider)
let playing = true;
let last = performance.now();

const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const NUMBERS = [
  "delaySeconds",
  "growSeconds",
  "restSeconds",
  "acceleration",
  "preludeShare",
  "raggedness",
  "lobes",
  "resolution",
] as const;

function fillForm() {
  for (const n of NUMBERS) field(n).value = String(cfg[n]);
  field("origin.x").value = String(cfg.origin.x);
  field("origin.y").value = String(cfg.origin.y);
  field("seed").value = cfg.seed === null ? "" : String(cfg.seed);
  field("seed").placeholder = `random (now ${seed})`;
}

function readForm(): { reshape: boolean } {
  const before = JSON.stringify([cfg.origin, cfg.raggedness, cfg.lobes, cfg.resolution, cfg.seed]);
  for (const n of NUMBERS) {
    const v = Number(field(n).value);
    if (Number.isFinite(v)) cfg[n] = v;
  }
  cfg.restSeconds = Math.min(cfg.restSeconds, cfg.growSeconds - 1);
  cfg.origin = { x: Number(field("origin.x").value), y: Number(field("origin.y").value) };
  const s = field("seed").value.trim();
  cfg.seed = s === "" ? null : Math.trunc(Number(s));
  if (cfg.seed !== null) seed = cfg.seed;
  const after = JSON.stringify([cfg.origin, cfg.raggedness, cfg.lobes, cfg.resolution, cfg.seed]);
  return { reshape: before !== after };
}

function writeYaml() {
  yamlOut.value = [
    "stain:",
    `  delaySeconds: ${cfg.delaySeconds}`,
    `  growSeconds: ${cfg.growSeconds}`,
    `  restSeconds: ${cfg.restSeconds}`,
    `  origin: { x: ${cfg.origin.x}, y: ${cfg.origin.y} }`,
    `  acceleration: ${cfg.acceleration}`,
    `  preludeShare: ${cfg.preludeShare}`,
    `  raggedness: ${cfg.raggedness}`,
    `  lobes: ${cfg.lobes}`,
    `  resolution: ${cfg.resolution}`,
    `  seed: ${cfg.seed === null ? `null # this shape: ${seed}` : cfg.seed}`,
  ].join("\n");
}

function replan() {
  const W = cfg.resolution;
  const H = Math.round((W * maskSize.height) / maskSize.width);
  canvas.width = W;
  canvas.height = H;
  const started = performance.now();
  plan = planStain(image ? maskAlpha(image, W, H) : null, W, H, cfg, seededRandom(seed));
  console.info(`stain planned: ${W}×${H} in ${Math.round(performance.now() - started)} ms`);
  originDot.style.left = `${cfg.origin.x * 100}%`;
  originDot.style.top = `${cfg.origin.y * 100}%`;
  fillForm();
}

function draw() {
  if (!plan) return;
  const total = cfg.delaySeconds + cfg.growSeconds;
  timeInput.max = String(total);
  timeInput.value = String(t);
  const since = t - cfg.delaySeconds;
  const n = clearedAt(plan, since, cfg);
  // Repaint from scratch each frame so scrubbing backwards works.
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(plan.width, plan.height);
  img.data.fill(255);
  for (let q = 0; q < n; q++) img.data[plan.order[q] * 4 + 3] = 0;
  ctx.putImageData(img, 0, 0);
  const stage = stageAt(plan, since, cfg);
  // Share of the visible shape that is clear (binary search: visible positions below n).
  let lo = 0,
    hi = plan.visible.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (plan.visible[mid] < n) lo = mid + 1;
    else hi = mid;
  }
  const pct = plan.visible.length ? (lo / plan.visible.length) * 100 : 100;
  status.value = `t = ${t.toFixed(1)} s · ${stage} · ${pct.toFixed(1)}% of the shape clear`;
  writeYaml();
}

function frameLoop(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  if (playing) {
    const total = cfg.delaySeconds + cfg.growSeconds;
    t = Math.min(total, t + dt * Number(speedSel.value));
    if (t >= total) setPlaying(false);
  }
  draw();
  requestAnimationFrame(frameLoop);
}

function setPlaying(p: boolean) {
  playing = p;
  playBtn.textContent = p ? "pause" : "play";
}

root.querySelector<HTMLInputElement>("[data-ghost]")!.addEventListener("change", (ev) => {
  frame.classList.toggle("ghost", (ev.target as HTMLInputElement).checked);
});
playBtn.addEventListener("click", () => setPlaying(!playing));
root.querySelector("[data-restart]")!.addEventListener("click", () => {
  t = 0;
  setPlaying(true);
});
timeInput.addEventListener("input", () => {
  t = Number(timeInput.value);
  setPlaying(false);
});
form.addEventListener("change", () => {
  if (readForm().reshape) replan();
});
root.querySelector("[data-reseed]")!.addEventListener("click", () => {
  cfg.seed = null;
  seed = Math.floor(Math.random() * 1e9);
  replan();
});
frame.addEventListener("click", (ev) => {
  const r = frame.getBoundingClientRect();
  cfg.origin = {
    x: Math.round(((ev.clientX - r.left) / r.width) * 1000) / 1000,
    y: Math.round(((ev.clientY - r.top) / r.height) * 1000) / 1000,
  };
  replan();
});

loadImage(mask).then((img) => {
  image = img;
  replan();
  setPlaying(true);
  requestAnimationFrame(frameLoop);
});
