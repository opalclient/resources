# resources

Translations, documentation, and localized content for [Opal](https://opal.wtf), served straight from this repo as a public, versioned data source. The client, the docs site, and the marketing site all read from here instead of shipping their own copies, so a translation or a doc page only needs to change in one place.

## Layout

- `lang/{product}/{stream}/{version}/{locale}.lang` — versioned client UI
  translations (properties-style `key=value`; `module.<id>.name`,
  `module.<id>.<prop>.name`, `module.<id>.description`, …). Served per released
  build (`{stream}` ∈ `stable|canary|nightly`; `{version}` e.g.
  `2.1.0`). Current: `lang/opal/stable/2.1.0/{locale}.lang`,
  locales `en`, `de`, `ru`, `zh`, plus a per-version `manifest.json`.
- `theme/{name}.lang` — locale-independent module/property display-name overrides.
  `default` is empty (names come from `lang/`); alternate themes rebrand names.
- `manifest.json` — declares locales, themes, and content sections for the
  `lang/` client UI translations (currently `en`, `de`, `ru`, `zh`). This
  `locales` list is client-scoped only; `web/` and `compliance/` ship their
  own, broader locale sets (see below) and are not tracked in `manifest.json`.
- `web/{locale}.json` — marketing-site UI strings. 9 locales: `de`, `en`,
  `fr`, `it`, `ja`, `pl`, `pt`, `ru`, `zh`.
- `content/{locale}/{blog,learn,compare}/*.mdx` + `_index.json` — marketing content.
- `docs/{locale}/**/*.mdx` + `_index.json` — client documentation (setup,
  scripting guide and API reference). `_index.json` is a nav tree of
  `{slug, title, children}` rather than a flat post list. Current:
  `docs/en/` only.
- `compliance/{privacy,terms}/{locale}.json` — legal pages. `terms` covers 9
  locales, `privacy` 8 (no `zh`).

## Format

`.lang` files are UTF-8, one `key=value` per line; `#` starts a comment; the key
is split on the first `=`; surrounding whitespace is trimmed. Resolution for a
display-name key is `theme → language → key`; other keys resolve `language → key`.

## Related repos

The Opal scripting docs under `docs/en/scripting/` describe the API these projects build on:

- [opal-scripts](https://github.com/opalclient/opal-scripts) — example and demo scripts
- [opal-scripting-ide](https://github.com/opalclient/opal-scripting-ide) — VS Code and JetBrains extensions
- [opal-script-skills](https://github.com/opalclient/opal-script-skills) — an AI assistant skill package
