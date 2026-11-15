// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Fully static build (dist/), served by Caddy on Railway (see Dockerfile).
// SITE_URL is the canonical origin; the sitemap is only generated when it is set.
const site = process.env.SITE_URL || undefined;

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  integrations: site ? [sitemap()] : [],
});
