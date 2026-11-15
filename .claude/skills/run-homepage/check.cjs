#!/usr/bin/env node
// Visual check for the homepage: makes sure the Astro dev server is up (starting it if
// needed), opens pages in headless Chromium at desktop and phone sizes, saves
// screenshots and reports problems. One command, compact output.
//
//   node .claude/skills/run-homepage/check.cjs [options] [route ...]
//
//   route            e.g. / /about/ /letters/use-signal/ (default: every main page)
//   --view=both      desktop (1440x900) | phone (390x844) | both
//   --at=SECONDS     fast-forward the page clock this far after load (landing stain,
//                    scramble); e.g. --at=60 or --at=200 for the finished stain
//   --full           full-page screenshots instead of the first screen
//   --out=DIR        where to save PNGs (default: $TMPDIR/homepage-shots)
//   --port=4321      dev server port
//   --stop           stop the dev server and exit
//
// Prints one line per page: status, console errors, horizontal overflow, PNG path.
// Missing local media (public/media/ empty) is reported once, separately, not as errors.
"use strict";

const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../../..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const flag = (name) => args.includes(`--${name}`);
const PORT = Number(opt("port", "4321"));
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = opt("out", path.join(os.tmpdir(), "homepage-shots"));
const VIEW = opt("view", "both");
const AT = Number(opt("at", "0"));
const FULL = flag("full");
const LOG = path.join(os.tmpdir(), "homepage-dev.log");
const DEFAULT_ROUTES = [
  "/",
  "/about/",
  "/works/",
  "/works/sprezzatura/",
  "/letters/",
  "/letters/use-signal/",
  "/dances/",
];
const routes = args.filter((a) => !a.startsWith("--"));

function loadPlaywright() {
  for (const p of ["playwright", "/opt/node-tools/node_modules/playwright"]) {
    try {
      return require(p);
    } catch {
      /* try the next */
    }
  }
  console.error("Playwright not found (expected the preinstalled global copy).");
  process.exit(1);
}

function killAstro() {
  try {
    execSync("pkill -f 'astro.mjs (dev|preview)'", { stdio: "ignore" });
  } catch {
    /* nothing running */
  }
}

// The dev server is ours only if it injects Vite's client; anything else on the port
// (a stale `astro preview` of an old build, say) gets replaced.
async function isDevServer() {
  try {
    const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(3000) });
    return (await res.text()).includes("/@vite/client");
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isDevServer()) return "running";
  killAstro();
  const child = spawn(
    path.join(ROOT, "node_modules/.bin/astro"),
    ["dev", "--port", String(PORT), "--host", "127.0.0.1"],
    { cwd: ROOT, detached: true, stdio: ["ignore", fs.openSync(LOG, "w"), fs.openSync(LOG, "a")] },
  );
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isDevServer()) return "started";
  }
  console.error(`Dev server did not come up on ${BASE}. Last log lines:`);
  console.error(fs.readFileSync(LOG, "utf8").split("\n").slice(-15).join("\n"));
  process.exit(1);
}

async function main() {
  if (flag("stop")) {
    killAstro();
    console.log("dev server stopped");
    return;
  }
  if (!fs.existsSync(path.join(ROOT, "node_modules/.bin/astro"))) {
    console.error("node_modules missing: run npm ci first.");
    process.exit(1);
  }
  const state = await ensureServer();
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const views = {
    desktop: { viewport: { width: 1440, height: 900 } },
    phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  };
  const chosen = VIEW === "both" ? ["desktop", "phone"] : [VIEW];
  const missingMedia = new Set();
  let problems = 0;
  console.log(`dev server ${state} at ${BASE} · screenshots in ${OUT}`);

  for (const name of chosen) {
    if (!views[name]) throw new Error(`unknown --view=${name}`);
    const context = await browser.newContext({ ...views[name], deviceScaleFactor: 1 });
    for (const route of routes.length ? routes : DEFAULT_ROUTES) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e.message || e)));
      page.on("console", (m) => {
        if (m.type() === "error" && !m.text().startsWith("Failed to load resource"))
          errors.push(m.text());
      });
      page.on("response", (r) => {
        const u = new URL(r.url());
        if (r.status() >= 400 && u.pathname.startsWith("/media/")) missingMedia.add(u.pathname);
        else if (r.status() >= 400 && u.pathname !== route)
          errors.push(`${r.status()} ${u.pathname}`);
      });
      if (AT > 0) await page.clock.install();
      // "load", never "networkidle": the landing video loops, so the network never idles.
      const res = await page.goto(BASE + route, { waitUntil: "load" });
      if (AT > 0) await page.clock.runFor(AT * 1000);
      await page.waitForTimeout(600);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      const file = path.join(
        OUT,
        `${name}${route.replace(/\/+$/, "").replace(/\//g, "_") || "_home"}${AT ? `@${AT}s` : ""}.png`,
      );
      await page.screenshot({ path: file, fullPage: FULL });
      const bad = (res && res.status() >= 400) || errors.length || overflow;
      if (bad) problems++;
      const notes = [
        res && res.status() >= 400 ? `HTTP ${res.status()}` : "",
        overflow ? "HORIZONTAL OVERFLOW" : "",
        ...errors.slice(0, 3).map((e) => `error: ${e.slice(0, 160)}`),
      ].filter(Boolean);
      console.log(
        `${bad ? "✗" : "✓"} ${name} ${route} → ${file}${notes.length ? `\n    ${notes.join("\n    ")}` : ""}`,
      );
      await page.close();
    }
    await context.close();
  }
  await browser.close();
  if (missingMedia.size)
    console.log(
      `note: ${missingMedia.size} local media file(s) missing in public/media/ (expected without the media bundle): ${[...missingMedia].slice(0, 4).join(", ")}`,
    );
  console.log(problems ? `${problems} page(s) with problems` : "all pages OK");
  process.exitCode = problems ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
