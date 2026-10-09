/**
 * Alchemy Step Manager — the Alchemist's Level 1 formula picks (book Alchemy feature: "Choose 4 Alchemical Items
 * worth 50s or less"). Own step, only present when the chosen Class grants formulae (`state.formulaLimit`, set on
 * Class pick — see step-gating `isStepApplicable`). Same list → preview → tray flow as the Spells step.
 * Finish writes the picks to `system.craft.formulas`.
 */
import { BaseStepManager } from './base-step-manager.mjs';
import { isStepDone } from './step-gating.mjs';
import { AlchemyHelper } from '../../../helpers/crafting/alchemy-helper.mjs';
import { ALCHEMY_COST } from '../../../helpers/crafting/alchemy-mode.mjs';
import { CurrencyHelper } from '../../../helpers/currency-helper.mjs';
import { VagabondDamagePipeline } from '../../../helpers/damage-pipeline.mjs';

export class AlchemyStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);

    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'removeFromTray': this._onRemoveFromTray.bind(this),
      'clearTray': this._onClearTray.bind(this),
      'randomize': this._onRandomize.bind(this)
    };

    // The catalog comes from AlchemyHelper (Item packs the GM enabled for the builder)
    this.requiredData = [];
  }

  get stepName() {
    return 'alchemy';
  }

  _getStatePaths() {
    return ['formulas', 'previewUuid'];
  }

  /** Value cap (copper) of a Level 1 formula for the chosen Class. */
  async _capCopper(state) {
    const classItem = state.selectedClass ? await fromUuid(state.selectedClass).catch(() => null) : null;
    return AlchemyHelper.formulaValueCapAtLevel(classItem, 1);
  }

  /** Catalog rows with the builder's list flags. */
  async _loadOptions(state, capCopper) {
    const picked = new Set(state.formulas || []);
    const all = await AlchemyHelper.availableAlchemicals();
    return all
      .filter(a => a.cost <= capCopper || picked.has(a.uuid))
      .map(a => ({
        uuid: a.uuid,
        name: a.name,
        img: a.img,
        type: 'equipment',
        cost: a.cost,
        costLabel: CurrencyHelper.format(a.cost),
        selected: picked.has(a.uuid),
        damageTypeIcon: a.damageType ? CONFIG.VAGABOND.damageTypeIcons?.[a.damageType] || null : null,
        damageTypeLabel: a.damageType ? game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[a.damageType] ?? a.damageType) : null
      }));
  }

  async _prepareStepSpecificContext(state) {
    const limit = state.formulaLimit || 0;
    const capCopper = await this._capCopper(state);
    const options = await this._loadOptions(state, capCopper);
    const formulas = state.formulas || [];
    const previewUuid = state.previewUuid;

    let previewItem = null;
    if (previewUuid) {
      try {
        const item = await fromUuid(previewUuid);
        if (item) {
          previewItem = {
            ...item.toObject(),
            uuid: previewUuid,
            enrichedDescription: await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
              async: true, secrets: false, relativeTo: item
            }),
            displayStats: this._displayStats(item)
          };
        }
      } catch (error) {
        console.warn('Failed to load preview alchemical:', error);
      }
    }

    const trayItems = [];
    for (const uuid of formulas) {
      const item = await fromUuid(uuid).catch(() => null);
      if (item) trayItems.push({ uuid, name: item.name, img: item.img, costLabel: CurrencyHelper.format(CurrencyHelper.toCopper(item.system.cost)) });
    }

    return {
      availableOptions: options.map(o => ({ ...o, previewing: o.uuid === previewUuid })),
      selectedItem: previewItem,
      previewItem,
      formulaLimit: limit,
      currentFormulaCount: formulas.length,
      formulaCapLabel: CurrencyHelper.format(capCopper),
      hasSelection: formulas.length > 0,
      showRandomButton: true,
      showTray: true,
      trayData: {
        formulas: trayItems,
        emptySlots: Array(Math.max(0, limit - trayItems.length)).fill({}),
        isEmpty: trayItems.length === 0
      },
      useTripleColumn: true,
      classPreviewData: await this._classFeatures(state),
      instruction: (formulas.length === 0 && !previewUuid)
        ? game.i18n.format('VAGABOND.CharBuilder.Instructions.Alchemy', { n: limit, cap: CurrencyHelper.format(capCopper), cost: CurrencyHelper.format(ALCHEMY_COST) })
        : null
    };
  }

  /** Preview "Alchemical Details" block (preview.hbs reads displayStats.subType 'alchemical'). */
  _displayStats(item) {
    const sys = item.system || {};
    const type = sys.damageType && sys.damageType !== '-' ? sys.damageType : null;
    return {
      type: item.type,
      subType: 'alchemical',
      slots: sys.baseSlots || 0,
      cost: sys.cost || 0,
      alchemicalType: sys.alchemicalType ? game.i18n.localize(CONFIG.VAGABOND.alchemicalTypes?.[sys.alchemicalType] ?? sys.alchemicalType) : null,
      damage: VagabondDamagePipeline.markExplode(sys.damageAmount, item) || null,
      damageType: type ? game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[type] ?? type) : null,
      damageTypeIcon: type ? CONFIG.VAGABOND.damageTypeIcons?.[type] || null : null
    };
  }

  /** Reference column: the Class features of Level 1 (the Alchemy feature text). */
  async _classFeatures(state) {
    if (!state.selectedClass) return null;
    const classItem = await fromUuid(state.selectedClass).catch(() => null);
    if (!classItem) return null;
    const features = [];
    for (const f of (classItem.system.levelFeatures || []).filter(f => (f.level || 1) === 1)) {
      features.push({
        name: f.name,
        enrichedDescription: await foundry.applications.ux.TextEditor.enrichHTML(f.description || '', {
          async: true, secrets: false, relativeTo: classItem
        })
      });
    }
    return { name: classItem.name, levels: [{ level: 1, features }] };
  }

  async _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;
    if (uuid) this.updateState('previewUuid', uuid);
  }

  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const state = this.getCurrentState();
    const formulas = state.formulas || [];
    const limit = state.formulaLimit || 0;

    if (formulas.includes(uuid)) return;
    if (formulas.length >= limit) {
      ui.notifications.warn(game.i18n.format('VAGABOND.CharBuilder.FormulaLimit', { n: limit }));
      return;
    }
    const item = await fromUuid(uuid).catch(() => null);
    if (!item || item.type !== 'equipment' || item.system.equipmentType !== 'alchemical') return;
    const capCopper = await this._capCopper(state);
    if (CurrencyHelper.toCopper(item.system.cost) > capCopper) {
      ui.notifications.warn(game.i18n.format('VAGABOND.AlchemyLab.OverCap', { cap: CurrencyHelper.format(capCopper) }));
      return;
    }
    this.updateState('formulas', [...formulas, uuid]);
    this.updateState('previewUuid', uuid);
  }

  async _onRemoveFromTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    const state = this.getCurrentState();
    this.updateState('formulas', (state.formulas || []).filter(u => u !== uuid));
    if (state.previewUuid === uuid) this.updateState('previewUuid', null);
  }

  async _onClearTray() {
    this.updateState('formulas', []);
    this.updateState('previewUuid', null);
  }

  async _onRandomize() {
    await this.randomize();
  }

  /** Fill the open picks with random formulae under the cap. */
  async randomize() {
    const state = this.getCurrentState();
    const limit = state.formulaLimit || 0;
    if (!limit) return;
    const picks = [...(state.formulas || [])];
    const options = (await this._loadOptions(state, await this._capCopper(state))).filter(o => !picks.includes(o.uuid));
    const shuffled = options.sort(() => Math.random() - 0.5);
    picks.push(...shuffled.slice(0, Math.max(0, limit - picks.length)).map(o => o.uuid));
    this.updateState('formulas', picks);
    if (picks.length) this.updateState('previewUuid', picks[0]);
  }

  /** Done when every pick is made (step-gating is the single rule). */
  isComplete() {
    return isStepDone('alchemy', this.getCurrentState());
  }

  _onReset() {
    this.updateState('formulas', [], { skipValidation: true });
  }
}
