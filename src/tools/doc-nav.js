// Doc navigation.
//
// A sticky "current heading" button sits top-left of the doc once you scroll
// past the title. Hover (or click) it to see every heading; pick one to jump
// there. Keys: j/k for next/previous heading, ]/[ for next/previous doc in
// the same folder.
(function () {
  "use strict";

  const BC = window.PenknifeBasecamp;
  const { icon, html, toast } = window.Penknife;

  const GAP = 12; // space between Basecamp's sticky toolbar and our button
  const CLOSE_DELAY = 180; // ms, so the menu does not flicker when the pointer crosses the gap

  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const toolbarBottom = () => (BC.toolbar() ? BC.toolbar().getBoundingClientRect().bottom : 0);

  function scrollToHeading(h) {
    const top = h.getBoundingClientRect().top + window.scrollY - toolbarBottom() - GAP;
    window.scrollTo({ top, behavior: reduceMotion() ? "auto" : "smooth" });
    // Basecamp headings have ids, so keep the URL shareable like its own "#" links do.
    if (h.id) history.replaceState(history.state, "", `#${h.id}`);
  }

  // Index of the heading the reader is in: the last one above the toolbar line.
  function currentIndex(headings) {
    const line = toolbarBottom() + GAP + 8;
    let current = -1;
    headings.forEach((h, i) => {
      if (h.getBoundingClientRect().top <= line) current = i;
    });
    return current;
  }

  function jumpHeading(dir) {
    const headings = BC.docHeadings();
    if (!headings.length) return toast("This doc has no headings");
    const i = currentIndex(headings);
    const line = toolbarBottom() + GAP + 8;
    // If we are exactly on a heading, "previous" means the one before it.
    const onHeading = i >= 0 && Math.abs(headings[i].getBoundingClientRect().top - line) < 12;
    const target = dir > 0 ? headings[i + 1] : headings[onHeading ? i - 1 : i];
    if (target) scrollToHeading(target);
    else if (dir < 0) window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
  }

  // ---- sticky contents button ------------------------------------------------

  let toc = null; // { root, label, items, headings, onScroll, onResize }

  function mountToc() {
    const headings = BC.docHeadings();
    const article = BC.article();
    if (!headings.length || !article) return;

    const root = html(`
      <div class="pk-toc action-sheet">
        <button type="button" class="btn btn--sm pk-toc__trigger" aria-haspopup="true" aria-expanded="false">
          ${icon("list")}
          <span class="pk-toc__label"></span>
          ${icon("chevron-down")}
        </button>
        <div class="action-sheet__content pk-toc__menu" role="menu" aria-label="Headings in this doc"></div>
      </div>`);
    const trigger = root.querySelector(".pk-toc__trigger");
    const label = root.querySelector(".pk-toc__label");
    const menu = root.querySelector(".pk-toc__menu");

    const items = headings.map((h) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = `action-sheet__action pk-toc__item pk-toc__item--${h.tagName.toLowerCase()}`;
      item.setAttribute("role", "menuitem");
      item.textContent = BC.headingText(h);
      item.title = item.textContent;
      item.addEventListener("click", () => {
        close();
        scrollToHeading(h);
      });
      menu.appendChild(item);
      return item;
    });

    // Open on hover, and on click/keyboard for touch and keyboard users.
    let closeTimer = null;
    const open = () => {
      clearTimeout(closeTimer);
      root.classList.add("expanded");
      trigger.setAttribute("aria-expanded", "true");
      const current = menu.querySelector(".pk-toc__item--current");
      if (current) current.scrollIntoView({ block: "nearest" });
    };
    const close = () => {
      clearTimeout(closeTimer);
      root.classList.remove("expanded");
      trigger.setAttribute("aria-expanded", "false");
    };
    root.addEventListener("mouseenter", open);
    root.addEventListener("mouseleave", () => {
      closeTimer = setTimeout(close, CLOSE_DELAY);
    });
    trigger.addEventListener("click", () => (root.classList.contains("expanded") ? close() : open()));
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        close();
        trigger.focus();
      }
    });
    root.addEventListener("focusout", (e) => {
      if (!root.contains(e.relatedTarget)) close();
    });

    let frame = 0;
    const update = () => {
      frame = 0;
      const header = article.querySelector(".perma-header") || article.firstElementChild;
      const line = toolbarBottom();
      // Show once the doc title has scrolled under the toolbar, hide past the doc's end.
      const visible = header.getBoundingClientRect().bottom < line && article.getBoundingClientRect().bottom > line + 120;
      root.classList.toggle("pk-toc--visible", visible);
      if (!visible) close();

      const i = currentIndex(headings);
      label.textContent = i >= 0 ? BC.headingText(headings[i]) : BC.docTitle();
      items.forEach((item, n) => item.classList.toggle("pk-toc__item--current", n === i));

      root.style.top = `${line + GAP}px`;
      root.style.left = `${article.getBoundingClientRect().left}px`;
    };
    const schedule = () => frame || (frame = requestAnimationFrame(update));

    document.body.appendChild(root);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();

    toc = { root, schedule };
  }

  function unmountToc() {
    if (!toc) return;
    window.removeEventListener("scroll", toc.schedule);
    window.removeEventListener("resize", toc.schedule);
    toc.root.remove();
    toc = null;
  }

  // ---- folder navigation --------------------------------------------------

  const folderCache = new Map(); // folder url -> Promise<docs>

  function folderDocs(url) {
    if (!folderCache.has(url)) {
      const p = BC.folderDocs(url).catch((err) => {
        folderCache.delete(url);
        throw err;
      });
      folderCache.set(url, p);
    }
    return folderCache.get(url);
  }

  async function siblingDoc(dir) {
    const folder = BC.folderUrl();
    if (!folder) return toast("Could not find this doc's folder");
    try {
      const docs = await folderDocs(folder);
      const here = location.pathname.replace(/\/$/, "");
      const i = docs.findIndex((d) => new URL(d.url).pathname === here);
      if (i === -1) return toast("Could not find this doc in its folder");
      const next = docs[i + dir];
      if (!next) return toast(dir > 0 ? "This is the last doc in the folder" : "This is the first doc in the folder");
      location.assign(next.url);
    } catch (err) {
      console.error("[penknife]", err);
      toast("Could not load the folder");
    }
  }

  window.Penknife.register({
    id: "doc-nav",
    matches: () => BC.isDocPage(),
    mount() {
      mountToc();
      // Warm the cache so [ and ] feel instant.
      const folder = BC.folderUrl();
      if (folder) folderDocs(folder).catch(() => {});
      return unmountToc;
    },
    alive: () => !toc || document.body.contains(toc.root),
    shortcuts: [
      { key: "j", description: "Next heading", run: () => jumpHeading(1) },
      { key: "k", description: "Previous heading", run: () => jumpHeading(-1) },
      { key: "]", description: "Next doc in this folder", run: () => siblingDoc(1) },
      { key: "[", description: "Previous doc in this folder", run: () => siblingDoc(-1) },
    ],
  });
})();
