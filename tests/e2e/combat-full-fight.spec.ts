import { expect, test, type Browser, type Page, type TestInfo } from '@playwright/test';

const targetCheckbox = (page: Page, selectorTestId: string, name: string) =>
  page.getByTestId(selectorTestId).locator(`[data-token-name="${name}"] input[type="checkbox"]`);

async function openCombat(page: Page, role: 'dm' | 'player' | 'spectator') {
  await page.goto(`?role=${role}`);
  await page.getByTestId('combat-launcher').click();
}

async function seedEncounter(dm: Page) {
  await openCombat(dm, 'dm');
  await dm.getByTestId('new-encounter').click();
  await dm.getByTestId('encounter-name').fill('Tarrasque Full Fight QA');
  await dm.getByLabel('Campaign (optional)').selectOption('campaign-qa');
  await dm.getByTestId('create-encounter').click();
  await dm.getByTestId('open-setup').click();

  await dm.getByLabel('Status').selectOption('active');
  await dm.getByLabel('Vault character').selectOption('character-tarrasque');
  await dm.getByLabel('Assigned player').selectOption('');
  await dm.getByLabel('Combat team').selectOption('enemies');
  await dm.getByTestId('add-vault-character').click();
  await expect(dm.getByTestId('add-vault-character')).toBeEnabled();
  await expect(dm.locator('.setup-token-list')).toContainText('Tarrasque');

  await dm.getByLabel('Vault character').selectOption('character-qa-titan');
  await dm.getByLabel('Assigned player').selectOption('user-player');
  await dm.getByLabel('Combat team').selectOption('heroes');
  await expect(dm.getByLabel('Vault character')).toHaveValue('character-qa-titan');
  await expect(dm.getByLabel('Assigned player')).toHaveValue('user-player');
  await dm.getByTestId('add-vault-character').click();
  await expect(dm.getByTestId('add-vault-character')).toBeEnabled();
  await expect(dm.locator('.setup-token-list')).toContainText('Combat QA Titan');

  await dm.getByLabel('Assigned player').selectOption('user-spectator');
  await dm.getByLabel('Combat team').selectOption('heroes');
  await dm.getByTestId('npc-name').fill('QA Observer');
  await dm.getByTestId('npc-hp').fill('100');
  await dm.getByTestId('add-npc').click();
  await expect(dm.getByTestId('add-npc')).toBeEnabled();
  await expect(dm.locator('.setup-token-list')).toContainText('QA Observer');
  await dm.getByTestId('setup-done').click();

  await expect(dm.getByTitle(/Tarrasque — 676\/676 HP/)).toBeVisible();
  await expect(dm.getByTitle(/Combat QA Titan — 720\/720 HP/)).toBeVisible();
  await expect(dm.getByTitle(/QA Observer — 100\/100 HP/)).toBeVisible();
}

async function screenshot(page: Page, testInfo: TestInfo, label: string) {
  const path = testInfo.outputPath(`${label}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(label, { path, contentType: 'image/png' });
}

test('complete three-user, multi-round combat playtest', async ({ browser, request }, testInfo) => {
  await request.post('http://127.0.0.1:4184/reset');
  const dmContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const playerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const spectatorContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dm = await dmContext.newPage();
  const player = await playerContext.newPage();
  const spectator = await spectatorContext.newPage();
  const browserErrors: string[] = [];
  for (const page of [dm, player, spectator]) {
    page.on('pageerror', (error) => browserErrors.push(`${page.url()}: ${error.message}`));
  }

  try {
    await seedEncounter(dm);

    await openCombat(player, 'player');
    await player.getByText('Tarrasque Full Fight QA', { exact: true }).click();
    await expect(player.getByTestId('combat-tab-dm')).toHaveCount(0);
    await expect(player.getByText('Combat QA Titan', { exact: true }).first()).toBeVisible();

    await openCombat(spectator, 'spectator');
    await spectator.getByText('Tarrasque Full Fight QA', { exact: true }).click();
    await expect(spectator.getByTestId('combat-tab-dm')).toHaveCount(0);
    await spectator.getByTestId('combat-tab-actions').click();
    await expect(spectator.getByTestId('actor-summary').getByLabel('Acting combatant')).toHaveValue(/.+/);
    await expect(spectator.getByTestId('actor-summary').getByLabel('Acting combatant').locator('option:checked')).toHaveText('QA Observer');
    const unauthorizedToken = spectator.getByTestId('map-token-tokens-0004');
    const unauthorizedStyle = await unauthorizedToken.getAttribute('style');
    const unauthorizedBox = await unauthorizedToken.boundingBox();
    if (!unauthorizedBox) throw new Error('Unauthorized token did not have a bounding box.');
    await spectator.mouse.move(unauthorizedBox.x + 10, unauthorizedBox.y + 10);
    await spectator.mouse.down();
    await spectator.mouse.move(unauthorizedBox.x + 140, unauthorizedBox.y + 90);
    await spectator.mouse.up();
    await expect(unauthorizedToken).toHaveAttribute('style', unauthorizedStyle ?? '');

    await dm.getByTestId('combat-tab-proposals').click();
    await expect(dm.getByTestId('proposals-empty')).toContainText('No proposals are awaiting review');
    await dm.getByTestId('combat-tab-reactions').click();
    await expect(dm.getByTestId('reactions-empty')).toContainText('No reaction window is currently open');
    await dm.getByTestId('combat-tab-chat').click();
    await expect(dm.getByTestId('chat-panel')).toContainText('No combat history yet');
    await dm.getByTestId('combat-tab-dm').click();
    await expect(dm.getByTestId('dm-target-selector')).toBeVisible();
    await dm.getByTestId('combat-tab-actions').click();
    await dm.getByTestId('action-category-bonus').click();
    await expect(dm.getByText('This character has no recorded bonus actions.')).toBeVisible();
    await dm.getByTestId('action-category-lair').click();
    await expect(dm.getByText('No lair actions are recorded.')).toBeVisible();
    await dm.getByTestId('combat-tab-turns').click();

    await dm.getByLabel('Tarrasque initiative').fill('25');
    await dm.getByLabel('Combat QA Titan initiative').fill('18');
    await dm.getByLabel('QA Observer initiative').fill('10');
    await expect(player.getByTestId('initiative-row-tokens-0004')).toContainText('Tarrasque');

    await dm.getByTestId('initiative-row-tokens-0004').click();
    await expect(dm.getByTestId('map-token-tokens-0004')).toHaveClass(/selected/);
    await dm.getByTestId('initiative-row-tokens-0006').click();
    await expect(dm.getByTestId('map-token-tokens-0006')).toHaveClass(/selected/);

    const tarrasque = dm.getByTitle(/Tarrasque — 676\/676 HP/);
    const beforeMove = await tarrasque.boundingBox();
    if (!beforeMove) throw new Error('Tarrasque map token did not have a bounding box.');
    await dm.mouse.move(beforeMove.x + beforeMove.width / 2, beforeMove.y + beforeMove.height / 2);
    await dm.mouse.down();
    await dm.mouse.move(beforeMove.x + beforeMove.width + 75, beforeMove.y + beforeMove.height + 45);
    await dm.mouse.up();
    await expect(dm.getByText(/Moved Tarrasque|Tarrasque/).first()).toBeVisible();

    const titanMapToken = dm.getByTestId('map-token-tokens-0006');
    const titanBeforeMove = await titanMapToken.boundingBox();
    if (!titanBeforeMove) throw new Error('Combat QA Titan map token did not have a bounding box.');
    await dm.mouse.move(titanBeforeMove.x + titanBeforeMove.width / 2, titanBeforeMove.y + titanBeforeMove.height / 2);
    await dm.mouse.down();
    await dm.mouse.move(titanBeforeMove.x + titanBeforeMove.width + 110, titanBeforeMove.y + titanBeforeMove.height + 60);
    await dm.mouse.up();

    await dm.getByRole('button', { name: 'Select Targets' }).click();
    await dm.getByTestId('map-token-tokens-0004').click();
    await dm.getByTestId('map-token-tokens-0006').click();
    await expect(dm.getByTestId('map-token-tokens-0004')).toHaveClass(/targeted/);
    await expect(dm.getByTestId('map-token-tokens-0006')).toHaveClass(/targeted/);
    await dm.getByTestId('combat-tab-actions').click();
    await expect(targetCheckbox(dm, 'action-target-selector', 'Tarrasque')).toBeChecked();
    await expect(targetCheckbox(dm, 'action-target-selector', 'Combat QA Titan')).toBeChecked();
    await dm.getByRole('button', { name: 'Clear Targets' }).click();
    await expect(dm.getByTestId('map-token-tokens-0004')).not.toHaveClass(/targeted/);

    await player.getByTestId('combat-tab-actions').click();
    await expect(player.getByTestId('actor-summary')).toContainText('Combat QA Titan');
    await expect(player.getByTestId('action-category-action')).toContainText('5');
    await expect(player.getByTestId('action-category-bonus')).toContainText('2');
    await expect(player.getByTestId('action-category-reaction')).toContainText('2');
    await expect(player.getByTestId('action-category-legendary')).toContainText('1');
    await expect(player.getByTestId('action-category-lair')).toContainText('1');
    await expect(player.getByTestId('action-category-power')).toContainText('1');
    await player.getByTestId('action-category-legendary').click();
    await expect(player.getByRole('button', { name: /Legendary Step/ })).toBeVisible();
    await player.getByTestId('action-category-lair').click();
    await expect(player.getByRole('button', { name: /Lair Diagnostic Pulse/ })).toBeVisible();
    await player.getByTestId('action-category-power').click();
    await expect(player.getByRole('button', { name: /Null Field/ })).toBeVisible();
    await player.getByTestId('action-category-custom').click();
    await expect(player.getByText('Custom Action', { exact: true }).first()).toBeVisible();
    await player.getByTestId('action-category-action').click();
    await player.getByRole('button', { name: /Legacy Overload/ }).click();
    await expect(player.getByLabel('Attack formula')).toHaveValue('1d20 + 18');
    await expect(player.getByTestId('damage-component-0').getByLabel('Formula')).toHaveValue('5d12 + 9');

    await player.getByRole('button', { name: /Prismatic Cleaver/ }).click();
    await expect(player.getByTestId('damage-component-0').getByLabel('Damage type')).toHaveValue('slashing');
    await expect(player.getByTestId('damage-component-1').getByLabel('Damage type')).toHaveValue('fire');
    await expect(player.getByTestId('damage-component-2').getByLabel('Damage type')).toHaveValue('radiant');
    await player.getByTestId('damage-component-0').getByLabel('Manual subtotal override').fill('30');
    await player.getByTestId('damage-component-2').getByLabel('Include').uncheck();
    await player.getByRole('button', { name: /Add component/ }).click();
    await expect(player.getByTestId('damage-component-3')).toBeVisible();
    await player.getByTestId('damage-component-3').getByTitle('Remove component').click();
    await player.getByTestId('roll-attack').click();
    await player.getByLabel('Player attack override').fill('37');
    await player.getByTestId('roll-all-damage').click();
    await player.getByLabel('Player-edited combined').fill('60');
    await expect(player.getByTestId('submitted-damage')).toHaveText('60');
    await targetCheckbox(player, 'action-target-selector', 'Tarrasque').check();
    await targetCheckbox(player, 'action-target-selector', 'QA Observer').check();
    await expect(player.getByTestId('action-target-selector')).toContainText('2 selected');
    await targetCheckbox(player, 'action-target-selector', 'QA Observer').uncheck();
    await player.getByTestId('submit-proposal').click();

    await dm.getByTestId('combat-tab-proposals').click();
    await expect(dm.getByText('Prismatic Cleaver', { exact: true })).toBeVisible();
    await dm.getByLabel('Same damage for all targets').fill('65');
    await dm.getByTestId('resolve-all').click();
    await expect(dm.getByText(/This proposal is resolved/)).toBeVisible();
    await expect(player.getByTitle(/Tarrasque — 611\/676 HP/)).toBeVisible();
    await screenshot(dm, testInfo, 'dm-proposal-resolved');

    await dm.getByTestId('combat-tab-dm').click();
    await dm.getByTestId('undo-latest').click();
    await expect(player.getByTitle(/Tarrasque — 676\/676 HP/)).toBeVisible();

    await dm.getByTestId('combat-tab-actions').click();
    await expect(dm.getByTestId('actor-summary').getByLabel('Acting combatant')).toHaveValue('tokens-0004');
    await dm.getByRole('button', { name: /^Bite/ }).click();
    await dm.getByTestId('roll-attack').click();
    await dm.getByTestId('roll-all-damage').click();
    await dm.getByLabel('Player-edited combined').fill('60');
    await targetCheckbox(dm, 'action-target-selector', 'Combat QA Titan').check();
    await dm.getByTestId('submit-proposal').click();
    await dm.getByTestId('combat-tab-proposals').click();
    await expect(dm.getByText('Bite', { exact: true })).toBeVisible();
    await dm.getByLabel('Broad reaction trigger').selectOption('damage');
    await dm.getByRole('button', { name: /Open reaction window/ }).click();

    await player.getByTestId('combat-tab-reactions').click();
    await expect(player.getByText('You are about to take damage', { exact: true })).toBeVisible();
    await player.getByRole('button', { name: /Parry Vector/ }).click();
    await dm.getByTestId('combat-tab-reactions').click();
    await expect(dm.getByText(/reaction: Parry Vector/)).toBeVisible();
    await player.getByLabel('Custom reaction or question').fill('I raise a custom reflective ward.');
    await player.getByRole('button', { name: 'Submit custom' }).click();
    await expect(dm.getByText(/custom: I raise a custom reflective ward/)).toBeVisible();
    await player.getByRole('button', { name: 'Pass' }).click();
    await expect(dm.getByText(/pass:/)).toBeVisible();
    await player.getByLabel('Custom reaction or question').fill('Does the attack count as magical?');
    await player.getByRole('button', { name: /Ask DM/ }).click();
    await expect(dm.getByText(/Ask DM: Does the attack count as magical/)).toBeVisible();
    await dm.getByLabel('Editable trigger text').fill('The titan may respond before damage is applied.');
    await dm.getByRole('button', { name: 'Save trigger text' }).click();
    await expect(player.getByText('The titan may respond before damage is applied.', { exact: true })).toBeVisible();
    const reactionEligibility = dm.locator('[data-testid^="reaction-eligible-"]');
    const observerEligibility = reactionEligibility.locator('[data-token-name="QA Observer"] input[type="checkbox"]');
    await observerEligibility.click();
    await expect(observerEligibility).toBeChecked();
    await observerEligibility.click();
    await expect(observerEligibility).not.toBeChecked();
    await dm.getByRole('button', { name: 'Continue without waiting' }).click();
    await dm.getByTestId('combat-tab-proposals').click();
    await dm.getByTestId('resolve-all').click();
    await expect(player.getByTitle(/Combat QA Titan — 700\/720 HP/)).toBeVisible();

    await player.getByTestId('combat-tab-actions').click();
    await player.getByTestId('action-category-action').click();
    await player.getByRole('button', { name: /Repair Pulse/ }).click();
    await player.getByLabel('Healing override').fill('15');
    await targetCheckbox(player, 'action-target-selector', 'Combat QA Titan').check();
    await player.getByTestId('submit-proposal').click();
    await dm.getByTestId('combat-tab-proposals').click();
    await expect(dm.getByText('Repair Pulse', { exact: true })).toBeVisible();
    await dm.getByTestId('resolve-all').click();
    await expect(player.getByTitle(/Combat QA Titan — 715\/720 HP/)).toBeVisible();

    await player.getByTestId('combat-tab-actions').click();
    await player.getByTestId('action-category-action').click();
    await player.getByRole('button', { name: /Gravity Wave/ }).click();
    await player.getByLabel('Width').fill('8');
    await player.getByLabel('Height').fill('8');
    await expect(player.locator('.suggested-targets')).toBeVisible();
    await targetCheckbox(player, 'action-target-selector', 'Tarrasque').check();
    await targetCheckbox(player, 'action-target-selector', 'QA Observer').check();
    await targetCheckbox(player, 'action-target-selector', 'QA Observer').uncheck();
    await targetCheckbox(player, 'action-target-selector', 'QA Observer').check();
    await player.getByTestId('roll-all-damage').click();
    await player.getByLabel('Player-edited combined').fill('40');
    await player.getByTestId('save-target-tokens-0004').getByLabel('Optional roll').fill('24');
    await player.getByTestId('save-target-tokens-0004').getByLabel('Outcome').selectOption('half');
    await player.getByTestId('save-target-tokens-0008').getByLabel('Optional roll').fill('7');
    await player.getByTestId('save-target-tokens-0008').getByLabel('Outcome').selectOption('custom');
    await player.getByTestId('save-target-tokens-0008').getByLabel('Custom damage').fill('10');
    await player.getByTestId('submit-proposal').click();

    await dm.getByTestId('combat-tab-proposals').click();
    const gravityProposal = dm.locator('.proposal-card').filter({ hasText: 'Gravity Wave' });
    await expect(gravityProposal.locator('.proposal-target-card')).toHaveCount(2);
    await gravityProposal.getByTestId('proposal-target-tokens-0004').getByLabel('Half group').check();
    await gravityProposal.getByRole('button', { name: 'Apply half to selected' }).click();
    await gravityProposal.getByTestId('proposal-target-tokens-0004').getByLabel('Damage').fill('20');
    await gravityProposal.getByTestId('proposal-target-tokens-0008').getByLabel('Damage').fill('10');
    const gravityTargetSelector = gravityProposal.locator('[data-testid^="proposal-target-selector-"]');
    await gravityTargetSelector.locator('[data-token-name="QA Observer"] input[type="checkbox"]').uncheck();
    await expect(gravityProposal.locator('.proposal-target-card')).toHaveCount(1);
    await gravityTargetSelector.locator('[data-token-name="QA Observer"] input[type="checkbox"]').check();
    await expect(gravityProposal.locator('.proposal-target-card')).toHaveCount(2);
    await gravityProposal.getByTestId('proposal-target-tokens-0008').getByLabel('Damage').fill('10');
    await gravityProposal.getByTestId('resolve-all').click();

    await player.getByTestId('combat-tab-actions').click();
    await player.getByTestId('action-category-bonus').click();
    await player.getByRole('button', { name: /Aegis Buffer/ }).click();
    await player.getByLabel('Temporary HP override').fill('55');
    await targetCheckbox(player, 'action-target-selector', 'Combat QA Titan').check();
    await player.getByTestId('submit-proposal').click();
    await dm.getByTestId('combat-tab-proposals').click();
    await expect(dm.getByText('Aegis Buffer', { exact: true })).toBeVisible();
    await dm.getByTestId('resolve-all').click();
    await expect(player.getByText(/715\/720 HP · \+55 temp/).first()).toBeVisible();

    await dm.getByTestId('combat-tab-dm').click();
    await targetCheckbox(dm, 'dm-target-selector', 'Combat QA Titan').check();
    const dmPanel = dm.getByTestId('dm-panel');
    await dmPanel.getByLabel('Change').selectOption('damage');
    await dm.getByTestId('dm-amount').fill('60');
    await expect(dm.getByText('Final: 710 HP, 0 temp')).toBeVisible();
    await dm.getByTestId('resolve-direct').click();
    await expect(player.getByTitle(/Combat QA Titan — 710\/720 HP/)).toBeVisible();
    await dm.getByTestId('undo-latest').click();
    await expect(player.getByText(/715\/720 HP · \+55 temp/).first()).toBeVisible();

    await dmPanel.getByLabel('Change').selectOption('add_condition');
    await dmPanel.getByRole('textbox', { name: 'Condition', exact: true }).fill('Prone');
    await dm.getByTestId('resolve-direct').click();
    await expect(player.getByText(/Prone/).first()).toBeVisible();
    await dmPanel.getByLabel('Change').selectOption('resource');
    await dmPanel.getByLabel('Resource name').fill('QA Charges');
    await dm.getByTestId('dm-amount').fill('-2');
    await dm.getByTestId('resolve-direct').click();
    await dm.getByTestId('combat-tab-actions').click();
    await dm.getByTestId('actor-summary').getByLabel('Acting combatant').selectOption('tokens-0006');
    await expect(dm.getByTestId('actor-summary')).toContainText('QA Charges 3/5');
    await dm.getByTestId('combat-tab-dm').click();
    await dmPanel.getByLabel('Change').selectOption('resource');
    await dmPanel.getByLabel('Resource name').fill('QA Charges');
    await dm.getByTestId('dm-amount').fill('1');
    await dm.getByTestId('resolve-direct').click();
    await dm.getByTestId('combat-tab-actions').click();
    await expect(dm.getByTestId('actor-summary')).toContainText('QA Charges 4/5');
    await dm.getByTestId('combat-tab-dm').click();
    await dmPanel.getByLabel('Change').selectOption('remove_condition');
    await dmPanel.getByRole('textbox', { name: 'Condition', exact: true }).fill('Prone');
    await dm.getByTestId('resolve-direct').click();
    await expect(player.getByTestId('actor-summary')).not.toContainText('Prone');

    await dm.getByTestId('dm-target-selector').getByRole('button', { name: /Clear/ }).click();
    await targetCheckbox(dm, 'dm-target-selector', 'Tarrasque').check();
    await targetCheckbox(dm, 'dm-target-selector', 'QA Observer').check();
    await dmPanel.getByLabel('Change').selectOption('damage');
    await dm.getByTestId('dm-amount').fill('1');
    await expect(dm.locator('.direct-preview-list .resolution-preview')).toHaveCount(2);
    await dm.getByTestId('resolve-direct').click();
    await expect(player.getByTitle(/Tarrasque — 655\/676 HP/)).toBeVisible();
    await expect(spectator.getByTitle(/QA Observer — 89\/100 HP/)).toBeVisible();

    await dm.getByTestId('combat-tab-turns').click();
    await dm.getByRole('button', { name: /Next/ }).click();
    await dm.getByRole('button', { name: /Advance round/ }).click();
    await dm.getByRole('button', { name: /Advance round/ }).click();
    await dm.getByRole('button', { name: /Advance round/ }).click();
    await expect(dm.getByText('Round 4', { exact: false }).first()).toBeVisible();
    await dm.getByTestId('switch-turn-mode').click();
    await expect(player.getByText(/free mode/).first()).toBeVisible();
    await dm.getByTestId('switch-turn-mode').click();
    await expect(player.getByText(/initiative mode/).first()).toBeVisible();

    await player.getByTestId('combat-tab-chat').click();
    await player.getByLabel('Combat chat message').fill('Player ready for round five.');
    await player.getByTestId('send-chat').click();
    await dm.getByTestId('combat-tab-chat').click();
    await expect(dm.getByText('Player ready for round five.')).toBeVisible();
    await dm.getByLabel('Combat chat message').fill('DM confirms synchronized state.');
    await dm.getByTestId('send-chat').click();
    await expect(player.getByText('DM confirms synchronized state.')).toBeVisible();
    await expect(dm.getByText('Action proposed: Prismatic Cleaver')).toBeVisible();
    await expect(dm.getByText('Attack 37 · Damage 60')).toBeVisible();
    await expect(dm.getByText('DM applied a direct resolution').first()).toBeVisible();

    const persistedTarrasqueStyle = await dm.getByTestId('map-token-tokens-0004').getAttribute('style');
    await Promise.all([dm.reload(), player.reload()]);
    await dm.getByTestId('combat-launcher').click();
    await dm.getByText('Tarrasque Full Fight QA', { exact: true }).click();
    await player.getByTestId('combat-launcher').click();
    await player.getByText('Tarrasque Full Fight QA', { exact: true }).click();
    await expect(dm.getByText(/Round 4/).first()).toBeVisible();
    await expect(player.getByTitle(/Tarrasque — 655\/676 HP/)).toBeVisible();
    await expect(player.getByText(/715\/720 HP · \+55 temp/).first()).toBeVisible();
    await expect(dm.getByTestId('map-token-tokens-0004')).toHaveAttribute('style', persistedTarrasqueStyle ?? '');
    await dm.getByTitle('Encounters').click();
    await dm.getByText('Tarrasque Full Fight QA', { exact: true }).click();
    await dm.getByTestId('combat-tab-chat').click();
    await expect(dm.getByText('Player ready for round five.')).toBeVisible();
    await dm.getByTestId('combat-tab-actions').click();
    await dm.getByTestId('actor-summary').getByLabel('Acting combatant').selectOption('tokens-0006');
    await expect(dm.getByTestId('actor-summary')).toContainText('QA Charges 5/5');

    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1440, height: 900 },
      { width: 1366, height: 768 },
      { width: 1280, height: 720 },
    ]) {
      await dm.setViewportSize(viewport);
      await dm.getByTestId('combat-tab-actions').click();
      await dm.getByTestId('submit-proposal').scrollIntoViewIfNeeded();
      await expect(dm.getByTestId('submit-proposal')).toBeInViewport();
      await dm.getByTestId('combat-tab-dm').click();
      await dm.getByTestId('resolve-direct').scrollIntoViewIfNeeded();
      await expect(dm.getByTestId('resolve-direct')).toBeInViewport();
      await dm.getByTestId('combat-tab-chat').click();
      await expect(dm.getByTestId('send-chat')).toBeInViewport();
    }

    await dm.setViewportSize({ width: 1366, height: 768 });
    await dm.getByTestId('combat-tab-actions').click();
    await dm.getByTestId('action-category-custom').click();
    await targetCheckbox(dm, 'action-target-selector', 'QA Observer').check();
    await dm.getByTestId('submit-proposal').scrollIntoViewIfNeeded();
    await dm.getByTestId('submit-proposal').click();
    await dm.getByTestId('combat-tab-proposals').click();
    await dm.getByTestId('resolve-all').scrollIntoViewIfNeeded();
    await expect(dm.getByTestId('resolve-all')).toBeInViewport();
    await dm.getByTestId('resolve-all').click();
    await screenshot(dm, testInfo, 'dm-1366-scroll-and-resolve');

    await player.setViewportSize({ width: 390, height: 844 });
    await expect(player.getByRole('button', { name: /Combat panel/ })).toBeVisible();
    await player.getByRole('button', { name: /Combat panel/ }).click();
    await player.getByTestId('combat-tab-actions').click();
    await player.getByTestId('action-category-power').click();
    await player.getByRole('button', { name: /Null Field/ }).click();
    await targetCheckbox(player, 'action-target-selector', 'Tarrasque').check();
    await expect(player.getByTestId('submit-proposal')).toBeVisible();
    await player.getByTestId('submit-proposal').scrollIntoViewIfNeeded();
    await expect(player.getByTestId('submit-proposal')).toBeInViewport();
    await screenshot(player, testInfo, 'player-mobile-action-scroll');

    await dm.setViewportSize({ width: 768, height: 1024 });
    await dm.getByRole('button', { name: /Combat panel/ }).click();
    await dm.getByTestId('combat-tab-dm').click();
    await dm.getByTestId('resolve-direct').scrollIntoViewIfNeeded();
    await expect(dm.getByTestId('resolve-direct')).toBeInViewport();
    await screenshot(dm, testInfo, 'dm-tablet-direct-resolution');

    expect(browserErrors).toEqual([]);
  } finally {
    await dmContext.close();
    await playerContext.close();
    await spectatorContext.close();
  }
});
