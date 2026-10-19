import { CraftingHelper } from '../helpers/crafting-helper.mjs';
import { ProjectHelper } from '../helpers/crafting/project-helper.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { MaterialsHelper } from '../helpers/materials-helper.mjs';
import { CraftCatalog } from '../helpers/crafting/catalog-helper.mjs';
import { equipmentStats, markStatsForActor } from '../helpers/equipment-stats.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { ScrapMode } from '../helpers/crafting/scrap-mode.mjs';

const { api } = foundry.applications;

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
 * The Workbench: Craft + Scrap (Phases 2–3). Other mode-rail entries
 * (Relic Forge, Combine, Socket) are shown dimmed until their phases land —
 * see docs/crafting-plan.md §5. Alchemy (Catalyze / Mix / formula Library) lives in
 * the Alchemist's Alchemy lab (character sheet tab + HUD panel, `AlchemyLab`), not here.
 * One instance per actor (keyed by uuid, like the
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
    position: { width: 850, height: 700 },
    actions: {
      switchTab: WorkbenchApp.#onSwitchTab,
      workShift: WorkbenchApp.#onWorkShift,
      scrapPick: WorkbenchApp.#onScrapPick,
      scrapStep: WorkbenchApp.#onScrapStep,
      scrapAll: WorkbenchApp.#onScrapAll,
      scrapRemove: WorkbenchApp.#onScrapRemove,
      scrapClear: WorkbenchApp.#onScrapClear,
      scrapConfirm: WorkbenchApp.#onScrapConfirm,
      removeProject: WorkbenchApp.#onRemoveProject,
      selectCatalogItem: WorkbenchApp.#onSelectCatalogItem,
      craftFilter: WorkbenchApp.#onCraftFilter,
      stageProject: WorkbenchApp.#onStageProject,
      unregisterRecipe: WorkbenchApp.#onUnregisterRecipe,
      allocStep: WorkbenchApp.#onAllocStep,
      autoFill: WorkbenchApp.#onAutoFill,
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
  #savedScroll = new Map();
  /** Scrap tab state: picked item id → how many of that stack to scrap. */
  #scrapPicks = new Map();
  #scrapSearch = '';

  /**
   * Every render replaces the DOM wholesale, so scroll positions would otherwise
   * reset to top on every click. Captured here, restored in `_onRender`.
   * @override
   */
  async _preRender(context, options) {
    await super._preRender(context, options);
    if (!this.element) return;
    this.#savedScroll.clear();
    for (const selector of ['.wb-main', '.wb-catalog-list', '.wb-proj-list', '.wb-scrap-list', '.wb-tray-list']) {
      const el = this.element.querySelector(selector);
      if (el) this.#savedScroll.set(selector, el.scrollTop);
    }
  }

  /** @override */
  async _prepareContext(_options) {
    const config = CraftingHelper.config();
    const budget = CraftingHelper.valuePerShift(this.actor);
    const materials = MaterialsHelper.totalValue(this.actor);
    this.#budget = budget;
    const craft = this.#tab === 'craft' ? await this.#prepareCraftContext(budget) : null;

    const scrap = this.#tab === 'scrap' ? this.#prepareScrapContext(materials) : null;

    return {
      actor: this.actor,
      enabled: config.general.enabled,
      tab: this.#tab,
      showCraft: this.#tab === 'craft',
      showScrap: this.#tab === 'scrap',
      isGM: game.user.isGM,
      budget, budgetLabel: CurrencyHelper.format(budget),
      materials, materialsLabel: CurrencyHelper.format(materials),
      craft, scrap,
      hasCraftSkill: budget > 0,
    };
  }

  /**
   * Scrap tab: inventory list (grouped by equipment type) + the tray of picked
   * stacks with the totals the Scrap button will produce — Materials gained, the
   * Materials bundle before/after and the inventory Slots before/after.
   */
  #prepareScrapContext(materials) {
    const fmt = (copper) => CurrencyHelper.format(copper);
    const equipKeys = { oneHand: 'OneHand', twoHands: 'TwoHands', worn: 'Worn' };
    const candidates = this.actor.items.filter(i => i.type === 'equipment'
      && !i.flags?.vagabond?.craftProject && !i.system?.craftMaterial?.enabled && !i.system?.noScrap);

    const picks = new Map();
    const rows = candidates.map(item => {
      const quantity = Math.max(1, item.system.quantity ?? 1);
      const locked = !ScrapMode.scrappable(item);
      const picked = locked ? 0 : Math.min(quantity, this.#scrapPicks.get(item.id) ?? 0);
      if (picked > 0) picks.set(item.id, picked);
      const state = item.system.equipmentState;
      const equipKey = EquipmentHelper.isEquipped(item) ? equipKeys[state] : null;
      return {
        id: item.id, item, name: item.name, img: item.img, nameLower: item.name.toLowerCase(),
        quantity, multi: quantity > 1, picked, isPicked: picked > 0, isFull: picked >= quantity, locked,
        equipKey,
        equipLabel: equipKey ? game.i18n.localize(`VAGABOND.Craft.Workbench.ScrapEquip.${equipKey}`) : '',
        equipIcon: { OneHand: 'fa-hand', TwoHands: 'fa-hands', Worn: 'fa-shirt' }[equipKey] ?? '',
        valueLabel: fmt(CurrencyHelper.toCopper(item.system.cost)),
        yieldEach: fmt(ScrapMode.yieldFor(item, 1)),
        slotsLabel: this.#slotsLabel(EquipmentHelper.itemSlotCost(item)),
        equipmentType: item.system.equipmentType,
      };
    });
    this.#scrapPicks = picks;

    const byType = new Map();
    for (const row of rows) {
      if (!byType.has(row.equipmentType)) byType.set(row.equipmentType, []);
      byType.get(row.equipmentType).push(row);
    }
    const groups = Object.keys(CONFIG.VAGABOND.equipmentTypes ?? {})
      .filter(key => byType.has(key))
      .map(key => ({
        key,
        label: game.i18n.localize(CONFIG.VAGABOND.equipmentTypes[key]),
        items: byType.get(key).sort((a, b) => a.name.localeCompare(b.name)),
      }));

    const tray = rows.filter(r => r.isPicked).map(r => ({
      ...r, yieldLabel: fmt(ScrapMode.yieldFor(r.item, r.picked)), partial: r.picked < r.quantity,
    }));
    const gain = tray.reduce((sum, r) => sum + ScrapMode.yieldFor(r.item, r.picked), 0);
    const count = tray.reduce((sum, r) => sum + r.picked, 0);
    const equipped = tray.filter(r => r.equipKey);

    // Slots before / after: the same Slot math the sheet uses, run on stand-ins
    const bundleSlots = (value) => (value > 0 ? MaterialsHelper.bundleSlots({ craftMaterial: { enabled: true, key: '', value } }) : 0);
    const inventory = this.actor.system.inventory ?? {};
    const maxSlots = inventory.maxSlots ?? 0;
    const slotsBefore = inventory.occupiedSlots ?? 0;
    const top = this.actor.items.filter(i => ['equipment', 'container'].includes(i.type) && !i.system.containerId);
    const after = top
      .filter(i => !(i.type === 'equipment' && i.system.craftMaterial?.enabled && (i.system.craftMaterial.key ?? '') === ''))
      .map(i => ({ system: { slots: EquipmentHelper.itemSlotCost(i), quantity: Math.max(0, (i.system.quantity ?? 1) - (picks.get(i.id) ?? 0)) } }))
      .filter(i => i.system.quantity > 0);
    const materialsAfter = materials + gain;
    if (materialsAfter > 0) after.push({ system: { slots: bundleSlots(materialsAfter), quantity: 1 } });
    const slotsAfter = EquipmentHelper.occupiedSlotsFor(after);

    return {
      groups,
      tray,
      hasPicks: tray.length > 0,
      count,
      buttonLabel: count
        ? game.i18n.format(count === 1 ? 'VAGABOND.Craft.Workbench.ScrapButtonOne' : 'VAGABOND.Craft.Workbench.ScrapButtonMany', { count })
        : game.i18n.localize('VAGABOND.Craft.Modes.Scrap.Label'),
      gainLabel: fmt(gain),
      materialsBefore: fmt(materials),
      materialsAfter: fmt(materialsAfter),
      bundleBefore: bundleSlots(materials),
      bundleAfter: bundleSlots(materialsAfter),
      slotsBefore, slotsAfter, maxSlots,
      slotsDelta: slotsAfter - slotsBefore,
      slotsDeltaLabel: `${slotsAfter > slotsBefore ? '+' : ''}${slotsAfter - slotsBefore}`,
      overCapacity: maxSlots > 0 && slotsAfter > maxSlots,
      equipped,
      hasEquipped: equipped.length > 0,
    };
  }

  /** Catalog rows, selected-item detail and Project rows (existing + staged) for the Craft tab. */
  async #prepareCraftContext(budget) {
    this.#catalog ??= await CraftCatalog.entries();
    const shiftsFor = (cost) => (budget > 0 ? Math.max(1, Math.ceil(cost / budget)) : null);

    const catalog = this.#catalog.map(e => ({
      ...e,
      costLabel: CurrencyHelper.format(e.cost),
      stats: markStatsForActor(e.stats, this.actor),
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
      stats: equipmentStats(doc, this.actor),
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
    await this.#stage(target.dataset.uuid);
  }

  /**
   * Open `actor`'s Workbench on the Craft tab with `uuid` selected and staged as a new Project row
   * (the Alchemy lab's "Craft as Project").
   */
  static async stageFromCatalog(actor, uuid) {
    const app = this.open(actor);
    if (!app || !uuid) return app;
    app.#tab = 'craft';
    app.#selectedUuid = uuid;
    await app.#stage(uuid);
    return app;
  }

  async #stage(uuid) {
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
    if (!result.ok) ui.notifications.warn(CraftingHelper.failureMessage(result));
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

  /** Row click: a single item toggles in / out of the tray; a stack adds one more (until all of it is picked). */
  static #onScrapPick(event, target) {
    const row = target.closest('[data-item-id]');
    if (!row || row.classList.contains('is-locked')) return;
    const id = row.dataset.itemId;
    const quantity = Number(row.dataset.quantity) || 1;
    const picked = this.#scrapPicks.get(id) ?? 0;
    if (quantity === 1) this.#setScrapPick(id, picked ? 0 : 1, quantity);
    else this.#setScrapPick(id, picked + 1, quantity);
  }

  static #onScrapStep(event, target) {
    const row = target.closest('[data-item-id]');
    if (!row) return;
    const id = row.dataset.itemId;
    const quantity = Number(row.dataset.quantity) || 1;
    const step = (Number(target.dataset.delta) || 0) * (event.shiftKey ? 10 : 1);
    this.#setScrapPick(id, (this.#scrapPicks.get(id) ?? 0) + step, quantity);
  }

  /** "All" toggles between the whole stack and none of it. */
  static #onScrapAll(event, target) {
    const row = target.closest('[data-item-id]');
    if (!row) return;
    const id = row.dataset.itemId;
    const quantity = Number(row.dataset.quantity) || 1;
    this.#setScrapPick(id, (this.#scrapPicks.get(id) ?? 0) >= quantity ? 0 : quantity, quantity);
  }

  static #onScrapRemove(event, target) {
    const id = target.closest('[data-item-id]')?.dataset.itemId;
    if (!id) return;
    this.#scrapPicks.delete(id);
    this.render();
  }

  static #onScrapClear() {
    this.#scrapPicks.clear();
    this.render();
  }

  static async #onScrapConfirm(event, target) {
    const entries = [...this.#scrapPicks].map(([itemId, quantity]) => ({ itemId, quantity }));
    if (!entries.length) return;
    target.disabled = true;
    const result = await CraftingHelper.request(this.actor, 'scrap', { entries });
    if (result && result.ok === false) ui.notifications.warn(CraftingHelper.failureMessage(result));
    else this.#scrapPicks.clear();
    this.render();
  }

  #setScrapPick(id, value, quantity) {
    const next = Math.max(0, Math.min(quantity, Math.floor(Number(value) || 0)));
    if (next > 0) this.#scrapPicks.set(id, next);
    else this.#scrapPicks.delete(id);
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
      ui.notifications.warn(CraftingHelper.failureMessage(result));
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

    // Catalog rows drag like any Item. Dropped on the detail panel an item is selected, on
    // Ongoing Projects it is staged as a new Project (any compendium, the sidebar, an actor
    // sheet too). A GM dropping a world item also registers it as a custom recipe so it stays
    // in the catalog for everyone.
    for (const row of this.element.querySelectorAll('.wb-cat-row[draggable="true"]')) {
      row.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('text/plain', JSON.stringify({ type: 'Item', uuid: row.dataset.uuid }));
        ev.dataTransfer.effectAllowed = 'copy';
        row.classList.add('is-dragging');
      }, { signal });
      row.addEventListener('dragend', () => row.classList.remove('is-dragging'), { signal });
    }
    const accept = async (source) => {
      if (source.type !== 'equipment') {
        ui.notifications.warn(game.i18n.localize('VAGABOND.Craft.Workbench.OnlyEquipment'));
        return false;
      }
      if (game.user.isGM && !source.pack && !source.parent && !CraftCatalog.isRecipe(source)) {
        const result = await CraftCatalog.register(source);
        if (!result.ok) ui.notifications.warn(CraftingHelper.failureMessage(result));
        else {
          ui.notifications.info(game.i18n.format('VAGABOND.Craft.Workbench.RecipeAdded', { name: source.name }));
          this.#catalog = null;
        }
      }
      return true;
    };
    this.#wireDropZone('.wb-detail', signal, async (source, uuid) => {
      if (!(await accept(source))) return;
      this.#selectedUuid = uuid;
      this.render();
    });
    this.#wireDropZone('.wb-projects', signal, async (source, uuid) => {
      if (!(await accept(source))) return;
      this.#selectedUuid = uuid;
      await this.#stage(uuid);
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

    this.#wireScrapInputs(signal);

    for (const [selector, top] of this.#savedScroll) {
      const el = this.element.querySelector(selector);
      if (el) el.scrollTop = top;
    }

    this.#wireAllocInputs(signal);
    this.#refreshShiftUI();

    if (!this._hookIds) this.#registerHooks();
  }

  /** Scrap tab: search filter (DOM only) + typed stack counts. */
  #wireScrapInputs(signal) {
    const search = this.element.querySelector('.wb-scrap-search');
    if (search) {
      const apply = () => {
        const q = this.#scrapSearch.trim().toLowerCase();
        this.element.querySelectorAll('.wb-scrap-row').forEach(row => {
          row.classList.toggle('is-hidden', !!q && !(row.dataset.name ?? '').includes(q));
        });
        this.element.querySelectorAll('.wb-scrap-group').forEach(group => {
          group.classList.toggle('is-hidden', !group.querySelector('.wb-scrap-row:not(.is-hidden)'));
        });
      };
      search.value = this.#scrapSearch;
      search.addEventListener('input', () => { this.#scrapSearch = search.value; apply(); }, { signal });
      apply();
    }
    this.element.querySelectorAll('.wb-scrap-count').forEach(input => {
      const row = input.closest('[data-item-id]');
      input.addEventListener('click', (ev) => ev.stopPropagation(), { signal });
      input.addEventListener('focus', () => input.select(), { signal });
      input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') input.blur(); }, { signal });
      input.addEventListener('change', () => {
        this.#setScrapPick(row.dataset.itemId, input.value, Number(row.dataset.quantity) || 1);
      }, { signal });
    });
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
      // Materials / Craft skill budget live on the actor itself.
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
