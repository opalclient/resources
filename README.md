# i18n

Translations and localized content for Opal, served as a public repository.

## Layout

- `lang/{locale}.lang` — client UI translations (properties-style `key=value`;
  `module.<id>.name`, `module.<id>.<prop>.name`, `module.<id>.description`, …).
  Localized: `en`, `de`, `ru`, `zh`.
- `theme/{name}.lang` — locale-independent module/property display-name overrides.
  `default` is empty (names come from `lang/`); alternate themes rebrand names.
- `manifest.json` — declares available locales, themes, and content sections.
- `web/{locale}.json` — marketing-site UI strings.
- `content/{locale}/{blog,learn,compare}/*.mdx` + `_index.json` — marketing content.
- `compliance/{privacy,terms}/{locale}.json` — legal pages.

## Format

`.lang` files are UTF-8, one `key=value` per line; `#` starts a comment; the key
is split on the first `=`; surrounding whitespace is trimmed. Resolution for a
display-name key is `theme → language → key`; other keys resolve `language → key`.
