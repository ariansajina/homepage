// Landing background: a looping video, masked to the shape of the coast, under a white
// canvas cover that is cleared pixel by pixel, like a slowly spreading stain. The stain
// is born on the island of Vis, fills it, rests, then hops to the mainland and the other
// islands and accelerates until the whole shape shows.
//
// The stain's shape is random per visit and its progress is kept for the life of the tab,
// so leaving the landing page and coming back picks up where it was.

const STAIN_DELAY_S = 9; // before the first pixel
const STAIN_HOP_S = 120; // rest once Vis is full (capped at half the grow time)
const STAIN_GROW_S = 180; // from the first pixel to the whole shape
const MASK_URL = "/stain-mask.png"; // same origin, so its pixels can be read
const VIS = { x: 0.2867, y: 0.6504 }; // the island of Vis in the mask, as fractions

type Stain = {
  W: number;
  H: number;
  order: Int32Array;
  events: { t: number; c: number }[];
  preEnd: number;
  visIdx: number[];
  vCount: number;
  eV?: number;
};

let stain: Stain | null = null; // computed once per tab
let building: Promise<Stain> | null = null;
let t0 = 0; // when the landing page was first shown

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function loadMask(W: number, H: number): Promise<Uint8ClampedArray | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const octx = off.getContext("2d")!;
      octx.drawImage(img, 0, 0, W, H);
      try {
        resolve(octx.getImageData(0, 0, W, H).data);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = MASK_URL;
  });
}

function buildStain(W: number, H: number, data: Uint8ClampedArray | null): Stain {
  // Every visit gets its own irregular outline: random angular lobes + layers of smooth noise.
  const harm: { h: number; a: number; p: number }[] = [];
  for (let h = 2; h <= 6; h++)
    harm.push({ h, a: ((Math.random() * 2 - 1) * 0.5) / h, p: Math.random() * Math.PI * 2 });
  const makeNoise = (G: number) => {
    const g: number[] = [];
    for (let i = 0; i < (G + 1) * (G + 1); i++) g.push(Math.random());
    return (x: number, y: number) => {
      const fx = (x / W) * G,
        fy = (y / H) * G;
      const x0 = Math.floor(fx),
        y0 = Math.floor(fy);
      const sx = fx - x0,
        sy = fy - y0;
      const ux = sx * sx * (3 - 2 * sx),
        uy = sy * sy * (3 - 2 * sy);
      const a = g[y0 * (G + 1) + x0],
        b = g[y0 * (G + 1) + x0 + 1];
      const c = g[(y0 + 1) * (G + 1) + x0],
        d = g[(y0 + 1) * (G + 1) + x0 + 1];
      return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
    };
  };
  const coarse = makeNoise(4),
    mid = makeNoise(11),
    fine = makeNoise(30);
  const total = W * H;
  const alpha = new Float32Array(total);
  const keys = new Float32Array(total);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const dx = (x + 0.5 - VIS.x * W) / (0.6 * W);
      const dy = (y + 0.5 - VIS.y * H) / (0.6 * W);
      const d = Math.sqrt(dx * dx + dy * dy);
      const th = Math.atan2(dy, dx);
      let r = 1;
      for (const q of harm) r += q.a * Math.cos(q.h * th + q.p);
      const wob = (coarse(x, y) - 0.5) * 1.6 + (mid(x, y) - 0.5) * 1.0 + (fine(x, y) - 0.5) * 0.5;
      const k = (d / Math.max(0.4, r)) * Math.exp(wob) + Math.random() * (0.03 + 0.12 * d);
      // Pixels outside the shape (transparent in the mask) come last.
      const w = data ? data[i * 4 + 3] / 255 : 1;
      alpha[i] = w;
      keys[i] = k + 6 * (1 - Math.min(1, w / 0.6));
    }
  }

  // Split the shape into pieces (the mainland and each island). The stain never creeps
  // across the sea; it hops to the next piece, starting at that piece's nearest spot.
  const comp = new Int32Array(total).fill(-1);
  let nComp = 0;
  const stack: number[] = [];
  for (let s0 = 0; s0 < total; s0++) {
    if (comp[s0] !== -1 || alpha[s0] < 0.3) continue;
    comp[s0] = nComp;
    stack.push(s0);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
      for (const j of nb)
        if (j >= 0 && j < total && comp[j] === -1 && alpha[j] >= 0.3) {
          comp[j] = nComp;
          stack.push(j);
        }
    }
    nComp++;
  }
  // The faint fringe around each piece belongs to that piece.
  const fringe: number[] = [];
  for (let i = 0; i < total; i++) if (comp[i] !== -1) fringe.push(i);
  for (let h = 0; h < fringe.length; h++) {
    const i = fringe[h];
    const x = i % W;
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
    for (const j of nb)
      if (j >= 0 && j < total && comp[j] === -1 && alpha[j] >= 0.08) {
        comp[j] = comp[i];
        fringe.push(j);
      }
  }
  const seedKey = new Float32Array(nComp).fill(Infinity);
  const seedCell = new Int32Array(nComp).fill(-1);
  for (let i = 0; i < total; i++) {
    const c = comp[i];
    if (c !== -1 && alpha[i] >= 0.3 && keys[i] < seedKey[c]) {
      seedKey[c] = keys[i];
      seedCell[c] = i;
    }
  }

  // Grow outwards in key order (a binary min-heap), one piece at a time.
  const order = new Int32Array(total);
  const queued = new Uint8Array(total);
  const hk: number[] = [],
    hi: number[] = [];
  const push = (k: number, i: number) => {
    let n = hk.length;
    hk.push(k);
    hi.push(i);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hk[p] <= k) break;
      hk[n] = hk[p];
      hi[n] = hi[p];
      n = p;
    }
    hk[n] = k;
    hi[n] = i;
  };
  const pop = () => {
    const top = hi[0];
    const lk = hk.pop()!,
      li = hi.pop()!;
    const n = hk.length;
    if (n > 0) {
      let j = 0;
      for (;;) {
        let c = 2 * j + 1;
        if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= lk) break;
        hk[j] = hk[c];
        hi[j] = hi[c];
        j = c;
      }
      hk[j] = lk;
      hi[j] = li;
    }
    return top;
  };
  const addNeighbours = (i: number) => {
    const x = i % W;
    const c = comp[i];
    const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W];
    for (const j of nb)
      if (j >= 0 && j < total && !queued[j] && comp[j] === c) {
        queued[j] = 1;
        push(keys[j], j);
      }
  };
  const start = Math.round(VIS.y * H) * W + Math.round(VIS.x * W);
  queued[start] = 1;
  order[0] = start;
  let count = 1;
  addNeighbours(start);
  // Every other piece joins later, at its own seed. HOP is large: Vis fills completely first.
  const HOP = 50;
  for (let c = 0; c < nComp; c++) {
    const sc = seedCell[c];
    if (sc === -1 || queued[sc]) continue;
    queued[sc] = 1;
    push(seedKey[c] + HOP, sc);
  }
  while (count < total && hk.length > 0) {
    const i = pop();
    order[count++] = i;
    addNeighbours(i);
  }
  for (let i = 0; i < total; i++) if (!queued[i]) order[count++] = i; // open sea, last

  // Positions in the order of the pixels that actually show (crossing the sea takes no time).
  const visIdx: number[] = [];
  for (let q = 0; q < count; q++) if (alpha[order[q]] >= 0.08) visIdx.push(q);
  // How many visible pixels belong to Vis itself.
  let firstOther = count;
  const visComp = comp[start];
  for (let q = 0; q < count; q++)
    if (comp[order[q]] !== visComp) {
      firstOther = q;
      break;
    }
  let vCount = 0;
  while (vCount < visIdx.length && visIdx[vCount] < firstOther) vCount++;

  // Prelude: the first pixels arrive one by one (1, 1, 1, 2, 1, 3 ...) at irregular,
  // slowly shortening gaps.
  const sizes = [1, 1, 1, 2, 1, 3, 2, 1, 4, 2, 3, 5, 2, 6, 3, 8, 4, 10, 5, 12];
  const events: { t: number; c: number }[] = [];
  let tt = 0,
    cum = 0,
    gap = 3.2;
  for (const s of sizes) {
    cum += s;
    events.push({ t: tt, c: cum });
    tt += gap * (0.6 + Math.random() * 0.8);
    gap = Math.max(0.35, gap * 0.78);
  }
  return { W, H, order, events, preEnd: tt, visIdx, vCount };
}

// How many pixels of `order` should be cleared at `elapsed` seconds after the delay.
function cleared(s: Stain, elapsed: number): number {
  if (elapsed < 0) return 0;
  const G = STAIN_GROW_S;
  if (elapsed >= G) return s.order.length;
  const total = s.visIdx.length;
  const hold = Math.min(STAIN_HOP_S, G * 0.5);
  const G2 = G - hold;
  const k = Math.min(1, (0.4 * G2) / s.preEnd);
  const preEnd = s.preEnd * k;
  const f = (e: number) => {
    let pre = 0;
    for (const ev of s.events) if (ev.t * k <= e) pre = ev.c;
    const u = e > preEnd ? Math.min(1, (e - preEnd) / Math.max(0.001, G2 - preEnd)) : 0;
    return Math.min(total, pre + Math.floor(total * Math.pow(u, 2.2)));
  };
  // The moment Vis is full: the stain rests there for `hold` before it hops on.
  if (s.eV === undefined) {
    let e = 0;
    while (e < G2 && f(e) < s.vCount) e += 0.05;
    s.eV = e;
  }
  const eff = elapsed < s.eV ? elapsed : Math.max(s.eV, elapsed - hold);
  const want = f(eff);
  if (want >= total) return s.order.length;
  return want > 0 ? s.visIdx[want - 1] + 1 : 0;
}

let stop: (() => void) | null = null;

function startStain(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width,
    H = canvas.height;
  if (reduced()) {
    canvas.style.display = "none";
    return () => {};
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  if (!t0) t0 = performance.now();
  if (!building) building = loadMask(W, H).then((data) => (stain = buildStain(W, H, data)));
  let done = 0;
  let timer: number | undefined;
  const grow = () => {
    if (!stain) return;
    const n = cleared(stain, (performance.now() - t0) / 1000 - STAIN_DELAY_S);
    for (let q = done; q < n; q++) {
      const idx = stain.order[q];
      ctx.clearRect(idx % W, Math.floor(idx / W), 1, 1);
    }
    done = Math.max(done, n);
    if (n >= stain.order.length) {
      window.clearInterval(timer);
      canvas.style.display = "none";
    }
  };
  building.then(() => {
    grow();
    timer = window.setInterval(grow, 100);
  });
  return () => window.clearInterval(timer);
}

// The background video never stops: restart it if it ends or gets paused (some browsers
// pause muted background video to save power), unless the visitor prefers reduced motion.
function keepVideo(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  if (reduced()) {
    video.pause();
    return () => {};
  }
  const nudge = () => {
    if (document.hidden) return;
    if (video.ended) video.currentTime = 0;
    if (video.paused) video.play().catch(() => {});
  };
  nudge();
  video.addEventListener("ended", nudge);
  video.addEventListener("pause", nudge);
  const watchdog = window.setInterval(nudge, 2000);
  return () => window.clearInterval(watchdog);
}

document.addEventListener("astro:page-load", () => {
  stop?.();
  stop = null;
  const canvas = document.querySelector<HTMLCanvasElement>("[data-stain]");
  const video = document.querySelector<HTMLVideoElement>("[data-bg-video]");
  if (!canvas || !video) return;
  const a = startStain(canvas);
  const b = keepVideo(video);
  stop = () => {
    a();
    b();
  };
});
document.addEventListener("astro:before-swap", () => {
  stop?.();
  stop = null;
});

export {};
