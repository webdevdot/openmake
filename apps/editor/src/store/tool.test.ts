import { beforeEach, describe, expect, it } from 'vitest';
import { useToolStore } from './tool.js';

describe('tool store', () => {
  beforeEach(() => {
    useToolStore.setState({ tool: 'select' });
  });

  it('defaults to the select tool', () => {
    expect(useToolStore.getState().tool).toBe('select');
  });

  it('setTool switches the active tool', () => {
    useToolStore.getState().setTool('rectangle');
    expect(useToolStore.getState().tool).toBe('rectangle');
  });
});
