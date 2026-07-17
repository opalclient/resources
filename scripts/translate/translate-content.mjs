#!/usr/bin/env node
/**
 * Translate SEO content (content/en/**) into target locales.
 *
 *   node scripts/translate/translate-content.mjs \
 *     --locales de,ru,pl,tr,it,ja,zh [--sections compare,blog,learn] [--force]
 *
 * Resumable: existing target files are skipped unless --force, so the runner
 * can be killed and relaunched at any point. Progress is appended to
 * scripts/translate/progress.log (one JSON line per file) for monitoring.
 *
 * Each page: frontmatter fields (title/description/excerpt/faqs/label) and
 * body translated via LTEngine with masking + structural verification
 * (mdx.mjs); files failing verification are logged and left untranslated.
 * Section _index.json files get title/description/excerpt per entry.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { translateMdx, translateString } from './mdx.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const LOG = join(import.meta.dirname, 'progress.log');
const args = process.argv.slice(2);
const arg = (name, def) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const locales = arg('--locales', '').split(',').filter(Boolean);
const sections = arg('--sections', 'compare,blog,learn').split(',');
const force = args.includes('--force');

if (locales.length === 0) {
  console.error('usage: translate-content.mjs --locales de,ru [--sections compare,blog,learn] [--force]');
  process.exit(1);
}

const log = (entry) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  appendFileSync(LOG, line + '\n');
  console.log(line);
};

const INDEX_FIELDS = new Set(['title', 'description', 'excerpt']);

let ok = 0;
let skipped = 0;
let failed = 0;

for (const section of sections) {
  const srcDir = join(ROOT, 'content', 'en', section);
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.mdx'));
  for (const locale of locales) {
    // _index.json first so listings localize as soon as a section lands.
    const indexSrc = join(srcDir, '_index.json');
    const indexDst = join(ROOT, 'content', locale, section, '_index.json');
    if (existsSync(indexSrc) && (force || !existsSync(indexDst))) {
      try {
        const entries = JSON.parse(readFileSync(indexSrc, 'utf8'));
        const out = [];
        for (const entry of entries) {
          const copy = { ...entry };
          for (const field of INDEX_FIELDS) {
            if (typeof copy[field] === 'string') copy[field] = await translateString(copy[field], locale);
          }
          out.push(copy);
        }
        mkdirSync(dirname(indexDst), { recursive: true });
        writeFileSync(indexDst, JSON.stringify(out, null, 2) + '\n');
        log({ file: `${locale}/${section}/_index.json`, status: 'ok' });
      } catch (e) {
        log({ file: `${locale}/${section}/_index.json`, status: 'fail', error: e.message });
        failed++;
      }
    }

    for (const file of files) {
      const dst = join(ROOT, 'content', locale, section, file);
      if (existsSync(dst) && !force) {
        skipped++;
        continue;
      }
      try {
        const raw = readFileSync(join(srcDir, file), 'utf8');
        const translated = await translateMdx(raw, locale);
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, translated);
        ok++;
        log({ file: `${locale}/${section}/${file}`, status: 'ok', done: ok });
      } catch (e) {
        failed++;
        log({ file: `${locale}/${section}/${file}`, status: 'fail', error: e.message });
      }
    }
  }
}

log({ summary: true, ok, skipped, failed });
process.exit(failed > 0 ? 1 : 0);
