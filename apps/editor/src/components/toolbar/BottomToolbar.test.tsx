import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BottomToolbar } from './BottomToolbar.js';
import { useToolStore, type ToolId } from '../../store/tool.js';

afterEach(() => {
  useToolStore.setState({ tool: 'select' });
});

// Fixed inline slots (shape tools live in the grouped flyout instead).
const INLINE_TOOL_IDS: ToolId[] = ['select', 'frame', 'pen', 'text', 'hand'];
const SHAPE_TOOL_IDS: ToolId[] = ['rectangle', 'ellipse', 'line', 'polygon', 'star', 'image'];

function openFlyout() {
  fireEvent.click(screen.getByTestId('tool-shape'));
  return screen.getByTestId('shape-flyout');
}

describe('BottomToolbar', () => {
  it('renders the fixed inline tool buttons by testid', () => {
    render(<BottomToolbar />);
    for (const id of INLINE_TOOL_IDS) {
      expect(screen.getByTestId(`tool-${id}`)).toBeTruthy();
    }
  });

  it('renders the grouped shape slot and hides shape tools until the flyout opens', () => {
    render(<BottomToolbar />);
    expect(screen.getByTestId('tool-shape')).toBeTruthy();
    for (const id of SHAPE_TOOL_IDS) {
      expect(screen.queryByTestId(`tool-${id}`)).toBeNull();
    }
    expect(screen.queryByTestId('shape-flyout')).toBeNull();
  });

  it('opens the flyout exposing every shape tool with accessible labels', () => {
    render(<BottomToolbar />);
    openFlyout();
    expect(screen.getByLabelText('Polygon')).toBeTruthy();
    expect(screen.getByLabelText('Star')).toBeTruthy();
    expect(screen.getByLabelText('Place image')).toBeTruthy();
    for (const id of SHAPE_TOOL_IDS) {
      expect(screen.getByTestId(`tool-${id}`)).toBeTruthy();
    }
  });

  it.each(SHAPE_TOOL_IDS)('picking %s from the flyout updates the tool store', (id) => {
    render(<BottomToolbar />);
    openFlyout();
    fireEvent.click(screen.getByTestId(`tool-${id}`));
    expect(useToolStore.getState().tool).toBe(id);
    // Flyout closes after picking.
    expect(screen.queryByTestId('shape-flyout')).toBeNull();
  });

  it('remembers the last-used shape in the grouped slot', () => {
    render(<BottomToolbar />);
    openFlyout();
    fireEvent.click(screen.getByTestId('tool-star'));

    // Slot now represents the star tool (its accessible label).
    expect(screen.getByTestId('tool-shape').getAttribute('aria-label')).toBe('Star');

    // Clicking the slot re-selects the remembered shape.
    act(() => {
      useToolStore.setState({ tool: 'select' });
    });
    fireEvent.click(screen.getByTestId('tool-shape'));
    expect(useToolStore.getState().tool).toBe('star');
  });

  it('reflects a shape chosen by shortcut in the grouped slot even while hidden', () => {
    render(<BottomToolbar />);
    // Simulate the keyboard shortcut path: the tool store is set directly.
    act(() => {
      useToolStore.setState({ tool: 'polygon' });
    });

    const slot = screen.getByTestId('tool-shape');
    expect(slot.getAttribute('aria-label')).toBe('Polygon');
    expect(slot.getAttribute('aria-pressed')).toBe('true');
  });

  it('closes the flyout on Escape', () => {
    render(<BottomToolbar />);
    openFlyout();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('shape-flyout')).toBeNull();
  });

  it('closes the flyout on outside pointerdown', () => {
    render(<BottomToolbar />);
    openFlyout();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('shape-flyout')).toBeNull();
  });

  it('clicking tool-pen updates the tool store', () => {
    render(<BottomToolbar />);
    fireEvent.click(screen.getByTestId('tool-pen'));
    expect(useToolStore.getState().tool).toBe('pen');
  });

  it('marks only the active tool button with aria-pressed', () => {
    render(<BottomToolbar />);
    expect(screen.getByTestId('tool-select').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tool-pen').getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByTestId('tool-pen'));

    expect(screen.getByTestId('tool-pen').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tool-select').getAttribute('aria-pressed')).toBe('false');
  });

  it('the comment button activates the comment tool', () => {
    render(<BottomToolbar />);
    const commentBtn = screen.getByTestId('tool-comment') as HTMLButtonElement;
    expect(commentBtn.disabled).toBe(false);
    expect(commentBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(commentBtn);

    expect(useToolStore.getState().tool).toBe('comment');
    expect(screen.getByTestId('tool-comment').getAttribute('aria-pressed')).toBe('true');
  });
});
