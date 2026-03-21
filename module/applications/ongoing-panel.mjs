import { CountdownDice } from '../documents/countdown-dice.mjs';

const { api } = foundry.applications;

export class OngoingPanel extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static #instance = null;
  #hookIds = [];
  #ctrl    = null;
  #renderDebounce = foundry.utils.debounce(() => this.render(), 100);

  static DEFAULT_OPTIONS = {
    id:      'ongoing-status-panel',
    classes: ['vagabond', 'ongoing-panel'],
    window: {
      title:       'VAGABOND.OngoingPanel.Title',
      icon:        'fas fa-list-ul',
      resizable:   true,
      minimizable: true,
    },
    position: {
      width:  300,
      height: 'auto',
      top:    80,
    },
  };

  static PARTS = {
    panel: {
      template: 'systems/vagabond/templates/apps/ongoing-panel.hbs',
      scrollable: ['.osp-body'],
    },
  };

  /** Toggle: open if closed, close if open. */
  static toggle() {
    if (OngoingPanel.#instance?.rendered) {
      OngoingPanel.#instance.close();
    } else {
      if (!OngoingPanel.#instance) {
        OngoingPanel.#instance = new OngoingPanel();
      }
      OngoingPanel.#instance.render({ force: true });
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    const tokens = canvas.tokens?.placeables ?? [];

    // Build map: actorId → { tokenId, tokenName } (first token wins for dedup)
    const tokenMap = new Map();
    for (const t of tokens) {
      if (t.actor && !tokenMap.has(t.actor.id)) {
        tokenMap.set(t.actor.id, {
          tokenId:   t.id,
          tokenName: t.document.name || t.actor.name,
        });
      }
    }

    const actors = tokens
      .map(t => t.actor)
      .filter((a, i, arr) => a && ['character', 'npc'].includes(a.type)
        && arr.findIndex(b => b?.id === a?.id) === i); // deduplicate

    const allDice = game.journal.filter(
      j => j.flags?.vagabond?.countdownDice?.type === 'countdownDice'
    );

    const buildRow = (actor) => {
      const tokenInfo = tokenMap.get(actor.id);

      const linkedDice = allDice.filter(
        j => j.flags.vagabond.countdownDice.linkedActorUuid === actor.uuid
      );
      const statuses = actor.effects
        .filter(e => !e.disabled && e.statuses?.size > 0)
        .map(e => {
          const statusId = e.statuses.first();
          const def = CONFIG.statusEffects.find(s => s.id === statusId);
          return {
            effectUuid: e.uuid,
            statusId,
            name: game.i18n.localize(CONFIG.VAGABOND.statusConditions?.[statusId] ?? statusId),
            img:  def?.img ?? 'icons/svg/aura.svg',
          };
        });

      return {
        actorUuid: actor.uuid,
        tokenId:   tokenInfo?.tokenId ?? null,
        name:      tokenInfo?.tokenName ?? actor.name,
        img:       actor.img,
        statuses,
        linkedDice: linkedDice.map(j => ({
          dieId:       j.id,
          displayName: j.flags.vagabond.countdownDice.name,
          diceType:    j.flags.vagabond.countdownDice.diceType,
          img:         CountdownDice.getDiceImagePath(j.flags.vagabond.countdownDice.diceType),
        })),
        hp: {
          value: actor.system.health?.value ?? 0,
          max:   actor.system.health?.max ?? 0,
        },
        fatigue: {
          value: actor.system.fatigue ?? 0,
          max:   actor.system.fatigueMax ?? 5,
        },
      };
    };

    const withStatuses = actors.filter(a =>
      a.effects.some(e => !e.disabled && e.statuses?.size > 0)
    );

    const characters = withStatuses.filter(a => a.type === 'character').sort((a, b) => a.name.localeCompare(b.name));
    const npcs       = withStatuses.filter(a => a.type === 'npc').sort((a, b) => a.name.localeCompare(b.name));

    context.groups = [
      characters.length ? { key: 'characters', label: game.i18n.localize('VAGABOND.OngoingPanel.Groups.Heroes'),  rows: characters.map(buildRow) } : null,
      npcs.length       ? { key: 'npcs',       label: game.i18n.localize('VAGABOND.OngoingPanel.Groups.Enemies'), rows: npcs.map(buildRow) }       : null,
    ].filter(Boolean);

    context.isEmpty = context.groups.length === 0;
    return context;
  }

  _onRender(context, options) {
    this.#ctrl?.abort();
    this.#ctrl = new AbortController();
    const { signal } = this.#ctrl;

    // Portrait → pan canvas to token
    for (const el of this.element.querySelectorAll('.osp-portrait')) {
      const tokenId = el.closest('[data-token-id]')?.dataset.tokenId;
      el.addEventListener('click', () => {
        if (!tokenId) return;
        const token = canvas.tokens?.get(tokenId);
        if (token) canvas.animatePan({ x: token.center.x, y: token.center.y });
      }, { signal });
    }

    // Name → open actor sheet
    for (const el of this.element.querySelectorAll('.osp-actor-name')) {
      const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
      el.addEventListener('click', async () => {
        const actor = await fromUuid(uuid);
        actor?.sheet.render(true);
      }, { signal });
    }

    // Status icon → left: send to chat / right: remove status
    for (const el of this.element.querySelectorAll('.osp-status-icon')) {
      const { effectUuid, actorUuid } = el.dataset;
      el.addEventListener('click', async () => {
        const actor  = await fromUuid(actorUuid);
        const effect = await fromUuid(effectUuid);
        if (actor && effect) {
          const { VagabondChatCard } = await import('../helpers/chat-card.mjs');
          VagabondChatCard.statusEffect(actor, effect);
        }
      }, { signal });
      el.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const actor = await fromUuid(actorUuid);
        if (!actor) return;
        const statusId = el.dataset.statusId;
        actor.toggleStatusEffect(statusId, { active: false });
        // Also delete any countdown dice linked to this actor + status so the
        // on-screen overlay element disappears immediately.
        const linkedDice = game.journal.filter(j => {
          const cd = j.flags?.vagabond?.countdownDice;
          return cd?.type === 'countdownDice'
            && cd.linkedActorUuid === actor.uuid
            && cd.linkedStatusId === statusId;
        });
        for (const die of linkedDice) die.delete();
      }, { signal });
    }

    // Die button → left: roll / right: delete die (removes overlay element via deleteJournalEntry hook)
    for (const el of this.element.querySelectorAll('.osp-die-btn')) {
      const dieId = el.dataset.dieId;
      el.addEventListener('click', async () => {
        const dice = game.journal.get(dieId);
        if (dice) await globalThis.vagabond.ui.countdownDiceOverlay._onRollDice(dice);
      }, { signal });
      el.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const dice = game.journal.get(dieId);
        if (dice) await dice.delete();
      }, { signal });
    }

    // HP — left −1 / right +1
    for (const el of this.element.querySelectorAll('.osp-resource-hp')) {
      const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
      el.addEventListener('click',       ()  => this._changeHp(uuid, -1), { signal });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); this._changeHp(uuid, +1); }, { signal });
    }

    // Fatigue — left +1 / right −1
    for (const el of this.element.querySelectorAll('.osp-resource-fatigue')) {
      const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
      el.addEventListener('click',       ()  => this._changeFatigue(uuid, +1), { signal });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); this._changeFatigue(uuid, -1); }, { signal });
    }

    // Register Foundry hooks now that we have a live element
    this._registerHooks();
  }

  async _changeHp(uuid, delta) {
    const actor = await fromUuid(uuid);
    if (!actor) return;
    const val = Math.clamp(actor.system.health.value + delta, 0, actor.system.health.max);
    actor.update({ 'system.health.value': val });
  }

  async _changeFatigue(uuid, delta) {
    const actor = await fromUuid(uuid);
    if (!actor) return;
    const val = Math.clamp((actor.system.fatigue ?? 0) + delta, 0, actor.system.fatigueMax ?? 5);
    actor.update({ 'system.fatigue': val });
  }

  _registerHooks() {
    this._clearHooks();
    const redraw = () => this.#renderDebounce();
    this.#hookIds.push(
      Hooks.on('canvasReady',          redraw),
      Hooks.on('createToken',          redraw),
      Hooks.on('deleteToken',          redraw),
      Hooks.on('updateActor',          redraw),
      Hooks.on('createActiveEffect',   redraw),
      Hooks.on('updateActiveEffect',   redraw),
      Hooks.on('deleteActiveEffect',   redraw),
      Hooks.on('createJournalEntry',   redraw),
      Hooks.on('updateJournalEntry',   redraw),
      Hooks.on('deleteJournalEntry',   redraw),
    );
  }

  _clearHooks() {
    for (const id of this.#hookIds) Hooks.off(id);
    this.#hookIds = [];
  }

  async close(options = {}) {
    this.#ctrl?.abort();
    this.#ctrl = null;
    this._clearHooks();
    return super.close(options);
  }
}
