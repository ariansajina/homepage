// Loads and validates src/config/landing.yaml (build time only). A bad value fails the
// build with the path of the offending key, so the YAML can be edited without fear.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { parse } from "yaml";
import { z } from "astro/zod";
import raw from "../config/landing.yaml?raw";
import { LAND } from "./stain-model";

const positive = z.number().positive();
const fraction = z.number().min(0).max(1);

const schema = z.object({
  menu: z
    .array(
      z.object({
        href: z.string().startsWith("/"),
        words: z.array(z.string().min(1)).min(2),
      }),
    )
    .min(1),
  scramble: z.object({
    pauseSeconds: positive,
    holdSeconds: positive,
    scrambleMs: positive,
    letters: z.string().min(1),
  }),
  background: z.object({
    video: z.object({ webm: z.string().optional(), mp4: z.string().optional() }),
    mask: z.string().startsWith("/"),
  }),
  stain: z
    .object({
      delaySeconds: z.number().min(0),
      growSeconds: positive,
      restSeconds: z.number().min(0),
      origin: z.object({ x: fraction, y: fraction }),
      acceleration: positive,
      preludeShare: fraction,
      raggedness: z.number().min(0),
      lobes: z.number().min(0),
      resolution: z.number().int().min(50).max(2000),
      seed: z.number().int().nullable(),
    })
    .refine((s) => s.restSeconds < s.growSeconds, {
      message: "restSeconds must be shorter than growSeconds",
      path: ["restSeconds"],
    }),
});

export type LandingConfig = z.infer<typeof schema>;
export type StainConfig = LandingConfig["stain"];

const result = schema.safeParse(parse(raw));
if (!result.success) {
  const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`src/config/landing.yaml is invalid:\n${issues}`);
}
export const landing: LandingConfig = result.data;

// Resolved from the project root: dev, check and build all run there.
const maskFile = readFileSync(join(process.cwd(), "public", landing.background.mask));
if (maskFile.toString("ascii", 12, 16) !== "IHDR")
  throw new Error(`${landing.background.mask} is not a PNG`);

// Intrinsic size of the mask PNG (read from its header), so the frame and the stain
// grid follow its aspect ratio if the mask is ever replaced.
export const maskSize = { width: maskFile.readUInt32BE(16), height: maskFile.readUInt32BE(20) };

// The mask's opacity (0..255) per pixel, or null for a PNG that is not plain 8-bit RGBA
// (the check below is then skipped). A minimal decoder: inflate, then undo the row filters.
function pngAlpha(png: Buffer, width: number, height: number): Uint8Array | null {
  const [depth, colourType, , , interlace] = png.subarray(24, 29);
  if (depth !== 8 || colourType !== 6 || interlace !== 0) return null;
  const chunks: Buffer[] = [];
  for (let at = 8; at + 8 <= png.length;) {
    const size = png.readUInt32BE(at);
    if (png.toString("ascii", at + 4, at + 8) === "IDAT")
      chunks.push(png.subarray(at + 8, at + 8 + size));
    at += 12 + size;
  }
  const data = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  if (data.length < (stride + 1) * height) return null;
  const alpha = new Uint8Array(width * height);
  let above = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    const row = Uint8Array.from(data.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? row[i - 4] : 0; // left
      const b = above[i];
      const c = i >= 4 ? above[i - 4] : 0; // above left
      let predicted = 0;
      if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a),
          pb = Math.abs(p - b),
          pc = Math.abs(p - c);
        predicted = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      row[i] = (row[i] + predicted) & 255;
    }
    for (let x = 0; x < width; x++) alpha[y * width + x] = row[x * 4 + 3];
    above = row;
  }
  return alpha;
}

// The stain must be born on land. An origin in the sea would clear the sea first and
// throw the timing off, so refuse it here, with the reason.
{
  const { width, height } = maskSize;
  const alpha = pngAlpha(maskFile, width, height);
  if (alpha) {
    const { origin, resolution } = landing.stain;
    // Average over the mask pixels that one stain-grid pixel covers.
    const half = Math.max(1, Math.round(width / resolution / 2));
    const cx = Math.min(width - 1, Math.round(origin.x * width));
    const cy = Math.min(height - 1, Math.round(origin.y * height));
    let sum = 0,
      count = 0;
    for (let y = Math.max(0, cy - half); y <= Math.min(height - 1, cy + half); y++)
      for (let x = Math.max(0, cx - half); x <= Math.min(width - 1, cx + half); x++) {
        sum += alpha[y * width + x];
        count++;
      }
    if (sum / count / 255 < LAND)
      throw new Error(
        `src/config/landing.yaml is invalid:\n  stain.origin: { x: ${origin.x}, y: ${origin.y} } is in the sea ` +
          `(transparent in ${landing.background.mask}). Pick a point on land, e.g. by clicking in the tuner at /dev/stain.`,
      );
  }
}
