/**
 * Frostburning — Burning's flames on the metal FRAME in icy blue → cyan → white.
 * Status: `frostburning` (Frostburn). Reuses Burning's `vgbBurnHeat` helper, so it must come after
 * `burning` in the EFFECTS list (index.mjs).
 */
export default {
  id: 'frostburning',
  bit: 0x400,
  label: 'VAGABOND.Ring.Effects.Frostburning',
  region: 'frame',
  state: 'STATE_FROSTBURNING',

  // FRAME: additive cold-fire glow into frameFx.
  apply: `
        float frost = vgbBurnHeat(angle + 1.3, dist);
        vec3 cold = mix(vec3(0.02, 0.12, 0.6), vec3(0.15, 0.65, 1.0), clamp(frost, 0.0, 1.0));
        cold = mix(cold, vec3(0.85, 0.97, 1.0), clamp(frost - 0.8, 0.0, 1.0) * 2.0);  // white-cold tips
        frameFx += cold * frost;
  `
};
