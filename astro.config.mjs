// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Fully static build (dist/), served by Caddy on Railway (see Dockerfile).
// SITE_URL is the canonical origin; the sitemap is only generated when it is set.
const site = process.env.SITE_URL || undefined;

// Dev-only pages (never part of the build): the stain tuner at /dev/stain.
/** @type {import("astro").AstroIntegration} */
const devPages = {
  name: "dev-pages",
  hooks: {
    "astro:config:setup": ({ command, injectRoute }) => {
      if (command === "dev")
        injectRoute({ pattern: "/dev/stain", entrypoint: "./src/dev/stain-preview.astro" });
    },
  },
};

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "ignore",
  build: { format: "directory" },
  integrations: [
    devPages,
    // The CMS at /admin/ is not a page for search engines.
    ...(site ? [sitemap({ filter: (page) => !new URL(page).pathname.startsWith("/admin") })] : []),
  ],
});
