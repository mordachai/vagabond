import { VagabondActorSheet } from './actor-sheet.mjs';
import {
  SpellHandler,
  InventoryHandler,
  RollHandler,
  EquipmentHandler,
} from './handlers/_module.mjs';
import { bindHudTooltips } from '../helpers/hud-tooltip.mjs';
import { AlchemyLab } from '../helpers/alchemy-lab.mjs';
import { FeatureOrder } from '../helpers/feature-order.mjs';

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
    },
    // Alchemy tab (Alchemist lab): labStation, labCraft, labMix, labLearn…
    actions: { ...AlchemyLab.ACTIONS },
  });

  /**
   * @override
   * Compact view: a visible header button (left of the controls kebab) that
   * swaps this sheet for the floating HUD (`becomeHud`). The HUD's top-left
   * corner tab swaps back (`VagabondCharacterHud._onExpandSheet`).
   */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    const header = frame.querySelector('.window-header');
    if (header && !header.querySelector('[data-action="becomeHud"]')) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'header-control icon fa-solid fa-down-left-and-up-right-to-center';
      btn.dataset.action = 'becomeHud';
      btn.dataset.tooltip = game.i18n.localize('VAGABOND.Hud.BecomeTooltip');
      btn.setAttribute('aria-label', game.i18n.localize('VAGABOND.Hud.Become'));
      const anchor = header.querySelector('[data-action="toggleControls"]')
        ?? header.querySelector('[data-action="close"]');
      header.insertBefore(btn, anchor);
    }
    return frame;
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

    // Alchemy tab: selection, drag-drop (learn / Mix slots), Library search, Mix carousel
    AlchemyLab.wire(this, this.element, signal);

    // Features tab: drag Features / Perks / Traits rows into the player's order
    FeatureOrder.wire(this.element, this.actor, signal);

    // Stat boxes display the TOTAL (base + perks/effects) but edit the BASE.
    // Unfocused they carry no `name`, so form submits never write total into base.
    for (const input of this.element.querySelectorAll('input.stat-score[data-stat-name]')) {
      input.addEventListener('focus', () => {
        input.name = input.dataset.statName;
        input.value = input.dataset.base;
        input.select();
      }, { signal });
      input.addEventListener('blur', () => {
        input.removeAttribute('name');
        input.value = input.dataset.total;
      }, { signal });
      input.addEventListener('change', (ev) => {
        // Commit explicitly: blur strips the name before the form-level change handler could read it
        ev.stopPropagation();
        const value = Number(input.value);
        if (Number.isFinite(value) && value !== Number(input.dataset.base)) {
          this.actor.update({ [input.dataset.statName]: value });
        }
      }, { signal });
    }

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
