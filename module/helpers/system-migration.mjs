import { isActiveGM } from './gm-relay.mjs';
import { PackSync } from './pack-sync.mjs';

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
const MIGRATIONS = [];

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
