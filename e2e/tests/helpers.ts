import { expect, type Page } from '@playwright/test';

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@openmake.test`;
}

export const PASSWORD = 'openmake-e2e-pass1';

export async function register(page: Page, email: string, name = 'E2E User'): Promise<void> {
  await page.goto('/register');
  await page.getByTestId('register-name-input').fill(name);
  await page.getByTestId('register-email-input').fill(email);
  await page.getByTestId('register-password-input').fill(PASSWORD);
  await page.getByTestId('register-submit').click();
  await expect(page.getByTestId('create-file-button')).toBeVisible({ timeout: 15_000 });
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('create-file-button')).toBeVisible({ timeout: 15_000 });
}

/** Creates a file from the dashboard (answers the window.prompt) and waits for the editor. */
export async function createFileAndOpenEditor(page: Page, fileName: string): Promise<string> {
  page.once('dialog', (dialog) => void dialog.accept(fileName));
  await page.getByTestId('create-file-button').click();
  await expect(page.getByTestId('canvas-surface')).toBeVisible({ timeout: 20_000 });
  const url = page.url();
  const fileId = url.split('/file/')[1]!;
  expect(fileId).toBeTruthy();
  return fileId;
}

export async function waitForCollabConnected(page: Page): Promise<void> {
  await expect(page.getByTestId('collab-status')).toHaveAttribute('title', /connected/i, {
    timeout: 20_000,
  });
}

/** Draws a shape by dragging on the canvas with the given tool. */
export async function drawShape(
  page: Page,
  tool: 'rectangle' | 'ellipse' | 'frame' | 'line',
  from: { x: number; y: number },
  to: { x: number; y: number },
): Promise<void> {
  await page.getByTestId(`tool-${tool}`).click();
  const canvas = page.getByTestId('canvas-surface');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + from.x, box.y + from.y);
  await page.mouse.down();
  await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
  await page.mouse.up();
}

/** PNG screenshot of the canvas element, returned as a raw buffer. */
export async function canvasShot(page: Page): Promise<Buffer> {
  return page.getByTestId('canvas-surface').screenshot();
}
