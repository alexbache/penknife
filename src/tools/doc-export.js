// Doc export: save the current doc as PDF (through the print dialog) or as
// a Markdown file.
(function () {
  "use strict";

  const BC = window.PenknifeBasecamp;
  const { htmlToMarkdown } = window.PenknifeMarkdown;

  const PRINT_CSS = `
    @page { margin: 18mm 16mm; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font: 11pt/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1d1d1f; margin: 0;
    }
    .pk-doc-title { font-size: 22pt; line-height: 1.2; margin: 0 0 4pt; }
    .pk-doc-meta { color: #6e6e73; font-size: 9pt; margin: 0 0 18pt; }
    h1, h2, h3, h4 { line-height: 1.25; margin: 16pt 0 6pt; break-after: avoid; }
    .pk-doc-body h1 { font-size: 15pt; }
    p, ul, ol, blockquote, pre, figure, table { margin: 0 0 8pt; }
    a { color: inherit; }
    img { max-width: 100%; height: auto; break-inside: avoid; }
    figure { margin: 8pt 0; }
    figcaption { color: #6e6e73; font-size: 9pt; }
    blockquote { border-left: 3pt solid #d2d2d7; margin-left: 0; padding-left: 10pt; color: #424245; }
    pre { background: #f5f5f7; padding: 8pt 10pt; border-radius: 4pt; white-space: pre-wrap; font-size: 9.5pt; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #d2d2d7; padding: 4pt 6pt; }
  `;

  function requireContent() {
    const content = BC.docContent();
    if (!content) window.Penknife.toast("Could not find the doc content on this page");
    return content;
  }

  function filename(title, ext) {
    const base = title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s.-]/g, "")
      .trim()
      .replace(/[\s-]+/g, "-")
      .toLowerCase();
    return `${base || "basecamp-doc"}.${ext}`;
  }

  // ---- Markdown -----------------------------------------------------------

  // Doc headings start at <h2> (the title is the only <h1>), so no offset.
  const mdOptions = () => ({ baseUrl: location.href, ignore: BC.CHROME_SELECTORS });

  function exportMarkdown() {
    const content = requireContent();
    if (!content) return;
    const title = BC.docTitle();
    const body = htmlToMarkdown(content, mdOptions());
    const md = `# ${title}\n\n${body}`;

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename(title, "md");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  // ---- PDF ----------------------------------------------------------------

  // Clone the doc body with absolute URLs and without page chrome.
  function printableClone(content) {
    const clone = content.cloneNode(true);
    clone
      .querySelectorAll(`script, button, template, [contenteditable], ${BC.CHROME_SELECTORS}`)
      .forEach((el) => el.remove());
    clone.querySelectorAll("[href]").forEach((el) => el.setAttribute("href", el.href));
    // Pin each image to the source the page already loaded, so the frame can
    // reuse it from cache (lazy loading never fires in a hidden frame).
    const originals = content.querySelectorAll("img");
    clone.querySelectorAll("img").forEach((img, i) => {
      const src = originals[i] && (originals[i].currentSrc || originals[i].src);
      if (src) img.setAttribute("src", src);
      img.removeAttribute("srcset");
      img.removeAttribute("loading");
    });
    return clone;
  }

  function waitForImages(doc, timeout = 8000) {
    const pending = [...doc.images].filter((img) => !img.complete);
    const all = Promise.all(
      pending.map((img) => new Promise((resolve) => {
        img.addEventListener("load", resolve, { once: true });
        img.addEventListener("error", resolve, { once: true });
      })),
    );
    return Promise.race([all, new Promise((r) => setTimeout(r, timeout))]);
  }

  // Prints from a hidden iframe so only the doc is on the page. The top-level
  // title is swapped while printing because Chrome uses it as the PDF filename.
  async function exportPdf() {
    const content = requireContent();
    if (!content) return;
    const title = BC.docTitle();

    const frame = document.createElement("iframe");
    frame.className = "pk-print-frame";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);

    const win = frame.contentWindow;
    const doc = frame.contentDocument;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset='utf-8'></head><body></body></html>");
    doc.close();
    doc.title = title;

    // A constructed stylesheet is not blocked by Basecamp's CSP the way a <style> tag can be.
    const sheet = new win.CSSStyleSheet();
    sheet.replaceSync(PRINT_CSS);
    doc.adoptedStyleSheets = [sheet];

    const h1 = doc.createElement("h1");
    h1.className = "pk-doc-title";
    h1.textContent = title;
    const meta = doc.createElement("p");
    meta.className = "pk-doc-meta";
    meta.textContent = `${location.href.split("#")[0]} · exported ${new Date().toLocaleDateString()}`;
    const body = doc.importNode(printableClone(content), true);
    body.classList.add("pk-doc-body");
    doc.body.append(h1, meta, body);

    await waitForImages(doc);

    const originalTitle = document.title;
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      document.title = originalTitle;
      setTimeout(() => frame.remove(), 500);
    };
    win.addEventListener("afterprint", cleanup, { once: true });
    document.title = title;
    win.focus();
    win.print();
    // print() blocks in Chrome, but do not rely on it.
    setTimeout(cleanup, 60_000);
  }

  // ---- toolbar button ---------------------------------------------------------

  // Uses Basecamp's own action-sheet markup. Basecamp's scripts handle the
  // data-behavior attributes (open on click, close on click outside), so the
  // menu behaves like the "…" menu next to it.
  let menu = null;

  function mountMenu() {
    const slot = BC.toolbarSlot();
    if (!slot) return;
    menu = window.Penknife.html(`
      <span class="action-sheet pk-export" data-behavior="expandable collapse_on_click">
        <button type="button" class="action-sheet__expansion-toggle perma-toolbar__btn btn btn--icon btn--sm btn--ghost"
            title="Export…" aria-label="Export" data-behavior="toggle_expansion_on_click">
          ${window.Penknife.icon("download") || "Export"}
        </button>
        <div class="action-sheet__content" data-behavior="collapse_on_clickoutside">
          <button type="button" class="action-sheet__action" data-pk-export="pdf">Download as PDF</button>
          <button type="button" class="action-sheet__action" data-pk-export="md">Download as Markdown</button>
        </div>
      </span>`);
    const pick = (run) => () => {
      menu.classList.remove("expanded");
      run();
    };
    menu.querySelector("[data-pk-export='pdf']").addEventListener("click", pick(exportPdf));
    menu.querySelector("[data-pk-export='md']").addEventListener("click", pick(exportMarkdown));
    slot.parent.insertBefore(menu, slot.before);
  }

  function unmountMenu() {
    if (menu) menu.remove();
    menu = null;
  }

  window.Penknife.register({
    id: "doc-export",
    matches: () => BC.isDocPage(),
    mount() {
      mountMenu();
      return unmountMenu;
    },
    alive: () => !menu || document.body.contains(menu),
  });
})();
