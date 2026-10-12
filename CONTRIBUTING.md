# Contributing to Penknife

Thanks for helping. Penknife is a set of small tools, so small pull
requests are best.

## Guidelines

- Keep it dependency-free at runtime and without a build step.
- Keep Basecamp-specific URLs and selectors in `src/basecamp.js`.
- Make UI feel like Basecamp: reuse its classes (`btn`, `action-sheet`), its
  icon sprite (`Penknife.icon()`) and its CSS variables. No floating widgets
  in our own style.
- Prefix every CSS class you add with `pk-` so Penknife never styles Basecamp itself.
- Single-key shortcuts must not fire while someone types. `core.js` handles
  this for you if you register shortcuts through `Penknife.register`.
- Do not add new extension permissions unless a tool truly needs them, and
  say why in the pull request.
- Add a test when you change `src/lib/` code: `npm test`.

## Reporting a broken tool

Basecamp changes its pages from time to time. If a tool stops working,
open an issue with the page type (doc, folder, message, and so on) and, if
you can, the HTML around the part that broke. Remove anything private first.
