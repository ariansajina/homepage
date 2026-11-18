// The Sveltia CMS configuration at /admin/config.yml: src/config/cms.yml plus the sign-in
// setup, which depends on the deployment.
//
// CMS_AUTH_URL is the origin of the Sveltia CMS Authenticator (a Cloudflare Worker that
// runs GitHub's OAuth flow; see README → Editing with the CMS). When set, editors sign in
// with GitHub. When unset (local dev, or before the Worker exists), only access-token
// sign-in is offered; on localhost the CMS can also work on the local checkout directly.
import type { APIRoute } from "astro";
import { parse, stringify } from "yaml";
import source from "../../config/cms.yml?raw";

function authUrl(): string | undefined {
  const raw = (import.meta.env.CMS_AUTH_URL ?? "").trim();
  if (raw === "") return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `CMS_AUTH_URL must be a URL like https://auth.example.workers.dev (got "${raw}")`,
    );
  }
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash)
    throw new Error(`CMS_AUTH_URL must be an https origin with no path (got "${raw}")`);
  return url.origin;
}

export const GET: APIRoute = () => {
  const config = parse(source);
  const baseUrl = authUrl();
  config.backend = {
    ...config.backend,
    ...(baseUrl
      ? { base_url: baseUrl, auth_methods: ["oauth", "token"] }
      : { auth_methods: ["token"] }),
  };
  const body = stringify(config, { aliasDuplicateObjects: false, lineWidth: 0 });
  return new Response(body, { headers: { "Content-Type": "application/yaml; charset=utf-8" } });
};
