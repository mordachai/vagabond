/**
 * One-time migrations that bring existing class items in a world up to the compendium's book
 * revision. Class items on actors are copies — editing the pack never reaches them.
 *
 * Shared recipe (same as Barbarian / Bard / Dancer): active GM only, guarded by a hidden world
 * setting, aborts WITHOUT setting the guard while the compendium hasn't been rebuilt yet (probe
 * effect missing), matches items by an old-version signature so homebrew-edited or
 * already-migrated classes are left alone, and swaps description / levelFeatures / skillGrant /
 * effects from the compendium doc.
 */

const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };

/** Every class-capable item in the world: world items, actor items, unlinked token actors. */
function worldItems() {
  return [
    ...game.items,
    ...game.actors.contents.flatMap(safeItems),
    ...game.scenes.contents.flatMap((s) => s.tokens.contents.filter((t) => !t.actorLink && t.actor)
      .flatMap((t) => safeItems(t.actor))),
  ];
}

/**
 * @param {object} cfg
 * @param {string} cfg.setting      hidden world setting guarding the run
 * @param {string} cfg.classId      compendium doc id in `vagabond.classes`
 * @param {string} cfg.className    item name to match
 * @param {string} [cfg.probeEffect]   effect name only present once the pack is rebuilt
 * @param {string} [cfg.probeFeature]  level feature name only present once the pack is rebuilt
 * @param {(item: Item) => boolean} cfg.isOld  old-version signature
 * @param {(item: Item, source: Item) => object} [cfg.extraUpdate]  more item updates
 * @param {(item: Item) => Promise<void>} [cfg.afterItem]           follow-up per migrated item
 * @param {() => Promise<void>} [cfg.afterAll]                      follow-up once, after every item
 */
async function migrateClass({ setting, classId, className, probeEffect, probeFeature, isOld, extraUpdate, afterItem, afterAll }) {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', setting)) return;

  const source = await game.packs.get('vagabond.classes')?.getDocument(classId);
  if (!source) return;
  if (probeEffect && !source.effects.some(e => e.name === probeEffect)) return;
  if (probeFeature && !source.system.levelFeatures.some(lf => lf.name === probeFeature)) return;

  for (const item of worldItems()) {
    try {
      if (item.type !== 'class' || item.name !== className || !isOld(item)) continue;

      const effects = source.effects.map(e => {
        const data = e.toObject();
        delete data._id;
        delete data._stats;
        return data;
      });
      const s = source.system.toObject();
      await item.update({
        'system.description': s.description,
        'system.levelFeatures': s.levelFeatures,
        'system.skillGrant': s.skillGrant,
        ...(extraUpdate?.(item, s) ?? {}),
      });
      await item.deleteEmbeddedDocuments('ActiveEffect', item.effects.map(e => e.id));
      await item.createEmbeddedDocuments('ActiveEffect', effects);
      await afterItem?.(item);
    } catch (err) {
      console.warn(`vagabond | migrate ${className}: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  try { await afterAll?.(); } catch (err) { console.warn(`vagabond | migrate ${className}: afterAll failed`, err); }

  await game.settings.set('vagabond', setting, true);
}

/**
 * Mark each Skill in the class's guaranteed Training as trained on the owning character
 * (the Training line of a class can gain a Skill in a rewrite, e.g. Luminary's Influence).
 */
async function trainGuaranteedSkills(item) {
  const actor = item.parent;
  if (actor?.type !== 'character') return;
  const update = {};
  for (const key of item.system.skillGrant?.guaranteed ?? []) {
    if (actor.system.skills?.[key] && !actor.system.skills[key].trained) update[`system.skills.${key}.trained`] = true;
  }
  if (Object.keys(update).length) await actor.update(update);
}

/** Fighter: old Fighting Style (Melee/Ranged Perk) / level-1 Valor → Momentum + Valor effects. */
export function migrateFighterClass() {
  return migrateClass({
    setting: 'fighterClassMigrated',
    classId: 'TiQ8qydxxhedOk09',
    className: 'Fighter',
    probeEffect: 'Momentum: Auto',
    isOld: (item) => item.system.levelFeatures?.some(lf => lf.name === 'Fighting Style (Melee/Ranged Perk)'),
  });
}

/**
 * Druid: old Innervate / Ancient Growth class → Survival casting, 2 × Level Mana, new spell table.
 * Actors that still carry the old default Mana Skill (Mysticism) are moved to Survival, and both
 * Mysticism and Survival (the new guaranteed Training) are marked trained.
 */
export function migrateDruidClass() {
  return migrateClass({
    setting: 'druidClassMigrated',
    classId: 'YhELwGaQYbFGoKAB',
    className: 'Druid',
    probeEffect: 'Beast Mode: Continual',
    isOld: (item) => item.system.levelFeatures?.some(lf => lf.name === 'Innervate')
      // intermediate build: already revised (has Tempest Within) but without the Metamorph effects
      || (item.effects.some(e => e.name === 'Tempest Within') && !item.effects.some(e => e.name === 'Beast Mode: Continual')),
    extraUpdate: (item, s) => ({
      'system.manaSkill': s.manaSkill,
      'system.manaMultiplier': s.manaMultiplier,
      'system.levelSpells': s.levelSpells,
    }),
    // Polymorph spells already on characters are copies: give them the Metamorph button
    afterAll: async () => {
      const source = await game.packs.get('vagabond.spells')?.getDocument('KizGmuUO2gr17fSR');
      const hitMacro = source?.system?.hitMacro?.toObject?.() ?? source?.system?.hitMacro;
      if (!hitMacro?.enabled) return;
      for (const spell of worldItems()) {
        try {
          if (spell.type !== 'spell' || spell.name !== 'Polymorph' || spell.system.hitMacro?.enabled) continue;
          await spell.update({ 'system.hitMacro': hitMacro });
        } catch (err) {
          console.warn(`vagabond | migrate Druid: skipped spell ${spell?.uuid ?? '(unknown)'}`, err);
        }
      }
    },
    afterItem: async (item) => {
      const actor = item.parent;
      if (actor?.type !== 'character') return;
      const update = {};
      if (actor.system.attributes?.manaSkill === 'mysticism') update['system.attributes.manaSkill'] = 'survival';
      // Training: Mysticism, Survival — the new guaranteed pair
      for (const key of ['mysticism', 'survival']) {
        if (actor.system.skills?.[key] && !actor.system.skills[key].trained) update[`system.skills.${key}.trained`] = true;
      }
      if (Object.keys(update).length) await actor.update(update);
    },
  });
}

/**
 * Luminary: old Radiant Healer / Saving Grace / Ever-Cure class → Theurgy (Cast Max 2 + Level), Radiant Healer
 * (healing Spells Explode), Overheal (+ half Level), Ever-Cure by Level, Training Influence + Mysticism.
 * Assured Healer perks already on characters get their (new) Explode-on-1 effect.
 */
export function migrateLuminaryClass() {
  return migrateClass({
    setting: 'luminaryClassMigrated',
    classId: 'RenZwwCL4aT5LFej',
    className: 'Luminary',
    probeFeature: 'Ever-Cure (1 Status)',
    isOld: (item) => item.system.levelFeatures?.some(lf => lf.name === 'Saving Grace'),
    afterItem: trainGuaranteedSkills,
    afterAll: () => addPerkEffects('tQ0QFm3jAAsu8y1i', 'Assured Healer'),
  });
}

/** Gunslinger: old Quick Draw / Skeet Shooter / High Noon class → Deadeye stacks, Shooting Irons, Grit, Bad Medicine. */
export function migrateGunslingerClass() {
  return migrateClass({
    setting: 'gunslingerClassMigrated',
    classId: 'vPSWM9E4F8yjHVea',
    className: 'Gunslinger',
    probeEffect: 'Bad Medicine',
    isOld: (item) => item.system.levelFeatures?.some(lf => lf.name === 'Skeet Shooter'),
    // Quick Draw used to be a class feature; Shooting Irons now grants it as a Perk
    afterItem: async (item) => {
      const actor = item.parent;
      if (actor?.type !== 'character' || actor.items.some(i => i.type === 'perk' && i.name === 'Quick Draw')) return;
      const perk = await game.packs.get('vagabond.perks')?.getDocument('byBDvKpPkrK8ynkE');
      if (perk) await actor.createEmbeddedDocuments('Item', [game.items.fromCompendium(perk)]);
    },
  });
}

/** Hunter: old Overwatch / Quarry / Lethal Precision (three d20s) class → Mark effects, Killer Instinct, Apex Predator. */
export function migrateHunterClass() {
  return migrateClass({
    setting: 'hunterClassMigrated',
    classId: '1qy5vhn6XcajyEZB',
    className: 'Hunter',
    probeEffect: 'Hunter’s Mark',
    isOld: (item) => item.system.levelFeatures?.some(lf => lf.name === 'Overwatch'),
  });
}

/** Give perk items already in the world (copies) the effects the compendium perk now ships. */
async function addPerkEffects(perkId, perkName) {
  const source = await game.packs.get('vagabond.perks')?.getDocument(perkId);
  if (!source?.effects.size) return;
  for (const perk of worldItems()) {
    try {
      if (perk.type !== 'perk' || perk.name !== perkName) continue;
      const missing = source.effects.filter(e => !perk.effects.some(x => x.name === e.name));
      if (!missing.length) continue;
      await perk.createEmbeddedDocuments('ActiveEffect', missing.map(e => {
        const data = e.toObject();
        delete data._id;
        delete data._stats;
        return data;
      }));
    } catch (err) {
      console.warn(`vagabond | migrate perk ${perkName}: skipped ${perk?.uuid ?? '(unknown)'}`, err);
    }
  }
}

/**
 * Ancestries: the seven book ancestries (Human, Dwarf, Elf, Halfling, Draken, Goblin, Orc) → book text,
 * traits / grants and effects. Same recipe as the classes (guard setting, probe, old-version signature
 * per ancestry so homebrew-edited ones are left alone), swapping description / size / type / traits /
 * effects from the `vagabond.ancestries` compendium.
 *
 * Dwarf's Tough is now a Perk grant instead of a trait effect: the old "Tough (Dwarf Trait)" effect is
 * dropped by the swap, so each migrated Dwarf character gets the Tough Perk to keep its +1 HP per Level.
 */
const ANCESTRY_MIGRATIONS = {
  Human: { id: 'kYLA215krVXIgmnd', isOld: (t) => t.some(x => x.name === 'Strong Potential' && !x.description.includes('7.')) },
  Dwarf: { id: 'HfWZFJE9Ifn25UYs', isOld: (t) => t.some(x => x.name === 'Sturdy' && x.description.includes('+1 bonus')) },
  Elf: { id: 'IF9AtzPvbTWx1jk1', isOld: (t) => t.some(x => x.name === 'Ascendancy' && x.description.includes('Arcana, Mysticism')) },
  Halfling: { id: 'L7eJ4jNysVVXHFOt', isOld: (t) => t.some(x => x.name === 'Nimble' && x.description.includes('Incapacitated')) },
  Draken: { id: 'LtZtoLKTbT5X3HZJ', isOld: (t) => t.some(x => x.name === 'Breath Attack' && x.description.startsWith('You can attack')) },
  Goblin: { id: 'vcPfVxMJXWTPteGx', isOld: (t) => t.some(x => x.name === 'Nimble' && x.description.includes('Incapacitated')) },
  Orc: { id: '4b55ZN5hVR3goYRZ', isOld: (t) => t.some(x => x.name === 'Hulking') && !t.some(x => x.description.startsWith('<p>')) },
};

export async function migrateAncestries() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'ancestriesMigrated')) return;

  const pack = game.packs.get('vagabond.ancestries');
  // Probe: Dwarf's Sturdy effect only exists once the pack has been rebuilt
  const probe = await pack?.getDocument(ANCESTRY_MIGRATIONS.Dwarf.id);
  if (!probe?.effects.some(e => e.name === 'Sturdy')) return;

  const sources = {};
  for (const [name, { id }] of Object.entries(ANCESTRY_MIGRATIONS)) sources[name] = await pack.getDocument(id);

  for (const item of worldItems()) {
    try {
      const mig = ANCESTRY_MIGRATIONS[item.name];
      const source = sources[item.name];
      if (item.type !== 'ancestry' || !mig || !source || !mig.isOld(item.system.traits ?? [])) continue;

      const effects = source.effects.map(e => {
        const data = e.toObject();
        delete data._id;
        delete data._stats;
        return data;
      });
      const s = source.system.toObject();
      await item.update({
        'system.description': s.description,
        'system.size': s.size,
        'system.ancestryType': s.ancestryType,
        'system.traits': s.traits,
      });
      await item.deleteEmbeddedDocuments('ActiveEffect', item.effects.map(e => e.id));
      await item.createEmbeddedDocuments('ActiveEffect', effects);

      // Dwarf: the Tough trait effect became the Tough Perk
      const actor = item.parent;
      if (item.name === 'Dwarf' && actor?.type === 'character') {
        const perk = await game.packs.get('vagabond.perks')?.getDocument('FiyuMtwyxLqRdOWm');
        if (perk) await actor.createEmbeddedDocuments('Item', [game.items.fromCompendium(perk)]);
      }
    } catch (err) {
      console.warn(`vagabond | migrate ancestry: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'ancestriesMigrated', true);
}
