import { test, expect, openDesigner } from './fixtures.js';

test.describe('start screen', () => {
  test('is shown first with three entry points and the manufacturing disclaimer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Design your wardrobe' })).toBeVisible();
    for (const id of ['guided', 'freeText', 'basic']) await expect(page.getByTestId(`entry-${id}`)).toBeVisible();
    await expect(page.getByText('not manufacturing drawings')).toBeVisible();
  });

  test('Escape does not dismiss it (a choice is required)', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('start-screen').waitFor();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('start-screen')).toBeVisible();
  });

  test('"Start from a basic wardrobe" opens the editor with the default wardrobe', async ({ page }) => {
    await openDesigner(page);
    await expect(page.getByTestId('start-screen')).toHaveCount(0);
    await expect(page.getByText('W 200.0 cm', { exact: true })).toBeVisible();
  });

  test('"Describe it" opens the same editor and focuses the chat composer', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('entry-freeText').click();
    await expect(page.getByTestId('chat-input')).toBeFocused();
    await expect(page.getByTestId('chat-input')).toHaveAttribute('placeholder', /240 cm wide/);
    await page.waitForFunction(() => window.__banai?.viewer.meshOf('shf_l1'));
  });
});

test.describe('AI chat panel (agent not connected yet)', () => {
  test('sending a message gets an honest reply and never changes the design', async ({ page }) => {
    await openDesigner(page);
    const before = await page.evaluate(() => window.__banai.store.getState().revision);
    await page.getByTestId('chat-input').fill('make it 3 m wide');
    await page.getByTestId('chat-send').click();
    const messages = page.getByTestId('chat-messages');
    await expect(messages).toContainText('make it 3 m wide');
    await expect(messages).toContainText("isn't connected yet");
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(before);
  });

  test('a proposal shows Confirm/Cancel, goes stale after a manual edit, and Cancel changes nothing', async ({ page }) => {
    await openDesigner(page);
    await page.evaluate(() => {
      const { chat, store } = window.__banai;
      chat.setProposal({
        id: 'demo', baseRevision: store.getState().revision, summary: 'Widen the wardrobe',
        changes: [{ title: 'Width', detail: '200.0 cm to 240.0 cm' }],
      });
    });
    const card = page.getByTestId('proposal-card');
    await expect(card).toContainText('Proposed changes');
    await expect(page.getByTestId('proposal-confirm')).toBeEnabled();

    await page.getByTestId('dim-width').fill('210');
    await page.getByTestId('dim-width').press('Enter');
    await expect(card).toContainText('Design changed. Ask the agent to re-propose.');
    await expect(page.getByTestId('proposal-confirm')).toBeDisabled();

    const revision = await page.evaluate(() => window.__banai.store.getState().revision);
    await page.getByTestId('proposal-cancel').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('chat-messages')).toContainText('No changes were made');
    expect(await page.evaluate(() => window.__banai.store.getState().revision)).toBe(revision);
  });
});

test.describe('save and render dialogs (backend phases not built yet)', () => {
  test('Save opens a dialog that is honest about being unavailable, with no fake link', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-save').click();
    const dialog = page.getByTestId('save-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Saving is not available yet');
    await expect(page.getByTestId('share-link')).toHaveValue('');
    await expect(page.getByTestId('save-confirm')).toBeDisabled();
    await page.getByTestId('save-close').click();
    await expect(dialog).toBeHidden();
  });

  test('Render opens a dialog labelled as illustrative, with generation disabled', async ({ page }) => {
    await openDesigner(page);
    await page.getByTestId('open-render').click();
    const dialog = page.getByTestId('render-dialog');
    await expect(dialog).toContainText('Illustrative image, not the accurate 3D model');
    await expect(page.getByTestId('render-generate')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});
