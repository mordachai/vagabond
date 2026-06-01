/**
 * Sickened — green bubbles rising (ascending Y) OVER the token, including the subject.
 * Status: `sickened`.
 */
export default {
  id: 'sickened',
  bit: 0x100,
  label: 'VAGABOND.Ring.Effects.Sickened',
  region: 'overlay',
  state: 'STATE_SICKENED',

  helpers: `
    float vgbHashSick(in vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    // Cell grid of bubbles scrolling upward (so bubbles appear to ascend), with x wobble.
    float vgbSickBubbles(in vec2 uv) {
      vec2 p = uv * 8.0;
      p.y += time * 1.3;                                   // scroll up → bubbles ascend
      vec2 id = floor(p);
      vec2 f = fract(p) - 0.5;
      float rnd = vgbHashSick(id);
      f.x += sin(time * 3.0 + rnd * 6.2831) * 0.15;        // gentle sideways wobble
      float r = 0.12 + 0.18 * rnd;                         // varied bubble size
      float d = length(f);
      float bub = smoothstep(r, r * 0.5, d);
      return bub * step(0.45, rnd);                        // ~half the cells carry a bubble
    }
  `,

  // OVERLAY: additive sickly-green bubbles over the token.
  apply: `
        overlayFx += vec3(0.25, 1.0, 0.35) * vgbSickBubbles(vOrigTextureCoord) * 1.3;
  `
};
