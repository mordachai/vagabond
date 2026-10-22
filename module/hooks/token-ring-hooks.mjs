import { STATUS_RING_EFFECTS, VagabondTokenRingShader } from '../ui/effects/index.mjs';

/**
 * Custom dynamic token ring styles + status ring effects.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerTokenRingHooks() {
  // Registers custom dynamic token ring styles. Foundry exposes them automatically
  // in the core "Dynamic Token Ring" world setting dropdown (Settings → Token).
  // Must run in this hook — addConfig() throws outside the registration window.
  Hooks.on('initializeDynamicTokenRingConfig', (ringConfig) => {
    const effectsEnabled = game.settings.get('vagabond', 'statusRingEffects');

    // Custom status-driven effect labels (FOCUSING, BURNING, …) — only when effects are enabled.
    const statusEffectLabels = effectsEnabled
      ? Object.fromEntries(Object.entries(STATUS_RING_EFFECTS).map(([status, def]) => [status.toUpperCase(), def.label]))
      : {};

    const gritMetal = new foundry.canvas.placeables.tokens.DynamicRingData({
      id: 'vagabondGritMetal',
      label: 'Vagabond: Grit Metal',
      spritesheet: 'systems/vagabond/assets/rings/grit-metal.json',
      // 5 core effects + (optionally) custom status-driven effects (auto-applied via their statuses).
      effects: {
        RING_PULSE: 'TOKEN.RING.EFFECTS.RING_PULSE',
        RING_GRADIENT: 'TOKEN.RING.EFFECTS.RING_GRADIENT',
        BKG_WAVE: 'TOKEN.RING.EFFECTS.BKG_WAVE',
        INVISIBILITY: 'TOKEN.RING.EFFECTS.INVISIBILITY',
        COLOR_OVER_SUBJECT: 'TOKEN.RING.EFFECTS.COLOR_OVER_SUBJECT',
        ...statusEffectLabels
      },
      // ringClass stays the core TokenRing (subclassing it breaks its private statics).
      // When effects are disabled, omit the custom shader entirely so other animation
      // modules see a vanilla dynamic ring.
      framework: effectsEnabled ? { shaderClass: VagabondTokenRingShader } : {}
    });
    ringConfig.addConfig(gritMetal.id, gritMetal);

    if ( !effectsEnabled ) return;

    // Give the custom shader to the core circular rings too, so the effects work on whatever
    // ring style the GM picks (gated by their radial colorBand instead of a mask).
    for ( const id of ['coreSteel', 'coreBronze'] ) {
      const cfg = ringConfig.getConfig(id);
      if ( !cfg ) continue;
      cfg.framework.shaderClass = VagabondTokenRingShader;
      cfg.effects = { ...cfg.effects, ...statusEffectLabels };
    }
  });
}
