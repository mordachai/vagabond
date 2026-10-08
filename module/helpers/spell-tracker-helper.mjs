/**
 * Spell Trackers — buff Spells put a Tracker status on their Targets (Blessed, Exalted, Warded, Guided,
 * Hastened, Slowed, Frozen, Shrunk). The mechanics live in each status's changes
 * (`CONFIG.VAGABOND.statusEffectDefinitions`); this helper only applies and clears them.
 *
 * Apply: the Spell's hit macro button runs `system:spell.status.<statusId>` (runAsGM) on a successful Cast.
 * Each Target gets the status, with a description naming the Spell and its caster and
 * `flags.vagabond.spellTracker = { casterUuid, spellId }`. Tempo scales with the Cast's dice (5' per die).
 *
 * Clear: when the caster stops Focusing on that Spell (`system.focus.spellIds` loses its id), the active GM
 * removes the Trackers it applied. A Cast that was never Focused leaves them for the table to remove by hand
 * (token HUD), like any other status.
 */
export class SpellTrackerHelper {

  /** Tracker statuses a Spell can apply, with the Speed per die for the Tempo pair. */
  static TRACKERS = {
    blessed: {},
    exalted: {},
    warded: {},
    guided: {},
    hastened: { speedPerDie: 5 },
    slowed: { speedPerDie: -5 },
    frozen: {},
    shrunk: {},
  };

  /** Pack Spell id → Tracker status (world copies are matched by source id, never by name). */
  static SPELLS = {
    TyPnI7gEtbzuxFZm: 'blessed',   // Bless
    lSVkxtOolrInid6w: 'exalted',   // Exalt
    L43XdoqLgQ8Wl6vM: 'warded',    // Ward
    K0iy3DCtjDZzLMm6: 'guided',    // Guide
    sAkNbpjb2X6CsJ4Y: 'hastened',  // Tempo +
    vVHD6kTqq2V277RU: 'slowed',    // Tempo -
    toYD8Nm61vMhBbZ7: 'frozen',    // Freeze
    '0ZWciAQHQ8V0Svd6': 'shrunk',  // Shrink
  };

  /** The hit-macro command that applies `statusId`. */
  static command(statusId) {
    return `system:spell.status.${statusId}`;
  }

  /** Register one built-in macro handler per Tracker. Synchronous, called from init. */
  static registerMacroHandlers(registerMacroHandler) {
    for (const statusId of Object.keys(this.TRACKERS)) {
      registerMacroHandler(`spell.status.${statusId}`, (scope) => this.apply(scope, statusId));
    }
  }

  /**
   * Put `statusId` on every Target of the Cast.
   * @param {object} scope - macro scope: actor (caster), item (Spell), targets, spellDamageDice
   * @param {string} statusId
   */
  static async apply(scope, statusId) {
    const def = CONFIG.statusEffects?.find(s => s.id === statusId);
    if (!def) return ui.notifications.warn(game.i18n.format('VAGABOND.SpellTracker.Unavailable', { status: statusId }));
    const targets = (scope?.targets?.length ? scope.targets : Array.from(game.user.targets))
      .map(t => t?.actor ?? null).filter(Boolean);
    if (!targets.length) return ui.notifications.warn(game.i18n.localize('VAGABOND.SpellTracker.NoTarget'));

    const caster = scope.actor ?? null;
    const spell = scope.item?.id ? scope.item : null;
    const statusName = game.i18n.localize(def.name);
    const description = `<p>${game.i18n.format('VAGABOND.SpellTracker.By', {
      spell: foundry.utils.escapeHTML(spell?.name ?? scope.itemName ?? ''),
      name: foundry.utils.escapeHTML(caster?.name ?? ''),
    })}</p>`;

    // Tempo: 5' per die of the Cast (dice scaling)
    const perDie = this.TRACKERS[statusId]?.speedPerDie;
    const dice = Math.max(1, Number(scope.spellDamageDice) || 1);
    const speed = perDie ? perDie * dice : null;

    for (const actor of targets) {
      if (!actor.isOwner && !game.user.isGM) {
        // runAsGM relays to the GM; without one, a player can only reach their own Beings
        const { emitSocket } = await import('./socket-helper.mjs');
        emitSocket('applyStatus', { actorUuid: actor.uuid, statusId, active: true, description });
        continue;
      }
      if (!actor.statuses?.has(statusId)) await actor.toggleStatusEffect(statusId, { active: true });
      const eff = actor.effects.find(e => e.statuses?.has(statusId));
      if (!eff) continue;
      const update = {
        description,
        'flags.vagabond.flankInfo': true,
        'flags.vagabond.spellTracker': { casterUuid: caster?.uuid ?? null, spellId: spell?.id ?? null },
      };
      if (speed !== null) {
        update.name = `${statusName} (${speed > 0 ? '+' : ''}${speed}')`;
        update['system.changes'] = [{ key: 'system.speedModifier', type: 'add', value: String(speed), phase: 'initial', priority: null }];
      }
      await eff.update(update);
    }
  }

  /** English pack names, only for source-less copies (see isCopyOf). */
  static #SPELL_NAMES = {
    TyPnI7gEtbzuxFZm: 'Bless', lSVkxtOolrInid6w: 'Exalt', L43XdoqLgQ8Wl6vM: 'Ward', K0iy3DCtjDZzLMm6: 'Guide',
    sAkNbpjb2X6CsJ4Y: 'Tempo +', vVHD6kTqq2V277RU: 'Tempo -', toYD8Nm61vMhBbZ7: 'Freeze', '0ZWciAQHQ8V0Svd6': 'Shrink',
  };

  /** A hit macro the pack shipped before the Trackers (empty, or the old Shrink / Tempo scripts) — safe to replace. */
  static #isStockMacro(cmd) {
    const c = String(cmd ?? '').trim();
    return !c || c.startsWith('system:spell.status.')
      || (c.includes('const SIZES') && c.includes('"Shrink"'))
      || c.includes('vagabond: { tempo: true }');
  }

  /**
   * One-time: world copies of the buff Spells get the Tracker hit macro. A hit macro the table wrote itself
   * is left alone. Active GM only, guarded by `spellTrackerMacrosMigrated`.
   */
  static async migrateWorldSpells() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'spellTrackerMacrosMigrated')) return;
    const { isCopyOf } = await import('./source-id.mjs');

    const items = [...game.items.contents, ...this.#actors().flatMap(a => { try { return Array.from(a.items); } catch { return []; } })];
    for (const item of items) {
      try {
        if (item.type !== 'spell') continue;
        const id = Object.keys(this.SPELLS).find(sid => isCopyOf(item, sid, this.#SPELL_NAMES[sid]));
        if (!id || !this.#isStockMacro(item.system.hitMacro?.command)) continue;
        const command = this.command(this.SPELLS[id]);
        if (item.system.hitMacro?.command === command && item.system.hitMacro?.enabled) continue;
        await item.update({
          'system.hitMacro': { enabled: true, uuid: '', command, label: item.system.hitMacro?.label || item.name, runAsGM: true },
        });
      } catch (err) {
        console.warn(`vagabond | Spell Trackers migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'spellTrackerMacrosMigrated', true);
  }

  /** Every actor that can carry a Tracker: sidebar actors + unlinked token actors on every scene. */
  static #actors() {
    return [
      ...game.actors.contents,
      ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink && t.actor).map(t => t.actor)),
    ];
  }

  /** The caster stopped Focusing on these Spells: remove the Trackers those Casts applied. */
  static async #onFocusDropped(caster, spellIds) {
    for (const actor of this.#actors()) {
      const ids = actor.effects
        .filter(e => {
          const src = e.flags?.vagabond?.spellTracker;
          return src && src.casterUuid === caster.uuid && spellIds.includes(src.spellId);
        })
        .map(e => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    }
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    Hooks.on('preUpdateActor', (actor, changes, options) => {
      if (!foundry.utils.hasProperty(changes, 'system.focus.spellIds')) return;
      options.vagabondFocusBefore = [...(actor.system.focus?.spellIds ?? [])];
    });
    Hooks.on('updateActor', (actor, changes, options) => {
      const before = options.vagabondFocusBefore;
      if (!before || game.users.activeGM !== game.user) return;
      const now = actor.system.focus?.spellIds ?? [];
      const dropped = before.filter(id => !now.includes(id));
      if (!dropped.length) return;
      this.#onFocusDropped(actor, dropped).catch(err => console.error('vagabond | Spell Trackers: could not clear', err));
    });
  }
}
