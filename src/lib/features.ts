// Feature flags, set by environment variables at build time (local: .env or the shell;
// Railway: service variables, then redeploy). Unset means off. Accepted values: true/false.
// A bad value fails the build and names the variable.
const FLAGS = {
  // The Traces page (/conversations/): menu link, top-bar route and the page itself
  // (its URL redirects to the landing page while off).
  traces: "FEATURE_TRACES",
} as const;

export type FeatureName = keyof typeof FLAGS;
export const FEATURE_NAMES = Object.keys(FLAGS) as FeatureName[];

function flag(name: FeatureName): boolean {
  const variable = FLAGS[name];
  const raw = (import.meta.env[variable] ?? "").trim().toLowerCase();
  if (raw === "" || raw === "false") return false;
  if (raw === "true") return true;
  throw new Error(`${variable} must be "true" or "false" (got "${raw}")`);
}

export const features: Record<FeatureName, boolean> = {
  traces: flag("traces"),
};
