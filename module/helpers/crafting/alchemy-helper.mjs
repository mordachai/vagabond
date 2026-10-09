import { isCopyOf } from '../source-id.mjs';
import { CurrencyHelper } from '../currency-helper.mjs';

/**
 * Formula-grant math for the Alchemist's Alchemy feature (RAW §1, docs/crafting-plan.md
 * §4.4). Grants live on the actor's `class` item's `levelFeatures[]` (`formulaAmount` /
 * `formulaValueCap`, added in `module/data/item-class.mjs`) — the actor itself only
 * stores the resulting picks (`system.craft.formulas`, an array of Item uuids).
 */
export class AlchemyHelper {
  /** The actor's equipped `class` item, or null. */
  static classItemOf(actor) {
    return actor?.items?.find(i => i.type === 'class') ?? null;
  }

  /** Total formula picks a `class` item grants by `level` (sum of `formulaAmount` up to it). */
  static formulaGrantsAtLevel(classItem, level) {
    if (!classItem) return 0;
    return (classItem.system?.levelFeatures ?? [])
      .filter(f => (f.level ?? 0) <= level)
      .reduce((sum, f) => sum + (f.formulaAmount || 0), 0);
  }

  /**
   * The value cap (in copper) a formula learned at `level` must be under — from the
   * highest-level granting feature's `formulaValueCap` formula (RAW's own table
   * scales identically across every Alchemy grant, so "the current one" is
   * always what should gate a new pick). Silver formula result × RATES.silver → copper.
   * `rollData` (the actor's, when there is one) is evaluated with its level forced to
   * `level`, so the Level Up dialog and the Character Builder can ask about a level
   * the actor hasn't reached yet.
   */
  static formulaValueCapAtLevel(classItem, level, rollData = {}) {
    if (!classItem) return 0;
    const granting = (classItem.system?.levelFeatures ?? [])
      .filter(f => (f.level ?? 0) <= level && (f.formulaAmount || 0) > 0)
      .sort((a, b) => b.level - a.level);
    const formula = granting[0]?.formulaValueCap;
    if (!formula) return 0;
    try {
      const data = foundry.utils.deepClone(rollData ?? {});
      foundry.utils.setProperty(data, 'attributes.level.value', level);
      const replaced = Roll.replaceFormulaData(String(formula).trim(), data, { missing: 0 });
      const silver = Roll.safeEval(replaced);
      if (silver === null || silver === undefined || isNaN(silver)) return 0;
      return Math.max(0, Math.round(silver) * CurrencyHelper.RATES.silver);
    } catch {
      return 0;
    }
  }

  /** Total formula picks granted by the class at the actor's current level. */
  static formulaGrantsFor(actor) {
    const level = actor?.system?.attributes?.level?.value ?? 1;
    return this.formulaGrantsAtLevel(this.classItemOf(actor), level);
  }

  /** Remaining formula picks (grants minus already-known formulas). */
  static formulaPicksRemaining(actor) {
    const known = actor?.system?.craft?.formulas?.length ?? 0;
    return Math.max(0, this.formulaGrantsFor(actor) - known);
  }

  /** The value cap (in copper) a newly-learned formula must be under at the actor's current level. */
  static formulaValueCapCopper(actor) {
    const level = actor?.system?.attributes?.level?.value ?? 1;
    const classItem = this.classItemOf(actor);
    if (!classItem) return 0;
    return this.formulaValueCapAtLevel(classItem, level, actor.getRollData());
  }

  /** Whether `actor` already knows `uuid` as a formula. */
  static knows(actor, uuid) {
    return (actor?.system?.craft?.formulas ?? []).includes(uuid);
  }

  /**
   * Every Alchemical equipment item across compendiums the GM has enabled for
   * player-facing content — reuses the `characterBuilderCompendiums` world setting
   * (same "content the GM wants to let them use" gate the Character Builder's gear
   * step reads), so a fresh formula picker needs no new settings menu. The RAW rule
   * (Alchemy feature, "Choose 4 Alchemical Items...") only caps which ones the class
   * lets you learn CHEAPLY, not which ones exist — this is the full pick list, value
   * cap is applied separately (per-actor, per-level) by the caller.
   * @returns {Promise<Array<{uuid: string, name: string, img: string, cost: number}>>}
   */
  static async availableAlchemicals() {
    let settings;
    try { settings = game.settings.get('vagabond', 'characterBuilderCompendiums'); } catch { settings = { useAll: true, enabled: [] }; }

    const packs = game.packs.filter(p => p.documentName === 'Item'
      && (settings.useAll || settings.enabled.includes(p.collection)));

    const results = [];
    for (const pack of packs) {
      let index;
      // `system.cost` is DERIVED (material multiplier applied in prepareDerivedData) —
      // compendium indexes only ever carry source fields, so it always reads as
      // undefined there. `baseCost` is the real stored field; alchemicals never carry
      // a material (metal stays 'none', multiplier ×1), so baseCost === cost for them.
      try {
        index = await pack.getIndex({
          fields: ['type', 'system.equipmentType', 'system.baseCost', 'system.alchemicalType', 'system.description', 'system.damageAmount', 'system.damageType', 'system.canExplode', 'system.explodeValues'],
        });
      }
      catch { continue; }
      for (const entry of index) {
        if (entry.type !== 'equipment' || entry.system?.equipmentType !== 'alchemical') continue;
        results.push({
          uuid: entry.uuid,
          name: entry.name,
          img: entry.img,
          cost: CurrencyHelper.toCopper(entry.system?.baseCost),
          alchemicalType: entry.system?.alchemicalType || 'concoction',
          description: entry.system?.description || '',
          damageAmount: entry.system?.damageAmount || '',
          canExplode: !!entry.system?.canExplode,
          explodeValues: entry.system?.explodeValues || '',
          damageType: (entry.system?.damageType && entry.system.damageType !== '-') ? entry.system.damageType : '',
        });
      }
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  /**
   * Learn `uuid` as a known formula — a straight player choice (no Shift, no
   * Materials), gated only by remaining picks, item type, and the value cap.
   * @param {Actor} actor
   * @param {string} uuid
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  static async learnFormula(actor, uuid) {
    if (!uuid) return { ok: false, reason: 'noActor' };
    if (this.knows(actor, uuid)) return { ok: false, reason: 'known' };
    if (this.formulaPicksRemaining(actor) <= 0) return { ok: false, reason: 'noPicksLeft' };

    const source = await fromUuid(uuid);
    if (!source || source.type !== 'equipment' || source.system.equipmentType !== 'alchemical') {
      return { ok: false, reason: 'notAlchemical' };
    }
    const cap = this.formulaValueCapCopper(actor);
    if (CurrencyHelper.toCopper(source.system.cost) > cap) return { ok: false, reason: 'overCap' };

    const formulas = [...(actor.system.craft.formulas ?? []), uuid];
    await actor.update({ 'system.craft.formulas': formulas });
    return { ok: true };
  }

  /**
   * Forget a known formula, freeing up the pick.
   * @param {Actor} actor
   * @param {string} uuid
   * @returns {Promise<{ok: boolean, reason?: string}>}
   */
  static async forgetFormula(actor, uuid) {
    if (!uuid || !this.knows(actor, uuid)) return { ok: false, reason: 'unknown' };
    const formulas = (actor.system.craft.formulas ?? []).filter(u => u !== uuid);
    await actor.update({ 'system.craft.formulas': formulas });
    return { ok: true };
  }

  /**
   * One-time migration: Alchemist class items created before the book revision carry a single
   * combined "Alchemist Features" effect, the invented Potency (L8) text and only one Eureka
   * entry. Replaces description / levelFeatures / skillGrant / effects with the compendium's
   * current set (one switchable effect per automated behavior). Items without the old
   * "Alchemist Features" signature (homebrew edits, already migrated) are left alone; a
   * disabled old effect keeps the new ones disabled. Active GM only; guarded by
   * `alchemistClassMigrated`. If the compendium hasn't been rebuilt yet (no "Potency: Explode"
   * effect) it aborts WITHOUT setting the guard, so it retries on the next load.
   */
  static async migrateAlchemistClass() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'alchemistClassMigrated')) return;

    const source = await game.packs.get('vagabond.classes')?.getDocument('4kXK5bZHEb3PMzLy');
    if (!source?.effects.some(e => e.name === 'Potency: Explode')) return;

    const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };
    const candidates = [
      ...game.items,
      ...game.actors.contents.flatMap(safeItems),
      ...game.scenes.contents.flatMap((s) => s.tokens.contents.filter((t) => !t.actorLink && t.actor)
        .flatMap((t) => safeItems(t.actor))),
    ];

    for (const item of candidates) {
      try {
        if (item.type !== 'class' || !isCopyOf(item, '4kXK5bZHEb3PMzLy', 'Alchemist')) continue;
        const old = item.effects.filter(e => e.name === 'Alchemist Features');
        if (!old.length) continue;
        const wasOff = old.some(e => e.disabled);

        const effects = source.effects.map(e => {
          const data = e.toObject();
          delete data._id;
          delete data._stats;
          if (wasOff) data.disabled = true;
          return data;
        });
        const s = source.system.toObject();
        await item.update({
          'system.description': s.description,
          'system.levelFeatures': s.levelFeatures,
          'system.skillGrant': s.skillGrant,
        });
        await item.deleteEmbeddedDocuments('ActiveEffect', item.effects.map(e => e.id));
        await item.createEmbeddedDocuments('ActiveEffect', effects);
      } catch (err) {
        console.warn(`vagabond | migrateAlchemistClass: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }

    await game.settings.set('vagabond', 'alchemistClassMigrated', true);
  }
}
