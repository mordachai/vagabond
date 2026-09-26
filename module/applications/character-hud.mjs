import { RollHandler } from '../sheets/handlers/roll-handler.mjs';
import { SpellHandler } from '../sheets/handlers/spell-handler.mjs';
import { InventoryHandler } from '../sheets/handlers/inventory-handler.mjs';
import { EquipmentHandler } from '../sheets/handlers/equipment-handler.mjs';
import { VagabondActorSheet } from '../sheets/actor-sheet.mjs';
import { WorkbenchApp } from './workbench-app.mjs';
import { CraftingHelper } from '../helpers/crafting-helper.mjs';
import { AccordionHelper } from '../helpers/accordion-helper.mjs';
import { applyHudDisplayPrefs, getHudHealthBar, isItemPile } from '../helpers/hud-display.mjs';
import { activateHandItem } from '../helpers/hand-item-activation.mjs';
import { buildItemMenuItems, buildSpellMenuItems } from '../helpers/item-menu.mjs';
import { bindHudTooltips } from '../helpers/hud-tooltip.mjs';
import { buildEffectMenuItems } from '../helpers/effects.mjs';
import { setupDragReorder } from '../helpers/drag-reorder.mjs';
import * as ItemSections from '../helpers/item-sections.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';

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
 * Item quick-slots are a persisted per-actor layout (auto-filled once from
 * favorited spells + equipped non-weapon items, then user-owned thereafter).
 * Weapon circles are NOT persisted — they're a live mirror of whichever
 * weapons are actually equipped (`system.equipmentState`), always in sync
 * with the character sheet's "Equipped" panel in both directions. Dropping an
 * outside item onto the HUD adds it to the actor exactly like a sheet drop
 * (see `_onDrop`); equipping/favoriting stays a separate explicit action.
 *
 * One instance per token (keyed by token uuid for unlinked actors, else actor
 * id) — so unlinked duplicate PC-type actors (e.g. summons sharing one base
 * actor) each get their own independent HUD instead of collapsing into one.
 */
export class VagabondCharacterHud extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  /** @type {Map<string, VagabondCharacterHud>} */
  static #instances = new Map();

  /** Instance key for an actor: token uuid when unlinked, else actor id. */
  static _keyFor(actor) {
    return actor?.isToken ? actor.token.uuid : actor?.id;
  }

  /** Instance key of the single selection-driven (auto-opened) HUD, or null. */
  static #autoOpenedKey = null;

  /** Instance key of the pinned (always-on) main-character HUD, or null. */
  static #pinnedKey = null;

  /**
   * Minimum ownership a user needs over a token for it to auto-open its HUD.
   * Flip to `OBSERVER` to let observers (e.g. GM-shared tokens) auto-open too.
   */
  static AUTO_OPEN_MIN_OWNERSHIP = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  static MIN_ITEM_SLOTS = 5;
  static MAX_ITEM_SLOTS = 7;
  // Weapon circles are derived from the RAW equipped-weapon Slot budget
  // (CONFIG.VAGABOND.maxEquippedWeaponSlots), not a fixed count — see _categorizeItems.

  /** Re-apply per-user display prefs to every open PC HUD (no reopen). */
  static refreshDisplayPrefs() {
    for (const hud of VagabondCharacterHud.#instances.values()) {
      if (hud.rendered && hud.element) applyHudDisplayPrefs(hud.element);
    }
  }

  /** Re-evaluate idle-fade wiring on every open PC HUD (settings changed). */
  static refreshIdleFade() {
    for (const hud of VagabondCharacterHud.#instances.values()) {
      if (hud.rendered) hud._applyIdleFade();
    }
  }

  /** Close every open PC HUD (including the pinned one). */
  static closeAll() {
    for (const hud of [...VagabondCharacterHud.#instances.values()]) {
      if (hud.rendered) hud.close();
    }
  }

  /** Whether the current user has opted out of the Character HUD entirely (client-only). */
  static isDisabledForUser() {
    return !!game.settings.get('vagabond', 'hudDisabled');
  }

  /** Called by the `hudDisabled` setting's onChange. Tears down or restores HUDs live. */
  static onDisabledSettingChange() {
    if (VagabondCharacterHud.isDisabledForUser()) {
      VagabondCharacterHud.closeAll();
    } else {
      VagabondCharacterHud.syncAlwaysOn();
      VagabondCharacterHud.syncToSelection();
    }
  }

  #hookIds = [];
  #ctrl = null;
  #redrawTimer = null;
  #idleTimer = null;
  #idleCtrl = null;
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
    const key = VagabondCharacterHud._keyFor(actor);
    super(foundry.utils.mergeObject({ id: `vbd-hud-${key.replace(/\W/g, '-')}` }, options));
    this.actor = actor;
    this.key = key;
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
      useItemRow: this._onUseItemRow,
      castSpellRow: this._onCastSpell,
      toggleItemDetail: this._onToggleAccordion,
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
      toggleSpellFavorite: this._onToggleSpellFavorite,
      toggleEquip: this._onToggleEquip,
      usePip: this._onUsePip,
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
    return controlled.find(t => t.actor && !isItemPile(t.actor))?.actor ?? null;
  }

  /**
   * Open (or focus) the HUD for an actor. Resolves the actor when omitted.
   * @param {Actor|null} actor
   * @param {object}  [opts]
   * @param {boolean} [opts.auto]  Mark this as the selection-driven HUD so it
   *                               follows token selection (closed on deselect).
   */
  static open(actor = null, { auto = false, silent = false } = {}) {
    if (VagabondCharacterHud.isDisabledForUser()) {
      if (!silent) ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.DisabledForUser'));
      return null;
    }
    actor ??= this.resolveActor();
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NoActor'));
      return null;
    }
    if (actor.type !== 'character') {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NotCharacter'));
      return null;
    }
    if (isItemPile(actor)) {
      if (!silent) ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NotForItemPile'));
      return null;
    }
    const key = this._keyFor(actor);
    let hud = this.#instances.get(key);
    if (!hud) {
      hud = new this(actor);
      this.#instances.set(key, hud);
    }
    if (auto) this.#autoOpenedKey = key;

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
      && !isItemPile(actor)
      && actor.testUserPermission(game.user, this.AUTO_OPEN_MIN_OWNERSHIP);

    if (!eligible) { this.#closeAuto(); return; }
    const key = this._keyFor(actor);
    // The pinned (always-on) HUD is already open and must never be tagged as the
    // auto HUD — otherwise deselecting its token would close it.
    if (key === this.#pinnedKey) { this.#closeAuto(); return; }
    if (key === this.#autoOpenedKey) return; // already showing it

    this.#closeAuto();                                  // drop the previous selection HUD
    this.open(actor, { auto: true, silent: true });      // open the new one
  }

  /**
   * Open/close the pinned "always on screen" HUD for the user's assigned main
   * character. No-op (and closes any prior pinned HUD) when the setting is off
   * or the user has no main character. Called on `ready`, on the setting's
   * `onChange`, and whenever the user's assigned character changes.
   */
  static syncAlwaysOn() {
    const on = game.settings.get('vagabond', 'hudAlwaysOnForMainChar');
    const actor = game.user.character;
    const eligible = on && actor && actor.type === 'character' && !isItemPile(actor);
    const key = actor ? this._keyFor(actor) : null;

    // Tear down a stale pin (setting toggled off, or character reassigned).
    if (this.#pinnedKey && (!eligible || key !== this.#pinnedKey)) {
      const prev = this.#instances.get(this.#pinnedKey);
      this.#pinnedKey = null;
      if (prev?.rendered) prev.close();
    }

    if (!eligible) return;
    this.#pinnedKey = key;
    this.open(actor, { silent: true }); // not { auto } — selection changes must not close it
  }

  /** Close the current selection-driven HUD, if any. */
  static #closeAuto() {
    const key = this.#autoOpenedKey;
    if (!key) return;
    this.#autoOpenedKey = null;
    const hud = this.#instances.get(key);
    if (hud?.rendered) hud.close();
  }

  /** Toggle the HUD for an actor (resolves when omitted). */
  static toggle(actor = null) {
    actor ??= this.resolveActor();
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NoActor'));
      return;
    }
    const hud = this.#instances.get(this._keyFor(actor));
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
    context.hpBar = getHudHealthBar(context.hp.value, context.hp.max);
    context.fatigue = { value: sys.fatigue ?? 0, max: sys.fatigueMax ?? 5 };
    context.speed = sys.speed?.base ?? 0;
    context.armor = sys.armor ?? 0;
    const equippedArmorItem = EquipmentHelper.getWornArmor(this.actor);
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
    context.manaSkill = sys.attributes?.manaSkill;
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

    // --- Bounds counter (mirrors InventoryHandler.prepareInventoryGrid) ---
    context.currentBounds = sys.inventory?.currentBounds || 0;
    context.maxBounds = sys.inventory?.maxBounds || 3;
    context.boundsPips = Array.from({ length: context.maxBounds }, (_, i) => ({
      filled: i < context.currentBounds,
    }));

    // --- Items, slots, panels ---
    this._categorizeItems(context);

    return context;
  }

  /** Split actor items + build the derived quick slots. */
  _categorizeItems(context) {
    const { EquipmentHelper } = globalThis.vagabond.utils;
    const actor = this.actor;
    const weapons = [];
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
    context.spells = spells.map(s => this._spellRow(s));
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

    // ----- Belt (item slots) — live mirror, same principle as the hand   -----
    // ----- circles: NOT a persisted pick list, always re-derived from    -----
    // ----- actual game state (favorited spells + Belt/'worn' equipment). -----
    // Order: favorited spells first, then worn equipment (oldest-equipped
    // first). Base row is 5 slots; grows to fit up to MAX_ITEM_SLOTS (7).
    // Beyond that cap this is a HUD-DISPLAY-ONLY overflow — the sheet's Belt
    // stays uncapped, the HUD just drops the oldest worn items from view
    // (favorited spells are never dropped for this).
    // Same pool as the sheet's Belt (weapons + gear/alchemical/relic, armor
    // excluded — see actor-sheet.mjs `panelEquipped`/`hasBeltItems`): no
    // "has a Use action" gate here, worn is worn (e.g. a Waterskin has no
    // consumable/hands flag but still belongs in the Belt).
    const favSpells = spells.filter(s => s.system.favorite);
    const wornItems = allEquipment
      .filter(i => i.system.equipmentState === 'worn' && i.system.equipmentType !== 'armor')
      .sort((a, b) => (a.getFlag('vagabond', 'equippedAt') || 0) - (b.getFlag('vagabond', 'equippedAt') || 0));

    const spellsShown = favSpells.slice(0, VagabondCharacterHud.MAX_ITEM_SLOTS);
    const equipRoom = VagabondCharacterHud.MAX_ITEM_SLOTS - spellsShown.length;
    const equipShown = equipRoom > 0 ? wornItems.slice(-equipRoom) : [];
    // Default order is spells-then-equipment (above); a manual drag reorder
    // (HUD or sheet, same flag) overrides it — see `EquipmentHelper.sortByBeltOrder`.
    const beltItems = EquipmentHelper.sortByBeltOrder([...spellsShown, ...equipShown]);
    const slotCount = Math.max(VagabondCharacterHud.MIN_ITEM_SLOTS, beltItems.length);

    context.itemSlots = this._padIds(beltItems.map(i => i.id), slotCount)
      .map((id) => {
        const item = id ? actor.items.get(id) : null;
        return this._slotEntry(item, item?.type === 'spell' ? 'spell' : 'item');
      });

    // Two hand spaces (R, L) — NOT a persisted slot pick, a live mirror of
    // whatever occupies hands (`system.equipmentState` oneHand/twoHands), the
    // same field the sheet's "Equipped" panel reads. Oldest holder goes in R.
    // A 2H holder takes R and hides L; a 1H holder leaves L open. The weapon
    // Slot cap is still enforced by EquipmentHelper, just not drawn here.
    const held = actor.items
      .filter((i) => EquipmentHelper.handsFor(i) > 0)
      .sort((a, b) => (a.getFlag('vagabond', 'equippedAt') || 0) - (b.getFlag('vagabond', 'equippedAt') || 0));

    const handCell = (item, hand) => {
      if (!item) {
        const label = game.i18n.localize(hand === 'R' ? 'VAGABOND.Hud.HandRight' : 'VAGABOND.Hud.HandLeft');
        return { filled: false, type: 'weapon', hand, tip: label };
      }
      const entry = this._slotEntry(item, EquipmentHelper.isWeapon(item) ? 'weapon' : 'item');
      entry.hand = hand;
      entry.tip = this._handTip(item);
      return entry;
    };
    if (held[0]?.system.equipmentState === 'twoHands') {
      context.handSlots = [handCell(held[0], 'R')];
    } else if (held.length === 1 && held[0].getFlag('vagabond', 'handPref') === 1) {
      // Lone item the user parked in the second circle (`_moveLoneHand`).
      context.handSlots = [handCell(null, 'R'), handCell(held[0], 'L')];
    } else {
      context.handSlots = [handCell(held[0], 'R'), handCell(held[1], 'L')];
    }
  }

  /**
   * Swap the two hand-holders' circle order by trading `equippedAt` stamps
   * (the sort key for the circles). Equal/missing stamps get a +1 nudge so
   * the swap is still visible.
   * @param {string} idA
   * @param {string} idB
   */
  async _swapHands(idA, idB) {
    const a = this.actor.items.get(idA);
    const b = this.actor.items.get(idB);
    if (!a || !b) return;
    const ta = a.getFlag('vagabond', 'equippedAt') || 0;
    const tb = b.getFlag('vagabond', 'equippedAt') || 0;
    let newA = tb;
    let newB = ta;
    if (ta === tb) {
      // Tie → current order is item-collection order; push whichever is drawn first to +1.
      const aFirst = [...this.actor.items].indexOf(a) < [...this.actor.items].indexOf(b);
      newA = aFirst ? ta + 1 : ta;
      newB = aFirst ? tb : tb + 1;
    }
    await this.actor.updateEmbeddedDocuments('Item', [
      { _id: a.id, 'flags.vagabond.equippedAt': newA },
      { _id: b.id, 'flags.vagabond.equippedAt': newB },
    ]);
  }

  /**
   * Park the lone held item in the given circle (0 = first, 1 = second).
   * @param {string} itemId
   * @param {number} index
   */
  async _moveLoneHand(itemId, index) {
    const item = this.actor.items.get(itemId);
    if (!item) return;
    await item.setFlag('vagabond', 'handPref', index === 1 ? 1 : 0);
  }

  /**
   * Hand-circle hover (HTML): "Name: Damage <dmg icon> | Range | N Slots".
   * Non-weapons show "Name | N Slots".
   * @param {Item} item
   * @returns {string}
   */
  _handTip(item) {
    const { EquipmentHelper } = globalThis.vagabond.utils;
    const esc = Handlebars.escapeExpression;
    const name = `<strong>${esc(item.name)}</strong>`;
    const slots = `${EquipmentHelper.itemSlotCost(item)} ${game.i18n.localize('VAGABOND.Hud.Slots')}`;
    if (!EquipmentHelper.isWeapon(item)) return `${name} | ${slots}`;

    const sys = item.system;
    const icon = CONFIG.VAGABOND.damageTypeIcons?.[sys.currentDamageType];
    const damage = [esc(sys.currentDamage ?? ''), icon ? `<i class='${icon}'></i>` : ''].filter(Boolean).join(' ');
    return `${name}: ${damage} | ${esc(sys.rangeAbbrev ?? '')} | ${slots}`;
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
    }
    // Any 2-hand holder (weapon or torch-style item) marks its circle as 2H
    if (item.type === 'equipment') {
      entry.twoHanded = item.system.equipmentState === 'twoHands';
      const { EquipmentHelper } = globalThis.vagabond.utils;
      if (EquipmentHelper.isThrowable(item)) {
        entry.throwable = true;
        entry.quantity = item.system.quantity ?? 0;
      }
    }
    return entry;
  }

  /** Flatten an equipment item into an inventory-row render object. */
  /**
   * Build a spell panel row. The inline-accordion detail body is the SAME source
   * as the character-sheet mini-sheet (helpers/item-sections.mjs): spell Damage
   * Base line + description + Critical.
   * @param {VagabondItem} item
   */
  _spellRow(item) {
    return {
      _id: item.id,
      name: item.name,
      img: item.img,
      favorite: !!item.system.favorite,
      damageType: item.system.damageType ?? '-',
      detailHtml: ItemSections.buildSpellDamageBase(item) + ItemSections.buildItemDetailSections(item),
    };
  }

  _invRow(item) {
    const isWeapon = item.system.equipmentType === 'weapon';
    const equipped = item.system.equipped; // derived mirror of equipmentState
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
      // Inline-accordion detail body — shared with the char-sheet mini-sheet.
      detailHtml: ItemSections.buildItemDetailSections(item),
    };
    if (isWeapon) {
      const cfg = CONFIG.VAGABOND;
      row.damageTypeLabel = game.i18n.localize(cfg.damageTypes?.[row.damageType] ?? '');
      row.range = item.system?.rangeAbbrev || '';      // C / N / F
      row.rangeLabel = item.system?.rangeDisplay || ''; // Close / Near / Far (tooltip)
      row.properties = item.system?.properties?.length ? item.system.propertiesDisplay : '';
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

    bindHudTooltips(this.element, signal);

    // Self-heal any weapon hand-limit violation (legacy data, imports, macros)
    const { EquipmentHelper } = globalThis.vagabond.utils;
    EquipmentHelper.sanitizeHandLimit(this.actor).catch((err) =>
      console.error('Vagabond | Hand-limit sanitize failed:', err)
    );

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

    // Drag a row by its name (e.g. onto the hotbar to make a macro). The name
    // span carries the id and is also the accordion toggle (single-click
    // expands); the image triggers use/cast. Belt slots are a live mirror
    // (favorited spells + worn equipment) — dragging a row here does NOT add
    // it to the Belt; equip via the Inventory tab / favorite via the spell menu.
    for (const el of this.element.querySelectorAll('.vh-inv-name, .vh-spell-name')) {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => {
        const id = el.dataset.itemId || el.dataset.spellId;
        const item = id && this.actor.items.get(id);
        if (!item) return;
        e.dataTransfer.setData('text/plain', JSON.stringify(item.toDragData()));
        e.dataTransfer.effectAllowed = 'move';
      }, { signal });
    }

    // Belt slots: drag-to-reorder among themselves (position only — the Belt's
    // membership is still the live mirror above; this just persists display
    // order via `flags.vagabond.beltOrder`, shared with the sheet's Equipped
    // Belt list so reordering either one updates both).
    const beltRow = this.element.querySelector('.vh-slots');
    if (beltRow) {
      const { EquipmentHelper } = globalThis.vagabond.utils;
      const beltReorder = setupDragReorder({
        container: beltRow,
        itemSelector: '.vh-slot.filled',
        boundarySelector: '.vh-slot:not(.filled)',
        onDrop: (orderedIds) => EquipmentHelper.saveBeltOrder(this.actor, orderedIds),
        signal,
      });
      for (const el of beltRow.querySelectorAll('.vh-slot.filled')) beltReorder.bindItem(el);
    }

    // Hand circles: drag a held item onto the other circle. Filled target →
    // swap (order derives from `equippedAt`, so a swap trades timestamps).
    // Empty target → park the lone item there (`flags.vagabond.handPref`).
    const handCircles = [...this.element.querySelectorAll('.vh-pc-weapon')];
    if (handCircles.length === 2 && this.actor.isOwner) {
      let dragging = null;
      const clear = () => { for (const c of handCircles) c.classList.remove('hand-dragging', 'hand-drop-target'); };
      for (const el of handCircles) {
        if (el.classList.contains('filled')) {
          el.setAttribute('draggable', 'true');
          el.addEventListener('dragstart', (e) => {
            dragging = el;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'vagabond-hand-swap');
            requestAnimationFrame(() => el.classList.add('hand-dragging'));
          }, { signal });
          el.addEventListener('dragend', () => { dragging = null; clear(); }, { signal });
        }
        el.addEventListener('dragover', (e) => {
          if (!dragging || dragging === el) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'move';
          el.classList.add('hand-drop-target');
        }, { signal });
        el.addEventListener('dragleave', () => el.classList.remove('hand-drop-target'), { signal });
        el.addEventListener('drop', (e) => {
          if (!dragging || dragging === el) return;
          e.preventDefault();
          e.stopPropagation();
          const fromId = dragging.dataset.itemId;
          dragging = null;
          const op = el.classList.contains('filled')
            ? this._swapHands(fromId, el.dataset.itemId)
            : this._moveLoneHand(fromId, Number(el.dataset.slotIndex));
          op.catch((err) => console.error('Vagabond | hand move failed:', err));
        }, { signal });
      }
    }

    // Right-click a Spells-tab row → same menu as its "⋮" button.
    for (const head of this.element.querySelectorAll('.vh-spell .vh-row-head')) {
      head.addEventListener('contextmenu', (e) => {
        const spell = this.actor.items.get(head.querySelector('[data-spell-id]')?.dataset.spellId);
        if (!spell) return;
        e.preventDefault();
        this._openSlotMenu(e, spell, 'spell');
      }, { signal });
    }

    // Drop an Item / Folder / container item anywhere on the HUD → add it to
    // the actor, same as dropping on the sheet. Bubble phase on purpose: the
    // Belt reorder above stops propagation of its own drops, and
    // `defaultPrevented` on dragover means it already claimed the gesture.
    const setDropHighlight = (on) => this.element?.classList.toggle('vh-drop-active', on);
    this.element.addEventListener('dragover', (e) => {
      if (e.defaultPrevented || !this.actor.isOwner) return;
      // No dropEffect override: forcing 'copy' vetoes the drop when the source
      // set effectAllowed to 'move' (browser then never fires `drop`).
      e.preventDefault();
      setDropHighlight(true);
    }, { signal });
    // Leaving the HUD (not just crossing between its child elements).
    this.element.addEventListener('dragleave', (e) => {
      if (!this.element.contains(e.relatedTarget)) setDropHighlight(false);
    }, { signal });
    this.element.addEventListener('drop', (e) => {
      e.preventDefault();
      this._onDrop(e).catch((err) => console.error('Vagabond | HUD drop failed:', err));
    }, { signal });
    // Highlight cleanup for every way a drag can end (drop anywhere, Esc, drop
    // elsewhere) — `dragleave` alone misses cancelled drags.
    document.addEventListener('drop', () => setDropHighlight(false), { signal });
    document.addEventListener('dragend', () => setDropHighlight(false), { signal });

    // Idle fade (wires its own AbortController so it can be re-evaluated live
    // when the setting changes without a full re-render).
    this._applyIdleFade();
  }

  /* -------------------------------------------- */
  /*  Drop handling (shares the sheet's logic)    */
  /* -------------------------------------------- */

  /**
   * Route a drop onto the HUD. Mirrors the sheet's `_onDrop` for the types that
   * make sense here (Item, ContainerItem, Folder), delegating to the sheet's
   * own methods so both surfaces create items identically (ancestry/class
   * replacement, gridPosition, transfer-from-other-actor).
   * @param {DragEvent} event
   */
  async _onDrop(event) {
    if (!this.actor.isOwner) return;
    const data = foundry.applications.ux.TextEditor.getDragEventData(event);
    const sheet = VagabondActorSheet.prototype;

    switch (data.type) {
      case 'Item': {
        // Own items dragged from the HUD/sheet: on the sheet this is a re-sort;
        // the HUD has nothing to sort (equip is via the Inventory tab menu).
        const item = await Item.implementation.fromDropData(data);
        if (!item || item.parent?.uuid === this.actor.uuid) return;
        return sheet._onDropItem.call(this, event, data);
      }
      case 'ContainerItem':
        return sheet._onDropContainerItem.call(this, event, data);
      case 'Folder':
        return sheet._onDropFolder.call(this, event, data);
    }
  }

  /** Delegated by the sheet's `_onDropItem` (shared creation path). */
  _onDropItemCreate(itemData, event) {
    return VagabondActorSheet.prototype._onDropItemCreate.call(this, itemData, event);
  }

  /* -------------------------------------------- */
  /*  Idle fade (dim after mouse leaves)          */
  /* -------------------------------------------- */

  /** Current idle-fade prefs, normalized. */
  _idlePrefs() {
    const p = game.settings.get('vagabond', 'hudIdleFadePrefs') ?? {};
    return {
      enabled: !!p.enabled,
      delayMs: Math.max(1, Number(p.delay) || 10) * 1000,
      opacity: Math.min(0.95, Math.max(0.05, Number(p.opacity) || 0.2)),
    };
  }

  /**
   * (Re)wire idle-fade listeners from the current setting. Tears down any prior
   * wiring first, so it is safe to call on every render and on live setting
   * changes. When disabled, restores full opacity and stops.
   */
  _applyIdleFade() {
    this.#idleCtrl?.abort();
    this.#idleCtrl = null;
    clearTimeout(this.#idleTimer);
    if (!this.element) return;

    const { enabled } = this._idlePrefs();
    if (!enabled) { this.element.style.opacity = ''; return; }

    this.#idleCtrl = new AbortController();
    const { signal } = this.#idleCtrl;
    this.element.addEventListener('mouseenter', () => this._wakeHud(), { signal });
    this.element.addEventListener('mouseleave', () => this._scheduleIdleFade(), { signal });

    // Start in the awake state, then arm the timer so it fades if the pointer
    // is not over the HUD. If the pointer is already inside, the browser fires
    // no mouseenter; the timer simply expires and re-fades — harmless, the next
    // move/enter wakes it.
    this._wakeHud();
    this._scheduleIdleFade();
  }

  /** Full opacity now; cancel any pending fade. */
  _wakeHud() {
    clearTimeout(this.#idleTimer);
    if (this.element) this.element.style.opacity = '1';
  }

  /** Arm the fade timer. Suspended while a tab panel is open (actively in use). */
  _scheduleIdleFade() {
    clearTimeout(this.#idleTimer);
    if (this._activeTab) return; // reading an in-HUD menu — never fade
    const { delayMs, opacity } = this._idlePrefs();
    this.#idleTimer = setTimeout(() => {
      if (this.element) this.element.style.opacity = String(opacity);
    }, delayMs);
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
    // Fatigued status auto-toggle handled centrally by the updateActor hook in vagabond.mjs
    this.actor.update({ 'system.fatigue': val });
  }

  /* -------------------------------------------- */
  /*  Drag + position persistence (per user)      */
  /* -------------------------------------------- */

  /** Saved per-user position, shared across all characters, or null. */
  _savedPosition() {
    const stored = game.user.getFlag('vagabond', 'hudPosition');
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
    await game.user.setFlag('vagabond', 'hudPosition', {
      left: Math.round(this.#pos.left),
      top: Math.round(this.#pos.top),
    });
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
    // Reference equality, not id — unlinked duplicate tokens share the same
    // actor.id but are distinct synthetic Actor instances per token.
    const mine = (doc) => {
      const a = doc?.actor ?? doc?.parent ?? doc;
      return a === this.actor;
    };
    const redraw = (doc) => { if (!doc || mine(doc)) this._reDraw(); };
    this.#hookIds.push(
      Hooks.on('updateActor', (a) => { if (a === this.actor) this._reDraw(); }),
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
    this.#idleCtrl?.abort();
    this.#idleCtrl = null;
    clearTimeout(this.#redrawTimer);
    clearTimeout(this.#idleTimer);
    this._clearHooks();
    if (VagabondCharacterHud.#autoOpenedKey === this.key) {
      VagabondCharacterHud.#autoOpenedKey = null;
    }
    // Manual close of a pinned HUD honors the user's intent — drop the pin so it
    // does not immediately reopen (re-enable via the setting toggle / reload).
    if (VagabondCharacterHud.#pinnedKey === this.key) {
      VagabondCharacterHud.#pinnedKey = null;
    }
    VagabondCharacterHud.#instances.delete(this.key);
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
  static _onRollWeapon(event, target) {
    const id = target?.dataset?.itemId ?? target?.closest('[data-item-id]')?.dataset.itemId;
    const item = id && this.actor.items.get(id);
    if (!item) return;
    return activateHandItem({ actor: this.actor, item, event, rollHandler: this.rollHandler });
  }
  static _onUseItem(event, target) { return this._onRollWeapon(event, target); }
  /**
   * Click an inventory row image → use it. Weapons attack (rollWeapon); everything
   * else routes through useItem. Mirrors the filled-slot behavior minus the menu.
   */
  static _onUseItemRow(event, target) {
    const id = target?.dataset?.itemId ?? target?.closest('[data-item-id]')?.dataset.itemId;
    const item = id && this.actor.items.get(id);
    if (!item) return;
    // Equips the item first if it occupies hands and isn't already equipped
    // (weapons, torches, etc.), then performs its action (attack / ignite
    // toggle / use) — same unified behavior as the hand circles and slots.
    return activateHandItem({ actor: this.actor, item, event, rollHandler: this.rollHandler });
  }
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

  /** Spend/restore a multi-use item's charge pip (rendered inside the item-detail accordion body). */
  static async _onUsePip(event, target) {
    event.stopPropagation();
    await ItemSections.onUsePipClick(target, null);
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
    if (item) this._openSlotMenu(event, item, 'spell');
  }

  /** Spells-panel star → favorite ⇄ unfavorite (belt + sheet favorites follow). */
  static _onToggleSpellFavorite(event, target) {
    return this._spellHandler.toggleSpellFavorite(event, target);
  }

  /** Inventory-row check → equip ⇄ unequip (hand limit / bumping handled by EquipmentHelper). */
  static _onToggleEquip(event, target) {
    return this._equipmentHandler.equipItem(event, target);
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
    const inHandCircle = !!target.closest('.vh-pc-weapon');

    if (event.type === 'contextmenu' || event.button === 2) {
      event.preventDefault();
      // Both hand circles and Belt slots are live mirrors of actual game
      // state (equipped-in-hand / favorited+worn) — there's no separate "HUD
      // slot" to remove from. The way out is Unequip / un-favorite.
      return this._openSlotMenu(event, item, type);
    }
    if (type === 'spell') return this._spellHandler.castSpell(event, { dataset: { spellId: id } });

    // Belt weapons with Thrown default to Throw (no equip, spends quantity).
    // Otherwise equips the item first if it occupies hands and isn't already
    // equipped, then performs its action (attack / ignite-toggle / use).
    const { EquipmentHelper } = globalThis.vagabond.utils;
    const mode = !inHandCircle && EquipmentHelper.isThrowable(item) ? 'throw' : 'use';
    return activateHandItem({ actor: this.actor, item, event, rollHandler: this.rollHandler, mode });
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
   * Slot context menu. Spells: Cast, Open, Send to Chat, Favorite/Unfavorite.
   * Items/weapons: Use, Send to Chat, Unequip. No "Remove from HUD" — hand
   * circles and Belt slots are both live mirrors of actual game state
   * (equipped-in-hand, or favorited/worn), so Unequip / un-favorite IS the removal.
   * @param {Event} event
   * @param {Item} item
   * @param {'spell'|'weapon'|'item'} type
   */
  _openSlotMenu(event, item, type) {
    const { ContextMenuHelper } = globalThis.vagabond.utils;

    // Both builders are shared with the sheet. Slotted items always offer
    // "Use" — they were placed there to be used.
    const items = type === 'spell'
      ? buildSpellMenuItems({ actor: this.actor, spell: item, event, spellHandler: this._spellHandler })
      : buildItemMenuItems({
        actor: this.actor,
        item,
        event,
        rollHandler: this.rollHandler,
        equipmentHandler: this._equipmentHandler,
        forceUse: true,
        onChange: () => this.render(),
      });

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
        ...(CraftingHelper.config().general.enabled ? [{
          label: L('VAGABOND.Craft.Workbench.Title'),
          icon: 'fas fa-hammer',
          action: () => WorkbenchApp.open(this.actor),
        }] : []),
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
        ...buildEffectMenuItems(this.actor),
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

}
