import { AccordionHelper } from '../../helpers/accordion-helper.mjs';

/**
 * Handler for NPC actions and abilities management.
 * Manages adding/removing actions, abilities, and their accordion states.
 */
export class NPCActionHandler {
  /** Per-list DOM contract used by the reordering code (chevrons + drag handle) */
  static REORDER = {
    actions: { selector: '.npc-action-edit', indexKey: 'actionIndex', attr: 'data-action-index', idPrefix: 'action' },
    abilities: { selector: '.npc-ability-edit', indexKey: 'abilityIndex', attr: 'data-ability-index', idPrefix: 'ability' },
  };

  static REORDER_MIME = 'application/x-vagabond-npc-entry';

  /**
   * @param {VagabondActorSheet} sheet - The parent actor sheet
   */
  constructor(sheet) {
    this.sheet = sheet;
    this.actor = sheet.actor;
    this._openActionAccordions = [];
    this._openAbilityAccordions = [];
  }

  /**
   * Add a new action
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async addAction(event, target) {
    event.preventDefault();

    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    actions.push({
      name: '',
      note: '',
      recharge: '',
      flatDamage: '',
      rollDamage: '',
      damageType: this.validateDamageType('-'), // Ensure valid default
      attackType: 'melee',
      extraInfo: '',
    });

    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Remove an action
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async removeAction(event, target) {
    event.preventDefault();

    const index = parseInt(target.dataset.actionIndex);
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);

    actions.splice(index, 1);

    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Toggle action accordion
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleActionAccordion(event, target) {
    event.preventDefault();
    
    // Find the accordion container using the target element (Foundry V2 pattern)
    const accordionContainer = target.closest('.npc-action-edit');
    
    if (!accordionContainer) {
      console.error('NPCActionHandler: Could not find accordion container for action accordion');
      return;
    }

    AccordionHelper.toggle(accordionContainer);
  }

  /**
   * Add a new ability
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async addAbility(event, target) {
    event.preventDefault();

    const abilities = foundry.utils.deepClone(this.actor.system.abilities || []);
    abilities.push({
      name: '',
      description: '',
    });

    await this.actor.update({ 'system.abilities': abilities });
  }

  /**
   * Remove an ability
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async removeAbility(event, target) {
    event.preventDefault();

    const index = parseInt(target.dataset.abilityIndex);
    const abilities = foundry.utils.deepClone(this.actor.system.abilities || []);

    abilities.splice(index, 1);

    await this.actor.update({ 'system.abilities': abilities });
  }

  /**
   * Toggle ability accordion
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async toggleAbilityAccordion(event, target) {
    event.preventDefault();
    
    // Find the accordion container using the target element (Foundry V2 pattern)
    const accordionContainer = target.closest('.npc-ability-edit');
    
    if (!accordionContainer) {
      console.error('NPCActionHandler: Could not find accordion container for ability accordion');
      return;
    }

    AccordionHelper.toggle(accordionContainer);
  }

  /**
   * Chevron button: move an action/ability one step up or down
   * @param {'actions'|'abilities'} kind
   * @param {Event} event
   * @param {HTMLElement} target - The chevron button (carries data-direction)
   */
  async moveEntry(kind, event, target) {
    event.preventDefault();

    const cfg = NPCActionHandler.REORDER[kind];
    const from = parseInt(target.closest(cfg.selector)?.dataset[cfg.indexKey]);
    if (isNaN(from)) return;

    const direction = target.dataset.direction;
    await this.reorderEntry(kind, from, from + (direction === 'up' ? -1 : 1), { focus: direction });
  }

  /**
   * Move an action/ability from one position to another and persist the new order.
   * Shared by the chevron buttons and the drag handle.
   * @param {'actions'|'abilities'} kind
   * @param {number} from - Current index
   * @param {number} to - Index the entry ends up at
   * @param {object} [options]
   * @param {string} [options.focus] - Chevron direction to re-focus after the re-render
   */
  async reorderEntry(kind, from, to, { focus = null } = {}) {
    if (this._reordering) return;

    const cfg = NPCActionHandler.REORDER[kind];
    const sheet = this.sheet;
    // Flush typed-but-unsaved edits first so they travel with the entries they belong to
    if (sheet._isDirty) await sheet._saveChanges(false);
    // A blur-triggered save may still be in flight (clicking a chevron blurs the field first)
    await sheet._pendingSave?.catch(() => {});

    const list = foundry.utils.deepClone(this.actor.system[kind] ?? []);
    if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return;

    const order = list.map((_, i) => i);
    order.splice(to, 0, ...order.splice(from, 1));
    const reordered = order.map(i => list[i]);
    // Identical entries swapping places change nothing, so no render would consume the pending remap
    if (foundry.utils.objectsEqual(reordered, list)) return;

    this._reordering = true;
    try {
      // Accordion ids are index-based; NPC sheet _preRender follows the entries to their new index
      sheet._pendingReorder = { kind, order };
      // Old vertical positions (by old index) so the re-rendered entries can slide into place
      const tops = [];
      sheet.element?.querySelectorAll(cfg.selector).forEach(el => {
        tops[parseInt(el.dataset[cfg.indexKey])] = el.getBoundingClientRect().top;
      });
      sheet._movedEntry = { kind, index: to, focus, order, tops };
      await this.actor.update({ [`system.${kind}`]: reordered });
    } catch (error) {
      sheet._pendingReorder = null;
      sheet._movedEntry = null;
      console.error('Vagabond | Error reordering NPC entries:', error);
      ui.notifications.error('Failed to reorder');
    } finally {
      this._reordering = false;
    }
  }

  /**
   * Wire drag-handle reordering for the action/ability editors.
   * Only the handle arms dragging (entries hold text inputs, so they are not draggable by default).
   * Call from the sheet's _onRender after the DOM exists.
   * @param {AbortSignal} signal - Signal for listener cleanup
   */
  setupReorder(signal) {
    const root = this.sheet.element;
    if (!root) return;

    // dragend is not reliable everywhere, so disarm on mouseup as well (deferred one tick so a
    // legitimate drop still reads the drag state first). Bubble phase on purpose.
    document.addEventListener('mouseup', () => setTimeout(() => this._disarmReorder(root), 0), { signal });

    for (const [kind, cfg] of Object.entries(NPCActionHandler.REORDER)) {
      root.querySelectorAll(cfg.selector).forEach(entry => this._bindReorderEntry(kind, cfg, entry, signal));
    }

    // After a reorder re-render: slide entries from their old position and keep keyboard focus on the chevron
    const moved = this.sheet._movedEntry;
    this.sheet._movedEntry = null;
    if (moved) {
      const cfg = NPCActionHandler.REORDER[moved.kind];
      const entry = root.querySelector(`${cfg.selector}[${cfg.attr}="${moved.index}"]`);
      if (entry) {
        root.querySelectorAll(cfg.selector).forEach(el => {
          const newIndex = parseInt(el.dataset[cfg.indexKey]);
          const delta = moved.tops[moved.order[newIndex]] - el.getBoundingClientRect().top;
          if (!delta) return;
          el.animate(
            [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
            { duration: 220, easing: 'ease-out' }
          );
        });
        const buttons = [moved.focus, moved.focus === 'up' ? 'down' : 'up']
          .map(dir => entry.querySelector(`.npc-move-btn[data-direction="${dir}"]:not([disabled])`));
        // preventScroll: the viewport must not jump away from where the user is working
        buttons.find(Boolean)?.focus({ preventScroll: true });
      }
    }
  }

  /** Turn dragging back off and drop visual state once a drag is over */
  _disarmReorder(root = this.sheet.element) {
    this._drag = null;
    root?.querySelectorAll('.npc-action-edit, .npc-ability-edit').forEach(el => {
      el.draggable = false;
      el.classList.remove('is-dragging', 'drop-before', 'drop-after');
    });
  }

  /**
   * @param {'actions'|'abilities'} kind
   * @param {object} cfg - Entry of NPCActionHandler.REORDER
   * @param {HTMLElement} entry - `.npc-action-edit` / `.npc-ability-edit`
   * @param {AbortSignal} signal
   * @private
   */
  _bindReorderEntry(kind, cfg, entry, signal) {
    const handle = entry.querySelector('[data-reorder-handle]');
    if (!handle) return; // unnamed (still being created) entries have no header, so no controls

    const indexOf = el => parseInt(el.dataset[cfg.indexKey]);
    const isAfter = (e) => {
      const rect = entry.getBoundingClientRect();
      return e.clientY > rect.top + rect.height / 2;
    };

    handle.addEventListener('mousedown', () => { entry.draggable = true; }, { signal });

    entry.addEventListener('dragstart', (e) => {
      if (e.target !== entry) return; // text-selection drags inside the inputs
      if (!entry.draggable) { e.preventDefault(); return; }
      e.stopPropagation(); // keep Foundry's sheet-level drag handling out of it

      this._drag = { kind, index: indexOf(entry) };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(NPCActionHandler.REORDER_MIME, `${kind}:${this._drag.index}`);
      const header = entry.querySelector('.accordion-header');
      if (header) e.dataTransfer.setDragImage(header, 16, header.offsetHeight / 2);
      entry.classList.add('is-dragging');
    }, { signal });

    // dragenter needs preventDefault too, or some engines never fire drop
    const onOver = (e) => {
      if (this._drag?.kind !== kind) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const after = isAfter(e);
      const self = this._drag.index === indexOf(entry);
      entry.classList.toggle('drop-before', !self && !after);
      entry.classList.toggle('drop-after', !self && after);
    };
    entry.addEventListener('dragenter', onOver, { signal });
    entry.addEventListener('dragover', onOver, { signal });

    entry.addEventListener('dragleave', (e) => {
      if (entry.contains(e.relatedTarget)) return;
      entry.classList.remove('drop-before', 'drop-after');
    }, { signal });

    entry.addEventListener('drop', (e) => {
      const drag = this._drag;
      if (drag?.kind !== kind) return;
      e.preventDefault();
      e.stopPropagation();

      // Insertion slot, then shift down by one when the dragged entry sat above it
      let to = indexOf(entry) + (isAfter(e) ? 1 : 0);
      if (to > drag.index) to -= 1;

      this._disarmReorder();
      this.reorderEntry(kind, drag.index, to);
    }, { signal });

    entry.addEventListener('dragend', () => this._disarmReorder(), { signal });
  }

  /**
   * Add a blank causedStatuses entry to an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  async addNpcActionStatus(event, target) {
    event.preventDefault();
    const actionIndex = parseInt(target.dataset.actionIndex);
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[actionIndex]) return;
    if (!Array.isArray(actions[actionIndex].causedStatuses)) {
      actions[actionIndex].causedStatuses = [];
    }
    actions[actionIndex].causedStatuses.push({
      statusId: '',
      requiresDamage: true,
      saveType: 'any',
      duration: '',
      tickDamageEnabled: false,
      damageOnTick: '',
      damageType: '-',
      // TODO: fatigueOnTick: 0, — restore when re-enabling the fatigueOnTick feature
    });
    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Remove a causedStatuses entry from an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  async removeNpcActionStatus(event, target) {
    event.preventDefault();
    const actionIndex = parseInt(target.closest('.npc-caused-statuses')?.dataset.actionIndex);
    const statusIndex = parseInt(target.dataset.statusIndex);
    if (isNaN(actionIndex) || isNaN(statusIndex)) return;
    this.sheet._isDirty = false;
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[actionIndex]?.causedStatuses) return;
    actions[actionIndex].causedStatuses.splice(statusIndex, 1);
    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Add a blank critCausedStatuses entry to an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  async addNpcActionCritStatus(event, target) {
    event.preventDefault();
    const actionIndex = parseInt(target.dataset.actionIndex);
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[actionIndex]) return;
    if (!Array.isArray(actions[actionIndex].critCausedStatuses)) {
      actions[actionIndex].critCausedStatuses = [];
    }
    actions[actionIndex].critCausedStatuses.push({
      statusId: '',
      requiresDamage: true,
      saveType: 'any',
      duration: '',
      tickDamageEnabled: false,
      damageOnTick: '',
      damageType: '-',
      // TODO: fatigueOnTick: 0, — restore when re-enabling the fatigueOnTick feature
    });
    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Remove a critCausedStatuses entry from an NPC action
   * @param {Event} event
   * @param {HTMLElement} target
   */
  async removeNpcActionCritStatus(event, target) {
    event.preventDefault();
    const actionIndex = parseInt(target.closest('.npc-caused-statuses')?.dataset.actionIndex);
    const statusIndex = parseInt(target.dataset.statusIndex);
    if (isNaN(actionIndex) || isNaN(statusIndex)) return;
    this.sheet._isDirty = false;
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    if (!actions[actionIndex]?.critCausedStatuses) return;
    actions[actionIndex].critCausedStatuses.splice(statusIndex, 1);
    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Create countdown dice from recharge action
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The target element
   */
  async createCountdownFromRecharge(event, target) {
    event.preventDefault();

    // The clicked element may be a countdown-dice-trigger span with data-dice-size,
    // or it may be inside an action row with data-action-index
    const trigger = target.closest('.countdown-dice-trigger') || target;
    const diceSize = trigger.dataset.diceSize;

    // If the trigger has a dice size directly (from text parser), use it
    if (diceSize) {
      const { CountdownDice } = globalThis.vagabond.documents;
      const diceType = `d${diceSize}`;

      // Try to get a name from the parent action/ability context
      const actionRow = trigger.closest('[data-action-index]');
      const abilityRow = trigger.closest('[data-ability-index]');
      let name = 'Countdown';

      if (actionRow) {
        const idx = parseInt(actionRow.dataset.actionIndex);
        const action = (this.actor.system.actions || [])[idx];
        if (action?.name) name = action.name;
      } else if (abilityRow) {
        const idx = parseInt(abilityRow.dataset.abilityIndex);
        const ability = (this.actor.system.abilities || [])[idx];
        if (ability?.name) name = ability.name;
      }

      await CountdownDice.create({
        name: name,
        diceType: diceType,
      });
      ui.notifications.info(`Created ${diceType} countdown dice for ${name}`);
      return;
    }

    // Fallback: action-based lookup (legacy path)
    const actionIndex = parseInt(target.dataset.actionIndex);
    const actions = this.actor.system.actions || [];
    const action = actions[actionIndex];

    if (!action || !action.recharge) {
      ui.notifications.warn('No recharge value set for this action!');
      return;
    }

    const { CountdownDice } = globalThis.vagabond.documents;

    await CountdownDice.create({
      name: action.name,
      actorId: this.actor.id,
      diceType: action.recharge,
      actionIndex: actionIndex,
    });

    ui.notifications.info(`Created countdown dice for ${action.name}`);
  }

  /**
   * Apply weapon data to an NPC action when a weapon is selected from the dropdown.
   * Sets the action name, rollDamage, flatDamage, and damageType from the weapon item.
   * @param {number} actionIndex - Index of the action to update
   * @param {string} weaponUuid - UUID of the selected weapon, or '' to deselect
   */
  async applyWeaponToAction(actionIndex, weaponUuid) {
    const actions = foundry.utils.deepClone(this.actor.system.actions || []);
    const action = actions[actionIndex];
    if (!action) return;

    if (!weaponUuid) {
      // Weapon deselected — restore pre-weapon values and clear stored data
      const baseName = (action.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      action.name          = action.weaponPrevName ?? baseName;
      action.flatDamage    = action.weaponPrevFlatDamage ?? action.flatDamage;
      action.rollDamage    = action.weaponPrevRollDamage ?? action.rollDamage;
      action.weaponId              = '';
      action.weaponPrevName        = '';
      action.weaponPrevFlatDamage  = '';
      action.weaponPrevRollDamage  = '';
      await this.actor.update({ 'system.actions': actions });
      return;
    }

    // Load full weapon document from UUID
    let weapon;
    try {
      weapon = await fromUuid(weaponUuid);
    } catch (e) {
      console.error('NPCActionHandler: Failed to load weapon from UUID:', weaponUuid, e);
      return;
    }
    if (!weapon) {
      console.warn('NPCActionHandler: Weapon not found for UUID:', weaponUuid);
      return;
    }

    // Choose damage fields based on grip ('2H' uses two-hand values; everything else uses one-hand)
    const grip = weapon.system.grip || '1H';
    let damageFormula, damageType;
    if (grip === '2H') {
      damageFormula = weapon.system.damageTwoHands || weapon.system.damageOneHand || '';
      damageType    = weapon.system.damageTypeTwoHands || weapon.system.damageTypeOneHand || '-';
    } else {
      damageFormula = weapon.system.damageOneHand || '';
      damageType    = weapon.system.damageTypeOneHand || '-';
    }
    // Material effects (die size shift, Adamant +1) — same as the weapon's own attack
    if (damageFormula) damageFormula = weapon.system.materialDamageFormula?.(damageFormula) ?? damageFormula;
    // Fallback to generic damageAmount
    if (!damageFormula) damageFormula = weapon.system.damageAmount || '';
    if (!damageType || damageType === '-') damageType = weapon.system.damageType || '-';

    // Strip any previously appended weapon "(…)" to get the base name
    const baseName = (action.name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

    // Only save pre-weapon values if no weapon was previously set (first application)
    if (!action.weaponId) {
      action.weaponPrevName        = baseName;
      action.weaponPrevFlatDamage  = action.flatDamage;
      action.weaponPrevRollDamage  = action.rollDamage;
    }

    action.name        = baseName ? `${baseName} (${weapon.name})` : weapon.name;
    action.weaponId    = weaponUuid;
    action.rollDamage  = damageFormula;
    action.damageType  = this.validateDamageType(damageType);
    action.flatDamage  = NPCActionHandler._computeHalfMax(damageFormula);

    await this.actor.update({ 'system.actions': actions });
  }

  /**
   * Compute half of the maximum possible result for a dice formula string.
   * e.g. "2d6" → max 12 → "6"; "d8+2" → max 10 → "5"; "2d6+1d4" → max 16 → "8"
   * @param {string} formula
   * @returns {string} Floor of (max / 2), or '' for empty input
   */
  static _computeHalfMax(formula) {
    if (!formula) return '';
    let maxTotal = 0;
    // Replace every dice group (e.g. "2d6", "d8") with 0, accumulating the max value
    const cleaned = formula.replace(/(\d*)d(\d+)/gi, (match, count, sides) => {
      const n = parseInt(count || '1') || 1;
      const s = parseInt(sides);
      maxTotal += n * s;
      return '0';
    });
    // Evaluate any remaining flat modifiers (e.g. "+2", "-1")
    if (cleaned.replace(/\s/g, '') !== '0' && cleaned.replace(/\s/g, '') !== '') {
      try {
        const flat = Roll.safeEval(cleaned);
        if (Number.isFinite(flat)) maxTotal += flat;
      } catch (e) { /* ignore unparseable modifier */ }
    }
    return String(Math.floor(maxTotal / 2));
  }

  /**
   * Capture accordion state before re-render
   */
  captureAccordionState() {
    this._openActionAccordions = AccordionHelper.getOpenIds(
      this.sheet.element,
      '.npc-action-edit'
    );
    this._openAbilityAccordions = AccordionHelper.getOpenIds(
      this.sheet.element,
      '.npc-ability-edit'
    );
  }

  /**
   * Restore accordion state after re-render
   */
  restoreAccordionState() {
    AccordionHelper.restoreState(this.sheet.element, this._openActionAccordions, '.npc-action-edit');
    AccordionHelper.restoreState(
      this.sheet.element,
      this._openAbilityAccordions,
      '.npc-ability-edit'
    );
  }

  /**
   * Validate and sanitize damage type values
   * @param {string} damageType - The damage type value to validate
   * @returns {string} - The validated damage type or "-" as fallback
   */
  validateDamageType(damageType) {
    // Get valid damage types from CONFIG
    const validTypes = Object.keys(CONFIG.VAGABOND.damageTypes);
    
    // If no damage type provided or empty, default to "-"
    if (!damageType || damageType === '') {
      return '-';
    }
    
    // If damage type is valid, return it
    if (validTypes.includes(damageType)) {
      return damageType;
    }
    
    // If invalid damage type, log warning and return default
    console.warn(`NPCActionHandler: Invalid damage type "${damageType}" provided, defaulting to "-". Valid types are: ${validTypes.join(', ')}`);
    return '-';
  }

  /**
   * Setup event listeners for buffered action and ability editing
   * NOTE: Input change handling is now managed by the main NPC sheet
   * to prevent accordion closing issues. This method is kept for compatibility.
   */
  setupListeners() {
    // Action and ability input handling is now managed by the main NPC sheet
    // via debounced input listeners to prevent accordion closing on every keystroke.
    // This method is kept for any future non-input event handling.
  }
}
