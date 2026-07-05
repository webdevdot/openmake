import { expect, test } from '@playwright/test';
import {
  canvasShot,
  createFileAndOpenEditor,
  drawShape,
  login,
  register,
  uniqueEmail,
} from './helpers.js';

test.describe('full user journey', () => {
  test('register → create file → draw → inspect → undo/redo → export → relogin persistence', async ({
    page,
  }) => {
    const email = uniqueEmail('journey');

    // -- register lands on dashboard with personal org + default project
    await register(page, email, 'Journey User');
    await expect(page.getByRole('combobox')).toContainText("Journey User's Org");

    // -- create a file, editor boots: toolbar, panels, live canvas
    await createFileAndOpenEditor(page, 'Landing page');
    await expect(page.getByTestId('toolbar')).toBeVisible();
    await expect(page.getByTestId('layers-tree')).toBeVisible();
    await expect(page.getByTestId('inspector-empty')).toBeVisible();

    // -- the canvas actually renders: drawing changes pixels (poll: repaint is async via rAF)
    const before = await canvasShot(page);
    await drawShape(page, 'rectangle', { x: 200, y: 150 }, { x: 420, y: 320 });
    await expect.poll(async () => (await canvasShot(page)).equals(before), { timeout: 5000 }).toBe(false);

    // -- the node exists in the layers tree and is selected in the inspector
    await expect(page.getByTestId('layers-tree').getByText('Rectangle')).toBeVisible();
    await expect(page.getByTestId('geometry-section')).toBeVisible();
    await expect(page.getByTestId('fills-section')).toBeVisible();

    // -- change the fill; canvas repaints (poll: repaint is async via rAF)
    const painted = await canvasShot(page);
    await page.getByTestId('fill-hex-input').first().fill('ff4433');
    await page.getByTestId('fill-hex-input').first().press('Enter');
    await expect.poll(async () => (await canvasShot(page)).equals(painted), { timeout: 5000 }).toBe(false);

    // -- text tool creates an editable text node rendered by CanvasKit
    await page.getByTestId('tool-text').click();
    const canvas = page.getByTestId('canvas-surface');
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 500, box.y + 120);
    await expect(page.getByTestId('text-editor-overlay')).toBeVisible();
    await page.keyboard.type('Hello openmake');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('layers-tree').getByText('Hello openmake')).toBeVisible();

    // -- undo removes the text node, redo restores it
    const undoChord = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
    await page.keyboard.press(undoChord);
    await expect(page.getByTestId('layers-tree').getByText('Hello openmake')).not.toBeVisible();
    await page.keyboard.press(`Shift+${undoChord}`);
    await expect(page.getByTestId('layers-tree').getByText('Hello openmake')).toBeVisible();

    // -- SVG export of the selected rectangle downloads a real SVG
    await page.getByTestId('layers-tree').getByText('Rectangle').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-svg').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.svg$/);

    // -- document survives a full logout/login cycle (server persistence)
    await page.goto('/');
    await page.getByRole('button', { name: 'Sign out' }).click();
    await login(page, email);
    await page.getByText('Landing page').click();
    await expect(page.getByTestId('canvas-surface')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('layers-tree').getByText('Rectangle')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('layers-tree').getByText('Hello openmake')).toBeVisible();
  });

  test('auth guard: unauthenticated /file route redirects to login', async ({ page }) => {
    await page.goto('/file/some-file-id');
    await expect(page).toHaveURL(/\/login/);
  });
});
