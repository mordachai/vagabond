/**
 * VagabondSpellSequencer
 * Pure logic for Sequencer-driven spell animations.
 * This file never needs editing when adding new animations — edit sequencer-config.mjs instead.
 */
import { SPELL_FX, getJB2ADefaults } from './sequencer-config.mjs';

// Maps damage types (from CONFIG) to FX schools.
// Unmapped types fall back to 'arcane'.
const AUTO_SCHOOL = {
  fire:     'fire',
  cold:     'cold',
  shock:    'shock',
  acid:     'acid',
  poison:   'poison',
  blunt:    'blunt',
  healing:  'healing',
  necrotic: 'necrotic',
  psychic:  'psychic',
};

export class VagabondSpellSequencer {

  /**
   * Return the active FX config: world setting if saved, JB2A defaults if both
   * modules are present, otherwise empty SPELL_FX structure.
   * @returns {object}
   * @private
   */
  static _getConfig() {
    try {
      const stored = game.settings.get('vagabond', 'sequencerFxConfig');
      if (stored && typeof stored === 'object' && Object.keys(stored).length) {
        return foundry.utils.expandObject(stored);
      }
    } catch { /* setting not ready yet */ }
    // Fall back to JB2A defaults when both modules are present
    if (this.isJB2AAvailable()) {
      const jb2a = getJB2ADefaults();
      if (jb2a) return jb2a;
    }
    return SPELL_FX;
  }

  /**
   * Whether the Sequencer module is installed and active.
   * @returns {boolean}
   */
  static isAvailable() {
    return !!game.modules.get('sequencer')?.active && typeof Sequence !== 'undefined';
  }

  /**
   * Whether the JB2A module (free or Patreon) is installed and active.
   * @returns {boolean}
   */
  static isJB2AAvailable() {
    return !!(game.modules.get('JB2A_DnD5e')?.active || game.modules.get('jb2a_patreon')?.active);
  }

  /**
   * Whether animations are globally enabled for this world (GM setting).
   * @returns {boolean}
   */
  static isEnabledForWorld() {
    try { return !!game.settings.get('vagabond', 'useAnimations'); } catch { return false; }
  }

  /**
   * Whether the current user has FX enabled in their client settings.
   * @returns {boolean}
   */
  static isEnabledForUser() {
    return game.settings.get('vagabond', 'useSequencerFX');
  }

  /**
   * Resolve the FX school for a spell item.
   * Priority: explicit fxSchool field → damage type auto-map → 'arcane'.
   * @param {Item} spellItem
   * @returns {string} school key
   * @private
   */
  static _resolveSchool(spellItem) {
    const explicit = spellItem.system?.fxSchool;
    if (explicit) return explicit;
    const dmg = spellItem.system?.damageType;
    if (dmg && dmg !== '-') return AUTO_SCHOOL[dmg] ?? 'arcane';
    return 'arcane';
  }

  /**
   * Calculate the total delivery distance/size in feet.
   * Reads from CONFIG at runtime — homebrew-safe.
   * @param {string} deliveryType
   * @param {number} increaseCount
   * @returns {number} feet
   * @private
   */
  static _getTotalDistanceFt(deliveryType, increaseCount) {
    const base = CONFIG.VAGABOND.deliveryBaseRanges?.[deliveryType];
    const inc  = CONFIG.VAGABOND.deliveryIncrement?.[deliveryType] ?? 0;
    return (base?.value ?? 0) + (inc * increaseCount);
  }

  /**
   * Token center coords. Uses Token.center (canonical since v10);
   * falls back to document size × grid size for v14 compatibility when
   * the placeable getter is missing or returns undefined.
   * @param {Token} t
   * @returns {{x:number, y:number}}
   * @private
   */
  static _center(t) {
    const c = t?.center;
    if (c && Number.isFinite(c.x) && Number.isFinite(c.y)) return { x: c.x, y: c.y };
    const gs = canvas.dimensions?.size ?? canvas.grid?.size ?? 100;
    const w = (t?.document?.width ?? 1) * gs;
    const h = (t?.document?.height ?? 1) * gs;
    return { x: (t?.x ?? 0) + w / 2, y: (t?.y ?? 0) + h / 2 };
  }

  /**
   * Apply size or scale to an area effect. Computes display dimensions in
   * raw pixels (distanceFt × pxPerFt × cfg.scale multiplier) and calls
   * .size({width, height}). Avoids Sequencer's .size({gridUnits:true}) form,
   * which is broken in v14 for radius/diameter/length effects. 'fixed' mode
   * keeps cfg.scale via .scale().
   * @param {EffectSection} fx
   * @param {number} distanceFt
   * @param {object} cfg
   * @returns {EffectSection}
   * @private
   */
  static _applyAreaSize(fx, distanceFt, cfg) {
    const mode = cfg.scaleMode;
    if (mode === 'fixed' || !distanceFt) return fx.scale(cfg.scale ?? 1);
    const gridPx = canvas.dimensions?.size ?? canvas.grid?.size ?? 100;
    const gridDist = canvas.dimensions?.distance || canvas.scene?.grid?.distance || 5;
    const pxPerFt = gridPx / gridDist;
    const mult = cfg.scale ?? 1; // per-effect tweak multiplier (texture padding etc.)
    if (mode === 'radius') {
      const diameterPx = distanceFt * 2 * pxPerFt * mult;
      return fx.size({ width: diameterPx, height: diameterPx });
    }
    if (mode === 'diameter') {
      const sidePx = distanceFt * pxPerFt * mult;
      return fx.size({ width: sidePx, height: sidePx });
    }
    if (mode === 'length') {
      const lenPx = distanceFt * pxPerFt * mult;
      return fx.size({ width: lenPx });
    }
    return fx.scale(mult);
  }

  /**
   * Apply optional opacity from cfg. PIXI v8 in Foundry v14 made ADD/SCREEN
   * blend modes noticeably brighter; per-effect cfg.opacity dampens this
   * without touching blend modes.
   * @param {EffectSection} fx
   * @param {object} cfg
   * @returns {EffectSection}
   * @private
   */
  static _applyOpacity(fx, cfg) {
    if (cfg?.opacity != null) return fx.opacity(cfg.opacity);
    return fx;
  }

  /**
   * Calculate the centroid position of a set of tokens.
   * @param {Token[]} tokens
   * @returns {{x: number, y: number}|null}
   * @private
   */
  static _centroid(tokens) {
    const n = tokens.length;
    if (!n) return null;
    let sx = 0, sy = 0;
    for (const t of tokens) {
      const c = this._center(t);
      sx += c.x; sy += c.y;
    }
    return { x: sx / n, y: sy / n };
  }

  /**
   * Get the cone direction angle (radians).
   * Reads from the active Region preview if present, otherwise angles toward target centroid.
   * @param {Token} casterToken
   * @param {Token[]} targetTokens
   * @returns {number} angle in degrees (Sequencer uses degrees)
   * @private
   */
  static _getConeDirection(casterToken, targetTokens) {
    // Try to read rotation from active preview Region (cone shape stores direction as shape.rotation)
    const region = canvas.regions?.placeables?.find(r =>
      r.document.getFlag?.('vagabond', 'actorId') === casterToken.actor?.id
    );
    const regionRotation = region?.document?.shapes?.[0]?.rotation;
    if (regionRotation != null) return regionRotation;

    // Fall back: angle toward target centroid
    const centroid = this._centroid(targetTokens);
    if (!centroid) return 0;
    const casterCenter = this._center(casterToken);
    return Math.toDegrees(Math.atan2(centroid.y - casterCenter.y, centroid.x - casterCenter.x));
  }

  /**
   * Add a cast animation on the caster token.
   * @param {Sequence} seq
   * @param {string} school
   * @param {Token} casterToken
   * @private
   */
  static _addCastAnim(seq, school, casterToken) {
    const cfg = this._getConfig().castAnims?.[school];
    if (!cfg?.file) return;
    let fx = seq.effect()
      .file(cfg.file)
      .atLocation(casterToken)
      .scale(cfg.scale ?? 1.0)
      .duration(cfg.duration ?? 600)
      .waitUntilFinished(-200); // slight overlap into area anim
    this._applyOpacity(fx, cfg);
  }

  /**
   * Draw a fixed-thickness beam from srcPos to dstPos.
   * Uses anchor+rotate+scale instead of stretchTo so Y (thickness) stays constant
   * regardless of beam length. Falls back to stretchTo if nativePx is not set.
   * @param {Sequence} seq
   * @param {object} cfg   - { file, nativePx, scale, duration }
   * @param {{x,y}} srcPos
   * @param {{x,y}} dstPos
   * @returns {EffectSection}
   * @private
   */
  static _beamEffect(seq, cfg, srcPos, dstPos) {
    const dx = dstPos.x - srcPos.x;
    const dy = dstPos.y - srcPos.y;
    const dist = Math.hypot(dx, dy);
    if (!dist) return seq.effect().file(cfg.file).atLocation(srcPos).duration(cfg.duration);

    // Y shrinks with distance^0.73, independent of nativePx (which only affects X via stretchTo).
    // Floor at 3 grids so very short beams don't appear oversized.
    // At 3 grids: ~46% of cfg.scale.  At 20 grids: ~11%.
    const gridPx = canvas.dimensions?.size ?? canvas.grid?.size ?? 100;
    const gridsAway = Math.max(3, dist / gridPx);
    const scaleY = (cfg.scale ?? 1) / Math.pow(gridsAway, 0.73);

    let fx = seq.effect()
      .file(cfg.file)
      .atLocation(srcPos)
      .stretchTo(dstPos)
      .scale({ y: scaleY })
      .duration(cfg.duration);

    if (cfg.template) fx = fx.template(cfg.template);
    this._applyOpacity(fx, cfg);
    return fx;
  }

  /**
   * Add an area animation based on delivery type.
   * @param {Sequence} seq
   * @param {string} school
   * @param {string} deliveryType
   * @param {number} distanceFt
   * @param {Token} casterToken
   * @param {Token[]} targetTokens
   * @private
   */
  static _addAreaAnim(seq, school, deliveryType, distanceFt, casterToken, targetTokens) {
    const schoolAnims = this._getConfig().areaAnims?.[school];
    if (!schoolAnims) return;
    const cfg = schoolAnims[deliveryType];
    if (!cfg?.file) return;

    // ── Beam-mode patterns: fixed Y-scale, X scales with distance ────────────
    if (cfg.scaleMode === 'chain') {
      const nodes = [casterToken, ...targetTokens];
      for (let i = 0; i < nodes.length - 1; i++) {
        this._beamEffect(seq, cfg, this._center(nodes[i]), this._center(nodes[i + 1]))
          .waitUntilFinished(-100);
      }
      return;
    }
    if (cfg.scaleMode === 'multiray') {
      for (const target of targetTokens) {
        this._beamEffect(seq, cfg, this._center(casterToken), this._center(target));
      }
      return;
    }

    switch (deliveryType) {
      case 'aura': {
        // attachTo: effect follows caster during duration; centers on token
        // regardless of token size. atLocation(tokenPlaceable) + .size(gridUnits)
        // misbehaves in Sequencer v14 (size collapses to token bounds).
        let fx = seq.effect()
          .file(cfg.file)
          .attachTo(casterToken, { align: 'center', edge: 'on' })
          .duration(cfg.duration);
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'cone': {
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(casterToken)
          .rotate(-this._getConeDirection(casterToken, targetTokens))
          .anchor({ x: 0, y: 0.5 })
          .duration(cfg.duration);
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'sphere': {
        const centroid = this._centroid(targetTokens) ?? this._center(casterToken);
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(centroid)
          .duration(cfg.duration);
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'line': {
        const srcCenter = this._center(casterToken);
        let lineAngle = 0;
        const lineCentroid = this._centroid(targetTokens);
        if (lineCentroid) {
          lineAngle = Math.atan2(lineCentroid.y - srcCenter.y, lineCentroid.x - srcCenter.x);
        }
        const gridPx = canvas.dimensions?.size ?? canvas.grid?.size ?? 100;
        const gridDist = canvas.dimensions?.distance || canvas.scene?.grid?.distance || 5;
        const pxPerFt = gridPx / gridDist;
        const endpoint = {
          x: srcCenter.x + Math.cos(lineAngle) * distanceFt * pxPerFt,
          y: srcCenter.y + Math.sin(lineAngle) * distanceFt * pxPerFt,
        };
        this._beamEffect(seq, cfg, srcCenter, endpoint);
        break;
      }

      case 'cube': {
        const cubeCentroid = this._centroid(targetTokens) ?? this._center(casterToken);
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(cubeCentroid)
          .duration(cfg.duration);
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'glyph': {
        const glyphCenter = this._centroid(targetTokens) ?? this._center(casterToken);
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(glyphCenter)
          .duration(cfg.duration);
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'touch':
        // Beam from caster to each target, then impact at each target
        for (const target of targetTokens) {
          let beam = seq.effect()
            .file(cfg.file)
            .atLocation(this._center(casterToken))
            .stretchTo(this._center(target))
            .duration(cfg.duration);
          this._applyOpacity(beam, cfg);
          let impact = seq.effect()
            .file(cfg.file)
            .atLocation(this._center(target))
            .duration(cfg.duration);
          this._applyAreaSize(impact, distanceFt, cfg);
          this._applyOpacity(impact, cfg);
        }
        break;

      case 'imbue':
        // Glow/fixed on each target (use scaleMode 'chain' or 'multiray' for beam behavior)
        for (const target of targetTokens) {
          let fx = seq.effect()
            .file(cfg.file)
            .atLocation(target)
            .duration(cfg.duration);
          this._applyAreaSize(fx, distanceFt, cfg);
          this._applyOpacity(fx, cfg);
        }
        break;

      case 'remote':
        // Impact on each target
        for (const target of targetTokens) {
          let fx = seq.effect()
            .file(cfg.file)
            .atLocation(target)
            .duration(cfg.duration);
          this._applyAreaSize(fx, distanceFt, cfg);
          this._applyOpacity(fx, cfg);
        }
        break;

      default: {
        // Unknown delivery type — play at caster location as fallback
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(casterToken)
          .duration(cfg.duration);
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }
    }
  }

  /**
   * Play spell FX for a cast event.
   * Silent no-op if Sequencer is unavailable, disabled, or no animations are configured.
   * @param {Item} spellItem - The spell being cast
   * @param {string} deliveryType - The selected delivery type key
   * @param {number} increaseCount - Number of delivery increases
   * @param {Token|null} casterToken - The caster's token on the canvas
   * @param {Token[]} targetTokens - Array of targeted Token objects
   */
  static play(spellItem, deliveryType, increaseCount, casterToken, targetTokens) {
    if (!this.isEnabledForWorld() || !this.isAvailable() || !this.isEnabledForUser()) return;
    if (!casterToken) return;

    const school = this._resolveSchool(spellItem);
    const distanceFt = this._getTotalDistanceFt(deliveryType, increaseCount);

    try {
      const cfg      = this._getConfig();
      const soundCfg = cfg.sounds?.[school];
      const castCfg  = cfg.castAnims?.[school];

      // Cast sound plays immediately at cast time
      if (soundCfg?.cast) {
        foundry.audio.AudioHelper.play({ src: soundCfg.cast, volume: soundCfg.volume ?? 0.6, autoplay: true, loop: false });
      }

      const seq = new Sequence();
      this._addCastAnim(seq, school, casterToken);
      if (deliveryType) {
        this._addAreaAnim(seq, school, deliveryType, distanceFt, casterToken, targetTokens);
      }
      seq.play();

      // Impact sound plays after the cast anim phase ends (mirrors the -200ms waitUntilFinished offset)
      if (deliveryType && soundCfg?.impact) {
        const castDelay = castCfg?.file ? Math.max(0, (castCfg.duration ?? 600) - 200) : 0;
        setTimeout(() => {
          foundry.audio.AudioHelper.play({ src: soundCfg.impact, volume: soundCfg.volume ?? 0.6, autoplay: true, loop: false });
        }, castDelay);
      }
    } catch (err) {
      // Never crash the spell cast due to FX errors
      console.warn('Vagabond | SpellSequencer error (non-fatal):', err);
    }
  }
}
