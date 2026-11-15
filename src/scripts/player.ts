// Corner decks: the music player and "where to find me next".
//
// Both decks are persisted across client-router navigations, so this module runs once
// and keeps references to the same elements for the life of the tab. Every new page
// starts with both decks folded away (the music itself keeps playing).
//
// Other scripts can pause the music and have it pick up again later by dispatching
// "music:hold" / "music:resume" on window (the dance videos do this).

type Track = { title: string; artist: string; src: string };

// ---- shared deck behaviour (open/close, title crawl) ----

let animTimer: number | undefined;

function setOpen(deck: HTMLElement, open: boolean, animate: boolean) {
  const tab = deck.querySelector<HTMLButtonElement>("[data-tab]");
  const panel = deck.querySelector<HTMLElement>(".ap-panel");
  deck.classList.toggle("open", open);
  deck.classList.toggle("anim", animate);
  panel?.toggleAttribute("inert", !open);
  tab?.setAttribute("aria-expanded", String(open));
  if (tab && deck.id === "player")
    tab.setAttribute("aria-label", open ? "hide the player" : "show the player");
  if (tab && deck.id === "next-deck")
    tab.setAttribute("aria-label", open ? "hide where to find me next" : "where to find me next");
  if (animate) {
    window.clearTimeout(animTimer);
    animTimer = window.setTimeout(() => deck.classList.remove("anim"), 450);
  }
}

// Title and artist drift to the left in a loop.
function measureCrawl(box: HTMLElement | null) {
  if (!box) return;
  const words = box.querySelector<HTMLElement>(".ap-words");
  const crawl = box.querySelector<HTMLElement>(".ap-crawl");
  if (!words || !crawl) return;
  const gap = parseFloat(getComputedStyle(crawl).columnGap) || 39;
  const w = words.offsetWidth;
  if (w <= 0) {
    box.removeAttribute("data-crawl");
    return;
  }
  const d = Math.round(w + gap);
  if (box.dataset.k === String(d)) return;
  box.dataset.k = String(d);
  box.style.setProperty("--d", `${d}px`);
  box.style.setProperty("--t", `${d * 35}ms`);
  box.setAttribute("data-crawl", "");
}

function decks(): HTMLElement[] {
  return [document.getElementById("player"), document.getElementById("next-deck")].filter(
    (d): d is HTMLElement => d !== null,
  );
}

function measureAll() {
  decks().forEach((d) => measureCrawl(d.querySelector<HTMLElement>("[data-crawl-box]")));
}

function initDecks() {
  decks().forEach((deck) => {
    deck.querySelector("[data-tab]")?.addEventListener("click", () => {
      setOpen(deck, !deck.classList.contains("open"), true);
    });
  });
  measureAll();
  window.addEventListener("resize", measureAll);
  document.fonts?.ready.then(measureAll);
  // Every page starts with the decks folded away, without animation.
  document.addEventListener("astro:after-swap", () => {
    decks().forEach((d) => setOpen(d, false, false));
  });
}

// ---- music player ----

function initPlayer() {
  const deck = document.getElementById("player");
  if (!deck) return;
  const audio = deck.querySelector("audio")!;
  const tracks: Track[] = JSON.parse(deck.dataset.tracks || "[]");
  if (tracks.length === 0) return;
  const toggleBtn = deck.querySelector<HTMLButtonElement>("[data-toggle]")!;
  const range = deck.querySelector<HTMLInputElement>(".ap-prog input")!;
  const fill = deck.querySelector<HTMLElement>(".ap-fill")!;
  const dot = deck.querySelector<HTMLElement>(".ap-dot")!;
  let idx = 0;
  let held = false;

  const showProgress = (frac: number) => {
    const pct = Math.max(0, Math.min(1, frac)) * 100;
    fill.style.width = `${pct.toFixed(2)}%`;
    dot.style.left = `calc(3.5px + ${pct.toFixed(2)}% - ${(pct * 0.07).toFixed(2)}px)`;
    range.value = String(Math.round(pct * 10));
  };

  const load = (i: number, autoplay: boolean) => {
    idx = (i + tracks.length) % tracks.length;
    const t = tracks[idx];
    deck.querySelectorAll("[data-track-title]").forEach((el) => (el.textContent = t.title));
    deck.querySelectorAll("[data-track-artist]").forEach((el) => (el.textContent = t.artist));
    audio.src = t.src;
    showProgress(0);
    measureAll();
    if (autoplay) audio.play().catch(() => {});
  };

  toggleBtn.addEventListener("click", () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  deck.querySelector("[data-prev]")?.addEventListener("click", () => {
    if (audio.currentTime > 3) audio.currentTime = 0;
    else load(idx - 1, !audio.paused);
  });
  deck.querySelector("[data-next]")?.addEventListener("click", () => load(idx + 1, !audio.paused));
  range.addEventListener("input", () => {
    const v = Number(range.value) / 1000;
    showProgress(v);
    if (audio.duration) audio.currentTime = v * audio.duration;
  });
  audio.addEventListener("timeupdate", () => {
    if (audio.duration) showProgress(audio.currentTime / audio.duration);
  });
  audio.addEventListener("play", () => {
    deck.classList.add("playing");
    toggleBtn.setAttribute("aria-label", "pause");
  });
  audio.addEventListener("pause", () => {
    deck.classList.remove("playing");
    toggleBtn.setAttribute("aria-label", "play");
  });
  audio.addEventListener("ended", () => {
    if (tracks.length > 1) load(idx + 1, true);
    else showProgress(0);
  });

  // A video with sound pauses the music; it picks up again when the video closes.
  window.addEventListener("music:hold", () => {
    if (!audio.paused) {
      held = true;
      audio.pause();
    }
  });
  window.addEventListener("music:resume", () => {
    if (!held) return;
    held = false;
    if (audio.paused) audio.play().catch(() => {});
  });
}

initDecks();
initPlayer();

export {};
