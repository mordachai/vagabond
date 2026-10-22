import { VagabondFXResolver } from '../helpers/fx-file-resolver.mjs';
import { LightSource } from '../helpers/light-source.mjs';
import { RageHelper } from '../helpers/rage-helper.mjs';
import { loadJB2ADefaults } from '../helpers/sequencer-config.mjs';
import { VagabondSpellSequencer } from '../helpers/spell-sequencer.mjs';
import { runSystemMigrations } from '../helpers/system-migration.mjs';

/**
 * Ready-time startup: FX defaults, light-source driver, world migrations (active GM), sweeps.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerReadyStartup() {
  Hooks.once('ready', function () {
    if (VagabondSpellSequencer.isAvailable() && VagabondSpellSequencer.isJB2AAvailable()) {
      loadJB2ADefaults();
    }
    VagabondSpellSequencer.warmConfigFiles();
    // This device's FX toggle on the User, so other casters' FX reach (or skip) this client
    VagabondSpellSequencer.syncViewerFlag();
    // GM pre-expands every configured wildcard FX path into the shared world-setting cache
    // so player clients can play those animations without FILES_BROWSE permission.
    VagabondFXResolver.resolveAllConfigured();
    // Light-source realtime burn-down driver (GM-only writes; refresh-safe).
    LightSource.startDriver();
    // Idempotent: hand-switch helper effects stay switchable now that other class effects are locked features.
    RageHelper.flagSwitchableEffects();
    // Idempotent: Aggressor auto/manual twins stop double-counting when both are on.
    RageHelper.syncAggressorTwins();
    // World data → this system version (one version gate, see system-migration.mjs).
    runSystemMigrations().catch((err) => console.error('Vagabond | World migration failed', err));
  });
}
