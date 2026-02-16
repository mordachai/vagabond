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

    // Debounced save to prevent accordion closing on every keystroke
    this._debouncedSave = foundry.utils.debounce(
      this._saveChanges.bind(this),
      1000 // Save 1 second after last keystroke
    );

    // Track if we have unsaved changes
    this._isDirty = false;

    // Accordion state manager
    this._accordionStateManager = null;

    // AbortController for cleaning up event listeners between renders
    this._listenerController = null;
  }

  /**
   * @override
   * Add NPC-specific classes and set correct width
   */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: ['vagabond', 'actor', 'npc'],
    position: {
      width: 380,
      height: 'auto'
    }
  }, { inplace: false });

  /**
   * @override
   * Capture UI state before the DOM is replaced.
   */
  async _preRender(context, options) {
    await super._preRender(context, options);

    // Guard: element doesn't exist on first render
    if (!this.element) return;

    // Capture dropdown (details) open state
    if (this.immunityHandler) {
      this.immunityHandler.captureDropdownState();
    }

    // Capture description open state
    const descRow = this.element.querySelector('.npc-description-collapsible');
    this._descriptionOpen = descRow ? descRow.classList.contains('open') : false;
  }

  /**
   * @override
   * Post-render setup for NPC-specific listeners
   */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Abort previous listeners and create a new controller
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    const { signal } = this._listenerController;

    // Restore dropdown state after render
    if (this.immunityHandler) {
      this.immunityHandler.restoreDropdownState();
    }

    // Restore description open state
    if (this._descriptionOpen) {
      const descRow = this.element.querySelector('.npc-description-collapsible');
      if (descRow) {
        descRow.classList.remove('collapsed');
        descRow.classList.add('open');
      }
    }

    // Setup immunity handler listeners for checkboxes
    if (this.immunityHandler) {
      this.immunityHandler.setupListeners();
    }

    // Setup action handler listeners for buffered editing
    if (this.actionHandler) {
      this.actionHandler.setupListeners();
    }

    // Toggle padding on npc-content when it has scrollable overflow
    const npcContent = this.element.querySelector('.npc-content');
    if (npcContent) {
      const updateScrollClass = () => npcContent.classList.toggle('has-scroll', npcContent.scrollHeight > npcContent.clientHeight);
      requestAnimationFrame(updateScrollClass);
      this._scrollObserver?.disconnect();
      this._scrollObserver = new ResizeObserver(() => {
        requestAnimationFrame(updateScrollClass);
      });
      this._scrollObserver.observe(npcContent);
    }

    // Setup debounced input listeners for action/ability editing
    this._setupDebouncedInputListeners(signal);

    // Manual binding for createDoc action (workaround for action inheritance issue)
    this._bindCreateDocActions(signal);

    // Bind manual save actions for creation
    this._bindSaveActions(signal);
  }

  /**
   * Bind save actions for manual save during creation
   * @param {AbortSignal} signal - Signal for listener cleanup
   * @private
   */
  _bindSaveActions(signal) {
    const saveButtons = this.element.querySelectorAll('[data-action="saveAction"], [data-action="saveAbility"]');
    saveButtons.forEach(button => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        this._isDirty = true; // Force dirty to ensure save happens
        await this._saveChanges(false); // Save data without relying on update's render

        // Explicitly force a re-render to expand the accordion and update the UI
        await this.render(true);
      }, { signal });
    });
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
          await this.render(false);
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
              await this.render(false);
              break;
            case 'toggleEffect':
              const toggleEffect = this.constructor._getEmbeddedDocument(button, this.actor);
              if (toggleEffect) {
                await toggleEffect.update({ disabled: !toggleEffect.disabled });
              }
              await this.render(false);
              break;
          }
        } catch (error) {
          console.error(`Vagabond | Error with ${action}:`, error);
        }
      }, { signal });
    });
  }

  // ===========================
  // Handler Delegation Methods
  // ===========================
  // These methods can be called from templates or by the base class
  // and will delegate to the appropriate handler

  /**
   * Setup debounced input listeners to prevent accordion closing on every keystroke
   * @param {AbortSignal} signal - Signal for listener cleanup
   * @private
   */
  _setupDebouncedInputListeners(signal) {
    // Action inputs
    const actionInputs = this.element.querySelectorAll('.npc-action-edit input, .npc-action-edit textarea, .npc-action-edit select');
    actionInputs.forEach(input => {
      input.addEventListener('input', () => {
        this._isDirty = true;
        this._debouncedSave();
      }, { signal });

      input.addEventListener('blur', async () => {
        if (this._isDirty) {
          await this._saveChanges();
          this._isDirty = false;
        }
      }, { signal });
    });

    // Ability inputs
    const abilityInputs = this.element.querySelectorAll('.npc-ability-edit input, .npc-ability-edit textarea');
    abilityInputs.forEach(input => {
      input.addEventListener('input', () => {
        this._isDirty = true;
        this._debouncedSave();
      }, { signal });

      input.addEventListener('blur', async () => {
        if (this._isDirty) {
          await this._saveChanges();
          this._isDirty = false;
        }
      }, { signal });
    });
  }

  /**
   * Save pending changes to the actor
   * @param {boolean} render - Whether to re-render the sheet after update (default: false)
   * @private
   */
  async _saveChanges(render = false) {
    if (!this._isDirty) return;

    try {
      // Collect all action data from inputs
      const actionEdits = this.element.querySelectorAll('.npc-action-edit');
      const actions = [];

      actionEdits.forEach((actionEdit) => {
        const actionIndex = parseInt(actionEdit.dataset.actionIndex);
        const inputs = actionEdit.querySelectorAll('[data-field]');

        const actionData = {};
        inputs.forEach(input => {
          const field = input.dataset.field;
          let value = input.value;

          // Apply validation for damage type fields
          if (field === 'damageType' && this.actionHandler) {
            value = this.actionHandler.validateDamageType(value);
          }

          actionData[field] = value;
        });

        actions[actionIndex] = actionData;
      });

      // Collect all ability data from inputs
      const abilityEdits = this.element.querySelectorAll('.npc-ability-edit');
      const abilities = [];

      abilityEdits.forEach((abilityEdit) => {
        const abilityIndex = parseInt(abilityEdit.dataset.abilityIndex);
        const inputs = abilityEdit.querySelectorAll('[data-field]');

        const abilityData = {};
        inputs.forEach(input => {
          const field = input.dataset.field;
          abilityData[field] = input.value;
        });

        abilities[abilityIndex] = abilityData;
      });

      // Update actor with collected data
      const updateData = {};
      if (actions.length > 0) {
        updateData['system.actions'] = actions;
      }
      if (abilities.length > 0) {
        updateData['system.abilities'] = abilities;
      }

      if (Object.keys(updateData).length > 0) {
        await this.actor.update(updateData, { render: render });
      }

      this._isDirty = false;
    } catch (error) {
      console.error('Vagabond | Error saving NPC changes:', error);
      ui.notifications.error('Failed to save changes');
    }
  }

  /**
   * @override
   * Save changes and clean up before closing
   */
  async close(options) {
    if (this._isDirty) {
      await this._saveChanges();
    }
    this._listenerController?.abort();
    this._listenerController = null;
    return super.close(options);
  }
}
