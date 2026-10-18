import { StatusHelper } from './status-helper.mjs';
import { VagabondDamagePipeline } from './damage-pipeline.mjs';
import { macroNotify } from './item-macro.mjs';

/**
 * Spell Trackers — buff Spells put a Tracker status on their Targets (Bless, Exalt, Ward, Guide, Tempo, Freeze,
 * Shrink). They are system aids, not book Statuses: each is named "<Spell>: <effect>" and its description quotes
 * the Spell's rule, so the table always sees why it is there. The mechanics live in each status's changes
 * (`CONFIG.VAGABOND.statusEffectDefinitions`); this helper only applies and clears them.
 *
 * Apply: the Spell's hit macro button runs `system:spell.status.<statusId>` (runAsGM) on a successful Cast.
 * Each Target gets the status with `flags.vagabond.spellTracker = { casterUuid, casterName, spellId, spellName }`,
 * shown as "Cast by …" metadata on the status chat card (never mixed into the rule text). Tempo scales with the
 * Cast's dice (5' per die).
 *
 * Status Spells (`system:spell.<key>`): Spells whose rule applies or ends book Statuses under a condition a plain
 * toggle can't check — Hold / Control (HD or Level), Zap (can be damaged by shocks), Cure / Hymn (end the Statuses
 * and grant Immune to them for the duration). Each Cast posts a short result card.
 *
 * Bless (`system:spell.bless`, NOT runAsGM): "Targeted Objects count as Silvered, and Targeted Beings of your
 * choice have a d4 bonus to Saves." The Spell has Target Beings + Target Objects on, so the Cast dialog's Target
 * picker (SpellTargetPicker) lists the Beings and their weapons: Beings = the hit macro's Targets, Objects =
 * `scope.targetObjects`. An Imbue Cast works like any Imbue: the delivery card blesses the Being the weapon hit.
 * Both relay to the GM with `blessTargets` / `blessWeapons`: Beings get the Tracker, each weapon gets a
 * "Bless: Silvered" effect in the "This item" mode (ADD `silver` to `system.countsAs`, stamped like the Trackers),
 * read by `VagabondDamagePipeline.weaponTriggersWeakness`. It shows in the weapon's Effects tab (switch / delete).
 *
 * Clear: when the caster stops Focusing on that Spell (`system.focus.spellIds` loses its id), the active GM
 * removes every effect it applied (Trackers, Cure / Hymn immunities, Bless Silvered on weapons). A Cast that was never Focused leaves them
 * for the table to remove by hand (token HUD / effects list), like any other status.
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
    lSVkxtOolrInid6w: 'exalted',   // Exalt
    L43XdoqLgQ8Wl6vM: 'warded',    // Ward
    K0iy3DCtjDZzLMm6: 'guided',    // Guide
    sAkNbpjb2X6CsJ4Y: 'hastened',  // Tempo +
    vVHD6kTqq2V277RU: 'slowed',    // Tempo -
    toYD8Nm61vMhBbZ7: 'frozen',    // Freeze
    '0ZWciAQHQ8V0Svd6': 'shrunk',  // Shrink
  };

  /** Pack Spell id → Status Spell handler (`system:spell.<key>`). */
  static STATUS_SPELLS = {
    TyPnI7gEtbzuxFZm: 'bless',
    Hwmj6RwmUigPTFAv: 'hold',
    E2B43fRes5XOet6V: 'control',
    zqTI6h7qOnAnVTfP: 'zap',
    whw1OLRUOKvxo014: 'cure',
    ebEsafpKK3vkvvYJ: 'hymn',
  };

  /** Statuses Cure / Hymn end, and grant Immune to for the duration. */
  static CURES = {
    cure: ['blinded', 'sickened'],
    hymn: ['berserk', 'charmed', 'confused', 'frightened'],
  };

  /** The hit-macro command that applies `statusId`. */
  static command(statusId) {
    return `system:spell.status.${statusId}`;
  }

  /** Register the built-in macro handlers. Synchronous, called from init. */
  static registerMacroHandlers(registerMacroHandler) {
    for (const statusId of Object.keys(this.TRACKERS)) {
      registerMacroHandler(`spell.status.${statusId}`, (scope) => this.apply(scope, statusId));
    }
    registerMacroHandler('spell.bless', (scope) => this.bless(scope));
    registerMacroHandler('spell.hold', (scope) => this.hold(scope));
    registerMacroHandler('spell.control', (scope) => this.control(scope));
    registerMacroHandler('spell.zap', (scope) => this.zap(scope));
    registerMacroHandler('spell.cure', (scope) => this.cure(scope, 'cure'));
    registerMacroHandler('spell.hymn', (scope) => this.cure(scope, 'hymn'));
  }

  /** Target actors of a macro scope (falls back to the user's targets, unless the Cast picked them). */
  static #targetActors(scope) {
    const tokens = (scope?.targets?.length || scope?.targetsPicked) ? (scope.targets ?? []) : Array.from(game.user.targets);
    return tokens.map(t => t?.actor ?? null).filter(Boolean);
  }

  /**
   * No Being to affect. A Cast aimed at spaces or an area (Freeze on water, an ice Object; a Cube with nobody
   * inside) is still a Cast: nothing to do, no warning (the hit macro runs by itself after every Cast).
   */
  static #noTarget(scope) {
    if (scope?.targetSpaces?.length || scope?.castArea?.shape) return;
    return macroNotify('warn', game.i18n.localize('VAGABOND.SpellTracker.NoTarget'));
  }

  /**
   * The `flags.vagabond.spellTracker` stamp of a Cast (FocusLink). `held` = the Cast is held by the Focus
   * (scope `focusHeld`); buttons from before it existed count as held.
   */
  static #stamp(scope) {
    const caster = scope?.actor ?? null;
    const spell = scope?.item?.id ? scope.item : null;
    return {
      casterUuid: caster?.uuid ?? null,
      casterName: caster?.name ?? '',
      spellId: spell?.id ?? null,
      spellName: spell?.name ?? scope?.itemName ?? '',
      held: scope?.focusHeld !== false,
    };
  }

  /** Localized name of a status id. */
  static #statusLabel(id) {
    return game.i18n.localize(CONFIG.statusEffects?.find(s => s.id === id)?.name ?? id);
  }

  /**
   * Put `statusId` on every Target of the Cast.
   * @param {object} scope - macro scope: actor (caster), item (Spell), targets, spellDamageDice
   * @param {string} statusId
   * @param {Actor[]} [targets] - defaults to the scope's Targets
   */
  static async apply(scope, statusId, targets = this.#targetActors(scope)) {
    const def = CONFIG.statusEffects?.find(s => s.id === statusId);
    if (!def) return macroNotify('warn', game.i18n.format('VAGABOND.SpellTracker.Unavailable', { status: statusId }));
    if (!targets.length) return this.#noTarget(scope);

    const stamp = this.#stamp(scope);

    // Tempo: 5' per die of the Cast (dice scaling)
    const perDie = this.TRACKERS[statusId]?.speedPerDie;
    const dice = Math.max(1, Number(scope.spellDamageDice) || 1);
    const speed = perDie ? perDie * dice : null;

    for (const actor of targets) {
      if (!actor.isOwner && !game.user.isGM) {
        // runAsGM relays to the GM; without one, a player can only reach their own Beings
        const { emitSocket } = await import('./socket-helper.mjs');
        emitSocket('applyStatus', { actorUuid: actor.uuid, statusId, active: true });
        continue;
      }
      if (!actor.statuses?.has(statusId)) await actor.toggleStatusEffect(statusId, { active: true });
      const eff = actor.effects.find(e => e.statuses?.has(statusId));
      if (!eff) continue;
      const update = { 'flags.vagabond.spellTracker': stamp };
      if (speed !== null) {
        update.name = game.i18n.format('VAGABOND.SpellTracker.TempoName', { speed: `${speed > 0 ? '+' : ''}${speed}` });
        update['system.changes'] = [{ key: 'system.speedModifier', type: 'add', value: String(speed), phase: 'initial', priority: null }];
      }
      await eff.update(update);
    }
  }

  /**
   * Bless hit macro: Tracker on the Target Beings, Silvered on the Target Objects (`scope.targetObjects`, the
   * weapons picked in the Cast dialog). On an Imbue delivery card: the Being the imbued weapon hit. Runs on the
   * clicker's client, then relays to the GM with `blessTargets` / `blessWeapons`.
   */
  static async bless(scope) {
    if (Array.isArray(scope?.blessTargets)) return this.#blessApply(scope);
    const beings = this.#targetActors(scope);
    const weapons = (scope?.targetObjects ?? []).filter(i => i?.uuid);
    if (!beings.length && !weapons.length) return this.#noTarget(scope);
    const { runMacroFromButton } = await import('./item-macro.mjs');
    return runMacroFromButton({
      itemUuid: scope?.item?.uuid ?? null,
      itemName: scope?.item?.name ?? scope?.itemName ?? null,
      actorUuid: scope?.actor?.uuid ?? null,
      slot: 'hitMacro',
      command: 'system:spell.bless',
      isCritical: !!scope?.isCritical,
      extraScope: {
        blessTargets: beings.map(a => a.uuid), blessWeapons: weapons.map(w => w.uuid),
        ...(typeof scope?.focusHeld === 'boolean' ? { focusHeld: scope.focusHeld } : {}),
      },
      runAsGM: true,
    });
  }

  /** Bless, GM side: Tracker on the Beings, Silvered on the weapons. */
  static async #blessApply(scope) {
    const resolve = async (uuids) => (await Promise.all((uuids ?? []).map(u => fromUuid(u)))).filter(Boolean);
    const beings = await resolve(scope.blessTargets);
    if (beings.length) await this.apply(scope, 'blessed', beings);

    const stamp = this.#stamp(scope);
    const lines = [];
    for (const weapon of await resolve(scope.blessWeapons)) {
      const same = (e) => e.flags?.vagabond?.spellTracker?.casterUuid === stamp.casterUuid
        && e.flags?.vagabond?.spellTracker?.spellId === stamp.spellId;
      if (!weapon.effects.some(same)) await weapon.createEmbeddedDocuments('ActiveEffect', [this.#silveredEffect(scope, stamp)]);
      lines.push(game.i18n.format('VAGABOND.SpellTracker.Silvered', {
        weapon: foundry.utils.escapeHTML(weapon.name), bearer: foundry.utils.escapeHTML(weapon.actor?.name ?? ''),
      }));
    }
    await this.#report(scope, lines);
  }

  /** "Bless: Silvered" — a "This item" effect: the weapon counts as Silvered (not made of Silver). */
  static #silveredEffect(scope, stamp) {
    return {
      name: game.i18n.localize('VAGABOND.SpellTracker.SilveredName'),
      img: scope?.item?.img ?? 'icons/svg/aura.svg',
      description: game.i18n.localize('VAGABOND.SpellTracker.SilveredDesc'),
      transfer: false,
      flags: { vagabond: { applicationMode: 'self', spellTracker: stamp } },
      system: { changes: [{ key: 'system.countsAs', type: 'add', value: 'silver', phase: 'initial', priority: null }] },
    };
  }

  /** `{kind, value}` of a Being: NPCs by HD, everyone else by Level. */
  static #rank(actor) {
    if (actor.type === 'npc') return { kind: game.i18n.localize('VAGABOND.SpellTracker.HD'), value: Number(actor.system.hd) || 0 };
    return { kind: game.i18n.localize('VAGABOND.SpellTracker.Level'), value: Number(actor.system.attributes?.level?.value) || 0 };
  }

  /** Short public result card for a Status Spell Cast. */
  static async #report(scope, lines) {
    if (!lines.length) return;
    const title = foundry.utils.escapeHTML(scope?.item?.name ?? scope?.itemName ?? '');
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: scope?.actor ?? null }),
      content: `<div class="vagabond-spell-status-result"><strong>${title}</strong>${lines.map(l => `<p>${l}</p>`).join('')}</div>`,
    });
  }

  /** Give `statusId` unless the Being is Immune to it; returns the result line. */
  static async #give(actor, statusId) {
    const target = foundry.utils.escapeHTML(actor.name);
    const status = this.#statusLabel(statusId);
    if (StatusHelper.isStatusImmune(actor, statusId)) {
      return game.i18n.format('VAGABOND.SpellTracker.StatusImmune', { target, status });
    }
    if (!actor.statuses?.has(statusId)) await actor.toggleStatusEffect(statusId, { active: true });
    return game.i18n.format('VAGABOND.SpellTracker.Applied', { target, status });
  }

  /** Give `statusId` to every Target whose HD / Level is at most `need`. */
  static async #giveByRank(scope, statusId, need) {
    const targets = this.#targetActors(scope);
    if (!targets.length) return this.#noTarget(scope);
    const lines = [];
    for (const actor of targets) {
      const { kind, value } = this.#rank(actor);
      if (value > need) {
        lines.push(game.i18n.format('VAGABOND.SpellTracker.LevelTooHigh', {
          target: foundry.utils.escapeHTML(actor.name), kind, value, need: Math.max(0, need),
        }));
        continue;
      }
      lines.push(await this.#give(actor, statusId));
    }
    await this.#report(scope, lines);
  }

  /**
   * Hold: "The Target is Paralyzed for the duration if its HD or Level is equal to or lower than your Level. You
   * can spend Mana to increase your Level for the purposes of this casting by 1 per Mana spent to do so."
   * The extra Mana is the Cast's dice past the first (dice scaling). Objects stay manual.
   */
  static async hold(scope) {
    const level = scope?.actor ? this.#rank(scope.actor).value : 0;
    const bonus = Math.max(0, (Number(scope?.spellDamageDice) || 1) - 1);
    return this.#giveByRank(scope, 'paralyzed', level + bonus);
  }

  /**
   * Control: "Targeted Beings become Charmed and obey your commands for the duration. This Spell automatically
   * fails if the Target's Level or HD are equal to or higher than your Level." Objects stay manual.
   */
  static async control(scope) {
    const level = scope?.actor ? this.#rank(scope.actor).value : 0;
    return this.#giveByRank(scope, 'charmed', level - 1);
  }

  /**
   * Zap: "The Target is Dazed for the duration if it can be damaged by shocks. Crit: The Target is Paralyzed,
   * rather than Dazed." A Being Immune to Shock (its own Immune or its worn Armor's) is not affected.
   */
  static async zap(scope) {
    const targets = this.#targetActors(scope);
    if (!targets.length) return this.#noTarget(scope);
    const statusId = scope?.isCritical ? 'paralyzed' : 'dazed';
    const lines = [];
    for (const actor of targets) {
      const armor = actor.type === 'character'
        ? actor.items.find(i => i.type === 'equipment' && i.system.equipmentType === 'armor' && i.system.equipped)
        : null;
      const immunities = [...(actor.system.immunities ?? []), ...(armor?.system.immunities ?? [])];
      if (VagabondDamagePipeline.typeListCovers(immunities, 'shock')) {
        lines.push(game.i18n.format('VAGABOND.SpellTracker.ShockImmune', { target: foundry.utils.escapeHTML(actor.name) }));
        continue;
      }
      lines.push(await this.#give(actor, statusId));
    }
    await this.#report(scope, lines);
  }

  /**
   * Cure / Hymn: "If the Target is <Statuses>, the Status ends and they are Immune to these Statuses for the
   * duration." The immunity is one effect on the Target, stamped like a Tracker so it ends with the Focus.
   * @param {object} scope
   * @param {'cure'|'hymn'} key
   */
  static async cure(scope, key) {
    const targets = this.#targetActors(scope);
    if (!targets.length) return this.#noTarget(scope);
    const statuses = this.CURES[key];
    const all = statuses.map(id => this.#statusLabel(id)).join(', ');
    const stamp = this.#stamp(scope);
    const spell = stamp.spellName || key;
    const lines = [];
    for (const actor of targets) {
      const ended = statuses.filter(id => actor.statuses?.has(id));
      for (const id of ended) await StatusHelper.removeStatus(actor, id);
      // One immunity effect per Spell and Target: a recast replaces it
      const old = actor.effects.filter(e => e.flags?.vagabond?.spellImmunity === key).map(e => e.id);
      if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old);
      await actor.createEmbeddedDocuments('ActiveEffect', [{
        name: game.i18n.format('VAGABOND.SpellTracker.ImmuneName', { spell, statuses: all }),
        img: scope?.item?.img ?? 'icons/svg/aura.svg',
        description: game.i18n.format('VAGABOND.SpellTracker.ImmuneDesc', { statuses: all }),
        system: { changes: statuses.map(id => ({ key: 'system.statusImmunities', type: 'add', value: id, phase: 'initial', priority: null })) },
        flags: { vagabond: { spellTracker: stamp, spellImmunity: key } },
      }]);
      const target = foundry.utils.escapeHTML(actor.name);
      lines.push(ended.length
        ? game.i18n.format('VAGABOND.SpellTracker.Cured', { target, statuses: ended.map(id => this.#statusLabel(id)).join(', '), all })
        : game.i18n.format('VAGABOND.SpellTracker.CuredNone', { target, all }));
    }
    await this.#report(scope, lines);
  }

  /** English pack names, only for source-less copies (see isCopyOf). */
  static #SPELL_NAMES = {
    TyPnI7gEtbzuxFZm: 'Bless', lSVkxtOolrInid6w: 'Exalt', L43XdoqLgQ8Wl6vM: 'Ward', K0iy3DCtjDZzLMm6: 'Guide',
    sAkNbpjb2X6CsJ4Y: 'Tempo +', vVHD6kTqq2V277RU: 'Tempo -', toYD8Nm61vMhBbZ7: 'Freeze', '0ZWciAQHQ8V0Svd6': 'Shrink',
    Hwmj6RwmUigPTFAv: 'Hold', E2B43fRes5XOet6V: 'Control', zqTI6h7qOnAnVTfP: 'Zap', whw1OLRUOKvxo014: 'Cure',
    ebEsafpKK3vkvvYJ: 'Hymn',
  };

  /** A hit macro the pack shipped before the Trackers (empty, or the old Shrink / Tempo scripts) — safe to replace. */
  static #isStockMacro(cmd) {
    const c = String(cmd ?? '').trim();
    return !c || c.startsWith('system:spell.status.')
      || (c.includes('const SIZES') && c.includes('"Shrink"'))
      || c.includes('vagabond: { tempo: true }');
  }

  /** The inline status script the pack shipped for Hold / Control / Zap / Cure / Hymn — safe to replace. */
  static #isStockStatusScript(cmd) {
    const c = String(cmd ?? '').trim();
    return !c || c.startsWith('system:spell.')
      || (c.includes('toggleStatusEffect(') && (c.startsWith('const tgts = (typeof targets') || c.startsWith('const STATUSES = [')));
  }

  /**
   * One-time: world copies of the buff Spells get the Tracker hit macro. A hit macro the table wrote itself
   * is left alone. Active GM only, guarded by `spellTrackerMacrosMigrated`.
   */
  static async migrateWorldSpells() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'spellTrackerMacrosMigrated')) return;
    const { isCopyOf } = await import('./source-id.mjs');

    for (const item of this.#worldSpells()) {
      try {
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

  /**
   * One-time (guard `spellStatusRulesMigrated3`, bumped for Bless): world copies of Bless (not runAsGM) / Hold / Control / Zap / Cure / Hymn swap the old
   * inline status script for their `system:spell.<key>` handler (Hold also turns on dice scaling: extra dice =
   * extra Levels). Live Trackers drop the old "cast by" description override (it hid the rule text) and Guide's
   * blanket Favor change (now the sight-only vote in `targetingVotes`).
   */
  static async migrateStatusSpells() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'spellStatusRulesMigrated3')) return;
    const { isCopyOf } = await import('./source-id.mjs');

    for (const item of this.#worldSpells()) {
      try {
        const id = Object.keys(this.STATUS_SPELLS).find(sid => isCopyOf(item, sid, this.#SPELL_NAMES[sid]));
        if (!id || !this.#isStockStatusScript(item.system.hitMacro?.command)) continue;
        const key = this.STATUS_SPELLS[id];
        const update = {
          // Bless reads its picks on the clicker's client, then relays itself to the GM
          'system.hitMacro': { enabled: true, uuid: '', command: `system:spell.${key}`, label: item.system.hitMacro?.label || item.name, runAsGM: key !== 'bless' },
        };
        // Bless picks its Target Beings and Objects in the Cast dialog
        if (key === 'bless') Object.assign(update, { 'system.targetBeings': true, 'system.targetObjects': true });
        if (key === 'hold' && !item.system.usesDiceScaling) {
          update['system.usesDiceScaling'] = true;
          update['system.diceScaleLabel'] = 'Level';
        }
        await item.update(update);
      } catch (err) {
        console.warn(`vagabond | Status Spells migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }

    for (const actor of this.#actors()) {
      try {
        const updates = [];
        for (const eff of actor.effects) {
          const statusId = [...(eff.statuses ?? [])].find(s => s in this.TRACKERS);
          if (!statusId || !eff.flags?.vagabond?.spellTracker) continue;
          const update = { _id: eff.id, description: '', 'flags.vagabond.flankInfo': false };
          if (statusId === 'guided') update['system.changes'] = [];
          updates.push(update);
        }
        if (updates.length) await actor.updateEmbeddedDocuments('ActiveEffect', updates);
      } catch (err) {
        console.warn(`vagabond | Status Spells migration: skipped effects of ${actor?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'spellStatusRulesMigrated3', true);
  }

  /**
   * Spell Damage / Effect split (2026-10-11): on a Spell, `requiresDamage` now means "only if
   * also Cast to deal damage" (Goop) — no longer "damage got through Armor". These pack Spells'
   * Effect stands alone, so the pack ships their entries with `requiresDamage: false`.
   * Goop keeps `true` and is deliberately absent. Source id → English name (isCopyOf fallback).
   */
  static #EFFECT_STANDALONE_SPELLS = {
    TeYGLxvayzVi3j9X: 'Adhere', YfsJ1lDezffaKVmk: 'Burn', DNSJEgesm0XMCjoj: 'Color', T1WYf4YiYEEYYOnh: 'Confuse',
    tDbOfV4nMk1JeTCG: 'Erupt', AGORAq1SsE2AbQGn: 'Fade', kBgikH1zuMoqe4qj: 'Frostburn', '0SVJ6QW8j6i3JkGe': 'Gas',
    Hwmj6RwmUigPTFAv: 'Hold', '9zgRzjajKw7N0bD9': 'Leech', M0HRBrZaRQ81vcAg: 'Light', oGdK9T2toIepnctx: 'Sprout',
    zqTI6h7qOnAnVTfP: 'Zap',
  };

  /**
   * One-time (guard `spellEffectEntriesMigrated`): world copies of the Spells above clear
   * `requiresDamage` on their causedStatuses / critCausedStatuses — otherwise an effect-only Cast
   * of Burn would read "needs damage in the Cast" and never apply Burning. Active GM only.
   */
  static async migrateSpellEffectEntries() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'spellEffectEntriesMigrated')) return;
    const { isCopyOf } = await import('./source-id.mjs');
    const ids = Object.keys(this.#EFFECT_STANDALONE_SPELLS);

    for (const item of this.#worldSpells()) {
      try {
        if (!ids.some(sid => isCopyOf(item, sid, this.#EFFECT_STANDALONE_SPELLS[sid]))) continue;
        const update = {};
        for (const key of ['causedStatuses', 'critCausedStatuses']) {
          const list = item.system[key] ?? [];
          if (!list.some(e => e.requiresDamage)) continue;
          update[`system.${key}`] = list.map(e => ({ ...e, requiresDamage: false }));
        }
        if (Object.keys(update).length) await item.update(update);
      } catch (err) {
        console.warn(`vagabond | Spell Effect entries migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'spellEffectEntriesMigrated', true);
  }

  /**
   * One-time (guard `spellTargetSwitchesMigrated`): world copies of pack Spells take the pack's Target Beings /
   * Target Objects switches (Cast dialog Target picker), matched by compendium source id.
   */
  static async migrateSpellTargetSwitches() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'spellTargetSwitchesMigrated')) return;
    const pack = game.packs.get('vagabond.spells');
    if (!pack) return;
    const { isCopyOf } = await import('./source-id.mjs');
    const index = await pack.getIndex({ fields: ['system.targetBeings', 'system.targetObjects'] });

    for (const item of this.#worldSpells()) {
      try {
        const src = index.find(e => isCopyOf(item, e._id, e.name));
        if (!src) continue;
        const beings = !!src.system?.targetBeings, objects = !!src.system?.targetObjects;
        if (item.system.targetBeings === beings && item.system.targetObjects === objects) continue;
        await item.update({ 'system.targetBeings': beings, 'system.targetObjects': objects });
      } catch (err) {
        console.warn(`vagabond | Spell Target switches migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'spellTargetSwitchesMigrated', true);
  }

  /**
   * One-time (guard `spellFocusSwitchesMigrated2`): world copies of pack Spells take the pack's Focus switches,
   * Focus on Cast (Effect Spells) and Crit: No Focus ("Crit: Duration is continual"), matched by compendium source id.
   * Only turns them on, never off (a GM may have switched one on).
   */
  static async migrateSpellFocusOnCast() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'spellFocusSwitchesMigrated2')) return;
    const pack = game.packs.get('vagabond.spells');
    if (!pack) return;
    const { isCopyOf } = await import('./source-id.mjs');
    const KEYS = ['focusOnCast', 'critNoFocus'];
    const index = await pack.getIndex({ fields: KEYS.map(k => `system.${k}`) });
    // Pack not rebuilt yet: keep the guard for the next load
    if (!index.some(e => e.system?.critNoFocus && e.system?.focusOnCast)) return;
    const sources = index.filter(e => KEYS.some(k => e.system?.[k]));

    for (const item of this.#worldSpells()) {
      try {
        const src = sources.find(e => isCopyOf(item, e._id, e.name));
        if (!src) continue;
        const update = {};
        for (const k of KEYS) if (src.system[k] && !item.system[k]) update[`system.${k}`] = true;
        if (Object.keys(update).length) await item.update(update);
      } catch (err) {
        console.warn(`vagabond | Spell Focus switches migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'spellFocusSwitchesMigrated2', true);
  }

  /**
   * One-time (guard `spellFocusUpkeepMigrated`): world copies of pack Spells take the pack's Focus Mana
   * (`system.focusUpkeep`: Ward, Polymorph, Beast) and Ward Upcast switch, matched by compendium source id.
   */
  static async migrateSpellFocusUpkeep() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'spellFocusUpkeepMigrated')) return;
    const pack = game.packs.get('vagabond.spells');
    if (!pack) return;
    const { isCopyOf } = await import('./source-id.mjs');
    const index = await pack.getIndex({ fields: ['system.focusUpkeep', 'system.wardUpcast'] });
    // Pack not rebuilt yet: keep the guard for the next load
    if (!index.some(e => e.system?.wardUpcast)) return;
    const sources = index.filter(e => e.system?.wardUpcast || e.system?.focusUpkeep?.mana > 0);

    for (const item of this.#worldSpells()) {
      try {
        const src = sources.find(e => isCopyOf(item, e._id, e.name));
        if (!src) continue;
        const update = {};
        if (src.system.focusUpkeep?.mana > 0 && !(item.system.focusUpkeep?.mana > 0)) {
          update['system.focusUpkeep'] = { ...src.system.focusUpkeep };
        }
        if (src.system.wardUpcast && !item.system.wardUpcast) update['system.wardUpcast'] = true;
        if (Object.keys(update).length) await item.update(update);
      } catch (err) {
        console.warn(`vagabond | Spell Focus Mana migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'spellFocusUpkeepMigrated', true);
  }

  /** Pack Spells whose status entries were corrected against the book text (2026-10-18), by source id. */
  static #STATUS_ENTRY_FIXES = {
    TeYGLxvayzVi3j9X: 'Adhere',     // no Restrained (only "Vulnerable for ending Restrained")
    x2wHc3r9nD8Ubo1S: 'Apoplex',    // continual Berserk is the Crit, not every Cast
    '3H1Rh1UMaBZHunID': 'Goop',     // Burning ticks Acid; Crit Restrained needs no damage
    kBgikH1zuMoqe4qj: 'Frostburn',  // Frostburning (Cold, Speed -10')
    '0SVJ6QW8j6i3JkGe': 'Gas',      // Sickened only while in the area (Spell Surface)
  };

  /**
   * One-time (guard `spellStatusEntriesFixed`): world copies of {@link #STATUS_ENTRY_FIXES} take the pack's
   * `causedStatuses` / `critCausedStatuses`, matched by compendium source id. Waits for a rebuilt pack.
   */
  static async migrateSpellStatusEntries() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'spellStatusEntriesFixed')) return;
    const pack = game.packs.get('vagabond.spells');
    if (!pack) return;
    const { isCopyOf } = await import('./source-id.mjs');
    const ids = Object.keys(this.#STATUS_ENTRY_FIXES);
    const docs = (await Promise.all(ids.map(id => pack.getDocument(id).catch(() => null)))).filter(Boolean);
    // Pack not rebuilt yet: keep the guard for the next load
    if (!docs.some(d => d.system.causedStatuses?.some(e => e.statusId === 'frostburning'))) return;

    for (const item of this.#worldSpells()) {
      try {
        const src = docs.find(d => isCopyOf(item, d.id, this.#STATUS_ENTRY_FIXES[d.id]));
        if (!src) continue;
        await item.update({
          'system.causedStatuses': foundry.utils.deepClone(src.system.causedStatuses ?? []),
          'system.critCausedStatuses': foundry.utils.deepClone(src.system.critCausedStatuses ?? []),
        });
      } catch (err) {
        console.warn(`vagabond | Spell status entries migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'spellStatusEntriesFixed', true);
  }

  /** Every Spell item: sidebar + embedded in every actor (incl. unlinked token actors). */
  static #worldSpells() {
    return [
      ...game.items.contents,
      ...this.#actors().flatMap(a => { try { return Array.from(a.items); } catch { return []; } }),
    ].filter(i => i?.type === 'spell');
  }

  /** Every actor that can carry a Tracker: sidebar actors + unlinked token actors on every scene. */
  static #actors() {
    return [
      ...game.actors.contents,
      ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink && t.actor).map(t => t.actor)),
    ];
  }

  /**
   * The caster stopped Focusing on these Spells: remove every effect those Casts applied (FocusLink stamps —
   * Trackers, statuses, immunities, Silvered…). `held: false` = a Crit made it continual / 1 Minute: it stays.
   */
  static async #onFocusDropped(caster, spellIds) {
    const fromCast = (src) => src && src.held !== false && src.casterUuid === caster.uuid && spellIds.includes(src.spellId);
    for (const actor of this.#actors()) {
      const effects = actor.effects.filter(e => fromCast(e.flags?.vagabond?.spellTracker));
      // Another cleanup may remove the same effect meanwhile (a Spell area's statuses go with the area)
      if (effects.length) await actor.deleteEmbeddedDocuments('ActiveEffect', effects.map(e => e.id).filter(id => actor.effects.has(id)))
        .catch(err => console.warn('vagabond | Focus drop: effect already gone', err));
      // Countdown dice linked to a status that ended with the Focus go too
      for (const statusId of new Set(effects.flatMap(e => [...(e.statuses ?? [])]))) {
        for (const die of StatusHelper.linkedStatusDice(actor, statusId)) await die.delete();
      }
      for (const item of actor.items) {
        const itemIds = item.effects.filter(e => fromCast(e.flags?.vagabond?.spellTracker)).map(e => e.id);
        if (itemIds.length) await item.deleteEmbeddedDocuments('ActiveEffect', itemIds);
      }
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
      // Other things a Focused Cast keeps up (Polymorph forms: DruidHelper), active GM only
      Hooks.callAll('vagabond.focusDropped', actor, dropped);
    });
  }
}
