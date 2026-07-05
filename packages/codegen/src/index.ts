import type { CodegenFramework } from '@openmake/shared';
import type { Generator } from './types.js';
import { reactGenerator } from './generators/react.js';
import { htmlTailwindGenerator } from './generators/html-tailwind.js';
import { htmlCssGenerator } from './generators/html-css.js';

export type { GeneratedFile, Generator } from './types.js';

/** Frameworks with a working deterministic generator. Others throw a "not implemented" error. */
export const implementedFrameworks: CodegenFramework[] = ['REACT', 'HTML_TAILWIND', 'HTML_CSS'];

const registry: Partial<Record<CodegenFramework, Generator>> = {
  REACT: reactGenerator,
  HTML_TAILWIND: htmlTailwindGenerator,
  HTML_CSS: htmlCssGenerator,
};

/** Look up the deterministic generator for a framework; throws for frameworks not yet implemented. */
export function getGenerator(framework: CodegenFramework): Generator {
  const generator = registry[framework];
  if (!generator) {
    throw new Error(
      `Codegen for "${framework}" is not implemented yet. Implemented frameworks: ${implementedFrameworks.join(', ')}.`,
    );
  }
  return generator;
}
