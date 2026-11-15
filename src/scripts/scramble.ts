// Landing menu: one item at a time goes from its resting word to a foreign one and back,
// letters scrambling through a mixed Latin/Cyrillic/Glagolitic pool on the way, then a
// pause, then the next item. The foreign languages rotate so every item shows all of
// them over time. Words and timings come from src/config/landing.yaml (via data-scramble).
import type { LandingConfig } from "../lib/landing-config";

type Settings = { words: string[][]; timing: LandingConfig["scramble"] };

type Job = { target: string[]; resolve: number[]; end: number };

let stop: (() => void) | null = null;

function start(menu: HTMLElement) {
  const { words, timing }: Settings = JSON.parse(menu.dataset.scramble || "{}");
  const PAUSE_MS = timing.pauseSeconds * 1000;
  const HOLD_MS = timing.holdSeconds * 1000;
  const SCRAMBLE_MS = timing.scrambleMs;
  // Only the visible text changes. Each link keeps its resting word as its accessible
  // name (aria-label, set in index.astro), so screen readers get a stable menu.
  const spans = [...menu.querySelectorAll<HTMLElement>("a > span")];
  const texts = words.map((w) => [...w[0]]);
  const jobs: (Job | null)[] = words.map(() => null);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pool = [...timing.letters];
  let bag: number[] = [];
  let last = -1;
  let turn = 0;
  let cycle: number | undefined;

  // Random order that still gives every item a turn before any repeats.
  const nextItem = () => {
    if (bag.length === 0) {
      bag = words.map((_, i) => i);
      for (let k = bag.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [bag[k], bag[r]] = [bag[r], bag[k]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === last)
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    last = bag.pop()!;
    return last;
  };

  const goTo = (i: number, lang: number) => {
    const target = [...words[i][lang]];
    if (reduced) {
      texts[i] = target;
      spans[i].textContent = target.join("");
      return;
    }
    const len = Math.max(texts[i].length, target.length);
    const t0 = performance.now();
    const resolve = Array.from(
      { length: len },
      (_, j) =>
        t0 +
        SCRAMBLE_MS * 0.35 +
        (j / Math.max(len - 1, 1)) * SCRAMBLE_MS * 0.65 +
        Math.random() * 120,
    );
    jobs[i] = { target, resolve, end: Math.max(...resolve) };
  };

  const step = () => {
    const now = performance.now();
    jobs.forEach((job, i) => {
      if (!job) return;
      let out = "";
      for (let j = 0; j < job.resolve.length; j++) {
        const t = job.target[j];
        if (now >= job.resolve[j]) out += t ?? "";
        else if (t === " ") out += " ";
        else out += pool[Math.floor(Math.random() * pool.length)];
      }
      if (now >= job.end) {
        out = job.target.join("");
        jobs[i] = null;
      }
      if (spans[i].textContent !== out) spans[i].textContent = out;
      texts[i] = [...out];
    });
  };

  const arm = () => {
    cycle = window.setTimeout(() => {
      const i = nextItem();
      const lang = 1 + (turn % (words[i].length - 1));
      turn += 1;
      const anim = SCRAMBLE_MS + 150;
      goTo(i, lang);
      cycle = window.setTimeout(() => {
        goTo(i, 0);
        cycle = window.setTimeout(arm, anim);
      }, anim + HOLD_MS);
    }, PAUSE_MS);
  };

  const tick = window.setInterval(step, 40);
  arm();
  return () => {
    window.clearInterval(tick);
    window.clearTimeout(cycle);
  };
}

document.addEventListener("astro:page-load", () => {
  stop?.();
  stop = null;
  const menu = document.querySelector<HTMLElement>("[data-scramble]");
  if (menu) stop = start(menu);
});
document.addEventListener("astro:before-swap", () => {
  stop?.();
  stop = null;
});
