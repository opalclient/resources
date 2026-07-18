/**
 * MDX translation: YAML frontmatter (selected fields) + body.
 *
 * The body goes through MT in paragraph-boundary chunks with code fences
 * extracted and sensitive tokens masked (see protect.mjs). gemma3 reliably
 * preserves markdown and JSX syntax — including translatable attribute
 * strings like question="…" — so the body is NOT parsed into an AST; instead
 * the output is verified structurally (JSX tag multiset, fence count,
 * heading count) and the file is rejected on any mismatch.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { translate } from './client.mjs';
import { BRANDS, extractFences, mask, restoreFences, unmask, verifyTokens } from './protect.mjs';

/** Frontmatter fields whose string values are translated. */
const FM_TRANSLATE = new Set(['title', 'description', 'excerpt', 'q', 'a', 'label']);
/** Everything else (slug, date, type, author, competitors, category, …) is copied. */

const CHUNK_LIMIT = 1400;

export function splitFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: null, body: raw };
  return { fm: m[1], body: raw.slice(m[0].length) };
}

async function translateFmNode(node, target) {
  if (Array.isArray(node)) {
    return Promise.all(node.map((n) => translateFmNode(n, target)));
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] =
        typeof v === 'string' && FM_TRANSLATE.has(k) ? await translateString(v, target) : await translateFmNode(v, target);
    }
    return out;
  }
  return node;
}

const BRAND_RE = new RegExp(`\\b(?:${BRANDS.join('|')})\\b`, 'g');
// .test() on a /g/ regex is stateful — keep a flagless copy for testing.
const BRAND_TEST_RE = new RegExp(BRAND_RE.source);
const QUOTES = ['"', '“', '”', '„', '«', '»', '「', '」'];

/** Remove the quote pair we planted around a brand for pinning. */
function stripBrandQuotes(text) {
  let out = text;
  for (const brand of BRANDS) {
    for (const open of QUOTES) {
      for (const close of QUOTES) {
        out = out.replaceAll(`${open}${brand}${close}`, brand);
      }
    }
  }
  return out;
}

/**
 * Guarded plain-text translation, three escalating strategies:
 *  1. sentinel-masked tokens (strict; CJK sometimes swallows sentinels)
 *  2. raw text (fluent; may localize prices/brands)
 *  3. raw with brands quote-pinned (models keep quoted names verbatim)
 * Every result must pass verifyTokens (placeholders verbatim, price digits
 * intact, brands present in Latin script) or the next strategy runs.
 */
async function translateString(s, target) {
  const errors = [];
  try {
    const { masked, store } = mask(s);
    const { text, missing } = unmask(await translate(masked, target), store);
    if (missing > 0) throw new Error(`lost ${missing} masked token(s)`);
    const lost = verifyTokens(s, text);
    if (lost !== null) throw new Error(`token ${lost} lost`);
    return text;
  } catch (e) {
    errors.push(e.message);
  }
  try {
    const raw = await translate(s, target);
    const lost = verifyTokens(s, raw);
    if (lost !== null) throw new Error(`token ${lost} lost`);
    return raw;
  } catch (e) {
    errors.push(e.message);
  }
  try {
    const pinned = stripBrandQuotes(await translate(s.replace(BRAND_RE, '"$&"'), target));
    const lost = verifyTokens(s, pinned);
    if (lost !== null) throw new Error(`token ${lost} lost`);
    return pinned;
  } catch (e) {
    errors.push(e.message);
  }
  // Strategy 4: protected tokens never enter MT at all — split around
  // brands, prices, and placeholders, translate the fragments in between,
  // and reassemble. Loses a little context, can never lose a token.
  const PIN_SOURCE = `${BRANDS.join('|')}|\\$\\d+(?:\\.\\d{2})?|\\{\\w+\\}|%[sd]`;
  if (new RegExp(PIN_SOURCE).test(s)) {
    const parts = s.split(new RegExp(`(${PIN_SOURCE})`, 'g'));
    const isPinned = new RegExp(`^(?:${PIN_SOURCE})$`);
    const out = [];
    for (const part of parts) {
      if (part === undefined) continue;
      if (isPinned.test(part) || !/[A-Za-z]{3,}/.test(part)) {
        out.push(part);
        continue;
      }
      // Keep the fragment's leading/trailing punctuation out of MT — the
      // model eats a leading ": " and the title reassembles mashed together.
      const [, prefix, core, suffix] = part.match(/^([^A-Za-z]*)([\s\S]*?)([^A-Za-z]*)$/);
      out.push(prefix + (await translateString(core, target)) + suffix);
    }
    const joined = out.join('');
    const lost = verifyTokens(s, joined);
    if (lost === null) return joined;
    errors.push(`token ${lost} lost`);
  }
  throw new Error(`all strategies failed (${errors.join('; ')}) in: ${s.slice(0, 80)}`);
}

/**
 * Split body into MT-sized chunks on blank-line boundaries. Paragraphs
 * containing JSX are isolated into their own chunks: given a large mixed
 * chunk the model starts "improving" components into markdown, but it
 * translates an isolated component block faithfully.
 */
export function chunkBody(body) {
  const paragraphs = body.split(/\r?\n\r?\n/);
  const chunks = [];
  let current = [];
  let currentLen = 0;
  const flush = () => {
    if (current.length > 0) {
      chunks.push(current.join('\n\n'));
      current = [];
      currentLen = 0;
    }
  };
  for (const p of paragraphs) {
    if (/<\/?[A-Z]/.test(p)) {
      flush();
      chunks.push(p);
      continue;
    }
    if (currentLen + p.length > CHUNK_LIMIT) flush();
    current.push(p);
    currentLen += p.length + 2;
  }
  flush();
  return chunks;
}

const jsxTags = (s) =>
  [...s.matchAll(/<\/?([A-Z][A-Za-z]*)/g)].map((m) => m[0]).sort().join(',');
const headingCount = (s) => (s.match(/^#{1,6} /gm) ?? []).length;
const fenceLineCount = (s) => (s.match(/^```/gm) ?? []).length;

/** Async String.replace. Matches are translated sequentially. */
async function replaceAsync(str, re, fn) {
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(re)) {
    parts.push(str.slice(last, m.index), await fn(...m));
    last = m.index + m[0].length;
  }
  parts.push(str.slice(last));
  return parts.join('');
}

/** JSX attribute / object-literal props whose string values are display text. */
const PROP_NAMES = ['question', 'title', 'label', 'description', 'sub', 'q', 'a'];
const PROP_RE = new RegExp(`\\b(${PROP_NAMES.join('|')})(="|:\\s*")((?:[^"\\\\]|\\\\.)+)(")`, 'g');
/** Arrays of bare display-string literals inside component props. */
const ARRAY_BLOCK_RE = /(features=\{\[|values:\s*\[)([\s\S]*?)(\])/g;

/**
 * Translate display strings inside a JSX-only chunk (component tags,
 * self-closing components with data props) without ever showing the model a
 * tag name — it happily "translates" <KeyTakeaways> to <主なポイント> otherwise.
 */
async function translateJsxProps(chunk, target) {
  let out = await replaceAsync(chunk, PROP_RE, async (_, name, open, value, close) => {
    return `${name}${open}${await translateString(value, target)}${close}`;
  });
  out = await replaceAsync(out, ARRAY_BLOCK_RE, async (_, open, inner, close) => {
    const translated = await replaceAsync(inner, /"((?:[^"\\]|\\.)+)"/g, async (m, literal) => {
      if (literal.startsWith('/') || literal.startsWith('http')) return m;
      return `"${await translateString(literal, target)}"`;
    });
    return `${open}${translated}${close}`;
  });
  return out;
}

/**
 * Last-resort translation for a JSX-bearing chunk the model keeps mangling:
 * split at tag boundaries, translate only the text runs, keep every tag
 * verbatim (translating its display props individually). Loses a little
 * cross-tag context but can never break structure.
 */
async function translateAroundTags(chunk, target) {
  const parts = chunk.split(/(<[^>]*>)/);
  const out = [];
  for (const part of parts) {
    if (part.startsWith('<')) out.push(await translateJsxProps(part, target));
    else if (/[A-Za-z]{2,}/.test(part)) out.push(await translateString(part, target));
    else out.push(part);
  }
  return out.join('');
}

/**
 * gemma3 sometimes wraps its whole answer in a markdown code fence. If the
 * source chunk had no fence, strip a wrapping pair from the output.
 */
function stripWrapperFence(out, src) {
  if (fenceLineCount(src) > 0) return out;
  const trimmed = out.trim();
  if (trimmed.startsWith('```') && trimmed.endsWith('```')) {
    return trimmed.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '');
  }
  return out;
}

/** Rewrite internal /en/ links to the target locale. */
const rewriteLinks = (s, target) => s.replaceAll('(/en/', `(/${target}/`).replaceAll('"/en/', `"/${target}/`);

export async function translateMdx(raw, target) {
  const { fm, body } = splitFrontmatter(raw);

  let fmOut = '';
  if (fm !== null) {
    const parsed = parseYaml(fm);
    const translated = await translateFmNode(parsed, target);
    fmOut = `---\n${stringifyYaml(translated, { lineWidth: 0 }).trimEnd()}\n---\n\n`;
  }

  const { body: fenceless, fences } = extractFences(body);
  const chunks = chunkBody(fenceless);
  const outChunks = [];
  for (const chunk of chunks) {
    if (!chunk.trim()) {
      outChunks.push(chunk);
      continue;
    }
    // Chunks without prose outside JSX (bare open/close tags, self-closing
    // data components) never go through full MT — only their display-string
    // props are translated individually.
    if (!/[A-Za-z]{2,}/.test(chunk.replace(/<[^>]*>/g, ' '))) {
      outChunks.push(await translateJsxProps(chunk, target));
      continue;
    }
    // MT output is not deterministic enough to trust blindly: each chunk is
    // translated with the guarded strategy (masked, then raw+verified) and
    // must preserve the chunk's JSX tag set, with retries before failing
    // the whole file.
    let result = null;
    let lastError = 'unknown';
    for (let attempt = 0; attempt < 3 && result === null; attempt++) {
      try {
        const candidate = stripWrapperFence(await translateString(chunk, target), chunk);
        if (jsxTags(candidate) !== jsxTags(chunk)) {
          lastError = 'JSX tag set mismatch';
          continue;
        }
        if (headingCount(candidate) !== headingCount(chunk)) {
          lastError = 'heading count mismatch';
          continue;
        }
        result = candidate;
      } catch (e) {
        lastError = e.message;
      }
    }
    if (result === null && /<\/?[A-Z]/.test(chunk)) {
      result = await translateAroundTags(chunk, target);
      if (headingCount(result) !== headingCount(chunk)) result = null;
    }
    if (result === null && headingCount(chunk) > 0) {
      // The model keeps restyling headings — translate each heading line on
      // its own (marker re-attached verbatim) and the prose between them
      // separately. Structure becomes unbreakable.
      const lines = chunk.split('\n');
      const out = [];
      let prose = [];
      const flushProse = async () => {
        if (prose.length === 0) return;
        const text = prose.join('\n');
        out.push(/[A-Za-z]{2,}/.test(text) ? await translateString(text, target) : text);
        prose = [];
      };
      for (const line of lines) {
        const m = line.match(/^(#{1,6} )(.*)$/);
        if (m) {
          await flushProse();
          out.push(m[1] + (m[2].trim() ? await translateString(m[2], target) : m[2]));
        } else {
          prose.push(line);
        }
      }
      await flushProse();
      result = out.join('\n');
    }
    if (result === null) throw new Error(`body chunk failed after retries: ${lastError}`);
    outChunks.push(result);
  }
  let outBody = outChunks.join('\n\n');
  const { body: restored, missing: missingFences } = restoreFences(outBody, fences);
  if (missingFences > 0) throw new Error(`lost ${missingFences} code fence(s)`);
  outBody = rewriteLinks(restored, target);

  // Structural verification against the source.
  const srcBody = restoreFences(chunkBody(fenceless).join('\n\n'), fences).body;
  if (jsxTags(outBody) !== jsxTags(srcBody)) throw new Error('JSX tag set mismatch after translation');
  if (headingCount(outBody) !== headingCount(srcBody)) throw new Error('heading count mismatch after translation');
  if (fenceLineCount(outBody) !== fenceLineCount(srcBody)) throw new Error('code fence count mismatch after translation');

  return fmOut + outBody.trimStart() + (outBody.endsWith('\n') ? '' : '\n');
}

export { translateString };
