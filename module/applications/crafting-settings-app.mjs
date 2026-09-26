import { CraftingHelper } from '../helpers/crafting-helper.mjs';

const { api } = foundry.applications;

/**
 * CraftingSettingsApp — GM configuration for the crafting system. One tabbed
 * ApplicationV2 form over the single hidden `craftingConfig` world setting
 * (docs/crafting-plan.md §4.1, decision D15). Every field change saves
 * immediately (`submitOnChange`) — switching tabs never loses an edit.
 */
export class CraftingSettingsApp extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'crafting-settings',
    tag: 'form',
    classes: ['crafting-settings-form'],
    window: {
      title: 'VAGABOND.CraftingSettings.Title',
      icon: 'fas fa-hammer',
      resizable: true,
    },
    position: { width: 640, height: 560 },
    actions: {
      switchTab: CraftingSettingsApp.#onSwitchTab,
      resetAll: CraftingSettingsApp.#onResetAll,
      close: function () { this.close(); },
    },
    form: {
      handler: CraftingSettingsApp.#onSubmit,
      submitOnChange: true,
      closeOnSubmit: false,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/crafting-settings.hbs',
      scrollable: ['.crafting-tab-content'],
    },
  };

  static #TABS = [
    { id: 'general', label: 'VAGABOND.CraftingSettings.Tabs.General', icon: 'fa-solid fa-hammer' },
    { id: 'alchemy', label: 'VAGABOND.CraftingSettings.Tabs.Alchemy', icon: 'fa-solid fa-flask' },
    { id: 'relics', label: 'VAGABOND.CraftingSettings.Tabs.Relics', icon: 'fa-solid fa-gem' },
    { id: 'variant', label: 'VAGABOND.CraftingSettings.Tabs.Variant', icon: 'fa-solid fa-atom' },
  ];

  /** Currently active tab ID. */
  #activeTab = 'general';

  /** @override */
  async _prepareContext(_options) {
    const config = CraftingHelper.config();
    const tabs = CraftingSettingsApp.#TABS.map(tab => ({
      ...tab,
      active: tab.id === this.#activeTab,
      label: game.i18n.localize(tab.label),
    }));

    const valuePerShiftRows = Object.entries(config.general.valuePerShift)
      .map(([range, copper]) => ({ range, fieldName: `general.valuePerShift.${range}`, copper }));

    const bonusRanks = [0, 1, 2, 3];
    const crystalSlotRows = ['armor', 'weapon1H', 'weapon2H'].map(kind => ({
      kind,
      label: game.i18n.localize(`VAGABOND.CraftingSettings.Fields.CrystalHost.${kind}`),
      cells: bonusRanks.map(rank => ({
        rank,
        fieldName: `variant.crystalSlotTable.${kind}.${rank}`,
        value: config.variant.crystalSlotTable?.[kind]?.[rank] ?? 0,
      })),
    }));

    return {
      config,
      tabs,
      showGeneral: this.#activeTab === 'general',
      showAlchemy: this.#activeTab === 'alchemy',
      showRelics: this.#activeTab === 'relics',
      showVariant: this.#activeTab === 'variant',
      valuePerShiftRows,
      crystalSlotRows,
      approvalOptions: ['off', 'chat'].map(v => ({ value: v, selected: v === config.general.approval,
        label: game.i18n.localize(`VAGABOND.CraftingSettings.Fields.Approval.${v}`) })),
      toolsRequirementOptions: ['off', 'warn', 'block'].map(v => ({ value: v, selected: v === config.general.toolsRequirement,
        label: game.i18n.localize(`VAGABOND.CraftingSettings.Fields.ToolsRequirement.${v}`) })),
      mixInertOptions: ['delete', 'keep'].map(v => ({ value: v, selected: v === config.alchemy.mixInertBehavior,
        label: game.i18n.localize(`VAGABOND.CraftingSettings.Fields.MixInert.${v}`) })),
      mixExpiryOptions: ['never', 'nextAction'].map(v => ({ value: v, selected: v === config.alchemy.mixExpiryOutOfCombat,
        label: game.i18n.localize(`VAGABOND.CraftingSettings.Fields.MixExpiry.${v}`) })),
    };
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSwitchTab(event, target) {
    this.#activeTab = target.dataset.tab;
    this.render();
  }

  static async #onResetAll() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.CraftingSettings.ResetAllTitle') },
      content: `<p>${game.i18n.localize('VAGABOND.CraftingSettings.ResetAllConfirm')}</p>`,
    });
    if (!confirmed) return;
    await game.settings.set('vagabond', 'craftingConfig', {});
    this.render();
  }

  /** Deep-merges only the active tab's submitted fields onto the stored setting. */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const stored = game.settings.get('vagabond', 'craftingConfig') ?? {};
    const merged = foundry.utils.mergeObject(foundry.utils.deepClone(stored), data, { inplace: false });
    await game.settings.set('vagabond', 'craftingConfig', merged);
  }
}
