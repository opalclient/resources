/**
 * Masking layer around machine translation.
 *
 * The model must never touch: i18n placeholders ({time}, %s), USD prices
 * (it "helpfully" converts $8.99 to 8,99 € otherwise), inline rich-text tags
 * (<terms>…</terms> in catalog strings survive as-is but their names must not
 * be translated), and fenced code blocks. Everything is swapped for sentinel
 * tokens the model reliably leaves alone, then restored and verified after.
 */

const SENTINEL = (i) => `⟦K${i}⟧`;
const SENTINEL_RE = /⟦K(\d+)⟧/g;

const STRICT_PATTERNS = [
  /\{\w+\}/g, // ICU-style placeholders
  /%[sd]/g // printf-style placeholders
];
const PRICE_PATTERN = /\$\d+(?:\.\d{2})?/g;

/**
 * Proper nouns that must never be localized (zh happily renders Opal as
 * 奥帕尔 and Lunar Client as 月球客户端 — SEO poison). Longest first so
 * "Opal Client" masks before "Opal".
 */
export const BRANDS = [
  'Opal Client',
  'Lunar Client',
  'Badlion Client',
  'Meteor Client',
  'LiquidBounce',
  'KAMI Blue',
  'Feather',
  'Terminus',
  'Minecraft',
  'NeoForge',
  'OptiFine',
  'GraalVM',
  'GraalJS',
  'BedWars',
  'SkyWars',
  'Moonsworth',
  'Sodium',
  'Fabric',
  'Vulkan',
  'Quilt',
  'Forge',
  'Iris',
  'Opal'
];
const BRAND_PATTERN = new RegExp(`\\b(?:${BRANDS.join('|')})\\b`, 'g');

// Masking uses only compact functional tokens; brands stay inline (a
// sentence full of sentinels wrecks CJK fluency) and are checked by
// verifyTokens on the output instead.
export const PATTERNS = [...STRICT_PATTERNS, PRICE_PATTERN];

/**
 * Placeholders must survive verbatim. Prices may be localized ($8.99 →
 * 8.99ドル is fine Japanese) as long as the digits survive — what must never
 * happen is a silent currency conversion to a different amount.
 */
export function verifyTokens(src, out) {
  for (const re of STRICT_PATTERNS) {
    for (const m of src.matchAll(new RegExp(re.source, 'g'))) {
      if (!out.includes(m[0])) return m[0];
    }
  }
  for (const m of src.matchAll(new RegExp(PRICE_PATTERN.source, 'g'))) {
    const digits = m[0].slice(1);
    // Accept decimal-comma localizations (8.99 → 8,99) — what must never
    // change is the amount itself.
    if (!out.includes(digits) && !out.includes(digits.replace('.', ','))) return m[0];
  }
  // Brands: every distinct brand mentioned in the source must still appear
  // (verbatim, in Latin script) somewhere in the output.
  for (const brand of new Set(src.match(BRAND_PATTERN) ?? [])) {
    if (!out.includes(brand)) return brand;
  }
  return null;
}

export function mask(text) {
  const store = [];
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, (m) => {
      store.push(m);
      return SENTINEL(store.length - 1);
    });
  }
  return { masked: out, store };
}

export function unmask(text, store) {
  let missing = 0;
  const seen = new Set();
  const out = text.replace(SENTINEL_RE, (_, i) => {
    seen.add(Number(i));
    return store[Number(i)] ?? '';
  });
  for (let i = 0; i < store.length; i++) if (!seen.has(i)) missing++;
  return { text: out, missing };
}

/** Extract fenced code blocks before chunking; they are never sent to MT. */
export function extractFences(body) {
  const fences = [];
  const out = body.replace(/```[\s\S]*?```/g, (m) => {
    fences.push(m);
    return `⟦F${fences.length - 1}⟧`;
  });
  return { body: out, fences };
}

export function restoreFences(body, fences) {
  let missing = 0;
  const seen = new Set();
  const out = body.replace(/⟦F(\d+)⟧/g, (_, i) => {
    seen.add(Number(i));
    return fences[Number(i)] ?? '';
  });
  for (let i = 0; i < fences.length; i++) if (!seen.has(i)) missing++;
  return { body: out, missing };
}
