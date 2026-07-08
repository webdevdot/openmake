import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BottomToolbar } from './BottomToolbar.js';
import { useToolStore, type ToolId } from '../../store/tool.js';

afterEach(() => {
  useToolStore.setState({ tool: 'select' });
});

const TOOL_IDS: ToolId[] = [
  'select',
  'frame',
  'rectangle',
  'ellipse',
  'line',
  'pen',
  'text',
  'hand',
];

describe('BottomToolbar', () => {
  it('renders all 8 tool buttons by testid', () => {
    render(<BottomToolbar />);
    for (const id of TOOL_IDS) {
      expect(screen.getByTestId(`tool-${id}`)).toBeTruthy();
    }
  });

  it('clicking tool-pen updates the tool store', () => {
    render(<BottomToolbar />);

    fireEvent.click(screen.getByTestId('tool-pen'));

    expect(useToolStore.getState().tool).toBe('pen');
  });

  it('clicking tool-rectangle updates the tool store', () => {
    render(<BottomToolbar />);

    fireEvent.click(screen.getByTestId('tool-rectangle'));

    expect(useToolStore.getState().tool).toBe('rectangle');
  });

  it('marks only the active tool button with aria-pressed', () => {
    render(<BottomToolbar />);
    expect(screen.getByTestId('tool-select').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tool-pen').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByTestId('tool-pen'));

    expect(screen.getByTestId('tool-pen').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tool-select').getAttribute('aria-pressed')).toBe('false');
  });

  it('the comment placeholder button is disabled', () => {
    render(<BottomToolbar />);
    expect((screen.getByTitle('Comment') as HTMLButtonElement).disabled).toBe(true);
  });
});
