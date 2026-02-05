/**
 * Grants system handlers for item sheets (spells and perks)
 * Separated for clarity - imported by item-sheet.mjs
 */

export class GrantsHandlers {
  /**
   * Add spell to trait (ancestry)
   */
  static async addTraitSpell(itemSheet, event, target) {
    const traitIndex = parseInt(target.dataset.traitIndex);
    if (isNaN(traitIndex)) return;

    const select = itemSheet.element.querySelector(`select[data-trait-index="${traitIndex}"][data-grant-type="spell"]`);
    const spellUuid = select?.value;

    if (!spellUuid) {
      ui.notifications.warn('Please select a spell first');
      return;
    }

    const traits = foundry.utils.deepClone(itemSheet.item.system.traits);
    const currentSpells = traits[traitIndex].requiredSpells || [];

    if (currentSpells.includes(spellUuid)) {
      ui.notifications.warn('Spell already added');
      return;
    }

    traits[traitIndex].requiredSpells = [...currentSpells, spellUuid];

    await itemSheet.item.update({ 'system.traits': traits }, { render: false });
    itemSheet.render();
  }

  /**
   * Add perk to trait (ancestry)
   */
  static async addTraitPerk(itemSheet, event, target) {
    const traitIndex = parseInt(target.dataset.traitIndex);
    if (isNaN(traitIndex)) return;

    const select = itemSheet.element.querySelector(`select[data-trait-index="${traitIndex}"][data-grant-type="perk"]`);
    const perkUuid = select?.value;

    if (!perkUuid) {
      ui.notifications.warn('Please select a perk first');
      return;
    }

    const traits = foundry.utils.deepClone(itemSheet.item.system.traits);
    const currentPerks = traits[traitIndex].allowedPerks || [];

    if (currentPerks.includes(perkUuid)) {
      ui.notifications.warn('Perk already added');
      return;
    }

    traits[traitIndex].allowedPerks = [...currentPerks, perkUuid];

    await itemSheet.item.update({ 'system.traits': traits }, { render: false });
    itemSheet.render();
  }

  /**
   * Add spell to feature (class)
   */
  static async addFeatureSpell(itemSheet, event, target) {
    const featureIndex = parseInt(target.dataset.featureIndex);
    if (isNaN(featureIndex)) return;

    const select = itemSheet.element.querySelector(`select[data-feature-index="${featureIndex}"][data-grant-type="spell"]`);
    const spellUuid = select?.value;

    if (!spellUuid) {
      ui.notifications.warn('Please select a spell first');
      return;
    }

    const features = foundry.utils.deepClone(itemSheet.item.system.levelFeatures);
    const currentSpells = features[featureIndex].requiredSpells || [];

    if (currentSpells.includes(spellUuid)) {
      ui.notifications.warn('Spell already added');
      return;
    }

    features[featureIndex].requiredSpells = [...currentSpells, spellUuid];

    await itemSheet.item.update({ 'system.levelFeatures': features }, { render: false });
    itemSheet.render();
  }

  /**
   * Add perk to feature (class)
   */
  static async addFeaturePerk(itemSheet, event, target) {
    const featureIndex = parseInt(target.dataset.featureIndex);
    if (isNaN(featureIndex)) return;

    const select = itemSheet.element.querySelector(`select[data-feature-index="${featureIndex}"][data-grant-type="perk"]`);
    const perkUuid = select?.value;

    if (!perkUuid) {
      ui.notifications.warn('Please select a perk first');
      return;
    }

    const features = foundry.utils.deepClone(itemSheet.item.system.levelFeatures);
    const currentPerks = features[featureIndex].allowedPerks || [];

    if (currentPerks.includes(perkUuid)) {
      ui.notifications.warn('Perk already added');
      return;
    }

    features[featureIndex].allowedPerks = [...currentPerks, perkUuid];

    await itemSheet.item.update({ 'system.levelFeatures': features }, { render: false });
    itemSheet.render();
  }

  /**
   * Remove spell from trait by index
   */
  static async removeTraitSpell(itemSheet, event, target) {
    const traitIndex = parseInt(target.dataset.traitIndex);
    const spellIndex = parseInt(target.dataset.spellIndex);

    if (isNaN(traitIndex) || isNaN(spellIndex)) return;

    const traits = foundry.utils.deepClone(itemSheet.item.system.traits);
    const spells = traits[traitIndex].requiredSpells || [];

    spells.splice(spellIndex, 1);
    traits[traitIndex].requiredSpells = spells;

    await itemSheet.item.update({ 'system.traits': traits }, { render: false });
    itemSheet.render();
  }

  /**
   * Remove perk from trait by index
   */
  static async removeTraitPerk(itemSheet, event, target) {
    const traitIndex = parseInt(target.dataset.traitIndex);
    const perkIndex = parseInt(target.dataset.perkIndex);

    if (isNaN(traitIndex) || isNaN(perkIndex)) return;

    const traits = foundry.utils.deepClone(itemSheet.item.system.traits);
    const perks = traits[traitIndex].allowedPerks || [];

    perks.splice(perkIndex, 1);
    traits[traitIndex].allowedPerks = perks;

    await itemSheet.item.update({ 'system.traits': traits }, { render: false });
    itemSheet.render();
  }

  /**
   * Remove spell from feature by index
   */
  static async removeFeatureSpell(itemSheet, event, target) {
    const featureIndex = parseInt(target.dataset.featureIndex);
    const spellIndex = parseInt(target.dataset.spellIndex);

    if (isNaN(featureIndex) || isNaN(spellIndex)) return;

    const features = foundry.utils.deepClone(itemSheet.item.system.levelFeatures);
    const spells = features[featureIndex].requiredSpells || [];

    spells.splice(spellIndex, 1);
    features[featureIndex].requiredSpells = spells;

    await itemSheet.item.update({ 'system.levelFeatures': features }, { render: false });
    itemSheet.render();
  }

  /**
   * Remove perk from feature by index
   */
  static async removeFeaturePerk(itemSheet, event, target) {
    const featureIndex = parseInt(target.dataset.featureIndex);
    const perkIndex = parseInt(target.dataset.perkIndex);

    if (isNaN(featureIndex) || isNaN(perkIndex)) return;

    const features = foundry.utils.deepClone(itemSheet.item.system.levelFeatures);
    const perks = features[featureIndex].allowedPerks || [];

    perks.splice(perkIndex, 1);
    features[featureIndex].allowedPerks = perks;

    await itemSheet.item.update({ 'system.levelFeatures': features }, { render: false });
    itemSheet.render();
  }

  /**
   * Populate dropdowns with spells and perks from compendiums
   */
  static async populateGrantsDropdowns(itemSheet) {
    const html = itemSheet.element;

    // Get all spells from compendiums
    const spellPacks = game.packs.filter(p => p.documentName === 'Item' &&
      p.index.some(i => i.type === 'spell'));
    const spells = [];

    for (const pack of spellPacks) {
      const content = await pack.getDocuments();
      spells.push(...content.filter(i => i.type === 'spell'));
    }

    spells.sort((a, b) => a.name.localeCompare(b.name));

    // Get all perks from compendiums
    const perkPacks = game.packs.filter(p => p.documentName === 'Item' &&
      p.index.some(i => i.type === 'perk'));
    const perks = [];

    for (const pack of perkPacks) {
      const content = await pack.getDocuments();
      perks.push(...content.filter(i => i.type === 'perk'));
    }

    perks.sort((a, b) => a.name.localeCompare(b.name));

    // Populate spell dropdowns
    const spellSelects = html.querySelectorAll('select[data-grant-type="spell"]');
    spellSelects.forEach(select => {
      // Clear existing options except first
      while (select.options.length > 1) {
        select.remove(1);
      }

      // Add spell options
      spells.forEach(spell => {
        const option = document.createElement('option');
        option.value = spell.uuid;
        option.textContent = spell.name;
        select.appendChild(option);
      });
    });

    // Populate perk dropdowns
    const perkSelects = html.querySelectorAll('select[data-grant-type="perk"]');
    perkSelects.forEach(select => {
      // Clear existing options except first
      while (select.options.length > 1) {
        select.remove(1);
      }

      // Add perk options
      perks.forEach(perk => {
        const option = document.createElement('option');
        option.value = perk.uuid;
        option.textContent = perk.name;
        select.appendChild(option);
      });
    });
  }
}
