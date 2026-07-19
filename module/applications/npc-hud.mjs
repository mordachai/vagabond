import { RollHandler, NPCActionHandler } from '../sheets/handlers/_module.mjs';
import { VagabondActorSheet } from '../sheets/actor-sheet.mjs';
import { EnrichmentHelper } from '../helpers/enrichment-helper.mjs';
import { VagabondTextParser } from '../helpers/text-parser.mjs';
import { applyHudDisplayPrefs, getHudHealthBar } from '../helpers/hud-display.mjs';
import { bindHudTooltips } from '../helpers/hud-tooltip.mjs';

const { api } = foundry.applications;

/**
 * Floating, draggable, frameless NPC HUD.
 *
 * Sibling of {@link VagabondCharacterHud} but tuned for NPCs, whose data shape
 * is very different from player characters: no luck/mana/studied dice, no
 * equipped weapon/spell slots — the combat surface is the NPC's `actions[]`
 * and `abilities[]` arrays plus its resistances and meta (size/being/zone).
 *
 * Like the PC HUD it is NOT the actor sheet: it is its own ApplicationV2 that
 * exposes `.actor` and `.element` so the existing NPC roll handlers (which only
 * touch those two) can be reused verbatim as their "sheet".
 *
 * Layout:
 *  - Body (always visible): portrait, vitals (HD / HP± / Fatigue± / Morale),
 *    speed + extra speed types, meta badges, armor shield, status icons, and an
 *    always-on info strip (senses + immunity/weakness/status-immunity icons).
 *  - Action chips flow left→right in source order. Clicking an action rolls the
 *    routine to chat (same as the sheet); a chevron below the name opens its
 *    full text in the external panel (above/below).
 *  - Ability chips are GM-only info: clicking the name opens the description
 *    panel. Chat is posted from a bubble button in that panel's header, never
 *    from the chip itself.
 *
 * One instance per token (keyed by token uuid for unlinked actors, else actor
 * id) — so several unlinked copies of the same NPC (e.g. 3 identical goblins)
 * each get their own independent HUD instead of collapsing into one.
 */
export class VagabondNPCHud extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  /** @type {Map<string, VagabondNPCHud>} */
  static #instances = new Map();

  /** Instance key for an actor: token uuid when unlinked, else actor id. */
  static _keyFor(actor) {
    return actor?.isToken ? actor.token.uuid : actor?.id;
  }

  /** Re-apply per-user display prefs to every open NPC HUD (no reopen). */
  static refreshDisplayPrefs() {
    for (const hud of VagabondNPCHud.#instances.values()) {
      if (hud.rendered && hud.element) applyHudDisplayPrefs(hud.element);
    }
  }

  /** Close every open NPC HUD. */
  static closeAll() {
    for (const hud of [...VagabondNPCHud.#instances.values()]) {
      if (hud.rendered) hud.close();
    }
  }

  /** Instance key of the single selection-driven (auto-opened) HUD, or null. */
  static #autoOpenedKey = null;

  /** Minimum ownership a user needs over a token for it to auto-open its HUD. */
  static AUTO_OPEN_MIN_OWNERSHIP = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;

  #hookIds = [];
  #ctrl = null;
  #redrawTimer = null;
  /** Currently open detail `{ type:'action'|'ability', index }`, or null. */
  _activeDetail = null;
  /** Latched fixed-position coords { left, top }; survives re-renders. */
  #pos = null;

  /* -------------------------------------------- */
  /*  Construction                                */
  /* -------------------------------------------- */

  constructor(actor, options = {}) {
    const key = VagabondNPCHud._keyFor(actor);
    super(foundry.utils.mergeObject({ id: `vbd-npc-hud-${key.replace(/\W/g, '-')}` }, options));
    this.actor = actor;
    this.key = key;
    /** Token placeable this HUD was opened for; drives the portrait image. */
    this.token = options.token ?? null;
    // Reuse the same handlers the NPC sheet uses. They only read .actor / .element.
    this.rollHandler = new RollHandler(this, { npcMode: true });
    this.actionHandler = new NPCActionHandler(this);
    // NPCActionHandler.* sets this on some paths (recharge-from-text); keep it defined.
    this._isDirty = false;
  }

  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'vbd-hud', 'vbd-hud--npc'],
    window: {
      frame: false,
      positioned: true,
    },
    position: {
      width: 'auto',
      height: 'auto',
    },
    actions: {
      // Delegated NPC rolls / routines (reuse VagabondActorSheet statics verbatim)
      clickActionName: this._onClickActionName,
      clickActionDamageRoll: this._onClickActionDamageRoll,
      clickAbilityName: this._onClickAbilityName,
      rollMorale: this._onRollMorale,
      rollAppearing: this._onRollAppearing,
      statusClick: this._onStatusClick,
      createCountdownFromRecharge: this._onCreateCountdownFromRecharge,
      rollRechargeCountdown: this._onRollRechargeCountdown,
      // HUD-local UI
      openDetail: this._onOpenDetail,
      closeDetail: this._onCloseDetail,
      openSheet: this._onOpenSheet,
    },
  };

  static PARTS = {
    hud: { template: 'systems/vagabond/templates/apps/npc-hud.hbs' },
  };

  /* -------------------------------------------- */
  /*  Static open / toggle helpers                */
  /* -------------------------------------------- */

  /** Resolve the actor a no-argument open should target: the controlled token. */
  static resolveActor() {
    const controlled = canvas.tokens?.controlled ?? [];
    return controlled.find(t => t.actor?.type === 'npc')?.actor ?? null;
  }

  /**
   * Open (or focus) the NPC HUD for an actor. Resolves the actor when omitted.
   * @param {Actor|null} actor
   * @param {object}  [opts]
   * @param {boolean} [opts.auto]  Mark this as the selection-driven HUD.
   */
  static open(actor = null, { auto = false, token = null } = {}) {
    actor ??= this.resolveActor();
    if (!actor) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NoActor'));
      return null;
    }
    if (actor.type !== 'npc') {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Hud.NotNPC'));
      return null;
    }
    // Resolve the token whose image drives the portrait: explicit > controlled-of-this-actor > first active.
    token ??= canvas.tokens?.controlled?.find(t => t.actor === actor)
      ?? actor.getActiveTokens(true)[0]
      ?? null;
    const key = this._keyFor(actor);
    let hud = this.#instances.get(key);
    if (!hud) {
      hud = new this(actor, { token });
      this.#instances.set(key, hud);
    } else if (token) {
      hud.token = token; // follow the newly-selected token of the same actor
    }
    if (auto) this.#autoOpenedKey = key;
    hud.render({ force: true });
    return hud;
  }

  /** Toggle the NPC HUD for an actor (resolves when omitted). */
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
  /*  Selection-driven (auto-open) follow logic   */
  /* -------------------------------------------- */

  /**
   * Open/close the NPC HUD to follow the controlled token. Mirrors the PC HUD's
   * follow-selection logic but only matches NPC actors, so the two HUD types
   * never fight over the same single-token selection.
   */
  static syncToSelection() {
    if (!game.settings.get('vagabond', 'hudAutoOpenOnSelect')) {
      this.#closeAuto();
      return;
    }

    const controlled = canvas.tokens?.controlled ?? [];
    const token = (controlled.length === 1) ? controlled[0] : null;
    const actor = token?.actor ?? null;
    const eligible = !!actor
      && actor.type === 'npc'
      && actor.testUserPermission(game.user, this.AUTO_OPEN_MIN_OWNERSHIP);

    if (!eligible) { this.#closeAuto(); return; }
    const key = this._keyFor(actor);
    if (key === this.#autoOpenedKey) {
      // Same instance already showing — but a different token of it may be selected; follow it.
      const hud = this.#instances.get(key);
      if (hud?.rendered && token && hud.token !== token) {
        hud.token = token;
        hud.render();
      }
      return;
    }

    this.#closeAuto();
    this.open(actor, { auto: true, token });
  }

  /** Close the current selection-driven HUD, if any. */
  static #closeAuto() {
    const key = this.#autoOpenedKey;
    if (!key) return;
    this.#autoOpenedKey = null;
    const hud = this.#instances.get(key);
    if (hud?.rendered) hud.close();
  }

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const actor = this.actor;
    const sys = actor.system;
    const config = CONFIG.VAGABOND;
    const L = (k) => (k ? game.i18n.localize(k) : '');

    // Portrait uses the token image (so multiple tokens of one NPC each show their own art).
    // Fall back to the prototype token, then the actor portrait.
    const tokenForImg = (this.token?.actor === actor) ? this.token : actor.getActiveTokens(true)[0];
    const tokenImg = tokenForImg?.document?.texture?.src ?? actor.prototypeToken?.texture?.src;

    const context = {
      actor,
      system: sys,
      config,
      name: actor.name,
      img: tokenImg || actor.img,
    };

    // --- Vitals ---
    context.hd = sys.hd ?? 0;
    context.hp = { value: sys.health?.value ?? 0, max: sys.health?.max ?? 0 };
    context.hpBar = getHudHealthBar(context.hp.value, context.hp.max);
    context.fatigue = { value: sys.fatigue ?? 0, max: sys.fatigueMax ?? 5 };
    context.morale = sys.morale ?? null;
    context.armor = sys.armor ?? 0;

    // --- Speed (base + extra movement types) ---
    // Speed is normally a plain number; guard in case a speed.bonus AE corrupted it to an object.
    context.speed = (typeof sys.speed === 'number' ? sys.speed : (sys.speed?.base ?? 0)) || 0;
    context.speedTypes = (sys.speedTypes ?? []).map((type) => ({
      label: L(config.speedTypes?.[type]),
      value: sys.speedValues?.[type] || 0,
    }));

    // --- Meta badges (zone / size / being type) ---
    context.zone = sys.zone ? L(config.combatZones?.[sys.zone]) : null;
    context.size = L(config.sizes?.[sys.size]);
    context.beingType = L(config.beingTypes?.[sys.beingType]);

    // --- # Appearing (clickable button triggers rollAppearing) ---
    context.appearing = sys.appearing || '';

    // --- Always-on info strip: senses + resistances ---
    context.senses = sys.senses || '';
    context.immunities = (sys.immunities ?? []).map((k) => ({
      icon: config.damageTypeIcons?.[k], label: L(config.damageTypes?.[k]),
    }));
    context.weaknesses = (sys.weaknesses ?? []).map((k) => ({
      icon: config.damageTypeIcons?.[k], label: L(config.allWeaknessTypes?.[k]),
    }));
    context.statusImmunities = (sys.statusImmunities ?? []).map((k) => ({
      icon: config.statusConditionIcons?.[k], label: L(config.statusConditions?.[k]),
    }));
    context.hasInfoStrip = !!(context.senses || context.immunities.length
      || context.weaknesses.length || context.statusImmunities.length);

    // --- Status effect icons (portrait overlay) ---
    context.statusEffects = actor.effects
      .filter(e => !e.disabled)
      .map(e => ({ id: e.id, uuid: e.uuid, name: e.name || 'Unknown', icon: e.img || 'icons/svg/aura.svg' }));

    // --- Actions & abilities (enriched; index = original source index) ---
    const ec = { actions: sys.actions ?? [] };
    await EnrichmentHelper.enrichActions(ec, actor);
    context.actions = (ec.enrichedActions ?? [])
      .map((a, index) => this._actionChip(a, index, config, L))
      .filter(a => a.name);

    const ab = { abilities: foundry.utils.deepClone(sys.abilities ?? []) };
    await EnrichmentHelper.enrichAbilities(ab, actor);
    context.abilities = ab.abilities
      .map((a, index) => ({ index, name: a.name, enrichedDescription: a.enrichedDescription || '', hasDetail: !!a.description }))
      .filter(a => a.name);

    // --- Description (book-open toggle by the name → opens in the detail panel) ---
    const rawDesc = sys.description || '';
    context.hasDescription = !!rawDesc;
    if (rawDesc) {
      try {
        const parsed = VagabondTextParser.parseAll(rawDesc);
        context.descriptionEnriched = await foundry.applications.ux.TextEditor.implementation.enrichHTML(parsed, {
          secrets: actor.isOwner,
          rollData: actor.getRollData(),
          relativeTo: actor,
        });
      } catch (e) {
        console.error('Vagabond | NPC HUD: error enriching description:', e);
        context.descriptionEnriched = rawDesc;
      }
    }

    // --- Active detail (panel content) ---
    context.detail = this._resolveDetail(context);
    context.panelOpen = !!context.detail;

    return context;
  }

  /** Flatten an enriched action into a chip + detail render object. */
  _actionChip(action, index, config, L) {
    const dt = action.damageType;
    const hasType = dt && dt !== '-';
    const statuses = (action.causedStatuses ?? [])
      .filter(s => s.statusId)
      .map(s => ({
        icon: config.statusConditionIcons?.[s.statusId],
        label: L(config.statusConditions?.[s.statusId]),
        save: s.saveType && s.saveType !== 'none' ? s.saveType : null,
      }));
    return {
      index,
      name: action.name,
      flatDamage: action.flatDamage || '',
      rollDamage: action.rollDamage || '',
      hasRollDamage: !!action.rollDamage,
      damageTypeIcon: hasType ? config.damageTypeIcons?.[dt] : null,
      damageTypeLabel: hasType ? L(config.damageTypes?.[dt]) : null,
      note: action.note || '',
      recharge: action.recharge || '',
      rechargeFormatted: action.rechargeFormatted || '',
      rechargeCountdownId: action.rechargeCountdownId || null,
      extraInfoFormatted: action.extraInfoFormatted || '',
      statuses,
      hasDetail: !!(action.extraInfoFormatted || statuses.length || action.note || action.recharge),
    };
  }

  /** Build the panel detail object from `_activeDetail`, or null. */
  _resolveDetail(context) {
    const d = this._activeDetail;
    if (!d) return null;
    if (d.type === 'action') {
      const a = context.actions.find(x => x.index === d.index);
      return a ? { type: 'action', ...a } : null;
    }
    if (d.type === 'description') {
      return context.hasDescription
        ? { type: 'description', name: context.name, enrichedDescription: context.descriptionEnriched }
        : null;
    }
    const b = context.abilities.find(x => x.index === d.index);
    return b ? { type: 'ability', ...b } : null;
  }

  /* -------------------------------------------- */
  /*  Render lifecycle                            */
  /* -------------------------------------------- */

  _onRender(context, options) {
    this.#ctrl?.abort();
    this.#ctrl = new AbortController();
    const { signal } = this.#ctrl;

    this._registerHooks();

    bindHudTooltips(this.element, signal);

    // Per-user accessibility prefs (dark bg / blur / font scale).
    applyHudDisplayPrefs(this.element);

    this.setPosition();
    this._applyPanelPlacement();
    requestAnimationFrame(() => { this.setPosition(); this._applyPanelPlacement(); });

    // Drag handle: portrait moves the HUD.
    const handle = this.element.querySelector('.vh-drag');
    if (handle) handle.addEventListener('pointerdown', (e) => this._onDragStart(e), { signal });

    // Double-click portrait → open the actor sheet (HUD stays open).
    const portrait = this.element.querySelector('.vh-npc-portrait');
    if (portrait) portrait.addEventListener('dblclick', () => this.actor.sheet.render(true), { signal });

    // Right-click portrait → HUD context menu (sheet / ping / close).
    if (handle) handle.addEventListener('contextmenu', (e) => this._openHudMenu(e), { signal });

    // Status icons (left of portrait): right-click → Send to Chat / Remove Status.
    // Reuse the sheet's exact menu — left-click chat is handled by the statusClick action.
    VagabondActorSheet.prototype._setupStatusIconListeners.call(this);

    // HP — left −1 / right +1.
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

    // Right-click an action/ability chip → context menu (post to chat / roll dmg / read / sheet).
    for (const chip of this.element.querySelectorAll('.vh-chip')) {
      chip.addEventListener('contextmenu', (e) => this._openChipMenu(e, chip), { signal });
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
    // Fatigued status auto-toggle handled centrally by the updateActor hook in vagabond.mjs
    this.actor.update({ 'system.fatigue': val });
  }

  /* -------------------------------------------- */
  /*  Drag + position persistence (per user)      */
  /* -------------------------------------------- */

  _savedPosition() {
    const stored = (game.user.getFlag('vagabond', 'npcHudPosition') ?? {})[this.key];
    return (stored?.left != null && stored?.top != null)
      ? { left: stored.left, top: stored.top }
      : null;
  }

  /** Force `position: fixed` with explicit inline coords (frameless V2 has no shell). */
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
    const all = foundry.utils.deepClone(game.user.getFlag('vagabond', 'npcHudPosition') ?? {});
    all[this.key] = { left: Math.round(this.#pos.left), top: Math.round(this.#pos.top) };
    await game.user.setFlag('vagabond', 'npcHudPosition', all);
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
      Hooks.on('createActiveEffect', redraw),
      Hooks.on('updateActiveEffect', redraw),
      Hooks.on('deleteActiveEffect', redraw),
    );
  }

  /** Coalesced re-render (plain timeout so the trailing render always fires). */
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
    if (VagabondNPCHud.#autoOpenedKey === this.key) {
      VagabondNPCHud.#autoOpenedKey = null;
    }
    VagabondNPCHud.#instances.delete(this.key);
    return super.close({ animate: false, ...options });
  }

  /* -------------------------------------------- */
  /*  Sheet-shim for reused handlers              */
  /* -------------------------------------------- */

  /** Some reused statics resolve an embedded doc; NPCs use array indices, so unused. */
  _getEmbeddedDocument(target) {
    const id = target?.dataset?.itemId ?? target?.closest?.('[data-item-id]')?.dataset.itemId;
    return id ? this.actor.items.get(id) : null;
  }

  /* -------------------------------------------- */
  /*  Action handlers — delegated NPC routines    */
  /* -------------------------------------------- */

  static _onClickActionName(event, target) { return VagabondActorSheet._onClickActionName.call(this, event, target); }
  static _onClickActionDamageRoll(event, target) { return VagabondActorSheet._onClickActionDamageRoll.call(this, event, target); }
  static _onClickAbilityName(event, target) { return VagabondActorSheet._onClickAbilityName.call(this, event, target); }
  static _onRollMorale(event, target) { return VagabondActorSheet._onRollMorale.call(this, event, target); }
  static _onRollAppearing(event, target) { return VagabondActorSheet._onRollAppearing.call(this, event, target); }
  static _onStatusClick(event, target) { return VagabondActorSheet._onStatusClick.call(this, event, target); }
  static _onCreateCountdownFromRecharge(event, target) { return VagabondActorSheet._onCreateCountdownFromRecharge.call(this, event, target); }
  static _onRollRechargeCountdown(event, target) { return VagabondActorSheet._onRollRechargeCountdown.call(this, event, target); }

  /* -------------------------------------------- */
  /*  Action handlers — HUD-local UI              */
  /* -------------------------------------------- */

  /** Chevron → open/switch/close the external detail panel for an action/ability. */
  static _onOpenDetail(event, target) {
    event.preventDefault();
    const type = target.dataset.detailType;
    const index = parseInt(target.dataset.index);
    const same = this._activeDetail && this._activeDetail.type === type && this._activeDetail.index === index;
    this._activeDetail = same ? null : { type, index };
    this.render();
  }

  /** Close button in the panel header → clear the active detail. */
  static _onCloseDetail(event) {
    event.preventDefault();
    this._activeDetail = null;
    this.render();
  }

  /** Open the actor sheet without closing the HUD. */
  static _onOpenSheet() { this.actor.sheet.render(true); }

  /**
   * Right-click an action/ability chip → context menu mirroring the PC HUD's
   * slot menu: post to chat (roll routine), roll damage, read text, open sheet.
   * @param {Event} event
   * @param {HTMLElement} chip
   */
  _openChipMenu(event, chip) {
    event.preventDefault();
    event.stopPropagation();
    const { ContextMenuHelper } = globalThis.vagabond.utils;
    const L = (k) => game.i18n.localize(k);
    const isAction = chip.classList.contains('vh-chip--action');
    const index = parseInt(chip.dataset.index);
    if (isNaN(index)) return;

    const ds = { dataset: { index: String(index) } };
    const items = [{
      label: L('VAGABOND.Hud.Menu.SendToChat'),
      icon: 'fas fa-comment',
      action: () => (isAction
        ? VagabondActorSheet._onClickActionName.call(this, event, ds)
        : VagabondActorSheet._onClickAbilityName.call(this, event, ds)),
    }];

    if (isAction && this.actor.system.actions?.[index]?.rollDamage) {
      items.push({
        label: L('VAGABOND.Hud.Menu.RollDamage'),
        icon: 'fas fa-dice-d20',
        action: () => VagabondActorSheet._onClickActionDamageRoll.call(this, event, ds),
      });
    }

    items.push({
      label: L('VAGABOND.Hud.Menu.Read'),
      icon: 'fas fa-book-open',
      action: () => {
        this._activeDetail = { type: isAction ? 'action' : 'ability', index };
        this.render();
      },
    });

    items.push({
      label: L('VAGABOND.Hud.OpenSheet'),
      icon: 'fas fa-up-right-from-square',
      action: () => this.actor.sheet.render(true),
    });

    ContextMenuHelper.create({
      position: { x: event.clientX, y: event.clientY },
      items,
      className: 'inventory-context-menu',
    });
  }

  /**
   * HUD-level context menu (right-click portrait): open sheet, ping token, close.
   * @param {Event} event
   */
  _openHudMenu(event) {
    event.preventDefault();
    const { ContextMenuHelper } = globalThis.vagabond.utils;
    const L = (k) => game.i18n.localize(k);
    ContextMenuHelper.create({
      position: { x: event.clientX, y: event.clientY },
      className: 'inventory-context-menu',
      items: [
        { label: L('VAGABOND.Hud.OpenSheet'), icon: 'fas fa-up-right-from-square', action: () => this.actor.sheet.render(true) },
        { label: L('VAGABOND.Hud.Menu.Ping'), icon: 'fas fa-bullseye', action: () => this._pingToken() },
        { label: L('VAGABOND.Hud.Menu.Close'), icon: 'fas fa-xmark', action: () => this.close() },
      ],
    });
  }

  /** Ping (and pan to) the NPC's token on the active scene. */
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
