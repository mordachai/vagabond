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
    const powers = (hostItem.system.relic.powers ?? []).filter(p => p.family !== snapshot.family);
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
    for (const power of hostItem.system.relic.powers ?? []) {
      for (const change of power.changes) {
        creates.push({
          name: change.name || power.name,
          img: power.img,
          type: 'base',
          system: { changes: change.changes },
          transfer: true,
          flags: {
            vagabond: {
              applicationMode: change.applicationMode,
              relicSource: { kind: 'power', id: power.id },
            },
          },
        });
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
}
