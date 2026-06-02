/**
 * VagabondItemSequencer
 * Per-item Sequencer animations for weapons, alchemicals, and relics.
 * Animation config lives on each item (system.itemFx.*) rather than a global dialog.
 */

export class VagabondItemSequencer {

  /**
   * Whether the Sequencer module is installed and active.
   * @returns {boolean}
   */
  static isAvailable() {
    return !!game.modules.get('sequencer')?.active && typeof Sequence !== 'undefined';
  }

  /**
   * Whether item animations are globally enabled for this world (GM setting).
   * @returns {boolean}
   */
  static isEnabledForWorld() {
    try { return !!game.settings.get('vagabond', 'useItemAnimations'); } catch { return false; }
  }

  /**
   * Whether the current user has FX enabled in their client settings.
   * Reuses the shared spell FX client toggle.
   * @returns {boolean}
   */
  static isEnabledForUser() {
    try { return !!game.settings.get('vagabond', 'useSequencerFX'); } catch { return true; }
  }

  /**
   * Resolve animation type for the item.
   * Weapons auto-derive from weaponSkill; alchemicals/relics use the itemFx.animType field.
   * @param {Item} item
   * @returns {'ranged'|'melee'}
   * @private
   */
  static _resolveAnimType(item) {
    const fx = item.system?.itemFx;
    if (fx?.animType && fx.animType !== 'auto') return fx.animType;
    // Auto: derive from weapon skill
    const skill = item.system?.weaponSkill;
    return skill === 'ranged' ? 'ranged' : 'melee';
  }

  /**
   * Parse a pipe-separated file string into a single path or an array for random variation.
   * Sequencer picks randomly when `.file()` receives an array.
   * @param {string} fileStr  e.g. "anim01.webm | anim02.webm | anim03.webm"
   * @returns {string|string[]}
   * @private
   */
  static _resolveFile(fileStr) {
    if (!fileStr) return '';
    const parts = fileStr.split('|').map(s => s.trim()).filter(Boolean);
    return parts.length === 1 ? parts[0] : parts;
  }

  /**
   * Draw a beam from srcPos to dstPos with distance-attenuated Y thickness.
   * Uses the same formula as VagabondSpellSequencer._beamEffect.
   * @param {Sequence} seq
   * @param {string|string[]} file
   * @param {number} scale
   * @param {number} duration
   * @param {{x,y}} srcPos
   * @param {{x,y}} dstPos
   * @private
   */
  static _beamEffect(seq, file, scale, duration, srcPos, dstPos) {
    const dx = dstPos.x - srcPos.x;
    const dy = dstPos.y - srcPos.y;
    const dist = Math.hypot(dx, dy);
    if (!dist) {
      seq.effect().file(file).atLocation(srcPos).scale(scale).duration(duration);
      return;
    }
    // Y shrinks with distance^0.73, floor at 3 grids to avoid oversized short beams.
    const gridsAway = Math.max(3, dist / canvas.grid.size);
    const scaleY = scale / Math.pow(gridsAway, 0.73);
    seq.effect()
      .file(file)
      .atLocation(srcPos)
      .stretchTo(dstPos)
      .scale({ y: scaleY })
      .duration(duration);
  }

  /**
   * Play item FX for a weapon/alchemical/relic attack.
   * Silent no-op if Sequencer is unavailable, disabled, or item has no FX configured.
   * @param {Item} item - The weapon, alchemical, or relic being used
   * @param {Token|null} casterToken - The attacker's canvas token
   * @param {Token[]} targetTokens - Array of targeted Token objects
   * @param {boolean} isHit - Whether the attack landed
   */
  static play(item, casterToken, targetTokens, isHit) {
    if (!this.isEnabledForWorld() || !this.isAvailable() || !this.isEnabledForUser()) return;
    if (!casterToken) return;

    const fx = item.system?.itemFx;
    if (!fx?.enabled) return;

    const file     = this._resolveFile(isHit ? fx.hitFile  : fx.missFile);
    const scale    = isHit ? (fx.hitScale    ?? 1.0) : (fx.missScale    ?? 1.0);
    const offsetX  = isHit ? (fx.hitOffsetX  ?? 0)   : 0;
    const duration = isHit ? (fx.hitDuration ?? 800) : (fx.missDuration ?? 600);
    const sound    = isHit ? fx.hitSound    : fx.missSound;
    const volume   = fx.soundVolume ?? 0.6;

    // Play sound immediately (non-fatal, fires even if no animation file)
    if (sound) {
      try {
        foundry.audio.AudioHelper.play({ src: sound, volume, autoplay: true, loop: false });
      } catch (err) {
        console.warn('Vagabond | ItemSequencer sound error (non-fatal):', err);
      }
    }

    if (!file || (Array.isArray(file) && !file.length)) return;

    const animType = this._resolveAnimType(item);
    const center  = t => t.center ?? { x: t.x, y: t.y };
    const hitPos  = t => ({ x: center(t).x + offsetX,  y: center(t).y });

    try {
      const seq = new Sequence();

      if (isHit) {
        if (animType === 'ranged') {
          // Beam from caster to each target (offset applied to beam endpoint)
          for (const target of targetTokens) {
            this._beamEffect(seq, file, scale, duration, center(casterToken), hitPos(target));
          }
        } else {
          // Impact at each target
          for (const target of targetTokens) {
            seq.effect()
              .file(file)
              .atLocation(hitPos(target))
              .scale(scale)
              .duration(duration);
          }
        }
      } else {
        // Miss: play on caster (swing whiff / aborted throw)
        seq.effect()
          .file(file)
          .atLocation(casterToken)
          .scale(scale)
          .duration(duration);
      }

      seq.play();
    } catch (err) {
      // Never crash the attack due to FX errors
      console.warn('Vagabond | ItemSequencer animation error (non-fatal):', err);
    }
  }
}
