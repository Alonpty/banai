import { clickComponent, expect, openDesigner, selection, test } from './fixtures.js';

const measure = (page) => page.evaluate(() => window.__banai.store.getState().ui.measure);
const revision = (page) => page.evaluate(() => window.__banai.store.getState().revision);

test.describe('measuring tool (vertical distance between two parts)', () => {
  test.beforeEach(async ({ page }) => {
    await openDesigner(page);
    await page.getByLabel('Show interior').check();
    await page.getByLabel('Measure').check();
  });

  test('two clicks in 3D show the clear gap between two shelves, computed from the design', async ({ page }) => {
    await expect(page.locator('.dim-label--measure')).toHaveText('Measure: pick a part');
    await clickComponent(page, 'shf_l1');
    await expect(page.locator('.dim-label--measure')).toHaveText('Pick a second part');
    await clickComponent(page, 'shf_l2');
    expect((await measure(page)).ids).toEqual(['shf_l1', 'shf_l2']);
    // 80.0 cm shelf bottom minus (40.0 cm + 1.8 cm) shelf top.
    await expect(page.locator('.dim-label--measure')).toHaveText('Gap 38.2 cm');
    await expect(page.getByTestId('measure-result')).toHaveText('Compartment 1 · Shelf 1 → Compartment 1 · Shelf 2: clear gap 38.2 cm · centres 40.0 cm apart.');
    // Measuring selects nothing and changes nothing.
    expect(await selection(page)).toBeNull();
    expect(await revision(page)).toBe(1);
  });

  test('a manual edit moves the measurement with the design (state, not mesh)', async ({ page }) => {
    await clickComponent(page, 'shf_l1');
    await clickComponent(page, 'shf_l2');
    const result = await page.evaluate(() => window.__banai.store.dispatch([{ op: 'modify_shelf', id: 'shf_l2', y: 1000 }]));
    expect(result.ok).toBe(true);
    await expect(page.locator('.dim-label--measure')).toHaveText('Gap 58.2 cm');
  });

  test('the keyboard path: All parts picks parts while measuring; Clear and Done reset', async ({ page }) => {
    await page.getByTestId('part-shf_l1').click();
    await page.getByTestId('part-shf_l2').click();
    await expect(page.getByTestId('measure-result')).toContainText('clear gap 38.2 cm');
    expect(await selection(page)).toBeNull();
    await page.getByTestId('measure-clear').click();
    expect((await measure(page)).ids).toEqual([]);
    await expect(page.getByTestId('measure-result')).toHaveText('Pick the first part.');
    await page.getByTestId('measure-done').click();
    await expect(page.getByLabel('Measure')).not.toBeChecked();
    await expect(page.getByTestId('measure-section')).toHaveCount(0);
    // Back to normal: a click selects again.
    await clickComponent(page, 'shf_l1');
    expect(await selection(page)).toEqual({ id: 'shf_l1', kind: 'shelf' });
  });

  test('a third pick starts a new measurement; a removed part is dropped', async ({ page }) => {
    await clickComponent(page, 'shf_l1');
    await clickComponent(page, 'shf_l2');
    await clickComponent(page, 'shf_l3');
    expect((await measure(page)).ids).toEqual(['shf_l3']);
    await page.evaluate(() => window.__banai.store.dispatch([{ op: 'remove_component', id: 'shf_l3' }]));
    expect((await measure(page)).ids).toEqual([]);
  });
});
