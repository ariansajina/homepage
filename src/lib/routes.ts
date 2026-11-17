import { getCollection } from "astro:content";
import { features } from "./features";

// Every page on the site. The top bar's "home" link takes the visitor to a random one of
// these (the landing page included), never the page they are on. Pages behind a feature
// flag that is off are left out.
export async function allRoutes(): Promise<string[]> {
  const works = await getCollection("works");
  const letters = await getCollection("letters");
  return [
    "/",
    "/about/",
    "/works/",
    "/letters/",
    "/dances/",
    ...(features.traces ? ["/conversations/"] : []),
    ...works.map((w) => `/works/${w.id}/`),
    ...letters.map((l) => `/letters/${l.id}/`),
  ];
}
