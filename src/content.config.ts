import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob, file } from "astro/loaders";
import { parse as parseYaml } from "yaml";

// Works: one Markdown file per work; the body is the short description.
// Newest first is derived from `date` (the earliest date of the work).
const works = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/works" }),
  schema: z.object({
    title: z.string(),
    year: z.string(),
    date: z.coerce.date(),
    link: z.object({ href: z.url(), label: z.string() }).optional(),
    credits: z.array(z.object({ role: z.string(), name: z.string() })).default([]),
    shows: z.array(z.object({ when: z.string(), where: z.string() })).default([]),
  }),
});

// Letters: long-form writing. Media inside the text goes in the Markdown as a
// <figure> (class "wide" to reach past the text column, "pair" for two side by side).
const letters = defineCollection({
  loader: glob({ pattern: "*.md", base: "./src/content/letters" }),
  schema: z.object({
    title: z.string(),
    published: z.coerce.date(),
    edited: z.coerce.date().optional(),
    description: z.string().optional(),
    cover: z
      .object({
        type: z.enum(["image", "video"]),
        src: z.string(),
        alt: z.string(),
        // Intrinsic pixel size of an image cover: reserves its space while it loads.
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        caption: z.string().optional(),
      })
      .optional(),
  }),
});

// Dances: short videos (1–5 min). `video` and `poster` are R2 keys; empty = placeholder.
const dances = defineCollection({
  loader: file("src/data/dances.yaml"),
  schema: z.object({
    title: z.string(),
    length: z.string(),
    video: z.string().default(""),
    poster: z.string().default(""),
  }),
});

// Music for the player, in play order. `src` is an R2 key.
const tracks = defineCollection({
  loader: file("src/data/tracks.yaml"),
  schema: z.object({ title: z.string(), artist: z.string(), src: z.string() }),
});

// "Where to find me next", soonest first. The corner button hides when this is empty.
const upcoming = defineCollection({
  loader: file("src/data/upcoming.yaml"),
  schema: z.object({ title: z.string(), where: z.string() }),
});

// Conversations: the shelf of books, films, podcasts and pages, in curated order. The
// loader hands entries back sorted by id, so the parser records each one's place in the
// file as `order`.
export const conversationKinds = ["books", "films", "podcasts", "pages"] as const;
const conversations = defineCollection({
  loader: file("src/data/conversations.yaml", {
    parser: (text) =>
      (parseYaml(text) as Record<string, unknown>[]).map((entry, order) => ({ ...entry, order })),
  }),
  schema: z.object({
    order: z.number().int(),
    title: z.string(),
    by: z.string().default(""),
    kind: z.enum(conversationKinds),
    note: z.string().default(""),
    href: z.url().optional(),
    pics: z.array(z.object({ src: z.string().default(""), alt: z.string() })).default([]),
  }),
});

export const collections = { works, letters, dances, tracks, upcoming, conversations };
