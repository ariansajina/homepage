// Landing menu: one item at a time goes English -> a foreign language -> back to English,
// letters scrambling through a mixed Latin/Cyrillic/Glagolitic pool on the way, then a
// pause, then the next item. Foreign languages rotate (German, Italian, Croatian Latin,
// Cyrillic, Glagolitic) so every item shows all of them over time.

const PAUSE_MS = 3000; // between items
const HOLD_MS = 4000; // how long a foreign word stays
const SCRAMBLE_MS = 800; // one scramble

const POOL =
  "abcdefghilmnoprstuvzčšž" + "абвгдежзиклмнопрстуфхцчшњљ" + "ⰰⰱⰲⰳⰴⰵⰶⰸⰹⰻⰼⰽⰾⰿⱀⱁⱂⱃⱄⱅⱆⱇⱈⱌⱍⱎ";

type Job = { target: string[]; resolve: number[]; end: number };

let stop: (() => void) | null = null;

function start(menu: HTMLElement) {
  const words: string[][] = JSON.parse(menu.dataset.scramble || "[]");
  const links = [...menu.querySelectorAll<HTMLAnchorElement>("a")];
  const spans = links.map((a) => a.querySelector("span")!);
  const texts = words.map((w) => [...w[0]]);
  const jobs: (Job | null)[] = words.map(() => null);
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pool = [...POOL];
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
    links[i].setAttribute("aria-label", words[i][lang]);
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
      const lang = 1 + (turn % 5);
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

export {};
