import { describe, expect, it } from 'vitest';
import { getGenerator, implementedFrameworks } from '../src/index.js';
import {
  absolutePositionFixture,
  autoLayoutRowFixture,
  cornerRadiusFixture,
  gradientFixture,
  pascalCaseNamingFixture,
  textStylingFixture,
} from './fixtures.js';

describe('getGenerator', () => {
  it('lists implemented frameworks', () => {
    expect(implementedFrameworks).toEqual(['REACT', 'HTML_TAILWIND', 'HTML_CSS']);
  });

  it('throws a helpful error for a not-yet-implemented framework', () => {
    expect(() => getGenerator('FLUTTER')).toThrow(/not implemented/i);
  });

  it('returns a generator for each implemented framework', () => {
    for (const framework of implementedFrameworks) {
      expect(getGenerator(framework).framework).toBe(framework);
    }
  });
});

describe('REACT generator', () => {
  it('emits flex classes for an auto-layout row with gap and padding', () => {
    const [file] = getGenerator('REACT').generate(autoLayoutRowFixture());
    expect(file?.content).toContain('flex');
    expect(file?.content).toContain('flex-row');
    expect(file?.content).toContain('gap-[12px]');
    expect(file?.content).toContain('p-[16px]');
    expect(file?.content).toContain('items-center');
    expect(file?.content).toContain('justify-between');
  });

  it('positions children absolutely inside a freeform frame', () => {
    const [file] = getGenerator('REACT').generate(absolutePositionFixture());
    expect(file?.content).toContain('absolute');
    expect(file?.content).toContain('left-[30px]');
    expect(file?.content).toContain('top-[50px]');
    expect(file?.content).toContain('w-[100px]');
    expect(file?.content).toContain('h-[60px]');
  });

  it('applies text styling classes', () => {
    const [file] = getGenerator('REACT').generate(textStylingFixture());
    expect(file?.content).toContain('text-[24px]');
    expect(file?.content).toContain('font-[700]');
    expect(file?.content).toContain('text-center');
    expect(file?.content).toContain('Hello openmake');
  });

  it('applies corner radius classes', () => {
    const [file] = getGenerator('REACT').generate(cornerRadiusFixture());
    expect(file?.content).toContain('rounded-[12px]');
  });

  it('sanitizes the node name into a PascalCase component name', () => {
    const [file] = getGenerator('REACT').generate(pascalCaseNamingFixture());
    expect(file?.path).toBe('PrimaryButtonLarge.tsx');
    expect(file?.content).toContain('export function PrimaryButtonLarge');
  });

  it('emits gradient fills as inline style', () => {
    const [file] = getGenerator('REACT').generate(gradientFixture());
    expect(file?.content).toContain('linear-gradient(');
    expect(file?.content).toContain('backgroundImage');
  });

  it('emits one file per selected node', () => {
    const ctx = autoLayoutRowFixture();
    const files = getGenerator('REACT').generate(ctx);
    expect(files).toHaveLength(1);
    expect(files[0]?.content).toContain('export function');
  });
});

describe('HTML_TAILWIND generator', () => {
  it('emits a tailwind CDN html document with flex classes', () => {
    const [file] = getGenerator('HTML_TAILWIND').generate(autoLayoutRowFixture());
    expect(file?.content).toContain('cdn.tailwindcss.com');
    expect(file?.content).toContain('class="flex flex-row');
    expect(file?.content).toContain('gap-[12px]');
  });

  it('positions children absolutely', () => {
    const [file] = getGenerator('HTML_TAILWIND').generate(absolutePositionFixture());
    expect(file?.content).toContain('absolute');
    expect(file?.content).toContain('left-[30px]');
  });
});

describe('HTML_CSS generator', () => {
  it('emits an inline <style> block with generated class rules', () => {
    const [file] = getGenerator('HTML_CSS').generate(autoLayoutRowFixture());
    expect(file?.content).toContain('<style>');
    expect(file?.content).toContain('display: flex');
    expect(file?.content).toContain('flex-direction: row');
    expect(file?.content).toContain('gap: 12px');
  });

  it('emits corner radius in css', () => {
    const [file] = getGenerator('HTML_CSS').generate(cornerRadiusFixture());
    expect(file?.content).toContain('border-radius: 12px');
  });

  it('emits gradient background-image in css', () => {
    const [file] = getGenerator('HTML_CSS').generate(gradientFixture());
    expect(file?.content).toContain('linear-gradient(');
  });
});
