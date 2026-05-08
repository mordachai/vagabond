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
   * Calculate the display scale for an area animation.
   * @param {number} distanceFt
   * @param {number} nativePx
   * @param {string} scaleMode - 'radius' | 'length' | 'diameter' | 'fixed'
   * @returns {number} scale multiplier
   * @private
   */
  static _calcScale(distanceFt, nativePx, scaleMode) {
    if (scaleMode === 'fixed' || !distanceFt || !nativePx) return 1.0;
    const pxPerFt = canvas.grid.size / (canvas.grid.distance || 5);
    switch (scaleMode) {
      case 'radius':   return (distanceFt * 2 * pxPerFt) / nativePx;
      case 'length':
      case 'diameter': return (distanceFt * pxPerFt) / nativePx;
      default:         return 1.0;
    }
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
    return {
      x: tokens.reduce((s, t) => s + t.x + (t.w ?? 0) / 2, 0) / n,
      y: tokens.reduce((s, t) => s + t.y + (t.h ?? 0) / 2, 0) / n,
    };
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
    const casterCenter = {
      x: casterToken.x + (casterToken.w ?? 0) / 2,
      y: casterToken.y + (casterToken.h ?? 0) / 2,
    };
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
    seq.effect()
      .file(cfg.file)
      .atLocation(casterToken)
      .scale(cfg.scale ?? 1.0)
      .duration(cfg.duration ?? 600)
      .waitUntilFinished(-200); // slight overlap into area anim
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
    const gridsAway = Math.max(3, dist / canvas.grid.size);
    const scaleY = (cfg.scale ?? 1) / Math.pow(gridsAway, 0.73);

    let fx = seq.effect()
      .file(cfg.file)
      .atLocation(srcPos)
      .stretchTo(dstPos)
      .scale({ y: scaleY })
      .duration(cfg.duration);

    if (cfg.template) fx = fx.template(cfg.template);
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

    const scale = this._calcScale(distanceFt, cfg.nativePx, cfg.scaleMode);

    // Sequencer's stretchTo rejects Token placeables in Foundry v13 —
    // always use explicit {x, y} center coordinates for both ends.
    const center = t => ({ x: t.x + (t.w ?? 0) / 2, y: t.y + (t.h ?? 0) / 2 });

    // ── Beam-mode patterns: fixed Y-scale, X scales with distance ────────────
    if (cfg.scaleMode === 'chain') {
      const nodes = [casterToken, ...targetTokens];
      for (let i = 0; i < nodes.length - 1; i++) {
        this._beamEffect(seq, cfg, center(nodes[i]), center(nodes[i + 1]))
          .waitUntilFinished(-100);
      }
      return;
    }
    if (cfg.scaleMode === 'multiray') {
      for (const target of targetTokens) {
        this._beamEffect(seq, cfg, center(casterToken), center(target));
      }
      return;
    }

    switch (deliveryType) {
      case 'aura':
        seq.effect()
          .file(cfg.file)
          .atLocation(casterToken)
          .scale(scale)
          .duration(cfg.duration);
        break;

      case 'cone':
        seq.effect()
          .file(cfg.file)
          .atLocation(casterToken)
          .rotate(-this._getConeDirection(casterToken, targetTokens))
          .scale(scale)
          .anchor({ x: 0, y: 0.5 })
          .duration(cfg.duration);
        break;

      case 'sphere': {
        const centroid = this._centroid(targetTokens) ?? center(casterToken);
        seq.effect()
          .file(cfg.file)
          .atLocation(centroid)
          .scale(scale)
          .duration(cfg.duration);
        break;
      }

      case 'line': {
        const cCx = casterToken.x + (casterToken.w ?? 0) / 2;
        const cCy = casterToken.y + (casterToken.h ?? 0) / 2;
        let lineAngle = 0;
        // Fire toward centroid of all targets (matches how templates are aimed)
        const lineCentroid = this._centroid(targetTokens);
        if (lineCentroid) {
          lineAngle = Math.atan2(lineCentroid.y - cCy, lineCentroid.x - cCx);
        }
        const pxPerFt = canvas.grid.size / (canvas.grid.distance || 5);
        const endpoint = {
          x: cCx + Math.cos(lineAngle) * distanceFt * pxPerFt,
          y: cCy + Math.sin(lineAngle) * distanceFt * pxPerFt,
        };
        this._beamEffect(seq, cfg, { x: cCx, y: cCy }, endpoint);
        break;
      }

      case 'cube': {
        const cubeCentroid = this._centroid(targetTokens) ?? center(casterToken);
        seq.effect()
          .file(cfg.file)
          .atLocation(cubeCentroid)
          .scale(scale)
          .duration(cfg.duration);
        break;
      }

      case 'glyph': {
        const glyphCenter = this._centroid(targetTokens) ?? center(casterToken);
        seq.effect()
          .file(cfg.file)
          .atLocation(glyphCenter)
          .scale(scale)
          .duration(cfg.duration);
        break;
      }

      case 'touch':
        // Beam from caster to each target, then impact at each target
        for (const target of targetTokens) {
          seq.effect()
            .file(cfg.file)
            .atLocation(center(casterToken))
            .stretchTo(center(target))
            .duration(cfg.duration);
          seq.effect()
            .file(cfg.file)
            .atLocation(center(target))
            .scale(scale)
            .duration(cfg.duration);
        }
        break;

      case 'imbue':
        // Glow/fixed on each target (use scaleMode 'chain' or 'multiray' for beam behavior)
        for (const target of targetTokens) {
          seq.effect()
            .file(cfg.file)
            .atLocation(target)
            .scale(scale)
            .duration(cfg.duration);
        }
        break;

      case 'remote':
        // Impact on each target
        for (const target of targetTokens) {
          seq.effect()
            .file(cfg.file)
            .atLocation(target)
            .scale(scale)
            .duration(cfg.duration);
        }
        break;

      default:
        // Unknown delivery type — play at caster location as fallback
        seq.effect()
          .file(cfg.file)
          .atLocation(casterToken)
          .scale(scale)
          .duration(cfg.duration);
        break;
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
