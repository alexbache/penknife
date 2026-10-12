// Converts rendered Basecamp rich text (Trix output) into Markdown.
// Works in the browser and in Node (tests pass in a jsdom element).
(function (root) {
  "use strict";

  const ELEMENT = 1;
  const TEXT = 3;

  const BLOCK_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DETAILS", "DIV", "DL", "DD", "DT",
    "FIELDSET", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3", "H4", "H5", "H6",
    "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "UL",
  ]);
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "BUTTON", "NOSCRIPT", "svg", "SVG"]);
  const MENTION_TYPE = "application/vnd.basecamp.mention";

  function htmlToMarkdown(rootEl, options = {}) {
    const ctx = {
      baseUrl: options.baseUrl || (typeof location !== "undefined" ? location.href : undefined),
      headingOffset: options.headingOffset || 0,
      ignore: options.ignore || null, // CSS selector for elements to drop
    };
    const md = blocksOf(rootEl, ctx).join("\n\n");
    return md.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  // ---- blocks -------------------------------------------------------------

  function isBlock(node) {
    if (node.nodeType !== ELEMENT) return false;
    if (node.tagName === "BC-ATTACHMENT") return !isMention(node);
    return BLOCK_TAGS.has(node.tagName);
  }

  // Walks children, grouping runs of inline content into paragraphs.
  function blocksOf(node, ctx) {
    const out = [];
    let buf = "";
    const flush = () => {
      for (const para of buf.split(/\n[ \t]*\n/)) {
        const text = tidyParagraph(para);
        if (text) out.push(text);
      }
      buf = "";
    };
    for (const child of node.childNodes) {
      if (ctx.ignore && child.nodeType === ELEMENT && child.matches(ctx.ignore)) continue;
      if (isBlock(child)) {
        flush();
        out.push(...blockOf(child, ctx));
      } else {
        buf += inlineOf(child, ctx);
      }
    }
    flush();
    return out;
  }

  function blockOf(el, ctx) {
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const level = Math.min(6, Number(tag[1]) + ctx.headingOffset);
      const text = inlineOf(el, ctx).replace(/\s+/g, " ").trim();
      return text ? ["#".repeat(level) + " " + text] : [];
    }
    switch (tag) {
      case "UL":
      case "OL":
        return [listOf(el, ctx)].filter(Boolean);
      case "PRE": {
        const code = el.textContent.replace(/\n+$/, "");
        const fence = code.includes("```") ? "~~~" : "```";
        return [fence + "\n" + code + "\n" + fence];
      }
      case "BLOCKQUOTE": {
        const inner = blocksOf(el, ctx).join("\n\n");
        return inner ? [inner.split("\n").map((l) => (l ? "> " + l : ">")).join("\n")] : [];
      }
      case "HR":
        return ["---"];
      case "FIGURE":
        // Basecamp wraps tables in <figure class="lexxy-content__table-wrapper">.
        return el.querySelector("table") ? blocksOf(el, ctx) : [attachmentOf(el, ctx)].filter(Boolean);
      case "BC-ATTACHMENT":
        return [attachmentOf(el, ctx)].filter(Boolean);
      case "TABLE":
        return [tableOf(el, ctx)].filter(Boolean);
      default:
        return blocksOf(el, ctx);
    }
  }

  function listOf(listEl, ctx) {
    const ordered = listEl.tagName === "OL";
    let n = Number(listEl.getAttribute("start")) || 1;
    const lines = [];
    for (const li of listEl.children) {
      if (li.tagName !== "LI") continue;
      // Basecamp sets <li value="…">, and sometimes splits one list into several <ol>s.
      if (ordered && li.hasAttribute("value")) n = Number(li.getAttribute("value")) || n;
      const marker = ordered ? `${n++}. ` : "- ";
      const pad = " ".repeat(marker.length);
      const body = blocksOf(li, ctx).join("\n");
      const [first = "", ...rest] = body.split("\n");
      lines.push(marker + first, ...rest.map((l) => (l ? pad + l : l)));
    }
    return lines.join("\n");
  }

  function tableOf(table, ctx) {
    const rows = [...table.querySelectorAll("tr")].map((tr) =>
      [...tr.children].map((cell) =>
        inlineOf(cell, ctx).replace(/\s+/g, " ").trim().replace(/\|/g, "\\|"),
      ),
    );
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (r) => "| " + Array.from({ length: width }, (_, i) => r[i] || "").join(" | ") + " |";
    return [line(rows[0]), line(Array(width).fill("---")), ...rows.slice(1).map(line)].join("\n");
  }

  // Basecamp renders files and images as <bc-attachment url="…" href="…"
  // filename="…" content-type="…"> around a <figure class="attachment"
  // data-preview-url="…" data-download-url="…">. Images become ![]() (with
  // the preview URL) and other files become links.
  function attachmentOf(el, ctx) {
    const attr = (name) => el.getAttribute(name) || el.getAttribute("data-" + name) || "";
    const img = el.tagName === "IMG" ? el : el.querySelector("img");
    const link = el.querySelector("a[href]");
    const caption =
      attr("caption") ||
      attr("filename") ||
      text(el.querySelector("figcaption")) ||
      (el.tagName === "IMG" && img.getAttribute("alt")) ||
      "";
    const contentType = attr("content-type");
    const isImage = contentType ? contentType.startsWith("image/") : Boolean(img);
    if (isImage) {
      const src = attr("url") || attr("preview-url") || (img && img.getAttribute("src"));
      if (src) return `![${escapeText(caption)}](${url(src, ctx)})`;
    }
    const href = attr("href") || attr("download-url") || (link && link.getAttribute("href")) || attr("url");
    if (href) return `[${escapeText(caption || "Attachment")}](${url(href, ctx)})`;
    return blocksOf(el, ctx).join("\n\n");
  }

  // ---- inline -------------------------------------------------------------

  function inlineOf(node, ctx) {
    if (node.nodeType === TEXT) {
      return escapeText(node.nodeValue.replace(/[ \t\r\n\f]+/g, " "));
    }
    if (node.nodeType !== ELEMENT || SKIP_TAGS.has(node.tagName)) return "";
    if (ctx.ignore && node.matches(ctx.ignore)) return "";

    const inner = () => [...node.childNodes].map((c) => inlineOf(c, ctx)).join("");
    switch (node.tagName) {
      case "BR":
        return "\n";
      case "STRONG":
      case "B":
        return wrap(inner(), "**");
      case "EM":
      case "I":
        return wrap(inner(), "*");
      case "DEL":
      case "S":
      case "STRIKE":
        return wrap(inner(), "~~");
      case "CODE":
        return code(node.textContent);
      case "IMG":
        return attachmentOf(node, ctx);
      case "A": {
        const label = inner().trim();
        const href = node.getAttribute("href");
        if (!href || href.startsWith("javascript:")) return label;
        const target = url(href, ctx);
        if (!label) return "";
        if (label === target || label === escapeText(target)) return `<${target}>`;
        return `[${label}](${target})`;
      }
      case "BC-ATTACHMENT":
        // Only mentions reach here (other attachments are blocks).
        return escapeText(text(node));
      default:
        if (isBlock(node)) return blocksOf(node, ctx).join("\n\n");
        return inner();
    }
  }

  // Keep emphasis markers tight against the text: "** bold **" is not bold.
  function wrap(s, marker) {
    const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (!m[2]) return s;
    return m[1] + marker + m[2] + marker + m[3];
  }

  function code(s) {
    const ticks = (s.match(/`+/g) || []).reduce((a, t) => Math.max(a, t.length), 0);
    const fence = "`".repeat(ticks + 1);
    const pad = s.startsWith("`") || s.endsWith("`") ? " " : "";
    return fence + pad + s + pad + fence;
  }

  // ---- helpers ------------------------------------------------------------

  function isMention(el) {
    return (el.getAttribute("content-type") || "") === MENTION_TYPE;
  }

  function text(el) {
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  }

  function escapeText(s) {
    return s.replace(/([\\`*_[\]])/g, "\\$1");
  }

  // Escape characters that would turn a plain line into a heading, list or quote.
  function tidyParagraph(s) {
    return s
      .split("\n")
      .map((line) =>
        line
          .trim()
          .replace(/ {2,}/g, " ")
          .replace(/^(#{1,6}\s|>|[-+]\s)/, "\\$1")
          .replace(/^(\d+)\.(\s)/, "$1\\.$2"),
      )
      .join("\n")
      .trim();
  }

  function url(href, ctx) {
    let out = href;
    try {
      out = ctx.baseUrl ? new URL(href, ctx.baseUrl).href : href;
    } catch (_) {
      /* keep as-is */
    }
    return out.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
  }

  const api = { htmlToMarkdown };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PenknifeMarkdown = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
