// The stain model: which pixel clears when. Pure functions, no DOM, so the landing page
// (src/scripts/stain.ts) and the dev preview (/dev/stain) share exactly the same model.
// The full explanation, with the knobs and what they do, is in docs/stain.md.
//
// In short, the model has two halves:
//
// 1. A ORDER (planStain): every pixel of the grid gets a key, roughly "distance from the
//    origin", bent by random lobes and fractal noise so the front is irregular. The mask
//    is split into pieces (mainland, islands). Starting at the origin, pixels are taken
//    lowest key first, but only into neighbours of pixels already taken and only within
//    the same piece (a flood fill ordered by key). The other pieces join later, each at
//    its own lowest-key pixel, with a large key penalty so the origin's piece fills first.
//    The result is a permutation of all pixels: the order in which they clear.
//
// 2. A CLOCK (clearedAt): how many pixels of that order are clear t seconds after the
//    first one. A prelude clears single pixels one by one at shrinking gaps; then the count
//    follows total * u^acceleration (slow start, fast finish). Once the origin's piece is
//    full the clock stops for restSeconds, then continues, ending at growSeconds.

export type StainShape = {
  origin: { x: number; y: number }; // fractions of the grid
  raggedness: number; // noise strength (1 = the design)
  lobes: number; // lobe strength (1 = the design)
};

export type StainTiming = {
  growSeconds: number;
  restSeconds: number;
  acceleration: number;
  preludeShare: number;
};

export type StainPlan = {
  width: number;
  height: number;
  /** Every pixel index (y * width + x), in the order they clear. */
  order: Int32Array;
  /** Positions in `order` of the pixels that are visible (inside the mask). */
  visible: Int32Array;
  /** How many visible pixels belong to the origin's piece (they clear first). */
  originCount: number;
  /** The prelude: at time t (relative units), `count` pixels are clear. */
  prelude: { t: number; count: number }[];
  /** Length of the prelude, in the same relative units. */
  preludeLength: number;
  /** Memo for clearedAt: when the origin's piece is full, per timing. */
  memo: Map<string, number>;
};

/** Small seeded PRNG (mulberry32): the same seed gives the same shape. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pixels at or above this mask opacity count as land; the fainter fringe (down to
// FRINGE) belongs to the nearest piece but never starts one.
const LAND = 0.3;
const FRINGE = 0.08;
// Key penalty for every piece other than the origin's: large enough that the origin's
// piece is completely full before any other piece begins.
const HOP_PENALTY = 50;
// Prelude: how many pixels arrive at each step (1, 1, 1, 2, 1, 3 ...).
const PRELUDE_SIZES = [1, 1, 1, 2, 1, 3, 2, 1, 4, 2, 3, 5, 2, 6, 3, 8, 4, 10, 5, 12];

/**
 * Plan the stain on a width x height grid. `alpha` holds the mask's opacity per pixel
 * (0..1); null treats the whole grid as land.
 */
export function planStain(
  alpha: Float32Array | null,
  width: number,
  height: number,
  shape: StainShape,
  random: () => number = Math.random,
): StainPlan {
  const W = width,
    H = height,
    total = W * H;
  const a = alpha ?? new Float32Array(total).fill(1);

  // -- Keys: distance from the origin, bent into an irregular outline. ----------------
  // Lobes: a few low harmonics of the angle stretch the radius in some directions.
  const harmonics: { h: number; amp: number; phase: number }[] = [];
  for (let h = 2; h <= 6; h++)
    harmonics.push({
      h,
      amp: (((random() * 2 - 1) * 0.5) / h) * shape.lobes,
      phase: random() * Math.PI * 2,
    });
  // Noise: smooth value noise at three scales (coarse, mid, fine), summed.
  const noise = (cells: number) => {
    const g = Array.from({ length: (cells + 1) * (cells + 1) }, () => random());
    return (x: number, y: number) => {
      const fx = (x / W) * cells,
        fy = (y / H) * cells;
      const x0 = Math.floor(fx),
        y0 = Math.floor(fy);
      const sx = fx - x0,
        sy = fy - y0;
      const ux = sx * sx * (3 - 2 * sx),
        uy = sy * sy * (3 - 2 * sy);
      const i = y0 * (cells + 1) + x0;
      const top = g[i] + (g[i + 1] - g[i]) * ux;
      const bottom = g[i + cells + 1] + (g[i + cells + 2] - g[i + cells + 1]) * ux;
      return top + (bottom - top) * uy;
    };
  };
  const coarse = noise(4),
    mid = noise(11),
    fine = noise(30);
  const ox = shape.origin.x * W,
    oy = shape.origin.y * H;
  const keys = new Float32Array(total);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // Distance in units of 0.6 x the grid width (both axes scaled by width).
      const dx = (x + 0.5 - ox) / (0.6 * W);
      const dy = (y + 0.5 - oy) / (0.6 * W);
      const d = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      let r = 1;
      for (const q of harmonics) r += q.amp * Math.cos(q.h * angle + q.phase);
      const wobble =
        ((coarse(x, y) - 0.5) * 1.6 + (mid(x, y) - 0.5) * 1.0 + (fine(x, y) - 0.5) * 0.5) *
        shape.raggedness;
      // Per-pixel jitter grows with distance: a grainy, speckled front far from the origin.
      const k = (d / Math.max(0.4, r)) * Math.exp(wobble) + random() * (0.03 + 0.12 * d);
      // Outside the mask (sea) sorts last.
      keys[i] = k + 6 * (1 - Math.min(1, a[i] / 0.6));
    }
  }

  // -- Pieces: connected areas of land (mainland, each island). -----------------------
  const piece = new Int32Array(total).fill(-1);
  const neighbours = (i: number, out: number[]) => {
    out.length = 0;
    const x = i % W;
    if (x > 0) out.push(i - 1);
    if (x < W - 1) out.push(i + 1);
    if (i >= W) out.push(i - W);
    if (i < total - W) out.push(i + W);
    return out;
  };
  const nb: number[] = [];
  let pieces = 0;
  const stack: number[] = [];
  for (let s = 0; s < total; s++) {
    if (piece[s] !== -1 || a[s] < LAND) continue;
    piece[s] = pieces;
    stack.push(s);
    while (stack.length) {
      for (const j of neighbours(stack.pop()!, nb))
        if (piece[j] === -1 && a[j] >= LAND) {
          piece[j] = pieces;
          stack.push(j);
        }
    }
    pieces++;
  }
  // The faint fringe around each piece belongs to that piece (breadth-first).
  const fringe: number[] = [];
  for (let i = 0; i < total; i++) if (piece[i] !== -1) fringe.push(i);
  for (let h = 0; h < fringe.length; h++) {
    const i = fringe[h];
    for (const j of neighbours(i, nb))
      if (piece[j] === -1 && a[j] >= FRINGE) {
        piece[j] = piece[i];
        fringe.push(j);
      }
  }
  // Each piece's seed: its land pixel with the lowest key (nearest the origin, roughly).
  const seedKey = new Float32Array(pieces).fill(Infinity);
  const seedCell = new Int32Array(pieces).fill(-1);
  for (let i = 0; i < total; i++) {
    const p = piece[i];
    if (p !== -1 && a[i] >= LAND && keys[i] < seedKey[p]) {
      seedKey[p] = keys[i];
      seedCell[p] = i;
    }
  }

  // -- Order: flood fill from the origin, lowest key first (binary min-heap). ---------
  const heapKey: number[] = [],
    heapCell: number[] = [];
  const push = (k: number, i: number) => {
    let n = heapKey.length;
    heapKey.push(k);
    heapCell.push(i);
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (heapKey[p] <= k) break;
      heapKey[n] = heapKey[p];
      heapCell[n] = heapCell[p];
      n = p;
    }
    heapKey[n] = k;
    heapCell[n] = i;
  };
  const pop = () => {
    const top = heapCell[0];
    const lk = heapKey.pop()!,
      li = heapCell.pop()!;
    const n = heapKey.length;
    if (n > 0) {
      let j = 0;
      for (;;) {
        let c = 2 * j + 1;
        if (c >= n) break;
        if (c + 1 < n && heapKey[c + 1] < heapKey[c]) c++;
        if (heapKey[c] >= lk) break;
        heapKey[j] = heapKey[c];
        heapCell[j] = heapCell[c];
        j = c;
      }
      heapKey[j] = lk;
      heapCell[j] = li;
    }
    return top;
  };
  const order = new Int32Array(total);
  const queued = new Uint8Array(total);
  const enqueueNeighbours = (i: number) => {
    for (const j of neighbours(i, nb))
      if (!queued[j] && piece[j] === piece[i]) {
        queued[j] = 1;
        push(keys[j], j);
      }
  };
  const start =
    Math.min(H - 1, Math.round(shape.origin.y * H)) * W + Math.min(W - 1, Math.round(ox));
  queued[start] = 1;
  order[0] = start;
  let count = 1;
  enqueueNeighbours(start);
  // Every other piece hops in at its own seed, once the stain's reach gets there.
  for (let p = 0; p < pieces; p++) {
    const s = seedCell[p];
    if (s === -1 || queued[s]) continue;
    queued[s] = 1;
    push(seedKey[p] + HOP_PENALTY, s);
  }
  while (heapKey.length > 0) {
    const i = pop();
    order[count++] = i;
    enqueueNeighbours(i);
  }
  for (let i = 0; i < total; i++) if (!queued[i]) order[count++] = i; // open sea, last

  // -- Bookkeeping for the clock. -------------------------------------------------------
  const vis: number[] = [];
  for (let q = 0; q < total; q++) if (a[order[q]] >= FRINGE) vis.push(q);
  const visible = Int32Array.from(vis);
  let firstOther = total;
  for (let q = 0; q < total; q++)
    if (piece[order[q]] !== piece[start]) {
      firstOther = q;
      break;
    }
  let originCount = 0;
  while (originCount < visible.length && visible[originCount] < firstOther) originCount++;

  // Prelude: pixel groups at irregular, slowly shortening gaps (relative time units).
  const prelude: { t: number; count: number }[] = [];
  let t = 0,
    cum = 0,
    gap = 3.2;
  for (const size of PRELUDE_SIZES) {
    cum += size;
    prelude.push({ t, count: cum });
    t += gap * (0.6 + random() * 0.8);
    gap = Math.max(0.35, gap * 0.78);
  }

  return {
    width: W,
    height: H,
    order,
    visible,
    originCount,
    prelude,
    preludeLength: t,
    memo: new Map(),
  };
}

/** How many visible pixels are clear `s` seconds into the spreading (no rest applied). */
function spread(plan: StainPlan, s: number, timing: StainTiming): number {
  const total = plan.visible.length;
  const active = timing.growSeconds - timing.restSeconds; // spreading time, rest excluded
  // The prelude is squeezed to fit within preludeShare of the spreading time.
  const k = Math.min(1, (timing.preludeShare * active) / plan.preludeLength);
  const preludeEnd = plan.preludeLength * k;
  let pre = 0;
  for (const ev of plan.prelude) if (ev.t * k <= s) pre = ev.count;
  const u =
    s > preludeEnd ? Math.min(1, (s - preludeEnd) / Math.max(0.001, active - preludeEnd)) : 0;
  return Math.min(total, pre + Math.floor(total * Math.pow(u, timing.acceleration)));
}

/** Seconds into the spreading at which the origin's piece is full. */
function originFullAt(plan: StainPlan, timing: StainTiming): number {
  const key = `${timing.growSeconds}:${timing.restSeconds}:${timing.acceleration}:${timing.preludeShare}`;
  let at = plan.memo.get(key);
  if (at === undefined) {
    const active = timing.growSeconds - timing.restSeconds;
    at = 0;
    while (at < active && spread(plan, at, timing) < plan.originCount) at += 0.05;
    plan.memo.set(key, at);
  }
  return at;
}

/**
 * How many entries of `plan.order` are clear `t` seconds after the first pixel.
 * Clear `order[0 .. n)`; at the end the whole grid (sea included) is clear.
 */
export function clearedAt(plan: StainPlan, t: number, timing: StainTiming): number {
  if (t < 0) return 0;
  if (t >= timing.growSeconds) return plan.order.length;
  const full = originFullAt(plan, timing);
  // The clock stands still for restSeconds once the origin's piece is full.
  const s = t < full ? t : Math.max(full, t - timing.restSeconds);
  const n = spread(plan, s, timing);
  if (n >= plan.visible.length) return plan.order.length;
  return n > 0 ? plan.visible[n - 1] + 1 : 0;
}

export type StainStage = "waiting" | "prelude" | "origin" | "resting" | "spreading" | "done";

/** Which phase the stain is in `t` seconds after the first pixel (for the preview). */
export function stageAt(plan: StainPlan, t: number, timing: StainTiming): StainStage {
  if (t < 0) return "waiting";
  if (t >= timing.growSeconds) return "done";
  const full = originFullAt(plan, timing);
  const active = timing.growSeconds - timing.restSeconds;
  const k = Math.min(1, (timing.preludeShare * active) / plan.preludeLength);
  if (t < plan.preludeLength * k && t < full) return "prelude";
  if (t < full) return "origin";
  if (t < full + timing.restSeconds) return "resting";
  return "spreading";
}

/** Read a mask image's opacity into a width x height grid (browser only). */
export function maskAlpha(
  img: HTMLImageElement,
  width: number,
  height: number,
): Float32Array | null {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  try {
    const data = ctx.getImageData(0, 0, width, height).data;
    const out = new Float32Array(width * height);
    for (let i = 0; i < out.length; i++) out[i] = data[i * 4 + 3] / 255;
    return out;
  } catch {
    return null; // cross-origin mask: fall back to "all land"
  }
}

/** Load an image (browser only). */
export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
