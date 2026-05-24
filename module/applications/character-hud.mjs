import { RollHandler } from '../sheets/handlers/roll-handler.mjs';
import { SpellHandler } from '../sheets/handlers/spell-handler.mjs';
import { InventoryHandler } from '../sheets/handlers/inventory-handler.mjs';
import { EquipmentHandler } from '../sheets/handlers/equipment-handler.mjs';
import { VagabondActorSheet } from '../sheets/actor-sheet.mjs';
import { AccordionHelper } from '../helpers/accordion-helper.mjs';
import { applyHudDisplayPrefs } from '../helpers/hud-display.mjs';

/** Inventory tab groupings, in display order, keyed by equipmentType. */
const INV_GROUPS = [
  { key: 'weapon', label: 'VAGABOND.Hud.InvGroups.weapon' },
  { key: 'armor', label: 'VAGABOND.Hud.InvGroups.armor' },
  { key: 'gear', label: 'VAGABOND.Hud.InvGroups.gear' },
  { key: 'relic', label: 'VAGABOND.Hud.InvGroups.relic' },
  { key: 'alchemical', label: 'VAGABOND.Hud.InvGroups.alchemical' },
];

const { api } = foundry.applications;

/**
 * Floating, draggable, frameless player-character HUD.
 *
 * It is NOT the actor sheet — it is its own ApplicationV2 that reuses the
 * system's existing roll/cast/resource handlers verbatim. The HUD exposes
 * `.actor` and `.element`, which is all those handlers touch, so it can act
 * as the "sheet" they expect and add zero new roll/cast/resource logic.
 *
 * Quick slots are DERIVED, not manually assigned: the item slots show the
 * actor's favorited spells (priority) then equipped non-weapon items, and the
 * weapon circles show equipped weapons. Dropping an item onto the HUD equips
 * (or favorites) it, which makes it appear in the relevant slot.
 *
 * One instance per actor (keyed by actor id).
 */
export class VagabondCharacterHud extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  /** @type {Map<string, VagabondCharacterHud>} */
  static #instances = new Map();

  /** Actor id of the single selection-driven (auto-opened) HUD, or null. */
  static #autoOpenedActorId = null;

  /**
   * Minimum ownership a user needs over a token for it to auto-open its HUD.
   * Flip to `OBSERVER` to let observers (e.g. GM-shared tokens) auto-open too.
   */
  static AUTO_OPEN_MIN_OWNERSHIP = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  static ITEM_SLOTS = 5;
  static WEAPON_SLOTS = 2;

  /** Re-apply per-user display prefs to every open PC HUD (no reopen). */
  static refreshDisplayPrefs() {
    for (const hud of VagabondCharacterHud.#instances.values()) {
      if (hud.rendered && hud.element) applyHudDisplayPrefs(hud.element);
    }
  }

  #hookIds = [];
  #ctrl = null;
  #redrawTimer = null;
  /**
   * Currently open panel tab, or null when the panel is closed.
   * Not a `#private` field: it's mutated by the `static _onOpenTab` action
   * handler (Foundry rebinds `this` to the instance), and TS error 1111 forbids
   * `#private` access inside a static method. `_`-prefix keeps it internal.
   */
  _activeTab = null;
  /** Latched fixed-position coords { left, top }; survives re-renders. */
  #pos = null;

  /* -------------------------------------------- */
  /*  Construction                                */
  /* -------------------------------------------- */

  constructor(actor, options = {}) {
    super(foundry.utils.mergeObject({ id: `vbd-hud-${actor.id}` }, options));
    this.actor = actor;
    // Reuse the same handlers the sheet uses. They only read .actor / .element.
    this._rollHandler = new RollHandler(this, { npcMode: false });
    this._spellHandler = new SpellHandler(this);
    this.inventoryHandler = new InventoryHandler(this);
    this._equipmentHandler = new EquipmentHandler(this);
    // Aliases so reused VagabondActorSheet statics (which read `this.rollHandler`
    // / `this.spellHandler`) work when called with the HUD as their sheet.
    this.rollHandler = this._rollHandler;
    this.spellHandler = this._spellHandler;
  }

  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'vbd-hud', 'vbd-hud--pc'],
    window: {
      frame: false,
      positioned: true,
    },
    position: {
      width: 'auto',
      height: 'auto',
    },
    actions: {
      // Delegated rolls / casts (reuse system handlers verbatim)
      roll: this._onRoll,
      rollWeapon: this._onRollWeapon,
      useItem: this._onUseItem,
      castSpell: this._onCastSpell,
      // Delegated resource clicks (reuse VagabondActorSheet statics)
      toggleFavorHinder: this._onToggleFavorHinder,
      statusClick: this._onStatusClick,
      spendLuck: this._onSpendLuck,
      spendStudiedDie: this._onSpendStudiedDie,
      modifyCheckBonus: { handler: this._onModifyCheckBonus, buttons: [0, 2] },
      modifyMana: this._onModifyMana,
      // HUD-local UI
      openTab: this._onOpenTab,
      closePanel: this._onClosePanel,
      toggleTrait: this._onToggleAccordion,
      toggleFeature: this._onToggleAccordion,
      togglePerk: this._onToggleAccordion,
      openSheet: this._onOpenSheet,
      slotUse: { handler: this._onSlotUse, buttons: [0, 2] },
      toggleWeaponGrip: this._onToggleWeaponGrip,
      itemMenu: this._onItemMenu,
      spellMenu: this._onSpellMenu,
    },
  };

  static PARTS = {
    hud: { template: 'systems/vagabond/templates/apps/character-hud.hbs' },
  };

  /* -------------------------------------------- */
  /*  Static open / toggle helpers                */
  /* -------------------------------------------- */

  /**
   * Resolve the actor a no-argument open should target: the user's assigned
   * character first, else the controlled token's actor.
   * @returns {Actor|null}
   */
  static resolveActor() {
    if (game.user.character) return game.user.character;
    const controlled = canvas.tokens?.controlled ?? [];
    return controlled.find(t => t.actor)?.actor ?? null;
  }

  /**
   * Open (or focus) the HUD for an actor. Resolves the actor when omitted.
   * @param {Actor|null} actor
   * @param {object}  [opts]
   * @param {boolean} [opts.auto]  Mark this as the selection-driven HUD so it
   *                               follows token selection (closed on deselect).
   */
  static open(actor = null, { auto = false } = {}) {
    actor ??= this.resolveActor();
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NoActor'));
      return null;
    }
    if (actor.type !== 'character') {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NotCharacter'));
      return null;
    }
    let hud = this.#instances.get(actor.id);
    if (!hud) {
      hud = new this(actor);
      this.#instances.set(actor.id, hud);
    }
    if (auto) this.#autoOpenedActorId = actor.id;

    // Show the "drag to move" portrait hint only for the first 3 HUD opens,
    // then never again (per user) — it was annoying on every hover.
    const seen = game.user.getFlag('vagabond', 'hudPortraitTipSeen') ?? 0;
    hud._showPortraitTip = seen < 3;
    if (seen < 3) game.user.setFlag('vagabond', 'hudPortraitTipSeen', seen + 1);

    hud.render({ force: true });
    return hud;
  }

  /* -------------------------------------------- */
  /*  Selection-driven (auto-open) follow logic   */
  /* -------------------------------------------- */

  /**
   * Open/close the HUD to follow the controlled token. Called (debounced) from
   * the `controlToken` hook and whenever the auto-open toggle flips. Follow-
   * selection semantics: only the single controlled, eligible token keeps its
   * HUD open; deselecting or switching tokens closes the previous one.
   *
   * Eligible = exactly one controlled token whose actor is a `character` the
   * current user owns (see {@link AUTO_OPEN_MIN_OWNERSHIP}). NPC actors are
   * skipped silently for now (NPC HUDs are a future addition).
   */
  static syncToSelection() {
    if (!game.settings.get('vagabond', 'hudAutoOpenOnSelect')) {
      this.#closeAuto();
      return;
    }

    const controlled = canvas.tokens?.controlled ?? [];
    const actor = (controlled.length === 1) ? controlled[0]?.actor : null;
    const eligible = !!actor
      && actor.type === 'character'
      && actor.testUserPermission(game.user, this.AUTO_OPEN_MIN_OWNERSHIP);

    if (!eligible) { this.#closeAuto(); return; }
    if (actor.id === this.#autoOpenedActorId) return; // already showing it

    this.#closeAuto();                // drop the previous selection HUD
    this.open(actor, { auto: true }); // open the new one
  }

  /** Close the current selection-driven HUD, if any. */
  static #closeAuto() {
    const id = this.#autoOpenedActorId;
    if (!id) return;
    this.#autoOpenedActorId = null;
    const hud = this.#instances.get(id);
    if (hud?.rendered) hud.close();
  }

  /** Toggle the HUD for an actor (resolves when omitted). */
  static toggle(actor = null) {
    actor ??= this.resolveActor();
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NoActor'));
      return;
    }
    const hud = this.#instances.get(actor.id);
    if (hud?.rendered) hud.close();
    else this.open(actor);
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const actor = this.actor;
    const sys = actor.system;

    const context = {
      actor,
      system: sys,
      config: CONFIG.VAGABOND,
      name: actor.name,
      img: actor.img,
      activeTab: this._activeTab,
      panelOpen: !!this._activeTab,
      showPortraitTip: !!this._showPortraitTip,
    };

    // --- Vitals & controls (already-derived values; no recompute) ---
    context.hp = { value: sys.health?.value ?? 0, max: sys.health?.max ?? 0 };
    context.fatigue = { value: sys.fatigue ?? 0, max: sys.fatigueMax ?? 5 };
    context.speed = sys.speed?.base ?? 0;
    context.armor = sys.armor ?? 0;
    const equippedArmorItem = this.actor.items.find(i =>
      ((i.type === 'armor') || (i.type === 'equipment' && i.system.equipmentType === 'armor')) && i.system.equipped);
    context.armorName = equippedArmorItem ? equippedArmorItem.name : '';
    context.favorHinder = sys.favorHinder ?? 'none';
    context.studiedDice = sys.studiedDice ?? 0;
    context.checkBonus = sys.universalCheckBonus ?? 0;

    context.hasLuckPool = !!sys.hasLuckPool;
    context.luck = { value: sys.currentLuck ?? 0, max: sys.maxLuck ?? 0 };

    context.hasMana = (sys.mana?.max ?? 0) > 0;
    context.mana = {
      current: sys.mana?.current ?? 0,
      max: sys.mana?.max ?? 0,
      castingMax: sys.mana?.castingMax ?? 0,
    };

    // --- Stats (abbreviated, display-only — not rollable, like the sheet) ---
    context.stats = (CONFIG.VAGABOND.homebrew?.stats ?? []).map((s) => ({
      key: s.key,
      abbr: s.abbreviation || s.label,
      value: sys.stats?.[s.key]?.total ?? 0,
    }));

    // --- Skills / saves (same split the sheet uses) ---
    if (sys.skills) {
      const allSkills = Object.entries(sys.skills);
      context.regularSkills = allSkills
        .filter(([, s]) => !s.isWeaponSkill || s.showInSkillsList)
        .map(([key, s]) => ({ key, ...s }));
      context.attackSkills = allSkills
        .filter(([, s]) => s.isWeaponSkill)
        .map(([key, s]) => ({ key, ...s }));
    }
    context.saves = Object.entries(sys.saves ?? {}).map(([key, s]) => ({ key, ...s }));

    // --- Status condition icons (left-of-portrait column) ---
    // Reuse the sheet's exact prep so the icon set matches the character sheet
    // (only CONFIG.statusEffects conditions, not item-granted effects).
    context.statusEffects = VagabondActorSheet.prototype._prepareStatusEffects.call(this);

    // --- Items, slots, panels ---
    this._categorizeItems(context);

    return context;
  }

  /** Equipped state predicates (mirror the sheet's fields). */
  static _isWeaponEquipped(item) {
    return (item.system.equipmentState || 'unequipped') !== 'unequipped';
  }

  /** Split actor items + build the derived quick slots. */
  _categorizeItems(context) {
    const actor = this.actor;
    const weapons = [];
    const usableEquipped = []; // equipped gear / relic / alchemical (non-weapon, non-armor)
    const allEquipment = [];   // every equipment item, regardless of equipped state
    const containers = [];
    const spells = [];
    const perks = [];
    context.features = [];
    context.traits = [];

    const currentLevel = actor.system.attributes?.level?.value || actor.system.level || 1;

    for (const item of actor.items) {
      switch (item.type) {
        case 'equipment': {
          const kind = item.system.equipmentType;
          allEquipment.push(item);
          if (kind === 'weapon') weapons.push(item);
          else if (kind !== 'armor' && item.system.equipped) usableEquipped.push(item);
          break;
        }
        case 'container':
          containers.push(item);
          break;
        case 'spell':
          spells.push(item);
          break;
        case 'perk':
          perks.push(item);
          break;
        case 'class':
          if (item.system.levelFeatures) {
            context.features.push(...item.system.levelFeatures
              .filter(f => f.level <= currentLevel)
              .map((f, index) => ({ ...f, index, _id: `${item.id}-feature-${index}` })));
          }
          break;
        case 'ancestry':
          if (item.system.traits) {
            context.traits.push(...item.system.traits
              .map((t, index) => ({ ...t, index, _id: `${item.id}-trait-${index}` })));
          }
          break;
      }
    }

    // Panels
    context.weapons = weapons;
    context.spells = spells;
    context.favoritedSpells = spells.filter(s => s.system.favorite);
    context.perks = perks;

    // Inventory tab = the full carried inventory, grouped by equipment type
    // (Weapons / Armors / Gear / Relics / Alchemicals). Each row carries the
    // standard inventory action menu (see `itemMenu`).
    const byType = {};
    for (const item of allEquipment) {
      const t = item.system.equipmentType || 'gear';
      (byType[t] ??= []).push(item);
    }
    context.inventoryGroups = INV_GROUPS
      .filter(g => byType[g.key]?.length)
      .map(g => ({
        key: g.key,
        label: game.i18n.localize(g.label),
        items: byType[g.key].map(item => this._invRow(item)),
      }));

    // ----- Persistent quick slots (per-user, keyed by actor) -----
    // Slots are an explicit id→slot map, NOT re-derived each render — so a
    // removed item leaves its slot empty instead of being back-filled. The map
    // is auto-populated ONCE, on the first ever render for this actor; after
    // that only drag-drop (assign) and "Remove from HUD" (clear) change it.
    let slots = this._getSlots();
    if (!slots) slots = this._autoFillSlots(spells, usableEquipped, weapons);

    context.itemSlots = this._padIds(slots.items, VagabondCharacterHud.ITEM_SLOTS)
      .map((id) => {
        const item = id ? actor.items.get(id) : null;
        return this._slotEntry(item, item?.type === 'spell' ? 'spell' : 'item');
      });
    context.weaponSlots = this._padIds(slots.weapons, VagabondCharacterHud.WEAPON_SLOTS)
      .map((id) => {
        const item = id ? actor.items.get(id) : null;
        return this._slotEntry(item, 'weapon');
      });
  }

  /**
   * First-ever-render slot population. Item slots: favorited spells first, then
   * equipped alchemicals → relics → gear. Weapon circles: equipped weapons.
   * The result is persisted immediately so the slots never auto-fill again —
   * thereafter the user owns the layout (drag to add, "Remove from HUD" to
   * clear). Returns the in-memory map for the current render.
   */
  _autoFillSlots(spells, usableEquipped, weapons) {
    const TYPE_ORDER = { alchemical: 0, relic: 1, gear: 2 };
    const favSpells = spells.filter(s => s.system.favorite);
    const orderedEquip = usableEquipped.slice().sort(
      (a, b) => (TYPE_ORDER[a.system.equipmentType] ?? 9) - (TYPE_ORDER[b.system.equipmentType] ?? 9),
    );
    const itemIds = [...favSpells, ...orderedEquip]
      .slice(0, VagabondCharacterHud.ITEM_SLOTS).map(i => i.id);
    const weaponIds = weapons.filter(w => VagabondCharacterHud._isWeaponEquipped(w))
      .slice(0, VagabondCharacterHud.WEAPON_SLOTS).map(i => i.id);
    const slots = {
      items: this._padIds(itemIds, VagabondCharacterHud.ITEM_SLOTS),
      weapons: this._padIds(weaponIds, VagabondCharacterHud.WEAPON_SLOTS),
    };
    // Fire-and-forget: setFlag triggers no hook the HUD listens to (no loop).
    this._saveSlots(slots);
    return slots;
  }

  /** Slice/pad an id array to exactly `n` entries, padding short with null. */
  _padIds(arr, n) {
    const out = (arr ?? []).slice(0, n);
    while (out.length < n) out.push(null);
    return out;
  }

  _slotEntry(item, type) {
    if (!item) return { filled: false, type };
    const entry = { filled: true, type, id: item.id, img: item.img, name: item.name };
    if (type === 'weapon') {
      const { EquipmentHelper } = globalThis.vagabond.utils;
      entry.versatile = EquipmentHelper.isVersatileWeapon(item);
      entry.twoHanded = item.system.equipmentState === 'twoHands';
    }
    return entry;
  }

  /** Flatten an equipment item into an inventory-row render object. */
  _invRow(item) {
    const isWeapon = item.system.equipmentType === 'weapon';
    const equipped = isWeapon
      ? VagabondCharacterHud._isWeaponEquipped(item)
      : (item.system?.equipped ?? item.system?.worn ?? false);
    const row = {
      _id: item.id,
      name: item.name,
      img: item.img,
      isWeapon,
      equipped,
      // Weapons expose the grip-derived type/damage; the universal `damageType`
      // stays at '-' for them, so prefer `currentDamageType`/`currentDamage`.
      damageType: isWeapon ? (item.system?.currentDamageType ?? '-') : (item.system?.damageType ?? '-'),
      damage: item.system?.currentDamage ?? item.system?.damageAmount ?? '',
    };
    if (isWeapon) {
      const cfg = CONFIG.VAGABOND;
      row.damageTypeLabel = game.i18n.localize(cfg.damageTypes?.[row.damageType] ?? '');
      row.range = item.system?.rangeAbbrev || '';      // C / N / F
      row.rangeLabel = item.system?.rangeDisplay || ''; // Close / Near / Far (tooltip)
      row.properties = (item.system?.properties ?? [])
        .map(k => game.i18n.localize(cfg.weaponProperties?.[k] ?? k))
        .join(', ');
    }
    return row;
  }

  /* -------------------------------------------- */
  /*  Render lifecycle                            */
  /* -------------------------------------------- */

  _onRender(context, options) {
    this.#ctrl?.abort();
    this.#ctrl = new AbortController();
    const { signal } = this.#ctrl;

    // Register reactivity FIRST so a later DOM-wiring error can never leave the
    // HUD without live hooks (was the cause of slots not auto-updating).
    this._registerHooks();

    // Per-user accessibility prefs (dark bg / blur / font scale).
    applyHudDisplayPrefs(this.element);

    this.setPosition();
    this._applyPanelPlacement();
    // Re-run after layout settles (offset sizes are 0 on the first paint).
    requestAnimationFrame(() => { this.setPosition(); this._applyPanelPlacement(); });

    // Drag handle: portrait moves the HUD.
    const handle = this.element.querySelector('.vh-drag');
    if (handle) handle.addEventListener('pointerdown', (e) => this._onDragStart(e), { signal });

    // Double-click portrait → open the actor sheet (HUD stays open).
    const portrait = this.element.querySelector('.vh-portrait');
    if (portrait) portrait.addEventListener('dblclick', () => this.actor.sheet.render(true), { signal });

    // Right-click the portrait region → HUD context menu (sheet / ping / close).
    if (handle) handle.addEventListener('contextmenu', (e) => this._openHudMenu(e), { signal });

    // Status icons (left of portrait): right-click → Send to Chat / Remove Status.
    // Reuse the sheet's exact menu — left-click chat is handled by the statusClick action.
    VagabondActorSheet.prototype._setupStatusIconListeners.call(this);

    // HP — left −1 / right +1 (matches the sheet & ongoing panel).
    const hpEl = this.element.querySelector('.vh-vital--hp');
    if (hpEl) {
      hpEl.addEventListener('click', () => this._changeHp(-1), { signal });
      hpEl.addEventListener('contextmenu', (e) => { e.preventDefault(); this._changeHp(+1); }, { signal });
    }
    // Fatigue — left +1 / right −1 (inverse of HP).
    const fatEl = this.element.querySelector('.vh-vital--fatigue');
    if (fatEl) {
      fatEl.addEventListener('click', () => this._changeFatigue(+1), { signal });
      fatEl.addEventListener('contextmenu', (e) => { e.preventDefault(); this._changeFatigue(-1); }, { signal });
    }

    // Right-click mana → restore (left-click via action = spend).
    const manaEl = this.element.querySelector('[data-action="modifyMana"]');
    if (manaEl) manaEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      VagabondActorSheet._onModifyMana.call(this, e, manaEl);
    }, { signal });

    // Make panel rows (inventory + spells) draggable onto the slots. The inner
    // <img> is set non-draggable so grabbing it drags the whole row, not the image.
    for (const el of this.element.querySelectorAll('.vh-inv-use, .vh-spell-use')) {
      el.setAttribute('draggable', 'true');
      el.querySelector('img')?.setAttribute('draggable', 'false');
      el.addEventListener('dragstart', (e) => {
        const id = el.dataset.itemId || el.dataset.spellId;
        const item = id && this.actor.items.get(id);
        if (!item) return;
        e.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
        e.dataTransfer.effectAllowed = 'move';
      }, { signal });
    }

    // Drop anywhere on the HUD body (incl. item/weapon slots) → equip / favorite.
    const body = this.element.querySelector('.vh-body');
    if (body) {
      body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('drag-over'); }, { signal });
      body.addEventListener('dragleave', (e) => { if (e.target === body) body.classList.remove('drag-over'); }, { signal });
      body.addEventListener('drop', (e) => this._onHudDrop(e, body), { signal });
    }
  }

  /* -------------------------------------------- */
  /*  HP / Fatigue quick adjust                   */
  /* -------------------------------------------- */

  _changeHp(delta) {
    const max = this.actor.system.health?.max ?? 0;
    const val = Math.clamp((this.actor.system.health?.value ?? 0) + delta, 0, max);
    this.actor.update({ 'system.health.value': val });
  }

  _changeFatigue(delta) {
    const max = this.actor.system.fatigueMax ?? 5;
    const val = Math.clamp((this.actor.system.fatigue ?? 0) + delta, 0, max);
    this.actor.update({ 'system.fatigue': val });
  }

  /* -------------------------------------------- */
  /*  Drag + position persistence (per user)      */
  /* -------------------------------------------- */

  /** Saved per-user/per-actor position, or null. */
  _savedPosition() {
    const stored = (game.user.getFlag('vagabond', 'hudPosition') ?? {})[this.actor.id];
    return (stored?.left != null && stored?.top != null)
      ? { left: stored.left, top: stored.top }
      : null;
  }

  /**
   * Override V2 setPosition — a frameless ApplicationV2 gets no positioning
   * shell, so force `position: fixed` with explicit inline coords (same fix
   * the spell-cast dialog uses). Position is latched in `#pos` so reactivity
   * re-renders don't teleport the HUD; drag overwrites `#pos` directly.
   */
  setPosition() {
    const el = this.element;
    if (!el) return;
    if (!this.#pos) this.#pos = this._savedPosition() ?? { left: 160, top: 90 };
    let { left, top } = this.#pos;
    const w = el.offsetWidth || 425;
    const h = el.offsetHeight || 120;
    left = Math.max(0, Math.min(left, window.innerWidth - Math.min(w, window.innerWidth)));
    top = Math.max(0, Math.min(top, window.innerHeight - Math.min(h, window.innerHeight)));
    el.style.position = 'fixed';
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.width = 'auto';
    el.style.height = 'auto';
    return { left, top };
  }

  #savePosition = foundry.utils.debounce(async () => {
    if (!this.#pos) return;
    const all = foundry.utils.deepClone(game.user.getFlag('vagabond', 'hudPosition') ?? {});
    all[this.actor.id] = { left: Math.round(this.#pos.left), top: Math.round(this.#pos.top) };
    await game.user.setFlag('vagabond', 'hudPosition', all);
  }, 250);

  _onDragStart(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    const rect = this.element.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    const onMove = (e) => {
      this.#pos = { left: startLeft + (e.clientX - startX), top: startTop + (e.clientY - startY) };
      this.setPosition();
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      this.#savePosition();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  /* -------------------------------------------- */
  /*  Panel placement (above / below)             */
  /* -------------------------------------------- */

  _applyPanelPlacement() {
    const panel = this.element.querySelector('.vh-panel');
    if (!panel) return;
    const rect = this.element.getBoundingClientRect();
    const below = rect.top + rect.height / 2 < window.innerHeight / 2;
    panel.classList.toggle('vh-panel--below', below);
    panel.classList.toggle('vh-panel--above', !below);
  }

  /* -------------------------------------------- */
  /*  Reactivity hooks (filtered + debounced)     */
  /* -------------------------------------------- */

  _registerHooks() {
    this._clearHooks();
    const mine = (doc) => {
      const a = doc?.actor ?? doc?.parent ?? doc;
      return a?.id === this.actor.id || a?.parent?.id === this.actor.id;
    };
    const redraw = (doc) => { if (!doc || mine(doc)) this._reDraw(); };
    this.#hookIds.push(
      Hooks.on('updateActor', (a) => { if (a?.id === this.actor.id) this._reDraw(); }),
      Hooks.on('createItem', redraw),
      Hooks.on('updateItem', redraw),
      Hooks.on('deleteItem', redraw),
      Hooks.on('createActiveEffect', redraw),
      Hooks.on('updateActiveEffect', redraw),
      Hooks.on('deleteActiveEffect', redraw),
    );
  }

  /**
   * Coalesced re-render. A plain `setTimeout` (not `foundry.utils.debounce`)
   * so we are certain the trailing render actually fires.
   */
  _reDraw() {
    clearTimeout(this.#redrawTimer);
    this.#redrawTimer = setTimeout(() => this.render(), 50);
  }

  _clearHooks() {
    for (const id of this.#hookIds) Hooks.off(id);
    this.#hookIds = [];
  }

  async close(options = {}) {
    this.#ctrl?.abort();
    this.#ctrl = null;
    clearTimeout(this.#redrawTimer);
    this._clearHooks();
    if (VagabondCharacterHud.#autoOpenedActorId === this.actor.id) {
      VagabondCharacterHud.#autoOpenedActorId = null;
    }
    VagabondCharacterHud.#instances.delete(this.actor.id);
    // Skip ApplicationV2's built-in close fade — the HUD should vanish instantly.
    return super.close({ animate: false, ...options });
  }

  /* -------------------------------------------- */
  /*  Sheet-shim for reused handlers              */
  /* -------------------------------------------- */

  /** RollHandler.roll() calls this only for data-roll-type="item" (unused here). */
  _getEmbeddedDocument(target) {
    const id = target?.dataset?.itemId ?? target?.closest('[data-item-id]')?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }

  /* -------------------------------------------- */
  /*  Action handlers — delegated rolls / casts   */
  /* -------------------------------------------- */

  static _onRoll(event, target) { return this._rollHandler.roll(event, target); }
  static _onRollWeapon(event, target) { return this._rollHandler.rollWeapon(event, target); }
  static _onUseItem(event, target) { return this._rollHandler.useItem(event, target); }
  static _onCastSpell(event, target) { return this._spellHandler.castSpell(event, target); }

  /* --- delegated resource clicks (reuse sheet statics verbatim) --- */
  static _onToggleFavorHinder(event, target) { return VagabondActorSheet._onToggleFavorHinder.call(this, event, target); }
  static _onStatusClick(event, target) { return VagabondActorSheet._onStatusClick.call(this, event, target); }
  static _onSpendLuck(event, target) { return VagabondActorSheet._onSpendLuck.call(this, event, target); }
  static _onSpendStudiedDie(event, target) { return VagabondActorSheet._onSpendStudiedDie.call(this, event, target); }
  static _onModifyCheckBonus(event, target) { return VagabondActorSheet._onModifyCheckBonus.call(this, event, target); }
  static _onModifyMana(event, target) { return VagabondActorSheet._onModifyMana.call(this, event, target); }

  /* -------------------------------------------- */
  /*  Action handlers — HUD-local UI              */
  /* -------------------------------------------- */

  /** Open/switch/close the tab panel. */
  static _onOpenTab(event, target) {
    const tab = target.dataset.tab;
    this._activeTab = (this._activeTab === tab) ? null : tab;
    this.render();
  }

  /** Close button in the panel header → close the tab panel. */
  static _onClosePanel() {
    this._activeTab = null;
    this.render();
  }

  /** Generic accordion toggle for trait/feature/perk rows. */
  static _onToggleAccordion(event, target) {
    const item = target.closest('.accordion-item');
    if (item) AccordionHelper.toggle(item);
  }

  /** Open the actor sheet without closing the HUD. */
  static _onOpenSheet() { this.actor.sheet.render(true); }

  /** Inventory row "⋮" button → the exact same context menu the sheet uses. */
  static _onItemMenu(event, target) {
    return this.inventoryHandler.showInventoryContextMenu(event, target.dataset.itemId);
  }

  /**
   * Spells-panel row "⋮" button → spell menu WITHOUT "Remove from HUD"
   * (the panel lists every spell; only slots can be removed from the HUD).
   */
  static _onSpellMenu(event, target) {
    event.preventDefault();
    const item = this.actor.items.get(target.dataset.spellId);
    if (item) this._openSlotMenu(event, item, 'spell', { includeRemove: false });
  }

  /**
   * Left-click a filled slot = use it (cast / attack / use).
   * Right-click = open the slot context menu.
   */
  static _onSlotUse(event, target) {
    const type = target.dataset.type;
    const id = target.dataset.itemId;
    if (!id) return;
    const item = this.actor.items.get(id);
    if (!item) return;

    if (event.type === 'contextmenu' || event.button === 2) {
      event.preventDefault();
      return this._openSlotMenu(event, item, type);
    }
    if (type === 'spell') return this._spellHandler.castSpell(event, { dataset: { spellId: id } });
    if (type === 'weapon') return this._rollHandler.rollWeapon(event, target);
    return this._rollHandler.useItem(event, target);
  }

  /**
   * Versatile-weapon grip badge → toggle 1H ⇄ 2H. Delegates to the shared
   * EquipmentHandler; the `updateItem` hook re-renders and flips the badge.
   */
  static _onToggleWeaponGrip(event, target) {
    event.preventDefault();
    return this._equipmentHandler.toggleWeaponGrip(event, target);
  }

  /**
   * Slot context menu. Spells: Send to Chat, Remove from HUD. Weapons/items:
   * Use, Send to Chat, Unequip, Remove from HUD.
   * @param {Event} event
   * @param {Item} item
   * @param {'spell'|'weapon'|'item'} type
   */
  _openSlotMenu(event, item, type, { includeRemove = true } = {}) {
    const { ContextMenuHelper, VagabondChatCard, EquipmentHelper } = globalThis.vagabond.utils;
    const L = (k) => game.i18n.localize(k);
    const items = [];

    if (type !== 'spell') {
      items.push({
        label: L('VAGABOND.Hud.Menu.Use'),
        icon: 'fas fa-hand-sparkles',
        action: () => (type === 'weapon')
          ? this._rollHandler.rollWeapon(event, { dataset: { itemId: item.id } })
          : this._rollHandler.useItem(event, { dataset: { itemId: item.id } }),
      });
    }

    if (type === 'weapon' && EquipmentHelper.isVersatileWeapon(item)) {
      const twoH = item.system.equipmentState === 'twoHands';
      items.push({
        label: L(twoH ? 'VAGABOND.Hud.Menu.UseOneHand' : 'VAGABOND.Hud.Menu.UseTwoHands'),
        icon: twoH ? 'fas fa-hand-fist' : 'fas fa-hands',
        action: async () => {
          await this._equipmentHandler.toggleWeaponGrip(event, { dataset: { itemId: item.id } });
          this.render();
        },
      });
    }

    items.push({
      label: L('VAGABOND.Hud.Menu.Open'),
      icon: 'fas fa-up-right-from-square',
      action: () => item.sheet.render(true),
    });

    items.push({
      label: L('VAGABOND.Hud.Menu.SendToChat'),
      icon: 'fas fa-comment',
      action: () => VagabondChatCard.gearUse(this.actor, item),
    });

    if (type !== 'spell') {
      items.push({
        label: L('VAGABOND.Hud.Menu.Unequip'),
        icon: 'fas fa-times',
        action: async () => {
          await ((type === 'weapon')
            ? item.update({ 'system.equipmentState': 'unequipped' })
            : item.update({ 'system.equipped': false }));
          this.render();
        },
      });
    }

    if (includeRemove) {
      items.push({
        label: L('VAGABOND.Hud.Menu.RemoveFromHud'),
        icon: 'fas fa-eye-slash',
        action: async () => { await this._clearSlot(item.id); },
      });
    }

    ContextMenuHelper.create({
      position: { x: event.clientX, y: event.clientY },
      items,
      className: 'inventory-context-menu',
    });
  }

  /**
   * HUD-level context menu (right-click the portrait): open the actor sheet,
   * ping the character's token on the canvas, or close this HUD.
   * @param {Event} event
   */
  _openHudMenu(event) {
    event.preventDefault();
    const { ContextMenuHelper } = globalThis.vagabond.utils;
    const L = (k) => game.i18n.localize(k);

    // XP entry mirrors the sheet: "XP {current}/{next}" with the level-up
    // chevron shown only when the actor has banked enough XP to level.
    const attr = this.actor.system.attributes ?? {};
    const canLevelUp = !!attr.canLevelUp;
    const xpLabel = `${L('VAGABOND.Hud.Menu.XP')} ${attr.xp ?? 0}/${attr.xpRequired ?? 0}`;

    ContextMenuHelper.create({
      position: { x: event.clientX, y: event.clientY },
      className: 'inventory-context-menu',
      items: [
        {
          label: L('VAGABOND.Hud.OpenSheet'),
          icon: 'fas fa-up-right-from-square',
          action: () => this.actor.sheet.render(true),
        },
        {
          label: L('VAGABOND.Hud.Menu.Downtime'),
          icon: 'fas fa-hourglass-half',
          action: () => new globalThis.vagabond.applications.DowntimeApp(this.actor).render(true),
        },
        {
          label: xpLabel,
          icon: canLevelUp ? 'fas fa-chevron-double-up' : 'fas fa-star',
          action: () => new globalThis.vagabond.applications.LevelUpDialog(this.actor).render(true),
        },
        {
          label: L('VAGABOND.Hud.Menu.Ping'),
          icon: 'fas fa-bullseye',
          action: () => this._pingToken(),
        },
        {
          label: L('VAGABOND.Hud.Menu.Close'),
          icon: 'fas fa-xmark',
          action: () => this.close(),
        },
      ],
    });
  }

  /** Ping (and pan to) the character's token on the active scene. */
  _pingToken() {
    const token = this.actor.token?.object ?? this.actor.getActiveTokens(true)[0];
    if (!token) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NoTokenToPing'));
      return;
    }
    canvas.ping(token.center);
    canvas.animatePan({ x: token.center.x, y: token.center.y });
  }

  /* -------------------------------------------- */
  /*  Persistent quick-slot storage (per user)    */
  /* -------------------------------------------- */

  /** Saved slot map for this actor, or null when never initialized. */
  _getSlots() {
    const all = game.user.getFlag('vagabond', 'hudSlots') ?? {};
    return all[this.actor.id] ?? null;
  }

  /** Normalized slot map (never null; both arrays padded to their counts). */
  _readSlots() {
    const raw = this._getSlots();
    return {
      items: this._padIds(raw?.items, VagabondCharacterHud.ITEM_SLOTS),
      weapons: this._padIds(raw?.weapons, VagabondCharacterHud.WEAPON_SLOTS),
    };
  }

  async _saveSlots(slots) {
    const all = foundry.utils.deepClone(game.user.getFlag('vagabond', 'hudSlots') ?? {});
    all[this.actor.id] = slots;
    await game.user.setFlag('vagabond', 'hudSlots', all);
  }

  /** "Remove from HUD": drop an item id out of every slot, leaving it empty. */
  async _clearSlot(itemId) {
    const slots = this._readSlots();
    slots.items = slots.items.map(id => (id === itemId ? null : id));
    slots.weapons = slots.weapons.map(id => (id === itemId ? null : id));
    await this._saveSlots(slots);
    this.render();
  }

  /* -------------------------------------------- */
  /*  Drop → equip / favorite                     */
  /* -------------------------------------------- */

  async _onHudDrop(event, body) {
    event.preventDefault();
    body.classList.remove('drag-over');
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
    if (data?.type !== 'Item') return;
    const item = await fromUuid(data.uuid);
    if (!item) return;
    if (item.parent?.id !== this.actor.id) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.SlotForeignItem'));
      return;
    }
    // Only spells + equipment go in slots; armor has no quick-use action.
    if (item.type !== 'spell' && item.type !== 'equipment') return;
    if (item.type === 'equipment' && item.system.equipmentType === 'armor') return;
    const slotEl = event.target?.closest?.('.vh-slot, .vh-pc-weapon') ?? null;
    await this._assignDrop(item, slotEl);
  }

  /**
   * Assign a dropped item into a quick slot — replace, never displace. Weapons
   * go to the weapon circles; spells / gear / relic / alchemical go to the item
   * slots. If the drop landed on a specific same-kind slot, that slot is used;
   * otherwise the first empty slot, else the last slot. The item is first
   * removed from any slot it already occupied (move, not duplicate). Slot
   * membership is independent of equipped/favorite state — dropping does not
   * change game state, only the launcher layout.
   * @param {Item} item
   * @param {HTMLElement|null} slotEl  The slot element under the cursor, if any.
   */
  async _assignDrop(item, slotEl) {
    const isWeapon = item.type === 'equipment' && item.system.equipmentType === 'weapon';
    const kind = isWeapon ? 'weapons' : 'items';
    const max = isWeapon ? VagabondCharacterHud.WEAPON_SLOTS : VagabondCharacterHud.ITEM_SLOTS;

    // A slotted item should be ready to use: equip / favorite it if it isn't.
    await this._ensureEquippedOrFavorite(item);

    const slots = this._readSlots();
    slots.items = slots.items.map(id => (id === item.id ? null : id));
    slots.weapons = slots.weapons.map(id => (id === item.id ? null : id));

    let idx = -1;
    if (slotEl) {
      const sameKind = isWeapon ? slotEl.classList.contains('vh-pc-weapon') : slotEl.classList.contains('vh-slot');
      const n = Number(slotEl.dataset.slotIndex);
      if (sameKind && Number.isInteger(n) && n >= 0 && n < max) idx = n;
    }
    if (idx < 0) idx = slots[kind].findIndex(id => id == null);
    if (idx < 0) idx = max - 1; // all full, no target → replace the last slot

    slots[kind][idx] = item.id;
    await this._saveSlots(slots);
    this.render();
  }

  /**
   * Make a slotted item ready to use: favorite spells, equip weapons (grip-
   * aware, 2H → twoHands else oneHand), equip other equipment. No-op when the
   * item is already in the right state so a 2H weapon is never downgraded.
   * @param {Item} item
   */
  async _ensureEquippedOrFavorite(item) {
    if (item.type === 'spell') {
      if (!item.system.favorite) await item.update({ 'system.favorite': true });
    } else if (item.type === 'equipment' && item.system.equipmentType === 'weapon') {
      if (!VagabondCharacterHud._isWeaponEquipped(item)) {
        await item.update({ 'system.equipmentState': item.system.grip === '2H' ? 'twoHands' : 'oneHand' });
      }
    } else if (item.system?.equipped !== undefined && !item.system.equipped) {
      await item.update({ 'system.equipped': true });
    }
  }
}
