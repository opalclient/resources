#!/usr/bin/env node
/**
 * Content compile gate: every MDX file under content/ must compile. A file
 * that fails here breaks the opal.wtf `next build` at prerender time, so
 * nothing non-compiling may reach main.
 *
 * Also runs a meta-leak scan over non-English files: machine-translation
 * artifacts ("Italian:", "Here is the translation") stay syntactically valid
 * but ship garbled copy.
 *
 * Requires scripts/translate deps (bun install / npm install there first).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { compile } from './translate/node_modules/@mdx-js/mdx/index.js';

const ROOT = join(import.meta.dirname, '..');
const CONTENT = join(ROOT, 'content');

const META_LEAK_RE =
  /^(?:Source|Translation|Translated text|Here (?:is|'s) the translation|English|German|Italian|Polish|Russian|French|Portuguese|Turkish|Japanese|Chinese|Spanish|Deutsch|Italiano|Français)\s*:\s*$/im;

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.mdx')) files.push(p);
  }
})(CONTENT);

const errors = [];
for (const file of files) {
  const rel = relative(ROOT, file).replaceAll('\\', '/');
  const source = readFileSync(file, 'utf8');
  try {
    await compile(source.replace(/^---[\s\S]*?\n---\n/, ''), { format: 'mdx' });
  } catch (e) {
    errors.push(`${rel}: does not compile — ${e.message?.split('\n')[0]}`);
    continue;
  }
  if (!rel.startsWith('content/en/') && META_LEAK_RE.test(source)) {
    errors.push(`${rel}: possible MT meta-text leak`);
  }
}

if (errors.length > 0) {
  console.error(`MDX compile gate failed (${errors.length}):\n`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`MDX compile gate passed (${files.length} files).`);
