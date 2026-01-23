import { VagabondActorSheet } from './actor-sheet.mjs';
import {
  RollHandler,
  NPCImmunityHandler,
  NPCActionHandler,
} from './handlers/_module.mjs';

/**
 * NPC-specific actor sheet
 * Extends the base VagabondActorSheet and adds handler delegation for NPC features
 */
export class VagabondNPCSheet extends VagabondActorSheet {
  /**
   * @override
   */
  constructor(object, options) {
    super(object, options);

    // Initialize handlers for NPC-specific functionality
    this.rollHandler = new RollHandler(this, { npcMode: true });
    this.immunityHandler = new NPCImmunityHandler(this);
    this.actionHandler = new NPCActionHandler(this);
  }

  /**
   * @override
   * Add NPC-specific classes
   */
  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'actor', 'npc'],
  };

  // ===========================
  // Handler Delegation Methods
  // ===========================
  // These methods can be called from templates or by the base class
  // and will delegate to the appropriate handler
}
