/**
 * Dialog for selecting choices on perks that require player input
 * (e.g., New Training - select skill, Advancement - select stat)
 */
export default class PerkChoiceDialog extends foundry.applications.api.DialogV2 {

  /**
   * Show a choice selection dialog for a perk
   * @param {VagabondItem} perk - The perk item requiring a choice
   * @param {VagabondActor} actor - The actor receiving the perk
   * @returns {Promise<string|null>} The selected choice key, or null if cancelled
   */
  static async show(perk, actor) {
    const choiceType = perk.system.choiceConfig?.type;

    if (!choiceType || choiceType === 'none') {
      ui.notifications.warn('This perk does not require a choice.');
      return null;
    }

    // Build options based on choice type
    const options = await this._getAvailableChoices(choiceType, actor);

    if (options.length === 0) {
      ui.notifications.warn(`No available ${choiceType} choices for this character.`);
      return null;
    }

    // Get localized choice type label
    const choiceTypeLabel = this._getChoiceTypeLabel(choiceType);

    // Show dialog with dropdown
    const result = await foundry.applications.api.DialogV2.prompt({
      window: {
        title: `${perk.name}: Make Selection`,
        icon: 'fa-solid fa-hand-pointer'
      },
      position: {
        width: 420
      },
      content: `
        <form class="perk-choice-dialog">
          <div class="form-group">
            <label>Choose ${choiceTypeLabel}:</label>
            <select name="choice" autofocus>
              ${options.map(opt => `
                <option value="${opt.value}" ${opt.disabled ? 'disabled' : ''}>
                  ${opt.label}${opt.info ? ` - ${opt.info}` : ''}
                </option>
              `).join('')}
            </select>
            ${options.some(o => o.disabled) ? `
              <p class="hint">⚠️ Grayed out options are already trained or at maximum value.</p>
            ` : ''}
          </div>

          <div class="form-group info-box">
            <p><strong>Note:</strong> This perk can be taken multiple times with different selections.</p>
          </div>
        </form>
      `,
      ok: {
        label: 'Confirm Selection',
        icon: 'fa-solid fa-check',
        callback: (event, button, dialog) => {
          const formData = new foundry.applications.ux.FormDataExtended(button.form).object;
          return formData.choice;
        }
      },
      cancel: {
        label: 'Cancel',
        icon: 'fa-solid fa-times',
        callback: () => null
      },
      rejectClose: false, // Allow closing dialog without selection
      modal: true
    });

    return result;
  }

  /**
   * Get available choices based on choice type
   * @param {string} choiceType - Type of choice (skill, weaponSkill, stat, spell)
   * @param {VagabondActor} actor - The actor receiving the perk
   * @returns {Promise<Array<{value: string, label: string, disabled: boolean}>>}
   * @private
   */
  static async _getAvailableChoices(choiceType, actor) {
    switch (choiceType) {
      case 'skill':
        return Object.entries(CONFIG.VAGABOND.skills).map(([key, label]) => {
          const skill = actor?.system.skills?.[key];
          const isTrained = skill?.trained || false;
          const difficulty = skill?.difficulty || 10;

          return {
            value: key,
            label: game.i18n.localize(label),
            disabled: isTrained,
            info: isTrained ? `Already Trained (${difficulty})` : `Untrained (${difficulty})`
          };
        }).sort((a, b) => {
          // Sort: available first, then alphabetically
          if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
          return a.label.localeCompare(b.label);
        });

      case 'weaponSkill':
        return Object.entries(CONFIG.VAGABOND.weaponSkills).map(([key, label]) => {
          const weaponSkill = actor?.system.weaponSkills?.[key.toLowerCase()];
          const isTrained = weaponSkill?.trained || false;
          const difficulty = weaponSkill?.difficulty || 10;

          return {
            value: key,
            label: game.i18n.localize(label),
            disabled: isTrained,
            info: isTrained ? `Already Trained (${difficulty})` : `Untrained (${difficulty})`
          };
        }).sort((a, b) => {
          if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
          return a.label.localeCompare(b.label);
        });

      case 'stat':
        return Object.entries(CONFIG.VAGABOND.stats).map(([key, label]) => {
          const stat = actor?.system.stats?.[key];
          const currentValue = stat?.value || 0;
          const isMaxed = currentValue >= 7;

          return {
            value: key,
            label: game.i18n.localize(label),
            disabled: isMaxed,
            info: isMaxed ? `Maxed (${currentValue})` : `Current: ${currentValue}`
          };
        }).sort((a, b) => {
          if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
          return a.label.localeCompare(b.label);
        });

      case 'spell':
        // Get spells from compendium
        const spellPack = game.packs.get('vagabond.spells');
        if (!spellPack) {
          console.warn('Vagabond spell compendium not found');
          return [];
        }

        const spells = await spellPack.getDocuments();
        const knownSpellIds = actor?.items.filter(i => i.type === 'spell').map(s => s.name.toLowerCase()) || [];

        return spells.map(spell => ({
          value: spell.uuid,
          label: spell.name,
          disabled: knownSpellIds.includes(spell.name.toLowerCase())
        })).sort((a, b) => {
          if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
          return a.label.localeCompare(b.label);
        });

      default:
        console.warn(`Unknown choice type: ${choiceType}`);
        return [];
    }
  }

  /**
   * Get human-readable label for choice type
   * @param {string} choiceType
   * @returns {string}
   * @private
   */
  static _getChoiceTypeLabel(choiceType) {
    const labels = {
      skill: 'Skill',
      weaponSkill: 'Weapon Skill',
      stat: 'Stat',
      spell: 'Spell'
    };
    return labels[choiceType] || choiceType;
  }
}
