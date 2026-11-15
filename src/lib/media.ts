// The one place that knows where media lives.
//
// Content refers to media by its key in the R2 bucket (e.g. "about/arian.jpg").
// In production PUBLIC_MEDIA_URL is the bucket's public custom domain; in local dev
// it is unset and the same keys are served from public/media/ (gitignored).
const BASE = (import.meta.env.PUBLIC_MEDIA_URL || "/media").replace(/\/+$/, "");

export function media(key: string | undefined | null): string {
  if (!key) return "";
  if (/^https?:\/\//.test(key)) return key;
  return `${BASE}/${key.replace(/^\/+/, "")}`;
}
