/**
 * Focusing — multi-arc electrical flicker travelling along the recolorable colour BAND.
 * Status: `focusing` (sustaining spells through Focus).
 */
export default {
  id: 'focusing',
  bit: 0x40,
  label: 'VAGABOND.Ring.Effects.Focusing',
  region: 'bands',
  state: 'STATE_FOCUSING',

  helpers: `
    // Multi-arc electrical flicker. angle: position around the ring [-PI, PI].
    float vgbFocusEnergy(in float angle) {
      float a1 = pow(max(0.0, sin(angle * 1.0 - time * 5.0)), 6.0);
      float a2 = pow(max(0.0, sin(angle * 2.0 + time * 7.0 + 1.7)), 8.0);
      float a3 = pow(max(0.0, sin(angle * 3.0 - time * 9.0 + 3.1)), 10.0);
      float arcs = a1 + a2 + a3;
      float flicker = 0.75 + 0.25 * sin(time * 45.0 + angle * 23.0);
      return arcs * flicker;
    }
  `,

  // BANDS: mutate gradientColor toward electric blue-white.
  apply: `
        float energy = vgbFocusEnergy(angle);
        vec3 electric = mix(gradientColor, vec3(0.6, 0.85, 1.0) * redChannel, clamp(energy, 0.0, 1.0));
        gradientColor = electric * (1.0 + energy * 1.8);
  `
};
