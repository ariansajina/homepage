// Loads and validates src/config/landing.yaml (build time only). A bad value fails the
// build with the path of the offending key, so the YAML can be edited without fear.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "astro/zod";
import raw from "../config/landing.yaml?raw";

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

// Intrinsic size of the mask PNG (read from its header), so the frame and the stain
// grid follow its aspect ratio if the mask is ever replaced.
function pngSize(publicPath: string): { width: number; height: number } {
  // Resolved from the project root: dev, check and build all run there.
  const buf = readFileSync(join(process.cwd(), "public", publicPath));
  if (buf.toString("ascii", 12, 16) !== "IHDR") throw new Error(`${publicPath} is not a PNG`);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
export const maskSize = pngSize(landing.background.mask);
