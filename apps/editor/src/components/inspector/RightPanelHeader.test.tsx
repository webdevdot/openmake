import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RightPanelHeader } from './RightPanelHeader.js';
import { usePanelModeStore } from '../../store/panelMode.js';

afterEach(() => {
  usePanelModeStore.setState({ mode: 'design' });
});

describe('RightPanelHeader', () => {
  it('renders the Design/Prototype tabs and the zoom menu trigger in one header row', () => {
    render(<RightPanelHeader />);
    const header = screen.getByTestId('right-panel-header');
    expect(screen.getByTestId('panel-mode-design')).toBeTruthy();
    expect(screen.getByTestId('panel-mode-prototype')).toBeTruthy();
    // Zoom menu relocated from the top bar into this header.
    expect(screen.getByTestId('zoom-menu-trigger')).toBeTruthy();
    expect(header.contains(screen.getByTestId('zoom-menu-trigger'))).toBe(true);
  });

  it('marks Design active by default', () => {
    render(<RightPanelHeader />);
    expect(screen.getByTestId('panel-mode-design').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('panel-mode-prototype').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches the panel mode when a tab is clicked', () => {
    render(<RightPanelHeader />);

    fireEvent.click(screen.getByTestId('panel-mode-prototype'));

    expect(usePanelModeStore.getState().mode).toBe('prototype');
    expect(screen.getByTestId('panel-mode-prototype').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('panel-mode-design').getAttribute('aria-pressed')).toBe('false');
  });
});
