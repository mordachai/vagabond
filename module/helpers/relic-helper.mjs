import { CurrencyHelper } from './currency-helper.mjs';
import { craftingConfig } from './crafting/config.mjs';
import { VagabondChatCard } from './chat-card.mjs';

/**
 * Relic model (docs/crafting-plan.md §4.4/§4.5). Every equipment item carries
 * `system.relic` (added in `base-equipment.mjs`); most just have empty `powers[]`.
 * `RelicHelper.syncHostEffects` is the single choke point that (re)builds a host
 * item's own embedded ActiveEffects from `relic.powers[]` — nothing else creates
 * or deletes an AE flagged `flags.vagabond.relicSource`.
 */
export class RelicHelper {
  /** Equipment "Type" bucket a relic power's `targets` list matches against. */
  static hostTargetKind(item) {
    if (item.system.equipmentType === 'weapon') return 'weapon';
    if (item.system.equipmentType === 'armor') return 'armor';
    if (item.system.isTrinket) return 'trinket';
    return 'any';
  }

  /** Effect keys that, on a weapon host, only count for attacks with that weapon (see `syncHostEffects`). */
  static isWeaponScopedKey(key) {
    return /^system\.universalWeapon/.test(key ?? '');
  }

  /** Whether `powerItem` (a `relicPower`-enabled item) can attach to `hostItem`. */
  static canAttach(hostItem, powerItem) {
    const power = powerItem?.system?.relicPower;
    if (!power?.enabled) return false;
    if (hostItem?.system?.relic?.fabled) return false;
    const targets = power.targets?.length ? power.targets : ['any'];
    if (targets.includes('any')) return true;
    return targets.includes(this.hostTargetKind(hostItem));
  }

  /**
   * Snapshot `powerItem` (a `relics`-pack power item) into the shape stored in
   * `relic.powers[]` — a frozen copy, not a live reference (matches the
   * container-snapshot precedent for stored sub-items elsewhere in this codebase).
   */
  static snapshotPower(powerItem) {
    const power = powerItem.system.relicPower;
    return {
      id: foundry.utils.randomID(),
      sourceUuid: powerItem.uuid,
      name: powerItem.name,
      img: powerItem.img,
      description: powerItem.system.description ?? '',
      value: CurrencyHelper.toCopper(powerItem.system.baseCost), // D11: power value = the power item's own baseCost
      family: power.family,
      rank: power.rank,
      changes: (powerItem.effects ?? []).map(e => ({
        name: e.name,
        applicationMode: e.flags?.vagabond?.applicationMode ?? 'permanent',
        // What one Relic boost adds to this Bonus / Rank (Merchant Midas Touch), see actor `_applyRelicBoost`
        relicBoost: e.flags?.vagabond?.relicBoost ?? null,
        changes: e.system?.changes ?? [],
      })),
      causedStatuses: powerItem.system.causedStatuses ?? [],
      passiveCausedStatuses: powerItem.system.passiveCausedStatuses ?? [],
    };
  }

  /**
   * Attach `powerItem` to `hostItem`: same-family entries are replaced outright at
   * the new value/rank (decision D7 — bonuses are never cumulative), everything
   * else is added alongside. Re-syncs the host's AEs.
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  static async attachPower(hostItem, powerItem) {
    if (!this.canAttach(hostItem, powerItem)) return { ok: false, reason: 'relicTargetMismatch' };
    const snapshot = this.snapshotPower(powerItem);
    await this.applyPowerSnapshot(hostItem, snapshot);
    return { ok: true, power: snapshot };
  }

  /**
   * Apply an already-built power snapshot to `hostItem` (family-replace, D7) and
   * re-sync. Shared by `attachPower` (instant attach from a live power item) and
   * the Relic Forge Project's completion (which only has a snapshot taken back
   * when the Project started).
   */
  static async applyPowerSnapshot(hostItem, snapshot) {
    // Only a real family replaces (a blank family is not a family: those Relics stack side by side)
    const powers = (hostItem.system.relic.powers ?? []).filter(p => !snapshot.family || p.family !== snapshot.family);
    powers.push(snapshot);
    await hostItem.update({ 'system.relic.powers': powers });
    await this.syncHostEffects(hostItem);
  }

  /** Detach a power by id and re-sync. */
  static async detachPower(hostItem, powerId) {
    const powers = (hostItem.system.relic.powers ?? []).filter(p => p.id !== powerId);
    await hostItem.update({ 'system.relic.powers': powers });
    await this.syncHostEffects(hostItem);
  }

  /**
   * Rebuild `hostItem`'s own embedded ActiveEffects (flagged
   * `flags.vagabond.relicSource`) from `relic.powers[]` (+ `relic.sockets[]`
   * crystals, Phase 7 — empty until then). Call after any attach/detach/upgrade.
   */
  static async syncHostEffects(hostItem) {
    const stale = hostItem.effects.filter(e => !!e.flags?.vagabond?.relicSource).map(e => e.id);
    if (stale.length) await hostItem.deleteEmbeddedDocuments('ActiveEffect', stale);

    const creates = [];
    const isWeaponHost = hostItem.system.equipmentType === 'weapon';
    const build = (power, change, changes, applicationMode) => ({
      name: change.name || power.name,
      img: power.img,
      type: 'base',
      system: { changes },
      transfer: true,
      flags: {
        vagabond: {
          applicationMode,
          ...(change.relicBoost ? { relicBoost: change.relicBoost } : {}),
          relicSource: { kind: 'power', id: power.id },
        },
      },
    });
    for (const real of hostItem.system.relic.powers ?? []) {
      // Disguised host (ItemDisguise): a disguised Relic's effects (Cursed, or Unknown Item) carry its disguise name / art
      const disguised = hostItem.system.disguise?.active && real.disguise;
      const power = disguised ? { ...real, name: real.disguise.name, img: real.disguise.img || real.img } : real;
      for (const change of (power.changes ?? []).map(c => (disguised ? { ...c, name: '' } : c))) {
        // On a weapon, "(+N) Weapon"-style changes (`system.universalWeapon*`) belong to THAT weapon only:
        // they become On Use Only instead of boosting every weapon the wielder attacks with.
        const scoped = isWeaponHost && change.applicationMode === 'when-equipped'
          ? (change.changes ?? []).filter(c => this.isWeaponScopedKey(c.key)) : [];
        const rest = (change.changes ?? []).filter(c => !scoped.includes(c));
        if (scoped.length) creates.push(build(power, change, scoped, 'on-use'));
        if (rest.length || !scoped.length) creates.push(build(power, change, rest, change.applicationMode));
      }
    }
    // Sockets (Mana Crystal variant, Phase 7): each slotted crystal's own effects
    // follow the same relicSource shape (kind: 'crystal'). No-op today.
    for (const socket of hostItem.system.relic.sockets ?? []) {
      const crystal = socket?.crystal;
      if (!crystal?.effects?.length) continue;
      for (const e of crystal.effects) {
        creates.push({
          name: e.name,
          img: crystal.img,
          type: 'base',
          system: { changes: e.system?.changes ?? [] },
          transfer: true,
          flags: {
            vagabond: {
              applicationMode: e.flags?.vagabond?.applicationMode ?? 'permanent',
              relicSource: { kind: 'crystal', id: socket.index },
            },
          },
        });
      }
    }

    if (creates.length) await hostItem.createEmbeddedDocuments('ActiveEffect', creates);
  }

  /**
   * Combine (RAW §1 Relics — legendary blacksmith / powerful ritual; docs/crafting-plan.md
   * §4.11). GM-only, no Shift/Materials cost (GM judgement — `note` goes on the chat
   * card as free text). `baseHost` survives with the merged `powers[]` (same family →
   * keep the higher rank, decision D7's "not cumulative" extended to merging;
   * different families → union) and `requiresBond`/`cursed` OR'd together; `otherHost`
   * is deleted. Both must be the same Type (weapon/armor/trinket) and neither may be
   * Fabled.
   * @param {Item} baseHost
   * @param {Item} otherHost
   * @param {object} [opts]
   * @param {string} [opts.note] - GM free-text note for the chat card
   * @returns {Promise<{ok: boolean, reason?: string, result?: Item}>}
   */
  static async combine(baseHost, otherHost, { note = '' } = {}) {
    if (!craftingConfig().relics.combineEnabled) return { ok: false, reason: 'combineDisabled' };
    if (this.hostTargetKind(baseHost) !== this.hostTargetKind(otherHost)) return { ok: false, reason: 'relicCombineTypeMismatch' };
    if (baseHost.system.relic.fabled || otherHost.system.relic.fabled) return { ok: false, reason: 'relicFabled' };

    const byFamily = new Map();
    const unfamilied = [];
    for (const power of [...(baseHost.system.relic.powers ?? []), ...(otherHost.system.relic.powers ?? [])]) {
      if (!power.family) { unfamilied.push(power); continue; }
      const existing = byFamily.get(power.family);
      if (!existing || power.rank > existing.rank) byFamily.set(power.family, power);
    }
    const powers = [...unfamilied, ...byFamily.values()];

    const actor = baseHost.actor;
    await baseHost.update({
      'system.relic.powers': powers,
      'system.relic.requiresBond': baseHost.system.relic.requiresBond || otherHost.system.relic.requiresBond,
      'system.relic.cursed': baseHost.system.relic.cursed || otherHost.system.relic.cursed,
    });
    await this.syncHostEffects(baseHost);
    const otherName = otherHost.name;
    await otherHost.delete();

    if (actor) {
      const card = new VagabondChatCard()
        .setType('generic')
        .setActor(actor)
        .setTitle(game.i18n.localize('VAGABOND.Craft.Modes.Combine.Label'))
        .setSubtitle(actor.name)
        .setDescription(`
          <p>${game.i18n.format('VAGABOND.Craft.Combine.Result', {
            base: `<strong>${foundry.utils.escapeHTML(baseHost.name)}</strong>`,
            other: `<strong>${foundry.utils.escapeHTML(otherName)}</strong>`,
          })}</p>
          ${note ? `<p><em>${foundry.utils.escapeHTML(note)}</em></p>` : ''}
        `);
      await card.send();
    }

    return { ok: true, result: baseHost };
  }

  /** Relics pack ids of the named Relics converted to real weapons / armor (scripts/relics/convert-named.mjs). */
  static NAMED_RELIC_IDS = [
    'MgosRX6hC1yuPgk2', 'qhUZvjK6L4600nPC', 'GIAEgPK6cZ78NpGj', 'RHXLOdGw4z6eFutu', 'Q0SdZ5xpW08UvYbO',
    'Vr4uoSadN44XJtDC', 'BExW3FHlifV9DyKs', '2AYiSZpv9zgjnxOy', 'PX3TNLD71AFsPMvd', 'v2Xt9X5XHIRTT6EU',
    'TYdCmq7MqhgtObbH', 'SZ8vnzEgZjDKJPFO', 'YyyuCEq9Jh38PPne', 'yE1P5c3HDzmCBmKH', '2r0PVv2JDxvmFA0f',
    'BVY2dIGUFzOSEC7z', 'veE33OqrWbIToKU2', 'FAOtcfKozVYLxXVo', 'Q7Ym1DivfmQPID03', 'Y8ogD7RYQqqvt7Iy',
  ];

  /**
   * One-time (guard `namedRelicsMigrated2`): world copies of the named Relics (Dyrnwyn, Elven Chain…) that are
   * still plain `relic` gear (or a pre-release copy with Relic slots) become the pack's weapon / armor with its own
   * effects, matched by compendium source id. Keeps quantity, Bond and inventory position.
   */
  static async migrateNamedRelics() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'namedRelicsMigrated2')) return;
    const pack = game.packs.get('vagabond.relics');
    if (!pack) return;
    const { sourceDocId } = await import('./source-id.mjs');
    const actors = [
      ...game.actors.contents,
      ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink && t.actor).map(t => t.actor)),
    ];
    const items = [
      ...game.items.contents,
      ...actors.flatMap(a => { try { return Array.from(a.items); } catch { return []; } }),
    ].filter(i => i?.type === 'equipment' && (i.system.equipmentType === 'relic' || i.system.relic?.powers?.length)
      && this.NAMED_RELIC_IDS.includes(sourceDocId(i)));

    const sources = new Map();
    for (const item of items) {
      try {
        const id = sourceDocId(item);
        if (!sources.has(id)) sources.set(id, (await pack.getDocument(id))?.toObject());
        const src = sources.get(id);
        if (!src || src.system.equipmentType === 'relic') continue;
        const system = foundry.utils.deepClone(src.system);
        system.quantity = item.system.quantity;
        system.relic.boundTo = item.system.relic?.boundTo ?? '';
        if (item.system.gridPosition !== undefined) system.gridPosition = item.system.gridPosition;
        if (item.system.containerId !== undefined) system.containerId = item.system.containerId;
        await item.update({ name: src.name, img: src.img, system });
        const stale = item.effects.map(e => e.id);
        if (stale.length) await item.deleteEmbeddedDocuments('ActiveEffect', stale);
        if (src.effects?.length) await item.createEmbeddedDocuments('ActiveEffect', src.effects, { keepId: true });
      } catch (err) {
        console.warn(`vagabond | Named Relics migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'namedRelicsMigrated2', true);
  }
}
