import { AlchemyHelper } from './crafting/alchemy-helper.mjs';
import { ALCHEMY_COST, PRIMA_MATERIA_CAP } from './crafting/alchemy-mode.mjs';
import { MixHelper } from './crafting/mix-helper.mjs';
import { CraftingHelper } from './crafting-helper.mjs';
import { CurrencyHelper } from './currency-helper.mjs';
import { MaterialsHelper } from './materials-helper.mjs';
import { VagabondDamagePipeline } from './damage-pipeline.mjs';
import { isCopyOf, sourceDocId } from './source-id.mjs';
import { WorkbenchApp } from '../applications/workbench-app.mjs';
import { FeatureAction } from './feature-action.mjs';
import { EquipmentHelper } from './equipment-helper.mjs';

/** Compendium doc id of the Deft Hands perk (`packs/_source/perks/Deft_Hands_*.json`). */
const DEFT_HANDS_ID = 'vtNfeEdWNUWvaeRM';

/** Partial rendered by every host (sheet Alchemy tab, HUD Alchemy panel). */
export const ALCHEMY_LAB_PARTIAL = 'systems/vagabond/templates/actor/parts/alchemy-lab.hbs';

/**
 * The Alchemist's Alchemy lab — one shared core for the character sheet's Alchemy tab and the Character HUD's
 * Alchemy panel. No popups: every step (Craft, Mix, Learn, Forget, Prima Materia) happens inline, failures go to
 * the lab's notice strip, and the in-Combat Use Action guard is a second click on the same button
 * ("Craft anyway (1/1)").
 *
 * Stations: Catalyze (known formula cards, Craft for 5s of Materials) | Mix (L6, two slots + preview + carousel of
 * Alchemical Items on hand) | Library (sheet only: catalog of every Alchemical Item, Learn / Prima Materia / Craft
 * as Project).
 *
 * Hosting app contract:
 * - `app.actor` is the character;
 * - spread `AlchemyLab.ACTIONS` into `DEFAULT_OPTIONS.actions`;
 * - context: `await AlchemyLab.prepare(app.actor, AlchemyLab.stateOf(app), { compact })` → render the partial with it;
 * - `_onRender`: `AlchemyLab.wire(app, rootElement, signal)` (drag-drop, selection, search, carousel);
 * - optional `app._renderAlchemyLab()` to re-render only the lab (default: `app.render()`).
 * Lab UI state (station, selection, slots, armed guard, notice…) lives per app in `app._alchemyLab`.
 */
export class AlchemyLab {

  /* -------------------------------------------- */
  /*  State                                       */
  /* -------------------------------------------- */

  /**
   * Drag payload types of the lab's own drags (carousel tile, Library row) — not 'Item', so a drop that misses
   * the lab's targets lands on the sheet as nothing instead of adding a copy to the inventory.
   */
  static DRAG_MIX = 'VagabondAlchemyMixItem';
  static DRAG_FORMULA = 'VagabondAlchemyFormula';

  static createState() {
    return {
      station: 'catalyze',
      selected: null,        // Catalyze: selected formula uuid (details box)
      editMode: false,       // Catalyze: ✕ buttons to forget formulas
      notice: '',            // last failure, until the next successful action / station switch
      armed: null,           // 'craft:<uuid>' | 'prima:<uuid>' | 'mix' — the Use Action guard waits for a 2nd click
      slots: [null, null],   // Mix: item ids
      mixSelected: null,     // Mix: carousel item id (details box)
      carouselScroll: 0,
      sort: 'group',         // Library: group | alpha | cost
      search: '',
      libOpen: null,         // Library: expanded row uuid
    };
  }

  /** The lab state of a hosting app (created on first use). */
  static stateOf(app) {
    return app._alchemyLab ??= this.createState();
  }

  /** Whether `actor` has an Alchemy lab at all (class formula grants — Babele-safe). */
  static hasLab(actor) {
    return actor?.type === 'character' && AlchemyHelper.formulaGrantsFor(actor) > 0;
  }

  /** Re-render the lab of `app` (only the lab when the host supports it). */
  static refresh(app) {
    if (typeof app._renderAlchemyLab === 'function') return app._renderAlchemyLab();
    return app.render();
  }

  /** Open the lab of `app` at `station` (feature buttons). */
  static openStation(app, station) {
    const state = this.stateOf(app);
    state.station = station;
    state.notice = '';
    state.armed = null;
  }

  /** Feature-button commands that open a lab station instead of running a macro. */
  static STATION_COMMANDS = {
    'system:alchemist.catalyze': 'catalyze',
    'system:alchemist.mix': 'mix',
  };

  /** Lab station a feature action (`FeatureAction` key) opens, or null (not a lab button / no lab). */
  static stationForAction(actor, key) {
    const cfg = FeatureAction.resolve(actor, key)?.cfg;
    const cmd = (!cfg?.uuid && typeof cfg?.command === 'string') ? cfg.command.trim() : '';
    const station = this.STATION_COMMANDS[cmd] ?? null;
    return station && this.hasLab(actor) ? station : null;
  }

  /** Show `sheet`'s Alchemy tab at `station` (rendering / raising the sheet as needed). */
  static openInSheet(sheet, station) {
    this.openStation(sheet, station);
    sheet.tabGroups.primary = 'alchemy';
    if (sheet.minimized) sheet.maximize();
    return sheet.render({ force: true });
  }

  /** The actor's own sheet at the Alchemy tab (`system:alchemist.*` run from a macro, Belt, chat…). */
  static openSheet(actor, station) {
    if (!actor?.sheet) return null;
    return this.openInSheet(actor.sheet, station);
  }

  /* -------------------------------------------- */
  /*  Use Action guard (in Combat only)           */
  /* -------------------------------------------- */

  /**
   * Use Actions per Turn for the lab: Catalyze gives the Use Action (1); the Deft Hands Perk ("skip your Move to
   * take the Use Action") adds a second one. Deft Hands by compendium doc id, so translated copies still match.
   */
  static usesPerTurn(actor) {
    return actor.items.some(i => i.type === 'perk' && isCopyOf(i, DEFT_HANDS_ID, 'Deft Hands')) ? 2 : 1;
  }

  /** Flag key of the actor's current Turn (this Round of the started Combat it fights in), or null outside Combat. */
  static turnKey(actor) {
    const combat = game.combat;
    if (!combat?.started || !combat.combatants.some(c => c.actor === actor)) return null;
    return `${combat.id}:${combat.round}`;
  }

  /** Use Actions already taken in the lab this Turn (0 outside Combat or on a new Round). */
  static usesThisTurn(actor, key = this.turnKey(actor)) {
    const used = actor.getFlag('vagabond', 'catalyzeUses');
    return key && used?.key === key ? (used.count ?? 0) : 0;
  }

  /** Count a Use Action spent this Turn (no-op outside Combat). */
  static async recordUseAction(actor, { key, used }) {
    if (key) await actor.setFlag('vagabond', 'catalyzeUses', { key, count: used + 1 });
  }

  /**
   * Soft guard: over the per-Turn limit, the first click only arms `armKey` (the button turns into
   * "… anyway (n/m)"); a second click on the same button goes on.
   * @returns {{key: string|null, used: number}|null}  null = armed, wait for the 2nd click
   */
  static #guard(actor, state, armKey) {
    const key = this.turnKey(actor);
    const used = this.usesThisTurn(actor, key);
    if (key && used >= this.usesPerTurn(actor) && state.armed !== armKey) {
      state.armed = armKey;
      return null;
    }
    return { key, used };
  }

  /** Run a Use Action craft mode through the guard; failures land in the notice strip. */
  static async #useAction(actor, state, armKey, modeKey, recipe) {
    const turn = this.#guard(actor, state, armKey);
    if (!turn) return { ok: false, armed: true };
    state.armed = null;
    const result = await CraftingHelper.execute(actor, modeKey, recipe);
    if (!result.ok) {
      state.notice = CraftingHelper.failureMessage(result);
      return result;
    }
    state.notice = '';
    await this.recordUseAction(actor, turn);
    return result;
  }

  /* -------------------------------------------- */
  /*  Routines (dialog-free)                      */
  /* -------------------------------------------- */

  /** Catalyze: Craft the known formula `uuid` for 5s of Materials with the Use Action. */
  static async craftFormula(actor, uuid, state = this.createState()) {
    return this.#useAction(actor, state, `craft:${uuid}`, 'alchemy', { formulaUuid: uuid });
  }

  /** Prima Materia (L10): spend a Studied die to Craft any Alchemical Item worth 10g or less. */
  static async primaMateria(actor, uuid, state = this.createState()) {
    await fromUuid(uuid); // PrimaMateriaMode.evaluate reads the source synchronously — prime the cache
    return this.#useAction(actor, state, `prima:${uuid}`, 'primaMateria', { itemUuid: uuid });
  }

  /** Mix (L6): combine the two slotted items (`state.slots`) by spending a Studied die. */
  static async mix(actor, state) {
    const [itemIdA, itemIdB] = state.slots;
    if (!itemIdA || !itemIdB) return { ok: false };
    const result = await this.#useAction(actor, state, 'mix', 'mix', { itemIdA, itemIdB });
    if (result.ok) state.slots = [null, null];
    return result;
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /**
   * Render data for the lab partial.
   * @param {Actor} actor
   * @param {object} state      AlchemyLab.stateOf(app)
   * @param {{compact?: boolean}} [options]  compact = HUD (no Library)
   */
  static async prepare(actor, state, { compact = false } = {}) {
    const sys = actor.system;
    const catalyzeOn = !!sys.craft?.catalyze;
    const mixOn = !!sys.craft?.mix;
    const primaOn = !!sys.craft?.primaMateria;

    const stations = [
      { id: 'catalyze', label: 'VAGABOND.AlchemyLab.Stations.Catalyze', icon: 'fa-solid fa-flask' },
      ...(mixOn ? [{ id: 'mix', label: 'VAGABOND.AlchemyLab.Stations.Mix', icon: 'fa-solid fa-flask-vial' }] : []),
      ...(compact ? [] : [{ id: 'library', label: 'VAGABOND.AlchemyLab.Stations.Library', icon: 'fa-solid fa-book-atlas' }]),
    ];
    if (!stations.some(s => s.id === state.station)) state.station = 'catalyze';
    for (const s of stations) s.active = s.id === state.station;

    // Header: Materials, Studied dice, known/grants, value cap, Use Action pips (Combat only).
    const materials = MaterialsHelper.totalValue(actor);
    const grants = AlchemyHelper.formulaGrantsFor(actor);
    const formulas = sys.craft?.formulas ?? [];
    const turnKey = this.turnKey(actor);
    const allowed = this.usesPerTurn(actor);
    const used = this.usesThisTurn(actor, turnKey);
    const header = {
      materialsLabel: CurrencyHelper.format(materials),
      craftCostLabel: CurrencyHelper.format(ALCHEMY_COST),
      studiedDice: sys.studiedDice ?? 0,
      known: formulas.length,
      grants,
      capLabel: CurrencyHelper.format(AlchemyHelper.formulaValueCapCopper(actor)),
      inCombat: !!turnKey,
      used, allowed,
      pips: Array.from({ length: Math.max(allowed, used) }, (_, i) => ({ spent: i < used, over: i >= allowed })),
    };

    // Alchemy Tools pill: the equipped kit, else any carried one (desaturated; click equips / unequips).
    const kits = actor.items.filter(i => i.type === 'equipment' && i.system.toolKind === 'alchemy');
    const kit = kits.find(i => i.system.equipped) ?? kits[0];
    if (kit) {
      header.tools = {
        id: kit.id,
        img: kit.img,
        equipped: !!kit.system.equipped,
        tip: game.i18n.format(`VAGABOND.AlchemyLab.${kit.system.equipped ? 'ToolsEquipped' : 'ToolsUnequipped'}`, { name: kit.name }),
      };
    }

    const ownedOf = this.#ownedCounter(actor);
    const context = {
      compact,
      editable: actor.isOwner,
      header,
      stations,
      station: state.station,
      notice: state.notice,
    };

    if (state.station === 'catalyze') context.catalyze = await this.#catalyzeContext(actor, state, { catalyzeOn, materials, grants, formulas, ownedOf, compact });
    else if (state.station === 'mix') context.mix = await this.#mixContext(actor, state);
    else if (state.station === 'library') context.library = await this.#libraryContext(actor, state, { primaOn, ownedOf, grants, formulas });

    // Notice strip: the last failure wins; otherwise whatever blocks crafting a known formula right now.
    if (!context.notice && state.station === 'catalyze') {
      if (!catalyzeOn) context.notice = game.i18n.localize('VAGABOND.AlchemyLab.NoCatalyze');
      else if (formulas.length) {
        const evaluation = CraftingHelper.evaluate(actor, 'alchemy', { formulaUuid: formulas[0] });
        const blocking = evaluation.checks.filter(c => !c.ok && c.key !== 'formula');
        if (blocking.length) context.notice = CraftingHelper.failureMessage({ reason: 'checksFailed', checks: blocking });
      }
    }
    return context;
  }

  /** Quantity on hand per compendium source (crafted / bought copies carry their source — doc id, so translated copies match). */
  static #ownedCounter(actor) {
    const byId = new Map();
    for (const it of actor.items) {
      if (it.type !== 'equipment') continue;
      const src = sourceDocId(it);
      if (src) byId.set(src, (byId.get(src) ?? 0) + (it.system.quantity ?? 1));
    }
    return (uuid) => byId.get(String(uuid).split('.').pop()) ?? 0;
  }

  /** Alchemical damage formula with explode notation when the dice can explode for `actor` (item, global effect, Potency). */
  static #markDamage(actor, formula, src = null) {
    const item = { type: 'equipment', system: { equipmentType: 'alchemical', canExplode: src?.canExplode, explodeValues: src?.explodeValues } };
    return VagabondDamagePipeline.markExplode(formula, item, actor);
  }

  static #typeLabel(key) {
    return key ? game.i18n.localize(CONFIG.VAGABOND.alchemicalTypes?.[key] ?? key) : '';
  }

  static #damageView(actor, src) {
    const amount = src?.damageAmount ? this.#markDamage(actor, src.damageAmount, src) : '';
    if (!amount) return null;
    const type = src.damageType && src.damageType !== '-' ? src.damageType : '';
    return {
      amount,
      typeLabel: type ? game.i18n.localize(CONFIG.VAGABOND.damageTypes?.[type] ?? type) : '',
      icon: type ? CONFIG.VAGABOND.damageTypeIcons?.[type] ?? '' : '',
    };
  }

  static async #enrich(html, relativeTo) {
    return html ? foundry.applications.ux.TextEditor.implementation.enrichHTML(html, { relativeTo }) : '';
  }

  static async #catalyzeContext(actor, state, { catalyzeOn, materials, grants, formulas, ownedOf, compact }) {
    // fromUuid (not Sync): compendium items not yet loaded only give the index shape (no damage fields).
    const known = (await Promise.all(formulas.map(async (uuid) => {
      const doc = await fromUuid(uuid);
      if (!doc) return null;
      return {
        uuid,
        name: doc.name,
        img: doc.img,
        typeLabel: this.#typeLabel(doc.system?.alchemicalType),
        damage: this.#damageView(actor, doc.system),
        owned: ownedOf(uuid),
        description: await this.#enrich(doc.system?.description, doc),
        armed: state.armed === `craft:${uuid}`,
      };
    }))).filter(Boolean);
    if (!known.some(k => k.uuid === state.selected)) state.selected = known[0]?.uuid ?? null;
    for (const k of known) k.selected = k.uuid === state.selected;

    const canAfford = materials >= ALCHEMY_COST;
    const empties = Math.max(0, grants - known.length);
    return {
      cards: known,
      empties: Array.from({ length: empties }, (_, i) => ({ index: i })),
      costLabel: CurrencyHelper.format(ALCHEMY_COST),
      canAfford,
      canCraft: catalyzeOn,
      editMode: state.editMode && !compact,
      canEdit: !compact && known.length > 0,
      selected: known.find(k => k.selected) ?? null,
      emptyKey: compact ? 'VAGABOND.AlchemyLab.NoFormulaeCompact' : 'VAGABOND.AlchemyLab.NoFormulae',
    };
  }

  static async #mixContext(actor, state) {
    const items = actor.items.filter(i => MixHelper.isMixableItem(i)).sort((a, b) => a.name.localeCompare(b.name));
    const byId = new Map(items.map(i => [i.id, i]));

    // Drop slots whose item is gone or out of charges (two of one stack need two).
    state.slots = state.slots.map((id, index) => {
      const item = id ? byId.get(id) : null;
      if (!item) return null;
      const before = state.slots.slice(0, index).filter(s => s === id).length;
      return MixHelper.charges(item) > before ? id : null;
    });
    if (state.mixSelected && !byId.has(state.mixSelected)) state.mixSelected = null;
    state.mixSelected ??= items[0]?.id ?? null;

    const entry = async (item) => ({
      id: item.id,
      name: item.name,
      img: item.img,
      charges: MixHelper.charges(item),
      typeLabel: this.#typeLabel(item.system.alchemicalType),
      damage: MixHelper.damageView(actor, MixHelper.damageOf(item), item.system),
      description: await this.#enrich(item.system.description, item),
    });
    const entries = await Promise.all(items.map(entry));
    const used = (id) => state.slots.filter(s => s === id).length;
    for (const e of entries) {
      e.selected = e.id === state.mixSelected;
      e.used = used(e.id) >= e.charges;
    }
    const entryById = new Map(entries.map(e => [e.id, e]));

    const [a, b] = state.slots.map(id => (id ? byId.get(id) : null));
    let preview = null;
    if (a && b) {
      const p = MixHelper.previewView(actor, a, b);
      preview = { ...p, useLabel: game.i18n.localize(`VAGABOND.MixPanel.${p.thrown ? 'Thrown' : 'Used'}`) };
    }
    const studiedDice = actor.system.studiedDice ?? 0;
    return {
      slots: state.slots.map((id, index) => ({ index, entry: id ? entryById.get(id) : null })),
      entries,
      selected: entryById.get(state.mixSelected) ?? null,
      preview,
      studiedDice,
      canMix: !!(a && b && studiedDice > 0),
      armed: state.armed === 'mix',
    };
  }

  static async #libraryContext(actor, state, { primaOn, ownedOf, grants, formulas }) {
    const known = new Set(formulas);
    const cap = AlchemyHelper.formulaValueCapCopper(actor);
    const picksLeft = AlchemyHelper.formulaPicksRemaining(actor);
    const studiedDice = actor.system.studiedDice ?? 0;
    const all = await AlchemyHelper.availableAlchemicals();

    const rows = all.map(a => ({
      uuid: a.uuid,
      name: a.name,
      img: a.img,
      cost: a.cost,
      costLabel: CurrencyHelper.format(a.cost),
      alchemicalType: a.alchemicalType,
      typeLabel: this.#typeLabel(a.alchemicalType),
      damage: this.#damageView(actor, a),
      description: a.description,
      known: known.has(a.uuid),
      overCap: a.cost > cap,
      owned: ownedOf(a.uuid),
      nameLower: a.name.toLowerCase(),
      open: a.uuid === state.libOpen,
      canPrima: primaOn && a.cost <= PRIMA_MATERIA_CAP,
      primaArmed: state.armed === `prima:${a.uuid}`,
    }));
    for (const r of rows) r.canLearn = !r.known && !r.overCap && picksLeft > 0;

    let groups;
    if (state.sort === 'cost') groups = [{ label: null, rows: [...rows].sort((x, y) => x.cost - y.cost) }];
    else if (state.sort === 'alpha') groups = [{ label: null, rows }];
    else {
      const byType = new Map();
      for (const r of rows) {
        if (!byType.has(r.alchemicalType)) byType.set(r.alchemicalType, []);
        byType.get(r.alchemicalType).push(r);
      }
      groups = Object.keys(CONFIG.VAGABOND.alchemicalTypes ?? {})
        .filter(key => byType.has(key))
        .map(key => ({ label: this.#typeLabel(key), rows: byType.get(key) }));
    }

    // Known strip: one tile per pick (empty tiles are drop targets for learning).
    const knownTiles = formulas.map(uuid => {
      const doc = fromUuidSync(uuid);
      return { uuid, name: doc?.name ?? uuid, img: doc?.img ?? 'icons/svg/item-bag.svg' };
    });
    const empties = Math.max(0, grants - knownTiles.length);
    return {
      groups,
      hasRows: rows.length > 0,
      knownTiles,
      empties: Array.from({ length: empties }, (_, i) => ({ index: i })),
      picksLeft,
      sort: state.sort,
      sorts: ['group', 'alpha', 'cost'].map(id => ({
        id, active: id === state.sort, label: `VAGABOND.AlchemyLab.Sort.${id}`,
      })),
      studiedDice,
      primaCapLabel: CurrencyHelper.format(PRIMA_MATERIA_CAP),
    };
  }

  /* -------------------------------------------- */
  /*  Actions (spread into the host's actions)    */
  /* -------------------------------------------- */

  static ACTIONS = {
    labStation: AlchemyLab.#onStation,
    labCraft: AlchemyLab.#onCraft,
    labForget: AlchemyLab.#onForget,
    labToggleEdit: AlchemyLab.#onToggleEdit,
    labLearn: AlchemyLab.#onLearn,
    labPrima: AlchemyLab.#onPrima,
    labProject: AlchemyLab.#onProject,
    labSort: AlchemyLab.#onSort,
    labMix: AlchemyLab.#onMix,
    labClearSlot: AlchemyLab.#onClearSlot,
    labToggleTools: AlchemyLab.#onToggleTools,
  };

  static #uuidOf(target) {
    return target.closest('[data-uuid]')?.dataset.uuid ?? null;
  }

  /** `this` = hosting app. */
  static #onStation(event, target) {
    AlchemyLab.openStation(this, target.dataset.station);
    AlchemyLab.refresh(this);
  }

  static async #onCraft(event, target) {
    const uuid = AlchemyLab.#uuidOf(target);
    if (!uuid) return;
    const state = AlchemyLab.stateOf(this);
    state.selected = uuid;
    await AlchemyLab.craftFormula(this.actor, uuid, state);
    AlchemyLab.refresh(this);
  }

  /** Forget is direct (edit mode only) — the pick is free again and the formula can be relearned any time. */
  static async #onForget(event, target) {
    const uuid = AlchemyLab.#uuidOf(target);
    if (!uuid) return;
    const state = AlchemyLab.stateOf(this);
    state.armed = null;
    const result = await AlchemyHelper.forgetFormula(this.actor, uuid);
    state.notice = result.ok ? '' : CraftingHelper.failureMessage(result);
    if (result.ok && !(this.actor.system.craft?.formulas?.length)) state.editMode = false;
    AlchemyLab.refresh(this);
  }

  static #onToggleEdit() {
    const state = AlchemyLab.stateOf(this);
    state.editMode = !state.editMode;
    state.armed = null;
    AlchemyLab.refresh(this);
  }

  static async #onLearn(event, target) {
    const uuid = AlchemyLab.#uuidOf(target);
    if (uuid) await AlchemyLab.#learn(this, uuid);
  }

  static async #learn(app, uuid) {
    const state = AlchemyLab.stateOf(app);
    state.armed = null;
    const result = await AlchemyHelper.learnFormula(app.actor, uuid);
    state.notice = result.ok ? '' : CraftingHelper.failureMessage(result);
    AlchemyLab.refresh(app);
  }

  static async #onPrima(event, target) {
    const uuid = AlchemyLab.#uuidOf(target);
    if (!uuid) return;
    await AlchemyLab.primaMateria(this.actor, uuid, AlchemyLab.stateOf(this));
    AlchemyLab.refresh(this);
  }

  /** Craft as Project: the normal Craft rules (Shift budget, half value in Materials) — staged on the Workbench Craft tab. */
  static #onProject(event, target) {
    const uuid = AlchemyLab.#uuidOf(target);
    if (uuid) WorkbenchApp.stageFromCatalog(this.actor, uuid);
  }

  static #onSort(event, target) {
    AlchemyLab.stateOf(this).sort = target.dataset.sort;
    AlchemyLab.refresh(this);
  }

  static async #onMix() {
    await AlchemyLab.mix(this.actor, AlchemyLab.stateOf(this));
    AlchemyLab.refresh(this);
  }

  /** Alchemy Tools pill: equip / unequip the kit (hand rules via equipWithHandLimit). */
  static async #onToggleTools(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !this.actor.isOwner) return;
    const state = item.system.equipped ? 'unequipped' : EquipmentHelper.defaultEquipState(item);
    await EquipmentHelper.equipWithHandLimit(this.actor, item.id, state);
  }

  static #onClearSlot(event, target) {
    const state = AlchemyLab.stateOf(this);
    state.slots[Number(target.dataset.slot)] = null;
    state.armed = null;
    AlchemyLab.refresh(this);
  }

  /* -------------------------------------------- */
  /*  DOM wiring (call from the host's _onRender) */
  /* -------------------------------------------- */

  /**
   * Selection (no re-render), drag-drop learning / slotting, double-clicks, Library search, Mix carousel.
   * @param {ApplicationV2} app
   * @param {HTMLElement} root   element containing the lab
   * @param {AbortSignal} signal
   */
  static wire(app, root, signal) {
    const lab = root?.querySelector('.alchemy-lab');
    if (!lab) return;
    const state = this.stateOf(app);
    const on = (el, type, fn, opts = {}) => el.addEventListener(type, fn, { signal, ...opts });

    // Catalyze: click a card = its details below (pure DOM swap, no re-render).
    this.#wireSelect(lab, '.al-card[data-uuid]', '.al-card-detail[data-uuid]', 'uuid', (id) => { state.selected = id; }, on);

    // Mix: carousel tile = details; double-click / drag = into a slot.
    this.#wireSelect(lab, '.al-tile[data-item-id]', '.al-tile-detail[data-item-id]', 'itemId', (id) => { state.mixSelected = id; }, on);
    for (const tile of lab.querySelectorAll('.al-tile[data-item-id]')) {
      const id = tile.dataset.itemId;
      on(tile, 'dblclick', () => {
        const empty = state.slots.indexOf(null);
        this.#place(app, empty >= 0 ? empty : 1, id);
      });
      on(tile, 'dragstart', (ev) => {
        const item = app.actor.items.get(id);
        if (!item) return;
        ev.stopPropagation(); // not the sheet's own item drag
        ev.dataTransfer.setData('text/plain', JSON.stringify({ type: AlchemyLab.DRAG_MIX, uuid: item.uuid }));
        ev.dataTransfer.effectAllowed = 'copy';
        lab.classList.add('is-dragging');
      });
      on(tile, 'dragend', () => lab.classList.remove('is-dragging'));
    }
    for (const slot of lab.querySelectorAll('.al-mix-slot[data-slot]')) {
      this.#wireDrop(slot, on, [AlchemyLab.DRAG_MIX, 'Item'], async (data) => {
        const source = data.uuid ? await fromUuid(data.uuid) : null;
        if (source?.parent?.uuid !== app.actor.uuid || !MixHelper.isMixableItem(source)) {
          ui.notifications.warn(game.i18n.localize('VAGABOND.MixPanel.OwnedOnly'));
          return;
        }
        this.#place(app, Number(slot.dataset.slot), source.id);
      });
    }
    this.#wireCarousel(lab, state, on);

    // Library: row click = expand (DOM only), double-click = Learn, drag a row onto an empty known tile = Learn.
    for (const row of lab.querySelectorAll('.al-lib-row[data-uuid]')) {
      const uuid = row.dataset.uuid;
      on(row, 'click', (ev) => {
        if (ev.target.closest('button')) return;
        const item = row.closest('.al-lib-item');
        const open = !item.classList.contains('is-open');
        for (const other of lab.querySelectorAll('.al-lib-item.is-open')) other.classList.remove('is-open');
        item.classList.toggle('is-open', open);
        state.libOpen = open ? uuid : null;
      });
      on(row, 'dblclick', () => { if (row.dataset.canLearn === 'true') this.#learn(app, uuid); });
      on(row, 'dragstart', (ev) => {
        ev.stopPropagation();
        ev.dataTransfer.setData('text/plain', JSON.stringify({ type: AlchemyLab.DRAG_FORMULA, uuid }));
        ev.dataTransfer.effectAllowed = 'copy';
        lab.classList.add('is-dragging');
      });
      on(row, 'dragend', () => lab.classList.remove('is-dragging'));
    }
    for (const zone of lab.querySelectorAll('.al-known-strip')) {
      this.#wireDrop(zone, on, [AlchemyLab.DRAG_FORMULA, 'Item'], (data) => { if (data.uuid) this.#learn(app, data.uuid); });
    }

    const search = lab.querySelector('.al-lib-search');
    if (search) {
      search.value = state.search;
      on(search, 'input', () => {
        state.search = search.value;
        this.#filterLibrary(lab, state.search);
      });
      this.#filterLibrary(lab, state.search);
    }
  }

  /** Click-to-select within a group: toggles `is-selected` on the items and shows the matching detail block. */
  static #wireSelect(lab, itemSelector, detailSelector, key, remember, on) {
    const items = Array.from(lab.querySelectorAll(itemSelector));
    const details = Array.from(lab.querySelectorAll(detailSelector));
    for (const el of items) {
      on(el, 'click', (ev) => {
        if (ev.target.closest('button:not(.al-tile)')) return; // Craft / ✕ buttons inside a card
        const id = el.dataset[key];
        for (const x of items) x.classList.toggle('is-selected', x === el);
        for (const d of details) d.hidden = d.dataset[key] !== id;
        remember(id);
      });
    }
  }

  /** Drop zone accepting drag payloads of `types` (the lab's own, or a plain Item drag). */
  static #wireDrop(zone, on, types, onDrop) {
    const accept = (ev) => { ev.preventDefault(); zone.classList.add('drag-over'); };
    on(zone, 'dragenter', accept);
    on(zone, 'dragover', accept);
    on(zone, 'dragleave', (ev) => { if (!zone.contains(ev.relatedTarget)) zone.classList.remove('drag-over'); });
    on(zone, 'drop', (ev) => {
      ev.preventDefault();
      ev.stopPropagation(); // the sheet's own drop handler must not add the item to the inventory
      zone.classList.remove('drag-over');
      zone.closest('.alchemy-lab')?.classList.remove('is-dragging');
      const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(ev);
      if (!types.includes(data?.type)) return;
      onDrop(data);
    });
  }

  /** Put item `id` in Mix slot `index`; refused when that stack has no charge left for it. */
  static #place(app, index, id) {
    const state = this.stateOf(app);
    const item = app.actor.items.get(id);
    if (!item) return;
    const others = state.slots.filter((s, i) => i !== index && s === id).length;
    if (others + 1 > MixHelper.charges(item)) {
      ui.notifications.warn(game.i18n.format('VAGABOND.MixPanel.OneCharge', { name: item.name }));
      return;
    }
    state.slots[index] = id;
    state.armed = null;
    this.refresh(app);
  }

  /** Carousel arrows + wheel; the scroll position survives re-renders. */
  static #wireCarousel(lab, state, on) {
    const strip = lab.querySelector('.al-strip');
    if (!strip) return;
    const arrows = Array.from(lab.querySelectorAll('.al-arrow'));
    const sync = () => {
      const max = strip.scrollWidth - strip.clientWidth;
      if (arrows[0]) arrows[0].disabled = strip.scrollLeft <= 1;
      if (arrows[1]) arrows[1].disabled = strip.scrollLeft >= max - 1;
    };
    for (const a of arrows) {
      on(a, 'click', () => strip.scrollBy({ left: Number(a.dataset.dir) * strip.clientWidth * 0.8, behavior: 'smooth' }));
    }
    on(strip, 'scroll', () => {
      state.carouselScroll = strip.scrollLeft;
      sync();
    });
    on(strip, 'wheel', (ev) => {
      if (!ev.deltaY || Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) return;
      ev.preventDefault();
      strip.scrollBy({ left: ev.deltaY });
    }, { passive: false });
    strip.scrollLeft = state.carouselScroll;
    requestAnimationFrame(sync);
  }

  /** Hide Library rows not matching `query`, and groups left empty. */
  static #filterLibrary(lab, query) {
    const q = query.trim().toLowerCase();
    let visible = 0;
    for (const group of lab.querySelectorAll('.al-lib-group')) {
      let any = false;
      for (const item of group.querySelectorAll('.al-lib-item')) {
        const match = !q || (item.dataset.name ?? '').includes(q);
        item.hidden = !match;
        if (match) { any = true; visible++; }
      }
      group.hidden = !any;
    }
    const none = lab.querySelector('.al-lib-nomatch');
    if (none) none.hidden = visible > 0;
  }
}
