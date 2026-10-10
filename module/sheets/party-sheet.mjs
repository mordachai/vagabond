import { VagabondActorSheet } from './actor-sheet.mjs';
import { prepareEffectsView } from '../helpers/effects.mjs';
import { TargetHelper } from '../helpers/target-helper.mjs';
import { PartyCompactView } from '../applications/party-compact-view.mjs';
import { PartyStatusHelper } from '../helpers/party-status-helper.mjs';
import { DowntimeHelper, SHIFTS_PER_DAY } from '../helpers/downtime-helper.mjs';
import { ProgressClock } from '../documents/progress-clock.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { buildStatsSection, buildSlotsRow, buildWeaponProperties } from '../helpers/item-sections.mjs';

/** Inventory tab sections, in display order (containers and unknown types fall under `gear`). */
const INVENTORY_GROUPS = ['weapon', 'armor', 'alchemical', 'relic', 'gear'];

/**
 * Party actor sheet.
 * Tabs: Party (member cards for characters + NPCs), Inventory (items per Character), Notes, Effects.
 * All users with party permission see both tabs.
 * The compact-view button is GM-only (enforced in the template via isGM).
 */
export class VagabondPartySheet extends VagabondActorSheet {
  constructor(object, options) {
    super(object, options);
    this._listenerController = null;
    this._actorUpdateHookId = null;
    this._effectHookIds = null;
    this._notesHookId = null;
    this._itemHookIds = null;
    /** UUIDs of the inventory items whose detail accordion is open (survives re-renders). */
    this._invOpen = new Set();
    this._removeMode = false;
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
      const { emitSocket } = await import('../helpers/socket-helper.mjs');
      emitSocket('updateActorField', { actorUuid: actor.uuid, field, value });
    }
  }

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

    // Speed / Crawl / Travel: manual override or automatic (slowest member)
    context.speeds = this._speedsView();

    // Aggregate supplies across all members (characters only)
    context.supplies = this._aggregateSupplies(context.members);

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

    // Rations / Beverages stored in the party's own containers count too
    const stored = this._containerSupplyRows();
    totals.rations += stored.reduce((n, r) => n + r._supplyRations, 0);
    totals.beverages += stored.reduce((n, r) => n + r._supplyBeverages, 0);

    // Hover breakdowns (per character member, then per party container). Wealth breakdown is GM-only.
    const characters = members.filter(m => !m.isNPC);
    totals.rationsTooltip = this._supplyBreakdownHtml(
      'VAGABOND.Actor.Party.Card.Rations', [...characters, ...stored], m => [m._supplyRations ?? 0]);
    totals.beveragesTooltip = this._supplyBreakdownHtml(
      'VAGABOND.Actor.Party.Card.Beverages', [...characters, ...stored], m => [m._supplyBeverages ?? 0]);
    if (game.user.isGM) {
      const abbr = key => game.i18n.localize(`VAGABOND.Currency.${key}.abbr`);
      totals.currencyTooltip = this._supplyBreakdownHtml(
        'VAGABOND.Actor.Party.Card.TotalWealth', characters,
        m => [m.currency.gold, m.currency.silver, m.currency.copper],
        [abbr('Gold'), abbr('Silver'), abbr('Copper')]);
    }
    return totals;
  }

  /**
   * One row per party Container item with the Rations / Beverages stored inside it
   * (a container's contents are item snapshots in `system.items`, not embedded items).
   * @returns {{name: string, _supplyRations: number, _supplyBeverages: number}[]}
   * @private
   */
  _containerSupplyRows() {
    const count = (contents, flag) => (contents ?? [])
      .filter(data => data?.type === 'equipment' && data.system?.[flag])
      .reduce((n, data) => n + (Number(data.system.quantity ?? 1) || 0), 0);
    return this.actor.items
      .filter(item => item.type === 'container')
      .map(item => ({
        name: item.name,
        _supplyRations: count(item.system.items, 'isSupply'),
        _supplyBeverages: count(item.system.items, 'isBeverage'),
      }));
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
   * Build the ownership object for a note journal / page.
   * Personal notes: OWNER for every user who owns the character + NONE default.
   * GM notes:       NONE default (GMs are implicit owners).
   * @param {'gm'|'personal'} noteType
   * @param {string|null} characterId
   * @returns {Object}
   * @private
   */
  _buildNoteOwnership(noteType, characterId) {
    const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    if (noteType === 'personal') {
      const actor = game.actors.get(characterId);
      if (actor) {
        for (const user of game.users) {
          if (actor.getUserLevel(user) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
            ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
          }
        }
      }
    }
    return ownership;
  }

  /**
   * Resolve an existing note journal from flags, or create one (GM only).
   * Both the JournalEntry AND its first JournalEntryPage receive the same
   * ownership object — Foundry checks the PAGE's own ownership when deciding
   * whether a player may update it; inheriting from the parent is not enough.
   * @param {'gm'|'personal'} noteType
   * @param {string|null} characterId  Actor id for personal notes.
   * @returns {Promise<JournalEntry|null>}
   * @private
   */
  async _resolveNoteJournal(noteType, characterId = null) {
    const flagKey = noteType === 'gm' ? 'notes.gm' : `notes.personal.${characterId}`;

    // Return existing journal if the UUID is still valid
    const existingUuid = this.document.getFlag('vagabond', flagKey);
    if (existingUuid) {
      try {
        const journal = await fromUuid(existingUuid);
        if (journal) {
          // Auto-repair: journals created before page ownership was stamped.
          // The GM client runs this check once; the early-out makes repeat renders
          // cheap (no network call when ownership is already correct).
          if (game.user.isGM && noteType === 'personal') {
            await this._repairPageOwnership(journal, characterId);
          }
          return journal;
        }
      } catch { /* stale UUID — fall through to recreate */ }
    }

    // Only GMs can create journal documents
    if (!game.user.isGM) return null;

    const ownership = this._buildNoteOwnership(noteType, characterId);
    const folder = await this._ensureNotesFolder();

    const name = noteType === 'gm'
      ? `[GM] ${this.document.name} — Notes`
      : `[Personal] ${game.actors.get(characterId)?.name ?? characterId} — Notes`;

    const journal = await JournalEntry.create({
      name,
      ownership,
      folder: folder?.id ?? null,
      flags: {
        vagabond: {
          isPartyNote: true,
          partyId: this.document.id,
          noteType,
          characterId: characterId ?? null,
        },
      },
      pages: [{
        name: 'Notes',
        type: 'text',
        // Mirror journal ownership onto the page — the server permission check
        // uses the page's own ownership, not the parent journal's.
        ownership: { ...ownership },
        text: { content: '', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
      }],
    });

    await this.document.setFlag('vagabond', flagKey, journal.uuid);
    return journal;
  }

  /**
   * Ensure the first page of a personal-note journal has the correct ownership.
   * Called by the GM only. No-ops immediately when ownership is already correct.
   * @param {JournalEntry} journal
   * @param {string} characterId
   * @returns {Promise<void>}
   * @private
   */
  async _repairPageOwnership(journal, characterId) {
    const page = journal.pages.contents[0];
    if (!page) return;
    const required = this._buildNoteOwnership('personal', characterId);
    const needsFix = Object.entries(required).some(
      ([uid, level]) => (page.ownership?.[uid] ?? page.ownership?.default ?? 0) < level
    );
    if (!needsFix) return;
    await page.update({ ownership: { ...(page.ownership ?? {}), ...required } });
  }

  /**
   * Get or create the hidden Party Notes folder.
   * @returns {Promise<Folder|null>}
   * @private
   */
  async _ensureNotesFolder() {
    const existing = game.folders.find(
      f => f.type === 'JournalEntry' && f.flags?.vagabond?.isPartyNotesFolder
    );
    if (existing) return existing;

    return Folder.create({
      name: 'Party Notes',
      type: 'JournalEntry',
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE },
      flags: { vagabond: { isPartyNotesFolder: true } },
    });
  }

  /** @override */
  async _preparePartContext(partId, context) {
    const partContext = await super._preparePartContext(partId, context);
    if (partId === 'party') {
      partContext.tab = context.tabs[partId];
    } else if (partId === 'inventory') {
      partContext.tab = context.tabs[partId];
      partContext.inventoryCards = this._inventoryCards();
      partContext.containers = this._containerChips();
      partContext.canEditContainers = this.actor.isOwner;
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
    this._actorUpdateHookId = Hooks.on('updateActor', () => {
      this.render(false, { parts: ['party'] });
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
    // ...and so do the party's own container items (the sleeve at the top of the tab)
    const onMemberItem = (item) => {
      const parentUuid = item.parent?.uuid;
      if (!parentUuid) return;
      if (parentUuid === this.actor.uuid || this.actor.system.members?.includes(parentUuid)) refreshInventory();
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
          const { VagabondChatCard } = globalThis.vagabond.utils;
          await VagabondChatCard.statusEffect(actor, effect);
        }, { signal });
      });

    // Compact view button (GM only — enforced in template, but safe to bind here)
    this.element
      .querySelectorAll('[data-action="openCompactView"]')
      .forEach(btn => {
        btn.addEventListener('click', () => PartyCompactView.open(this.actor), { signal });
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
          const { VagabondChatCard } = globalThis.vagabond.utils;
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
          const { VagabondChatCard } = globalThis.vagabond.utils;
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
    on('toggleSpeedSource', () => {
      if (!this.isEditable) return;
      this.actor.update({ 'system.speedSource': this._speedSource() === 'container' ? 'party' : 'container' });
    });

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
    on('openContainer', (el) => fromUuidSync(el.closest('[data-item-uuid]')?.dataset.itemUuid)?.sheet?.render(true));
    on('deleteContainer', (el) => this._deleteContainer(el.closest('[data-item-uuid]')?.dataset.itemUuid));

    // Containers sleeve: lit while a drag hovers it (the drop itself goes through _onDropItem)
    this.element.querySelectorAll('.party-containers').forEach((zone) => {
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
      const { LevelUpDialog } = globalThis.vagabond.applications;
      new LevelUpDialog(actor).render(true);
    });
  }

  /**
   * Inventory tab data: one card per Character with its items grouped by type
   * (Weapon, Armor, Alchemical, Relic, Gear). Slots and Value are for the whole stack.
   * @returns {Object[]}
   */
  _inventoryCards() {
    const cards = [];
    for (const uuid of this.actor.system.members ?? []) {
      let member = null;
      try { member = fromUuidSync(uuid); } catch { member = null; }
      if (member?.type !== 'character') continue;

      const buckets = Object.fromEntries(INVENTORY_GROUPS.map((key) => [key, []]));
      for (const item of member.items) {
        if (item.type !== 'equipment' && item.type !== 'container') continue;
        const type = item.system.equipmentType;
        const key = INVENTORY_GROUPS.includes(type) ? type : 'gear';
        const quantity = Math.max(0, Number(item.system.quantity ?? 1));
        buckets[key].push({
          uuid: item.uuid,
          name: item.name,
          img: item.img,
          quantity,
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

      cards.push({
        uuid: member.uuid,
        name: member.name,
        img: member.img,
        slotsUsed: member.system.inventory?.occupiedSlots ?? 0,
        slotsTotal: member.system.inventory?.maxSlots ?? 0,
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

  /** The party's own Container items, for the sleeve at the top of the Inventory tab. */
  _containerChips() {
    return this.actor.items
      .filter((item) => item.type === 'container')
      .map((item) => ({
        uuid: item.uuid,
        name: item.name,
        img: item.img,
        used: item.system.currentCapacity ?? 0,
        capacity: item.system.capacity ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Remove one of the party's containers (with its contents) after a confirmation. */
  async _deleteContainer(uuid) {
    if (!uuid || !this.actor.isOwner) return;
    const item = fromUuidSync(uuid);
    if (!item || item.parent?.uuid !== this.actor.uuid) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: item.name },
      content: `<p>${game.i18n.format('VAGABOND.Actor.Party.Inventory.Containers.DeleteConfirm', { name: foundry.utils.escapeHTML(item.name) })}</p>`,
    });
    if (confirmed) await item.delete();
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

  /** Where the automatic speeds come from: the slowest member (`party`) or the party's container. */
  _speedSource() {
    return this.actor.system.speedSource === 'container' ? 'container' : 'party';
  }

  /**
   * Speeds set on the party's Container items (a wagon, a mount…): per field the slowest
   * container that sets one (> 0), null when none does.
   * @returns {{speed: number|null, crawl: number|null, travel: number|null}}
   */
  _containerSpeeds() {
    const slowest = { speed: null, crawl: null, travel: null };
    for (const item of this.actor.items) {
      if (item.type !== 'container') continue;
      for (const field of Object.keys(slowest)) {
        const value = Number(item.system[field]);
        if (value > 0 && (slowest[field] === null || value < slowest[field])) slowest[field] = value;
      }
    }
    return slowest;
  }

  /**
   * Automatic party speeds: the slowest member's value for each field, or - while the
   * speed source is the container - the container's own speeds (members' value where it sets none).
   * Characters supply Speed / Crawl / Travel; NPCs only their Speed (0 = stationary, ignored).
   * Read synchronously at render / submit time, so it follows every member's current value.
   * @returns {{speed: number, crawl: number, travel: number}}
   */
  _autoSpeeds() {
    const slowest = { speed: null, crawl: null, travel: null };
    const take = (field, value) => {
      if (!Number.isFinite(value)) return;
      if (slowest[field] === null || value < slowest[field]) slowest[field] = value;
    };
    for (const uuid of this.actor.system.members ?? []) {
      let member = null;
      try { member = fromUuidSync(uuid); } catch { member = null; }
      if (member?.type === 'character') {
        take('speed', Number(member.system.speed?.base));
        take('crawl', Number(member.system.speed?.crawl));
        take('travel', Number(member.system.speed?.travel));
      } else if (member?.type === 'npc') {
        const speed = Number(member.system.speed);
        if (speed > 0) take('speed', speed);
      }
    }
    const carried = this._speedSource() === 'container' ? this._containerSpeeds() : {};
    return {
      speed: carried.speed ?? slowest.speed ?? 0,
      crawl: carried.crawl ?? slowest.crawl ?? 0,
      travel: carried.travel ?? slowest.travel ?? 0,
    };
  }

  /**
   * Party speeds as shown: a stored value (> 0) is a manual override, 0 follows the
   * automatic source (`auto: true`). Also carries the source switch's state and tooltips.
   */
  _speedsView() {
    const auto = this._autoSpeeds();
    const fromContainer = this._speedSource() === 'container';
    const view = {
      fromContainer,
      sourceTooltip: this._controlsText(fromContainer ? 'SpeedSourceContainer' : 'SpeedSourceParty'),
      autoTooltip: this._controlsText(fromContainer ? 'SpeedAutoContainer' : 'SpeedAuto'),
    };
    for (const field of ['speed', 'crawl', 'travel']) {
      const manual = Number(this.actor.system[field]) || 0;
      view[field] = manual > 0
        ? { value: manual, auto: false }
        : { value: auto[field], auto: true };
    }
    return view;
  }

  /**
   * Typing the automatic value again (or clearing the field) hands the speed back to
   * automatic, stored as 0; any other value is kept as a manual override.
   * @override
   */
  async _processSubmitData(event, form, submitData) {
    const auto = this._autoSpeeds();
    for (const field of ['speed', 'crawl', 'travel']) {
      const path = `system.${field}`;
      const nested = foundry.utils.hasProperty(submitData, path);
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
      globalThis.vagabond.applications.DowntimeApp.open(own);
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

    const { LevelUpDialog } = globalThis.vagabond.applications;
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
   * Handle dropping an actor onto the party sheet — adds them as a member.
   * Only accepts character and npc actors.
   * @param {DragEvent} event
   * @param {Object} data
   * @override
   */
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;
    const uuid = data.uuid;
    if (!uuid) return false;
    try {
      const actor = await fromUuid(uuid);
      // Only world actors (not compendium actors — actor.pack would be set for those)
      if (!actor || actor.pack || (actor.type !== 'character' && actor.type !== 'npc')) return false;
    } catch {
      return false;
    }
    await this._addMember(uuid);
    return true;
  }

  /**
   * Only Container items can be dropped on the party (they land in the Inventory
   * tab's sleeve). A container dragged from another Actor you own is moved, not copied.
   * @param {DragEvent} event
   * @param {Object} data
   * @override
   */
  async _onDropItem(event, data) {
    if (!this.actor.isOwner) return false;
    const item = await Item.implementation.fromDropData(data);
    if (!item) return false;
    if (item.type !== 'container') {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Actor.Party.Inventory.Containers.OnlyContainers'));
      return false;
    }
    if (item.parent?.uuid === this.actor.uuid) return false;

    const created = await this.actor.createEmbeddedDocuments('Item', [item.toObject()]);
    if (created?.length && item.parent?.documentName === 'Actor' && item.parent.isOwner) await item.delete();
    return created;
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
   * When removing a character, moves their personal note journal out of the hidden folder.
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

    // Orphan the character's personal note journal so the GM can find it in the sidebar
    if (actor?.type === 'character') {
      const noteUuid = this.document.getFlag('vagabond', `notes.personal.${actor.id}`);
      if (noteUuid) {
        try {
          const journal = await fromUuid(noteUuid);
          if (journal) await journal.update({ folder: null });
        } catch { /* journal may have been deleted already */ }
        await this.document.unsetFlag('vagabond', `notes.personal.${actor.id}`);
      }
    }

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
