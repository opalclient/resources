#!/usr/bin/env node
/**
 * Generic tree translator — the reusable core the Rosetta service will wrap.
 * Translates an English MDX tree and/or a JSON dictionary into target
 * locales, with all the guard rails from mdx.mjs/protect.mjs.
 *
 *   node translate-tree.mjs --mdx <enDir> --out <localesRoot> --locales tr,it
 *     content: <enDir>/**\/*.mdx → <localesRoot>/<locale>/<relative path>
 *   node translate-tree.mjs --json <en.json> --out <dir> --locales tr,it
 *     dictionary: <dir>/<locale>.json (string values translated, structure kept)
 *
 * Resumable: existing outputs are skipped unless --force. Progress appends to
 * progress.log next to this script.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { translateMdx, translateString } from './mdx.mjs';

const args = process.argv.slice(2);
const arg = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const mdxRoot = arg('--mdx');
const jsonFile = arg('--json');
const outRoot = arg('--out');
const locales = (arg('--locales') ?? '').split(',').filter(Boolean);
const force = args.includes('--force');

if ((!mdxRoot && !jsonFile) || !outRoot || locales.length === 0) {
  console.error('usage: translate-tree.mjs (--mdx <enDir> | --json <en.json>) --out <dir> --locales a,b');
  process.exit(1);
}

const LOG = join(import.meta.dirname, 'progress.log');
const log = (entry) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  appendFileSync(LOG, line + '\n');
  console.log(line);
};

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

async function walkJson(node, target) {
  if (typeof node === 'string') return node.trim() ? translateString(node, target) : node;
  if (Array.isArray(node)) {
    const out = [];
    for (const item of node) out.push(await walkJson(item, target));
    return out;
  }
  if (isObj(node)) {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = await walkJson(v, target);
    return out;
  }
  return node;
}

const mdxFiles = (dir) =>
  readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return mdxFiles(p);
    return p.endsWith('.mdx') ? [p] : [];
  });

let ok = 0;
let skipped = 0;
let failed = 0;

if (jsonFile) {
  const en = JSON.parse(readFileSync(jsonFile, 'utf8'));
  for (const locale of locales) {
    const dst = join(outRoot, `${locale}.json`);
    if (existsSync(dst) && !force) {
      skipped++;
      continue;
    }
    try {
      const translated = await walkJson(en, locale);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, JSON.stringify(translated, null, 2) + '\n');
      ok++;
      log({ file: `${locale}.json`, status: 'ok' });
    } catch (e) {
      failed++;
      log({ file: `${locale}.json`, status: 'fail', error: e.message });
    }
  }
}

if (mdxRoot) {
  const files = mdxFiles(mdxRoot);
  for (const locale of locales) {
    for (const src of files) {
      const rel = relative(mdxRoot, src);
      const dst = join(outRoot, locale, rel);
      if (existsSync(dst) && !force) {
        skipped++;
        continue;
      }
      try {
        const translated = await translateMdx(readFileSync(src, 'utf8'), locale);
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, translated);
        ok++;
        log({ file: `${locale}/${rel}`, status: 'ok', done: ok });
      } catch (e) {
        failed++;
        log({ file: `${locale}/${rel}`, status: 'fail', error: e.message });
      }
    }
  }
}

log({ summary: true, ok, skipped, failed });
process.exit(failed > 0 ? 1 : 0);
