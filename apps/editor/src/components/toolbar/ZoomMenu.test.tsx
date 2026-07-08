import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ZoomMenu } from './ZoomMenu.js';
import { useCameraStore } from '../../store/camera.js';
import { DEFAULT_CAMERA } from '../../canvas/camera.js';

afterEach(() => {
  useCameraStore.setState({ camera: DEFAULT_CAMERA });
});

function openMenu() {
  fireEvent.click(screen.getByTestId('zoom-menu-trigger'));
  return screen.getByTestId('zoom-menu');
}

describe('ZoomMenu', () => {
  it('opens on trigger click and selects a preset', () => {
    render(<ZoomMenu />);
    openMenu();

    fireEvent.click(screen.getByText('200%'));

    expect(useCameraStore.getState().camera.zoom).toBe(2);
    expect(screen.queryByTestId('zoom-menu')).toBeNull();
  });

  it('exposes popup menu semantics to assistive tech', () => {
    render(<ZoomMenu />);
    const trigger = screen.getByTestId('zoom-menu-trigger');

    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    const menu = openMenu();

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(5);
  });

  it('closes on Escape keydown', () => {
    render(<ZoomMenu />);
    openMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('zoom-menu')).toBeNull();
  });

  it('closes on pointerdown outside the menu', () => {
    render(<ZoomMenu />);
    openMenu();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByTestId('zoom-menu')).toBeNull();
  });

  it('stays open on pointerdown inside the menu', () => {
    render(<ZoomMenu />);
    const menu = openMenu();

    fireEvent.pointerDown(menu);

    expect(screen.queryByTestId('zoom-menu')).toBeTruthy();
  });

  it('has no duplicate 100% row', () => {
    render(<ZoomMenu />);
    const menu = openMenu();

    expect(within(menu).getAllByText(/^100%/)).toHaveLength(1);
    expect(within(menu).queryByText('100% (reset)')).toBeNull();
  });
});
