#!/usr/bin/env node
/**
 * Create compliance/<category>/<locale>.json for locales that are missing it,
 * translating every string value from the en document. Structure (keys,
 * arrays, non-strings) is copied verbatim, so the parity gate stays green.
 *
 *   node scripts/translate/translate-compliance.mjs --locales tr,it [--force]
 *
 * Legal text: machine translation is a starting point — flag for human/legal
 * review before relying on it in a dispute.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { translateString } from './mdx.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const locales = args.includes('--locales') ? args[args.indexOf('--locales') + 1].split(',') : [];
const force = args.includes('--force');

if (locales.length === 0) {
  console.error('usage: translate-compliance.mjs --locales tr,it [--force]');
  process.exit(1);
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

async function walk(node, target) {
  if (typeof node === 'string') {
    if (!node.trim()) return node;
    return translateString(node, target);
  }
  if (Array.isArray(node)) {
    const out = [];
    for (const item of node) out.push(await walk(item, target));
    return out;
  }
  if (isObj(node)) {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = await walk(v, target);
    return out;
  }
  return node;
}

for (const category of readdirSync(join(ROOT, 'compliance'))) {
  const dir = join(ROOT, 'compliance', category);
  if (!statSync(dir).isDirectory()) continue;
  const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8'));
  for (const locale of locales) {
    const outPath = join(dir, `${locale}.json`);
    if (existsSync(outPath) && !force) {
      console.log(`skip ${category}/${locale}.json (exists)`);
      continue;
    }
    console.log(`translating ${category}/${locale}.json …`);
    const translated = await walk(en, locale);
    writeFileSync(outPath, JSON.stringify(translated, null, 2) + '\n');
  }
}
console.log('DONE');
