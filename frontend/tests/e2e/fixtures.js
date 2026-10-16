import { test as base, expect } from '@playwright/test';

// Every E2E test fails on uncaught page errors or console errors.
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(`console: ${message.text()}`);
    });
    await use(page);
    expect(problems, problems.join('\n')).toEqual([]);
  },
});

export { expect };

export async function openDesigner(page, { start = 'basic' } = {}) {
  await page.goto('/');
  await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  if (start === 'basic') await page.getByRole('button', { name: 'Start from basic wardrobe' }).click();
}

/** Switch the 3D view to the interior (doors hidden). */
export const showInterior = (page) => page.getByTestId('view-interior').click();

export const selection = (page) => page.evaluate(() => window.__banai.store.getState().selection);

export async function clickComponent(page, componentId) {
  await page.waitForFunction(() => {
    const { camera } = window.__banai.viewer;
    const key = camera.position.toArray().map((v) => v.toFixed(5)).join();
    const settled = window.__lastCameraKey === key;
    window.__lastCameraKey = key;
    return settled;
  }, null, { polling: 100 });
  const point = await page.evaluate((id) => window.__banai.viewer.screenPointOf(id), componentId);
  await page.mouse.click(point.x, point.y);
}

/** Share of canvas pixels that are drawn (the canvas background is transparent). */
export const paintedRatio = (page) => page.evaluate(() => {
  const source = document.querySelector('#viewer canvas');
  const copy = document.createElement('canvas');
  copy.width = source.width;
  copy.height = source.height;
  const context = copy.getContext('2d');
  context.drawImage(source, 0, 0);
  const { data } = context.getImageData(0, 0, copy.width, copy.height);
  let painted = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) painted += 1;
  }
  return painted / (data.length / 4);
});
