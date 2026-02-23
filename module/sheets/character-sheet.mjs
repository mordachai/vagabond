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

    // Manual binding for createDoc action (workaround for action inheritance issue)
    this._bindCreateDocActions(signal);
  }

  /**
   * Manually bind createDoc actions to effect buttons
   * This is a workaround for action inheritance not working properly
   * @param {AbortSignal} signal - Signal for listener cleanup
   * @private
   */
  _bindCreateDocActions(signal) {
    // Bind createDoc actions for effect creation
    const effectButtons = this.element.querySelectorAll('[data-action="createDoc"][data-document-class="ActiveEffect"]');

    effectButtons.forEach(button => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        try {
          await this.constructor._createDoc.call(this, event, button);
          await this.render(false, { parts: ['effects'] });
        } catch (error) {
          console.error('Vagabond | Error creating effect:', error);
        }
      }, { signal });
    });

    // Bind other effect actions (viewDoc, deleteDoc, toggleEffect)
    const effectActionButtons = this.element.querySelectorAll('[data-action="viewDoc"], [data-action="deleteDoc"], [data-action="toggleEffect"]');

    effectActionButtons.forEach(button => {
      const action = button.dataset.action;

      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        try {
          switch (action) {
            case 'viewDoc':
              const viewDoc = this.constructor._getEmbeddedDocument(button, this.actor);
              if (viewDoc) viewDoc.sheet.render(true);
              break;
            case 'deleteDoc':
              const deleteDoc = this.constructor._getEmbeddedDocument(button, this.actor);
              if (deleteDoc) {
                const confirmed = await foundry.applications.api.DialogV2.confirm({
                  window: { title: `Delete ${deleteDoc.name}?` },
                  content: `<p>Are you sure you want to delete ${deleteDoc.name}?</p>`,
                });
                if (confirmed) {
                  await deleteDoc.delete();
                }
              }
              await this.render(false, { parts: ['effects'] });
              break;
            case 'toggleEffect':
              const toggleEffect = this.constructor._getEmbeddedDocument(button, this.actor);
              if (toggleEffect) {
                await toggleEffect.update({ disabled: !toggleEffect.disabled });
              }
              await this.render(false, { parts: ['effects'] });
              break;
          }
        } catch (error) {
          console.error(`Vagabond | Error with ${action}:`, error);
        }
      }, { signal });
    });
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
