// The works-page corner videos are decorative loops: muted autoplay, paused for visitors
// who prefer reduced motion (they keep showing their first frame). When both copies are
// on screen the second one follows the first, so they always show the same frame.

let stop: (() => void) | null = null;

function start(videos: HTMLVideoElement[]) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  videos.forEach((v) => (v.muted = true));
  if (reduce) {
    videos.forEach((v) => v.pause());
    return () => {};
  }

  const [lead, ...followers] = videos;
  const visible = (v: HTMLVideoElement) => v.offsetParent !== null;
  const align = () => {
    const d = lead.duration;
    if (!d || lead.readyState < 2) return;
    if (lead.paused && !document.hidden) lead.play().catch(() => {});
    for (const f of followers) {
      if (!visible(f) || f.readyState < 2) continue;
      // Distance on the loop, so one copy just past the wrap-around doesn't look far off.
      let diff = Math.abs(f.currentTime - lead.currentTime);
      diff = Math.min(diff, d - diff);
      if (diff > 0.08) f.currentTime = lead.currentTime;
      if (f.paused) f.play().catch(() => {});
    }
  };

  // Start them together: all from 0 once every copy has enough data.
  const ready = () => videos.every((v) => v.readyState >= 3);
  const begin = () => {
    if (!ready()) return;
    videos.forEach((v) => (v.currentTime = 0));
    videos.forEach((v) => v.play().catch(() => {}));
  };
  videos.forEach((v) => v.pause());
  if (ready()) begin();
  else videos.forEach((v) => v.addEventListener("canplay", begin, { once: true }));

  const timer = window.setInterval(align, 250);
  lead.addEventListener("seeked", align);
  return () => {
    window.clearInterval(timer);
    lead.removeEventListener("seeked", align);
    videos.forEach((v) => v.removeEventListener("canplay", begin));
  };
}

document.addEventListener("astro:page-load", () => {
  stop?.();
  stop = null;
  const videos = [...document.querySelectorAll<HTMLVideoElement>("video[data-works-video]")];
  if (videos.length) stop = start(videos);
});
document.addEventListener("astro:before-swap", () => {
  stop?.();
  stop = null;
});

export {};
