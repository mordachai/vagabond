/**
 * VagabondItemSequencer
 * Per-item Sequencer animations for weapons, alchemicals, and relics.
 * Animation config lives on each item (system.itemFx.*) rather than a global dialog.
 */

import { VagabondFXResolver } from './fx-file-resolver.mjs';
import { VagabondFXDb } from './item-fx-db.mjs';

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
    const eff = seq.effect()
      .file(file)
      .atLocation(srcPos)
      .stretchTo(dstPos)
      .scale({ y: scaleY });
    if (duration) eff.duration(duration);
  }

  /**
   * The projectile a THROW plays: the item's own Throw file when it has one (and its
   * animation is on), else the auto-recognised throw. Always a caster → target flight.
   * Returns null to let the normal Hit spec decide (no throw clip available, or the
   * author's own ranged Hit file on an item that has no Throw file).
   * @param {Item} item
   * @param {object} fx  item.system.itemFx
   * @returns {{spec: string, animType: 'ranged', auto: boolean, thrown: true}|null|undefined}
   *   undefined = no throw opinion (fall back to Hit logic); null = silenced
   * @private
   */
  static _throwSpec(item, fx) {
    const file = fx.throwFile?.trim();
    if (file) return fx.enabled ? { spec: file, animType: 'ranged', auto: false, thrown: true } : null;
    // An author-set Hit file stays in charge when it is already a flight (ranged) or
    // belongs to an Alchemical Item (their Hit file is the thrown effect).
    const ownHit = !!fx.hitFile?.trim()
      && (this._resolveAnimType(item) === 'ranged' || item.system?.equipmentType === 'alchemical');
    if (fx.auto === false || ownHit) return undefined;
    const auto = VagabondFXDb.autoThrownSpec(item);
    return auto ? { spec: auto.path, animType: 'ranged', auto: true, thrown: true } : undefined;
  }

  /**
   * Where a thrown miss lands: a little past the target and off to one side.
   * @param {{x,y}} src  thrower center
   * @param {{x,y}} dst  target center
   * @returns {{x,y}}
   * @private
   */
  static _missPos(src, dst) {
    const dx = dst.x - src.x;
    const dy = dst.y - src.y;
    const dist = Math.hypot(dx, dy) || 1;
    const grid = canvas.grid.size;
    const side = Math.random() < 0.5 ? -1 : 1;
    return {
      x: dst.x + (dx / dist) * grid * 0.75 - (dy / dist) * grid * 0.6 * side,
      y: dst.y + (dy / dist) * grid * 0.75 + (dx / dist) * grid * 0.6 * side,
    };
  }

  /**
   * What an item plays for a hit or a miss.
   *  - Hit: the item's own Hit file when it has one (and its animation is on);
   *    otherwise the auto-recognised animation, unless Auto is off.
   *  - Miss: only an explicit Miss file — auto never invents a miss animation.
   *  - Thrown attacks: the Throw file / auto-recognised throw replaces the Hit
   *    animation (a projectile flies caster → target). A thrown miss with no
   *    explicit Miss file flies the same projectile past the target (`wide`).
   * @param {Item} item
   * @param {boolean} isHit
   * @param {{thrown?: boolean}} [options]
   * @returns {{spec: string, animType: 'melee'|'ranged', auto: boolean, thrown?: boolean, wide?: boolean}|null}
   */
  static specFor(item, isHit, { thrown = false } = {}) {
    const fx = item?.system?.itemFx;
    if (!fx) return null;
    if (thrown) {
      const throwSpec = this._throwSpec(item, fx);
      if (throwSpec === null) return null;
      if (throwSpec) {
        if (isHit) return throwSpec;
        const miss = fx.missFile?.trim();
        if (!miss) return { ...throwSpec, wide: true };
      }
    }
    if (!isHit) {
      const miss = fx.missFile?.trim();
      return miss && fx.enabled ? { spec: miss, animType: this._resolveAnimType(item), auto: false } : null;
    }
    const hit = fx.hitFile?.trim();
    if (hit) return fx.enabled ? { spec: hit, animType: this._resolveAnimType(item), auto: false } : null;
    if (fx.auto === false) return null;
    const auto = VagabondFXDb.autoSpec(item);
    return auto ? { spec: auto.path, animType: auto.animType, auto: true } : null;
  }

  /**
   * Play item FX for a weapon/alchemical/relic attack.
   * Silent no-op if Sequencer is unavailable, disabled, or item has no FX configured.
   * @param {Item} item - The weapon, alchemical, or relic being used
   * @param {Token|null} casterToken - The attacker's canvas token
   * @param {Token[]} targetTokens - Array of targeted Token objects
   * @param {boolean} isHit - Whether the attack landed
   * @param {{thrown?: boolean}} [options] thrown: the attack was a throw — plays a projectile
   */
  static async play(item, casterToken, targetTokens, isHit, { thrown = false } = {}) {
    if (!this.isEnabledForWorld() || !this.isAvailable() || !this.isEnabledForUser()) return;
    if (!casterToken) return;

    const fx = item.system?.itemFx;
    const choice = this.specFor(item, isHit, { thrown });
    if (!choice) return;

    let file       = this._resolveFile(choice.spec);
    const scale    = isHit ? (fx.hitScale    ?? 1.0) : (fx.missScale    ?? 1.0);
    const offsetX  = isHit ? (fx.hitOffsetX  ?? 0)   : 0;
    // Auto-recognised clips run their natural length; a fixed duration would cut them off.
    const duration = choice.auto ? null : (isHit ? (fx.hitDuration ?? 800) : (fx.missDuration ?? 600));
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

    // Pre-expand any wildcard file paths so player clients never browse the filesystem.
    file = VagabondFXDb.expandSpec(file);
    file = await VagabondFXResolver.resolve(file);
    if (!file || (Array.isArray(file) && !file.length)) return;

    const animType = choice.animType;
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
            const eff = seq.effect()
              .file(file)
              .atLocation(hitPos(target))
              .scale(scale);
            if (duration) eff.duration(duration);
          }
        }
      } else if (choice.wide) {
        // Thrown miss: the projectile still flies, landing wide of the target
        const target = targetTokens[0];
        if (!target) return;
        this._beamEffect(seq, file, scale, duration, center(casterToken), this._missPos(center(casterToken), center(target)));
      } else {
        // Miss: play on caster (swing whiff / aborted throw)
        const eff = seq.effect()
          .file(file)
          .atLocation(casterToken)
          .scale(scale);
        if (duration) eff.duration(duration);
      }

      seq.play();
    } catch (err) {
      // Never crash the attack due to FX errors
      console.warn('Vagabond | ItemSequencer animation error (non-fatal):', err);
    }
  }
}
