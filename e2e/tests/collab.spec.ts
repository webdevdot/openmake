import { expect, test } from '@playwright/test';
import {
  createFileAndOpenEditor,
  drawShape,
  login,
  register,
  uniqueEmail,
  waitForCollabConnected,
} from './helpers.js';

test.describe('real-time collaboration', () => {
  test('two sessions on one file converge live', async ({ browser }) => {
    const email = uniqueEmail('collab');

    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await register(pageA, email, 'Collab User');
    const fileId = await createFileAndOpenEditor(pageA, 'Shared file');
    await waitForCollabConnected(pageA);

    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await login(pageB, email);
    await pageB.goto(`/file/${fileId}`);
    await expect(pageB.getByTestId('canvas-surface')).toBeVisible({ timeout: 20_000 });
    await waitForCollabConnected(pageB);

    // A draws → B sees the node appear in its layers tree without reloading
    await drawShape(pageA, 'ellipse', { x: 250, y: 200 }, { x: 400, y: 350 });
    await expect(pageB.getByTestId('layers-tree').getByText('Ellipse')).toBeVisible({
      timeout: 15_000,
    });

    // B draws → A converges too (bidirectional)
    await drawShape(pageB, 'rectangle', { x: 500, y: 200 }, { x: 620, y: 300 });
    await expect(pageA.getByTestId('layers-tree').getByText('Rectangle')).toBeVisible({
      timeout: 15_000,
    });

    await ctxA.close();
    await ctxB.close();
  });
});
