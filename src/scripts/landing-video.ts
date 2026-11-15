// The landing background video never stops: restart it if it ends or gets paused (some
// browsers pause muted background video to save power), unless the visitor prefers
// reduced motion.

let stop: (() => void) | null = null;

function keepPlaying(video: HTMLVideoElement) {
  video.muted = true;
  video.defaultMuted = true;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
  // Detach everything on the way out: removing a <video> from the page pauses it, and a
  // "pause" listener left behind would start it again, playing unseen for the rest of
  // the tab's life.
  return () => {
    window.clearInterval(watchdog);
    video.removeEventListener("ended", nudge);
    video.removeEventListener("pause", nudge);
    video.pause();
  };
}

document.addEventListener("astro:page-load", () => {
  stop?.();
  stop = null;
  const video = document.querySelector<HTMLVideoElement>("video[data-bg-video]");
  if (video) stop = keepPlaying(video);
});
document.addEventListener("astro:before-swap", () => {
  stop?.();
  stop = null;
});

export {};
