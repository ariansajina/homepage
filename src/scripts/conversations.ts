// Conversations shelf: the filter words and the "more" button. The spines themselves are
// <details name="shelf">, so opening one closes the others without any script.
// The chosen kind lives in the URL (?kind=films), so a filtered shelf can be shared.

function setup() {
  const root = document.querySelector<HTMLElement>("[data-shelf]");
  if (!root) return;
  const { pageSize } = JSON.parse(root.dataset.shelf!) as { pageSize: number };
  const books = [...root.querySelectorAll<HTMLLIElement>(".book")];
  const filters = [...root.querySelectorAll<HTMLButtonElement>("[data-filter]")];
  const more = root.querySelector<HTMLButtonElement>("[data-shelf-more]")!;
  const kinds = new Set(filters.map((b) => b.dataset.filter));

  const fromUrl = new URL(location.href).searchParams.get("kind");
  let kind = fromUrl && kinds.has(fromUrl) ? fromUrl : "all";
  let limit = pageSize;

  const render = () => {
    let shown = 0;
    for (const book of books) {
      const match = kind === "all" || book.dataset.kind === kind;
      const hide = !match || shown >= limit;
      if (match) shown++;
      book.hidden = hide;
      if (hide) book.querySelector("details")!.open = false;
    }
    more.hidden = shown <= limit;
    for (const b of filters) b.setAttribute("aria-pressed", String(b.dataset.filter === kind));
  };

  for (const b of filters) {
    b.addEventListener("click", () => {
      kind = b.dataset.filter!;
      limit = pageSize;
      const url = new URL(location.href);
      if (kind === "all") url.searchParams.delete("kind");
      else url.searchParams.set("kind", kind);
      // Keep the client router's history state.
      history.replaceState(history.state, "", url);
      render();
    });
  }
  more.addEventListener("click", () => {
    // Focus the first newly shown spine, so keyboard users carry on from there.
    const before = books.filter((b) => !b.hidden).length;
    limit += pageSize;
    render();
    books
      .filter((b) => !b.hidden)
      [before]?.querySelector("summary")
      ?.focus();
  });
  render();
}

document.addEventListener("astro:page-load", setup);

export {};
