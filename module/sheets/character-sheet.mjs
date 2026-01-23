import { VagabondActorSheet } from './actor-sheet.mjs';
import {
  SpellHandler,
  InventoryHandler,
  RollHandler,
  EquipmentHandler,
} from './handlers/_module.mjs';

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
  }

  /**
   * @override
   * Add character-specific actions
   */
  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'actor', 'character'],
  };

  // ===========================
  // Handler Delegation Methods
  // ===========================
  // These methods can be called from templates or by the base class
  // and will delegate to the appropriate handler

  /**
   * Setup spell listeners (called during render)
   */
  setupSpellListeners() {
    if (this.spellHandler) {
      this.spellHandler.setupListeners();
    }
  }
}
