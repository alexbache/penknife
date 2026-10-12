const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { htmlToMarkdown } = require("../src/lib/html-to-markdown.js");

const BASE = "https://3.basecamp.com/123/buckets/456/documents/789";

function md(html, options = {}) {
  const { document } = new JSDOM(`<div id="root">${html}</div>`).window;
  return htmlToMarkdown(document.getElementById("root"), { baseUrl: BASE, ...options });
}

test("Trix paragraphs split on double <br>", () => {
  assert.equal(md("<div>First line<br>second line<br><br>New para</div>"), "First line\nsecond line\n\nNew para\n");
});

test("inline formatting", () => {
  assert.equal(
    md("<div><strong>bold</strong> <em>it</em> <del>gone</del> <code>x`y</code></div>"),
    "**bold** *it* ~~gone~~ ``x`y``\n",
  );
});

test("emphasis keeps spaces outside the markers", () => {
  assert.equal(md("<div>a<strong> b </strong>c</div>"), "a **b** c\n");
});

test("headings shift by the offset", () => {
  assert.equal(md("<h1>Title</h1><div>Body</div>", { headingOffset: 1 }), "## Title\n\nBody\n");
});

test("links become absolute; bare URLs use autolinks", () => {
  assert.equal(
    md(`<div><a href="/123/projects/1">Project</a> and <a href="https://x.com/a">https://x.com/a</a></div>`),
    "[Project](https://3.basecamp.com/123/projects/1) and <https://x.com/a>\n",
  );
});

test("nested lists", () => {
  const html = "<ul><li>One<ul><li>One A</li></ul></li><li>Two</li></ul><ol><li>First</li><li>Second</li></ol>";
  assert.equal(md(html), "- One\n  - One A\n- Two\n\n1. First\n2. Second\n");
});

test("blockquote and pre", () => {
  assert.equal(
    md("<blockquote>Quoted<br><br>Again</blockquote><pre>const a = 1;\n  b();</pre>"),
    "> Quoted\n>\n> Again\n\n```\nconst a = 1;\n  b();\n```\n",
  );
});

test("image and file attachments", () => {
  const html = `
    <figure class="attachment attachment--preview"><img src="/blobs/pic.png" alt="pic.png"><figcaption>A diagram</figcaption></figure>
    <figure class="attachment attachment--file"><a href="/uploads/1/report.pdf">report.pdf</a><figcaption>report.pdf</figcaption></figure>`;
  assert.equal(
    md(html),
    "![A diagram](https://3.basecamp.com/blobs/pic.png)\n\n[report.pdf](https://3.basecamp.com/uploads/1/report.pdf)\n",
  );
});

test("mentions stay inline as names", () => {
  const html = `<div>Hi <bc-attachment content-type="application/vnd.basecamp.mention"><figure><img src="/a.png">Jane Smith</figure></bc-attachment>, thanks</div>`;
  assert.equal(md(html), "Hi Jane Smith, thanks\n");
});

test("escapes Markdown characters in plain text", () => {
  assert.equal(md("<div># not a heading<br>1. not a list<br>a*b_c</div>"), "\\# not a heading\n1\\. not a list\na\\*b\\_c\n");
});

test("tables", () => {
  assert.equal(
    md("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>x|y</td></tr></table>"),
    "| A | B |\n| --- | --- |\n| 1 | x\\|y |\n",
  );
});

// Markup copied from a real Basecamp doc page (October 2026).
const IGNORE = ".heading__link, .attachment__buttons, .hidden\\@print";

test("Basecamp: heading permalinks are dropped", () => {
  const html = `<h2 id="x" dir="auto">The customer<a href="#x" class="heading__link" aria-label="Link">#</a>\n</h2><p dir="auto">Body</p>`;
  assert.equal(md(html, { ignore: IGNORE }), "## The customer\n\nBody\n");
});

test("Basecamp: tables wrapped in a figure", () => {
  const html = `<figure class="lexxy-content__table-wrapper" dir="auto"><table><tbody>
    <tr><th><p><br></p></th><th><p>Now</p></th></tr>
    <tr><td><p><strong>Lead idea</strong></p></td><td><p>Product first</p></td></tr>
  </tbody></table></figure>`;
  assert.equal(md(html, { ignore: IGNORE }), "|  | Now |\n| --- | --- |\n| **Lead idea** | Product first |\n");
});

test("Basecamp: image attachment uses the preview URL and file name", () => {
  const html = `<bc-attachment content-type="image/jpeg" url="https://preview.app.basecamp.com/1/blobs/a/previews/full"
      href="https://storage.app.basecamp.com/1/blobs/a/download/photo.jpeg" filename="photo.jpeg" caption="">
    <figure class="attachment attachment--image" data-caption="photo.jpeg">
      <a class="attachment__link" href="https://storage.app.basecamp.com/1/blobs/a/download/photo.jpeg"><img alt="Zoom photo.jpeg" srcset="x 1x"></a>
      <figcaption><span class="attachment__name">photo.jpeg</span><span class="attachment__attribute hidden@print"><a href="#">Download</a></span></figcaption>
    </figure></bc-attachment>`;
  assert.equal(md(html, { ignore: IGNORE }), "![photo.jpeg](https://preview.app.basecamp.com/1/blobs/a/previews/full)\n");
});

test("Basecamp: lists with whitespace around inline tags", () => {
  const html = `<ol dir="auto">\n<li value="1">\n<strong>Appearance.</strong> The form.</li>\n<li value="2">\n<strong>Quality.</strong> Well made.</li>\n</ol>`;
  assert.equal(md(html, { ignore: IGNORE }), "1. **Appearance.** The form.\n2. **Quality.** Well made.\n");
});

test("ordered lists honour li value", () => {
  assert.equal(md(`<ol><li value="4">Four</li><li>Five</li></ol>`), "4. Four\n5. Five\n");
});
