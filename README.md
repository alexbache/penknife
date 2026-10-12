<img src="assets/icon.svg" width="64" height="64" alt="">

# Penknife

Small, sharp tools for Basecamp, packed into one Chrome extension.

Penknife is not affiliated with Basecamp or 37signals.

## Tools

Penknife adds its controls with Basecamp's own buttons, menus, icons and
colours, so they look like part of Basecamp.

### Doc headings

When you scroll down a doc, a button with the current heading stays at the
top left. Hover it to see every heading in the doc, and click one to go
there. The button updates as you scroll.

| Key | Action |
| --- | --- |
| `j` / `k` | Go to the next / previous heading |
| `]` / `[` | Go to the next / previous doc in the same folder |

Shortcuts do nothing while you type in a field or edit a doc.

### Doc export

An export button sits left of **Bookmark** on every doc. Click it, then pick:

- **Download as PDF** opens the print dialog with a clean copy of the doc.
  Choose **Save as PDF**.
- **Download as Markdown** saves the doc as a `.md` file.

## Install

Penknife is not in the Chrome Web Store yet. To install it from source:

1. Clone this repo.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the repo folder.

Penknife runs only on `*.basecamp.com`. It asks for no extra permissions,
sends nothing anywhere, and reads only the page you are on (plus the doc's
folder page, to find the next and previous docs).

## Development

There is no build step. The extension is plain JavaScript and CSS:

```
manifest.json
src/
  core.js               tool registry, shortcuts, toasts, Basecamp icon helper
  basecamp.js           every Basecamp URL pattern and CSS selector
  main.js               starts Penknife
  penknife.css          all Penknife UI styles (classes start with pk-)
  lib/html-to-markdown.js
  tools/
    doc-nav.js
    doc-export.js
test/                   Node tests (jsdom) for the Markdown converter
```

After a change, click the reload icon for Penknife on `chrome://extensions`,
then reload the Basecamp tab.

```sh
npm install
npm test        # run the tests
npm run zip     # build penknife.zip for the Chrome Web Store
```

### Adding a tool

Make a file in `src/tools/`, add it to `content_scripts.js` in
`manifest.json` (before `src/main.js`), and register it:

```js
window.Penknife.register({
  id: "my-tool",
  matches: () => window.PenknifeBasecamp.isDocPage(),
  mount() { /* add your UI; return a function that removes it */ },
  alive: () => true, // return false if Basecamp re-rendered and removed your UI
  shortcuts: [{ key: "d", description: "Do it", run: doIt }],
});
```

Build UI from Basecamp's own markup where you can (`btn`, `action-sheet`,
`window.Penknife.icon("download")` for its icon sprite) and its CSS variables
(`--color-ink`, `--radius-lg`, …), so tools look native. If Basecamp changes
its markup, the fix almost always belongs in `src/basecamp.js`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for more.

## License

[MIT](LICENSE)
