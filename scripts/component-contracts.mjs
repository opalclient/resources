/**
 * Prop contracts for MDX components that `@mdx-js/mdx`'s `compile()` cannot
 * enforce. MT has previously translated an enum prop's value and an
 * attribute's name (variant="tip" title="…" became variant="ipucu"
 * başlık="…") — the result is syntactically valid JSX, so it compiles clean,
 * but the component looks up its config by the untranslated enum and throws
 * at render/prerender time. This checks the values compile() can't see.
 */

const CONTRACTS = {
  Callout: {
    allowedAttrs: ['variant', 'title', 'className'],
    enums: { variant: ['info', 'warning', 'danger', 'tip'] }
  }
};

const TAG_RE = /<(\w+)((?:\s+[^>]*?)?)\/?>/g;
const ATTR_RE = /([A-Za-z_][\w-]*)\s*=\s*"([^"]*)"/g;

export function checkComponentContracts(source) {
  const errors = [];
  for (const m of source.matchAll(TAG_RE)) {
    const [, tag, attrsRaw] = m;
    const contract = CONTRACTS[tag];
    if (!contract) continue;

    const attrs = {};
    for (const am of attrsRaw.matchAll(ATTR_RE)) attrs[am[1]] = am[2];

    for (const attrName of Object.keys(attrs)) {
      if (!contract.allowedAttrs.includes(attrName)) {
        errors.push(
          `<${tag}>: unrecognized attribute "${attrName}" (expected one of ${contract.allowedAttrs.join(', ')} — translation may have renamed it)`
        );
      }
    }
    for (const [attrName, allowed] of Object.entries(contract.enums)) {
      const value = attrs[attrName];
      if (value !== undefined && !allowed.includes(value)) {
        errors.push(
          `<${tag} ${attrName}="${value}">: not a recognized value (expected one of ${allowed.join(', ')})`
        );
      }
    }
  }
  return errors;
}

export function assertComponentContracts(source) {
  const errors = checkComponentContracts(source);
  if (errors.length > 0) throw new Error(`component contract violation: ${errors.join('; ')}`);
}
