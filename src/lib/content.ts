import { getCollection, type CollectionEntry } from "astro:content";

// Works, newest first (by the work's earliest date).
export async function sortedWorks(): Promise<CollectionEntry<"works">[]> {
  return (await getCollection("works")).sort(
    (a, b) => b.data.date.getTime() - a.data.date.getTime(),
  );
}

// Letters, newest first.
export async function sortedLetters(): Promise<CollectionEntry<"letters">[]> {
  return (await getCollection("letters")).sort(
    (a, b) => b.data.published.getTime() - a.data.published.getTime(),
  );
}

const fmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
export const longDate = (d: Date) => fmt.format(d);
