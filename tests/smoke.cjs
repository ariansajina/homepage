#!/usr/bin/env node
// Browser smoke test: starts its own dev server, walks the site in headless Chromium and
// checks the behaviour that has broken before. Run with `npm run test:smoke`.
//
// Needs Playwright with Chromium (preinstalled in cloud sessions; locally:
// `npm i -g playwright && npx playwright install chromium`). It is not a dependency of
// the site, so the Railway build never installs it. Works without local media.
"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTES = [
  "/",
  "/about/",
  "/works/",
  "/works/sprezzatura/",
  "/letters/",
  "/letters/use-signal/",
  "/dances/",
  "/conversations/",
];

function loadPlaywright() {
  for (const p of ["playwright", "/opt/node-tools/node_modules/playwright"]) {
    try {
      return require(p);
    } catch {
      /* try the next */
    }
  }
  console.error("Playwright not found. See the top of tests/smoke.cjs.");
  process.exit(1);
}

async function startServer() {
  const child = spawn(
    path.join(ROOT, "node_modules/.bin/astro"),
    ["dev", "--port", String(PORT), "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: "ignore" },
  );
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try {
      if ((await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) })).ok) return child;
    } catch {
      /* not up yet */
    }
  }
  child.kill();
  throw new Error(`dev server did not come up on ${BASE}`);
}

let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n    ${String(e.message || e).split("\n")[0]}`);
  }
}
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};

async function main() {
  const { chromium } = loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    // Script errors anywhere fail the run (missing local media does not).
    const errors = [];
    const watch = (page) => page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));

    await check("every page loads, on desktop and phone, without sideways scroll", async () => {
      for (const context of [desktop, phone]) {
        const page = await context.newPage();
        watch(page);
        for (const route of ROUTES) {
          const res = await page.goto(BASE + route, { waitUntil: "load" });
          expect(res.status() === 200, `${route}: HTTP ${res.status()}`);
          const wide = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth,
          );
          expect(!wide, `${route}: horizontal overflow`);
        }
        await page.close();
      }
    });

    await check("works timeline: no two titles overlap (desktop and phone)", async () => {
      for (const context of [desktop, phone]) {
        const page = await context.newPage();
        await page.goto(`${BASE}/works/`, { waitUntil: "load" });
        const boxes = await page.$$eval(".tl-item a", (els) =>
          els.map((el) => {
            const r = el.getBoundingClientRect();
            return { l: r.left, r: r.right, t: r.top, b: r.bottom, text: el.textContent.trim() };
          }),
        );
        expect(boxes.length > 0, "no works on the timeline");
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i],
              b = boxes[j];
            const apart = a.r <= b.l || b.r <= a.l || a.b <= b.t + 0.5 || b.b <= a.t + 0.5;
            expect(apart, `"${a.text}" overlaps "${b.text}"`);
          }
        await page.close();
      }
    });

    await check(
      "landing: menu links keep their resting names while the words scramble",
      async () => {
        const page = await desktop.newPage();
        watch(page);
        await page.clock.install();
        await page.goto(`${BASE}/`, { waitUntil: "load" });
        const names = () =>
          page.$$eval(".menu a", (els) => els.map((a) => a.getAttribute("aria-label")));
        const texts = () => page.$$eval(".menu a span", (els) => els.map((s) => s.textContent));
        const before = await names();
        let changed = false;
        for (let i = 0; i < 12 && !changed; i++) {
          await page.clock.runFor(1000);
          changed = (await texts()).join("|") !== before.join("|");
          expect((await names()).join("|") === before.join("|"), "a link's aria-label changed");
        }
        expect(changed, "no word scrambled within 12 s");
        await page.close();
      },
    );

    await check("landing: the background video stops when the page is left", async () => {
      const page = await desktop.newPage();
      watch(page);
      await page.goto(`${BASE}/`, { waitUntil: "load" });
      await page.evaluate(() => (window.__video = document.querySelector("video[data-bg-video]")));
      await page.click('.menu a[href="/about/"]');
      await page.waitForURL("**/about/");
      await page.waitForTimeout(500);
      const state = await page.evaluate(() => [window.__video.isConnected, window.__video.paused]);
      expect(state[0] === false, "the client router did not swap the page");
      expect(state[1] === true, "the old landing video is still playing");
      await page.close();
    });

    await check(
      "dances: a card opens the dialog after client-side navigation; close closes it",
      async () => {
        const page = await desktop.newPage();
        watch(page);
        await page.goto(`${BASE}/`, { waitUntil: "load" });
        await page.click('.menu a[href="/dances/"]');
        await page.waitForURL("**/dances/");
        await page.click("[data-dance]");
        const open = () => page.$eval("[data-dance-dialog]", (d) => d.open);
        expect(await open(), "the dialog did not open");
        await page.click("[data-dance-close]");
        expect(!(await open()), "the dialog did not close");
        await page.close();
      },
    );

    await check(
      "conversations: reached from the landing; one spine open at a time; filters hide others",
      async () => {
        const page = await desktop.newPage();
        watch(page);
        await page.goto(`${BASE}/`, { waitUntil: "load" });
        await page.click('.menu a[href="/conversations/"]');
        await page.waitForURL("**/conversations/");
        const spines = page.locator(".book summary");
        await spines.nth(0).click();
        await spines.nth(1).click();
        const open = await page.$$eval(".book details[open]", (els) => els.length);
        expect(open === 1, `${open} spines open at once`);
        expect(!page.url().includes("kind="), "opening a spine changed the filter");
        await page.click('[data-filter="films"]');
        expect(new URL(page.url()).searchParams.get("kind") === "films", "kind not in the URL");
        const kinds = await page.$$eval(".book:not([hidden])", (els) =>
          els.map((el) => el.dataset.kind),
        );
        expect(kinds.length > 0, "no films shown");
        expect(
          kinds.every((k) => k === "films"),
          `other kinds still shown: ${kinds.join(", ")}`,
        );
        await page.reload({ waitUntil: "load" });
        const pressed = await page.$eval('[data-filter="films"]', (b) => b.ariaPressed);
        expect(pressed === "true", "?kind=films not applied on load");
        await page.close();
      },
    );

    await check("decks: the player opens, and folds away on the next page", async () => {
      const page = await desktop.newPage();
      watch(page);
      await page.goto(`${BASE}/letters/`, { waitUntil: "load" });
      const isOpen = () => page.$eval("#player", (d) => d.classList.contains("open"));
      await page.click("#player [data-tab]");
      expect(await isOpen(), "the player did not open");
      await page.evaluate(() => (window.__player = document.getElementById("player")));
      await page.click(".letters a");
      await page.waitForURL("**/letters/*/");
      await page.waitForTimeout(300);
      expect(!(await isOpen()), "the player stayed open after navigating");
      const same = await page.evaluate(() => window.__player === document.getElementById("player"));
      expect(same, "the player was not persisted across the navigation");
      await page.close();
    });

    await check("top bar: 'home' never points at the current page", async () => {
      const page = await desktop.newPage();
      watch(page);
      for (let i = 0; i < 5; i++) {
        await page.goto(`${BASE}/works/sprezzatura/`, { waitUntil: "load" });
        const href = await page.$eval("[data-home]", (a) => new URL(a.href).pathname);
        expect(href !== "/works/sprezzatura/", "home points at the current page");
      }
      await page.close();
    });

    await check("head: share tags everywhere; the 404 page is noindex", async () => {
      const page = await desktop.newPage();
      await page.goto(`${BASE}/works/`, { waitUntil: "load" });
      const meta = (sel) => page.$eval(sel, (m) => m.content).catch(() => null);
      expect(await meta('meta[property="og:image"]'), "no og:image on /works/");
      expect((await meta('meta[name="twitter:card"]')) === "summary", "no twitter:card on /works/");
      expect((await meta('meta[name="robots"]')) === null, "/works/ is noindex");
      const res = await page.goto(`${BASE}/no-such-page/`, { waitUntil: "load" });
      expect(res.status() === 404, `unknown path: HTTP ${res.status()}`);
      expect((await meta('meta[name="robots"]')) === "noindex", "the 404 page is not noindex");
      await page.close();
    });

    await check("no script errors on any page", async () => {
      expect(errors.length === 0, errors[0]);
    });
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failed ? `${failed} check(s) failed` : "smoke test passed");
  process.exitCode = failed ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
