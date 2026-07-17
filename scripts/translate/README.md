# Translation pipeline

LTEngine-backed machine translation for everything in this repo. English is
the source of truth; these scripts push it into the other locales without
breaking structure, placeholders, prices, or brand names.

## Prerequisites

- A running [LTEngine](https://github.com/LibreTranslate/LTEngine) server
  (LibreTranslate-compatible API). Point `LTENGINE_URL` at it, default
  `http://127.0.0.1:5050`. gemma3-12b or larger recommended.
- `bun install` (or npm) in this directory — the only dependency is `yaml`.

## Scripts

| Script | What it does |
| --- | --- |
| `translate-pending.mjs` | Drains `web/_pending-translations.json`: translates catalog keys still carrying English values (web JSON + .lang), prunes the manifest as keys land. |
| `translate-compliance.mjs --locales tr,it` | Creates missing `compliance/<cat>/<locale>.json` docs from en. Legal text — flag for human review. |
| `translate-content.mjs --locales de,ja --sections compare,blog,learn` | Translates SEO MDX pages + section `_index.json` listings into `content/<locale>/`. Resumable: existing files are skipped unless `--force`. Progress: `progress.log`. |
| `overnight.sh` | The full batch in order: catalogs → parity gate → compliance → compare+blog → learn. Safe to rerun; picks up where it stopped. |
| `smoke.mjs <src> <locale> <out>` | Translate one file for eyeballing. |

## Guard rails (protect.mjs / mdx.mjs)

Machine translation output is never trusted blindly:

- **Masking**: `{placeholders}`, `%s`, and `$prices` are swapped for sentinel
  tokens before MT and restored after.
- **Escalating strategies** when masking fails (CJK models swallow
  sentinels): raw translation verified token-by-token → brands quote-pinned →
  brands split out of the text entirely. A price may localize its formatting
  (`8,99`, `8.99ドル`) but never its amount; placeholders must survive
  verbatim; brand names (Opal, Lunar Client, …, see `BRANDS`) must stay in
  Latin script.
- **MDX structure**: code fences never reach the model; JSX-bearing
  paragraphs are isolated (a big mixed chunk tempts the model to "improve"
  `<KeyTakeaways>` into a heading); tag-only chunks bypass MT with only
  display props (question/title/label/description/sub/q/a, `features`/
  `values` arrays) translated individually. Output must match the source's
  JSX tag multiset, heading count, and fence count or the file fails.
- **Links**: internal `/en/...` links are rewritten to the target locale.

Failures are logged (`progress.log` for content) and leave the file
untranslated — the site falls back to English per-page, so a failed file is
cosmetic, never breaking.

## Adding a locale

1. `web/<locale>.json` + compliance docs here (parity gate enforces key
   equality with en).
2. Enable it in opal.wtf `src/lib/i18n/config.ts` (+ `ogLocaleMap` in
   `src/lib/meta.ts`) — the site reads everything else from this repo at
   runtime.
3. Run `translate-content.mjs` for the new locale.

## CI

`.github/workflows/i18n-parity.yml` gates every push: locale files must
mirror en's keys/tokens exactly. The opal.wtf CI additionally fails if its
bundled dictionary drifts from `web/en.json` — land key changes HERE first.
