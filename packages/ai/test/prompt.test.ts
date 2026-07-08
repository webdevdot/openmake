import type { DesignContext } from '@openmake/shared';
import { describe, expect, it } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

const SAMPLE_CONTEXT: DesignContext = {
  document: { id: 'doc_1', name: 'Test file' },
  selection: [
    {
      node: {
        id: 'node_1',
        name: 'Card',
        type: 'FRAME',
        visible: true,
        locked: false,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        blendMode: 'NORMAL',
        fills: [],
        strokes: [],
        effects: [],
        children: [],
        clipsContent: true,
        cornerRadius: 0,
      },
      path: [],
      descendants: {},
      childrenOrder: {},
    },
  ],
  variables: {},
  styles: {},
};

describe('assemblePrompt', () => {
  it('uses a sensible default base system prompt when none is given', () => {
    const { system } = assemblePrompt({ userRequest: 'Make it blue' });
    expect(system.length).toBeGreaterThan(0);
    expect(system).toMatch(/design/i);
  });

  it('orders system layers: base, then skill prompt, then project context, then framework directive', () => {
    const { system } = assemblePrompt({
      basePrompt: 'BASE',
      skill: { systemPrompt: 'SKILL' },
      projectContext: 'PROJECT',
      framework: 'REACT',
      userRequest: 'Do it',
    });
    const baseIdx = system.indexOf('BASE');
    const skillIdx = system.indexOf('SKILL');
    const projectIdx = system.indexOf('PROJECT');
    const frameworkIdx = system.indexOf('REACT');

    expect(baseIdx).toBeGreaterThanOrEqual(0);
    expect(skillIdx).toBeGreaterThan(baseIdx);
    expect(projectIdx).toBeGreaterThan(skillIdx);
    expect(frameworkIdx).toBeGreaterThan(projectIdx);
  });

  it('omits layers that are not provided', () => {
    const { system } = assemblePrompt({ basePrompt: 'BASE', userRequest: 'Do it' });
    expect(system).toBe('BASE');
  });

  it('embeds a compact JSON design context before the user request in the prompt', () => {
    const { prompt } = assemblePrompt({
      designContext: SAMPLE_CONTEXT,
      userRequest: 'Make it blue',
    });
    const contextIdx = prompt.indexOf('"doc_1"');
    const requestIdx = prompt.indexOf('Make it blue');
    expect(contextIdx).toBeGreaterThanOrEqual(0);
    expect(requestIdx).toBeGreaterThan(contextIdx);
  });

  it('strips empty fields from the embedded design context JSON', () => {
    const { prompt } = assemblePrompt({
      designContext: SAMPLE_CONTEXT,
      userRequest: 'Make it blue',
    });
    expect(prompt).not.toContain('"variables":{}');
    expect(prompt).not.toContain('"styles":{}');
    expect(prompt).not.toContain('"descendants":{}');
    expect(prompt).not.toContain('"path":[]');
  });

  it('always includes the user request even with no other layers', () => {
    const { system, prompt } = assemblePrompt({ userRequest: 'Only this' });
    expect(prompt).toContain('Only this');
    expect(system.length).toBeGreaterThan(0);
  });
});
