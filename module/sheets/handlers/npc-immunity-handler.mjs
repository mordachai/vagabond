/**
 * Handler for NPC immunity, weakness, and zone management.
 * Manages damage immunities, weaknesses, status immunities, speed types, and zones.
 */
export class NPCImmunityHandler {
  /**
   * @param {VagabondActorSheet} sheet - The parent actor sheet
   */
  constructor(sheet) {
    this.sheet = sheet;
    this.actor = sheet.actor;
    this._openDropdowns = [];
  }

  /**
   * Toggle damage immunity
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleImmunity(event, target) {
    event.preventDefault();
    const damageType = target.dataset.damageType;

    const immunities = [...(this.actor.system.immunities || [])];
    const index = immunities.indexOf(damageType);

    if (index > -1) {
      immunities.splice(index, 1);
    } else {
      immunities.push(damageType);
    }

    await this.actor.update({ 'system.immunities': immunities });
  }

  /**
   * Remove damage immunity
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async removeImmunity(event, target) {
    event.preventDefault();
    const immunity = target.dataset.immunity;

    const immunities = [...(this.actor.system.immunities || [])];
    const index = immunities.indexOf(immunity);

    if (index > -1) {
      immunities.splice(index, 1);
      await this.actor.update({ 'system.immunities': immunities });
    }
  }

  /**
   * Toggle damage weakness
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleWeakness(event, target) {
    event.preventDefault();
    const damageType = target.dataset.damageType;

    const weaknesses = [...(this.actor.system.weaknesses || [])];
    const index = weaknesses.indexOf(damageType);

    if (index > -1) {
      weaknesses.splice(index, 1);
    } else {
      weaknesses.push(damageType);
    }

    await this.actor.update({ 'system.weaknesses': weaknesses });
  }

  /**
   * Remove damage weakness
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async removeWeakness(event, target) {
    event.preventDefault();
    const weakness = target.dataset.weakness;

    const weaknesses = [...(this.actor.system.weaknesses || [])];
    const index = weaknesses.indexOf(weakness);

    if (index > -1) {
      weaknesses.splice(index, 1);
      await this.actor.update({ 'system.weaknesses': weaknesses });
    }
  }

  /**
   * Toggle status condition immunity
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleStatusImmunity(event, target) {
    event.preventDefault();
    const condition = target.dataset.condition;

    const statusImmunities = [...(this.actor.system.statusImmunities || [])];
    const index = statusImmunities.indexOf(condition);

    if (index > -1) {
      statusImmunities.splice(index, 1);
    } else {
      statusImmunities.push(condition);
    }

    await this.actor.update({ 'system.statusImmunities': statusImmunities });
  }

  /**
   * Remove status condition immunity
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async removeStatusImmunity(event, target) {
    event.preventDefault();
    const status = target.dataset.status;

    const statusImmunities = [...(this.actor.system.statusImmunities || [])];
    const index = statusImmunities.indexOf(status);

    if (index > -1) {
      statusImmunities.splice(index, 1);
      await this.actor.update({ 'system.statusImmunities': statusImmunities });
    }
  }

  /**
   * Toggle speed type
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleSpeedType(event, target) {
    event.preventDefault();
    const speedType = target.dataset.speedType;

    const speedTypes = [...(this.actor.system.speedTypes || [])];
    const index = speedTypes.indexOf(speedType);

    if (index > -1) {
      speedTypes.splice(index, 1);
    } else {
      speedTypes.push(speedType);
    }

    await this.actor.update({ 'system.speedTypes': speedTypes });
  }

  /**
   * Remove speed type
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async removeSpeedType(event, target) {
    event.preventDefault();
    const speedType = target.dataset.type;

    const speedTypes = [...(this.actor.system.speedTypes || [])];
    const index = speedTypes.indexOf(speedType);

    if (index > -1) {
      speedTypes.splice(index, 1);
      await this.actor.update({ 'system.speedTypes': speedTypes });
    }
  }

  /**
   * Select zone
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async selectZone(event, target) {
    event.preventDefault();
    const zone = target.dataset.zone;

    await this.actor.update({ 'system.zone': zone });
  }

  /**
   * Clear zone
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async clearZone(event, target) {
    event.preventDefault();

    await this.actor.update({ 'system.zone': '' });
  }

  /**
   * Capture dropdown state before re-render
   */
  captureDropdownState() {
    this._openDropdowns = [];
    const dropdowns = this.sheet.element.querySelectorAll('.npc-immunity-dropdown[open]');
    dropdowns.forEach((dropdown, index) => {
      this._openDropdowns.push(index);
    });
  }

  /**
   * Restore dropdown state after re-render
   */
  restoreDropdownState() {
    this._openDropdowns.forEach((index) => {
      const dropdowns = this.sheet.element.querySelectorAll('.npc-immunity-dropdown');
      if (dropdowns[index]) {
        dropdowns[index].setAttribute('open', '');
      }
    });
  }

  /**
   * Setup event listeners for immunity checkboxes and dropdown toggle
   */
  setupListeners() {
    // All dropdown configs: selector → system field name
    const dropdownConfigs = [
      { selector: 'system.immunities', field: 'system.immunities' },
      { selector: 'system.weaknesses', field: 'system.weaknesses' },
      { selector: 'system.statusImmunities', field: 'system.statusImmunities' },
      { selector: 'system.speedTypes', field: 'system.speedTypes' },
    ];

    for (const { selector, field } of dropdownConfigs) {
      const dropdown = this.sheet.element.querySelector(`.npc-immunity-dropdown[data-save-target="${selector}"]`);
      if (!dropdown) continue;

      // Checkbox changes save silently (no re-render) so dropdown stays open
      const checkboxes = dropdown.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', async (event) => {
          const value = event.target.value;
          const arr = [...(foundry.utils.getProperty(this.actor, field) || [])];

          if (event.target.checked) {
            if (!arr.includes(value)) arr.push(value);
          } else {
            const index = arr.indexOf(value);
            if (index > -1) arr.splice(index, 1);
          }

          await this.actor.update({ [field]: arr }, { render: false });
        });
      });

      // When the dropdown closes, re-render to update the tags display
      dropdown.addEventListener('toggle', (event) => {
        if (!dropdown.open) {
          this.sheet.render(false);
        }
      });
    }

    // Close open dropdowns when clicking outside them
    this.sheet.element.addEventListener('pointerdown', (event) => {
      const openDropdowns = this.sheet.element.querySelectorAll('.npc-immunity-dropdown[open]');
      for (const dropdown of openDropdowns) {
        if (!dropdown.contains(event.target)) {
          dropdown.removeAttribute('open');
        }
      }
    });
  }
}
