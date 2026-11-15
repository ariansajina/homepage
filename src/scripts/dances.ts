// Dances grid: one video open at a time, played in a modal <dialog> that asks for real
// full screen. Playing a video pauses the music; closing it (button, Esc, or leaving full
// screen) lets the music pick up where it stopped.

type Dance = { id: string; title: string; length: string; video: string; poster: string };

function setup() {
  const dialog = document.querySelector<HTMLDialogElement>("[data-dance-dialog]");
  if (!dialog) return;
  const video = dialog.querySelector<HTMLVideoElement>("[data-dance-video]")!;
  const empty = dialog.querySelector<HTMLElement>("[data-dance-empty]")!;
  const label = dialog.querySelector<HTMLElement>("[data-dance-label]")!;

  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  const open = (d: Dance) => {
    label.textContent = `${d.title} · ${d.length}`;
    dialog.setAttribute("aria-label", d.title);
    const has = !!d.video;
    video.hidden = !has;
    empty.hidden = has;
    if (has) {
      video.poster = d.poster;
      video.src = d.video;
    }
    dialog.showModal();
    dialog.requestFullscreen?.().catch(() => {});
    if (has) video.play().catch(() => {});
  };

  dialog.addEventListener("close", () => {
    video.pause();
    video.removeAttribute("src");
    video.load();
    exitFullscreen();
    window.dispatchEvent(new Event("music:resume"));
  });
  video.addEventListener("play", () => window.dispatchEvent(new Event("music:hold")));
  dialog.querySelector("[data-dance-close]")!.addEventListener("click", () => dialog.close());
  document.querySelectorAll<HTMLButtonElement>("[data-dance]").forEach((btn) => {
    btn.addEventListener("click", () => open(JSON.parse(btn.dataset.dance!)));
  });
}

// Leaving full screen (Esc, a system gesture) also closes the video.
document.addEventListener("fullscreenchange", () => {
  const dialog = document.querySelector<HTMLDialogElement>("[data-dance-dialog]");
  if (!document.fullscreenElement && dialog?.open) dialog.close();
});
document.addEventListener("astro:page-load", setup);
document.addEventListener("astro:before-swap", () => {
  document.querySelector<HTMLDialogElement>("[data-dance-dialog]")?.close();
});

export {};
