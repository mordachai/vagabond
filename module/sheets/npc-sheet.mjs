import { VagabondActorSheet } from './actor-sheet.mjs';
import { AccordionHelper } from '../helpers/accordion-helper.mjs';
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
   * Capture UI state before re-render
   */
  async _preRender(context, options) {
    await super._preRender(context, options);

    // Guard: element doesn't exist on first render
    if (!this.element) return;

    // Capture accordion state
    if (this._accordionStateManager) {
      this._accordionStateManager.capture();
    }

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

    // Initialize accordion state manager if not already created
    if (!this._accordionStateManager) {
      this._accordionStateManager = AccordionHelper.createStateManager(
        this.element,
        '.npc-action-edit, .npc-ability-edit'
      );
    } else {
      // Restore accordion state after render
      this._accordionStateManager.restore();
    }

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

    // Setup debounced input listeners for action/ability editing
    this._setupDebouncedInputListeners();

    // Manual binding for createDoc action (workaround for action inheritance issue)
    this._bindCreateDocActions();
  }

  /**
   * Manually bind createDoc actions to effect buttons
   * This is a workaround for action inheritance not working properly
   * @private
   */
  _bindCreateDocActions() {
    // Bind createDoc actions for effect creation
    const effectButtons = this.element.querySelectorAll('[data-action="createDoc"][data-document-class="ActiveEffect"]');
    
    effectButtons.forEach(button => {
      // Remove any existing listeners by cloning the button
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      
      // Add our enhanced createDoc logic
      newButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        try {
          // Call the static _createDoc method from the base class with proper context
          await this.constructor._createDoc.call(this, event, newButton);
          
          // Force a re-render to show the new effect
          await this.render(false);
        } catch (error) {
          console.error('Vagabond | Error creating effect:', error);
        }
      });
    });

    // Bind other effect actions (viewDoc, deleteDoc, toggleEffect)
    const effectActionButtons = this.element.querySelectorAll('[data-action="viewDoc"], [data-action="deleteDoc"], [data-action="toggleEffect"]');
    
    effectActionButtons.forEach(button => {
      const action = button.dataset.action;
      
      // Remove any existing listeners by cloning the button
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);
      
      // Add the appropriate action handler
      newButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        try {
          switch (action) {
            case 'viewDoc':
              const viewDoc = this.constructor._getEmbeddedDocument(newButton, this.actor);
              if (viewDoc) viewDoc.sheet.render(true);
              break;
            case 'deleteDoc':
              const deleteDoc = this.constructor._getEmbeddedDocument(newButton, this.actor);
              if (deleteDoc) {
                const confirmed = await Dialog.confirm({
                  title: `Delete ${deleteDoc.name}?`,
                  content: `<p>Are you sure you want to delete ${deleteDoc.name}?</p>`,
                });
                if (confirmed) {
                  await deleteDoc.delete();
                }
              }
              await this.render(false);
              break;
            case 'toggleEffect':
              const toggleEffect = this.constructor._getEmbeddedDocument(newButton, this.actor);
              if (toggleEffect) {
                await toggleEffect.update({ disabled: !toggleEffect.disabled });
              }
              await this.render(false);
              break;
          }
        } catch (error) {
          console.error(`Vagabond | Error with ${action}:`, error);
        }
      });
    });

    // Bind effects accordion toggle
    const effectsAccordionButton = this.element.querySelector('[data-action="toggleEffectsAccordion"]');
    
    if (effectsAccordionButton) {
      // Remove any existing listeners by cloning the button
      const newButton = effectsAccordionButton.cloneNode(true);
      effectsAccordionButton.parentNode.replaceChild(newButton, effectsAccordionButton);
      
      // Add accordion toggle logic
      newButton.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();
        
        try {
          const accordion = newButton.closest('.npc-effects');
          if (accordion) {
            const content = accordion.querySelector('.accordion-content');
            const icon = newButton.querySelector('.accordion-icon');
            
            if (content && icon) {
              const isCollapsed = content.classList.contains('collapsed');
              
              if (isCollapsed) {
                content.classList.remove('collapsed');
                content.classList.add('expanded');
                icon.classList.remove('fa-chevron-right');
                icon.classList.add('fa-chevron-down');
              } else {
                content.classList.remove('expanded');
                content.classList.add('collapsed');
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-right');
              }
            }
          }
        } catch (error) {
          console.error('Vagabond | Error with toggleEffectsAccordion:', error);
        }
      });
    }
  }

  // ===========================
  // Handler Delegation Methods
  // ===========================
  // These methods can be called from templates or by the base class
  // and will delegate to the appropriate handler

  /**
   * Setup debounced input listeners to prevent accordion closing on every keystroke
   * @private
   */
  _setupDebouncedInputListeners() {
    // Action inputs
    const actionInputs = this.element.querySelectorAll('.npc-action-edit input, .npc-action-edit textarea, .npc-action-edit select');
    actionInputs.forEach(input => {
      // Remove existing listeners by cloning
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);

      // Add debounced change listener
      newInput.addEventListener('input', (event) => {
        this._isDirty = true;
        this._debouncedSave();
        // DO NOT call this.render() here - this prevents accordion closing
      });

      // Save immediately on blur (when user clicks away)
      newInput.addEventListener('blur', async (event) => {
        if (this._isDirty) {
          await this._saveChanges();
          this._isDirty = false;
        }
      });
    });

    // Ability inputs
    const abilityInputs = this.element.querySelectorAll('.npc-ability-edit input, .npc-ability-edit textarea');
    abilityInputs.forEach(input => {
      // Remove existing listeners by cloning
      const newInput = input.cloneNode(true);
      input.parentNode.replaceChild(newInput, input);

      // Add debounced change listener
      newInput.addEventListener('input', (event) => {
        this._isDirty = true;
        this._debouncedSave();
        // DO NOT call this.render() here - this prevents accordion closing
      });

      // Save immediately on blur (when user clicks away)
      newInput.addEventListener('blur', async (event) => {
        if (this._isDirty) {
          await this._saveChanges();
          this._isDirty = false;
        }
      });
    });
  }

  /**
   * Save pending changes to the actor
   * @private
   */
  async _saveChanges() {
    if (!this._isDirty) return;

    try {
      // Capture accordion state before potential re-render
      if (this._accordionStateManager) {
        this._accordionStateManager.capture();
      }

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
        await this.actor.update(updateData);
      }

      this._isDirty = false;
    } catch (error) {
      console.error('Vagabond | Error saving NPC changes:', error);
      ui.notifications.error('Failed to save changes');
    }
  }

  /**
   * @override
   * Save changes before closing
   */
  async close(options) {
    if (this._isDirty) {
      await this._saveChanges();
    }
    return super.close(options);
  }
}
