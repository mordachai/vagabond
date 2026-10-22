import { VagabondImbueHelper } from '../helpers/imbue-helper.mjs';

/**
 * Equipment editor actions of VagabondItemSheet: weapon Properties / alt Skills, immunities, Bound,
 * on-hit / passive / Crit statuses, Armor blocked / resisted statuses, coatings, Imbue.
 * AppV2 action handlers: `this` is the sheet.
 */
export class ItemSheetEquipment {
  /**
   * Handle adding a new weapon property to a weapon item
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onToggleWeaponProperty(event, target) {
    const property = target.dataset.property;
    const isChecked = target.checked;
    const properties = this.item.system.properties || [];

    let newProperties;
    if (isChecked) {
      // Add property if not already present
      if (!properties.includes(property)) {
        newProperties = [...properties, property];
      } else {
        return; // Already exists
      }
    } else {
      // Remove property
      newProperties = properties.filter(p => p !== property);
    }

    await this.item.update({ 'system.properties': newProperties });
  }

  /**
   * Handle removing a weapon property from a weapon item (via tag x button)
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveWeaponProperty(event, target) {
    const property = target.dataset.property;
    if (!property) return;

    const properties = this.item.system.properties || [];
    const newProperties = properties.filter(p => p !== property);
    await this.item.update({ 'system.properties': newProperties });

    // Uncheck the corresponding checkbox
    const checkbox = this.element.querySelector(`input[type="checkbox"][data-property="${property}"]`);
    if (checkbox) checkbox.checked = false;
  }

  /**
   * Add/remove an alternate attack skill on a weapon (via checkbox)
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onToggleWeaponAltSkill(event, target) {
    const skill = target.dataset.skill;
    const altSkills = this.item.system.altSkills || [];
    const next = target.checked
      ? [...new Set([...altSkills, skill])]
      : altSkills.filter(s => s !== skill);
    await this.item.update({ 'system.altSkills': next });
  }

  /**
   * Remove an alternate attack skill from a weapon (via tag x button)
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveWeaponAltSkill(event, target) {
    const skill = target.dataset.skill;
    if (!skill) return;
    const altSkills = this.item.system.altSkills || [];
    await this.item.update({ 'system.altSkills': altSkills.filter(s => s !== skill) });
  }

  /**
   * Handle adding/removing immunity from armor (via checkbox)
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onToggleImmunity(event, target) {
    const immunity = target.dataset.immunity;
    const isChecked = target.checked;
    const immunities = this.item.system.immunities || [];

    let newImmunities;
    if (isChecked) {
      // Add immunity if not already present
      if (!immunities.includes(immunity)) {
        newImmunities = [...immunities, immunity];
      } else {
        return; // Already exists
      }
    } else {
      // Remove immunity
      newImmunities = immunities.filter(i => i !== immunity);
    }

    await this.item.update({ 'system.immunities': newImmunities });
  }

  /**
   * Handle removing an immunity from armor (via tag x button)
   *
   * @this VagabondItemSheet
   * @param {PointerEvent} event   The originating click event
   * @param {HTMLElement} target   The capturing HTML element which defined a [data-action]
   * @private
   */
  static async _onRemoveImmunity(event, target) {
    const immunity = target.dataset.immunity;
    if (!immunity) return;

    const immunities = this.item.system.immunities || [];
    const newImmunities = immunities.filter(i => i !== immunity);
    await this.item.update({ 'system.immunities': newImmunities });

    // Uncheck the corresponding checkbox
    const checkbox = this.element.querySelector(`input[type="checkbox"][data-immunity="${immunity}"]`);
    if (checkbox) checkbox.checked = false;
  }

  /**
   * Toggle the bound state of an equipment item.
   * @this VagabondItemSheet
   * @param {PointerEvent} event
   * @param {HTMLElement} target
   */
  static async _onToggleBound(event, target) {
    const currentBound = this.item.system.bound || false;

    // If trying to bind, check the actor's bounds limit
    if (!currentBound && this.item.parent) {
      const actor = this.item.parent;
      const currentBounds = actor.system.inventory?.currentBounds ?? 0;
      const maxBounds = actor.system.inventory?.maxBounds ?? 3;
      if (currentBounds >= maxBounds) {
        ui.notifications.warn(game.i18n.format('VAGABOND.UI.Labels.BoundsLimitReached', {
          name: this.item.name,
          current: currentBounds,
          max: maxBounds,
        }));
        return;
      }
    }

    const actorUuid = this.item.parent?.uuid ?? '';
    await this.item.update({ 'system.relic.boundTo': currentBound ? '' : actorUuid });
  }

  /**
   * Add a blank caused-status entry to the item's causedStatuses array.
   */
  static async _onAddCausedStatus(event, target) {
    const current = foundry.utils.deepClone(this.document.system.causedStatuses ?? []);
    current.push({
      statusId: '',
      // Spells: the flag means "only if also Cast to deal damage" — off by default (Effect stands alone)
      requiresDamage: this.document.type !== 'spell',
      saveType: 'none',
      duration: '',
      tickDamageEnabled: false,
      damageOnTick: '',
      damageType: '-',
      // TODO: fatigueOnTick: 0, — restore when re-enabling the fatigueOnTick feature
    });
    await this._safeUpdate({ 'system.causedStatuses': current });
  }

  /**
   * Remove a caused-status entry by index.
   */
  static async _onRemoveCausedStatus(event, target) {
    const idx = parseInt(target.dataset.index);
    if (isNaN(idx)) return;
    const current = foundry.utils.deepClone(this.document.system.causedStatuses ?? []);
    current.splice(idx, 1);
    await this._safeUpdate({ 'system.causedStatuses': current });
  }

  /**
   * Add a blank passiveCausedStatuses entry.
   */
  static async _onAddPassiveCausedStatus(event, target) {
    const current = foundry.utils.deepClone(this.document.system.passiveCausedStatuses ?? []);
    current.push({
      statusId: '',
      requiresDamage: true,
      saveType: 'none',
      duration: '',
      tickDamageEnabled: false,
      damageOnTick: '',
      damageType: '-',
    });
    await this._safeUpdate({ 'system.passiveCausedStatuses': current });
  }

  /**
   * Remove a passiveCausedStatuses entry by index.
   */
  static async _onRemovePassiveCausedStatus(event, target) {
    const idx = parseInt(target.dataset.index);
    if (isNaN(idx)) return;
    const current = foundry.utils.deepClone(this.document.system.passiveCausedStatuses ?? []);
    current.splice(idx, 1);
    await this._safeUpdate({ 'system.passiveCausedStatuses': current });
  }

  /**
   * Add a blank critCausedStatuses entry.
   */
  static async _onAddCritCausedStatus(event, target) {
    const current = foundry.utils.deepClone(this.document.system.critCausedStatuses ?? []);
    current.push({
      statusId: '',
      // Spells: the flag means "only if also Cast to deal damage" — off by default (Effect stands alone)
      requiresDamage: this.document.type !== 'spell',
      saveType: 'none',
      duration: '',
      tickDamageEnabled: false,
      damageOnTick: '',
      damageType: '-',
      // TODO: fatigueOnTick: 0, — restore when re-enabling the fatigueOnTick feature
    });
    await this._safeUpdate({ 'system.critCausedStatuses': current });
  }

  /**
   * Remove a critCausedStatuses entry by index.
   */
  static async _onRemoveCritCausedStatus(event, target) {
    const idx = parseInt(target.dataset.index);
    if (isNaN(idx)) return;
    const current = foundry.utils.deepClone(this.document.system.critCausedStatuses ?? []);
    current.splice(idx, 1);
    await this._safeUpdate({ 'system.critCausedStatuses': current });
  }

  /**
   * Toggle a status in the armor's blockedStatuses array (full immunity).
   */
  static async _onToggleBlockedStatus(event, target) {
    const statusId = target.dataset.statusId;
    if (!statusId) return;
    const current = foundry.utils.deepClone(this.document.system.blockedStatuses ?? []);
    const idx = current.indexOf(statusId);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(statusId);
    await this._safeUpdate({ 'system.blockedStatuses': current }, { render: false });
  }

  /**
   * Toggle a status in the armor's resistedStatuses array (favored save).
   */
  static async _onToggleResistedStatus(event, target) {
    const statusId = target.dataset.statusId;
    if (!statusId) return;
    const current = foundry.utils.deepClone(this.document.system.resistedStatuses ?? []);
    const idx = current.indexOf(statusId);
    if (idx >= 0) current.splice(idx, 1);
    else current.push(statusId);
    await this._safeUpdate({ 'system.resistedStatuses': current }, { render: false });
  }

  /**
   * Apply this alchemical item as a coating to a weapon in the actor's inventory.
   * Opens a dialog listing owned weapons, then writes system.coating to the chosen weapon.
   */
  static async _onApplyCoating(event, target) {
    const actor = this.document.parent;
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Status.Coating.NoActor'));
      return;
    }

    // Gather weapons in inventory
    const weapons = actor.items.filter(i =>
      i.type === 'equipment' && i.system.equipmentType === 'weapon'
    );
    if (!weapons.length) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Status.Coating.NoWeapons'));
      return;
    }

    // Build dialog content
    const options = weapons.map(w =>
      `<option value="${w.id}">${w.name}</option>`
    ).join('');

    const content = `
      <form>
        <div class="form-group">
          <label>${game.i18n.localize('VAGABOND.Status.Coating.SelectWeapon')}</label>
          <select name="weaponId">${options}</select>
        </div>
      </form>`;

    new Dialog({
      title: game.i18n.format('VAGABOND.Status.Coating.DialogTitle', { item: this.document.name }),
      content,
      buttons: {
        apply: {
          icon: '<i class="fas fa-flask"></i>',
          label: game.i18n.localize('VAGABOND.Status.Coating.Apply'),
          callback: async (html) => {
            const weaponId = html.find('[name="weaponId"]').val();
            const weapon = actor.items.get(weaponId);
            if (!weapon) return;

            const ItemClass = this.document.constructor;
            if (this.document.system.isConsumable && ItemClass._chargesRemaining(this.document) <= 0) {
              ui.notifications.warn(`Cannot apply ${this.document.name}: no charges remaining.`);
              return;
            }

            const causedStatuses = foundry.utils.deepClone(
              this.document.system.causedStatuses ?? []
            );

            await weapon.update({
              'system.coating': {
                sourceName: this.document.name,
                charges: 1,
                causedStatuses,
              },
            });

            // Applying a coating IS using the item — spend a charge same as any other use.
            if (this.document.system.isConsumable) {
              await ItemClass._consumeCharge(this.document);
            }

            ui.notifications.info(
              game.i18n.format('VAGABOND.Status.Coating.Applied', {
                item: this.document.name,
                weapon: weapon.name,
              })
            );
          },
        },
        cancel: {
          label: game.i18n.localize('Cancel'),
        },
      },
      default: 'apply',
    }).render(true);
  }

  /**
   * Clear an active Imbue payload from this weapon (manual cancel, GM or owner).
   */
  static async _onClearImbue(event, target) {
    const payload = this.document.system.imbuedSpell;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.Status.Imbue.ClearTitle') },
      content: `<p>${game.i18n.format('VAGABOND.Status.Imbue.ClearConfirm', { spellName: payload.spellName, weaponName: this.document.name })}</p>`,
      rejectClose: false,
      modal: true,
    });
    if (!confirmed) return;
    await VagabondImbueHelper.clearImbue(this.document);
  }
}
