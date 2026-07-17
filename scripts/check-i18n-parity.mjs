#!/usr/bin/env node
/**
 * i18n parity gate. English is the source of truth; every sibling locale file
 * must carry exactly the same keys (and matching format tokens) as its `en`
 * counterpart. Checked surfaces:
 *
 *   web/<locale>.json          vs web/en.json
 *   lang/<...>/<locale>.lang    vs en.lang in the same directory
 *   compliance/<cat>/<loc>.json vs compliance/<cat>/en.json
 *
 * Exits 1 with a per-file report when any locale is missing keys, carries
 * extra keys, or disagrees on placeholders. `web/_pending-translations.json`
 * is a manifest, not a locale file, and is ignored.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const errors = [];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

function flatten(value, prefix = '', out = new Map()) {
  if (isObj(value)) {
    for (const [k, v] of Object.entries(value)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (Array.isArray(value)) {
    out.set(prefix, value);
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
  } else {
    out.set(prefix, value);
  }
  return out;
}

const tokens = (s) =>
  typeof s === 'string'
    ? [...s.matchAll(/\{\w+\}|%[sd]/g)].map((m) => m[0]).sort().join(',')
    : '';

function compare(enMap, locMap, label) {
  for (const key of enMap.keys()) {
    if (!locMap.has(key)) errors.push(`${label}: missing key "${key}"`);
  }
  for (const key of locMap.keys()) {
    if (!enMap.has(key)) errors.push(`${label}: extra key "${key}" (not in en)`);
  }
  for (const [key, enVal] of enMap) {
    if (!locMap.has(key)) continue;
    const locVal = locMap.get(key);
    if (Array.isArray(enVal) && Array.isArray(locVal) && enVal.length !== locVal.length) {
      errors.push(`${label}: array "${key}" has ${locVal.length} items (en has ${enVal.length})`);
    }
    const enTok = tokens(enVal);
    if (enTok && enTok !== tokens(locVal)) {
      errors.push(`${label}: format tokens differ for "${key}" (en: ${enTok || 'none'}, got: ${tokens(locVal) || 'none'})`);
    }
  }
}

function compareJsonDir(dir) {
  const enPath = join(dir, 'en.json');
  const enMap = flatten(JSON.parse(readFileSync(enPath, 'utf8')));
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'en.json' || file.startsWith('_') || file === 'manifest.json') continue;
    const label = relative(ROOT, join(dir, file)).replaceAll('\\', '/');
    try {
      compare(enMap, flatten(JSON.parse(readFileSync(join(dir, file), 'utf8'))), label);
    } catch (e) {
      errors.push(`${label}: unreadable (${e.message})`);
    }
  }
}

function parseLang(path) {
  const map = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    map.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1));
  }
  return map;
}

function walkLangDirs(dir) {
  const entries = readdirSync(dir);
  if (entries.includes('en.lang')) {
    const enMap = parseLang(join(dir, 'en.lang'));
    for (const file of entries) {
      if (!file.endsWith('.lang') || file === 'en.lang') continue;
      compare(enMap, parseLang(join(dir, file)), relative(ROOT, join(dir, file)).replaceAll('\\', '/'));
    }
  }
  for (const entry of entries) {
    const child = join(dir, entry);
    if (statSync(child).isDirectory()) walkLangDirs(child);
  }
}

compareJsonDir(join(ROOT, 'web'));
walkLangDirs(join(ROOT, 'lang'));
for (const category of readdirSync(join(ROOT, 'compliance'))) {
  const dir = join(ROOT, 'compliance', category);
  if (statSync(dir).isDirectory()) compareJsonDir(dir);
}

if (errors.length > 0) {
  console.error(`i18n parity check failed with ${errors.length} error(s):\n`);
  for (const error of errors) console.error(`  ${error}`);
  process.exit(1);
}
console.log('i18n parity check passed.');
