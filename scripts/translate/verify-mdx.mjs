/**
 * Post-translation MDX verification: the output must actually compile, and
 * known components' enum/attribute props must still hold values compile()
 * can't validate (see component-contracts.mjs — a JSX-syntax-valid but
 * semantically mangled prop, like a translated enum value, compiles fine and
 * still crashes the component at render time).
 */
import { compile } from '@mdx-js/mdx';

import { assertComponentContracts } from '../component-contracts.mjs';

export async function assertMdxCompiles(source) {
  try {
    await compile(source, { format: 'mdx' });
  } catch (e) {
    throw new Error(`translated MDX does not compile: ${e.message?.split('\n')[0]}`);
  }
  assertComponentContracts(source);
}
