// The about-page video autoplays muted (browsers always allow that). The visitor turns
// the sound on with the video's own controls; while it has sound the music is held, and
// it picks up again when the video is muted, paused or left.

let stop: (() => void) | null = null;

function start(video: HTMLVideoElement) {
  const hold = () => window.dispatchEvent(new Event("music:hold"));
  const resume = () => window.dispatchEvent(new Event("music:resume"));
  const sync = () => (video.muted || video.paused || video.volume === 0 ? resume() : hold());
  const events = ["playing", "pause", "volumechange"] as const;
  events.forEach((e) => video.addEventListener(e, sync));

  video.muted = true;
  video.play().catch(() => {});

  return () => {
    events.forEach((e) => video.removeEventListener(e, sync));
    video.pause();
    resume();
  };
}

document.addEventListener("astro:page-load", () => {
  stop?.();
  stop = null;
  const video = document.querySelector<HTMLVideoElement>("video[data-about-video]");
  if (video) stop = start(video);
});
document.addEventListener("astro:before-swap", () => {
  stop?.();
  stop = null;
});

export {};
