import { VagabondActorSheet } from './actor-sheet.mjs';
import { prepareEffectsView } from '../helpers/effects.mjs';
import { TargetHelper } from '../helpers/target-helper.mjs';
import { PartyStatusHelper } from '../helpers/party-status-helper.mjs';
import { DowntimeHelper, SHIFTS_PER_DAY } from '../helpers/downtime-helper.mjs';
import { ProgressClock } from '../documents/progress-clock.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { TradeHelper } from '../helpers/trade-helper.mjs';
import { CoinTransferDialog } from '../applications/coin-transfer-dialog.mjs';
import { VagabondTextParser } from '../helpers/text-parser.mjs';
import { buildStatsSection, buildSlotsRow, buildWeaponProperties } from '../helpers/item-sections.mjs';
import { PartyNotes } from '../helpers/party-notes.mjs';
import { GMRelay } from '../helpers/gm-relay.mjs';
import { LevelUpDialog } from '../applications/level-up-dialog.mjs';
import { DowntimeApp } from '../applications/downtime-app.mjs';

/** Inventory tab sections, in display order (containers and unknown types fall under `gear`). */
const INVENTORY_GROUPS = ['weapon', 'armor', 'alchemical', 'relic', 'gear'];

/**
 * Party actor sheet.
 * Tabs: Party (member cards for characters + NPCs), Inventory (items per Character), Notes, Effects.
 * All users with party permission see both tabs.
 * The Compact view header button (`becomeHud` → PartyCompactView) is GM-only.
 */
export class VagabondPartySheet extends VagabondActorSheet {
  constructor(object, options) {
    super(object, options);
    this._listenerController = null;
    this._actorUpdateHookId = null;
    this._effectHookIds = null;
    this._notesHookId = null;
    this._activePartyHookId = null;
    this._itemHookIds = null;
    /** UUIDs of the inventory items whose detail accordion is open (survives re-renders). */
    this._invOpen = new Set();
    this._removeMode = false;
    this._transportEdit = false;
  }

  /**
   * Write a single field on a party member's actor, relaying through the GM
   * socket when the current user doesn't own that member (party sheet is
   * visible to the whole party, but each PC is owned by a different player).
   * @param {Actor} actor
   * @param {string} field
   * @param {*} value
   */
  async _updateMemberField(actor, field, value) {
    if (actor.isOwner || game.user.isGM) {
      await actor.update({ [field]: value });
    } else {
      GMRelay.send('vagabond.updateActorField', { actorUuid: actor.uuid, field, value });
    }
  }

  /** @override Compact view = the floating PartyCompactView (GM only). */
  _hasCompactView() { return game.user.isGM; }

  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: ['vagabond', 'actor', 'party'],
    position: {
      width: 920,
      height: 700,
    },
  }, { inplace: false });

  /** @override */
  static PARTS = {
    tabs: {
      template: 'templates/generic/tab-navigation.hbs',
    },
    party: {
      template: 'systems/vagabond/templates/party/party-tab.hbs',
      scrollable: [''],
    },
    inventory: {
      template: 'systems/vagabond/templates/party/party-inventory-tab.hbs',
      scrollable: [''],
    },
    notes: {
      template: 'systems/vagabond/templates/party/notes-tab.hbs',
    },
    'notes-right': {
      template: 'systems/vagabond/templates/party/notes-right.hbs',
    },
    effects: {
      template: 'systems/vagabond/templates/actor/effects.hbs',
      scrollable: [''],
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    const hadParts = !!options.parts;
    super._configureRenderOptions(options);
    if (!hadParts) options.parts = ['tabs', 'party', 'inventory', 'notes', 'notes-right', 'effects'];
  }

  /** @override */
  async _prepareContext(options) {
    const context = {
      actor: this.actor,
      system: this.actor.system,
      flags: this.actor.flags,
      config: CONFIG.VAGABOND,
      editable: this.isEditable,
      owner: this.actor.isOwner,
      limited: this.actor.limited,
      fields: this.document.schema.fields,
      systemFields: this.document.system.schema.fields,
      isGM: game.user.isGM,
    };

    context.tabs = this._getTabs(options.parts);
    context.effects = await prepareEffectsView(this.actor, { editable: this.isEditable });

    // Resolve full member data for party tab cards
    context.members = await this._resolveMembers();

    // Shift clock: one 4-segment clock per Day of the Shifts the GM grants (same art as the Downtime panel)
    context.shiftClocks = this._shiftClocks();
    // Several parties: only the active one's Shifts reach its members' Downtime panels
    const active = DowntimeHelper.activeParty();
    context.activeParty = {
      multiple: game.actors.filter((a) => a.type === 'party').length > 1,
      isActive: active?.id === this.actor.id,
    };
    context.travelClocks = this._travelClocks();

    // Speed / Crawl / Travel: manual override or automatic (slowest member)
    context.speeds = this._speedsView();

    // Aggregate supplies across all members (characters only)
    context.supplies = this._aggregateSupplies(context.members);

    // Party token look: the grouped party art, or the transport it travels with
    context.tokenMode = this._tokenModeView();

    // GM note: players of the party's Characters who don't own the party sheet
    context.partyOwnershipNote = this._ownershipNote(this.actor);

    return context;
  }

  /**
   * Resolve all party member UUIDs into rich card data objects.
   * @returns {Promise<Object[]>}
   * @private
   */
  async _resolveMembers() {
    const uuids = this.actor.system.members ?? [];
    const results = await Promise.all(uuids.map(uuid => this._resolveMember(uuid)));
    return results.filter(Boolean);
  }

  /**
   * Resolve a single member UUID into card data.
   * Handles both character and NPC actor types.
   * @param {string} uuid
   * @returns {Promise<Object|null>}
   * @private
   */
  async _resolveMember(uuid) {
    let actor;
    try {
      actor = await fromUuid(uuid);
    } catch {
      return null;
    }
    if (!actor) return null;

    const sys = actor.system;

    // ── NPC member ──────────────────────────────────────────────────────────
    if (actor.type === 'npc') {
      const hpMax = sys.health.max || 1;
      const hpPct = Math.clamp(Math.round((sys.health.value / hpMax) * 100), 0, 100);
      const fatigue = sys.fatigue ?? 0;
      const fatigueMax = sys.fatigueMax ?? 5;
      const fatiguePct = fatigueMax > 0
        ? Math.clamp(Math.round((fatigue / fatigueMax) * 100), 0, 100)
        : 0;

      return {
        uuid: actor.uuid,
        id: actor.id,
        name: actor.name,
        img: actor.img,
        isNPC: true,
        isNavigator: actor.uuid === this.actor.system.navigator,
        hd: sys.hd ?? 1,
        hp: { value: sys.health.value, max: sys.health.max, pct: hpPct },
        armor: sys.armor ?? 0,
        fatigue,
        fatigueMax,
        fatiguePct,
        speedFormatted: this._formatNpcSpeed(sys),
        senses: [
          ...(sys.senses ?? []).map((k) => game.i18n.localize(CONFIG.VAGABOND.senses?.[k] ?? k)),
          ...(sys.sensesNote ? [sys.sensesNote] : []),
        ].join(', '),
        immunities: sys.immunities ?? [],
        weaknesses: sys.weaknesses ?? [],
        statusImmunities: sys.statusImmunities ?? [],
        // Include all actions/abilities with original indices preserved
        actions: sys.actions ?? [],
        abilities: sys.abilities ?? [],
      };
    }

    // ── Character member (default path) ─────────────────────────────────────
    if (actor.type !== 'character') return null;

    // Armor: use the actor's derived armor value (includes Active Effect bonuses)
    const armor = sys.armor ?? 0;

    // Active status effects
    const statuses = actor.effects
      .filter(e => e.statuses?.size > 0)
      .map(e => ({
        effectId: e.id,
        actorUuid: actor.uuid,
        label: e.name,
        img: e.img,
      }));

    // Fatigue
    const fatigue = sys.fatigue ?? 0;
    const fatigueMax = sys.fatigueMax ?? 5;
    const fatiguePct = fatigueMax > 0
      ? Math.clamp(Math.round((fatigue / fatigueMax) * 100), 0, 100)
      : 0;

    // HP percentage for bar fill
    const hpMax = sys.health.max || 1;
    const hpPct = Math.clamp(Math.round((sys.health.value / hpMax) * 100), 0, 100);

    // Mana percentage
    const manaMax = sys.mana?.max || 1;
    const manaPct = sys.mana?.max > 0
      ? Math.clamp(Math.round((sys.mana.current / manaMax) * 100), 0, 100)
      : 0;

    // Player linked to this character (non-GM user whose assigned character matches)
    const playerUser = game.users.find(u => !u.isGM && u.character?.id === actor.id);
    const playerName = playerUser?.name ?? null;

    // XP progress
    const xpCurrent = sys.attributes.xp ?? 0;
    const xpRequired = sys.attributes.xpRequired ?? 0;
    const xpPct = xpRequired > 0
      ? Math.clamp(Math.round((xpCurrent / xpRequired) * 100), 0, 100)
      : 0;

    return {
      uuid: actor.uuid,
      id: actor.id,
      name: actor.name,
      img: actor.img,
      isNPC: false,
      isNavigator: actor.uuid === this.actor.system.navigator,
      playerName,
      level: sys.attributes.level?.value ?? 1,
      ancestry: sys.ancestryData?.name ?? null,
      characterClass: sys.classData?.name ?? null,
      speed: {
        base:   sys.speed?.base   ?? 0,
        crawl:  sys.speed?.crawl  ?? 0,
        travel: sys.speed?.travel ?? 0,
      },
      xp: {
        current: xpCurrent,
        required: xpRequired,
        pct: xpPct,
        canLevelUp: !!sys.attributes.canLevelUp,
      },
      hp: {
        value: sys.health.value,
        max: sys.health.max,
        pct: hpPct,
        // The bar turns red at 20% HP or less (yellow above)
        low: hpPct <= 20,
      },
      fatigue,
      fatigueMax,
      fatiguePct,
      mana: {
        current: sys.mana?.current ?? 0,
        max: sys.mana?.max ?? 0,
        castingMax: sys.mana?.castingMax ?? 0,
        pct: manaPct,
        isSpellcaster: sys.attributes?.isSpellcaster ?? false,
        isFocusing: (sys.focus?.current ?? 0) > 0,
      },
      armor,
      inventory: {
        used: sys.inventory?.occupiedSlots ?? 0,
        total: sys.inventory?.maxSlots ?? 0,
      },
      luck: {
        current: sys.currentLuck ?? 0,
      },
      studiedDice: sys.studiedDice ?? 0,
      // One entry per configured homebrew save, in config order (icons via saveIcons)
      savesList: (CONFIG.VAGABOND.homebrew?.saves ?? []).map(s => ({
        key: s.key,
        difficulty: sys.saves?.[s.key]?.difficulty ?? 20,
        label: sys.saves?.[s.key]?.label ?? CONFIG.VAGABOND.saves?.[s.key] ?? s.label,
        icon: CONFIG.VAGABOND.saveIcons?.[s.key] ?? 'fa-solid fa-shield',
      })),
      statuses,
      currency: {
        gold:   sys.currency?.gold   ?? 0,
        silver: sys.currency?.silver ?? 0,
        copper: sys.currency?.copper ?? 0,
      },
      canEditCoins: actor.isOwner,
      // Supply items for aggregation — raw data; totals computed separately
      _supplyRations: actor.items
        .filter(i => i.type === 'equipment' && i.system.isSupply)
        .reduce((n, i) => n + (i.system.quantity ?? 1), 0),
      _supplyBeverages: actor.items
        .filter(i => i.type === 'equipment' && i.system.isBeverage)
        .reduce((n, i) => n + (i.system.quantity ?? 1), 0),
    };
  }

  /**
   * Build a formatted speed string for an NPC system object.
   * Reads speed, speedTypes, and speedValues directly from the schema fields.
   * @param {object} sys - actor.system for an NPC
   * @returns {string}
   * @private
   */
  _formatNpcSpeed(sys) {
    const base = sys.speed ?? 0;
    const types = Array.isArray(sys.speedTypes) ? sys.speedTypes : [];
    if (!types.length) return `${base}'`;
    const parts = [];
    for (const key of types) {
      const i18nKey = CONFIG.VAGABOND.speedTypes?.[key];
      const label = i18nKey ? game.i18n.localize(i18nKey) : key;
      const val = sys.speedValues?.[key] ?? 0;
      parts.push(val > 0 ? `${label}: ${val}'` : label);
    }
    return parts.length ? `${base}' (${parts.join(', ')})` : `${base}'`;
  }

  /**
   * Aggregate rations, beverages, and currency across all resolved members.
   * NPC members contribute 0 to all totals (they don't carry party supplies).
   * @param {Object[]} members
   * @returns {{ rations: number, beverages: number, currency: {gold, silver, copper} }}
   * @private
   */
  _aggregateSupplies(members) {
    const totals = members.reduce(
      (totals, m) => ({
        rations:  totals.rations  + (m._supplyRations   ?? 0),
        beverages: totals.beverages + (m._supplyBeverages ?? 0),
        currency: {
          gold:   totals.currency.gold   + (m.currency?.gold   ?? 0),
          silver: totals.currency.silver + (m.currency?.silver ?? 0),
          copper: totals.currency.copper + (m.currency?.copper ?? 0),
        },
      }),
      { rations: 0, beverages: 0, currency: { gold: 0, silver: 0, copper: 0 } }
    );

    // Rations / Beverages stored in the transports' Holds count too
    const stored = this._holdSupplyRows();
    totals.rations += stored.reduce((n, r) => n + r._supplyRations, 0);
    totals.beverages += stored.reduce((n, r) => n + r._supplyBeverages, 0);
    for (const row of stored) {
      for (const coin of CurrencyHelper.DENOMINATIONS) totals.currency[coin] += row.currency[coin] ?? 0;
    }

    // Hover breakdowns (per character member, then per transport Hold). Wealth breakdown is GM-only.
    const characters = members.filter(m => !m.isNPC);
    totals.rationsTooltip = this._supplyBreakdownHtml(
      'VAGABOND.Actor.Party.Card.Rations', [...characters, ...stored], m => [m._supplyRations ?? 0]);
    totals.beveragesTooltip = this._supplyBreakdownHtml(
      'VAGABOND.Actor.Party.Card.Beverages', [...characters, ...stored], m => [m._supplyBeverages ?? 0]);
    if (game.user.isGM) {
      const abbr = key => game.i18n.localize(`VAGABOND.Currency.${key}.abbr`);
      totals.currencyTooltip = this._supplyBreakdownHtml(
        'VAGABOND.Actor.Party.Card.TotalWealth', [...characters, ...stored],
        m => [m.currency.gold, m.currency.silver, m.currency.copper],
        [abbr('Gold'), abbr('Silver'), abbr('Copper')]);
    }
    return totals;
  }

  /**
   * One row per Hold (Container item) of the party's transports with the Rations / Beverages
   * and coins stored inside it (a container's contents are item snapshots in `system.items`, not embedded items).
   * @returns {{name: string, _supplyRations: number, _supplyBeverages: number, currency: Object}[]}
   * @private
   */
  _holdSupplyRows() {
    const count = (contents, flag) => (contents ?? [])
      .filter(data => data?.type === 'equipment' && data.system?.[flag])
      .reduce((n, data) => n + (Number(data.system.quantity ?? 1) || 0), 0);
    return this._transportEntries().filter((entry) => this._inUse(entry)).flatMap(({ actor }) => actor.items
      .filter(item => item.type === 'container')
      .map(item => ({
        name: `${actor.name} · ${item.name}`,
        _supplyRations: count(item.system.items, 'isSupply'),
        _supplyBeverages: count(item.system.items, 'isBeverage'),
        currency: { gold: 0, silver: 0, copper: 0, ...item.system.currency },
      })));
  }

  /**
   * Build the HTML table for a supplies hover tooltip: one row per member.
   * @param {string} titleKey            i18n key for the tooltip header
   * @param {Object[]} members           Resolved character member data
   * @param {(m: Object) => number[]} valuesFn  Column values for a member
   * @param {string[]} [suffixes]        Per-column unit suffix (e.g. g/s/c)
   * @returns {string|null}              null when there are no members
   * @private
   */
  _supplyBreakdownHtml(titleKey, members, valuesFn, suffixes = []) {
    if (!members.length) return null;
    const esc = foundry.utils.escapeHTML;
    const rows = members.map(m => {
      const values = valuesFn(m);
      const empty = values.every(v => !v);
      const cells = values.map((v, i) =>
        `<span class="psb-value">${v}${suffixes[i] ? `<span class="currency-abbr">${esc(suffixes[i])}</span>` : ''}</span>`
      ).join('');
      return `<div class="psb-row${empty ? ' psb-empty' : ''}"><span class="psb-name">${esc(m.name)}</span>${cells}</div>`;
    });
    return `<div class="party-supplies-breakdown"><div class="psb-title">${esc(game.i18n.localize(titleKey))}</div>${rows.join('')}</div>`;
  }

  // ── Notes Tab ──────────────────────────────────────────────────────────────

  /**
   * Prepare context data for the notes tab.
   * Enriches shared notes, resolves/creates GM and personal note journals.
   * @returns {Promise<Object>}
   * @private
   */
  async _prepareNotesContext() {
    const TE = foundry.applications.ux.TextEditor.implementation;

    const ctx = { personalNotes: [], gmNotes: null };

    // GM notes — only created/resolved for the GM
    if (game.user.isGM) {
      const journal = await this._resolveNoteJournal('gm');
      const page = journal?.pages?.contents[0];
      ctx.gmNotes = {
        pageUuid: page?.uuid ?? null,
        content: page?.text?.content ?? '',
        enrichedContent: page
          ? await TE.enrichHTML(page.text?.content ?? '', { relativeTo: page })
          : '',
      };
    }

    // Personal notes — one per visible character member
    const uuids = this.document.system.members ?? [];
    for (const uuid of uuids) {
      let actor;
      try { actor = await fromUuid(uuid); } catch { continue; }
      if (!actor || actor.type !== 'character') continue;

      // Only show personal notes to users who own this character (or GM)
      const canSee = game.user.isGM
        || actor.getUserLevel(game.user) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      if (!canSee) continue;

      const journal = await this._resolveNoteJournal('personal', actor.id);
      if (!journal) continue;

      const page = journal.pages?.contents[0];
      const playerUser = game.users.find(u => !u.isGM && u.character?.id === actor.id);
      ctx.personalNotes.push({
        characterId: actor.id,
        characterName: actor.name,
        playerName: playerUser?.name ?? null,
        pageUuid: page?.uuid ?? null,
        content: page?.text?.content ?? '',
        enrichedContent: page
          ? await TE.enrichHTML(page.text?.content ?? '', { relativeTo: page })
          : '',
      });
    }

    return ctx;
  }

  /**
   * The note journal (one per Character, one GM journal per party) — see `PartyNotes`.
   * @param {'gm'|'personal'} noteType
   * @param {string|null} characterId  Actor id for personal notes.
   * @returns {Promise<JournalEntry|null>}
   * @private
   */
  _resolveNoteJournal(noteType, characterId = null) {
    return PartyNotes.resolve(noteType, this.document, characterId);
  }

  /** @override */
  async _preparePartContext(partId, context) {
    const partContext = await super._preparePartContext(partId, context);
    if (partId === 'party') {
      partContext.tab = context.tabs[partId];
    } else if (partId === 'inventory') {
      partContext.tab = context.tabs[partId];
      partContext.inventoryCards = this._inventoryCards();
      partContext.transports = this._transportCards();
      partContext.canEditTransports = this.isEditable;
      partContext.transportEditing = this._transportEditing();
    } else if (partId === 'notes') {
      partContext.tab = context.tabs[partId];
      const TE = foundry.applications.ux.TextEditor.implementation;
      partContext.enrichedSharedNotes = await TE.enrichHTML(
        this.document.system.sharedNotes ?? '',
        { relativeTo: this.document, rollData: this.document.getRollData?.() ?? {} }
      );
    } else if (partId === 'notes-right') {
      const notesCtx = await this._prepareNotesContext();
      Object.assign(partContext, notesCtx);
    }
    return partContext;
  }

  /** @override */
  _getTabs(parts) {
    const tabGroup = 'primary';
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'party';

    return parts.reduce((tabs, partId) => {
      const tab = { cssClass: '', group: tabGroup, id: '', label: '' };

      switch (partId) {
        case 'tabs':
          return tabs;
        case 'party':
          tab.id = 'party';
          tab.label = 'VAGABOND.Actor.Party.Tabs.Party';
          break;
        case 'inventory':
          tab.id = 'inventory';
          tab.label = 'VAGABOND.Actor.Party.Tabs.Inventory';
          break;
        case 'notes':
          tab.id = 'notes';
          tab.label = 'VAGABOND.Actor.Party.Tabs.Notes';
          break;
        case 'effects':
          tab.id = 'effects';
          tab.label = 'VAGABOND.Actor.Tabs.Effects';
          break;
        default:
          return tabs;
      }

      if (this.tabGroups[tabGroup] === tab.id) tab.cssClass = 'active';
      tabs[partId] = tab;
      return tabs;
    }, {});
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    PartyStatusHelper.closeAll();

    // Abort previous listeners and create new controller
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    const { signal } = this._listenerController;

    // Re-register actor update hook (re-renders only the party tab)
    if (this._actorUpdateHookId) Hooks.off('updateActor', this._actorUpdateHookId);
    this._actorUpdateHookId = Hooks.on('updateActor', (actor) => {
      // Members and transports also show in the Inventory tab (items, coins)
      const shown = (this.actor.system.transports ?? []).some((t) => t.uuid === actor.uuid)
        || (this.actor.system.members ?? []).includes(actor.uuid);
      this.render(false, { parts: shown ? ['party', 'inventory'] : ['party'] });
    });

    // Re-register ActiveEffect hooks so status changes on members refresh the party tab immediately.
    if (this._effectHookIds) {
      Hooks.off('createActiveEffect', this._effectHookIds.create);
      Hooks.off('updateActiveEffect', this._effectHookIds.update);
      Hooks.off('deleteActiveEffect', this._effectHookIds.delete);
    }
    const reRenderIfMember = (effect) => {
      const parentUuid = effect.parent?.uuid;
      if (parentUuid && this.actor.system.members?.includes(parentUuid)) {
        this.render(false, { parts: ['party'] });
      }
    };
    this._effectHookIds = {
      create: Hooks.on('createActiveEffect', reRenderIfMember),
      update: Hooks.on('updateActiveEffect', reRenderIfMember),
      delete: Hooks.on('deleteActiveEffect', reRenderIfMember),
    };

    // Items added / changed / removed on a member refresh the Inventory tab (and the card's Slots)
    if (this._itemHookIds) {
      Hooks.off('createItem', this._itemHookIds.create);
      Hooks.off('updateItem', this._itemHookIds.update);
      Hooks.off('deleteItem', this._itemHookIds.delete);
    }
    const refreshInventory = foundry.utils.debounce(
      () => this.render(false, { parts: ['party', 'inventory'] }), 100);
    // ...and so do the transports' Holds (the Transport sleeve at the top of the tab)
    const onMemberItem = (item) => {
      const parentUuid = item.parent?.uuid;
      if (!parentUuid) return;
      if (this.actor.system.members?.includes(parentUuid)
        || (this.actor.system.transports ?? []).some((t) => t.uuid === parentUuid)) refreshInventory();
    };
    this._itemHookIds = {
      create: Hooks.on('createItem', onMemberItem),
      update: Hooks.on('updateItem', onMemberItem),
      delete: Hooks.on('deleteItem', onMemberItem),
    };

    // Wire up member card interactions
    this._bindMemberActions(signal);

    // Party-level header controls (auto speeds, Shifts, Downtime, Level Up Party, member XP)
    this._bindPartyControls(signal);

    // Wire up journal-backed note editors (GM + personal)
    this._bindNotesActions(signal);

    // Re-render the right notes column whenever any note for this party is saved
    // The active party changed (another party sheet / setting): refresh the Downtime box marker
    this._activePartyHookId ??= Hooks.on('vagabond.activePartyChanged', () => this.render(false, { parts: ['party'] }));

    if (this._notesHookId) Hooks.off('updateJournalEntryPage', this._notesHookId);
    this._notesHookId = Hooks.on('updateJournalEntryPage', (page) => {
      if (page.parent?.flags?.vagabond?.partyId !== this.document.id) return;
      this.render(false, { parts: ['notes-right'] });
    });
  }

  /**
   * Bind member card interactive elements (works for both character and NPC cards).
   * @param {AbortSignal} signal
   * @private
   */
  _bindMemberActions(signal) {
    // Header info area → open actor sheet
    this.element
      .querySelectorAll('[data-action="openMemberSheet"]')
      .forEach(el => {
        el.addEventListener('click', async (e) => {
          // Don't fire if click landed on a nested interactive element or button
          if (e.target.closest('[data-action]:not([data-action="openMemberSheet"])') ||
              e.target.closest('button')) return;
          const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          actor?.sheet.render(true);
        }, { signal });
      });

    // Portrait → right-click: apply/remove status effects
    this.element
      .querySelectorAll('[data-action="panToToken"]')
      .forEach(el => {
        el.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          await PartyStatusHelper.showStatusMenu(actor, e.clientX, e.clientY);
        }, { signal });
      });

    // Portrait → pan camera to actor's token in the current scene
    this.element
      .querySelectorAll('[data-action="panToToken"]')
      .forEach(el => {
        el.addEventListener('click', async () => {
          const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const token = canvas.tokens?.placeables.find(
            t => t.actor?.uuid === uuid || t.document.actorId === actor.id
          );
          if (!token) {
            ui.notifications.warn(`${actor.name} has no token in this scene.`);
            return;
          }
          canvas.animatePan({ x: token.center.x, y: token.center.y });
        }, { signal });
      });

    // HP bar — left click: -1 HP, right click: +1 HP
    this.element
      .querySelectorAll('[data-action="memberHpChange"]')
      .forEach(bar => {
        bar.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uuid = bar.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const newVal = Math.max(0, actor.system.health.value - 1);
          await this._updateMemberField(actor, 'system.health.value', newVal);
        }, { signal });
        bar.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const uuid = bar.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const newVal = Math.min(actor.system.health.max, actor.system.health.value + 1);
          await this._updateMemberField(actor, 'system.health.value', newVal);
        }, { signal });
      });

    // Fatigue bar — left click: +1 fatigue, right click: -1 fatigue
    this.element
      .querySelectorAll('[data-action="memberFatigueChange"]')
      .forEach(bar => {
        bar.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uuid = bar.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const newVal = Math.min(actor.system.fatigueMax ?? 5, (actor.system.fatigue ?? 0) + 1);
          await this._updateMemberField(actor, 'system.fatigue', newVal);
        }, { signal });
        bar.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const uuid = bar.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const newVal = Math.max(0, (actor.system.fatigue ?? 0) - 1);
          await this._updateMemberField(actor, 'system.fatigue', newVal);
        }, { signal });
      });

    // Equipped items / spells → open item sheet on the member actor (character only)
    this.element
      .querySelectorAll('[data-action="openMemberItem"]')
      .forEach(el => {
        el.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
          const itemId = el.dataset.itemId;
          if (!uuid || !itemId) return;
          const actor = await fromUuid(uuid);
          const item = actor?.items.get(itemId);
          item?.sheet.render(true);
        }, { signal });
      });

    // Status icon → send to chat (character cards)
    this.element
      .querySelectorAll('[data-action="memberStatusChat"]')
      .forEach(icon => {
        icon.addEventListener('click', async () => {
          const { actorUuid, effectId } = icon.dataset;
          const actor = await fromUuid(actorUuid);
          if (!actor) return;
          const effect = actor.effects.get(effectId);
          if (!effect) return;
          await VagabondChatCard.statusEffect(actor, effect);
        }, { signal });
      });

    // "+" button → open actor picker
    this.element
      .querySelectorAll('[data-action="openMemberPicker"]')
      .forEach(btn => {
        btn.addEventListener('click', () => this._openMemberPicker(), { signal });
      });

    // Remove button on each card
    this.element
      .querySelectorAll('[data-action="removeMember"]')
      .forEach(btn => {
        btn.addEventListener('click', async () => {
          const uuid = btn.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          await this._removeMember(uuid);
        }, { signal });
      });

    // NPC action chips → send NPC action to chat
    this.element
      .querySelectorAll('[data-action="memberNpcAction"]')
      .forEach(el => {
        el.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uuid = el.dataset.actorUuid;
          const actionIndex = parseInt(el.dataset.actionIndex);
          if (!uuid || isNaN(actionIndex)) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const action = actor.system.actions?.[actionIndex];
          if (!action) return;
          const targetsAtRollTime = TargetHelper.captureCurrentTargets();
          await VagabondChatCard.npcAction(actor, action, actionIndex, targetsAtRollTime);
        }, { signal });
      });

    // NPC ability chips → send NPC ability to chat
    this.element
      .querySelectorAll('[data-action="memberNpcAbility"]')
      .forEach(el => {
        el.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uuid = el.dataset.actorUuid;
          const actionIndex = parseInt(el.dataset.actionIndex);
          if (!uuid || isNaN(actionIndex)) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const ability = actor.system.abilities?.[actionIndex];
          if (!ability) return;
          const targetsAtRollTime = TargetHelper.captureCurrentTargets();
          // VagabondChatCard.npcAction handles abilities too (same card format)
          await VagabondChatCard.npcAction(actor, ability, actionIndex, targetsAtRollTime);
        }, { signal });
      });
  }

  /**
   * Party header controls and the per-member XP chip.
   * @param {AbortSignal} signal
   * @private
   */
  _bindPartyControls(signal) {
    const on = (action, handler) => {
      this.element.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
        el.addEventListener('click', (event) => {
          event.stopPropagation();
          handler(el, event);
        }, { signal });
      });
    };

    on('partyShiftsStep', (el) => this._stepPartyShifts(Number(el.dataset.step)));
    on('setActiveParty', () => DowntimeHelper.setActiveParty(this.actor));
    on('toggleNavigator', (el) => this._toggleNavigator(el.closest('[data-actor-uuid]')?.dataset.actorUuid));
    on('setTravelPace', (el) => {
      if (this.isEditable && el.dataset.pace) this.actor.update({ 'system.pace': el.dataset.pace });
    });
    on('toggleHazardous', () => {
      if (this.isEditable) this.actor.update({ 'system.hazardous': !this.actor.system.hazardous });
    });
    on('partyTravelStep', (el) => this._stepTravelShifts(Number(el.dataset.step)));
    on('toggleTokenMode', () => this._toggleTokenMode());
    on('partyTravel', () => this._partyTravel());
    on('partyTravelReset', () => {
      if (game.user.isGM) this.actor.update({ 'system.travelShifts': 0 });
    });

    // Travel field shows the Pace / Hazardous miles; while focused it edits the base Travel Speed
    const travel = this.element.querySelector('input[name="system.travel"].is-modified');
    if (travel) {
      travel.addEventListener('focus', () => { travel.value = travel.dataset.base; }, { signal });
      travel.addEventListener('blur', () => {
        if (travel.value === travel.dataset.base) travel.value = travel.dataset.trip;
      }, { signal });
    }

    // "Remove Member" toggle: the per-card X buttons only show while it is on
    const applyRemoveMode = () => {
      this.element.querySelectorAll('.party-member-grid').forEach((grid) => grid.classList.toggle('remove-mode', this._removeMode));
      this.element.querySelectorAll('[data-action="toggleRemoveMode"]').forEach((btn) => btn.classList.toggle('is-active', this._removeMode));
    };
    applyRemoveMode();
    on('toggleRemoveMode', () => {
      this._removeMode = !this._removeMode;
      applyRemoveMode();
    });
    on('toggleInvItem', (el) => this._toggleInventoryItem(el.closest('.inv-item')));
    on('shareCoins', (el) => {
      const member = this._syncActor(el.closest('[data-actor-uuid]')?.dataset.actorUuid);
      if (member) CoinTransferDialog.open(member, { party: this.actor });
    });
    this._bindTradeDrag(signal);
    on('openContainer', (el) => { try { fromUuidSync(el.closest('[data-item-uuid]')?.dataset.itemUuid)?.sheet?.render(true); } catch { /* gone */ } });
    on('openTransport', (el) => this._syncActor(el.closest('[data-transport-uuid]')?.dataset.transportUuid)?.sheet?.render(true));
    on('removeTransport', (el) => this._removeTransport(el.closest('[data-transport-uuid]')?.dataset.transportUuid));
    on('toggleRider', (el) => this._toggleRider(el.closest('[data-transport-uuid]')?.dataset.transportUuid, el.dataset.actorUuid));
    on('activateTransport', (el) => this._activateTransport(el.closest('[data-transport-uuid]')?.dataset.transportUuid));
    on('toggleTransportEdit', () => {
      this._transportEdit = !this._transportEditing();
      this.render(false, { parts: ['inventory'] });
    });

    // Transport sleeve: lit while a drag hovers it (the drop itself goes through _onDropActor / _onDropItem)
    this.element.querySelectorAll('.party-transports').forEach((zone) => {
      const over = (on) => zone.classList.toggle('is-over', on);
      zone.addEventListener('dragenter', () => over(true), { signal });
      zone.addEventListener('dragover', () => over(true), { signal });
      zone.addEventListener('dragleave', (event) => { if (!zone.contains(event.relatedTarget)) over(false); }, { signal });
      zone.addEventListener('drop', () => over(false), { signal });
    });

    // Item names: tooltip only when the ellipsis cuts the name. Set on pointerover, which
    // fires before the pointerenter Foundry's TooltipManager reads the attribute on.
    this.element.querySelectorAll('.party-inventory').forEach((tab) => {
      tab.addEventListener('pointerover', (event) => {
        const button = event.target.closest?.('.inv-name');
        const text = button?.querySelector('.inv-name-text');
        if (!text) return;
        if (text.scrollWidth > text.clientWidth) button.dataset.tooltipText = text.textContent;
        else delete button.dataset.tooltipText;
      }, { signal });
    });

    // Open accordions stay open across re-renders
    this.element.querySelectorAll('.inv-item.open').forEach((row) => this._fillInventoryDetail(row));

    // Member coins: edit gold / silver / copper straight on the card
    this.element.querySelectorAll('.member-coin-input:not([readonly])').forEach((input) => {
      input.addEventListener('change', async (event) => {
        event.stopPropagation();
        const coin = input.dataset.coin;
        if (!CurrencyHelper.DENOMINATIONS.includes(coin)) return;
        const uuid = input.closest('[data-actor-uuid]')?.dataset.actorUuid;
        const actor = uuid ? await fromUuid(uuid) : null;
        if (!actor) return;
        const value = Math.max(0, Math.floor(Number(input.value) || 0));
        input.value = value;
        await this._updateMemberField(actor, `system.currency.${coin}`, value);
      }, { signal });
    });
    on('partyDowntime', () => this._partyDowntime());
    on('partyLevelUpAll', () => this._levelUpParty());
    on('memberLevelUp', async (el) => {
      const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
      const actor = uuid ? await fromUuid(uuid) : null;
      if (!actor) return;
      if (!actor.isOwner) {
        ui.notifications.warn(this._controlsText('NoOwnCharacter'));
        return;
      }
      new LevelUpDialog(actor).render(true);
    });
  }

  /**
   * Inventory tab cards: one per Character with its coins and items grouped by type (Weapon,
   * Armor, Alchemical, Relic, Gear). Each card is a free-trade drop target (TradeHelper); rows
   * drag only where the user may take (their own Character, or any for the GM). Transport Holds
   * open as container sheets from the Transport row.
   * @returns {Object[]}
   */
  _inventoryCards() {
    const cards = [];
    for (const uuid of this.actor.system.members ?? []) {
      const member = this._syncActor(uuid);
      if (member?.type !== 'character') continue;
      const canTake = TradeHelper.canTake(game.user, member);

      const buckets = Object.fromEntries(INVENTORY_GROUPS.map((key) => [key, []]));
      for (const item of member.items) {
        if (!TradeHelper.TRADE_TYPES.includes(item.type) || item.system.containerId) continue;
        const type = item.system.equipmentType;
        buckets[INVENTORY_GROUPS.includes(type) ? type : 'gear'].push({
          uuid: item.uuid,
          name: item.name,
          img: item.img,
          quantity: TradeHelper.quantityOf(item),
          equipped: EquipmentHelper.isEquipped(item),
          draggable: canTake,
          open: this._invOpen.has(item.uuid),
        });
      }
      const groups = INVENTORY_GROUPS
        .filter((key) => buckets[key].length)
        .map((key) => ({
          key,
          label: game.i18n.localize(`VAGABOND.Actor.Party.Inventory.Groups.${key}`),
          items: buckets[key].sort((a, b) => a.name.localeCompare(b.name)),
        }));

      const wallet = CurrencyHelper.walletOf(member);
      cards.push({
        uuid: member.uuid,
        name: member.name,
        img: member.img,
        canTake,
        locked: !canTake,
        slotsUsed: member.system.inventory?.occupiedSlots ?? 0,
        slotsTotal: member.system.inventory?.maxSlots ?? 0,
        coins: CurrencyHelper.DENOMINATIONS.map((key) => ({
          key, value: wallet?.[key] ?? 0, abbr: game.i18n.localize(`VAGABOND.Currency.${key.capitalize()}.abbr`),
        })),
        groups,
      });
    }
    return cards;
  }

  /** Whole-stack value of an item as a coin string ('' when it has none). */
  _itemValue(item) {
    const quantity = Math.max(0, Number(item.system.quantity ?? 1));
    const unit = item.type === 'container' ? item.system.baseCost : item.system.cost;
    const copper = CurrencyHelper.toCopper(unit) * quantity;
    return copper > 0 ? CurrencyHelper.format(copper) : '';
  }

  /**
   * Free trade drag sources and drop highlights. Rows the user may take carry a plain `Item`
   * drag payload, so they also drop on Character sheets, container sheets and the HUD.
   * @param {AbortSignal} signal
   */
  _bindTradeDrag(signal) {
    const root = this.element;
    for (const row of root.querySelectorAll('.inv-item[draggable="true"]')) {
      row.addEventListener('dragstart', (event) => {
        event.stopPropagation();
        event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'Item', uuid: row.dataset.itemUuid }));
        // copyMove: other sheets' drop zones may ask for either effect; the trade always moves
        event.dataTransfer.effectAllowed = 'copyMove';
        row.classList.add('is-dragging');
        root.classList.add('is-trading');
      }, { signal });
      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        root.classList.remove('is-trading');
        root.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
      }, { signal });
    }

    // Light the card / transport / Hold under the cursor
    for (const zone of root.querySelectorAll('.party-inv-card, .pt-card, .pt-hold')) {
      const over = (on) => zone.classList.toggle('is-over', on);
      zone.addEventListener('dragover', () => over(true), { signal });
      zone.addEventListener('dragleave', (event) => { if (!zone.contains(event.relatedTarget)) over(false); }, { signal });
      zone.addEventListener('drop', () => {
        over(false);
        root.classList.remove('is-trading');
      }, { signal });
    }
  }

  /**
   * Where an item dropped on this sheet goes: a Hold button, a transport card (its first Hold),
   * or a Character's card (Inventory or Party tab). Anywhere else is refused.
   * @returns {{actorUuid?: string, containerUuid?: string}|null}  null = refused (already warned)
   */
  _tradeDest(event) {
    const target = event.target;
    const hold = target?.closest?.('.pt-hold[data-item-uuid]');
    if (hold) return { containerUuid: hold.dataset.itemUuid };
    const transportUuid = target?.closest?.('[data-transport-uuid]')?.dataset.transportUuid;
    if (transportUuid) {
      const first = this._syncActor(transportUuid)?.items.find((item) => item.type === 'container');
      if (!first) {
        ui.notifications.warn(this._transportText('NoHoldDrop'));
        return null;
      }
      return { containerUuid: first.uuid };
    }
    const member = target?.closest?.('.party-inv-card[data-actor-uuid], .party-member-card[data-actor-uuid]')?.dataset.actorUuid;
    if (member && this._syncActor(member)?.type === 'character') return { actorUuid: member };
    // The party itself holds no items: drop on a Character, a transport or a Hold
    ui.notifications.warn(game.i18n.localize('VAGABOND.Trade.DropOnCard'));
    return null;
  }

  /** Localized `VAGABOND.Actor.Party.Transport.<key>`, formatted when `data` is given. */
  _transportText(key, data) {
    const path = `VAGABOND.Actor.Party.Transport.${key}`;
    return data ? game.i18n.format(path, data) : game.i18n.localize(path);
  }

  /** Non-GM users who own at least one of the party's Characters. */
  _partyPlayers() {
    const characters = (this.actor.system.members ?? [])
      .map((uuid) => this._syncActor(uuid))
      .filter((a) => a?.type === 'character');
    const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    return game.users.filter((u) => !u.isGM && characters.some((a) => a.getUserLevel(u) >= OWNER));
  }

  /**
   * Ownership note for a document the party relies on (the party sheet, a transport).
   * GM: names the party's players who don't own it. Player: shown when they don't own it.
   * @returns {string|null} tooltip text, null when nothing is missing
   */
  _ownershipNote(doc) {
    const isParty = doc === this.actor;
    if (!game.user.isGM) {
      return doc.isOwner ? null : this._transportText(isParty ? 'OwnershipPartyYou' : 'OwnershipYou', { name: doc.name });
    }
    const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const missing = this._partyPlayers().filter((u) => doc.getUserLevel(u) < OWNER);
    if (!missing.length) return null;
    return this._transportText(isParty ? 'OwnershipPartyMissing' : 'OwnershipMissing', {
      name: doc.name, players: missing.map((u) => u.name).join(', '),
    });
  }

  /**
   * Transport row mode. Edit: add / remove transports (drops accepted). Locked: activate the
   * transport in use and board members. A party with no transport opens in edit mode.
   */
  _transportEditing() {
    if (!this.isEditable) return false;
    return this._transportEdit || !this._transportEntries().length;
  }

  /**
   * Transport row cards: one per transport with its kind, speeds, Holds (container items),
   * active state and, while in use, a seat per member (lit = aboard; click to board / get off).
   * @returns {Object[]}
   */
  _transportCards() {
    const feet = game.i18n.localize('VAGABOND.UI.Units.Feet');
    const miles = game.i18n.localize('VAGABOND.UI.Units.Miles');
    const members = (this.actor.system.members ?? [])
      .map((uuid) => this._syncActor(uuid))
      .filter((a) => a?.type === 'character' || a?.type === 'npc');
    const activeUuid = this._activeTransportUuid();
    const editing = this._transportEditing();
    return this._transportEntries().map((entry) => {
      const { actor, riders } = entry;
      const kind = this._transportKind(actor);
      const active = actor.uuid === activeUuid;
      const inUse = this._inUse(entry);
      const kindCfg = CONFIG.VAGABOND.constructKinds[kind] ?? CONFIG.VAGABOND.constructKinds.vehicle;
      const speeds = this._transportSpeeds(actor);
      const speedParts = [speeds.speed && `${speeds.speed}${feet}`, speeds.travel && `${speeds.travel} ${miles}`].filter(Boolean);
      return {
        uuid: actor.uuid,
        name: actor.name,
        img: actor.img,
        kindIcon: kindCfg.icon,
        kindLabel: game.i18n.localize(kindCfg.label),
        // Kind icon tooltip: kind · speeds (the Travel miles also show on the party tab)
        infoTooltip: [game.i18n.localize(kindCfg.label),
          speedParts.length ? speedParts.join(' · ') : this._transportText('PulledTooltip')].join(' · '),
        active,
        parked: !inUse,
        activateTooltip: this._transportText(active ? 'Active' : 'Activate', { name: actor.name }),
        showSeats: inUse && !editing,
        ownershipNote: this._ownershipNote(actor),
        holds: actor.items
          .filter((item) => item.type === 'container')
          .map((item) => ({
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            used: item.system.currentCapacity ?? 0,
            capacity: item.system.capacity ?? 0,
          })),
        seats: members
          .filter((m) => m.uuid !== actor.uuid)
          .map((m) => {
            const aboard = riders.includes(m.uuid);
            return { uuid: m.uuid, name: m.name, img: m.img, aboard, tooltip: this._transportText(aboard ? 'Aboard' : 'Board', { name: m.name }) };
          }),
      };
    });
  }

  /** Board a member on a transport (leaving any other one), or get them off when already aboard. */
  async _toggleRider(transportUuid, memberUuid) {
    if (!this.isEditable || !transportUuid || !memberUuid) return;
    const transports = foundry.utils.deepClone(this.actor.system.transports ?? []);
    const target = transports.find((entry) => entry.uuid === transportUuid);
    const actor = this._syncActor(transportUuid);
    if (!target || !actor || !this._inUse({ actor, riders: target.riders })) return;
    const aboard = target.riders.includes(memberUuid);
    for (const entry of transports) entry.riders = entry.riders.filter((uuid) => uuid !== memberUuid);
    if (!aboard) target.riders.push(memberUuid);
    await this.actor.update({ 'system.transports': transports });
    await this._syncTokenImage();
  }

  /**
   * Add a transport: a Mount / Vehicle / Structure actor or an NPC beast. A compendium actor is
   * imported into the world first (needs the right to create actors).
   */
  async _addTransport(actor) {
    if (actor.pack) {
      if (!Actor.implementation.canUserCreate(game.user)) {
        ui.notifications.warn(this._transportText('ImportDenied'));
        return false;
      }
      actor = await game.actors.importFromCompendium(game.packs.get(actor.pack), actor.id);
      if (!actor) return false;
    }
    const transports = foundry.utils.deepClone(this.actor.system.transports ?? []);
    if (transports.some((entry) => entry.uuid === actor.uuid)) {
      ui.notifications.warn(this._transportText('Already', { name: actor.name }));
      return false;
    }
    transports.push({ uuid: actor.uuid, riders: [] });
    await this.actor.update({ 'system.transports': transports });
    // Adding happens in edit mode: stay there for more drops. A first transport becomes the active one.
    this._transportEdit = true;
    if (!this._activeTransportUuid()) await this._activateTransport(actor.uuid);
    return true;
  }

  /**
   * Make a transport the one the party uses (click the active one again to park it). Riders of
   * the transports left parked get off; a vehicle / vessel / structure boards every member who
   * doesn't ride a Mount (the Navigator then rides the draft animal of a pulled Cart).
   */
  async _activateTransport(uuid) {
    if (!this.isEditable || !uuid) return;
    const active = this._activeTransportUuid() === uuid ? '' : uuid;
    const transports = foundry.utils.deepClone(this.actor.system.transports ?? []);
    const kindOf = (entryUuid) => this._transportKind(this._syncActor(entryUuid));
    for (const entry of transports) {
      if (entry.uuid !== active && kindOf(entry.uuid) !== 'mount') entry.riders = [];
    }
    const target = transports.find((entry) => entry.uuid === active);
    if (target && kindOf(active) !== 'mount') {
      const mounted = new Set(transports.filter((entry) => kindOf(entry.uuid) === 'mount').flatMap((entry) => entry.riders));
      const members = (this.actor.system.members ?? [])
        .filter((memberUuid) => memberUuid !== active && !mounted.has(memberUuid))
        .filter((memberUuid) => ['character', 'npc'].includes(this._syncActor(memberUuid)?.type));
      target.riders = [...new Set([...target.riders, ...members])];
    }
    await this.actor.update({ 'system.activeTransport': active, 'system.transports': transports });
    await this._syncTokenImage();
  }

  /** Take a transport off the party (the actor itself is kept). */
  async _removeTransport(uuid) {
    if (!this.isEditable || !uuid) return;
    const transports = (this.actor.system.transports ?? []).filter((entry) => entry.uuid !== uuid);
    const update = { 'system.transports': transports };
    if (this.actor.system.activeTransport === uuid) update['system.activeTransport'] = '';
    await this.actor.update(update);
    await this._syncTokenImage();
  }

  /** Click on an item name: open / close its info accordion (no re-render). */
  _toggleInventoryItem(row) {
    const uuid = row?.dataset.itemUuid;
    if (!uuid) return;
    const open = row.classList.toggle('open');
    if (open) {
      this._invOpen.add(uuid);
      this._fillInventoryDetail(row);
    } else {
      this._invOpen.delete(uuid);
    }
  }

  /** Fill an open accordion with the shared item detail body (description, stats, properties). */
  async _fillInventoryDetail(row) {
    const host = row.querySelector('.inv-detail-inner');
    if (!host || host.dataset.loaded) return;
    let item = null;
    try { item = fromUuidSync(row.dataset.itemUuid); } catch { item = null; }
    if (!item) return;
    host.dataset.loaded = '1';

    const TE = foundry.applications.ux.TextEditor.implementation;
    const description = item.system.description
      ? await TE.enrichHTML(item.system.description, { relativeTo: item })
      : '';
    let html = description ? `<div class="mini-sheet-description">${description}</div>` : '';
    // Quantity is in the list; the Value rides on the Slots row, Material shows when it matters
    const value = this._itemValue(item);
    html += item.type === 'container'
      ? `<div class="mini-sheet-stats">${buildSlotsRow(item, { value })}</div>`
      : buildStatsSection(item, { compact: true, value });
    if (EquipmentHelper.isWeapon(item) && item.system.properties?.length) {
      html += buildWeaponProperties(item, { tooltips: true });
    }
    host.innerHTML = html;
  }

  /**
   * The header's Shift clocks: one 4-segment clock per Day, all filled (nothing is spent
   * until the downtime starts). Clocks shrink as the Days pile up so the box stays compact.
   */
  _shiftClocks() {
    const shifts = Math.max(1, this.actor.system.shifts || 1);
    const days = Math.ceil(shifts / SHIFTS_PER_DAY);
    const list = [];
    for (let day = 0; day < days; day++) {
      const planned = Math.min(SHIFTS_PER_DAY, shifts - day * SHIFTS_PER_DAY);
      list.push({
        img: ProgressClock.getSVGPath(SHIFTS_PER_DAY, planned),
        tooltip: game.i18n.format('VAGABOND.Downtime.Tracker.DayTooltip', { day: day + 1, left: planned, planned }),
      });
    }
    const size = days <= 1 ? 72 : days <= 2 ? 56 : 40;
    return { size, list };
  }

  /**
   * The header's Travel clocks: one 4-segment Shift clock per Day travelled, filled with the
   * Shifts Travelled since the last Rest (one empty clock at 0). `over` = past the two Shifts
   * a Rest allows (each further Shift gives 1 Fatigue).
   */
  _travelClocks() {
    const travelled = Math.max(0, this.actor.system.travelShifts || 0);
    const days = Math.max(1, Math.ceil(travelled / SHIFTS_PER_DAY));
    const list = [];
    for (let day = 0; day < days; day++) {
      const filled = Math.clamp(travelled - day * SHIFTS_PER_DAY, 0, SHIFTS_PER_DAY);
      list.push({
        img: ProgressClock.getSVGPath(SHIFTS_PER_DAY, filled),
        tooltip: this._controlsText('TravelDayTooltip', { day: day + 1, n: filled, max: SHIFTS_PER_DAY }),
      });
    }
    const size = days <= 1 ? 72 : days <= 2 ? 56 : 40;
    return { size, list, travelled, over: travelled > CONFIG.VAGABOND.travelShiftsPerRest };
  }

  /** Localized `VAGABOND.Actor.Party.Controls.<key>`, formatted when `data` is given. */
  _controlsText(key, data) {
    const path = `VAGABOND.Actor.Party.Controls.${key}`;
    return data ? game.i18n.format(path, data) : game.i18n.localize(path);
  }

  /** Every member that still resolves to an actor. */
  async _memberActors() {
    const uuids = this.actor.system.members ?? [];
    const actors = await Promise.all(uuids.map((uuid) => fromUuid(uuid).catch(() => null)));
    return actors.filter(Boolean);
  }

  /** Resolve a uuid synchronously (null when missing or unresolvable). */
  _syncActor(uuid) {
    if (!uuid) return null;
    try { return fromUuidSync(uuid) ?? null; } catch { return null; }
  }

  /** The party's transports that still resolve: `{ actor, riders }` in list order. */
  _transportEntries() {
    return (this.actor.system.transports ?? [])
      .map((entry) => ({ actor: this._syncActor(entry.uuid), riders: entry.riders ?? [] }))
      .filter((entry) => entry.actor);
  }

  /** `mount|vehicle|vessel|structure`: an NPC beast is a Mount. */
  _transportKind(actor) {
    if (!actor) return null;
    return actor.type === 'npc' ? 'mount' : (actor.system.kind || 'vehicle');
  }

  /** The active transport's uuid ('' when none is active or it no longer resolves). */
  _activeTransportUuid() {
    const uuid = this.actor.system.activeTransport;
    return uuid && this._transportEntries().some((entry) => entry.actor.uuid === uuid) ? uuid : '';
  }

  /** In use = the active transport, or a Mount (each one carries whoever rides it). The rest are parked. */
  _inUse(entry) {
    return entry.actor.uuid === this._activeTransportUuid() || this._transportKind(entry.actor) === 'mount';
  }

  /** The transport in use a member rides (null when on foot). */
  _rideOf(uuid) {
    return this._transportEntries().find((entry) => entry.riders.includes(uuid) && this._inUse(entry))?.actor ?? null;
  }

  /**
   * A transport's own speeds, null where it has none (a pulled Cart / Wagon has none at all,
   * a vessel only a Travel Speed). NPC beasts: Speed, Crawl = 3 × Speed, Travel = Speed ÷ 5 (book).
   * @returns {{speed: number|null, crawl: number|null, travel: number|null}}
   */
  _transportSpeeds(transport) {
    const sys = transport.system;
    const positive = (v) => (Number(v) > 0 ? Number(v) : null);
    if (transport.type === 'npc') {
      const speed = positive(sys.speed);
      return { speed, crawl: speed && speed * 3, travel: speed && Math.floor(speed / 5) };
    }
    return { speed: positive(sys.speed), crawl: positive(sys.crawl), travel: positive(sys.travel) };
  }

  /**
   * A member's speeds as the party moves: their own, replaced field by field by the speeds of
   * the transport they ride ("controlled Mounts obey the rider, who uses the Mount's Speed
   * instead of their own", book p.17). Characters: derived Speed / Crawl / Travel; NPCs:
   * Speed (0 = stationary, ignored) and Travel = Speed ÷ 5.
   * @returns {{speed: number|null, crawl: number|null, travel: number|null, ride: Actor|null}}
   */
  _effectiveSpeeds(actor) {
    const finite = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    const own = actor.type === 'character'
      ? { speed: finite(actor.system.speed?.base), crawl: finite(actor.system.speed?.crawl), travel: finite(actor.system.speed?.travel) }
      : { speed: Number(actor.system.speed) > 0 ? Number(actor.system.speed) : null, crawl: null, travel: this._memberTravel(actor) };
    const ride = this._rideOf(actor.uuid);
    if (!ride) return { ...own, ride: null };
    const carried = this._transportSpeeds(ride);
    return {
      speed: carried.speed ?? own.speed,
      crawl: carried.crawl ?? own.crawl,
      travel: carried.travel ?? own.travel,
      ride,
    };
  }

  /**
   * Automatic party speeds: Speed and Crawl = the slowest member as the party moves (riders
   * at their transport's speed); Travel = the Navigator's ("A Group uses the Navigator's
   * Speed", book p.21), or the slowest member's when none is picked.
   * Read synchronously at render / submit time, so it follows every member's current value.
   * @returns {{speed: number, crawl: number, travel: number}}
   */
  _autoSpeeds() {
    const slowest = { speed: null, crawl: null, travel: null };
    for (const uuid of this.actor.system.members ?? []) {
      const member = this._syncActor(uuid);
      if (member?.type !== 'character' && member?.type !== 'npc') continue;
      const speeds = this._effectiveSpeeds(member);
      for (const field of Object.keys(slowest)) {
        const value = speeds[field];
        if (value !== null && (slowest[field] === null || value < slowest[field])) slowest[field] = value;
      }
    }
    const navigator = this._navigatorActor();
    const navigatorTravel = navigator ? this._effectiveSpeeds(navigator).travel : null;
    return {
      speed: slowest.speed ?? 0,
      crawl: slowest.crawl ?? 0,
      travel: navigatorTravel ?? slowest.travel ?? 0,
    };
  }

  /** The party's Navigator, while that uuid is still a member; null otherwise. */
  _navigatorActor() {
    const uuid = this.actor.system.navigator;
    if (!uuid || !(this.actor.system.members ?? []).includes(uuid)) return null;
    return this._syncActor(uuid);
  }

  /** A member's own Travel Speed in miles per Shift: a Character's derived value, an NPC's Speed ÷ 5 (book). */
  _memberTravel(actor) {
    if (actor.type === 'character') {
      const travel = Number(actor.system.speed?.travel);
      return Number.isFinite(travel) ? travel : null;
    }
    const speed = Number(actor.system.speed);
    return speed > 0 ? Math.floor(speed / 5) : null;
  }

  /** Pick (or clear, when already picked) the member the Group follows when it Travels. */
  async _toggleNavigator(uuid) {
    if (!this.isEditable || !uuid) return;
    await this.actor.update({ 'system.navigator': this.actor.system.navigator === uuid ? '' : uuid });
    await this._syncTokenImage();
  }

  // ── Party token: grouped party art ↔ transport art ─────────────────────────

  /** The transport whose art the party token shows in transport mode: the active one. */
  _tokenTransport() {
    return this._syncActor(this._activeTransportUuid() || null);
  }

  /** Token art of an actor: its prototype token texture, else its portrait. */
  _tokenArt(actor) {
    return actor?.prototypeToken?.texture?.src || actor?.img || null;
  }

  /** `'party'` (grouped party art, e.g. crawling) or `'transport'` (travelling). */
  _tokenMode() {
    return this.actor.getFlag('vagabond', 'tokenMode') === 'transport' ? 'transport' : 'party';
  }

  /** Header button state. */
  _tokenModeView() {
    const transport = this._tokenTransport();
    const mode = this._tokenMode();
    const t = (key, data) => this._transportText(key, data);
    const travelling = mode === 'transport' && !!transport;
    return {
      transport: mode === 'transport',
      // The portrait follows the token: the transport's art while travelling with it
      portrait: travelling ? (transport.img || this._tokenArt(transport)) : this.actor.img,
      portraitTooltip: travelling ? transport.name : this.actor.name,
      travelling,
      disabled: !transport && mode === 'party',
      tooltip: mode === 'transport'
        ? t('TokenModeTransport', { name: transport?.name ?? '?' })
        : (transport ? t('TokenModeParty', { name: transport.name }) : t('TokenModeNone')),
    };
  }

  /** Switch the party token between the party art and the transport art. */
  async _toggleTokenMode() {
    if (!this.isEditable) return;
    if (this._tokenMode() === 'transport') return this._setTokenMode('party');
    if (!this._tokenTransport()) {
      ui.notifications.warn(this._transportText('TokenModeNone'));
      return;
    }
    return this._setTokenMode('transport');
  }

  /** In transport mode, follow the current transport (Navigator changed ride, transport removed…). */
  async _syncTokenImage() {
    if (this._tokenMode() !== 'transport') return;
    await this._setTokenMode(this._tokenTransport() ? 'transport' : 'party');
  }

  /**
   * Apply a token mode: the prototype token and every placed token of the party, in every
   * scene, switch to the party art (saved in `flags.vagabond.partyTokenImg` when leaving it)
   * or to the transport's token art.
   */
  async _setTokenMode(mode) {
    const saved = this.actor.getFlag('vagabond', 'partyTokenImg');
    const current = this.actor.prototypeToken.texture.src;
    const partyImg = saved || current || this.actor.img;
    const src = mode === 'transport' ? this._tokenArt(this._tokenTransport()) : partyImg;
    if (!src) return;

    const update = { 'flags.vagabond.tokenMode': mode, 'prototypeToken.texture.src': src };
    // Keep the party's own art while the transport art is shown
    if (mode === 'transport' && !saved) update['flags.vagabond.partyTokenImg'] = current || this.actor.img;
    if (mode === 'party') update['flags.vagabond.-=partyTokenImg'] = null;
    await this.actor.update(update);

    // Placed tokens (linked or not) in every scene, one batch per scene
    for (const scene of game.scenes) {
      const updates = scene.tokens
        .filter((token) => token.actorId === this.actor.id && token.texture.src !== src)
        .map((token) => ({ _id: token.id, 'texture.src': src }));
      if (!updates.length) continue;
      try {
        await scene.updateEmbeddedDocuments('Token', updates);
      } catch (err) {
        console.warn(`Vagabond | Party token image not updated in scene ${scene.name}:`, err);
      }
    }
  }

  /**
   * Travel modifiers (book Exploration): the Pace multiplies the miles moved each Shift and
   * Hazardous Lands halve them. `distance` is the result for a Travel Speed of `travel`.
   */
  _travelView(travel) {
    const paces = CONFIG.VAGABOND.travelPaces;
    const pace = paces[this.actor.system.pace] ? this.actor.system.pace : 'normal';
    const hazardous = !!this.actor.system.hazardous;
    const mult = paces[pace].mult * (hazardous ? CONFIG.VAGABOND.hazardousMult : 1);
    const navigator = this._navigatorActor();
    const ride = navigator ? this._rideOf(navigator.uuid) : null;
    const t = (key, data) => (data ? game.i18n.format(`VAGABOND.Actor.Party.Travel.${key}`, data) : game.i18n.localize(`VAGABOND.Actor.Party.Travel.${key}`));
    return {
      pace,
      hazardous,
      paces: Object.entries(paces).map(([key, cfg]) => ({
        key,
        label: game.i18n.localize(cfg.label),
        active: key === pace,
        tooltip: t('PaceTooltip', { mult: cfg.mult, roll: game.i18n.localize(cfg.complication) })
          + (key === 'slow' ? ` ${t('ForageHint')}` : ''),
      })),
      // Who sets the Travel Speed: the Navigator (on their transport, if they ride one) or the slowest member
      leader: navigator ? (ride ? t('LeaderRiding', { name: navigator.name, ride: ride.name }) : navigator.name) : t('LeaderSlowest'),
      leaderRides: !!ride,
      leaderTooltip: t('NavigatorTooltip'),
      hazardTooltip: t(hazardous ? 'HazardousOn' : 'HazardousOff'),
      distance: Math.round(travel * mult * 100) / 100,
      modified: mult !== 1,
      distanceTooltip: t('DistanceTooltip'),
    };
  }

  /**
   * Party speeds as shown: a stored value (> 0) is a manual override, 0 follows the
   * automatic value (`auto: true`).
   */
  _speedsView() {
    const auto = this._autoSpeeds();
    const view = { autoTooltip: this._controlsText('SpeedAuto') };
    for (const field of ['speed', 'crawl', 'travel']) {
      const manual = Number(this.actor.system[field]) || 0;
      view[field] = manual > 0
        ? { value: manual, auto: false }
        : { value: auto[field], auto: true };
    }
    view.trip = this._travelView(view.travel.value);
    return view;
  }

  /**
   * Typing the automatic value again (or clearing the field) hands the speed back to
   * automatic, stored as 0; any other value is kept as a manual override.
   * @override
   */
  async _processSubmitData(event, form, submitData) {
    const auto = this._autoSpeeds();
    // The Travel field may be showing the Pace / Hazardous miles, not the stored speed: submit the base instead
    const travelInput = form.querySelector('input[name="system.travel"].is-modified');
    const showsTrip = travelInput && document.activeElement !== travelInput && travelInput.value === travelInput.dataset.trip;
    for (const field of ['speed', 'crawl', 'travel']) {
      const path = `system.${field}`;
      const nested = foundry.utils.hasProperty(submitData, path);
      if (field === 'travel' && showsTrip) {
        if (nested) foundry.utils.setProperty(submitData, path, travelInput.dataset.base);
        else if (path in submitData) submitData[path] = travelInput.dataset.base;
      }
      const raw = nested ? foundry.utils.getProperty(submitData, path) : submitData[path];
      if (raw === undefined) continue;
      const value = Number(raw);
      const resume = !Number.isFinite(value) || value <= 0 || value === auto[field];
      if (!resume) continue;
      if (nested) foundry.utils.setProperty(submitData, path, 0);
      else submitData[path] = 0;
    }
    await super._processSubmitData(event, form, submitData);
    // The stored value may not change (0 -> 0): re-render so the field shows the automatic value again
    this.render(false, { parts: ['party'] });
  }

  /**
   * GM: roll this Shift's Travel Complication (book d66) with the party's Pace applied
   * (Slow keeps the two highest of 3d6, Fast the two lowest; the kept dice in rolled
   * order are tens, ones). Posted as a card whispered to the GMs; `shift` = the Shift
   * Travelled since the last Rest (tagged, and past the Rest allowance it reminds the Fatigue).
   */
  async _rollTravelComplication({ shift = null } = {}) {
    if (!game.user.isGM) return;
    const paces = CONFIG.VAGABOND.travelPaces;
    const pace = paces[this.actor.system.pace] ? this.actor.system.pace : 'normal';
    const roll = await new Roll(paces[pace].complicationFormula ?? '2d6').evaluate();
    const kept = roll.dice[0].results.filter((r) => r.active).map((r) => r.result);
    const d66 = kept[0] * 10 + kept[1];

    const t = (key, data) => (data ? game.i18n.format(`VAGABOND.Actor.Party.Travel.${key}`, data) : game.i18n.localize(`VAGABOND.Actor.Party.Travel.${key}`));
    const entry = CONFIG.VAGABOND.travelComplications.find((c) => d66 >= c.min && d66 <= c.max);
    const navigator = this._navigatorActor()?.name ?? t('LeaderSlowest');
    let description = entry
      ? `<p>${VagabondTextParser.parseCountdownDice(t(`Complications.${entry.key}`, { navigator }))}</p><p><em>${t('RandomEncounterHint')}</em></p>`
      : `<p>${t('ComplicationNone')}</p>`;
    if (shift > CONFIG.VAGABOND.travelShiftsPerRest) description += `<p><strong>${t('ComplicationFatigue', { n: shift })}</strong></p>`;

    const card = new VagabondChatCard()
      .setActor(this.actor)
      .setTitle(t('ComplicationTitle'))
      .setSubtitle(t('ComplicationPace', { pace: game.i18n.localize(paces[pace].label), roll: game.i18n.localize(paces[pace].complication) }))
      .addRoll(roll, null)
      .setDescription(description);
    card.data.rollTotal = d66;
    if (shift) card.data.standardTags = [{ label: t('ComplicationShift', { n: shift }), icon: 'fas fa-route' }];
    card.data.whisper = game.users.filter((u) => u.isGM).map((u) => u.id);
    await card.send();
  }

  /** GM: Travel one Shift — mark it on the Travel clock, then roll its Complication. */
  async _partyTravel() {
    if (!game.user.isGM) return;
    const shift = (this.actor.system.travelShifts || 0) + 1;
    await this.actor.update({ 'system.travelShifts': shift });
    await this._rollTravelComplication({ shift });
  }

  /** GM: mark / unmark a Travelled Shift by hand (no Complication roll; back to 0 after a Rest). */
  async _stepTravelShifts(step) {
    if (!game.user.isGM || !step) return;
    const current = this.actor.system.travelShifts || 0;
    const next = Math.clamp(current + step, 0, DowntimeHelper.MAX_SHIFTS);
    if (next !== current) await this.actor.update({ 'system.travelShifts': next });
  }

  /** GM: grant the party one more / one fewer Shift for its next downtime. */
  async _stepPartyShifts(step) {
    if (!game.user.isGM || !step) return;
    const current = this.actor.system.shifts || 1;
    const next = Math.clamp(current + step, 1, DowntimeHelper.MAX_SHIFTS);
    if (next !== current) await this.actor.update({ 'system.shifts': next });
  }

  /**
   * Downtime button. GM: start a fresh downtime with the party's Shifts on every Character.
   * Player: open the Downtime panel of their own Character.
   */
  async _partyDowntime() {
    const characters = (await this._memberActors()).filter((a) => a.type === 'character');

    if (!game.user.isGM) {
      const own = characters.find((a) => a.isOwner);
      if (!own) {
        ui.notifications.warn(this._controlsText('NoOwnCharacter'));
        return;
      }
      DowntimeApp.open(own);
      return;
    }

    if (!characters.length) {
      ui.notifications.warn(this._controlsText('NoCharacters'));
      return;
    }

    if (characters.some((a) => DowntimeHelper.state(a).log.length > 0)) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: this._controlsText('Downtime') },
        content: `<p>${this._controlsText('DowntimeConfirm')}</p>`,
      });
      if (!confirmed) return;
    }

    // Starting a downtime makes this the active party: its Shifts are its members' Shifts
    await DowntimeHelper.setActiveParty(this.actor);
    const shifts = this.actor.system.shifts || 1;
    await Promise.all(characters.map((a) => DowntimeHelper.begin(a, shifts)));
    await ChatMessage.create({
      speaker: { alias: this.actor.name },
      content: `<p>${this._controlsText('DowntimeAnnounce', { shifts })}</p>`,
    });
    ui.notifications.info(this._controlsText('DowntimeStarted', { n: characters.length }));
  }

  /**
   * GM: Grant Level (Destiny, no XP) to every Character, one Level Up window at a time.
   * The next window opens once the current one is closed with its choices applied;
   * closing one without applying (or undoing) stops the run.
   */
  async _levelUpParty() {
    if (!game.user.isGM) return;
    const characters = (await this._memberActors()).filter((a) => a.type === 'character');
    if (!characters.length) {
      ui.notifications.warn(this._controlsText('NoCharacters'));
      return;
    }

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: this._controlsText('LevelUpAll') },
      content: `<p>${this._controlsText('LevelUpAllConfirm', { n: characters.length })}</p>`,
    });
    if (!confirmed) return;

    for (const [index, actor] of characters.entries()) {
      ui.notifications.info(this._controlsText('LevelUpAllProgress', {
        i: index + 1, n: characters.length, name: actor.name,
      }));

      const dialog = new LevelUpDialog(actor);
      const closed = new Promise((resolve) => {
        const hookId = Hooks.on('closeLevelUpDialog', (app) => {
          if (app !== dialog) return;
          Hooks.off('closeLevelUpDialog', hookId);
          resolve();
        });
      });
      await dialog.render(true);
      await dialog._gainLevel({ destiny: true });
      await closed;

      if (!dialog._choicesApplied) {
        ui.notifications.info(this._controlsText('LevelUpAllStopped', { name: actor.name }));
        return;
      }
    }
  }

  /**
   * Handle dropping an actor onto the party sheet. A Mount / Vehicle / Structure always becomes
   * a transport, and so does an NPC dropped on the Transport sleeve (a beast to ride); other
   * Characters and NPCs join as members (world actors only).
   * @param {DragEvent} event
   * @param {Object} data
   * @override
   */
  /**
   * Every party user may drop here: item drops are free trade (TradeHelper checks who may take
   * and give, relayed through the GM); actor drops still require owning the party.
   * @override
   */
  _canDragDrop() {
    return true;
  }

  /** The party holds no items: Item folders are not dropped here. @override */
  async _onDropFolder() {
    return false;
  }

  async _onDropActor(event, data) {
    if (!this.actor.isOwner || !data.uuid) return false;
    let actor;
    try { actor = await fromUuid(data.uuid); } catch { return false; }
    if (!actor) return false;
    const onTransportSleeve = !!event.target?.closest?.('.party-transports');
    if (actor.type === 'construct' || (actor.type === 'npc' && onTransportSleeve)) {
      if (!this._transportEditing()) {
        ui.notifications.warn(this._transportText('UnlockToAdd'));
        return false;
      }
      return this._addTransport(actor);
    }
    // Members: only world actors (not compendium actors — actor.pack would be set for those)
    if (actor.pack || (actor.type !== 'character' && actor.type !== 'npc')) return false;
    await this._addMember(actor.uuid);
    return true;
  }

  /**
   * Item drops = free trade (TradeHelper guard rails) to the spot under the cursor (see
   * `_tradeDest`). A Container dropped on a transport card becomes one of its Holds (edit mode).
   * Shift-drop a stack to pick how many to move.
   * @param {DragEvent} event
   * @param {Object} data
   * @override
   */
  async _onDropItem(event, data) {
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    if (!TradeHelper.TRADE_TYPES.includes(item.type)) {
      TradeHelper.warn('notTradable');
      return false;
    }

    let dest;
    const transportUuid = event.target?.closest?.('[data-transport-uuid]')?.dataset.transportUuid;
    if (item.type === 'container' && transportUuid && !event.target.closest('.pt-hold')) {
      if (!this._transportEditing()) {
        ui.notifications.warn(this._transportText('UnlockToAdd'));
        return false;
      }
      dest = { actorUuid: transportUuid };
    } else {
      dest = this._tradeDest(event);
    }
    if (!dest) return false;
    const qty = await TradeHelper.pickQuantity(item, event);
    if (!qty) return false;
    return TradeHelper.moveItem({ source: { itemUuid: item.uuid }, dest, qty });
  }

  /**
   * A Hold / container entry dropped on the sheet: same routing as `_onDropItem`.
   * @override
   */
  async _onDropContainerItem(event, data) {
    if (!data?.containerUuid) return false;
    const dest = this._tradeDest(event);
    if (!dest) return false;
    const qty = await TradeHelper.pickQuantity(data.itemData, event);
    if (!qty) return false;
    return TradeHelper.moveItem({
      source: { containerUuid: data.containerUuid, entryId: data.entryId ?? data.itemData?._id ?? null, index: data.itemIndex },
      dest, qty,
    });
  }

  /**
   * Add an actor UUID to the party member list.
   * For character actors, also:
   *  - Grants party OWNER to every user who holds OWNER on that character.
   *  - Pre-creates the personal note journal so the player sees it immediately.
   * @param {string} uuid
   * @private
   */
  async _addMember(uuid) {
    const members = [...(this.actor.system.members ?? [])];
    if (members.includes(uuid)) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Actor.Party.Card.AlreadyMember'));
      return;
    }

    const actor = await fromUuid(uuid);

    // Build the base update (always done)
    const updateData = { 'system.members': [...members, uuid] };

    // For character actors: propagate character ownership → party ownership
    if (actor?.type === 'character') {
      const ownership = foundry.utils.deepClone(this.actor.ownership ?? {});
      for (const user of game.users) {
        if (!user.isGM && actor.getUserLevel(user) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
          ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
      }
      updateData.ownership = ownership;
    }

    await this.actor.update(updateData);

    // Pre-create the personal note journal now so the player doesn't see a blank
    // "unavailable" state the first time they open the Notes tab.
    if (actor?.type === 'character' && game.user.isGM) {
      await this._resolveNoteJournal('personal', actor.id);
    }
  }

  /**
   * Remove an actor UUID from the party member list, with a confirmation dialog.
   * The Character's personal note journal stays (it belongs to the Character, not the party).
   * @param {string} uuid
   * @private
   */
  async _removeMember(uuid) {
    const actor = await fromUuid(uuid);
    const name = actor?.name ?? uuid;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.Actor.Party.Card.Remove') },
      content: `<p>${game.i18n.format('VAGABOND.Actor.Party.Card.RemoveConfirm', { name })}</p>`,
    });
    if (!confirmed) return;

    const members = (this.actor.system.members ?? []).filter(u => u !== uuid);
    await this.actor.update({ 'system.members': members });
  }

  /**
   * Open a dialog to pick an actor (character or NPC) and add them as a party member.
   * @private
   */
  async _openMemberPicker() {
    const currentMembers = new Set(this.actor.system.members ?? []);
    // Only list world actors (not compendium actors)
    const available = game.actors
      .filter(a => (a.type === 'character' || a.type === 'npc') && !currentMembers.has(a.uuid))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!available.length) {
      ui.notifications.info(game.i18n.localize('VAGABOND.Actor.Party.Card.NoAvailable'));
      return;
    }

    const options = available
      .map(a => {
        const typeLabel = a.type === 'npc'
          ? game.i18n.localize('TYPES.Actor.npc')
          : game.i18n.localize('TYPES.Actor.character');
        return `<option value="${a.uuid}">[${typeLabel}] ${a.name}</option>`;
      })
      .join('');

    const uuid = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('VAGABOND.Actor.Party.Card.AddMember'),
        icon: 'fas fa-user-plus',
      },
      content: `<div class="form-group">
        <label>${game.i18n.localize('VAGABOND.Actor.Party.Card.PickMember')}</label>
        <select name="actor-uuid" autofocus>${options}</select>
      </div>`,
      buttons: [{
        action: 'add',
        label: game.i18n.localize('VAGABOND.Actor.Party.Card.Add'),
        icon: 'fas fa-plus',
        callback: (_ev, _btn, dialog) => dialog.element.querySelector('[name="actor-uuid"]').value,
      }],
      close: () => null,
    });

    if (uuid) await this._addMember(uuid);
  }

  /**
   * Attach debounced change listeners to journal-backed prose-mirror editors
   * (GM notes and personal notes). These editors don't use collaborate mode to
   * avoid timing issues with freshly-created journal pages and form conflicts.
   * @param {AbortSignal} signal
   * @private
   */
  _bindNotesActions(signal) {
    for (const editor of this.element.querySelectorAll('prose-mirror[data-page-uuid]')) {
      const pageUuid = editor.dataset.pageUuid;
      if (!pageUuid) continue;

      const doSave = async () => {
        try {
          const page = await fromUuid(pageUuid);
          if (page) await page.update({ 'text.content': editor.value ?? '' });
        } catch (err) {
          console.error('Vagabond | Notes: failed to save note:', err);
        }
      };

      // Debounced save while typing (auto-save after a brief pause)
      const debouncedSave = foundry.utils.debounce(doSave, 500);
      editor.addEventListener('change', debouncedSave, { signal });
    }
  }

  /** @override */
  async close(options) {
    PartyStatusHelper.closeAll();
    this._listenerController?.abort();
    this._listenerController = null;
    if (this._actorUpdateHookId) {
      Hooks.off('updateActor', this._actorUpdateHookId);
      this._actorUpdateHookId = null;
    }
    if (this._effectHookIds) {
      Hooks.off('createActiveEffect', this._effectHookIds.create);
      Hooks.off('updateActiveEffect', this._effectHookIds.update);
      Hooks.off('deleteActiveEffect', this._effectHookIds.delete);
      this._effectHookIds = null;
    }
    if (this._activePartyHookId) {
      Hooks.off('vagabond.activePartyChanged', this._activePartyHookId);
      this._activePartyHookId = null;
    }
    if (this._notesHookId) {
      Hooks.off('updateJournalEntryPage', this._notesHookId);
      this._notesHookId = null;
    }
    if (this._itemHookIds) {
      Hooks.off('createItem', this._itemHookIds.create);
      Hooks.off('updateItem', this._itemHookIds.update);
      Hooks.off('deleteItem', this._itemHookIds.delete);
      this._itemHookIds = null;
    }
    return super.close(options);
  }
}
