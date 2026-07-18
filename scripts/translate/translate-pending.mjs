#!/usr/bin/env node
/**
 * Drain web/_pending-translations.json: machine-translate every listed key
 * (currently carrying its English value) in web/<locale>.json and
 * lang/<dir>/<locale>.lang, then clear the manifest entries that succeeded.
 *
 *   node scripts/translate/translate-pending.mjs [--locales de,fr] [--dry]
 *
 * Requires a running LTEngine (LTENGINE_URL, default 127.0.0.1:5050).
 * Run scripts/check-i18n-parity.mjs afterwards; it must stay green.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { translateString } from './mdx.mjs';

const ROOT = join(import.meta.dirname, '..', '..');
const args = process.argv.slice(2);
const only = args.includes('--locales') ? args[args.indexOf('--locales') + 1].split(',') : null;
const dry = args.includes('--dry');

const manifestPath = join(ROOT, 'web', '_pending-translations.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const getPath = (o, p) => p.split('.').reduce((a, k) => (isObj(a) || Array.isArray(a) ? a[k] : undefined), o);
const setPath = (o, p, v) => {
  const parts = p.split('.');
  const leaf = parts.pop();
  const parent = parts.reduce((a, k) => a[k], o);
  parent[leaf] = v;
};

async function translateValue(value, target) {
  if (typeof value === 'string') return translateString(value, target);
  if (Array.isArray(value)) return Promise.all(value.map((v) => translateValue(v, target)));
  if (isObj(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = await translateValue(v, target);
    return out;
  }
  return value;
}

let done = 0;
let failed = 0;

// --- web catalogs ---
// MT input is ALWAYS the en value: the locale file may hold an en copy (same
// thing) or a bad earlier translation (must not be re-translated from).
const enWeb = JSON.parse(readFileSync(join(ROOT, 'web', 'en.json'), 'utf8'));
for (const [locale, keys] of Object.entries(manifest.web ?? {})) {
  if (only && !only.includes(locale)) continue;
  const file = join(ROOT, 'web', `${locale}.json`);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const remaining = [];
  for (const key of keys) {
    const value = getPath(enWeb, key);
    if (value === undefined) continue; // key vanished; drop from manifest
    try {
      if (!dry) setPath(data, key, await translateValue(value, locale));
      done++;
    } catch (e) {
      console.error(`web/${locale} ${key}: ${e.message}`);
      remaining.push(key);
      failed++;
    }
    if (done % 50 === 0) console.log(`progress: ${done} values translated`);
  }
  if (!dry) {
    writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
    if (remaining.length > 0) manifest.web[locale] = remaining;
    else delete manifest.web[locale];
  }
  console.log(`web/${locale}: ${keys.length - remaining.length}/${keys.length} translated`);
}

// --- lang catalogs ---
const parseLang = (path) => {
  const map = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1));
  }
  return map;
};
for (const [label, keys] of Object.entries(manifest.lang ?? {})) {
  const locale = label.split('/').pop();
  if (only && !only.includes(locale)) continue;
  const file = join(ROOT, 'lang', `${label}.lang`);
  // MT input is the en value from the sibling en.lang, never the locale line.
  const enLang = parseLang(join(ROOT, 'lang', `${label.split('/').slice(0, -1).join('/')}/en.lang`));
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const wanted = new Set(keys);
  const remaining = new Set(keys);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    if (!wanted.has(key)) continue;
    try {
      const text = await translateString(enLang.get(key) ?? t.slice(eq + 1), locale);
      if (!dry) lines[i] = `${key}=${text}`;
      remaining.delete(key);
      done++;
    } catch (e) {
      console.error(`${label} ${key}: ${e.message}`);
      failed++;
    }
    if (done % 50 === 0) console.log(`progress: ${done} values translated`);
  }
  if (!dry) {
    writeFileSync(file, lines.join('\n'));
    if (remaining.size > 0) manifest.lang[label] = [...remaining].sort();
    else delete manifest.lang[label];
  }
  console.log(`${label}: ${keys.length - remaining.size}/${keys.length} translated`);
}

if (!dry) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`DONE: ${done} translated, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
