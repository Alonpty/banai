import { clickComponent, expect, openDesigner, showInterior, test } from './fixtures.js';

const state = (page) => page.evaluate(() => {
  const { design, revision, selection, proposal, history } = window.__banai.store.getState();
  return { design, revision, selection, proposal, history };
});
const shelfY = (page, id) => page.evaluate((shelfId) => {
  for (const c of window.__banai.store.getState().design.compartments) {
    const shelf = c.shelves.find((s) => s.id === shelfId);
    if (shelf) return shelf.y;
  }
  return null;
}, id);

async function ask(page, text) {
  await page.getByTestId('chat-input').fill(text);
  await page.getByTestId('chat-input').press('Enter');
}

test.describe('UX: onboarding', () => {
  test('describing a wardrobe yields a previewed proposal that commits only on approval', async ({ page }) => {
    await openDesigner(page, { start: 'none' });
    await expect(page.getByRole('heading', { name: 'Design your wardrobe' })).toBeVisible();
    await page.locator('#start-prompt').fill('240 cm wide white wardrobe, 3 sections, hanging clothes on the left, drawers in the middle and shelves on the right');
    await page.getByRole('button', { name: 'Design with AI' }).click();
    await expect(page.locator('#start-screen')).toBeHidden();

    const card = page.getByTestId('proposal-card');
    await expect(card).toContainText('New wardrobe 240 × 240 × 60 cm, 3 sections');
    await expect(page.locator('#preview-badge')).toContainText('Previewing new design');
    // Not committed yet: the committed design is still the basic wardrobe at revision 1.
    let current = await state(page);
    expect(current.revision).toBe(1);
    expect(current.design.dimensions.width).toBe(2000);

    await page.getByTestId('proposal-apply').click();
    await expect(page.getByText('Changes applied')).toBeVisible();
    current = await state(page);
    expect(current.design.dimensions.width).toBe(2400);
    expect(current.revision).toBe(2);
    expect(current.proposal).toBeNull();
    await expect(page.locator('#preview-badge')).toBeHidden();
  });

  test('an empty description asks for input; "Start from basic wardrobe" opens the editor', async ({ page }) => {
    await openDesigner(page, { start: 'none' });
    await page.getByRole('button', { name: 'Design with AI' }).click();
    await expect(page.getByText('Describe your wardrobe first')).toBeVisible();
    await page.getByRole('button', { name: 'Start from basic wardrobe' }).click();
    await expect(page.locator('#start-screen')).toBeHidden();
  });
});

test.describe('UX: shared selection + assistant', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('selecting in 3D updates the inspector and the assistant context chip', async ({ page }) => {
    await showInterior(page);
    await clickComponent(page, 'shf_l2');
    await expect(page.locator('#inspector-heading')).toContainText('Shelf 2');
    await expect(page.locator('#inspector-heading')).toContainText('Left section');
    await expect(page.getByTestId('context-chip')).toHaveText('Selected:Shelf 2 · Left section');
    // Contextual: wardrobe-level fields are not shown for a shelf.
    await expect(page.getByTestId('dim-width')).toHaveCount(0);
    await page.getByTestId('context-chip').getByRole('button', { name: 'Clear selection' }).click();
    await expect(page.getByTestId('dim-width')).toBeVisible();
  });

  test('"move this 15 cm higher" previews on the selection and applies only on approval', async ({ page }) => {
    await showInterior(page);
    await clickComponent(page, 'shf_l2');
    await ask(page, 'Move this 15 cm higher');
    const card = page.getByTestId('proposal-card');
    await expect(card).toContainText('Move Shelf 2 · Left section to 95.0 cm');
    await expect(card).toContainText('Previewing in 3D');
    expect(await shelfY(page, 'shf_l2')).toBe(800); // committed state untouched
    // The 3D view shows the proposed position.
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('shf_l2').position.y)).toBeCloseTo(0.018 + 0.95 + 0.009, 3);
    await page.getByTestId('proposal-apply').click();
    await expect.poll(() => shelfY(page, 'shf_l2')).toBe(950);
    await expect(card).toContainText('Applied');
  });

  test('cancel discards a proposal and restores the normal view', async ({ page }) => {
    await page.getByTestId('nav-1').click();
    await ask(page, 'add 2 drawers');
    await expect(page.locator('#preview-badge')).toContainText('Added');
    const before = await state(page);
    await page.getByTestId('preview-cancel').click();
    await expect(page.getByText('Suggestion cancelled. Nothing was changed.')).toBeVisible();
    const after = await state(page);
    expect(after.design).toEqual(before.design);
    expect(after.revision).toBe(before.revision);
    expect(after.proposal).toBeNull();
  });

  test('a manual edit while a proposal is pending makes it stale (cannot overwrite)', async ({ page }) => {
    await page.getByTestId('nav-2').click();
    await ask(page, 'add a shelf');
    await expect(page.getByTestId('proposal-apply')).toBeVisible();
    await page.getByTestId('compartment-width').fill('60');
    await page.getByTestId('compartment-width').press('Enter');
    await expect(page.getByText('The design changed after this suggestion')).toBeVisible();
    await expect(page.getByTestId('proposal-apply')).toHaveCount(0);
    expect((await state(page)).design.compartments[2].shelves).toHaveLength(2);
  });

  test('clarifies when "this" has no selection', async ({ page }) => {
    await ask(page, 'move this 10 cm lower');
    await expect(page.getByText('Click it in the 3D view first')).toBeVisible();
    expect((await state(page)).proposal).toBeNull();
  });
});

test.describe('UX: workspace tools', () => {
  test.beforeEach(async ({ page }) => openDesigner(page));

  test('undo and redo cover manual edits and applied suggestions', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await page.getByTestId('dim-width').fill('240');
    await page.getByTestId('dim-width').press('Enter');
    await expect.poll(async () => (await state(page)).design.dimensions.width).toBe(2400);
    await ask(page, 'sliding doors');
    await page.getByTestId('proposal-apply').click();
    await expect.poll(async () => (await state(page)).design.doors.type).toBe('sliding');

    await page.getByRole('button', { name: 'Undo' }).click();
    expect((await state(page)).design.doors.type).toBe('hinged');
    await page.locator('#viewer canvas').focus();
    await page.keyboard.press('Control+z');
    expect((await state(page)).design.dimensions.width).toBe(2000);
    await page.getByRole('button', { name: 'Redo' }).click();
    expect((await state(page)).design.dimensions.width).toBe(2400);
  });

  test('clicking a door opens it with an animation and clicking again closes it (no design edit)', async ({ page }) => {
    const { revision } = await state(page);
    const rotation = () => page.evaluate(() => window.__banai.viewer.meshOf('dr_middle').rotation.y);
    await clickComponent(page, 'dr_middle');
    expect((await state(page)).selection).toEqual({ id: 'dr_middle', kind: 'door' });
    expect(await page.evaluate(() => window.__banai.viewer.isDoorOpen('dr_middle'))).toBe(true);
    await expect.poll(rotation).toBeGreaterThan(1.7); // ~100° once the swing settles
    await clickComponent(page, 'dr_middle');
    await expect.poll(rotation).toBe(0);
    expect((await state(page)).revision).toBe(revision); // purely visual
  });

  test('the room style (wall colour, floor) changes the view, not the design', async ({ page }) => {
    const { revision } = await state(page);
    await page.getByTestId('room-button').click();
    await page.getByRole('button', { name: 'Sage walls' }).click();
    await page.getByTestId('floor-walnut').click();
    expect(await page.evaluate(() => window.__banai.store.getState().ui.room)).toEqual({ wall: '#c6d0bd', floor: 'walnut' });
    await expect(page.getByTestId('floor-walnut')).toHaveAttribute('aria-pressed', 'true');
    expect((await state(page)).revision).toBe(revision);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('room-panel')).toBeHidden();
    await page.reload(); // remembered per browser
    await page.waitForFunction(() => window.__banai?.store.getState().ui.room.floor === 'walnut');
  });

  test('a door can be switched to a mirror front, rendered as reflective glass, and back', async ({ page }) => {
    await clickComponent(page, 'dr_left');
    await page.getByTestId('door-front').getByRole('button', { name: 'Mirror' }).click();
    const material = () => page.evaluate(() => window.__banai.store.getState().design.doors.items[0].appearance?.material);
    await expect.poll(material).toEqual({ catalogId: 'mirror' });
    await expect.poll(() => page.evaluate(() => window.__banai.viewer.meshOf('dr_left').material.metalness)).toBe(1);
    await page.getByTestId('door-front').getByRole('button', { name: 'Panel' }).click();
    await expect.poll(material).toEqual({ catalogId: 'melamine' });
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect.poll(material).toEqual({ catalogId: 'mirror' });
  });

  test('the structure strip selects sections', async ({ page }) => {
    await page.getByTestId('nav-1').click();
    expect((await state(page)).selection).toEqual({ id: 'cmp_middle', kind: 'compartment' });
    await expect(page.locator('#inspector-heading')).toContainText('Middle section');
    await expect(page.getByTestId('nav-1')).toHaveAttribute('aria-pressed', 'true');
  });

  test('side panels collapse and the 3D view grows', async ({ page }) => {
    const width = () => page.locator('#viewer').evaluate((node) => node.clientWidth);
    const before = await width();
    await page.getByRole('button', { name: 'Collapse assistant' }).click();
    await page.getByRole('button', { name: 'Collapse inspector' }).click();
    await expect.poll(width).toBeGreaterThan(before + 400);
    await page.getByRole('button', { name: 'Expand assistant' }).click();
    await expect(page.getByTestId('chat-input')).toBeVisible();
  });

  test('the dimensions toggle hides and shows labels', async ({ page }) => {
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
    await page.getByTestId('view-dimensions').click();
    await expect(page.getByText('W 200.0 cm', { exact: true })).toHaveCount(0);
    await page.getByTestId('view-dimensions').click();
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
  });

  test('duplicate copies the selected shelf into its section', async ({ page }) => {
    await showInterior(page);
    await clickComponent(page, 'shf_r1');
    await page.getByTestId('duplicate-selected').click();
    await expect.poll(async () => (await state(page)).design.compartments[2].shelves.length).toBe(3);
  });

  test('share and room preview open honest "coming soon" dialogs without changing the design', async ({ page }) => {
    const before = await state(page);
    await page.getByRole('button', { name: 'Share' }).click();
    await expect(page.getByRole('dialog')).toContainText('Share your design');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Preview in room' }).click();
    await expect(page.getByRole('dialog')).toContainText('The 3D design and dimensions remain unchanged.');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    expect((await state(page)).revision).toBe(before.revision);
  });
});
