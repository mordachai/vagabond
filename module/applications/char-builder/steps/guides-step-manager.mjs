/**
 * Guides Step Manager — the Build Guide gallery of the guide path.
 *
 * Picking a guide SEEDS the regular builder state instead of copying the guide Actor, so the chosen Ancestry's
 * grants (Human Aptitude / Strong Potential, Elf Naturally Attuned, Dwarf Tough…), validation and Finish all
 * work as in the full builder:
 *   Class (ClassStepManager.applyClass) → Stats ('guide' array) → Training (paid into the pools)
 *   → Perks (into the grants) → Spells (Class slots, then grants) → Starting Pack (for Customize).
 * Whatever the guide leaves open becomes the guide path's remaining steps (`state.guideOpenSteps`).
 * Gear and coins are copied from the guide Actor at Finish (the generator already resolved trade-ins / purchases).
 */
import { BaseStepManager } from './base-step-manager.mjs';
import { BuildGuideService } from '../services/build-guide-service.mjs';
import { buildMiniSheetContent } from '../../../helpers/item-sections.mjs';
import { isStepDone, applicableSteps, DEFAULT_STEP_ORDER } from './step-gating.mjs';

/** Steps a guide can leave open, in builder order */
const OPENABLE_STEPS = ['stats', 'spells', 'alchemy', 'perks'];

export class GuidesStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);

    this.actionHandlers = {
      'selectOption': this._onSelectGuide.bind(this),
      'filterGuides': this._onFilterGuides.bind(this),
      'flipGuide': this._onFlipGuide.bind(this),
      'toggleGuideHidden': this._onToggleGuideHidden.bind(this),
      'guideItemInfo': this._onGuideItemInfo.bind(this)
    };

    this.requiredData = [];

    /** All step managers (set by the builder; seeding drives the Class / Stats / Perks / Spells managers) */
    this.managers = null;

    // Gallery UI state (kept across renders, never part of the build)
    this.classFilter = 'all';
    this.search = '';
    this.flipped = new Set();
  }

  get stepName() {
    return 'guides';
  }

  _getStatePaths() {
    return ['selectedGuide'];
  }

  isComplete() {
    return isStepDone('guides', this.getCurrentState());
  }

  async _prepareStepSpecificContext(state) {
    const cards = (await BuildGuideService.cards()).map(card => ({
      ...card,
      selected: card.uuid === state.selectedGuide,
      flipped: this.flipped.has(card.uuid),
      filteredOut: !this._matches(card.classKey, card.searchText)
    }));

    // One filter chip per Class, in gallery order
    const classes = [...new Map(cards.map(c => [c.classKey, { key: c.classKey, label: c.className }])).values()]
      .map(c => ({ ...c, active: this.classFilter === c.key }));
    if (!classes.some(c => c.active)) this.classFilter = 'all';

    return {
      guideStage: 'guides',
      guideCards: cards,
      guideClasses: classes,
      guideFilterAll: this.classFilter === 'all',
      guideSearch: this.search,
      isGM: game.user.isGM,
      hasSelection: !!state.selectedGuide,
      showTray: false,
      useTripleColumn: false
    };
  }

  _matches(classKey, searchText) {
    if (this.classFilter !== 'all' && classKey !== this.classFilter) return false;
    return !this.search || String(searchText ?? '').includes(this.search);
  }

  /**
   * Show / hide the cards for the current Class chip + search without a re-render.
   * @param {HTMLElement} root - builder element
   */
  applyFilter(root) {
    root?.querySelectorAll('.guide-card').forEach(card => {
      card.classList.toggle('filtered-out', !this._matches(card.dataset.class, card.dataset.search));
    });
    root?.querySelectorAll('.guide-filter-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.class === this.classFilter);
    });
    const empty = root?.querySelector('.guide-empty');
    if (empty) empty.classList.toggle('hidden', !!root.querySelector('.guide-card:not(.filtered-out)'));
  }

  /** Search box input (wired by the builder's _onRender) */
  setSearch(value, root) {
    this.search = String(value ?? '').trim().toLowerCase();
    this.applyFilter(root);
  }

  _onFilterGuides(event, target) {
    this.classFilter = target.dataset.class || 'all';
    this.applyFilter(target.closest('.vagabond-builder'));
  }

  _onFlipGuide(event, target) {
    const card = target.closest('.guide-card');
    const uuid = card?.dataset.uuid;
    if (!uuid) return;
    if (this.flipped.has(uuid)) this.flipped.delete(uuid);
    else this.flipped.add(uuid);
    card.classList.toggle('is-flipped', this.flipped.has(uuid));
  }

  /**
   * Item popup for a card chip (Weapon, Armor, Trinket, Spell, Perk): the inventory mini-sheet layout,
   * description enriched. A raw DOM popup on <body> like the inventory one; closes on any outside click / Esc.
   */
  async _onGuideItemInfo(event, target) {
    event.stopPropagation();
    const item = await fromUuid(target.dataset.uuid).catch(() => null);
    if (!item) return;
    GuidesStepManager.closeItemInfo();

    const description = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
      secrets: false, relativeTo: item
    });
    const popup = document.createElement('div');
    popup.className = 'inventory-mini-sheet guide-item-info';
    popup.style.position = 'fixed';
    popup.style.zIndex = '10000';
    popup.innerHTML = buildMiniSheetContent(item, { description });
    document.body.appendChild(popup);

    // Next to the chip, kept on screen
    const r = target.getBoundingClientRect();
    const { width, height } = popup.getBoundingClientRect();
    const left = r.right + 8 + width > window.innerWidth ? Math.max(8, r.left - width - 8) : r.right + 8;
    popup.style.left = `${left}px`;
    popup.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - height - 8))}px`;

    const controller = new AbortController();
    GuidesStepManager.#infoPopup = { popup, controller };
    const { signal } = controller;
    popup.querySelector('.mini-sheet-close')?.addEventListener('click', () => GuidesStepManager.closeItemInfo(), { signal });
    setTimeout(() => {
      document.addEventListener('click', ev => {
        if (!popup.contains(ev.target)) GuidesStepManager.closeItemInfo();
      }, { signal, capture: true });
      document.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') GuidesStepManager.closeItemInfo();
      }, { signal });
    }, 0);
  }

  /** @type {{popup: HTMLElement, controller: AbortController}|null} */
  static #infoPopup = null;

  /** Remove the chip popup (also called when the builder closes) */
  static closeItemInfo() {
    GuidesStepManager.#infoPopup?.controller.abort();
    GuidesStepManager.#infoPopup?.popup.remove();
    GuidesStepManager.#infoPopup = null;
  }

  async _onToggleGuideHidden(event, target) {
    await BuildGuideService.toggleHidden(target.closest('.guide-card')?.dataset.uuid);
  }

  async _onSelectGuide(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    if (uuid !== this.getCurrentState().selectedGuide) {
      await this.seed(uuid);
      return;
    }
    // Clicking the picked card again deselects it: every pick it seeded goes, the guide path stays
    this.managers.path.clearBuild();
    this.stateManager.updateMultiple({ creationPath: 'guide', furthestStep: 'guides', previewUuid: null }, { skipValidation: true });
  }

  /**
   * Fill the builder state from a Build Guide (Ancestry must already be chosen).
   * @param {string} uuid - Build Guide Actor uuid
   * @returns {Promise<boolean>} false when the guide could not be used
   */
  async seed(uuid) {
    const m = this.managers;
    const actor = await fromUuid(uuid).catch(() => null);
    const plan = actor?.flags?.vagabond?.buildGuide;
    const classItem = plan?.classId
      ? await fromUuid(BuildGuideService.packUuid('classes', plan.classId)).catch(() => null)
      : null;
    if (!classItem) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.CharBuilder.Guides.Unavailable'));
      return false;
    }

    // Class first: it resets Training / Perks / Spells and sets the Spell / formula limits
    await m.class.applyClass(classItem);

    // Stats ('guide' array) before Training: Reason sets the size of its Training pool
    m.stats.applyGuideStats(plan.stats?.['1'] ?? {});
    await m.stats.refreshBonusCount();
    const skills = await m.stats.training.seedSkills(BuildGuideService.trainedSkills(actor));

    const perkIds = (plan.perks ?? []).filter(p => p.level === 1).flatMap(p => p.perkIds ?? []).filter(Boolean);
    const perkUuids = perkIds.map(id => BuildGuideService.packUuid('perks', id));
    const perks = await m.perks.seedGrants(perkUuids);

    const spellUuids = (plan.spells?.startIds ?? []).flat().filter(Boolean).map(id => BuildGuideService.packUuid('spells', id));
    const spells = await m.spells.seedSpells(spellUuids);

    this.stateManager.updateMultiple({
      selectedGuide: uuid,
      creationPath: 'guide',
      selectedStartingPack: plan.startingPackId ? BuildGuideService.packUuid('starting-packs', plan.startingPackId) : null,
      gear: [],
      guideUnplaced: { skills, perks, spells },
      previewUuid: null
    }, { skipValidation: true });

    this.updateState('guideOpenSteps', await this._openSteps(perkUuids), { skipValidation: true });
    // Re-reveal the remaining steps one by one
    const order = applicableSteps(this.getCurrentState(), this._stepOrder());
    if (order.indexOf(this.getCurrentState().furthestStep) > order.indexOf('guides')) {
      this.updateState('furthestStep', 'guides', { skipValidation: true });
    }
    return true;
  }

  /**
   * The steps the guide leaves open for the player (snapshot: a step does not vanish once its choice is made).
   * @param {string[]} guidePerkUuids
   * @returns {Promise<string[]>}
   */
  async _openSteps(guidePerkUuids) {
    const state = this.getCurrentState();
    const open = new Set();

    if (!isStepDone('stats', state)) open.add('stats');
    if (await this.managers.spells.hasOpenChoices()) open.add('spells');
    if ((state.formulaLimit || 0) > (state.formulas || []).length) open.add('alchemy');

    const grantsOpen = (state.perkGrants || []).some(g => !g.fulfilled);
    let choicePending = false;
    for (const uuid of guidePerkUuids) {
      const perk = await fromUuid(uuid).catch(() => null);
      const cc = perk?.system?.choiceConfig;
      if (cc?.type && cc.type !== 'none' && !cc.selected) { choicePending = true; break; }
    }
    if (grantsOpen || choicePending) open.add('perks');

    return OPENABLE_STEPS.filter(s => open.has(s));
  }

  _stepOrder() {
    try {
      const order = this.configSystem.getStepOrder();
      return order?.length ? order : DEFAULT_STEP_ORDER;
    } catch (error) {
      return DEFAULT_STEP_ORDER;
    }
  }
}
