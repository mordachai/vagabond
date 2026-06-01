/**
 * Charmed — pink hearts floating up OVER the token (including the subject), gently pulsing.
 * Status: `charmed`.
 */
export default {
  id: 'charmed',
  bit: 0x200,
  label: 'VAGABOND.Ring.Effects.Charmed',
  region: 'overlay',
  state: 'STATE_CHARMED',

  helpers: `
    float vgbHashCharm(in vec2 p) {
      return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453);
    }

    // Implicit heart: 1.0 inside the heart curve, 0.0 outside. p centered around origin.
    float vgbHeart(in vec2 p) {
      p *= 1.6;
      p.y += 0.35;
      float x = p.x;
      float y = -p.y;
      float a = x * x + y * y - 1.0;
      float h = a * a * a - x * x * y * y * y;
      return step(h, 0.0);
    }

    // Cell grid of hearts floating upward, each pulsing in size.
    float vgbCharmHearts(in vec2 uv) {
      vec2 p = uv * 6.0;
      p.y += time * 0.8;                                   // float upward
      vec2 id = floor(p);
      vec2 f = fract(p) - 0.5;
      float rnd = vgbHashCharm(id);
      float pulse = 0.85 + 0.15 * sin(time * 4.0 + rnd * 6.2831);
      vec2 hp = (f - vec2((rnd - 0.5) * 0.3, 0.0)) / (0.55 * pulse);
      return vgbHeart(hp) * step(0.5, rnd);                // ~half the cells carry a heart
    }
  `,

  // OVERLAY: additive pink hearts over the token.
  apply: `
        overlayFx += vec3(1.0, 0.25, 0.55) * vgbCharmHearts(vOrigTextureCoord) * 1.2;
  `
};
