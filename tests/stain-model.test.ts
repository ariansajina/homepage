// Unit tests for the stain model (pure functions). Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planStain, clearedAt, stageAt, seededRandom } from "../src/lib/stain-model.ts";

const W = 40,
  H = 30;
const shape = { origin: { x: 0.25, y: 0.5 }, raggedness: 1, lobes: 1 };
const timing = { growSeconds: 100, restSeconds: 40, acceleration: 2.2, preludeShare: 0.4 };

// Two islands in a sea: a small one around the origin (left) and a big one (right).
function twoIslands(): Float32Array {
  const a = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const small = x >= 6 && x <= 14 && y >= 10 && y <= 20;
      const big = x >= 22 && x <= 37 && y >= 3 && y <= 27;
      if (small || big) a[y * W + x] = 1;
    }
  return a;
}
const inSmall = (i: number) => i % W <= 14;

test("seededRandom: same seed, same numbers, all in [0, 1)", () => {
  const a = seededRandom(42),
    b = seededRandom(42),
    c = seededRandom(43);
  const xs = Array.from({ length: 200 }, () => a());
  assert.deepEqual(
    xs,
    Array.from({ length: 200 }, () => b()),
  );
  assert.notDeepEqual(
    xs,
    Array.from({ length: 200 }, () => c()),
  );
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("planStain: the order is a permutation of every pixel", () => {
  for (const alpha of [null, twoIslands()]) {
    const plan = planStain(alpha, W, H, shape, seededRandom(1));
    assert.equal(plan.order.length, W * H);
    assert.equal(new Set(plan.order).size, W * H);
  }
});

test("planStain: same seed gives the same shape, another seed a different one", () => {
  const a = planStain(twoIslands(), W, H, shape, seededRandom(7));
  const b = planStain(twoIslands(), W, H, shape, seededRandom(7));
  const c = planStain(twoIslands(), W, H, shape, seededRandom(8));
  assert.deepEqual(a.order, b.order);
  assert.notDeepEqual(a.order, c.order);
});

test("planStain: starts at the origin, fills its island first, sea last", () => {
  const alpha = twoIslands();
  const plan = planStain(alpha, W, H, shape, seededRandom(3));
  const land = alpha.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  const smallCount = 9 * 11;
  assert.equal(plan.order[0], Math.round(0.5 * H) * W + Math.round(0.25 * W));
  assert.equal(plan.originCount, smallCount);
  assert.equal(plan.visible.length, land);
  const order = [...plan.order];
  assert.ok(order.slice(0, smallCount).every((i) => alpha[i] === 1 && inSmall(i)));
  assert.ok(order.slice(smallCount, land).every((i) => alpha[i] === 1 && !inSmall(i)));
  assert.ok(order.slice(land).every((i) => alpha[i] === 0));
});

test("planStain: every pixel after the first touches one already taken (per island)", () => {
  const alpha = twoIslands();
  const plan = planStain(alpha, W, H, shape, seededRandom(5));
  const taken = new Uint8Array(W * H);
  const land = plan.visible.length;
  let jumps = 0;
  for (let q = 0; q < land; q++) {
    const i = plan.order[q];
    const x = i % W;
    const touches =
      (x > 0 && taken[i - 1]) ||
      (x < W - 1 && taken[i + 1]) ||
      (i >= W && taken[i - W]) ||
      (i < W * H - W && taken[i + W]);
    if (!touches) jumps++;
    taken[i] = 1;
  }
  assert.equal(jumps, 2); // the origin, and the hop onto the second island
});

test("clearedAt: nothing before the start, everything at the end, never backwards", () => {
  const plan = planStain(twoIslands(), W, H, shape, seededRandom(9));
  assert.equal(clearedAt(plan, -1, timing), 0);
  assert.equal(clearedAt(plan, timing.growSeconds, timing), W * H);
  assert.ok(clearedAt(plan, 0, timing) >= 1);
  let last = 0;
  for (let t = 0; t <= timing.growSeconds; t += 0.25) {
    const n = clearedAt(plan, t, timing);
    assert.ok(n >= last, `went backwards at t=${t}`);
    last = n;
  }
});

test("clearedAt: the clock stands still for restSeconds once the origin's island is full", () => {
  const plan = planStain(twoIslands(), W, H, shape, seededRandom(11));
  let full = 0;
  while (stageAt(plan, full, timing) !== "resting") full += 0.05;
  const atRest = clearedAt(plan, full + 0.1, timing);
  assert.equal(clearedAt(plan, full + timing.restSeconds - 0.2, timing), atRest);
  assert.equal(stageAt(plan, full + timing.restSeconds / 2, timing), "resting");
  assert.equal(stageAt(plan, full + timing.restSeconds + 0.1, timing), "spreading");
  assert.ok(clearedAt(plan, full + timing.restSeconds + 5, timing) > atRest);
  assert.equal(stageAt(plan, -1, timing), "waiting");
  assert.equal(stageAt(plan, timing.growSeconds, timing), "done");
});
