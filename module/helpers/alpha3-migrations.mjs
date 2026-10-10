/**
 * One-time world migrations for the Core Rulebook v3 Alpha 3 review (ALPHA3_REVIEW.md §6, Phase 1).
 *
 * Same recipe as class-migrations.mjs: active GM only, guarded by a hidden world setting
 * (registered in vagabond.mjs), every document wrapped in try/catch so one bad actor never
 * blocks the rest, guard set only after the full pass.
 */

import { isCopyOf, sourceDocId } from './source-id.mjs';

const safeEffects = (doc) => { try { return Array.from(doc?.effects ?? []); } catch { return []; } };

/** Every actor in the world: sidebar actors + unlinked token actors on every scene. */
function worldActors() {
  return [
    ...game.actors.contents,
    ...game.scenes.contents.flatMap((s) => s.tokens.contents.filter((t) => !t.actorLink && t.actor).map((t) => t.actor)),
  ];
}

const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };

/** Every item in the world: sidebar items, actor items, unlinked token actor items. */
function worldItems() {
  return [...game.items.contents, ...worldActors().flatMap(safeItems)];
}

/** Statuses whose rules changed in Alpha 3 (per-die penalties, Prone, Incapacitated family, attack-only Vulnerable). */
const ALPHA3_STATUSES = ['frightened', 'sickened', 'prone', 'incapacitated', 'paralyzed', 'unconscious',
  'vulnerable', 'flanked', 'blinded', 'restrained', 'dead', 'invisible'];

/**
 * Status effects already on actors are copies made when the status was toggled — they keep the
 * old changes until removed. Rewrite their `system.changes` from the current
 * `CONFIG.VAGABOND.statusEffectDefinitions` entry.
 */
export async function migrateAlpha3Statuses() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3StatusesMigrated')) return;

  const defs = new Map((CONFIG.VAGABOND.statusEffectDefinitions ?? [])
    .filter((d) => ALPHA3_STATUSES.includes(d.id))
    .map((d) => [d.id, d]));

  for (const actor of worldActors()) {
    const updates = [];
    for (const effect of safeEffects(actor)) {
      try {
        // Status toggles only: exactly one status, and not an item-transferred effect
        if (effect.statuses?.size !== 1 || effect.parent !== actor) continue;
        const def = defs.get([...effect.statuses][0]);
        if (!def) continue;
        updates.push({
          _id: effect.id,
          'system.changes': (def.changes ?? []).map((c) => ({
            key: c.key, type: c.type, value: c.value, phase: 'initial', priority: null,
          })),
        });
      } catch (err) {
        console.warn(`vagabond | migrate Alpha 3 statuses: skipped ${effect?.uuid ?? '(unknown)'}`, err);
      }
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments('ActiveEffect', updates);
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 statuses: skipped ${actor?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3StatusesMigrated', true);
}

/** Backpack docs: gear pack copies + the store copies (General Store, Supplier, Supplies). */
const BACKPACK_IDS = new Set(['8o8KVSgpYsNFtGz2', 'NDwqdKvIY95hFuHy', 'PbVdtvsmVjSVzM29', 'mUD0JWpy3Yoo22E0',
  'SOTe5HmmjmTYsljo', 'gKVay8flBKkBD7n9', 'mVXg0HeQ9ZOafMjz']);
const BACKPACK_IMG = 'icons/containers/bags/pack-leather-white-tan.webp';

const BACKPACK_DESC = '<p>1 Slot while held. Worn, it occupies no Slot and adds +3 Slots to your Inventory. You can only benefit from one at a time.</p>';

/**
 * Backpack (p. 83): "1 (held); +3 (worn)". Old copies were 0 Slots with an always-on +2 Inventory
 * effect. Old signature: gear that is a Backpack (English name, compendium source or its icon — a
 * translated copy still matches) with an effect adding 2 `inventory.bonusSlots` (edited copies are
 * left alone). New: 1 Slot carried, no Slot + when-equipped +3 worn. The first one on each actor is
 * put on (worn) so the character keeps the capacity it had.
 */
export async function migrateAlpha3Backpacks() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3BackpackMigrated')) return;

  const wornOn = new Set();
  for (const item of worldItems()) {
    try {
      if (item.type !== 'equipment' || item.system.equipmentType !== 'gear') continue;
      if (item.name !== 'Backpack' && !BACKPACK_IDS.has(sourceDocId(item)) && item.img !== BACKPACK_IMG) continue;
      const effect = item.effects.find(e =>
        e.system.changes?.some(c => c.key === 'system.inventory.bonusSlots' && Number(c.value) === 2));
      if (!effect) continue;

      const actor = item.parent;
      const putOn = actor && !wornOn.has(actor.uuid) && item.system.equipmentState === 'unequipped';
      if (actor && (putOn || item.system.equipmentState !== 'unequipped')) wornOn.add(actor.uuid);

      await item.update({
        'system.baseSlots': 1,
        'system.noSlotsWhenWorn': true,
        'system.handsRequired': 0,
        'system.description': BACKPACK_DESC,
        ...(putOn ? { 'system.equipmentState': 'worn', 'flags.vagabond.equippedAt': Date.now() } : {}),
      });
      await effect.update({
        'system.changes': effect.system.changes.map(c => (c.key === 'system.inventory.bonusSlots' ? { ...c, value: 3 } : c)),
        'flags.vagabond.applicationMode': 'when-equipped',
        description: '<p>Backpack: +3 Inventory Slots while worn.</p>',
      });
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 Backpack: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3BackpackMigrated', true);
}

/** "Rations (1 day)" gear pack doc (now "Ration 1d") + the id its older copies were made from. */
const RATION_ID = 'BhUNyj2nflyVUPIo';
const RATION_OLD_IDS = new Set([RATION_ID, '1aDHjn4GzdhNatAa']);
const RATION_OLD_NAME = 'Rations (1 day)';

/**
 * "Rations (1 day)" became "Ration 1d" (bread loaf icon). Copies already on actors / in the Items
 * directory keep the old name and icon: sync name + img from the gear pack doc and make sure they
 * count as party Supply. Matches on compendium source (so translated copies are covered) or the old
 * English name. Quantity and everything else the player may have edited is left alone. Aborts
 * WITHOUT setting the guard while the gear pack can't be read.
 */
export async function migrateAlpha3Rations() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3RationsMigrated')) return;

  const source = await game.packs.get('vagabond.gear')?.getDocument(RATION_ID);
  if (!source) {
    console.warn('vagabond | migrate Alpha 3 Rations: gear pack Ration doc not found, will retry next load');
    return;
  }

  for (const item of worldItems()) {
    try {
      if (item.type !== 'equipment') continue;
      if (!RATION_OLD_IDS.has(sourceDocId(item)) && item.name !== RATION_OLD_NAME) continue;
      await item.update({
        name: source.name,
        img: source.img,
        'system.isSupply': true,
      });
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 Rations: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3RationsMigrated', true);
}

/** Defense-property perks whose automation is an Active Effect (see DefenseHelper). */
const DEFENSE_PERKS = [
  { id: '0g0Z7XRDrgVzbpdD', name: 'Patience', key: 'system.patienceDefense' },
  { id: 'aHBvA8INtAilA7zH', name: 'Protector', key: 'system.protectorDefense' },
];

/**
 * Patience / Protector perk items already on actors predate their Alpha 3 rewrite: give them the
 * compendium's book text and effect. Aborts WITHOUT setting the guard while the perks pack hasn't
 * been rebuilt (compendium copy missing the effect). Copies that already carry the key are skipped.
 */
export async function migrateAlpha3DefensePerks() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3DefensePerksMigrated')) return;

  const pack = game.packs.get('vagabond.perks');
  if (!pack) return;
  const sources = new Map();
  for (const def of DEFENSE_PERKS) {
    const doc = await pack.getDocument(def.id);
    if (!doc?.effects.some(e => e.system.changes?.some(c => c.key === def.key))) return; // pack not rebuilt yet
    sources.set(def.id, { def, doc });
  }

  for (const item of worldItems()) {
    try {
      if (item.type !== 'perk') continue;
      // By compendium source first (translated copies), else the English name
      const src = sources.get(sourceDocId(item)) ?? sources.get(DEFENSE_PERKS.find(d => d.name === item.name)?.id);
      if (!src) continue;
      if (item.effects.some(e => e.system.changes?.some(c => c.key === src.def.key))) continue;

      const effects = src.doc.effects.map(e => {
        const data = e.toObject();
        delete data._id;
        delete data._stats;
        return data;
      });
      await item.update({ 'system.description': src.doc.system.description });
      await item.createEmbeddedDocuments('ActiveEffect', effects);
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 Defense perks: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3DefensePerksMigrated', true);
}

/**
 * Class items already on actors are copies. Per class: the compendium doc id and an old-version signature
 * (what the Alpha 2 build of the class looked like, so homebrew-edited or already-current copies are left
 * alone). `probe` = a level feature name only present once the pack is rebuilt.
 */
const lfNames = (item) => (item.system.levelFeatures ?? []).map((lf) => lf.name);
const ALPHA3_CLASSES = {
  Alchemist: { id: '4kXK5bZHEb3PMzLy', isOld: (i) => lfNames(i).includes('Eureka (10+)') || !i.system.levelFeatures?.some((lf) => lf.action?.command === 'system:alchemist.catalyze') },
  Barbarian: { id: 'qONUTXY8GwqSEoDw', isOld: (i) => (String(i.system.description).includes('>Rip and Tear</span>') && !String(i.system.description).includes('Aggressor (15’), Rip and Tear')) || i.effects?.some((e) => e.system?.changes?.some((c) => c.key === 'system.spellDamageDieSizeBonus')) },
  Dancer: { id: '8LqHA6iqYBgFmVfJ', isOld: (i) => String(i.system.description).includes('Sandilene') },
  Druid: { id: 'YhELwGaQYbFGoKAB', isOld: (i) => i.system.levelFeatures?.some((lf) => lf.level === 2 && lf.name === 'Savagery (+2)') },
  Fighter: { id: 'TiQ8qydxxhedOk09', isOld: (i) => i.system.levelFeatures?.some((lf) => lf.level === 1 && lf.name === 'Fighting Style' && lf.perkAmount === 2) },
  Gunslinger: { id: 'vPSWM9E4F8yjHVea', isOld: (i) => i.system.levelFeatures?.some((lf) => lf.name.startsWith('Grit') && lf.description.includes('increase your Deadeye')) },
  Hunter: { id: '1qy5vhn6XcajyEZB', isOld: (i) => String(i.system.description).includes('Midline or Backline') },
  Luminary: { id: 'RenZwwCL4aT5LFej', isOld: (i) => i.system.levelFeatures?.some((lf) => lf.name === 'Overheal' && !lf.description.includes('Once per Action')) || !i.effects?.some((e) => e.name === 'Overheal: Excess') },
  Magus: { id: 'gSD4ww0S2NUBbnvo', isOld: (i) => lfNames(i).includes('Spell Parry (10+)') },
  Merchant: { id: 'F26CjqMxgd2fPbv5', isOld: (i) => lfNames(i).includes('Top Shelf') || !i.effects?.some((e) => e.name === 'Midas Touch') },
  Pugilist: { id: 'znHJW6Ern6f463p2', isOld: (i) => lfNames(i).includes('Haymaker (10+)') },
  Revelator: { id: 'yZzChIB5YwQBSOeA', isOld: (i) => String(i.system.description).startsWith('<p><strong>He who') },
  Rogue: { id: 'gwlbYvDMyO0cPA4U', isOld: (i) => lfNames(i).includes('Knack') },
  Sorcerer: { id: '2zrj3IvI0LFNDvEy', isOld: (i) => !lfNames(i).includes('Twinned Spell') && lfNames(i).includes('Quickening (0 Mana)') },
  Vanguard: { id: '8xsWpW29EzAAk100', isOld: (i) => lfNames(i).includes('Wall (Large)') },
  Witch: { id: 'FtE7i0UBBvuMH5ZI', isOld: (i) => lfNames(i).includes('Widdershins (1)') && (!lfNames(i).includes('Soul Link') || !i.effects?.some((e) => e.name === 'Widdershins')) },
  Wizard: { id: 'U3rAxH8vn8tzDblW', isOld: (i) => lfNames(i).includes('Manifold Mind (+1)') && (!lfNames(i).includes('Extracurricular') || i.system.levelFeatures?.some((lf) => lf.name === 'Archwizard' && !lf.action?.enabled)) },
};

/**
 * Class items get the Alpha 3 deltas (ALPHA3_REVIEW.md §2): Eureka 15+/14+/13+, Savagery (+1), Fighting Style as
 * one Perk, Grit paying Deadeye stacks, Overheal once per Action, Spell Parry 15+, Merchant rewrites, Pugilist
 * Haymaker/Moxie/Title Holder, Rogue/Vanguard names, plus the new Sorcerer / Witch / Wizard features. Swaps
 * description / levelFeatures / skillGrant / effects from the compendium doc (the player's per-effect
 * `disabled` choice is kept by effect name). Aborts WITHOUT setting the guard while the classes pack hasn't
 * been rebuilt (probe: the Sorcerer doc must carry Twinned Spell). Runs after the earlier class migrations.
 */
export async function migrateAlpha3Classes() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3ClassesMigrated')) return;

  const pack = game.packs.get('vagabond.classes');
  if (!pack) return;
  const probe = await pack.getDocument(ALPHA3_CLASSES.Sorcerer.id);
  if (!probe?.system.levelFeatures.some((lf) => lf.name === 'Twinned Spell')) return; // pack not rebuilt yet

  const sources = {};
  for (const [name, { id }] of Object.entries(ALPHA3_CLASSES)) sources[name] = await pack.getDocument(id);

  for (const item of worldItems()) {
    try {
      if (item.type !== 'class') continue;
      // By compendium doc id first (a translated copy has a translated name), by name for hand-made copies
      const className = Object.keys(ALPHA3_CLASSES).find((n) => ALPHA3_CLASSES[n].id === sourceDocId(item)) ?? item.name;
      const mig = ALPHA3_CLASSES[className];
      const source = sources[className];
      if (!mig || !source || !mig.isOld(item)) continue;

      const wasOff = new Map(item.effects.map((e) => [e.name, e.disabled]));
      const effects = source.effects.map((e) => {
        const data = e.toObject();
        delete data._id;
        delete data._stats;
        if (wasOff.get(data.name) === true) data.disabled = true;
        return data;
      });
      const s = source.system.toObject();
      await item.update({
        'system.description': s.description,
        'system.levelFeatures': s.levelFeatures,
        'system.skillGrant': s.skillGrant,
      });
      await item.deleteEmbeddedDocuments('ActiveEffect', item.effects.map((e) => e.id));
      await item.createEmbeddedDocuments('ActiveEffect', effects);
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 class: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3ClassesMigrated', true);
}

/**
 * Class items already in the world predate `levelFeatures[].scaleKey` (the scaling-chain id the actor sheet / HUD
 * collapse on, see EnrichmentHelper.classFeatureRows). Copy it by index from the compendium doc (matched by source
 * id, so translated copies are covered) wherever the Level lines up. A copy still holding the old bare English
 * label ("Evasive", "Bad Medicine") gets the pack's labelled name; translated names are left alone. Aborts WITHOUT
 * setting the guard while the classes pack hasn't been rebuilt. Runs after migrateAlpha3Classes.
 */
export async function migrateClassFeatureScaleKeys() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'classFeatureScaleKeysMigrated')) return;

  const pack = game.packs.get('vagabond.classes');
  if (!pack) return;
  const docs = await pack.getDocuments();
  if (!docs.some((d) => d.system.levelFeatures?.some((lf) => lf.scaleKey))) return; // pack not rebuilt yet
  const byId = new Map(docs.map((d) => [d.id, d]));

  for (const item of worldItems()) {
    try {
      if (item.type !== 'class') continue;
      const source = byId.get(sourceDocId(item));
      if (!source) continue;
      const srcFeatures = source.system.levelFeatures;
      let changed = false;
      const levelFeatures = item.system.toObject().levelFeatures.map((lf, i) => {
        const src = srcFeatures[i];
        if (!src?.scaleKey || src.level !== lf.level || lf.scaleKey) return lf;
        changed = true;
        const name = src.name.startsWith(`${lf.name} (`) ? src.name : lf.name;
        return { ...lf, name, scaleKey: src.scaleKey };
      });
      if (changed) await item.update({ 'system.levelFeatures': levelFeatures });
    } catch (err) {
      console.warn(`vagabond | migrate class feature scale keys: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'classFeatureScaleKeysMigrated', true);
}

/**
 * Feature buttons added to the pack after migrateAlpha3Classes already ran (Alchemist Mix): copy a level feature's
 * `action` by index from the compendium doc (matched by source id) onto world class copies whose feature at that
 * index (same Level) has no button yet. Generic: any pack feature button a copy lacks is filled in. Aborts WITHOUT
 * setting the guard while the classes pack hasn't been rebuilt. Runs after migrateClassFeatureScaleKeys.
 */
export async function migrateClassFeatureActions() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'classFeatureActionsMigrated')) return;

  const pack = game.packs.get('vagabond.classes');
  if (!pack) return;
  const probe = await pack.getDocument(ALPHA3_CLASSES.Alchemist.id);
  if (!probe?.system.levelFeatures.some((lf) => lf.action?.command === 'system:alchemist.mix')) return; // pack not rebuilt yet
  const byId = new Map((await pack.getDocuments()).map((d) => [d.id, d]));

  for (const item of worldItems()) {
    try {
      if (item.type !== 'class') continue;
      const source = byId.get(sourceDocId(item));
      if (!source) continue;
      const srcFeatures = source.system.toObject().levelFeatures;
      let changed = false;
      const levelFeatures = item.system.toObject().levelFeatures.map((lf, i) => {
        const src = srcFeatures[i];
        if (!src?.action?.enabled || src.level !== lf.level || lf.action?.enabled) return lf;
        changed = true;
        return { ...lf, action: src.action };
      });
      if (changed) await item.update({ 'system.levelFeatures': levelFeatures });
    } catch (err) {
      console.warn(`vagabond | migrate class feature buttons: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'classFeatureActionsMigrated', true);
}

/**
 * Class effects added to the pack after migrateAlpha3Classes already ran (Revelator Holy Diver: Bless / Exalt).
 * Generic: every pack class effect carrying `flags.vagabond.effectKey` that a world copy (matched by source id)
 * lacks — no effect with that key — is created on the copy. A copy's own effects are never touched. Aborts
 * WITHOUT setting the guard while the classes pack hasn't been rebuilt. Runs after migrateClassFeatureActions.
 */
export async function migrateClassFeatureEffects() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'classFeatureEffectsMigrated')) return;

  const pack = game.packs.get('vagabond.classes');
  if (!pack) return;
  const probe = await pack.getDocument(ALPHA3_CLASSES.Revelator.id);
  if (!probe?.effects.some((e) => e.flags?.vagabond?.effectKey === 'revelator.holyDiver.bless')) return; // pack not rebuilt yet
  const byId = new Map((await pack.getDocuments()).map((d) => [d.id, d]));

  for (const item of worldItems()) {
    try {
      if (item.type !== 'class') continue;
      const source = byId.get(sourceDocId(item));
      if (!source) continue;
      const have = new Set(safeEffects(item).map((e) => e.flags?.vagabond?.effectKey).filter(Boolean));
      const missing = source.effects
        .filter((e) => e.flags?.vagabond?.effectKey && !have.has(e.flags.vagabond.effectKey))
        .map((e) => {
          const data = e.toObject();
          delete data._id;
          delete data._stats;
          return data;
        });
      if (missing.length) await item.createEmbeddedDocuments('ActiveEffect', missing);
    } catch (err) {
      console.warn(`vagabond | migrate class feature effects: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'classFeatureEffectsMigrated', true);
}

/** Class-granted perks whose book text / effects changed in Alpha 3 (Dusted Knuckle explode, Quick Draw Thrown). */
const CLASS_PERKS = [
  { id: 'Lb1ncXSPRRd1wq84', name: 'Dusted Knuckle' },
  { id: 'byBDvKpPkrK8ynkE', name: 'Quick Draw' },
];

/**
 * Perk items already on actors predate the Alpha 3 text: swap in the compendium's book text and (re)create its
 * effects. Aborts WITHOUT setting the guard while the perks pack hasn't been rebuilt (Dusted Knuckle must carry
 * its Explode effect). A copy already holding the compendium text is skipped.
 */
export async function migrateAlpha3ClassPerks() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3ClassPerksMigrated')) return;

  const pack = game.packs.get('vagabond.perks');
  if (!pack) return;
  const sources = new Map();
  for (const def of CLASS_PERKS) sources.set(def.id, { def, doc: await pack.getDocument(def.id) });
  if (!sources.get('Lb1ncXSPRRd1wq84').doc?.effects.size) return; // pack not rebuilt yet

  for (const item of worldItems()) {
    try {
      if (item.type !== 'perk') continue;
      const src = sources.get(sourceDocId(item)) ?? sources.get(CLASS_PERKS.find((d) => d.name === item.name)?.id);
      if (!src?.doc || item.system.description === src.doc.system.description) continue;

      await item.update({ 'system.description': src.doc.system.description });
      const missing = src.doc.effects.filter((e) => !item.effects.some((x) => x.name === e.name));
      if (missing.length) {
        await item.createEmbeddedDocuments('ActiveEffect', missing.map((e) => {
          const data = e.toObject();
          delete data._id;
          delete data._stats;
          return data;
        }));
      }
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 class perks: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3ClassPerksMigrated', true);
}

/** Perks whose book text / prerequisites changed in Alpha 3 (Perks §3, Phase 4). */
const ALPHA3_PERKS = ['Animal Companion', 'Archaeologist', 'Bully', 'Cardistry', 'Diplomat', 'Extrovert', 'Heavy Arms',
  'Mage Slayer', 'Marksmanship', 'Master Chef', 'Medic', 'Medium', 'Mesmer', 'Mounted Combatant', 'Peerless Athlete',
  'Perfect Parry', 'Sage', 'Salbenist', 'Selfless', 'Situational Awareness', 'Skirmisher', 'Strategist', 'Transvection',
  'Treads Lightly', 'Unfailing Guidance'];

/**
 * Perk items already on actors / in the world predate the Alpha 3 text: swap in the compendium's book text and
 * prerequisites and (re)create its effects (Skirmisher's Reflex-penalty and Speed effects). Aborts WITHOUT setting
 * the guard while the perks pack hasn't been rebuilt (Skirmisher must carry its effects). A copy already holding
 * the compendium text is skipped.
 */
export async function migrateAlpha3Perks() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3PerksMigrated')) return;

  const pack = game.packs.get('vagabond.perks');
  if (!pack) return;
  const docs = await pack.getDocuments();
  const sources = new Map(docs.filter((d) => ALPHA3_PERKS.includes(d.name)).map((d) => [d.name, d]));
  if (!sources.get('Skirmisher')?.effects.size) return; // pack not rebuilt yet
  const byId = new Map([...sources.values()].map((d) => [d.id, d]));

  for (const item of worldItems()) {
    try {
      if (item.type !== 'perk') continue;
      const src = byId.get(sourceDocId(item)) ?? sources.get(item.name);
      if (!src || item.system.description === src.system.description) continue;

      await item.update({
        'system.description': src.system.description,
        'system.prerequisites': src.system.toObject().prerequisites,
      });
      const missing = src.effects.filter((e) => !item.effects.some((x) => x.name === e.name));
      if (missing.length) {
        await item.createEmbeddedDocuments('ActiveEffect', missing.map((e) => {
          const data = e.toObject();
          delete data._id;
          delete data._stats;
          return data;
        }));
      }
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 perks: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3PerksMigrated', true);
}

/**
 * Human trait Knack → Aptitude (p. 27). The trait text and grants are unchanged, only the name: rename it on
 * Human ancestry items already in the world. Aborts WITHOUT setting the guard while the ancestries pack hasn't been
 * rebuilt. Items whose Human trait list has no "Knack" (already current / homebrew) are skipped.
 */
export async function migrateAlpha3Ancestries() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3AncestriesMigrated')) return;

  const source = await game.packs.get('vagabond.ancestries')?.getDocument('kYLA215krVXIgmnd');
  if (!source?.system.traits.some((t) => t.name === 'Aptitude')) return; // pack not rebuilt yet

  for (const item of worldItems()) {
    try {
      if (item.type !== 'ancestry' || !isCopyOf(item, 'kYLA215krVXIgmnd', 'Human')) continue;
      const traits = item.system.toObject().traits;
      if (!traits.some((t) => t.name === 'Knack')) continue;
      await item.update({ 'system.traits': traits.map((t) => (t.name === 'Knack' ? { ...t, name: 'Aptitude' } : t)) });
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 ancestry: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3AncestriesMigrated', true);
}

/**
 * Life heals "d6 HP per Mana spent" — no free first die. World copies of the Life Spell get
 * `system.noFreeDie` (the pack ships it). Only the field is written; nothing else on the copy changes.
 */
export async function migrateLifeNoFreeDie() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'lifeNoFreeDieMigrated')) return;

  for (const item of worldItems()) {
    try {
      if (item.type !== 'spell' || item.system.noFreeDie || !isCopyOf(item, 'sBvdMIqhfJcydANC', 'Life')) continue;
      await item.update({ 'system.noFreeDie': true });
    } catch (err) {
      console.warn(`vagabond | migrate Life no-free-die: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'lifeNoFreeDieMigrated', true);
}

/**
 * Vehement Magic ("Damage rolls from Spells you Cast Explode on a roll of 1") now ships a
 * `system.spellDamageExplode` effect. World copies of the Perk get the compendium effect they lack.
 * Aborts WITHOUT setting the guard while the perks pack hasn't been rebuilt.
 */
export async function migrateVehementMagic() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'vehementMagicMigrated')) return;

  const source = await game.packs.get('vagabond.perks')?.getDocument('UhI94xpNrdCln9jR');
  if (!source?.effects.size) return; // pack not rebuilt yet

  for (const item of worldItems()) {
    try {
      if (item.type !== 'perk' || !isCopyOf(item, 'UhI94xpNrdCln9jR', 'Vehement Magic')) continue;
      if (item.effects.some((x) => x.system?.changes?.some((c) => c.key === 'system.spellDamageExplode'))) continue;
      await item.createEmbeddedDocuments('ActiveEffect', source.effects.map((e) => {
        const data = e.toObject();
        delete data._id;
        delete data._stats;
        return data;
      }));
    } catch (err) {
      console.warn(`vagabond | migrate Vehement Magic: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'vehementMagicMigrated', true);
}
