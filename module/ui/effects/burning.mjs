/**
 * Burning — red→orange→yellow flames flickering on the metal FRAME, hotter at the top.
 * Status: `burning`.
 */
export default {
  id: 'burning',
  bit: 0x80,
  label: 'VAGABOND.Ring.Effects.Burning',
  region: 'frame',
  state: 'STATE_BURNING',

  helpers: `
    // Cheap layered-sine turbulence for the fire. p ~ (angle, dist).
    float vgbFireNoise(in vec2 p) {
      return sin(p.x * 8.0  + time * 3.0) * 0.5
           + sin(p.y * 6.0  - time * 4.0) * 0.3
           + sin((p.x + p.y) * 11.0 + time * 5.0) * 0.2;
    }

    // Flame tongues licking the frame, hotter at the top (canvas up = -y → angle ~ -PI/2).
    float vgbBurnHeat(in float angle, in float dist) {
      float up = -sin(angle) * 0.5 + 0.5;                          // 1 at top, 0 at bottom
      float tongues = sin(angle * 9.0 + time * 4.0) * 0.5 + 0.5;   // licking flames around the frame
      float turb = vgbFireNoise(vec2(angle * 2.0, dist * 4.0)) * 0.5 + 0.5;
      return clamp((tongues * 0.5 + turb * 0.5) * (0.45 + up * 0.85), 0.0, 1.5);
    }
  `,

  // FRAME: additive fire glow into frameFx.
  apply: `
        float heat = vgbBurnHeat(angle, dist);
        vec3 fire = mix(vec3(0.7, 0.05, 0.0), vec3(1.0, 0.55, 0.05), clamp(heat, 0.0, 1.0));
        fire = mix(fire, vec3(1.0, 0.9, 0.4), clamp(heat - 0.8, 0.0, 1.0) * 2.0);  // white-hot tips
        frameFx += fire * heat;
  `
};
