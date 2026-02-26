/**
 * VagabondSpellSequencer
 * Pure logic for Sequencer-driven spell animations.
 * This file never needs editing when adding new animations — edit sequencer-config.mjs instead.
 */
import { SPELL_FX } from './sequencer-config.mjs';

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
   * Return the active FX config: world setting if saved, otherwise static SPELL_FX defaults.
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
   * Reads from the active MeasuredTemplate if present, otherwise angles toward target centroid.
   * @param {Token} casterToken
   * @param {Token[]} targetTokens
   * @returns {number} angle in degrees (Sequencer uses degrees)
   * @private
   */
  static _getConeDirection(casterToken, targetTokens) {
    // Try to read from active preview/placed template
    const template = canvas.templates?.placeables?.find(t =>
      t.document.getFlag?.('vagabond', 'actorId') === casterToken.actor?.id
    );
    if (template?.document?.direction != null) return template.document.direction;

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
        const centroid = this._centroid(targetTokens) ?? { x: casterToken.x, y: casterToken.y };
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
        if (targetTokens.length > 0) {
          const t = targetTokens[0];
          lineAngle = Math.atan2(
            (t.y + (t.h ?? 0) / 2) - cCy,
            (t.x + (t.w ?? 0) / 2) - cCx
          );
        }
        const pxPerFt = canvas.grid.size / (canvas.grid.distance || 5);
        const endpoint = {
          x: cCx + Math.cos(lineAngle) * distanceFt * pxPerFt,
          y: cCy + Math.sin(lineAngle) * distanceFt * pxPerFt,
        };
        seq.effect()
          .file(cfg.file)
          .atLocation(casterToken)
          .stretchTo(endpoint)
          .duration(cfg.duration);
        break;
      }

      case 'cube': {
        const cubeCentroid = this._centroid(targetTokens) ?? { x: casterToken.x, y: casterToken.y };
        seq.effect()
          .file(cfg.file)
          .atLocation(cubeCentroid)
          .scale(scale)
          .duration(cfg.duration);
        break;
      }

      case 'glyph': {
        const glyphCenter = this._centroid(targetTokens) ?? { x: casterToken.x, y: casterToken.y };
        seq.effect()
          .file(cfg.file)
          .atLocation(glyphCenter)
          .scale(scale)
          .duration(cfg.duration);
        break;
      }

      case 'touch':
        // Cast anim on caster, then beam + impact per target
        for (const target of targetTokens) {
          seq.effect()
            .file(cfg.file)
            .atLocation(casterToken)
            .stretchTo(target)
            .duration(cfg.duration);
          seq.effect()
            .file(cfg.file)
            .atLocation(target)
            .scale(scale)
            .duration(cfg.duration);
        }
        break;

      case 'imbue':
        // Enchant glow on each target
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
    if (!this.isAvailable() || !this.isEnabledForUser()) return;
    if (!casterToken) return;

    const school = this._resolveSchool(spellItem);
    const distanceFt = this._getTotalDistanceFt(deliveryType, increaseCount);

    try {
      const seq = new Sequence();
      this._addCastAnim(seq, school, casterToken);
      if (deliveryType) {
        this._addAreaAnim(seq, school, deliveryType, distanceFt, casterToken, targetTokens);
      }
      seq.play();
    } catch (err) {
      // Never crash the spell cast due to FX errors
      console.warn('Vagabond | SpellSequencer error (non-fatal):', err);
    }
  }
}
