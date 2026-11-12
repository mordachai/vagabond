import { isActiveGM } from './gm-relay.mjs';
import { PackSync } from './pack-sync.mjs';
import { sourceDocId } from './source-id.mjs';

/**
 * World migrations behind ONE world setting, `systemMigrationVersion` = the system version whose
 * migrations this world has run. Active GM only, at `ready` (`runSystemMigrations`).
 *
 * New migration = one entry in MIGRATIONS: `{ version: '<release that ships it>', label, run }`.
 * Entries run once, in order, for worlds stored below their `version`; the stored version advances
 * after each one, so a failure stops there and retries on the next load. Never add a guard setting.
 *
 * Worlds older than MIGRATION_FLOOR are not converted: the GM is told to open the world once with
 * that version first. When entries get old, raise the floor and delete the entries at or below it.
 */

/** Oldest world version this release still upgrades. */
export const MIGRATION_FLOOR = '6.8.2';

export const MIGRATION_SETTING = 'systemMigrationVersion';

/** @type {{version: string, label: string, run: () => Promise<void>}[]} */
const MIGRATIONS = [
  { version: '6.10.0', label: 'Alpha 4 ancestries: remove Darksight, Nimble speed and Hulking slot effects; Infravision perk for Dwarf/Goblin/Orc', run: migrateAlpha4Ancestries },
];

/**
 * Alpha 4 ancestries: effects the packs no longer carry. PackSync never deletes effects, so they are removed here
 * from every copy of the ancestry (ids = the ancestry item ids in `packs/_source/ancestries`; effect ids = the removed
 * pack effects, with the change fingerprint as a fallback for copies whose effect ids were regenerated).
 * Squat (Halfling) was a trait without an effect: PackSync handles the trait list.
 */
const ANCESTRY_EFFECTS_REMOVED = {
  HfWZFJE9Ifn25UYs: { ids: ['Dk1wDwarfSight01'], changes: ['system.senses=darksight'] },                       // Dwarf
  vcPfVxMJXWTPteGx: { ids: ['Dk2gGoblinSght02', 'sx07MuawyaLixpAt'], changes: ['system.senses=darksight', 'system.speed.bonus=5'] }, // Goblin
  L7eJ4jNysVVXHFOt: { ids: ['VOv5x6pMJ3UAh8pd'], changes: ['system.speed.bonus=5'] },                          // Halfling
  '4b55ZN5hVR3goYRZ': { ids: ['Dk3oOrcSightEf03', 'TnpQ3eDF0qwfSsI3'], changes: ['system.senses=darksight', 'system.inventory.bonusSlots=2'] }, // Orc
};

/** Delete the removed effects from one ancestry item copy (idempotent). */
async function pruneAncestryItem(item) {
  const rule = ANCESTRY_EFFECTS_REMOVED[sourceDocId(item)];
  if (!rule) return 0;
  const ids = item.effects.filter(e => {
    if (rule.ids.includes(e.id)) return true;
    const ch = e.system?.changes ?? [];
    return ch.length > 0 && ch.every(c => rule.changes.includes(`${c.key}=${c.value}`));
  }).map(e => e.id);
  if (ids.length) await item.deleteEmbeddedDocuments('ActiveEffect', ids);
  return ids.length;
}

async function dropRemovedAncestryEffects() {
  let removed = 0;
  const actors = [...game.actors];
  for (const scene of game.scenes) {
    for (const t of scene.tokens) if (!t.actorLink && t.actor) actors.push(t.actor);
  }
  for (const actor of actors) {
    for (const item of actor.items.filter(i => i.type === 'ancestry')) removed += await pruneAncestryItem(item);
  }
  for (const item of game.items.filter(i => i.type === 'ancestry')) removed += await pruneAncestryItem(item);
  console.log(`Vagabond | Alpha 4 ancestries: removed ${removed} obsolete effect(s)`);
}

/**
 * Alpha 4: Dwarf / Goblin / Orc "gain the Infravision Perk" (it replaced their own Darksight effect), so existing
 * characters of those ancestries get the perk from the system perk compendium (ids = pack `_id`s in
 * `packs/_source/ancestries` / `perks`). Skipped when they already own a copy (by compendium source).
 */
const INFRAVISION_ANCESTRIES = ['HfWZFJE9Ifn25UYs', 'vcPfVxMJXWTPteGx', '4b55ZN5hVR3goYRZ']; // Dwarf, Goblin, Orc
const INFRAVISION_PERK_ID = 'QtU9SmnfbHFmCs6d';

async function grantInfravision() {
  const pack = game.packs.get('vagabond.perks');
  const perk = await pack?.getDocument(INFRAVISION_PERK_ID).catch(() => null);
  if (!perk) { console.warn('Vagabond | Alpha 4 Infravision: perk not found in vagabond.perks, not granted'); return; }
  const actors = game.actors.filter(a => a.type === 'character');
  for (const scene of game.scenes) {
    for (const t of scene.tokens) if (!t.actorLink && t.actor?.type === 'character') actors.push(t.actor);
  }
  let granted = 0;
  for (const actor of actors) {
    if (!actor.items.some(i => i.type === 'ancestry' && INFRAVISION_ANCESTRIES.includes(sourceDocId(i)))) continue;
    if (actor.items.some(i => i.type === 'perk' && sourceDocId(i) === INFRAVISION_PERK_ID)) continue;
    const data = game.items.fromCompendium(perk);
    foundry.utils.setProperty(data, '_stats.compendiumSource', perk.uuid);
    await actor.createEmbeddedDocuments('Item', [data]);
    granted++;
  }
  console.log(`Vagabond | Alpha 4 Infravision: granted to ${granted} character(s)`);
}

async function migrateAlpha4Ancestries() {
  await dropRemovedAncestryEffects();
  await grantInfravision();
}

/**
 * Guard of the last one-guard-per-migration migration (6.8.2). Set = the world ran every migration up
 * to the floor; read from the raw world settings because the old guards are no longer registered.
 */
const LEGACY_LAST_GUARD = 'vagabond.noScrapMigrated';

/** Version of a world that predates `systemMigrationVersion`, or null for a world with no data yet. */
function legacyVersion() {
  const v = game.settings.storage.get('world')?.getSetting(LEGACY_LAST_GUARD)?.value;
  if (v === true || v === 'true') return MIGRATION_FLOOR;
  if (!game.actors.size && !game.items.size) return null;
  return '0';
}

async function store(version) {
  await game.settings.set('vagabond', MIGRATION_SETTING, version);
}

/**
 * Bring the world's data up to this system version. Called once from the `ready` hook.
 * After a system update the compendium copies follow the new packs (`PackSync`): updating = migrating, no opt-out
 * (keep the old version to keep the old data).
 * @returns {Promise<object|null>} the pack sync report when one ran
 */
export async function runSystemMigrations() {
  if (!isActiveGM()) return null;
  const current = game.system.version;
  let stored = game.settings.get('vagabond', MIGRATION_SETTING) || legacyVersion();
  if (stored === null) { await store(current); return null; }
  if (foundry.utils.isNewerVersion(MIGRATION_FLOOR, stored)) { await warnTooOld(stored, current); return null; }
  const updated = foundry.utils.isNewerVersion(current, stored);

  for (const m of MIGRATIONS) {
    if (!foundry.utils.isNewerVersion(m.version, stored)) continue;
    try {
      console.log(`Vagabond | Migration ${m.version}: ${m.label}`);
      await m.run();
    } catch (err) {
      console.error(`Vagabond | Migration ${m.version} (${m.label}) failed`, err);
      ui.notifications.error(game.i18n.format('VAGABOND.Migration.Failed', { label: m.label }));
      return null;
    }
    stored = m.version;
    await store(stored);
  }
  // Compendium copies -> the new packs, edits kept (a failure leaves the version behind so it retries next load)
  let report = null;
  if (updated) {
    try {
      ui.notifications.info(game.i18n.localize('VAGABOND.PackSync.Running'));
      report = await PackSync.runAndStore();
    } catch (err) {
      console.error('Vagabond | Compendium update failed', err);
      ui.notifications.error(game.i18n.localize('VAGABOND.PackSync.Failed'));
      return null;
    }
  }
  if (foundry.utils.isNewerVersion(current, stored) || !game.settings.get('vagabond', MIGRATION_SETTING)) await store(current);
  return report;
}

/** The world predates the floor: explain the upgrade path; the GM may mark it current. */
async function warnTooOld(stored, current) {
  const data = { floor: MIGRATION_FLOOR, current };
  const markCurrent = await foundry.applications.api.DialogV2.confirm({
    window: { title: game.i18n.localize('VAGABOND.Migration.TooOld.Title') },
    content: `<p>${game.i18n.format('VAGABOND.Migration.TooOld.Content', data)}</p>`,
    yes: { label: game.i18n.localize('VAGABOND.Migration.TooOld.MarkCurrent') },
    no: { label: game.i18n.localize('VAGABOND.Migration.TooOld.Later'), default: true },
    rejectClose: false,
  });
  if (markCurrent) await store(current);
  else console.warn(`Vagabond | World data from before ${MIGRATION_FLOOR} (stored: ${stored}); not converted.`);
}
