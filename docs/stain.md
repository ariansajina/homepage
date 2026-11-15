# The stain

On the landing page, a looping video sits behind a white cover. The cover clears pixel by
pixel, like a stain spreading through paper. It is born on the island of Vis, fills the
island, rests, then hops to the mainland and the other islands, and speeds up until the
whole coastline shows the video.

| File                                                | Role                                                        |
| --------------------------------------------------- | ----------------------------------------------------------- |
| `src/config/landing.yaml` (`stain:`, `background:`) | All the knobs                                               |
| `src/lib/stain-model.ts`                            | The model: which pixel clears when (pure functions, no DOM) |
| `src/scripts/stain.ts`                              | Draws it on the landing page                                |
| `src/dev/stain-preview.*`                           | The tuner at `/dev/stain` (dev server only)                 |
| `public/landing/coast-mask.png`                     | The coastline mask                                          |

## Tuning it

Run `npm run dev` and open <http://localhost:4321/dev/stain>. You can:

- scrub through the stain's life, or play it at 1×, 10× or 60×;
- change any setting live (shape settings rebuild the shape, timing settings don't);
- click the picture to move the origin;
- press **new shape** for another random outline.

The box at the bottom holds the matching `stain:` block. Paste it into
`src/config/landing.yaml`. The preview always shows a concrete seed. To keep a shape you
like for every visitor, copy its seed into `seed:`. With `seed: null`, every visit gets
a new shape.

## The mask

`public/landing/coast-mask.png` (1490 × 1290) is the coastline of the former Yugoslavia
with the Dalmatian islands. Its opacity decides what shows: opaque = land (the video shows
through once the stain reaches it), transparent = sea (always white). The soft blurred
inland edge fades the video out.

The mask is applied to the video at runtime (CSS `mask-image`). It is not baked into
the video file, so you can replace the video and keep the mask, or the reverse. The frame
takes the mask's aspect ratio, and the stain grid follows it. The mask must live in
`public/`, on the site's own origin: the stain reads its pixels, which a browser only allows
for same-origin images.

## The model

The model has two independent halves: an **order** (which pixel clears before which) and a
**clock** (how many pixels are clear at time _t_). The order decides the shape; the clock
decides the pace.

### 1. The order (`planStain`)

The stain lives on a grid `resolution` pixels wide; the height follows the mask's aspect
ratio. The default, 533 × 461, is coarser than the screen: each grid pixel covers a few
screen pixels, and `image-rendering: pixelated` keeps them crisp. That gives the stain its
grain.

**Keys.** Every grid pixel gets a key, roughly its distance from the origin:

```
key = distance / radius(angle) × e^(noise) + jitter
```

- `distance` from the origin, in units of 0.6 × the grid width.
- `radius(angle)` = 1 + a sum of five random harmonics (2–6 bumps around the circle). Each
  harmonic's amplitude is random, up to ±0.5 / h, scaled by **`lobes`**. These are the big
  bulges of the outline. With `lobes: 0` the stain grows as a circle (apart from the noise).
- `noise` = smooth value noise at three scales (4, 11 and 30 cells across the grid),
  weighted 1.6 / 1.0 / 0.5 and scaled by **`raggedness`**. It frays the front: large
  wandering inlets, mid-size wiggles and fine fringe. Exponentiating means the noise
  stretches or squeezes the distance; it never makes a pixel negative.
- `jitter` = a small random amount that grows with distance (0.03 + 0.12 × distance). The
  front looks speckled rather than clean-edged, more so far from the origin.
- Sea pixels (transparent in the mask) get +6, which sends them to the very end.

**Pieces.** The mask's land (opacity ≥ 0.3) is split into connected pieces: the mainland
and each island. The faint fringe around them (opacity ≥ 0.08) joins the nearest piece.

**Flood fill.** Starting at the origin pixel, the stain repeatedly takes the lowest-key
pixel that touches what it already has (a priority-queue flood fill). It never crosses
from one piece to another through the sea. Each other piece is seeded at its own
lowest-key pixel with a +50 key penalty. That penalty is so large that the origin's piece
(Vis) fills completely before any other piece starts. After that, the pieces fill in
roughly the order the spreading front would reach them.

The result is a permutation of every grid pixel: the order in which they clear. It is
computed once per visit (about 0.1–0.3 s at the default resolution) and kept while the
visitor moves around the site.

### 2. The clock (`clearedAt`)

The clock maps _t_, the seconds since the first pixel, to a number _n_: the first _n_ pixels
of the order are clear. Time only counts visible pixels, so crossing the sea between
pieces takes no time.

1. **Delay.** Nothing happens for `delaySeconds` after the landing page first opens.
2. **Prelude.** The first pixels arrive singly or in tiny groups (1, 1, 1, 2, 1, 3, 2 …
   20 steps, 76 pixels). The gaps between them are random but shrink each step. The
   prelude is squeezed to fit within `preludeShare` of the spreading time.
3. **Spreading.** After the prelude, the count follows
   `n = total × u^acceleration`, where _u_ runs from 0 to 1 over the remaining spreading
   time. With `acceleration` above 1 it starts slow and finishes fast. 2.2 means that at
   half time, about a fifth of the shape is clear.
4. **Rest.** When Vis is full, the clock stops for `restSeconds`. Then the stain hops to
   the mainland and the curve continues where it left off.
5. **Done.** At `growSeconds` after the first pixel, everything is clear and the cover is
   removed.

So the spreading time is `growSeconds − restSeconds`, and the whole show takes
`delaySeconds + growSeconds` (9 + 180 s by default).

Visitors who prefer reduced motion get no stain: the cover is hidden and the video
paused.

## Settings

| Setting        | Default                    | Effect                                                           |
| -------------- | -------------------------- | ---------------------------------------------------------------- |
| `delaySeconds` | 9                          | From page load to the first pixel                                |
| `growSeconds`  | 180                        | From the first pixel to the whole shape, rest included           |
| `restSeconds`  | 90                         | Pause once Vis is full (must be < `growSeconds`)                 |
| `origin`       | `{ x: 0.2867, y: 0.6504 }` | Where it is born (Vis), as fractions of the mask                 |
| `acceleration` | 2.2                        | Curve exponent: 1 = steady, higher = slower start, faster finish |
| `preludeShare` | 0.4                        | Most of the spreading time the single-pixel prelude may take     |
| `raggedness`   | 1                          | Noise strength: 0 = smooth front, 2 = very frayed                |
| `lobes`        | 1                          | Strength of the big bulges: 0 = round, 2 = star-like             |
| `resolution`   | 533                        | Grid width in pixels: higher = finer grain, slower to plan       |
| `seed`         | `null`                     | A number = the same shape every visit; `null` = new each visit   |

The defaults reproduce the design exactly. The design's settings panel had "hop 120 s"
with a hidden cap at half the grow time, which made the effective rest 90 s. Here the rest
is set directly.

The internals that are not settings are named constants at the top of
`src/lib/stain-model.ts`: the land and fringe thresholds, the +50 hop penalty and the
prelude group sizes.
