// Top bar behaviour on sub pages:
// - "back" says something different on every page view (never the same twice in a row,
//   remembered across reloads too);
// - "home" goes to a random page of the site, never the current one;
// - the bar hides while scrolling down and comes back on any scroll up. The state lives
//   on <html> (data-barhide / data-baredge) so the persisted corner decks follow it.

const PHRASES = [
  "back",
  "back to a familiar place",
  "back to a foreign place",
  "back wistfully",
  "back for a bit",
  "back for longer",
  "back at last",
];

function pickBack(): string {
  let last = "";
  try {
    last = localStorage.getItem("lastBack") || "";
  } catch {
    /* storage unavailable */
  }
  const pool = PHRASES.filter((p) => p !== last);
  const p = pool[Math.floor(Math.random() * pool.length)];
  try {
    localStorage.setItem("lastBack", p);
  } catch {
    /* storage unavailable */
  }
  return p;
}

const norm = (p: string) => (p.endsWith("/") ? p : `${p}/`);

let lastY = 0;
const root = document.documentElement;

function onScroll() {
  if (!document.querySelector(".topbar")) return;
  const y = window.scrollY || 0;
  const dy = y - lastY;
  let hidden = root.hasAttribute("data-barhide");
  if (y < 64) hidden = false;
  else if (dy > 6) hidden = true;
  else if (dy < -6) hidden = false;
  if (Math.abs(dy) > 6 || y < 64) lastY = y;
  root.toggleAttribute("data-barhide", hidden);
  root.toggleAttribute("data-baredge", y > 4);
}

function setup() {
  root.removeAttribute("data-barhide");
  root.removeAttribute("data-baredge");
  lastY = window.scrollY || 0;
  const bar = document.querySelector<HTMLElement>(".topbar");
  if (!bar) return;
  const back = bar.querySelector<HTMLElement>("[data-back]");
  if (back) back.textContent = pickBack();
  const home = bar.querySelector<HTMLAnchorElement>("[data-home]");
  if (home) {
    const routes: string[] = JSON.parse(bar.dataset.routes || "[]");
    const here = norm(location.pathname);
    const pool = routes.filter((r) => norm(r) !== here);
    if (pool.length) home.href = pool[Math.floor(Math.random() * pool.length)];
  }
}

window.addEventListener("scroll", onScroll, { passive: true });
document.addEventListener("astro:page-load", setup);

export {};
