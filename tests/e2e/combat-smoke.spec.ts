import { expect, test } from '@playwright/test';

test('DM can create and configure an isolated combat encounter', async ({ page, request }) => {
  await request.post('http://127.0.0.1:4184/reset');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('?role=dm');
  await page.getByTestId('combat-launcher').click();
  await page.getByTestId('new-encounter').click();
  await page.getByTestId('encounter-name').fill('Tarrasque Full Fight QA');
  await page.getByLabel('Campaign (optional)').selectOption('campaign-qa');
  await page.getByTestId('create-encounter').click();

  await expect(page.getByText('Tarrasque Full Fight QA')).toBeVisible();
  await page.getByTestId('open-setup').click();
  await expect(page.getByRole('heading', { name: 'Encounter setup' })).toBeVisible();

  await page.getByLabel('Vault character').selectOption('character-tarrasque');
  await page.getByLabel('Assigned player').selectOption('');
  await page.getByLabel('Combat team').selectOption('enemies');
  await page.getByTestId('add-vault-character').click();
  await expect(page.getByTestId('add-vault-character')).toBeEnabled();
  await expect(page.locator('.setup-token-list')).toContainText('Tarrasque');

  await page.getByLabel('Vault character').selectOption('character-qa-titan');
  await page.getByLabel('Assigned player').selectOption('user-player');
  await page.getByLabel('Combat team').selectOption('heroes');
  await expect(page.getByLabel('Vault character')).toHaveValue('character-qa-titan');
  await page.getByTestId('add-vault-character').click();
  await expect(page.getByTestId('add-vault-character')).toBeEnabled();
  await expect(page.locator('.setup-token-list')).toContainText('Combat QA Titan');

  await page.getByTestId('setup-done').click();
  await expect(page.getByTitle(/Tarrasque —/)).toBeVisible();
  await expect(page.getByTitle(/Combat QA Titan —/)).toBeVisible();
  expect(errors).toEqual([]);
});
