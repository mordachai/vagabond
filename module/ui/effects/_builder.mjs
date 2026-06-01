/**
 * Dynamic token ring effect builder.
 *
 * Assembles ONE custom fragment shader from a list of per-effect descriptor modules (one file
 * each in this folder), plus the status→bit map and the install routine. The core token-ring
 * fragment shader is reconstructed verbatim from
 * canvas/rendering/shaders/samplers/primary/token-ring.mjs (its building blocks are private
 * statics we cannot reference) with three injection points — the three ring surfaces:
 *   - BANDS      → inside colorizeTokenRing, each snippet mutates `gradientColor`
 *                  (vars in scope: angle, dist, redChannel, gradientColor).
 *   - FRAME      → inside colorizeTokenRing, each snippet adds to `frameFx`
 *                  (vars: angle, dist, vOrigTextureCoord, frameFx). Masked to the ring metal
 *                  OUTSIDE the band, applied additively.
 *   - BACKGROUND → inside colorizeTokenBackground, each snippet adds to `bgFx`
 *                  (vars: angle, dist, vOrigTextureCoord, bgFx). Applied to the `-bkg` plate.
 *   - OVERLAY    → end of _main, each snippet adds to `overlayFx`
 *                  (vars: angle, dist, vOrigTextureCoord, overlayFx). Applied OVER everything
 *                  including the token subject, masked to visible token pixels.
 *
 * Each effect descriptor: { id, bit, label, region, state, helpers?, apply }.
 *   - state  : GLSL constant name, e.g. 'STATE_BURNING'.
 *   - helpers: optional GLSL functions injected at file scope (prefix names to avoid clashes).
 *   - apply  : GLSL body run inside `if (hasState(STATE_X)) { … }` in the region's section.
 *
 * Keep the reconstructed core GLSL in sync if Foundry changes the token-ring shader.
 */

const { TokenRing } = foundry.canvas.placeables.tokens;
const { TokenRingSamplerShader } = foundry.canvas.rendering.shaders;

/* -------------------------------------------- */
/*  Shader assembly                              */
/* -------------------------------------------- */

function regionSection(effects, region) {
  return effects
    .filter(e => e.region === region)
    .map(e => `      if ( hasState(${e.state}) ) {\n${e.apply}\n      }`)
    .join('\n');
}

function buildFragmentShader(effects) {
  const stateConstants = effects
    .map(e => `    const uint ${e.state} = 0x${e.bit.toString(16).toUpperCase()}U;`)
    .join('\n');
  const helpers = effects.map(e => e.helpers ?? '').join('\n');
  const bands = regionSection(effects, 'bands');
  const frame = regionSection(effects, 'frame');
  const background = regionSection(effects, 'background');
  const overlay = regionSection(effects, 'overlay');

  return `
    in vec2 vRingTextureCoord;
    in vec2 vBackgroundTextureCoord;
    in vec2 vMaskTextureCoord;
    in vec2 vOrigTextureCoord;
    flat in vec3 vRingColor;
    flat in vec3 vBackgroundColor;
    flat in vec2 vScaleCorrection;
    flat in vec2 vRingColorBand;
    flat in uint vStates;

    uniform sampler2D tokenRingTexture;
    uniform float time;
    uniform bool debugColorBands;

    ${TokenRingSamplerShader.CONSTANTS}
    ${TokenRingSamplerShader.PERCEIVED_BRIGHTNESS}

    const uint STATE_RING_PULSE = 0x02U;
    const uint STATE_RING_GRADIENT = 0x04U;
    const uint STATE_BKG_WAVE = 0x08U;
    const uint STATE_INVISIBLE = 0x10U;
    const uint STATE_COLOR_OVER_SUBJECT = 0x20U;
${stateConstants}

    vec4 colorOverlay;

    bool hasState(in uint state) {
      return (vStates & state) == state;
    }

    vec2 rotation(in vec2 uv, in float angle) {
      uv -= 0.5;
      float s = sin(angle);
      float c = cos(angle);
      return uv * mat2(c, -s, s, c) + 0.5;
    }

    float normalizedCos(in float val) {
      return (cos(val) + 1.0) * 0.5;
    }

    float wave(in float dist) {
      return 0.5 * sin(-time * 4.0 + dist * 100.0) + 0.9;
    }

    vec4 blend(vec4 src, vec4 dst) {
      return src + (dst * (1.0 - src.a));
    }

    /* ---- effect helper functions ---- */
${helpers}

    vec4 colorizeTokenRing(in vec4 tokenRing, in float dist, in float angle) {
      vec3 tokenColor = tokenRing.rgb / max(tokenRing.a, 1e-6);

      vec4 maskTex = texture(tokenRingTexture, vMaskTextureCoord);
      vec3 maskColor = maskTex.rgb / max(maskTex.a, 1e-6);

      float redChannel = (maskTex.a > 0.0) ? maskColor.r : tokenColor.r;

      float pulseFactor = 1.0;
      if ( hasState(STATE_RING_PULSE) ) pulseFactor = cos(time * 2.0) * 0.325 + 0.675;

      vec3 pulseColor = vRingColor * redChannel * pulseFactor;

      vec3 gradientColor = pulseColor;
      if ( hasState(STATE_RING_GRADIENT) ) {
        float gradientMix = smoothstep(0.0, 1.0, dot(rotation(vTextureCoord, time), vec2(0.5)));
        gradientColor = mix(pulseColor, vBackgroundColor * redChannel, gradientMix);
      }

      /* ---- BANDS region effects (mutate gradientColor) ---- */
${bands}

      float mixFactor = step(vRingColorBand.x, dist) - step(vRingColorBand.y, dist);

      if ( hasState(STATE_COLOR_OVER_SUBJECT) ) {
        float mixAdjusted = mixFactor * tokenRing.a;
        if ( maskTex.a > 0.0 ) colorOverlay = vec4(gradientColor, 1.0) * maskTex.a;
        else colorOverlay = vec4(gradientColor, 1.0) * mixAdjusted;
        return tokenRing * (1.0 - mixAdjusted);
      }

      vec4 finalColor = vec4(mix(tokenColor, gradientColor, mixFactor), 1.0) * tokenRing.a;

      if ( maskTex.a > 0.0 ) finalColor = blend(vec4(gradientColor, 1.0) * maskTex.a, finalColor);

      /* ---- FRAME region effects (additive on the ring metal outside the band) ---- */
      float bandRegion = (maskTex.a > 0.0) ? maskTex.a : clamp(mixFactor, 0.0, 1.0);
      float frameMask = tokenRing.a * (1.0 - bandRegion);
      if ( frameMask > 0.0 ) {
        vec3 frameFx = vec3(0.0);
${frame}
        finalColor.rgb += frameFx * frameMask;
      }
      return finalColor;
    }

    vec4 colorizeTokenBackground(in vec4 tokenBackground, in float dist, in float angle) {
      vec3 bgColor = (tokenBackground.a > 0.0) ? tokenBackground.rgb / tokenBackground.a : tokenBackground.rgb;

      float waveFactor = hasState(STATE_BKG_WAVE) ? (0.5 + wave(dist) * 1.5) : 1.0;

      vec3 tintColor = vBackgroundColor.rgb;
      vec3 resultColor = bgColor;

      if ( tintColor != vec3(1.0, 1.0, 1.0) ) {
        resultColor = mix(2.0 * bgColor * tintColor,
                          1.0 - 2.0 * (1.0 - bgColor) * (1.0 - tintColor),
                          step(0.5, bgColor));
      }

      /* ---- BACKGROUND region effects (additive on the -bkg plate) ---- */
      vec3 bgFx = vec3(0.0);
${background}
      resultColor += bgFx;

      return vec4(resultColor, 1.0) * tokenBackground.a * waveFactor;
    }

    vec4 processTokenColor(in vec4 finalColor) {
      if ( !hasState(STATE_INVISIBLE) ) return finalColor;

      float lum = perceivedBrightness(finalColor.rgb);
      vec3 haloColor = vec3(lum) * vec3(0.5, 1.0, 1.0);

      return vec4(haloColor, 1.0) * finalColor.a
                   * (0.55 + normalizedCos(time * 2.0) * 0.25);
    }

    float getTokenTextureClip() {
      return step(0.0, vTextureCoord.x) * step(0.0, vTextureCoord.y) *
             step(vTextureCoord.x, 1.0) * step(vTextureCoord.y, 1.0);
    }

    vec4 _main() {
      vec4 color;
      vec4 result;

      %forloop%

      vec2 scaledDistVec = (vOrigTextureCoord - 0.5) * 2.0 * vScaleCorrection;
      float dist = length(scaledDistVec);
      float angle = atan(scaledDistVec.y, scaledDistVec.x);

      float rectangularMask = step(max(abs(scaledDistVec.x), abs(scaledDistVec.y)), 1.0);

      color *= getTokenTextureClip();

      vec4 alphaAdjustedColor = color * (vColor / vColor.a);

      vec4 processedColor = processTokenColor(alphaAdjustedColor);

      vec4 ringColor = colorizeTokenRing(texture(tokenRingTexture, vRingTextureCoord), dist, angle);
      vec4 backgroundColor = colorizeTokenBackground(texture(tokenRingTexture, vBackgroundTextureCoord), dist, angle);
      vec4 blendedResult = blend(processedColor, blend(ringColor, backgroundColor) * rectangularMask);

      if ( hasState(STATE_COLOR_OVER_SUBJECT) ) blendedResult = blend(colorOverlay * rectangularMask, blendedResult);

      result = blendedResult * vColor.a;

      /* ---- OVERLAY region effects (over everything, incl. the token subject) ---- */
      vec3 overlayFx = vec3(0.0);
${overlay}
      result.rgb += overlayFx * rectangularMask * result.a;

      if ( debugColorBands ) {
        vec2 dbgVec = (vTextureCoord - 0.5) * 2.0 * vScaleCorrection;
        float dbgDist = length(dbgVec);
        result.rgb += vec3(0.0, 0.5, 0.0) * (step(vRingColorBand.x, dbgDist) - step(vRingColorBand.y, dbgDist));
      }

      return result;
    }
  `;
}

/**
 * Build the custom ring shader class from the effect list.
 * @param {object[]} effects  Effect descriptor modules.
 * @returns {typeof TokenRingSamplerShader}
 */
export function buildRingShaderClass(effects) {
  const fragment = buildFragmentShader(effects);
  return class VagabondTokenRingShader extends TokenRingSamplerShader {
    static _batchFragmentShader = fragment;
  };
}

/* -------------------------------------------- */
/*  Status map + install                         */
/* -------------------------------------------- */

/**
 * Build the status id → { bit, label, region } map for getRingEffects / config labels.
 * @param {object[]} effects
 */
export function buildStatusMap(effects) {
  return Object.fromEntries(
    effects.map(e => [e.id, { bit: e.bit, label: e.label, region: e.region }])
  );
}

/**
 * Install the effect-bit patch + getRingEffects override + status-change refresh.
 *
 * NOTE: we do NOT subclass TokenRing for ringClass — Foundry calls static methods
 * (createAssetsUVs, etc.) on the configured ringClass and those write private statics
 * (`#ringData`) declared only on TokenRing; a subclass `this` throws. So we keep base
 * TokenRing as ringClass and additively patch its (writable) `effects` slot.
 *
 * @param {Record<string, {bit:number, label:string, region:string}>} statusMap
 */
export function installStatusRingEffects(statusMap) {
  const entries = Object.entries(statusMap);

  // Register each bit on the base ring class so configureVisuals' effect mask
  // (which ANDs against ringClass.effects) preserves it instead of stripping it.
  const patch = {};
  for ( const [status, { bit }] of entries ) {
    const key = status.toUpperCase();
    if ( !(key in TokenRing.effects) ) patch[key] = bit;
  }
  if ( Object.keys(patch).length ) {
    TokenRing.effects = Object.freeze({ ...TokenRing.effects, ...patch });
  }

  const TokenClass = CONFIG.Token.objectClass;
  const baseGetRingEffects = TokenClass.prototype.getRingEffects;

  TokenClass.prototype.getRingEffects = function () {
    const effects = baseGetRingEffects.call(this);
    if ( this.document?.ring?.enabled ) {
      const statuses = this.actor?.statuses;
      if ( statuses?.size ) {
        for ( const [status, { bit }] of entries ) {
          if ( statuses.has(status) ) effects.push(bit);
        }
      }
    }
    return effects;
  };

  // When a mapped status toggles, re-apply ring visuals on that actor's tokens.
  const refresh = (actor) => {
    for ( const token of actor.getActiveTokens(true) ) {
      if ( token.hasDynamicRing ) token.renderFlags.set({ refreshRingVisuals: true });
    }
  };

  // toggleStatusEffect surfaces through ActiveEffect create/delete carrying the status id.
  const statusIds = new Set(entries.map(([status]) => status));
  const carriesMapped = (effect) => {
    const s = effect.statuses ?? effect.parent?.statuses;
    if ( !s?.size ) return false;
    for ( const id of s ) if ( statusIds.has(id) ) return true;
    return false;
  };

  Hooks.on('createActiveEffect', (effect) => {
    if ( effect.parent instanceof Actor && carriesMapped(effect) ) refresh(effect.parent);
  });
  Hooks.on('deleteActiveEffect', (effect) => {
    if ( effect.parent instanceof Actor && carriesMapped(effect) ) refresh(effect.parent);
  });
}
