import { CraftingHelper } from '../helpers/crafting-helper.mjs';
import { ProjectHelper } from '../helpers/crafting/project-helper.mjs';
import { AlchemyHelper } from '../helpers/crafting/alchemy-helper.mjs';
import { PRIMA_MATERIA_CAP } from '../helpers/crafting/alchemy-mode.mjs';
import { MixHelper } from '../helpers/crafting/mix-helper.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { MaterialsHelper } from '../helpers/materials-helper.mjs';
import { CraftCatalog } from '../helpers/crafting/catalog-helper.mjs';
import { equipmentStats } from '../helpers/equipment-stats.mjs';

const { api } = foundry.applications;

/** Character members of whichever Party actor lists `actor` as a member (empty if none). */
function partyMembersOf(actor) {
  const party = game.actors.find(a => a.type === 'party' && (a.system.members ?? []).includes(actor?.uuid));
  if (!party) return [];
  return (party.system.members ?? [])
    .map(uuid => fromUuidSync(uuid))
    .filter(a => a?.type === 'character');
}

/** Parse a typed Shift amount ("30s", "1g 5s", "7s5c") into copper; a bare number counts as silver (the ± step unit). Null if unreadable. */
function parseCurrencyInput(text) {
  const str = String(text ?? '').trim().toLowerCase();
  if (!str) return 0;
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(Number(str) * CurrencyHelper.RATES.silver);
  const byAbbr = Object.fromEntries(CurrencyHelper.DENOMINATIONS.map(d =>
    [game.i18n.localize(CurrencyHelper.ABBR_KEYS[d]).toLowerCase(), CurrencyHelper.RATES[d]]));
  let total = 0;
  let matched = false;
  for (const [, n, abbr] of str.matchAll(/(\d+)\s*([^\d\s]+)/g)) {
    if (!(abbr in byAbbr)) continue;
    total += Number(n) * byAbbr[abbr];
    matched = true;
  }
  return matched ? total : null;
}

/**
 * The Workbench: Craft + Scrap + Alchemy (Phases 2–3). Other mode-rail entries
 * (Relic Forge, Mix, Combine, Socket) are shown dimmed until their phases land —
 * see docs/crafting-plan.md §5. One instance per actor (keyed by uuid, like the
 * Character HUD); reactive hooks registered in `_onRender`, cleared on close.
 *
 * Craft tab: item catalog (selecting an item IS picking the recipe) | selected-item
 * detail over the ongoing Projects list over the Shift footer. "Add to Projects"
 * stages a row that only becomes a real Project item when a Shift is worked on it.
 */
export class WorkbenchApp extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
  }

  static #instances = new Map();

  /** Open (or focus) the Workbench for `actor`. */
  static open(actor) {
    if (!CraftingHelper.config().general.enabled) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Craft.Errors.disabled'));
      return null;
    }
    if (!actor || actor.type !== 'character') {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Craft.Errors.noActor'));
      return null;
    }
    let app = this.#instances.get(actor.uuid);
    if (!app) {
      app = new this(actor);
      this.#instances.set(actor.uuid, app);
    }
    app.render({ force: true });
    return app;
  }

  static DEFAULT_OPTIONS = {
    id: 'vagabond-workbench-{id}',
    classes: ['vagabond', 'workbench-app'],
    tag: 'div',
    window: { title: 'VAGABOND.Craft.Workbench.Title', icon: 'fa-solid fa-hammer', resizable: true },
    position: { width: 1060, height: 700 },
    actions: {
      switchTab: WorkbenchApp.#onSwitchTab,
      workShift: WorkbenchApp.#onWorkShift,
      scrapItem: WorkbenchApp.#onScrapItem,
      removeProject: WorkbenchApp.#onRemoveProject,
      selectCatalogItem: WorkbenchApp.#onSelectCatalogItem,
      craftFilter: WorkbenchApp.#onCraftFilter,
      stageProject: WorkbenchApp.#onStageProject,
      unregisterRecipe: WorkbenchApp.#onUnregisterRecipe,
      allocStep: WorkbenchApp.#onAllocStep,
      autoFill: WorkbenchApp.#onAutoFill,
      craftFormula: WorkbenchApp.#onCraftFormula,
      primaMateria: WorkbenchApp.#onPrimaMateria,
      craftItemFromCatalog: WorkbenchApp.#onCraftItemFromCatalog,
      forgetFormula: WorkbenchApp.#onForgetFormula,
      learnFormulaPick: WorkbenchApp.#onLearnFormulaPick,
      selectFormula: WorkbenchApp.#onSelectFormula,
      sortFormulas: WorkbenchApp.#onSortFormulas,
      toggleFormulaEdit: WorkbenchApp.#onToggleFormulaEdit,
      pickMixIngredient: WorkbenchApp.#onPickMixIngredient,
      clearMixSlot: WorkbenchApp.#onClearMixSlot,
      mixIngredients: WorkbenchApp.#onMixIngredients,
      discardMix: WorkbenchApp.#onDiscardMix,
    },
  };

  static PARTS = {
    root: { template: 'systems/vagabond/templates/apps/workbench.hbs', scrollable: ['.wb-main'] },
  };

  get title() {
    return `${game.i18n.localize('VAGABOND.Craft.Workbench.Title')} — ${this.actor.name}`;
  }

  #tab = 'craft';
  #abort = null;
  /** Craft tab state — survives re-renders (selecting an item must not wipe typed allocations). */
  #catalog = null;
  #selectedUuid = null;
  #staged = [];
  #alloc = new Map();
  #budget = 0;
  #craftFilter = 'all';
  #lastCatalogClick = { uuid: null, time: 0 };
  #craftSearch = '';
  #formulaSort = 'group';
  #selectedFormulaUuid = null;
  #formulaEditMode = false;
  #savedScroll = new Map();
  #savedSearch = '';
  /** Mix tab: the two picked ingredient item ids (null = empty slot) + list search text. */
  #mixSlots = [null, null];
  #mixSearch = '';

  /**
   * Every render replaces the DOM wholesale, so scroll position + the formula
   * search text would otherwise reset to top/empty on every click (sort toggle,
   * row select, Learn, Forget...). Captured here, restored in `_onRender`.
   * @override
   */
  async _preRender(context, options) {
    await super._preRender(context, options);
    if (!this.element) return;
    this.#savedScroll.clear();
    for (const selector of ['.wb-main', '.wb-formula-sidebar-list', '.wb-catalog-list', '.wb-proj-list']) {
      const el = this.element.querySelector(selector);
      if (el) this.#savedScroll.set(selector, el.scrollTop);
    }
    this.#savedSearch = this.element.querySelector('.wb-formula-search')?.value ?? '';
  }

  /** @override */
  async _prepareContext(_options) {
    const config = CraftingHelper.config();
    // Alchemy tab is Alchemist-only — gated on class formula grants, not the
    // Catalyze AE. Everyone else crafts alchemicals from the Craft catalog.
    const isAlchemist = AlchemyHelper.formulaGrantsFor(this.actor) > 0;
    if (this.#tab === 'alchemy' && !isAlchemist) this.#tab = 'craft';
    const mixOn = !!this.actor.system.craft?.mix;
    if (this.#tab === 'mix' && !mixOn) this.#tab = 'craft';
    const mix = this.#tab === 'mix' ? this.#prepareMixContext() : null;
    const budget = CraftingHelper.valuePerShift(this.actor);
    const materials = MaterialsHelper.totalValue(this.actor);
    this.#budget = budget;
    const craft = this.#tab === 'craft' ? await this.#prepareCraftContext(budget) : null;

    const scrapItems = this.actor.items
      .filter(i => i.type === 'equipment' && !i.flags?.vagabond?.craftProject && !i.system?.craftMaterial?.enabled)
      .map(i => {
        const quantity = i.system.quantity ?? 1;
        return {
          id: i.id, name: i.name, img: i.img, qtySuffix: quantity > 1 ? ` ×${quantity}` : '',
          value: CurrencyHelper.format(i.system.cost), yieldLabel: CurrencyHelper.format(Math.floor(CurrencyHelper.toCopper(i.system.cost) / 2)),
          equipmentType: i.system.equipmentType,
        };
      });

    const scrapGroupsByType = new Map();
    for (const item of scrapItems) {
      if (!scrapGroupsByType.has(item.equipmentType)) scrapGroupsByType.set(item.equipmentType, []);
      scrapGroupsByType.get(item.equipmentType).push(item);
    }
    const scrapGroups = Object.keys(CONFIG.VAGABOND.equipmentTypes ?? {})
      .filter(key => scrapGroupsByType.has(key))
      .map(key => ({
        key,
        label: game.i18n.localize(CONFIG.VAGABOND.equipmentTypes[key]),
        items: scrapGroupsByType.get(key).sort((a, b) => a.name.localeCompare(b.name)),
      }));

    const catalyzeOn = !!this.actor.system.craft?.catalyze;
    const level = this.actor.system.attributes?.level?.value ?? 1;
    const formulaGrants = AlchemyHelper.formulaGrantsFor(this.actor);
    const formulaPicksRemaining = AlchemyHelper.formulaPicksRemaining(this.actor);
    const formulaValueCapCopper = AlchemyHelper.formulaValueCapCopper(this.actor);
    const knownCount = this.actor.system.craft?.formulas?.length ?? 0;
    const alchemyCraftCostLabel = CurrencyHelper.format(50); // flat 5s, RAW-fixed (AlchemyMode)
    // `fromUuidSync` only returns full `system` data for compendium items Foundry has
    // already fully loaded (otherwise just the index shape — no damageAmount/damageType).
    // `fromUuid` always resolves the complete document, so damage never depends on
    // whether the player happened to click that item elsewhere first.
    const knownFormulas = (await Promise.all((this.actor.system.craft?.formulas ?? []).map(async uuid => {
      const source = await fromUuid(uuid);
      if (!source) return null;
      return {
        uuid, name: source.name, img: source.img,
        alchemicalTypeLabel: game.i18n.localize(CONFIG.VAGABOND.alchemicalTypes?.[source.system?.alchemicalType] ?? source.system?.alchemicalType),
        damageAmount: source.system?.damageAmount || '',
        damageTypeLabel: (source.system?.damageType && source.system.damageType !== '-')
          ? game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[source.system.damageType] ?? source.system.damageType)
          : '',
        damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[source.system?.damageType] ?? '',
        craftCostLabel: alchemyCraftCostLabel,
      };
    }))).filter(Boolean);

    const wealthLabel = CurrencyHelper.format(CurrencyHelper.toCopper(CurrencyHelper.walletOf(this.actor) ?? {}));
    const partyMembers = partyMembersOf(this.actor);
    const partyWealthLabel = CurrencyHelper.format(
      partyMembers.reduce((sum, m) => sum + CurrencyHelper.toCopper(CurrencyHelper.walletOf(m) ?? {}), 0)
    );
    const partyMaterialsLabel = CurrencyHelper.format(
      partyMembers.reduce((sum, m) => sum + MaterialsHelper.totalValue(m), 0)
    );

    const canLearnFormula = catalyzeOn && formulaPicksRemaining > 0;
    const primaMateriaOn = !!this.actor.system.craft?.primaMateria;
    const studiedDice = this.actor.system.studiedDice ?? 0;
    let formulaGroups = [];
    if (this.#tab === 'alchemy') {
      const known = new Set(this.actor.system.craft?.formulas ?? []);
      const all = await AlchemyHelper.availableAlchemicals();
      // Crafted alchemicals carry flags.core.sourceId = the compendium uuid they were
      // crafted from (see alchemy-mode.mjs) — sum quantity per uuid to show what's on hand.
      const ownedByUuid = new Map();
      for (const it of this.actor.items) {
        if (it.type !== 'equipment') continue;
        const src = it.flags?.core?.sourceId;
        if (!src) continue;
        ownedByUuid.set(src, (ownedByUuid.get(src) ?? 0) + (it.system.quantity ?? 1));
      }
      // Detail fields (description/damage) come from the same index fetch as the
      // catalog row itself, so the inline accordion needs no extra per-click fetch.
      const catalog = all.map(a => ({
        ...a,
        costLabel: CurrencyHelper.format(a.cost),
        alchemicalTypeLabel: game.i18n.localize(CONFIG.VAGABOND.alchemicalTypes?.[a.alchemicalType] ?? a.alchemicalType),
        damageTypeLabel: a.damageType ? game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[a.damageType] ?? a.damageType) : '',
        known: known.has(a.uuid),
        overCap: a.cost > formulaValueCapCopper,
        nameLower: a.name.toLowerCase(),
        selected: a.uuid === this.#selectedFormulaUuid,
        ownedQty: ownedByUuid.get(a.uuid) ?? 0,
        primaOk: a.cost <= PRIMA_MATERIA_CAP,
      }));

      if (this.#formulaSort === 'cost') {
        formulaGroups = [{ key: null, label: null, items: [...catalog].sort((a, b) => a.cost - b.cost) }];
      } else if (this.#formulaSort === 'alpha') {
        formulaGroups = [{ key: null, label: null, items: [...catalog].sort((a, b) => a.name.localeCompare(b.name)) }];
      } else {
        const byType = new Map();
        for (const item of catalog) {
          if (!byType.has(item.alchemicalType)) byType.set(item.alchemicalType, []);
          byType.get(item.alchemicalType).push(item);
        }
        formulaGroups = Object.keys(CONFIG.VAGABOND.alchemicalTypes ?? {})
          .filter(key => byType.has(key))
          .map(key => ({
            key,
            label: game.i18n.localize(CONFIG.VAGABOND.alchemicalTypes[key]),
            items: byType.get(key).sort((a, b) => a.name.localeCompare(b.name)),
          }));
      }
    }

    // Known Formulas render as a fixed slot grid (RAW: picks are limited by class
    // level) — filled slots show the known item, the rest render empty so the
    // player can see at a glance how many more they still need to pick on the right.
    const formulaSlots = Array.from({ length: Math.max(formulaGrants, knownFormulas.length) }, (_, i) => knownFormulas[i] ?? { empty: true });

    return {
      actor: this.actor,
      enabled: config.general.enabled,
      tab: this.#tab,
      showCraft: this.#tab === 'craft',
      showScrap: this.#tab === 'scrap',
      showAlchemy: this.#tab === 'alchemy',
      showMix: this.#tab === 'mix',
      mixOn, mix,
      isGM: game.user.isGM,
      budget, budgetLabel: CurrencyHelper.format(budget),
      materials, materialsLabel: CurrencyHelper.format(materials),
      craft, scrapItems, scrapGroups,
      hasCraftSkill: budget > 0,
      isAlchemist,
      catalyzeOn, formulaGrants, formulaPicksRemaining,
      level, knownCount,
      wealthLabel, partyWealthLabel, partyMaterialsLabel,
      canLearnFormula,
      primaMateriaOn, studiedDice,
      knownFormulas,
      formulaSlots,
      formulaEditMode: this.#formulaEditMode,
      formulaSort: this.#formulaSort,
      isSortGroup: this.#formulaSort === 'group',
      isSortAlpha: this.#formulaSort === 'alpha',
      isSortCost: this.#formulaSort === 'cost',
      formulaGroups,
    };
  }

  /** Catalog rows, selected-item detail and Project rows (existing + staged) for the Craft tab. */
  async #prepareCraftContext(budget) {
    this.#catalog ??= await CraftCatalog.entries();
    const shiftsFor = (cost) => (budget > 0 ? Math.max(1, Math.ceil(cost / budget)) : null);

    const catalog = this.#catalog.map(e => ({
      ...e,
      costLabel: CurrencyHelper.format(e.cost),
      typeLabel: this.#typeLabel(e.equipmentType),
      slotsLabel: this.#slotsLabel(e.slots),
      matsLabel: CurrencyHelper.format(ProjectHelper.materialsOwed(e.cost, e.cost)),
      shifts: shiftsFor(e.cost) ?? '—',
      nameLower: e.name.toLowerCase(),
      selected: e.uuid === this.#selectedUuid,
    }));

    const detail = this.#selectedUuid ? await this.#buildDetail(this.#selectedUuid, shiftsFor) : null;
    if (!detail) this.#selectedUuid = null;

    const rows = [
      ...ProjectHelper.projectsOf(this.actor).map(item => {
        const data = item.flags.vagabond.craftProject;
        return this.#projectRow(item.id, data.target?.name ?? item.name, data.target?.img ?? item.img,
          data.value, data.progress, data.materialsPaid, false);
      }),
      ...this.#staged.map(s => this.#projectRow(s.key, s.name, s.img, s.value, 0, 0, true)),
    ];
    const live = new Set(rows.map(r => r.key));
    for (const key of this.#alloc.keys()) if (!live.has(key)) this.#alloc.delete(key);

    const categories = CraftCatalog.CATEGORIES.map(c => ({
      ...c, label: game.i18n.localize(c.label), active: c.key === this.#craftFilter,
    }));

    return { catalog, categories, detail, rows };
  }

  async #buildDetail(uuid, shiftsFor) {
    const doc = await fromUuid(uuid);
    if (!doc || doc.type !== 'equipment') return null;
    const sys = doc.system;
    const value = CurrencyHelper.toCopper(sys.cost);
    const shifts = shiftsFor(value);
    return {
      uuid, name: doc.name, img: doc.img,
      typeLabel: this.#typeLabel(sys.equipmentType),
      slotsLabel: this.#slotsLabel(sys.slots ?? sys.baseSlots),
      stats: equipmentStats(doc),
      description: sys.description
        ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(sys.description, { relativeTo: doc })
        : '',
      valueLabel: CurrencyHelper.format(value),
      matsLabel: CurrencyHelper.format(ProjectHelper.materialsOwed(value, value)),
      // Red when the Materials on hand can't cover the whole item.
      matsShort: ProjectHelper.materialsOwed(value, value) > MaterialsHelper.totalValue(this.actor),
      shiftsLabel: shifts === null ? '—'
        : game.i18n.format(shifts === 1 ? 'VAGABOND.Craft.Workbench.ShiftsOne' : 'VAGABOND.Craft.Workbench.ShiftsMany', { n: shifts }),
      canCraft: value > 0,
      isCustom: CraftCatalog.isRecipe(doc),
      canUnregister: game.user.isGM && CraftCatalog.isRecipe(doc),
    };
  }

  /** Mix tab: owned ingredients, the two slots, the combined-payload preview, live Mixtures. */
  #prepareMixContext() {
    const damageView = (d) => d && ({
      amount: d.amount,
      typeLabel: game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[d.type] ?? d.type),
      icon: CONFIG.VAGABOND.damageTypeIcons?.[d.type] ?? '',
    });
    const typeLabel = (item) => game.i18n.localize(CONFIG.VAGABOND.alchemicalTypes?.[item.system.alchemicalType] ?? item.system.alchemicalType ?? '');

    // Drop picks whose item was used up / deleted since.
    this.#mixSlots = this.#mixSlots.map(id => (id && MixHelper.isMixableItem(this.actor.items.get(id)) ? id : null));

    const ingredients = this.actor.items
      .filter(i => MixHelper.isMixableItem(i))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(i => ({
        id: i.id, name: i.name, img: i.img, nameLower: i.name.toLowerCase(),
        typeLabel: typeLabel(i),
        damage: damageView(MixHelper.damageOf(i)),
        charges: CONFIG.Item.documentClass._chargesRemaining(i),
        picked: this.#mixSlots.includes(i.id),
      }));

    const picked = this.#mixSlots.map(id => (id ? this.actor.items.get(id) : null));
    const slots = picked.map(i => (i ? { filled: true, id: i.id, name: i.name, img: i.img } : { filled: false }));

    let preview = null;
    if (picked[0] && picked[1]) {
      const [a, b] = picked.map(i => i.toObject());
      const payload = MixHelper.combinePayloads(a, b);
      const main = MixHelper.damageOf({ system: payload });
      const companion = payload.companionIndex === null ? null : MixHelper.damageOf([a, b][payload.companionIndex]);
      const statusName = (id) => game.i18n.localize(CONFIG.statusEffects.find(s => s.id === id)?.name ?? id);
      const probe = { type: 'equipment', system: { equipmentType: 'alchemical', damageType: payload.damageType, damageAmount: payload.damageAmount } };
      preview = {
        damage: damageView(main),
        companion: damageView(companion),
        statuses: payload.causedStatuses.map(s => statusName(s.statusId)),
        thrown: globalThis.vagabond.utils.EquipmentHelper.isThrownAlchemical(probe),
        expiryLabel: game.i18n.localize(MixHelper.expiryKeyFor(this.actor)),
      };
    }

    const studiedDice = this.actor.system.studiedDice ?? 0;
    const blockKey = !studiedDice ? 'VAGABOND.Craft.Workbench.MixNoStudied'
      : !preview ? 'VAGABOND.Craft.Workbench.MixPickTwo' : null;

    const mixtures = this.actor.items
      .filter(i => i.flags?.vagabond?.mix)
      .map(i => ({
        id: i.id, name: i.name, img: i.img,
        inert: !!i.flags.vagabond.mix.inert,
        statusLabel: game.i18n.localize(MixHelper.statusKeyOf(i)),
      }));

    return {
      studiedDice, ingredients, slots, preview, mixtures,
      canMix: !blockKey,
      blockHint: blockKey ? game.i18n.localize(blockKey) : '',
    };
  }

  #projectRow(key, name, img, value, progress, paid, isNew) {
    const remaining = Math.max(0, value - progress);
    const alloc = Math.min(this.#alloc.get(key) ?? 0, remaining);
    if (alloc > 0) this.#alloc.set(key, alloc);
    else this.#alloc.delete(key);
    return {
      key, name, img, isNew, value, progress, paid: paid || 0, remaining,
      pct: value > 0 ? Math.round((progress / value) * 100) : 0,
      progressLabel: `${CurrencyHelper.format(progress)} / ${CurrencyHelper.format(value)}`,
      allocLabel: CurrencyHelper.format(alloc),
    };
  }

  #typeLabel(equipmentType) {
    return game.i18n.localize(CONFIG.VAGABOND.equipmentTypes?.[equipmentType] ?? equipmentType ?? '');
  }

  #slotsLabel(slots) {
    const n = Number(slots) || 0;
    return game.i18n.format(n === 1 ? 'VAGABOND.Craft.Workbench.SlotsOne' : 'VAGABOND.Craft.Workbench.SlotsMany', { n });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSwitchTab(event, target) {
    this.#tab = target.dataset.tab;
    this.render();
  }

  /**
   * Click selects; a second click on the same row within 400ms opens its item sheet.
   * Detected here rather than with a `dblclick` listener because the first click
   * re-renders the list, so the two clicks land on different DOM nodes.
   */
  static async #onSelectCatalogItem(event, target) {
    const uuid = target.closest('[data-uuid]')?.dataset.uuid;
    if (!uuid) return;
    const now = Date.now();
    const isDouble = this.#lastCatalogClick.uuid === uuid && now - this.#lastCatalogClick.time < 400;
    this.#lastCatalogClick = { uuid, time: isDouble ? 0 : now };
    if (isDouble) {
      const doc = await fromUuid(uuid);
      doc?.sheet?.render(true);
      return;
    }
    if (uuid === this.#selectedUuid) return;
    this.#selectedUuid = uuid;
    this.render();
  }

  static #onCraftFilter(event, target) {
    this.#craftFilter = target.dataset.filter ?? 'all';
    this.element.querySelectorAll('.wb-chip').forEach(chip =>
      chip.classList.toggle('active', chip.dataset.filter === this.#craftFilter));
    this.#applyCatalogFilter();
  }

  /** Stage the selected item as a NEW Project row; it becomes a real Project item only once a Shift is worked on it. */
  static async #onStageProject(event, target) {
    const uuid = target.dataset.uuid;
    const source = uuid ? await fromUuid(uuid) : null;
    if (!source || source.type !== 'equipment') return;
    const value = CurrencyHelper.toCopper(source.system.cost);
    if (value <= 0) return;
    const key = foundry.utils.randomID();
    this.#staged.push({ key, uuid, name: source.name, img: source.img, value });
    // Hand the new row whatever budget is still free — the player adjusts from there.
    const free = Math.max(0, this.#budget - this.#totalAlloc());
    if (free > 0) this.#alloc.set(key, Math.min(value, free));
    this.render();
  }

  static async #onUnregisterRecipe(event, target) {
    const item = await fromUuid(target.dataset.uuid);
    const result = await CraftCatalog.unregister(item);
    if (!result.ok) ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
    this.#catalog = null;
    this.render();
  }

  /** Staged rows are just dropped; a real Project asks first (its spent Materials are lost). */
  static async #onRemoveProject(event, target) {
    const key = target.closest('[data-row-key]')?.dataset.rowKey;
    if (!key) return;
    const stagedIdx = this.#staged.findIndex(s => s.key === key);
    if (stagedIdx >= 0) {
      this.#staged.splice(stagedIdx, 1);
      this.#alloc.delete(key);
      this.render();
      return;
    }
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.Craft.Workbench.AbandonTitle') },
      content: `<p>${game.i18n.localize('VAGABOND.Craft.Workbench.AbandonConfirm')}</p>`,
    });
    if (!confirmed) return;
    this.#alloc.delete(key);
    await this.actor.deleteEmbeddedDocuments('Item', [key]);
    this.render();
  }

  /** ±1 silver per click; + never pushes the Shift over budget. */
  static #onAllocStep(event, target) {
    const row = target.closest('[data-row-key]');
    if (!row) return;
    const key = row.dataset.rowKey;
    const remaining = Number(row.dataset.remaining) || 0;
    const current = this.#alloc.get(key) ?? 0;
    const step = CurrencyHelper.RATES.silver;
    const next = Number(target.dataset.step) > 0
      ? Math.min(remaining, current + Math.min(step, Math.max(0, this.#budget - this.#totalAlloc())))
      : Math.max(0, current - step);
    this.#setAlloc(row, next);
    this.#refreshShiftUI();
  }

  /** Spread the Shift budget over the rows top to bottom (oldest Project first), within the Materials on hand. */
  static #onAutoFill() {
    let budgetLeft = this.#budget;
    let materialsLeft = MaterialsHelper.totalValue(this.actor);
    this.element.querySelectorAll('.wb-proj-row[data-row-key]').forEach(row => {
      const { value, progress, paid, remaining } = this.#rowData(row);
      let hi = Math.min(remaining, budgetLeft);
      let lo = 0;
      // Largest amount whose pro-rata Materials still fit what's left on hand.
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ProjectHelper.materialsFor(value, progress, paid, mid) <= materialsLeft) lo = mid;
        else hi = mid - 1;
      }
      this.#setAlloc(row, lo);
      budgetLeft -= lo;
      materialsLeft -= ProjectHelper.materialsFor(value, progress, paid, lo);
    });
    this.#refreshShiftUI();
  }

  static async #onCraftFormula(event, target) {
    const uuid = target.closest('[data-formula-uuid]')?.dataset.formulaUuid;
    if (!uuid) return;
    const result = await CraftingHelper.request(this.actor, 'alchemy', { formulaUuid: uuid });
    if (!result.ok) ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
    this.render();
  }

  /** Prima Materia: spend a Studied die → one copy of any ≤10g alchemical, no Materials. */
  static async #onPrimaMateria(event, target) {
    const uuid = target.closest('[data-formula-uuid]')?.dataset.formulaUuid;
    if (!uuid) return;
    // PrimaMateriaMode.evaluate reads the source synchronously — prime the cache.
    await fromUuid(uuid);
    const result = await CraftingHelper.request(this.actor, 'primaMateria', { itemUuid: uuid });
    if (!result.ok) ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
    this.render();
  }

  /**
   * "Craft as Project" — RAW allows Crafting any Item (known formula or not) via
   * the normal Craft Difficulty/Shift-budget rules (docs' Craft table); knowing the
   * formula (Alchemist Catalyze) only unlocks the flat-5s instant shortcut above.
   * Stages the picked alchemical as a NEW Project row on the Craft tab so the
   * generic Project flow (half-value Materials, per-Shift budget) runs.
   */
  static async #onCraftItemFromCatalog(event, target) {
    const uuid = target.closest('[data-formula-uuid]')?.dataset.formulaUuid;
    if (!uuid) return;
    this.#tab = 'craft';
    this.#selectedUuid = uuid;
    await WorkbenchApp.#onStageProject.call(this, event, { dataset: { uuid } });
  }

  static async #onForgetFormula(event, target) {
    const uuid = target.closest('[data-formula-uuid]')?.dataset.formulaUuid;
    if (!uuid) return;
    const source = fromUuidSync(uuid);
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.Craft.Workbench.ForgetFormulaTitle') },
      content: `<p>${game.i18n.format('VAGABOND.Craft.Workbench.ForgetFormulaConfirm', { name: source?.name ?? uuid })}</p>`,
    });
    if (!confirmed) return;
    const result = await AlchemyHelper.forgetFormula(this.actor, uuid);
    if (!result.ok) ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
    this.render();
  }

  static async #onLearnFormulaPick(event, target) {
    const uuid = target.closest('[data-formula-uuid]')?.dataset.formulaUuid;
    if (!uuid) return;
    const result = await AlchemyHelper.learnFormula(this.actor, uuid);
    if (!result.ok) ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
    this.render();
  }

  static #onSelectFormula(event, target) {
    const uuid = target.closest('[data-formula-uuid]')?.dataset.formulaUuid;
    if (!uuid) return;
    this.#selectedFormulaUuid = this.#selectedFormulaUuid === uuid ? null : uuid;
    this.render();
  }

  static #onSortFormulas(event, target) {
    this.#formulaSort = target.dataset.sort;
    this.render();
  }

  static #onToggleFormulaEdit() {
    this.#formulaEditMode = !this.#formulaEditMode;
    this.render();
  }

  /** Click an ingredient: un-pick it if picked, else fill the first empty slot (or replace the second). */
  static #onPickMixIngredient(event, target) {
    const id = target.closest('[data-item-id]')?.dataset.itemId;
    if (!id) return;
    this.#pickMixIngredient(id);
  }

  #pickMixIngredient(id) {
    const at = this.#mixSlots.indexOf(id);
    if (at >= 0) this.#mixSlots[at] = null;
    else {
      const empty = this.#mixSlots.indexOf(null);
      this.#mixSlots[empty >= 0 ? empty : 1] = id;
    }
    this.render();
  }

  /** Put `id` into slot `index`; if it already sat in the other slot, it moves. */
  #setMixSlot(index, id) {
    const other = index === 0 ? 1 : 0;
    if (this.#mixSlots[other] === id) this.#mixSlots[other] = null;
    this.#mixSlots[index] = id;
    this.render();
  }

  /**
   * Mix tab drag-and-drop: ingredient rows are draggable (standard Item drag data,
   * so an owned alchemical dragged from the character sheet works too); each slot
   * is its own drop target. Clicking a row still picks it.
   */
  #wireMixDragDrop(signal) {
    const tab = this.element.querySelector('.wb-mix-tab');
    if (!tab) return;

    tab.querySelectorAll('.wb-cat-row[data-item-id]').forEach(row => {
      row.addEventListener('dragstart', (ev) => {
        const item = this.actor.items.get(row.dataset.itemId);
        if (!item) return;
        ev.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
        ev.dataTransfer.effectAllowed = 'copy';
        row.classList.add('is-dragging');
        tab.classList.add('is-mix-dragging');
      }, { signal });
      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        tab.classList.remove('is-mix-dragging');
      }, { signal });
    });

    tab.querySelectorAll('.wb-mix-slot[data-slot]').forEach(slot => {
      const accept = (ev) => { ev.preventDefault(); slot.classList.add('drag-over'); };
      slot.addEventListener('dragenter', accept, { signal });
      slot.addEventListener('dragover', accept, { signal });
      slot.addEventListener('dragleave', (ev) => {
        if (!slot.contains(ev.relatedTarget)) slot.classList.remove('drag-over');
      }, { signal });
      slot.addEventListener('drop', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        slot.classList.remove('drag-over');
        tab.classList.remove('is-mix-dragging');
        const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
        if (data?.type !== 'Item' || !data.uuid) return;
        const source = await fromUuid(data.uuid);
        if (source?.parent?.uuid !== this.actor.uuid || !MixHelper.isMixableItem(source)) {
          ui.notifications.warn(game.i18n.localize('VAGABOND.Craft.Workbench.MixOwnedOnly'));
          return;
        }
        this.#setMixSlot(Number(slot.dataset.slot) || 0, source.id);
      }, { signal });
    });
  }

  static #onClearMixSlot(event, target) {
    this.#mixSlots[Number(target.dataset.slot) || 0] = null;
    this.render();
  }

  static async #onMixIngredients() {
    const [itemIdA, itemIdB] = this.#mixSlots;
    const result = await CraftingHelper.request(this.actor, 'mix', { itemIdA, itemIdB });
    if (!result.ok) {
      ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
      return;
    }
    this.#mixSlots = [null, null];
    this.render();
  }

  static async #onDiscardMix(event, target) {
    const item = this.actor.items.get(target.closest('[data-item-id]')?.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.Craft.Workbench.DiscardMix') },
      content: `<p>${game.i18n.format('VAGABOND.Craft.Workbench.DiscardMixConfirm', { name: foundry.utils.escapeHTML(item.name) })}</p>`,
    });
    if (!confirmed) return;
    await item.delete();
    this.render();
  }

  static async #onScrapItem(event, target) {
    const itemId = target.closest('[data-item-id]')?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.Craft.Modes.Scrap.Label') },
      content: `<p>${game.i18n.format('VAGABOND.Craft.Workbench.ScrapConfirm', { name: item.name })}</p>`,
    });
    if (!confirmed) return;
    const result = await CraftingHelper.request(this.actor, 'scrap', { itemId });
    if (!result.ok) ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
    this.render();
  }

  static async #onWorkShift() {
    const allocations = [];
    const stagedWorked = [];
    for (const [key, amount] of this.#alloc) {
      if (!(amount > 0)) continue;
      const staged = this.#staged.find(s => s.key === key);
      if (staged) {
        // craft-mode's synchronous evaluate reads the source with fromUuidSync — prime the cache.
        await fromUuid(staged.uuid);
        allocations.push({ sourceItemUuid: staged.uuid, amount });
        stagedWorked.push(key);
      } else {
        allocations.push({ projectId: key, amount });
      }
    }

    if (!allocations.length) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Craft.Errors.amount'));
      return;
    }

    const result = await CraftingHelper.workShift(this.actor, allocations);
    if (!result.ok) {
      ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
      return;
    }
    this.#staged = this.#staged.filter(s => !stagedWorked.includes(s.key));
    this.#alloc.clear();
    this.render();
  }

  /* -------------------------------------------- */
  /*  Rendering: Craft tab wiring                 */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    // Dropping an item anywhere on the Craft tab selects it (any compendium, the
    // sidebar, an actor sheet). A GM dropping a world item also registers it as a
    // custom recipe so it stays in the catalog for everyone.
    this.#wireDropZone('.wb-craft-tab', signal, async (source, uuid) => {
      if (source.type !== 'equipment') {
        ui.notifications.warn(game.i18n.localize('VAGABOND.Craft.Workbench.OnlyEquipment'));
        return;
      }
      if (game.user.isGM && !source.pack && !source.parent && !CraftCatalog.isRecipe(source)) {
        const result = await CraftCatalog.register(source);
        if (!result.ok) ui.notifications.warn(CraftingHelper.reasonLabel(result.reason));
        else {
          ui.notifications.info(game.i18n.format('VAGABOND.Craft.Workbench.RecipeAdded', { name: source.name }));
          this.#catalog = null;
        }
      }
      this.#selectedUuid = uuid;
      this.render();
    });

    const craftSearch = this.element.querySelector('.wb-craft-search');
    if (craftSearch) {
      craftSearch.value = this.#craftSearch;
      craftSearch.addEventListener('input', () => {
        this.#craftSearch = craftSearch.value;
        this.#applyCatalogFilter();
      }, { signal });
      this.#applyCatalogFilter();
    }

    this.#wireMixDragDrop(signal);

    const mixSearch = this.element.querySelector('.wb-mix-search');
    if (mixSearch) {
      const apply = () => {
        const q = this.#mixSearch.trim().toLowerCase();
        let visible = 0;
        this.element.querySelectorAll('.wb-mix-tab .wb-cat-row').forEach(row => {
          const match = !q || (row.dataset.name ?? '').includes(q);
          row.classList.toggle('is-hidden', !match);
          if (match) visible++;
        });
        const noMatch = this.element.querySelector('.wb-mix-tab .wb-catalog-nomatch');
        if (noMatch) noMatch.hidden = visible > 0 || !this.element.querySelector('.wb-mix-tab .wb-cat-row');
      };
      mixSearch.value = this.#mixSearch;
      mixSearch.addEventListener('input', () => { this.#mixSearch = mixSearch.value; apply(); }, { signal });
      apply();
    }

    const searchInput = this.element.querySelector('.wb-formula-search');
    if (searchInput) {
      searchInput.value = this.#savedSearch;
      searchInput.addEventListener('input', () => this.#filterFormulas(searchInput.value), { signal });
      if (this.#savedSearch) this.#filterFormulas(this.#savedSearch);
    }

    for (const [selector, top] of this.#savedScroll) {
      const el = this.element.querySelector(selector);
      if (el) el.scrollTop = top;
    }

    this.#wireAllocInputs(signal);
    this.#refreshShiftUI();

    if (!this._hookIds) this.#registerHooks();
  }

  /** Hide catalog rows not matching the category chip + search text (DOM only, no re-render). */
  #applyCatalogFilter() {
    const q = this.#craftSearch.trim().toLowerCase();
    let visible = 0;
    this.element.querySelectorAll('.wb-cat-row').forEach(row => {
      const match = (this.#craftFilter === 'all' || row.dataset.category === this.#craftFilter)
        && (!q || (row.dataset.name ?? '').includes(q));
      row.classList.toggle('is-hidden', !match);
      if (match) visible++;
    });
    const noMatch = this.element.querySelector('.wb-catalog-nomatch');
    if (noMatch) noMatch.hidden = visible > 0 || !this.element.querySelector('.wb-cat-row');
  }

  /** Typed allocations: any g/s/c string (bare number = silver), clamped to what the Project still needs and the Shift budget left. */
  #wireAllocInputs(signal) {
    this.element.querySelectorAll('.wb-proj-row .wb-alloc-input').forEach(input => {
      const row = input.closest('.wb-proj-row');
      input.addEventListener('focus', () => input.select(), { signal });
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); }, { signal });
      input.addEventListener('change', () => {
        const parsed = parseCurrencyInput(input.value);
        const key = row.dataset.rowKey;
        const current = this.#alloc.get(key) ?? 0;
        const amount = parsed === null ? current : parsed;
        const budgetFree = Math.max(0, this.#budget - (this.#totalAlloc() - current));
        this.#setAlloc(row, Math.max(0, Math.min(amount, Number(row.dataset.remaining) || 0, budgetFree)));
        this.#refreshShiftUI();
      }, { signal });
    });
  }

  #rowData(row) {
    const n = (v) => Number(v) || 0;
    return { value: n(row.dataset.value), progress: n(row.dataset.progress), paid: n(row.dataset.paid), remaining: n(row.dataset.remaining) };
  }

  #setAlloc(row, amount) {
    const key = row.dataset.rowKey;
    if (amount > 0) this.#alloc.set(key, amount);
    else this.#alloc.delete(key);
    const input = row.querySelector('.wb-alloc-input');
    if (input) input.value = CurrencyHelper.format(amount);
  }

  #totalAlloc() {
    let sum = 0;
    for (const amount of this.#alloc.values()) sum += amount;
    return sum;
  }

  /**
   * Live Shift footer + per-row Materials: budget meter, Materials needed vs on
   * hand, and Work a Shift disabled (with a hint) when over budget or short on
   * Materials. The server re-checks both; this is only the early warning.
   */
  #refreshShiftUI() {
    const footer = this.element.querySelector('.wb-shift-footer');
    if (!footer) return;
    const budget = Number(footer.dataset.budget) || 0;
    const onHand = Number(footer.dataset.materials) || 0;

    let spent = 0;
    let needed = 0;
    this.element.querySelectorAll('.wb-proj-row[data-row-key]').forEach(row => {
      const { value, progress, paid } = this.#rowData(row);
      const amount = this.#alloc.get(row.dataset.rowKey) ?? 0;
      const mats = ProjectHelper.materialsFor(value, progress, paid, amount);
      spent += amount;
      needed += mats;
      const matsEl = row.querySelector('.wb-alloc-materials-value');
      if (matsEl) matsEl.textContent = CurrencyHelper.format(mats);
      row.classList.toggle('is-allocated', amount > 0);
    });

    const overBudget = spent > budget;
    const materialsShort = needed > onHand;
    const fill = footer.querySelector('.wb-meter-fill');
    if (fill) fill.style.width = `${budget > 0 ? Math.min(100, (spent / budget) * 100) : 0}%`;
    footer.querySelector('.wb-meter')?.classList.toggle('is-over', overBudget);
    const spentEl = footer.querySelector('.wb-shift-spent');
    if (spentEl) {
      spentEl.textContent = `${CurrencyHelper.format(spent)} / ${CurrencyHelper.format(budget)}`;
      spentEl.classList.toggle('wb-budget-over', overBudget);
    }
    const matsEl = footer.querySelector('.wb-mats-needed');
    if (matsEl) {
      matsEl.textContent = game.i18n.format('VAGABOND.Craft.Workbench.MatsNeeded', {
        needed: CurrencyHelper.format(needed), onHand: CurrencyHelper.format(onHand),
      });
      matsEl.classList.toggle('wb-budget-over', materialsShort);
    }
    const materialsWarning = footer.querySelector('.wb-materials-warning');
    if (materialsWarning) materialsWarning.hidden = !materialsShort;
    const budgetWarning = footer.querySelector('.wb-budget-warning');
    if (budgetWarning) budgetWarning.hidden = !overBudget;
    const shiftBtn = footer.querySelector('[data-action="workShift"]');
    if (shiftBtn) shiftBtn.disabled = spent <= 0 || overBudget || materialsShort;
  }

  /** Filter the formula sidebar items/groups by name, hiding groups left with no matches. */
  #filterFormulas(query) {
    const q = query.trim().toLowerCase();
    this.element.querySelectorAll('.wb-formula-group').forEach(group => {
      let anyVisible = false;
      group.querySelectorAll('.wb-formula-item').forEach(item => {
        const match = (item.querySelector('.wb-formula-row')?.dataset.name ?? '').includes(q);
        item.classList.toggle('is-hidden', !match);
        if (match) anyVisible = true;
      });
      group.classList.toggle('is-hidden', !anyVisible);
    });
  }

  /** Wire a drag-over/leave/drop cycle on `selector`, handing the dropped Item document + uuid to `onDrop`. */
  #wireDropZone(selector, signal, onDrop) {
    const zone = this.element.querySelector(selector);
    if (!zone) return;
    zone.addEventListener('dragover', (ev) => { ev.preventDefault(); zone.classList.add('drag-over'); }, { signal });
    zone.addEventListener('dragleave', (ev) => {
      if (!zone.contains(ev.relatedTarget)) zone.classList.remove('drag-over');
    }, { signal });
    zone.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      zone.classList.remove('drag-over');
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
      if (data?.type !== 'Item' || !data.uuid) return;
      const source = await fromUuid(data.uuid);
      if (!source) return;
      onDrop(source, data.uuid);
    }, { signal });
  }

  #renderDebounce = foundry.utils.debounce(() => { if (this.rendered) this.render(); }, 150);

  #registerHooks() {
    const relevant = (item) => item?.parent?.uuid === this.actor.uuid;
    // World items that are (or just stopped being) custom recipes change the catalog.
    const recipeChanged = (item, changes) => !item?.parent && !item?.pack
      && (CraftCatalog.isRecipe(item) || JSON.stringify(changes?.flags?.vagabond ?? {}).includes(CraftCatalog.FLAG));
    const onItem = (item, changes) => {
      if (recipeChanged(item, changes)) {
        this.#catalog = null;
        this.#renderDebounce();
      } else if (relevant(item)) this.#renderDebounce();
    };
    this._hookIds = {
      createItem: Hooks.on('createItem', (item) => onItem(item)),
      updateItem: Hooks.on('updateItem', (item, changes) => onItem(item, changes)),
      deleteItem: Hooks.on('deleteItem', (item) => onItem(item)),
      // Studied dice / craft flags live on the actor itself (Mix + Prima Materia gates).
      updateActor: Hooks.on('updateActor', (actor) => { if (actor.uuid === this.actor.uuid) this.#renderDebounce(); }),
    };
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    for (const [hook, id] of Object.entries(this._hookIds ?? {})) Hooks.off(hook, id);
    this._hookIds = null;
    this.#abort?.abort();
    this.#abort = null;
    WorkbenchApp.#instances.delete(this.actor.uuid);
  }
}
