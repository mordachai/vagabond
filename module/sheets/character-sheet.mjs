import { VagabondActorSheet } from './actor-sheet.mjs';
import {
  SpellHandler,
  InventoryHandler,
  RollHandler,
  EquipmentHandler,
} from './handlers/_module.mjs';
import { bindHudTooltips } from '../helpers/hud-tooltip.mjs';

/**
 * Character-specific actor sheet
 * Extends the base VagabondActorSheet and adds handler delegation for character features
 */
export class VagabondCharacterSheet extends VagabondActorSheet {
  /**
   * @override
   */
  constructor(object, options) {
    super(object, options);

    // Initialize handlers for character-specific functionality
    this.spellHandler = new SpellHandler(this);
    this.inventoryHandler = new InventoryHandler(this);
    this.rollHandler = new RollHandler(this, { npcMode: false });
    this.equipmentHandler = new EquipmentHandler(this);

    // AbortController for cleaning up event listeners between renders
    this._listenerController = null;
  }

  /**
   * @override
   * Add character-specific classes and ensure correct width
   */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: ['vagabond', 'actor', 'character'],
    position: {
      width: 430  // Ensure character sheet keeps its proper width
    }
  });

  /**
   * @override
   * Add the "Become the HUD" entry to the window header controls menu
   * (moved here from the sliding panel). Uses the existing `becomeHud` action.
   */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.unshift({
      action: 'becomeHud',
      icon: 'fas fa-id-badge',
      label: 'VAGABOND.Hud.Become',
    });
    return controls;
  }

  // ===========================
  // Handler Delegation Methods
  // ===========================
  // These methods can be called from templates or by the base class
  // and will delegate to the appropriate handler

  /**
   * @override
   * Post-render setup for character-specific listeners
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Abort previous listeners and create a new controller
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    const { signal } = this._listenerController;

    bindHudTooltips(this.element, signal);

    // Self-heal any weapon hand-limit violation (legacy data, imports, macros)
    const { EquipmentHelper } = globalThis.vagabond.utils;
    EquipmentHelper.sanitizeHandLimit(this.actor).catch((err) =>
      console.error('Vagabond | Hand-limit sanitize failed:', err)
    );
  }

  /**
   * @override
   * Clean up before closing
   */
  async close(options) {
    this._listenerController?.abort();
    this._listenerController = null;
    return super.close(options);
  }

  /**
   * Setup spell listeners (called during render)
   */
  setupSpellListeners() {
    if (this.spellHandler) {
      this.spellHandler.setupListeners();
    }
  }
}
