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
    this._dropdownOpen = false;
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
    const dropdown = this.sheet.element.querySelector('.npc-resistances-dropdown');
    this._dropdownOpen = dropdown?.hasAttribute('open') ?? false;

    // Also capture speed types dropdown
    const speedDropdown = this.sheet.element.querySelector('.npc-immunity-dropdown[data-save-target="system.speedTypes"]');
    this._speedDropdownOpen = speedDropdown?.hasAttribute('open') ?? false;
  }

  /**
   * Restore dropdown state after re-render
   */
  restoreDropdownState() {
    if (this._dropdownOpen) {
      const dropdown = this.sheet.element.querySelector('.npc-resistances-dropdown');
      if (dropdown) dropdown.setAttribute('open', '');
    }
    if (this._speedDropdownOpen) {
      const speedDropdown = this.sheet.element.querySelector('.npc-immunity-dropdown[data-save-target="system.speedTypes"]');
      if (speedDropdown) speedDropdown.setAttribute('open', '');
    }
  }

  /**
   * Setup event listeners for immunity checkboxes and dropdown toggle
   */
  setupListeners() {
    // Find the single resistances dropdown (distinct from speed types dropdown)
    const dropdown = this.sheet.element.querySelector('.npc-resistances-dropdown');
    if (!dropdown) return;

    // Find all checkbox groups by data-save-target on wrapper divs
    const groups = dropdown.querySelectorAll('.npc-resistance-group[data-save-target]');
    for (const group of groups) {
      const field = group.dataset.saveTarget;

      // Checkbox changes save silently (no re-render) so dropdown stays open
      const checkboxes = group.querySelectorAll('input[type="checkbox"]');
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
    }

    // Also handle speed types dropdown (separate details element)
    const speedDropdown = this.sheet.element.querySelector('.npc-immunity-dropdown[data-save-target="system.speedTypes"]');
    if (speedDropdown) {
      const checkboxes = speedDropdown.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', async (event) => {
          const value = event.target.value;
          const arr = [...(foundry.utils.getProperty(this.actor, 'system.speedTypes') || [])];

          if (event.target.checked) {
            if (!arr.includes(value)) arr.push(value);
          } else {
            const index = arr.indexOf(value);
            if (index > -1) arr.splice(index, 1);
          }

          await this.actor.update({ 'system.speedTypes': arr }, { render: false });
        });
      });

      speedDropdown.addEventListener('toggle', (event) => {
        if (!speedDropdown.open) {
          this.sheet.render(false);
        }
      });
    }

    // When the resistances dropdown closes, re-render to update the tags display
    dropdown.addEventListener('toggle', (event) => {
      if (!dropdown.open) {
        this.sheet.render(false);
      }
    });

    // Close open dropdowns when clicking outside them
    this.sheet.element.addEventListener('pointerdown', (event) => {
      const openDropdowns = this.sheet.element.querySelectorAll('.npc-immunity-dropdown[open]');
      for (const dd of openDropdowns) {
        if (!dd.contains(event.target)) {
          dd.removeAttribute('open');
        }
      }
    });
  }
}
