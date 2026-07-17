import { readFileSync, writeFileSync } from 'node:fs';

import { translateMdx } from './mdx.mjs';

const [src, target, out] = process.argv.slice(2);
const raw = readFileSync(src, 'utf8');
const started = Date.now();
const translated = await translateMdx(raw, target);
writeFileSync(out, translated);
console.log(`ok: ${raw.length} chars -> ${translated.length} chars in ${((Date.now() - started) / 1000).toFixed(1)}s`);
