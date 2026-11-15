---
name: run-homepage
description: Start the homepage's dev server and check pages in a real browser at desktop and phone sizes, with screenshots and a report of console errors and overflow. Use whenever a change is visual (styles, layout, pages, landing scramble or stain, player), when asked to run, preview or screenshot the site, or before committing UI work.
---

# Checking the homepage in a browser

One command does everything: starts (or reuses) the Astro dev server, opens each page in
headless Chromium at 1440×900 and 390×844, saves PNGs, and prints one line per page.

```bash
node .claude/skills/run-homepage/check.cjs                         # every main page, both sizes
node .claude/skills/run-homepage/check.cjs /about/ /letters/use-signal/
node .claude/skills/run-homepage/check.cjs --view=phone /dances/
node .claude/skills/run-homepage/check.cjs --view=desktop --at=60 /    # landing, 60 s in
node .claude/skills/run-homepage/check.cjs --full /letters/use-signal/ # whole page
node .claude/skills/run-homepage/check.cjs --stop                      # stop the server
```

Then **Read only the PNGs you need** (paths are printed; default folder
`$TMPDIR/homepage-shots`). Each screenshot costs context, so check the one or two pages
the change touches, not all fourteen, unless the change is global (layout, base styles).

## Reading the output

- `✓` / `✗` per page. `✗` lines list the HTTP status, `HORIZONTAL OVERFLOW` (the page
  scrolls sideways: a phone-layout bug) and up to three console or page errors.
- `note: N local media file(s) missing`: `public/media/` lacks files. This is normal in
  a fresh cloud session (media is gitignored, so the video, photo and music are blank).
  It is not a failure.
- Exit code 1 when any page has problems.

## Timing-dependent things (`--at`)

The landing page changes over time. `--at=SECONDS` installs a fake clock and fast-forwards
it after load:

- scramble: a word is mid-scramble or foreign at most moments after ~3 s;
- stain: nothing until 9 s; Vis fills over the next minute or so (a few pixels: hard to
  see); rest until ~150 s; `--at=200` shows the finished, fully revealed state.

For tuning the stain itself, use the dev-only tuner at `/dev/stain` (see docs/stain.md)
instead of many `--at` runs.

## Gotchas this script already handles

- It waits for `load`, never `networkidle`: the landing video loops, so the network
  never goes idle.
- A stale `astro preview` (or anything else) on the port is detected (no Vite client)
  and replaced, so you never test an old build by accident.
- The server runs detached and survives between calls. Reuse it, and `--stop` when done.
  Its log is at `$TMPDIR/homepage-dev.log`.
- Playwright and Chromium are preinstalled in cloud sessions. Don't install them.

## Interacting beyond screenshots

For clicks or flows (open the player, play a dance, navigate and check that the music
keeps playing), write a short throwaway Playwright script in the scratchpad that targets
the already-running server (`http://127.0.0.1:4321`). Useful selectors:
`#player [data-tab]`, `#player [data-toggle]`, `#player audio`, `.menu a`, `.dcard`,
`dialog[data-dance-dialog]`, `[data-back]`, `[data-home]`, `canvas[data-stain]`.
