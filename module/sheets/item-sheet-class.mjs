import { GrantsHandlers } from './item-sheet-grants.mjs';

/**
 * Ancestry / Class editor actions of VagabondItemSheet: traits, level features and their grants,
 * guaranteed / choice Skills, key Stats, suggested Starting Packs. AppV2 action handlers: `this` is the sheet.
 */
export class ItemSheetClassEditor {
  /**
   * Handle adding a new trait to an ancestry item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddTrait(event, target) {
    const traits = this._collectArrayFromDOM('system.traits', 'traits');
    traits.push({ name: 'New Trait', description: '' });
    await this._safeUpdate({ 'system.traits': traits });
  }

  /**
   * Handle removing a trait from an ancestry item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveTrait(event, target) {
    const index = parseInt(target.dataset.traitIndex);
    if (isNaN(index)) return;

    const traits = this._collectArrayFromDOM('system.traits', 'traits');
    const newTraits = traits.filter((_, i) => i !== index);
    await this._safeUpdate({ 'system.traits': newTraits });
  }

  /**
   * Handle adding a new level feature to a class item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddLevelFeature(event, target) {
    const level = parseInt(target.dataset.level);
    if (isNaN(level)) return;

    const features = this._collectArrayFromDOM('system.levelFeatures', 'levelFeatures');
    features.push({ level, name: 'New Feature', description: '' });
    await this._safeUpdate({ 'system.levelFeatures': features });
  }

  /**
   * Handle removing a level feature from a class item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveLevelFeature(event, target) {
    const index = parseInt(target.dataset.featureIndex);
    if (isNaN(index)) return;

    const features = this._collectArrayFromDOM('system.levelFeatures', 'levelFeatures');
    const newFeatures = features.filter((_, i) => i !== index);
    await this._safeUpdate({ 'system.levelFeatures': newFeatures });
  }

  /**
   * Add a skill to the guaranteed list.
   */
  static async _onAddGuaranteedSkill(event, target) {
    const select = this.element.querySelector('#guaranteed-skill-select');
    if (!select) {
      console.error("VAGABOND | Selector #guaranteed-skill-select not found");
      return;
    }
    
    const skill = select.value.toLowerCase().trim();
    const current = this.item.system.skillGrant.guaranteed || [];
    
    if (current.includes(skill)) {
      console.warn(`VAGABOND | Skill ${skill} is already in the list.`);
      return;
    }

    const updateData = { "system.skillGrant.guaranteed": [...current, skill] };
    await this.item.update(updateData);
  }

  static async _onRemoveGuaranteedSkill(event, target) {
    const index = parseInt(target.dataset.index);

    const current = this.item.system.skillGrant.guaranteed || [];
    const newGuaranteed = current.filter((_, i) => i !== index);

    await this.item.update({ "system.skillGrant.guaranteed": newGuaranteed });
  }

  static async _onAddPoolSkill(event, target) {
    const choiceIndex = parseInt(target.dataset.choiceIndex);
    const select = this.element.querySelector(`.pool-skill-select[data-choice-index="${choiceIndex}"]`);
    if (!select || !select.value) return;

    const skill = select.value;
    const choices = foundry.utils.deepClone(this.item.system.skillGrant.choices || []);
    const choice = choices[choiceIndex];
    if (!choice) return;

    choice.pool = choice.pool || [];
    if (choice.pool.includes(skill)) return;
    choice.pool.push(skill);

    await this.item.update({ "system.skillGrant.choices": choices });
  }

  static async _onRemovePoolSkill(event, target) {
    const choiceIndex = parseInt(target.dataset.choiceIndex);
    const poolIndex = parseInt(target.dataset.poolIndex);

    const choices = foundry.utils.deepClone(this.item.system.skillGrant.choices || []);
    const choice = choices[choiceIndex];
    if (!choice?.pool) return;

    choice.pool.splice(poolIndex, 1);
    await this.item.update({ "system.skillGrant.choices": choices });
  }

  /**
   * Add a stat to the key stats list.
   */
  static async _onAddKeyStat(event, target) {
    const select = this.element.querySelector('#key-stat-select');
    if (!select) {
      console.error("VAGABOND | Selector #key-stat-select not found");
      return;
    }

    const stat = select.value.toLowerCase().trim();
    if (!stat) {
      console.warn("VAGABOND | No stat selected");
      return;
    }

    const current = this.item.system.keyStats || [];

    if (current.includes(stat)) {
      console.warn(`VAGABOND | Stat ${stat} is already in the key stats list.`);
      return;
    }

    const updateData = { "system.keyStats": [...current, stat] };
    await this.item.update(updateData);
  }

  static async _onRemoveKeyStat(event, target) {
    const index = parseInt(target.dataset.index);

    const current = this.item.system.keyStats || [];
    const newKeyStats = current.filter((_, i) => i !== index);

    await this.item.update({ "system.keyStats": newKeyStats });
  }

  static async _onAddSkillChoiceGroup(event, target) {
    const choices = [...(this.item.system.skillGrant.choices || []), { count: 1, pool: [], label: "" }];
    
    await this.item.update({ "system.skillGrant.choices": choices });
  }

  static async _onRemoveSkillChoiceGroup(event, target) {
    const index = parseInt(target.dataset.index);
    
    const choices = (this.item.system.skillGrant.choices || []).filter((_, i) => i !== index);
    await this.item.update({ "system.skillGrant.choices": choices });
  }

  /**
   * Handle removing a suggested starting pack from a class item
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   * @private
   */
  static async _onRemoveSuggestedStartingPack(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const current = this.item.system.suggestedStartingPacks || [];
    await this.item.update({ 'system.suggestedStartingPacks': current.filter(u => u !== uuid) });
  }

  /**
   * Generic grant handlers — delegate to GrantsHandlers using data-array-path / data-item-index.
   */
  static async _onAddGrantSpell(event, target) {
    return GrantsHandlers.addGrantSpell(this, event, target);
  }

  static async _onRemoveGrantSpell(event, target) {
    return GrantsHandlers.removeGrantSpell(this, event, target);
  }

  static async _onAddGrantPerk(event, target) {
    return GrantsHandlers.addGrantPerk(this, event, target);
  }

  static async _onRemoveGrantPerk(event, target) {
    return GrantsHandlers.removeGrantPerk(this, event, target);
  }

  static async _onRemoveGrantItem(event, target) {
    return GrantsHandlers.removeGrantItem(this, event, target);
  }

  static async _onAddGrantItemChoiceGroup(event, target) {
    return GrantsHandlers.addGrantItemChoiceGroup(this, event, target);
  }

  static async _onRemoveGrantItemChoiceGroup(event, target) {
    return GrantsHandlers.removeGrantItemChoiceGroup(this, event, target);
  }

  /**
   * Add a new skill choice group to a trait or feature.
   */
  static async _onAddGrantSkillChoiceGroup(event, target) {
    const arrayPath = target.dataset.arrayPath;
    const itemIndex = parseInt(target.dataset.itemIndex);
    if (!arrayPath || isNaN(itemIndex)) return;

    const prop = arrayPath.replace(/^system\./, '');
    // Start from DOM state so unsaved text values aren't lost on re-render
    const items = this._collectArrayFromDOM(arrayPath, prop);
    if (!items[itemIndex]) return;
    items[itemIndex].skillChoices = items[itemIndex].skillChoices || [];
    items[itemIndex].skillChoices.push({ count: 1, pool: [], label: '' });
    await this._safeUpdate({ [arrayPath]: items });
  }

  /**
   * Remove a skill choice group from a trait or feature.
   */
  static async _onRemoveGrantSkillChoiceGroup(event, target) {
    const arrayPath = target.dataset.arrayPath;
    const itemIndex = parseInt(target.dataset.itemIndex);
    const choiceIndex = parseInt(target.dataset.choiceIndex);
    if (!arrayPath || isNaN(itemIndex) || isNaN(choiceIndex)) return;

    const prop = arrayPath.replace(/^system\./, '');
    // Start from DOM state so unsaved text values aren't lost on re-render
    const items = this._collectArrayFromDOM(arrayPath, prop);
    if (!items[itemIndex]?.skillChoices) return;
    items[itemIndex].skillChoices.splice(choiceIndex, 1);
    await this._safeUpdate({ [arrayPath]: items });
  }
}
