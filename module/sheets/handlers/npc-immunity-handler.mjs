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

    const immunities = this.actor.system.immunities || [];
    const index = immunities.indexOf(damageType);

    if (index > -1) {
      // Remove immunity
      immunities.splice(index, 1);
    } else {
      // Add immunity
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

    const immunities = this.actor.system.immunities || [];
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

    const weaknesses = this.actor.system.weaknesses || [];
    const index = weaknesses.indexOf(damageType);

    if (index > -1) {
      // Remove weakness
      weaknesses.splice(index, 1);
    } else {
      // Add weakness
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

    const weaknesses = this.actor.system.weaknesses || [];
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

    const statusImmunities = this.actor.system.statusImmunities || [];
    const index = statusImmunities.indexOf(condition);

    if (index > -1) {
      // Remove status immunity
      statusImmunities.splice(index, 1);
    } else {
      // Add status immunity
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

    const statusImmunities = this.actor.system.statusImmunities || [];
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

    const speedTypes = this.actor.system.speedTypes || [];
    const index = speedTypes.indexOf(speedType);

    if (index > -1) {
      // Remove speed type
      speedTypes.splice(index, 1);
    } else {
      // Add speed type
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

    const speedTypes = this.actor.system.speedTypes || [];
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
   * Setup event listeners for immunity checkboxes
   */
  setupListeners() {
    // Handle immunities dropdown
    const immunitiesDropdown = this.sheet.element.querySelector('.npc-immunity-dropdown[data-save-target="system.immunities"]');
    if (immunitiesDropdown) {
      const checkboxes = immunitiesDropdown.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', async (event) => {
          const value = event.target.value;
          const immunities = [...(this.actor.system.immunities || [])];

          if (event.target.checked) {
            if (!immunities.includes(value)) {
              immunities.push(value);
            }
          } else {
            const index = immunities.indexOf(value);
            if (index > -1) {
              immunities.splice(index, 1);
            }
          }

          await this.actor.update({ 'system.immunities': immunities });
        });
      });
    }

    // Handle weaknesses dropdown
    const weaknessesDropdown = this.sheet.element.querySelector('.npc-immunity-dropdown[data-save-target="system.weaknesses"]');
    if (weaknessesDropdown) {
      const checkboxes = weaknessesDropdown.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', async (event) => {
          const value = event.target.value;
          const weaknesses = [...(this.actor.system.weaknesses || [])];

          if (event.target.checked) {
            if (!weaknesses.includes(value)) {
              weaknesses.push(value);
            }
          } else {
            const index = weaknesses.indexOf(value);
            if (index > -1) {
              weaknesses.splice(index, 1);
            }
          }

          await this.actor.update({ 'system.weaknesses': weaknesses });
        });
      });
    }

    // Handle status immunities dropdown
    const statusDropdown = this.sheet.element.querySelector('.npc-immunity-dropdown[data-save-target="system.statusImmunities"]');
    if (statusDropdown) {
      const checkboxes = statusDropdown.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', async (event) => {
          const value = event.target.value;
          const statusImmunities = [...(this.actor.system.statusImmunities || [])];

          if (event.target.checked) {
            if (!statusImmunities.includes(value)) {
              statusImmunities.push(value);
            }
          } else {
            const index = statusImmunities.indexOf(value);
            if (index > -1) {
              statusImmunities.splice(index, 1);
            }
          }

          await this.actor.update({ 'system.statusImmunities': statusImmunities });
        });
      });
    }

    // Handle speed types dropdown
    const speedTypesDropdown = this.sheet.element.querySelector('.npc-immunity-dropdown[data-save-target="system.speedTypes"]');
    if (speedTypesDropdown) {
      const checkboxes = speedTypesDropdown.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach((checkbox) => {
        checkbox.addEventListener('change', async (event) => {
          const value = event.target.value;
          const speedTypes = [...(this.actor.system.speedTypes || [])];

          if (event.target.checked) {
            if (!speedTypes.includes(value)) {
              speedTypes.push(value);
            }
          } else {
            const index = speedTypes.indexOf(value);
            if (index > -1) {
              speedTypes.splice(index, 1);
            }
          }

          await this.actor.update({ 'system.speedTypes': speedTypes });
        });
      });
    }
  }
}
