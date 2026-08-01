import { CombatTrackerHelper, DEFAULT_FACTION_ORDER } from '../helpers/combat-tracker-helper.mjs';
import { ContextMenuHelper } from '../helpers/context-menu-helper.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';

const { api } = foundry.applications;

/**
 * Floating, frameless overlay carousel for the active Combat — a companion to
 * the sidebar Combat Tracker, not a replacement. Same underlying data
 * (initiative order, factions, activations) via {@link CombatTrackerHelper},
 * same document methods ({@link VagabondCombat}) for all navigation — this
 * class only owns presentation and drag/flip/double-click interaction.
 *
 * Singleton, same pattern as {@link OngoingPanel}: one instance, toggled via
 * `Hooks.callAll('vagabond.toggleCombatCarousel')`, reactive to Foundry hooks
 * with a debounced re-render.
 */
export class CombatCarousel extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static #instance = null;
  /** Synchronous open/closed flag — `.rendered` doesn't flip until the async
   * render pipeline resolves, which is too late to guard against a scene-tool
   * `onChange` double-fire (a known v13/v14 quirk): two `toggle()` calls
   * landing before the first render finishes would otherwise both see
   * "not rendered" and both call `render()` on the same instance, racing
   * two overlapping renders that produce a duplicate/empty root element. */
  static #isOpen = false;

  #hookIds = [];
  #ctrl = null;
  #renderDebounce = foundry.utils.debounce(() => this.render(), 100);
  /** Combatant ids currently showing their card back. Survives re-render. */
  #flipped = new Set();
  /** Combatant id currently being dragged, or null. */
  #dragId = null;
  /** Faction key currently being dragged (pennant drag), or null. */
  #dragFaction = null;

  static DEFAULT_OPTIONS = {
    id: 'vagabond-combat-carousel',
    classes: ['vagabond', 'vcc-root'],
    window: {
      frame: false,
      positioned: false,
    },
    actions: {
      startStopEncounter: CombatCarousel.#onStartStopEncounter,
      clearMoveHistory: CombatCarousel.#onClearMoveHistory,
      openConfig: CombatCarousel.#onOpenConfig,
      previousRound: CombatCarousel.#onPreviousRound,
      previousTurn: CombatCarousel.#onPreviousTurn,
      nextTurn: CombatCarousel.#onNextTurn,
      nextRound: CombatCarousel.#onNextRound,
      statusClick: CombatCarousel.#onStatusClick,
    },
  };

  static PARTS = {
    carousel: { template: 'systems/vagabond/templates/apps/combat-carousel.hbs' },
  };

  /** Toggle: open if closed, close if open. */
  static toggle() {
    if (CombatCarousel.#isOpen) CombatCarousel.close();
    else CombatCarousel.open();
  }

  /** Open (no-op if already open). */
  static open() {
    if (CombatCarousel.#isOpen) return;
    CombatCarousel.#isOpen = true;
    if (!CombatCarousel.#instance) CombatCarousel.#instance = new CombatCarousel();
    CombatCarousel.#instance.render({ force: true });
  }

  /** Close (no-op if already closed). */
  static close() {
    if (!CombatCarousel.#isOpen) return;
    CombatCarousel.#isOpen = false;
    CombatCarousel.#instance?.close();
  }

  /** Re-render the open instance, if any (e.g. after a settings change). */
  static refresh() {
    if (CombatCarousel.#instance?.rendered) CombatCarousel.#instance.render();
  }

  /**
   * Auto show/hide: the carousel mirrors whether the currently viewed combat
   * has any combatants at all, rather than being purely a manual toggle —
   * appears the moment the first token joins, disappears the moment the last
   * one leaves. Only reacts to the currently viewed combat (`game.combat`);
   * changes on other, non-viewed combats are irrelevant to this client.
   * @param {Combat|null|undefined} combat
   */
  static syncAutoVisibility(combat) {
    if (!combat || combat !== game.combat) return;
    if (combat.combatants.size > 0) CombatCarousel.open();
    else CombatCarousel.close();
  }

  /* -------------------------------------------- */
  /*  Context                                      */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const combat = game.combat;

    context.isGM = game.user.isGM;
    context.hasCombat = !!combat;
    context.started = !!combat?.started;
    context.round = combat?.round ?? 0;
    context.useActivationPoints = game.settings.get('vagabond', 'useActivationPoints');
    context.portraitSize = game.settings.get('vagabond', 'combatCarouselPortraitSize') || 'medium';
    context.revealOtherFactionStats = game.settings.get('vagabond', 'combatCarouselRevealOtherFactionStats');

    const factions = combat
      ? CombatTrackerHelper.buildFactionTurns(combat)
      : CombatTrackerHelper.bucketByFaction([...DEFAULT_FACTION_ORDER], []);

    // Carousel-only enrichment: card-back content (not needed by the sidebar list).
    for (const key of Object.keys(factions)) {
      for (const turn of factions[key].turns) {
        const combatant = combat.combatants.get(turn.id);
        turn.isFlipped = this.#flipped.has(turn.id);
        turn.back = this._buildCardBack(combatant);
        // GM always sees everything; a player always sees their own faction and
        // any combatant they own outright; other factions' HP/Fatigue are gated
        // behind the reveal setting (default hidden).
        turn.canSeeStats = context.isGM || key === 'friendly' || combatant?.actor?.isOwner
          || context.revealOtherFactionStats;
      }
    }
    context.factions = factions;

    return context;
  }

  /**
   * Build the card-back payload — same stat readout as the party sheet's
   * compact view (armor/HP/fatigue/mana/speed/luck), same icons, for both
   * PCs and NPCs. Mana/luck only exist on character actors.
   * @param {Combatant} combatant
   */
  _buildCardBack(combatant) {
    const actor = combatant?.actor;
    if (!actor) return null;
    const sys = actor.system;
    const isCharacter = actor.type === 'character';

    return {
      hp: { value: sys.health?.value ?? 0, max: sys.health?.max ?? 1 },
      fatigue: { value: sys.fatigue ?? 0, max: sys.fatigueMax ?? 5 },
      speed: isCharacter ? (sys.speed?.base ?? 0) : (sys.speed ?? 0),
      hasLuck: isCharacter,
      luck: sys.currentLuck ?? 0,
      hasMana: isCharacter && !!sys.mana,
      mana: {
        current: sys.mana?.current ?? 0,
        max: sys.mana?.max ?? 0,
        isSpellcaster: sys.attributes?.isSpellcaster ?? false,
        isFocusing: (sys.focus?.current ?? 0) > 0,
      },
    };
  }

  /* -------------------------------------------- */
  /*  Rendering / Interaction                      */
  /* -------------------------------------------- */

  _onRender(context, options) {
    // Dynamic root classes live on the real app element (this.element already
    // carries the static .vcc-root/.vagabond from DEFAULT_OPTIONS) — the
    // template's own root is an inert .vcc-part passthrough, see combat-carousel.hbs.
    this.element.classList.toggle('is-gm', context.isGM);
    this.element.classList.toggle('vcc-empty', !context.hasCombat);
    this.element.classList.remove('vcc-size-small', 'vcc-size-medium', 'vcc-size-large');
    this.element.classList.add(`vcc-size-${context.portraitSize}`);

    this.#ctrl?.abort();
    this.#ctrl = new AbortController();
    const { signal } = this.#ctrl;

    // Safety net: ephemeral drag-state CLASSES (is-dragging / is-drop-target /
    // insert-before / insert-after) must never survive a render. This is
    // classes-only, NOT the #dragId/#dragFaction tracking fields — _onRender
    // fires from unrelated hooks (updateActor, active-effect changes, etc.)
    // that can land WHILE a native drag is still actively in progress; wiping
    // the tracking fields there would make the app "forget" mid-drag and the
    // eventual drop silently no-op. Only a genuine drag-end signal (dragend /
    // drop / mouseup below) is allowed to reset those.
    this._clearDragClasses();

    // Belt-and-suspenders: if a drag is released outside any element that
    // handles it (or `dragend` is swallowed), catch it at the window level.
    // MUST be bubble-phase (no `capture`), or this fires before the card/pennant's
    // own `drop` handler reads #dragId/#dragFaction and wipes it out first —
    // that regression is what broke every drop in the first place.
    window.addEventListener('dragend', () => this._clearDragVisuals(), { signal });
    window.addEventListener('drop', () => this._clearDragVisuals(), { signal });

    // A drop released on an invalid target (e.g. cross-faction, or just missed
    // the card by a few px) never fires `drop` anywhere — the browser cancels
    // it outright since nothing called preventDefault() during dragover — so
    // cleanup then depends entirely on `dragend`, which isn't reliable here.
    // `mouseup` always fires on release no matter what the drag state machine
    // decided; deferred one tick so a legitimate drop/dragend (which land
    // first in the same release) still gets to read #dragId before this clears it.
    window.addEventListener('mouseup', () => setTimeout(() => this._clearDragVisuals(), 0), { signal });

    // Restore flip state (rebuilt DOM loses classes, the Set is our memory).
    for (const el of this.element.querySelectorAll('.vcc-card')) {
      if (this.#flipped.has(el.dataset.combatantId)) el.classList.add('is-flipped');
    }

    // Right-click: flip a card. GM may flip any card; players may only flip
    // their own faction's cards (or a combatant they own outright) — other
    // factions' cards must not be flippable by players.
    this.element.addEventListener('contextmenu', (event) => {
      const card = event.target.closest('.vcc-card');
      if (!card) return;
      event.preventDefault();
      if (!this._canFlipCard(card)) return;
      const id = card.dataset.combatantId;
      if (this.#flipped.has(id)) { this.#flipped.delete(id); card.classList.remove('is-flipped'); }
      else { this.#flipped.add(id); card.classList.add('is-flipped'); }
    }, { signal });

    // Double-click: activate that combatant's turn.
    this.element.addEventListener('dblclick', (event) => {
      const card = event.target.closest('.vcc-card');
      if (!card) return;
      this._activateTurn(card.dataset.combatantId);
    }, { signal });

    // Hover-name reveal (GM: always via CSS; players: only their own faction — server-side
    // filtered already by only rendering the reveal-eligible markup, see template).

    this._attachCardDragHandlers(signal);
    this._attachPennantDragHandlers(signal);
    this._attachStatusIconHandlers(signal);
    this._attachBackStatHandlers(signal);

    this._registerHooks();
  }

  /* -------------------------------------------- */
  /*  Card-back HP/Fatigue — clickable like the HUD & sheet                   */
  /*  (left −1 / right +1 for HP, inverse for Fatigue).                       */
  /* -------------------------------------------- */

  /** GM may flip any card; players only their own faction's, or a combatant they own outright. */
  _canFlipCard(card) {
    if (game.user.isGM) return true;
    if (card.dataset.faction === 'friendly') return true;
    const combatant = game.combat?.combatants.get(card.dataset.combatantId);
    return !!combatant?.actor?.isOwner;
  }

  _actorForBackStat(el) {
    const combatantId = el.closest('.vcc-card')?.dataset.combatantId;
    const combatant = combatantId ? game.combat?.combatants.get(combatantId) : null;
    return combatant?.actor ?? null;
  }

  _attachBackStatHandlers(signal) {
    for (const el of this.element.querySelectorAll('.vcc-back-hp')) {
      el.addEventListener('click', (event) => { event.stopPropagation(); this._changeBackHp(el, -1); }, { signal });
      el.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); this._changeBackHp(el, +1); }, { signal });
    }
    for (const el of this.element.querySelectorAll('.vcc-back-fatigue')) {
      el.addEventListener('click', (event) => { event.stopPropagation(); this._changeBackFatigue(el, +1); }, { signal });
      el.addEventListener('contextmenu', (event) => { event.preventDefault(); event.stopPropagation(); this._changeBackFatigue(el, -1); }, { signal });
    }
  }

  _changeBackHp(el, delta) {
    const actor = this._actorForBackStat(el);
    if (!actor || !(game.user.isGM || actor.isOwner)) return;
    const val = Math.clamp((actor.system.health?.value ?? 0) + delta, 0, actor.system.health?.max ?? 0);
    actor.update({ 'system.health.value': val });
  }

  _changeBackFatigue(el, delta) {
    const actor = this._actorForBackStat(el);
    if (!actor || !(game.user.isGM || actor.isOwner)) return;
    const val = Math.clamp((actor.system.fatigue ?? 0) + delta, 0, actor.system.fatigueMax ?? 5);
    actor.update({ 'system.fatigue': val });
  }

  /* -------------------------------------------- */
  /*  Active effect icons — same menu as the actor sheet / HUDs               */
  /* -------------------------------------------- */

  /** Resolve the actor a status icon belongs to via its enclosing card. */
  _actorForStatusIcon(icon) {
    const combatantId = icon.closest('.vcc-card')?.dataset.combatantId;
    const combatant = combatantId ? game.combat?.combatants.get(combatantId) : null;
    return combatant?.actor ?? null;
  }

  static async #onStatusClick(event, target) {
    const actor = this._actorForStatusIcon(target);
    const effectId = target.dataset.effectId;
    const effect = actor?.effects.get(effectId);
    if (!actor || !effect) return;
    await VagabondChatCard.statusEffect(actor, effect);
  }

  /** Right-click a status icon: same two-item menu as the sheet's `_setupStatusIconListeners`. */
  _attachStatusIconHandlers(signal) {
    for (const icon of this.element.querySelectorAll('.vcc-status-icon')) {
      icon.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const actor = this._actorForStatusIcon(icon);
        const effect = actor?.effects.get(icon.dataset.effectId);
        if (!actor || !effect) return;

        const menuItems = [
          {
            label: game.i18n.localize('VAGABOND.ContextMenu.SendToChat'),
            icon: 'fas fa-comment',
            enabled: true,
            action: async () => { await VagabondChatCard.statusEffect(actor, effect); },
          },
          {
            label: game.i18n.localize('VAGABOND.ContextMenu.RemoveStatus'),
            icon: 'fas fa-times',
            enabled: true,
            action: async () => {
              if (actor.isOwner || game.user.isGM) {
                await effect.delete();
              } else {
                const statusId = effect.statuses?.first() || effect.flags?.core?.statusId;
                const { emitSocket } = await import('../helpers/socket-helper.mjs');
                emitSocket('applyStatus', { actorUuid: actor.uuid, statusId, active: false });
              }
            },
          },
        ];

        ContextMenuHelper.create({
          position: { x: event.clientX, y: event.clientY },
          items: menuItems,
          onClose: () => {},
          className: 'status-context-menu',
        });
      }, { signal });
    }
  }

  /** Strip every ephemeral drag-state class. Safe to call on every render. */
  _clearDragClasses() {
    if (!this.element) return;
    for (const el of this.element.querySelectorAll(
      '.vcc-card.is-dragging, .vcc-card.insert-before, .vcc-card.insert-after, '
      + '.vcc-faction-divider.is-dragging, .vcc-faction-divider.is-drop-target'
    )) {
      el.classList.remove('is-dragging', 'is-drop-target', 'insert-before', 'insert-after');
    }
  }

  /**
   * Full drag-end cleanup: classes + the #dragId/#dragFaction tracking fields.
   * Only call this from an actual drag-end signal (dragend/drop/mouseup) —
   * never from _onRender, which can fire mid-drag from unrelated hooks.
   */
  _clearDragVisuals() {
    this.#dragId = null;
    this.#dragFaction = null;
    this._clearDragClasses();
  }

  /* -------------------------------------------- */
  /*  Card reorder (drag within a faction group)   */
  /* -------------------------------------------- */

  _attachCardDragHandlers(signal) {
    const clearInsertMarkers = () => {
      this.element.querySelectorAll('.vcc-card.insert-before, .vcc-card.insert-after')
        .forEach(el => el.classList.remove('insert-before', 'insert-after'));
    };

    for (const card of this.element.querySelectorAll('.vcc-card')) {
      // GM may reorder any faction; players may only reorder their own (friendly)
      // group's turn order — other factions' initiative stays GM-only.
      if (!game.user.isGM && card.dataset.faction !== 'friendly') continue;
      card.draggable = true;

      card.addEventListener('dragstart', (event) => {
        this.#dragId = card.dataset.combatantId;
        card.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', this.#dragId);
      }, { signal });

      card.addEventListener('dragend', () => {
        this.#dragId = null;
        card.classList.remove('is-dragging');
        clearInsertMarkers();
      }, { signal });

      const isValidTarget = () => {
        if (!this.#dragId || this.#dragId === card.dataset.combatantId) return false;
        const dragCard = this.element.querySelector(`.vcc-card[data-combatant-id="${this.#dragId}"]`);
        return dragCard?.dataset.faction === card.dataset.faction; // cross-faction drop ignored
      };

      // Which side of this card the cursor is on decides insert-before vs insert-after.
      const sideFor = (event) => {
        const rect = card.getBoundingClientRect();
        return (event.clientX - rect.left) > rect.width / 2 ? 'after' : 'before';
      };

      const markSide = (event) => {
        clearInsertMarkers();
        card.classList.add(sideFor(event) === 'after' ? 'insert-after' : 'insert-before');
      };

      // dragenter (not just dragover) must call preventDefault for some browsers
      // to accept the drop at all — this was the actual reason drops silently failed.
      card.addEventListener('dragenter', (event) => {
        if (!isValidTarget()) return;
        event.preventDefault();
        markSide(event);
      }, { signal });

      card.addEventListener('dragover', (event) => {
        if (!isValidTarget()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        markSide(event); // cursor can move within the same card after dragenter — keep the line live
      }, { signal });

      card.addEventListener('dragleave', () => card.classList.remove('insert-before', 'insert-after'), { signal });

      card.addEventListener('drop', async (event) => {
        event.preventDefault();
        const side = sideFor(event);
        clearInsertMarkers();
        const draggedId = this.#dragId;
        this.#dragId = null;
        if (!draggedId || draggedId === card.dataset.combatantId) return;
        const factionKey = card.dataset.faction;
        const dragCard = this.element.querySelector(`.vcc-card[data-combatant-id="${draggedId}"]`);
        if (dragCard?.dataset.faction !== factionKey) return;
        await this._reorderWithinFaction(factionKey, draggedId, card.dataset.combatantId, side === 'after');
      }, { signal });
    }
  }

  /**
   * Reorder `draggedId` to sit immediately before/after `targetId`, within the
   * same faction group, WITHOUT disturbing the global interleave with other
   * factions: the faction's members keep the same set of global turn-order
   * slots, only the new relative order among themselves changes.
   *
   * This system defaults to popcorn/manual initiative (`hideInitiativeRoll`
   * defaults true), so most combatants' `initiative` is commonly `null` —
   * transplanting old values between faction-mates (the previous approach)
   * is a no-op when those values are all null/tied. Instead, fresh distinct
   * values are interpolated between whichever combatants (any faction) sit
   * just outside this faction's occupied slot span, in the sort direction
   * the world is currently using.
   */
  async _reorderWithinFaction(factionKey, draggedId, targetId, insertAfter = false) {
    const combat = game.combat;
    if (!combat) return;
    if (!game.user.isGM && factionKey !== 'friendly') return;

    const factionIds = CombatTrackerHelper.buildFactionTurns(combat)[factionKey]?.turns.map(t => t.id) ?? [];
    if (!factionIds.includes(draggedId) || !factionIds.includes(targetId)) return;

    const newOrder = factionIds.filter(id => id !== draggedId);
    let targetIndex = newOrder.indexOf(targetId);
    if (insertAfter) targetIndex += 1;
    newOrder.splice(targetIndex, 0, draggedId);

    const allTurns = combat.turns; // already sorted in current display order
    const slotIndices = allTurns
      .map((c, i) => ({ id: c.id, i }))
      .filter(t => factionIds.includes(t.id))
      .map(t => t.i);

    const before = allTurns[slotIndices[0] - 1];
    const after = allTurns[slotIndices[slotIndices.length - 1] + 1];

    const n = newOrder.length;
    // Ascending (popcorn/manual, lowest goes first) vs descending (rolled, highest first).
    const dir = game.settings.get('vagabond', 'hideInitiativeRoll') ? 1 : -1;

    let lo = Number.isFinite(before?.initiative) ? before.initiative : null;
    let hi = Number.isFinite(after?.initiative) ? after.initiative : null;

    if (lo === null && hi === null) {
      // No usable neighbor on either side (values null, or this faction spans
      // the whole combat) — synthesize a safe range so results are still
      // distinct and correctly ordered.
      lo = dir === 1 ? 0 : n + 1;
      hi = dir === 1 ? n + 1 : 0;
    } else if (lo === null) {
      lo = hi - dir * (n + 1);
    } else if (hi === null) {
      hi = lo + dir * (n + 1);
    }

    const step = (hi - lo) / (n + 1);
    const updates = newOrder.map((id, i) => ({ _id: id, initiative: lo + step * (i + 1) }));

    if (game.user.isGM) return combat.updateEmbeddedDocuments('Combatant', updates);

    // Players reordering their own faction rarely own every combatant in it —
    // relay the write through the GM client.
    const { emitSocket } = await import('../helpers/socket-helper.mjs');
    emitSocket('reorderCombatants', { combatId: combat.id, updates });
  }

  /* -------------------------------------------- */
  /*  Faction group reorder (drag the divider)     */
  /* -------------------------------------------- */

  _attachPennantDragHandlers(signal) {
    if (!game.user.isGM) return;

    const pennants = this.element.querySelectorAll('.vcc-faction-divider');

    for (const pennant of pennants) {
      pennant.draggable = true;

      pennant.addEventListener('dragstart', (event) => {
        this.#dragFaction = pennant.dataset.faction;
        pennant.classList.add('is-dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', this.#dragFaction);
      }, { signal });

      pennant.addEventListener('dragend', () => {
        this.#dragFaction = null;
        pennants.forEach(p => p.classList.remove('is-dragging', 'is-drop-target'));
      }, { signal });

      const isValidTarget = () => !!this.#dragFaction && this.#dragFaction !== pennant.dataset.faction;

      // dragenter (not just dragover) must call preventDefault for the browser to
      // accept a drop at all — without it `drop` never fires in some engines,
      // which is why this silently did nothing before.
      pennant.addEventListener('dragenter', (event) => {
        if (!isValidTarget()) return;
        event.preventDefault();
        pennant.classList.add('is-drop-target');
      }, { signal });

      pennant.addEventListener('dragover', (event) => {
        if (!isValidTarget()) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }, { signal });

      pennant.addEventListener('dragleave', () => pennant.classList.remove('is-drop-target'), { signal });

      pennant.addEventListener('drop', async (event) => {
        event.preventDefault();
        pennant.classList.remove('is-drop-target');
        const draggedKey = this.#dragFaction;
        this.#dragFaction = null;
        const targetKey = pennant.dataset.faction;
        if (!draggedKey || draggedKey === targetKey) return;
        await this._reorderFactionGroups(draggedKey, targetKey);
      }, { signal });
    }
  }

  async _reorderFactionGroups(draggedKey, targetKey) {
    const combat = game.combat;
    if (!combat || !game.user.isGM) return;
    const order = CombatTrackerHelper.getFactionOrder(combat);
    const newOrder = order.filter(k => k !== draggedKey);
    const targetIndex = newOrder.indexOf(targetKey);
    newOrder.splice(targetIndex, 0, draggedKey);
    return CombatTrackerHelper.setFactionOrder(combat, newOrder);
  }

  /* -------------------------------------------- */
  /*  Turn activation                              */
  /* -------------------------------------------- */

  async _activateTurn(combatantId) {
    const combat = game.combat;
    if (!combat || !combatantId) return;
    const combatant = combat.combatants.get(combatantId);
    if (!combatant) return;
    if (!game.user.isGM && !combatant.isOwner) return;

    if (game.settings.get('vagabond', 'useActivationPoints')) {
      return combat.activateCombatant(combatantId);
    }
    const turnIndex = combat.turns.findIndex(c => c.id === combatantId);
    if (turnIndex >= 0) return combat.update({ turn: turnIndex });
  }

  /* -------------------------------------------- */
  /*  Control column actions                       */
  /* -------------------------------------------- */

  static async #onStartStopEncounter() {
    let combat = game.combat;
    if (!combat) {
      // Mirrors core CombatTracker#_onCombatCreate: implementation.create() resolves
      // the configured VagabondCombat subclass; activate() makes it the viewed combat.
      combat = await Combat.implementation.create();
      await combat.activate({ render: false });
    }
    if (combat.started) return combat.endCombat();
    return combat.startCombat();
  }

  static async #onClearMoveHistory() {
    const combat = game.combat;
    if (!combat) return;
    await Promise.all(combat.combatants.map(c => c.clearMovementHistory()));
    ui.notifications.info(game.i18n.localize('VAGABOND.Combat.Carousel.MoveHistoryCleared'));
  }

  static async #onOpenConfig() {
    const { EncounterSettings } = globalThis.vagabond.applications;
    new EncounterSettings().render(true);
  }

  static async #onPreviousRound() { return game.combat?.previousRound(); }
  static async #onPreviousTurn() { return game.combat?.previousTurn(); }
  static async #onNextTurn() { return game.combat?.nextTurn(); }
  static async #onNextRound() { return game.combat?.nextRound(); }

  /* -------------------------------------------- */
  /*  Reactivity                                   */
  /* -------------------------------------------- */

  _registerHooks() {
    this._clearHooks();
    const redraw = () => this.#renderDebounce();
    const hooks = [
      'updateCombat', 'createCombat', 'deleteCombat',
      'updateCombatant', 'createCombatant', 'deleteCombatant',
      'updateActor', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect',
    ];
    for (const hook of hooks) {
      this.#hookIds.push({ hook, id: Hooks.on(hook, redraw) });
    }
  }

  _clearHooks() {
    for (const { hook, id } of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
  }

  async close(options = {}) {
    this.#ctrl?.abort();
    this.#ctrl = null;
    this._clearHooks();
    CombatCarousel.#isOpen = false;
    return super.close(options);
  }
}
