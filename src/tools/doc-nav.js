// Doc navigation.
//
// A "current heading" navigator sits in Basecamp's left margin, beside the
// doc. Hover (or click) it to see every heading; pick one to jump there.
// Keys: j/k for next/previous heading, ]/[ for next/previous doc in the
// same folder.
(function () {
  "use strict";

  const BC = window.PenknifeBasecamp;
  const { icon, html, toast } = window.Penknife;

  const GAP = 12; // space between Basecamp's sticky toolbar and a heading we jump to

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

  // ---- heading navigator ----------------------------------------------------
  //
  // Lives in Basecamp's left margin, the same track as "Back to top":
  //   rail – wide windows: a button beside the doc, level with the toolbar
  //   edge – narrow windows: a vertical tab on the doc's left edge, like the
  //          yellow "The client can see…" tab on the right edge
  // It follows Basecamp's own breakpoints (see PenknifeBasecamp.leftMargin).

  const GUTTER = 12; // Basecamp's --back-to-top-gap
  const HOVER_GRACE = 250; // ms before closing, so the pointer can cross gaps

  let toc = null; // { root, schedule }

  function mountToc() {
    const headings = BC.docHeadings();
    if (!headings.length || !BC.card()) return;

    const root = html(`
      <nav class="pk-toc action-sheet" aria-label="Headings in this doc">
        <button type="button" class="btn btn--ghost btn--sm pk-toc__trigger" aria-haspopup="true" aria-expanded="false">
          ${icon("list")}
          <span class="pk-toc__label"></span>
        </button>
        <div class="action-sheet__content pk-toc__menu" role="menu"></div>
      </nav>`);
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

    // Hover opens it. Leaving starts a short timer, and the timer only closes
    // the menu if the pointer is not back over the button or menu by then.
    let closeTimer = null;
    let openedAt = 0;
    const isOpen = () => root.classList.contains("expanded");
    const open = () => {
      clearTimeout(closeTimer);
      if (isOpen()) return;
      openedAt = Date.now();
      root.classList.add("expanded");
      trigger.setAttribute("aria-expanded", "true");
      const current = menu.querySelector(".pk-toc__item--current");
      if (current) menu.scrollTop = current.offsetTop - menu.clientHeight / 2 + current.offsetHeight / 2;
    };
    const close = () => {
      clearTimeout(closeTimer);
      root.classList.remove("expanded");
      trigger.setAttribute("aria-expanded", "false");
    };
    const closeSoon = () => {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        if (!root.matches(":hover") && !root.contains(document.activeElement)) close();
      }, HOVER_GRACE);
    };
    root.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && open());
    root.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && closeSoon());
    // Click and keyboard still work, for touch screens and keyboard users.
    // A mouse click lands just after hover opened the menu; keep it open then.
    trigger.addEventListener("click", () => {
      if (!isOpen()) open();
      else if (Date.now() - openedAt > 600) close();
    });
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      close();
      trigger.focus();
    });
    root.addEventListener("focusout", (e) => {
      if (!root.contains(e.relatedTarget) && !root.matches(":hover")) close();
    });
    const onOutsideClick = (e) => !root.contains(e.target) && close();
    document.addEventListener("click", onOutsideClick);

    let frame = 0;
    const update = () => {
      frame = 0;
      const mode = BC.leftMargin();
      root.classList.toggle("pk-toc--rail", mode === "rail");
      root.classList.toggle("pk-toc--edge", mode === "edge");
      root.hidden = mode === "hidden";
      if (root.hidden) return close();

      const i = currentIndex(headings);
      const text = i >= 0 ? BC.headingText(headings[i]) : BC.docTitle();
      if (label.textContent !== text) label.textContent = text;
      trigger.title = `${text} — all headings`;
      items.forEach((item, n) => item.classList.toggle("pk-toc__item--current", n === i));

      // Line up with the top of Basecamp's toolbar, beside the page card.
      const card = BC.card().getBoundingClientRect();
      const toolbar = BC.toolbar() ? BC.toolbar().getBoundingClientRect() : card;
      const viewport = document.documentElement.clientWidth;
      if (mode === "rail") {
        root.style.left = "";
        root.style.right = `${viewport - card.left + GUTTER}px`;
        root.style.maxWidth = `${Math.max(card.left - GUTTER * 2, 0)}px`;
      } else {
        root.style.right = "";
        root.style.left = `${card.left}px`;
        root.style.maxWidth = "";
      }
      // Keep clear of Basecamp's "Home" button when the toolbar sticks to the top.
      let top = Math.max(toolbar.top, 0);
      const home = BC.homeLink();
      if (home) {
        const h = home.getBoundingClientRect();
        if (h.right > root.getBoundingClientRect().left) top = Math.max(top, h.bottom + GUTTER / 2);
      }
      root.style.top = `${top}px`;
    };
    const schedule = () => frame || (frame = requestAnimationFrame(update));

    document.body.appendChild(root);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();

    toc = {
      root,
      schedule,
      teardown() {
        clearTimeout(closeTimer);
        cancelAnimationFrame(frame);
        document.removeEventListener("click", onOutsideClick);
      },
    };
  }

  function unmountToc() {
    if (!toc) return;
    window.removeEventListener("scroll", toc.schedule);
    window.removeEventListener("resize", toc.schedule);
    toc.teardown();
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
