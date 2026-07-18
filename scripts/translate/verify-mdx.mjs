/**
 * Post-translation MDX verification: the output must actually compile.
 * Catches the syntax-breaking MT failure class (merged attributes, mangled
 * JSX expressions) that structural token checks cannot see. Components are
 * irrelevant to compilation, so no component map is needed.
 */
import { compile } from '@mdx-js/mdx';

export async function assertMdxCompiles(source) {
  try {
    await compile(source, { format: 'mdx' });
  } catch (e) {
    throw new Error(`translated MDX does not compile: ${e.message?.split('\n')[0]}`);
  }
}
