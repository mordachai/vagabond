/**
 * Perk prerequisite editor actions for VagabondItemSheet: Stat / Trained Skill / Spell / Resource
 * entries and their OR groups. AppV2 action handlers: `this` is the sheet.
 */
export class ItemSheetPrerequisites {
  /**
   * Handle adding a prerequisite type from the dropdown
   *
   * @this VagabondItemSheet
   * @param {Event} event   The change event
   * @param {HTMLElement} target   The select element
   * @private
   */
  static async _onAddPrerequisiteType(event, target) {
    const type = target.value;
    if (!type) return; // No selection

    // Reset the dropdown
    target.value = '';

    // Add the first prerequisite of the selected type
    switch (type) {
      case 'stat': {
        const stats = this.item.system.prerequisites?.stats || [];
        await this.item.update({ 'system.prerequisites.stats': [...stats, { stat: 'might', value: 1 }] });
        break;
      }
      case 'statOrGroup': {
        const orGroups = this.item.system.prerequisites?.statOrGroups || [];
        await this.item.update({ 'system.prerequisites.statOrGroups': [...orGroups, [{ stat: 'might', value: 1 }]] });
        break;
      }
      case 'trainedSkill': {
        const skills = this.item.system.prerequisites?.trainedSkills || [];
        await this.item.update({ 'system.prerequisites.trainedSkills': [...skills, 'arcana'] });
        break;
      }
      case 'trainedSkillOrGroup': {
        const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
        await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': [...orGroups, ['arcana']] });
        break;
      }
      case 'spell': {
        const spells = this.item.system.prerequisites?.spells || [];
        await this.item.update({ 'system.prerequisites.spells': [...spells, ''] });
        break;
      }
      case 'spellOrGroup': {
        const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
        await this.item.update({ 'system.prerequisites.spellOrGroups': [...orGroups, ['']] });
        break;
      }
      case 'resource': {
        const resources = this.item.system.prerequisites?.resources || [];
        await this.item.update({ 'system.prerequisites.resources': [...resources, { resourceType: 'maxMana', minimum: 1 }] });
        break;
      }
      case 'resourceOrGroup': {
        const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
        await this.item.update({ 'system.prerequisites.resourceOrGroups': [...orGroups, [{ resourceType: 'maxMana', minimum: 1 }]] });
        break;
      }
    }
  }

  /**
   * Handle adding a new stat prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddStatPrerequisite(event, target) {
    const stats = this.item.system.prerequisites?.stats || [];
    const newStats = [...stats, { stat: 'might', value: 1 }];
    await this.item.update({ 'system.prerequisites.stats': newStats });
  }

  /**
   * Handle removing a stat prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveStatPrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const stats = this.item.system.prerequisites?.stats || [];
    const newStats = stats.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.stats': newStats });
  }

  /**
   * Handle adding a new trained skill prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddTrainedSkillPrerequisite(event, target) {
    const skills = this.item.system.prerequisites?.trainedSkills || [];
    const newSkills = [...skills, 'arcana'];
    await this.item.update({ 'system.prerequisites.trainedSkills': newSkills });
  }

  /**
   * Handle removing a trained skill prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveTrainedSkillPrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const skills = this.item.system.prerequisites?.trainedSkills || [];
    const newSkills = skills.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.trainedSkills': newSkills });
  }

  /**
   * Handle adding a new stat OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddStatOrGroup(event, target) {
    const orGroups = this.item.system.prerequisites?.statOrGroups || [];
    const newGroups = [...orGroups, [{ stat: 'might', value: 1 }]]; // Start with one stat as placeholder
    await this.item.update({ 'system.prerequisites.statOrGroups': newGroups });
  }

  /**
   * Handle removing an entire stat OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveStatOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.statOrGroups || [];
    const newGroups = orGroups.filter((_, i) => i !== groupIndex);
    await this.item.update({ 'system.prerequisites.statOrGroups': newGroups });
  }

  /**
   * Handle adding a stat to an existing OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddStatToOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.statOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = [...newGroups[groupIndex], { stat: 'might', value: 1 }]; // Add placeholder

    await this.item.update({ 'system.prerequisites.statOrGroups': newGroups });
  }

  /**
   * Handle removing a stat from an OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveStatFromOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.group);
    const statIndex = parseInt(target.dataset.stat);
    if (isNaN(groupIndex) || isNaN(statIndex)) return;

    const orGroups = this.item.system.prerequisites?.statOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== statIndex);

    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);

    await this.item.update({ 'system.prerequisites.statOrGroups': filteredGroups });
  }

  /**
   * Handle adding a new trained skill OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddTrainedSkillOrGroup(event, target) {
    const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
    const newGroups = [...orGroups, ['arcana']]; // Start with one skill as placeholder
    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': newGroups });
  }

  /**
   * Handle removing an entire trained skill OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveTrainedSkillOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
    const newGroups = orGroups.filter((_, i) => i !== groupIndex);
    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': newGroups });
  }

  /**
   * Handle adding a skill to an existing OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddSkillToOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = [...newGroups[groupIndex], 'arcana']; // Add placeholder

    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': newGroups });
  }

  /**
   * Handle removing a skill from an OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveSkillFromOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.group);
    const skillIndex = parseInt(target.dataset.skill);
    if (isNaN(groupIndex) || isNaN(skillIndex)) return;

    const orGroups = this.item.system.prerequisites?.trainedSkillOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== skillIndex);

    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);

    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': filteredGroups });
  }

  /**
   * Handle adding a new spell prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddSpellPrerequisite(event, target) {
    const spells = this.item.system.prerequisites?.spells || [];
    const newSpells = [...spells, ''];
    await this.item.update({ 'system.prerequisites.spells': newSpells });
  }

  /**
   * Handle removing a spell prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveSpellPrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const spells = this.item.system.prerequisites?.spells || [];
    const newSpells = spells.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.spells': newSpells });
  }

  /**
   * Handle toggling the "Has Any Spell" checkbox and hide/show specific spell selectors
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onToggleHasAnySpell(event, target) {
    const checkbox = target;
    const isChecked = checkbox.checked;

    // Find the specific spell prerequisites container and toggle visibility
    const prereqList = checkbox.closest('.prereq-list');
    if (prereqList) {
      const specificSpellsContainer = prereqList.querySelector('.specific-spell-prerequisites');
      if (specificSpellsContainer) {
        specificSpellsContainer.style.display = isChecked ? 'none' : '';
      }
    }
  }

  /**
   * Handle adding a new spell OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddSpellOrGroup(event, target) {
    const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
    const newGroups = [...orGroups, ['']]; // Start with one empty spell as placeholder
    await this.item.update({ 'system.prerequisites.spellOrGroups': newGroups });
  }

  /**
   * Handle removing an entire spell OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveSpellOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
    const newGroups = orGroups.filter((_, i) => i !== groupIndex);
    await this.item.update({ 'system.prerequisites.spellOrGroups': newGroups });
  }

  /**
   * Handle adding a spell to an existing OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddSpellToOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = [...newGroups[groupIndex], '']; // Add empty placeholder

    await this.item.update({ 'system.prerequisites.spellOrGroups': newGroups });
  }

  /**
   * Handle removing a spell from an OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveSpellFromOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.group);
    const spellIndex = parseInt(target.dataset.spell);
    if (isNaN(groupIndex) || isNaN(spellIndex)) return;

    const orGroups = this.item.system.prerequisites?.spellOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== spellIndex);

    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);

    await this.item.update({ 'system.prerequisites.spellOrGroups': filteredGroups });
  }

  /**
   * Handle adding a new resource prerequisite to a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddResourcePrerequisite(event, target) {
    const resources = this.item.system.prerequisites?.resources || [];
    const newResources = [...resources, { resourceType: 'maxMana', minimum: 1 }];
    await this.item.update({ 'system.prerequisites.resources': newResources });
  }

  /**
   * Handle removing a resource prerequisite from a perk item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveResourcePrerequisite(event, target) {
    const index = parseInt(target.dataset.index);
    if (isNaN(index)) return;

    const resources = this.item.system.prerequisites?.resources || [];
    const newResources = resources.filter((_, i) => i !== index);
    await this.item.update({ 'system.prerequisites.resources': newResources });
  }

  /**
   * Handle adding a new resource OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddResourceOrGroup(event, target) {
    const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
    const newGroups = [...orGroups, [{ resourceType: 'maxMana', minimum: 1 }]]; // Start with one resource as placeholder
    await this.item.update({ 'system.prerequisites.resourceOrGroups': newGroups });
  }

  /**
   * Handle removing an entire resource OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveResourceOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
    const newGroups = orGroups.filter((_, i) => i !== groupIndex);
    await this.item.update({ 'system.prerequisites.resourceOrGroups': newGroups });
  }

  /**
   * Handle adding a resource to an existing OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onAddResourceToOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.index);
    if (isNaN(groupIndex)) return;

    const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = [...newGroups[groupIndex], { resourceType: 'maxMana', minimum: 1 }]; // Add placeholder

    await this.item.update({ 'system.prerequisites.resourceOrGroups': newGroups });
  }

  /**
   * Handle removing a resource from an OR group
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveResourceFromOrGroup(event, target) {
    const groupIndex = parseInt(target.dataset.group);
    const resourceIndex = parseInt(target.dataset.resource);
    if (isNaN(groupIndex) || isNaN(resourceIndex)) return;

    const orGroups = this.item.system.prerequisites?.resourceOrGroups || [];
    const newGroups = foundry.utils.deepClone(orGroups);
    newGroups[groupIndex] = newGroups[groupIndex].filter((_, i) => i !== resourceIndex);

    // Remove empty groups
    const filteredGroups = newGroups.filter(group => group.length > 0);

    await this.item.update({ 'system.prerequisites.resourceOrGroups': filteredGroups });
  }

  /**
   * Handle clearing all stat prerequisites
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllStats(event, target) {
    await this.item.update({ 'system.prerequisites.stats': [] });
  }

  /**
   * Handle clearing all stat OR groups
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllStatOrGroups(event, target) {
    await this.item.update({ 'system.prerequisites.statOrGroups': [] });
  }

  /**
   * Handle clearing all trained skill prerequisites
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllTrainedSkills(event, target) {
    await this.item.update({ 'system.prerequisites.trainedSkills': [] });
  }

  /**
   * Handle clearing all trained skill OR groups
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllTrainedSkillOrGroups(event, target) {
    await this.item.update({ 'system.prerequisites.trainedSkillOrGroups': [] });
  }

  /**
   * Handle clearing all spell prerequisites
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllSpells(event, target) {
    await this.item.update({ 'system.prerequisites.spells': [] });
  }

  /**
   * Handle clearing all spell OR groups
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllSpellOrGroups(event, target) {
    await this.item.update({ 'system.prerequisites.spellOrGroups': [] });
  }

  /**
   * Handle clearing all resource prerequisites
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllResources(event, target) {
    await this.item.update({ 'system.prerequisites.resources': [] });
  }

  /**
   * Handle clearing all resource OR groups
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onClearAllResourceOrGroups(event, target) {
    await this.item.update({ 'system.prerequisites.resourceOrGroups': [] });
  }
}
