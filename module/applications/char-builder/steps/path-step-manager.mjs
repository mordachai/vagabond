/**
 * Path Step Manager — the binary choice right after Ancestry: start from a Build Guide or build from scratch.
 *
 *   - Build Guide → Guides step (gallery); the picked guide seeds the builder state (GuidesStepManager.seed).
 *   - Builder     → the full step list from Class on, nothing pre-filled.
 *   - Customize   → (once a guide is picked) the full step list with the guide's picks already in place.
 *
 * Every choice can be revisited: the Path tab stays open on both paths. Switching discards picks only after
 * the player confirms.
 */
import { BaseStepManager } from './base-step-manager.mjs';
import { BuildGuideService } from '../services/build-guide-service.mjs';
import { furthestAfter, isStepDone, DEFAULT_STEP_ORDER } from './step-gating.mjs';

export class PathStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);

    this.actionHandlers = {
      'choosePath': this._onChoosePath.bind(this)
    };

    this.requiredData = [];

    /** All step managers (set by the builder; the Guides manager re-seeds a guide) */
    this.managers = null;
  }

  get stepName() {
    return 'path';
  }

  _getStatePaths() {
    return ['creationPath'];
  }

  isComplete() {
    return isStepDone('path', this.getCurrentState());
  }

  async _prepareStepSpecificContext(state) {
    const guides = await BuildGuideService.visibleGuides();
    const seeded = state.selectedGuide ? (await BuildGuideService.loadGuides()).find(g => g.uuid === state.selectedGuide) : null;
    const seededCard = seeded ? BuildGuideService.cardModel(seeded, await BuildGuideService.getActor(seeded.uuid)) : null;
    return {
      guideStage: 'path',
      pathChoice: {
        current: state.creationPath,
        isGuide: state.creationPath === 'guide',
        isBuilder: state.creationPath === 'builder',
        guideCount: guides.length,
        hasGuides: guides.length > 0,
        // The guide picked so far (Change build / Customize strip)
        seeded: seededCard ? {
          name: seeded.name,
          img: seededCard.img,
          className: seededCard.className,
          buildName: seededCard.buildName,
          customized: state.creationPath === 'builder'
        } : null
      },
      showTray: false,
      useTripleColumn: false
    };
  }

  /** Step order from configuration, defaults until it loads */
  _stepOrder() {
    try {
      const order = this.configSystem.getStepOrder();
      return order?.length ? order : DEFAULT_STEP_ORDER;
    } catch (error) {
      return DEFAULT_STEP_ORDER;
    }
  }

  /** Move to a step (and record it as reached) */
  _goTo(step, furthest = null) {
    const order = this._stepOrder();
    this.stateManager.updateMultiple({
      currentStep: step,
      furthestStep: furthest ?? furthestAfter(this.getCurrentState(), step, order),
      previewUuid: null
    }, { skipValidation: true });
  }

  async _confirm(key) {
    return !!(await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.CharBuilder.Path.SwitchTitle') },
      content: `<p>${game.i18n.localize(`VAGABOND.CharBuilder.Path.${key}`)}</p>`,
      rejectClose: false
    }));
  }

  async _onChoosePath(event, target) {
    const path = target.dataset.path;
    const state = this.getCurrentState();

    if (path === 'guide') {
      if (state.creationPath === 'builder') {
        // Leaving a hand-made (or customized) build: the guide replaces those picks
        if (state.selectedClass && !(await this._confirm('ConfirmToGuide'))) return;
        this.updateState('creationPath', 'guide', { skipValidation: true });
        if (state.selectedGuide) await this.managers?.guides?.seed(state.selectedGuide);
        else this.clearBuild();
      } else {
        this.updateState('creationPath', 'guide', { skipValidation: true });
      }
      this._goTo('guides');
      return;
    }

    if (path === 'customize') {
      if (!state.selectedGuide) return;
      this.updateState('creationPath', 'builder', { skipValidation: true });
      // Every step is already filled: reveal them all (gating still locks any step after an unfinished one)
      const order = this._stepOrder();
      this._goTo('class', order[order.length - 1]);
      return;
    }

    if (path === 'builder') {
      const keepsPicks = state.creationPath === 'builder' && !state.selectedGuide;
      if (!keepsPicks) {
        if (state.selectedClass && !(await this._confirm('ConfirmToBuilder'))) return;
        this.clearBuild();
      }
      this.updateState('creationPath', 'builder', { skipValidation: true });
      this._goTo('class');
    }
  }

  /**
   * Forget every pick made after Ancestry (Class, Stats, Training, Spells, Formulae, Perks, gear) and the guide.
   */
  clearBuild() {
    const statKeys = (CONFIG.VAGABOND.homebrew?.stats ?? []).map(s => s.key);
    const keys = statKeys.length ? statKeys : ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];
    this.stateManager.updateMultiple({
      selectedGuide: null,
      guideStats: null,
      guideOpenSteps: [],
      guideUnplaced: null,
      selectedClass: null,
      skillGrant: null,
      skills: [],
      skillSelections: {},
      trainingPools: null,
      selectedArrayId: null,
      assignedStats: Object.fromEntries(keys.map(k => [k, null])),
      unassignedValues: [],
      selectedValue: null,
      statArraysOpen: false,
      appliedBonuses: {},
      spells: [],
      spellGrants: [],
      spellLimit: 0,
      formulas: [],
      formulaLimit: 0,
      perks: [],
      classPerks: [],
      perkGrants: [],
      perkChoices: {},
      perkSkills: {},
      perkStatBonuses: {},
      perkStatSources: {},
      lastClassForPerks: null,
      selectedStartingPack: null,
      gear: [],
      furthestStep: 'path'
    }, { skipValidation: true });
  }
}
