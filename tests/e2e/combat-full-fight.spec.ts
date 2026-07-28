import { expect, test, type Page, type TestInfo } from '@playwright/test';

const targetCheckbox = (page: Page, selectorTestId: string, name: string) =>
  page.getByTestId(selectorTestId).locator(`[data-token-name="${name}"] input[type="checkbox"]`);

async function openCombat(page: Page, role: 'dm' | 'player' | 'spectator') {
  await page.goto(`?role=${role}`);
  await page.getByTestId('combat-launcher').click();
}

async function seedEncounter(dm: Page) {
  await openCombat(dm, 'dm');
  await dm.getByTestId('new-encounter').click();
  await dm.getByTestId('encounter-name').fill('Guided Combat QA');
  await dm.getByLabel('Campaign (optional)').selectOption('campaign-qa');
  await dm.getByTestId('create-encounter').click();
  await dm.getByTestId('open-setup').click();
  await dm.getByLabel('Status').selectOption('active');

  await dm.getByLabel('Vault character').selectOption('character-tarrasque');
  await dm.getByLabel('Assigned player').selectOption('');
  await dm.getByLabel('Combat team').selectOption('enemies');
  await dm.getByTestId('add-vault-character').click();
  await expect(dm.locator('.setup-token-list')).toContainText('Tarrasque');

  await dm.getByLabel('Vault character').selectOption('character-qa-titan');
  await dm.getByLabel('Assigned player').selectOption('user-player');
  await dm.getByLabel('Combat team').selectOption('heroes');
  await dm.getByTestId('add-vault-character').click();
  await expect(dm.locator('.setup-token-list')).toContainText('Combat QA Titan');

  await dm.getByLabel('Assigned player').selectOption('user-spectator');
  await dm.getByLabel('Combat team').selectOption('heroes');
  await dm.getByTestId('npc-name').fill('QA Observer');
  await dm.getByTestId('npc-hp').fill('100');
  await dm.getByTestId('add-npc').click();
  await dm.getByTestId('setup-done').click();
  await expect(dm.getByTitle(/Tarrasque/)).toBeVisible();
}

async function openSeededEncounter(page: Page, role: 'dm' | 'player' | 'spectator') {
  await openCombat(page, role);
  await page.getByText('Guided Combat QA', { exact: true }).click();
}

async function chooseAbility(page: Page, category: string, abilityTestId: string) {
  await page.getByTestId(`action-category-${category}`).click();
  await page.getByTestId(abilityTestId).click();
  await expect(page.getByTestId('action-detail')).toBeVisible();
  await page.getByTestId('guided-continue').click();
}

async function screenshot(page: Page, testInfo: TestInfo, label: string) {
  const path = testInfo.outputPath(`${label}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(label, { path, contentType: 'image/png' });
}

test('guided command flow separates decisions and resolves structured sources atomically', async ({ browser, request }, testInfo) => {
  test.setTimeout(120_000);
  await request.post('http://127.0.0.1:4184/reset');
  const dmContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const playerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const dm = await dmContext.newPage();
  const player = await playerContext.newPage();
  const browserErrors: string[] = [];
  dm.on('pageerror', (error) => browserErrors.push(`DM: ${error.message}`));
  player.on('pageerror', (error) => browserErrors.push(`Player: ${error.message}`));

  try {
    await seedEncounter(dm);
    await openSeededEncounter(player, 'player');
    await player.getByTestId('combat-tab-actions').click();

    await expect(player.getByTestId('guided-command-menu')).toBeVisible();
    await expect(player.getByTestId('action-category-action')).toContainText('Available');
    await expect(player.getByTestId('action-category-bonus')).toContainText('Available');
    await expect(player.getByTestId('action-category-legendary')).toContainText('3 of 3 remaining');
    await expect(player.getByTestId('attack-calculator')).toHaveCount(0);
    await screenshot(player, testInfo, 'guided-command-menu');

    await chooseAbility(player, 'action', 'ability-qa-prismatic-cleaver');
    await expect(player.getByRole('heading', { name: 'Who is affected?' })).toBeVisible();
    await targetCheckbox(player, 'action-target-selector', 'Tarrasque').check();
    await expect(player.getByTestId('map-token-tokens-0004')).toHaveClass(/targeted/);
    await expect(player.getByTestId('map-token-tokens-0004')).toHaveAttribute('aria-label', /target 1/);
    await player.getByTestId('guided-next').click();

    await expect(player.getByTestId('attack-calculator')).toBeVisible();
    await expect(player.getByTestId('damage-calculator')).toHaveCount(0);
    await expect(player.getByLabel('Suggested outcome')).toHaveValue('awaiting_dm');
    await player.getByTestId('roll-attack').click();
    await expect(player.getByLabel('Final attack total')).not.toHaveValue('');
    await player.getByTestId('guided-next').click();

    await expect(player.getByTestId('damage-calculator')).toBeVisible();
    await expect(player.getByTestId('attack-calculator')).toHaveCount(0);
    await player.getByTestId('roll-all-damage').click();
    await player.getByRole('button', { name: 'Add Dice' }).click();
    await player.getByRole('button', { name: 'Add Flat Bonus' }).click();
    const damageCards = player.locator('.guided-damage-components article');
    await expect(damageCards).toHaveCount(5);
    await damageCards.nth(3).getByLabel('Source or reason').fill('Divine Smite');
    await damageCards.nth(3).getByRole('button', { name: /Roll component/ }).click();
    await damageCards.nth(4).getByLabel('Source or reason').fill('Homebrew feature');
    await damageCards.nth(4).getByLabel('Manual subtotal override').fill('5');
    await expect(player.getByTestId('submitted-damage')).not.toHaveText('0');
    await player.getByTestId('guided-next').click();

    await expect(player.getByRole('heading', { name: 'Add optional effects' })).toBeVisible();
    await expect(player.getByRole('textbox', { name: 'Description', exact: true })).toHaveValue('Marked');
    await player.getByTestId('guided-next').click();
    await expect(player.getByTestId('guided-review')).toContainText('Prismatic Cleaver');
    await expect(player.getByTestId('guided-review')).toContainText('deducted only if DM resolves');
    await expect(player.getByTestId('actor-summary')).toContainText('QA Charges 5/5');
    await screenshot(player, testInfo, 'guided-review-before-submit');
    await player.getByTestId('submit-proposal').click();
    await expect(player.getByTestId('guided-submitted')).toContainText('No resource has been spent yet');
    await expect(player.getByTestId('actor-summary')).toContainText('QA Charges 5/5');

    await dm.getByTestId('combat-tab-proposals').click();
    await expect(dm.getByTestId('dm-source-breakdown')).toContainText('Structured source breakdown');
    await expect(dm.getByTestId('dm-source-breakdown')).toContainText('Divine Smite');
    const firstComponent = dm.getByTestId('dm-source-breakdown').getByLabel(/DM final Prismatic Cleaver/).first();
    await firstComponent.fill('42');
    await dm.getByRole('button', { name: 'Apply edited component totals to targets' }).click();
    const tarrasqueReview = dm.getByTestId('proposal-target-tokens-0004');
    await expect(tarrasqueReview.getByLabel('Damage')).not.toHaveValue('');
    await tarrasqueReview.getByRole('button', { name: 'Half damage' }).click();
    await screenshot(dm, testInfo, 'dm-structured-source-review');
    await dm.getByTestId('resolve-all').click();

    await player.getByTestId('combat-tab-actions').click();
    await expect(player.getByTestId('actor-summary')).toContainText('QA Charges 4/5');
    await dm.getByTestId('combat-tab-dm').click();
    await dm.getByTestId('undo-latest').click();
    await player.getByTestId('combat-tab-actions').click();
    await expect(player.getByTestId('actor-summary')).toContainText('QA Charges 5/5');

    await player.getByRole('button', { name: 'Choose another command' }).click();
    await chooseAbility(player, 'bonus', 'ability-qa-aegis-buffer');
    await expect(player.getByRole('heading', { name: 'Who is affected?' })).toBeVisible();
    await player.getByTestId('guided-next').click();
    await expect(player.getByTestId('temp-hp-calculator')).toBeVisible();
    await expect(player.getByTestId('healing-calculator')).toHaveCount(0);
    await player.getByRole('button', { name: 'Roll temporary HP' }).click();
    await player.getByTestId('guided-next').click();
    await expect(player.getByTestId('guided-review')).toContainText('Temporary HP');
    await player.getByTestId('guided-cancel').click();
    await player.getByTestId('guided-cancel').click();
    await expect(player.getByTestId('guided-command-menu')).toBeVisible();

    await chooseAbility(player, 'action', 'ability-qa-gravity-wave');
    await targetCheckbox(player, 'action-target-selector', 'Tarrasque').check();
    await player.getByTestId('guided-next').click();
    await expect(player.getByRole('heading', { name: 'Place the area template' })).toBeVisible();
    await expect(player.locator('.area-template')).toBeVisible();
    await player.getByTestId('guided-next').click();
    await expect(player.getByTestId('saving-throw-calculator')).toBeVisible();
    await player.getByTestId('save-target-tokens-0004').getByLabel('Suggested result').selectOption('failure');
    await player.getByTestId('guided-next').click();
    await expect(player.getByTestId('damage-calculator')).toBeVisible();

    await player.setViewportSize({ width: 390, height: 844 });
    await player.getByRole('button', { name: /Combat panel/ }).click();
    await expect(player.getByTestId('guided-next')).toBeInViewport();
    await screenshot(player, testInfo, 'guided-mobile-damage-step');
    expect(browserErrors).toEqual([]);
  } finally {
    await dmContext.close();
    await playerContext.close();
  }
});

test('Tarrasque multiattack remains five editable attacks in one proposal', async ({ browser, request }, testInfo) => {
  test.setTimeout(120_000);
  await request.post('http://127.0.0.1:4184/reset');
  const dmContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const dm = await dmContext.newPage();
  const browserErrors: string[] = [];
  dm.on('pageerror', (error) => browserErrors.push(error.message));

  try {
    await seedEncounter(dm);
    await dm.getByTestId('combat-tab-actions').click();
    await expect(dm.getByTestId('actor-summary').getByLabel('Acting combatant')).toHaveValue('tokens-0004');
    await chooseAbility(dm, 'action', 'ability-tarrasque-multiattack');
    await expect(dm.getByTestId('multiattack-builder')).toBeVisible();
    await expect(dm.locator('[data-testid^="multiattack-entry-"]')).toHaveCount(5);
    await expect(dm.getByTestId('multiattack-entry-0').getByLabel('Attack 1 name')).toHaveValue('Bite');
    await expect(dm.getByTestId('multiattack-entry-1').getByLabel('Attack 2 name')).toHaveValue('Claw');
    await expect(dm.getByTestId('multiattack-entry-4').getByLabel('Attack 5 name')).toHaveValue('Tail');

    for (let index = 0; index < 5; index += 1) {
      const entry = dm.getByTestId(`multiattack-entry-${index}`);
      await entry.getByLabel('Target').selectOption(index < 3 ? 'tokens-0006' : 'tokens-0008');
      await entry.getByRole('button', { name: 'Roll attack' }).click();
      await entry.locator('.multiattack-damage button').first().click();
    }
    await dm.getByTestId('multiattack-entry-2').getByLabel('Suggested outcome').selectOption('miss');
    await dm.getByTestId('guided-next').click();
    await expect(dm.getByTestId('guided-review')).toContainText('Individual attacks');
    await expect(dm.getByTestId('guided-review').locator('.review-multiattack article')).toHaveCount(5);
    await screenshot(dm, testInfo, 'tarrasque-five-entry-multiattack');
    await dm.getByTestId('submit-proposal').click();
    await expect(dm.getByTestId('guided-submitted')).toBeVisible();

    await dm.getByTestId('combat-tab-proposals').click();
    await expect(dm.getByTestId('dm-source-breakdown')).toContainText('Individual attacks');
    await expect(dm.getByTestId('dm-source-breakdown').locator('.dm-multiattack-review article')).toHaveCount(5);
    await dm.getByTestId('dm-source-breakdown').getByLabel('DM outcome').nth(1).selectOption('miss');
    await dm.getByTestId('dm-source-breakdown').getByRole('spinbutton', { name: /1\. Bite/ }).fill('40');
    await dm.getByRole('button', { name: 'Apply edited component totals to targets' }).click();
    await expect(dm.getByTestId('proposal-target-tokens-0006').getByLabel('Damage')).not.toHaveValue('');
    await dm.getByTestId('resolve-all').click();
    await dm.getByTestId('combat-tab-dm').click();
    await dm.getByTestId('undo-latest').click();

    expect(browserErrors).toEqual([]);
  } finally {
    await dmContext.close();
  }
});
