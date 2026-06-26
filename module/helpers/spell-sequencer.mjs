/**
 * VagabondSpellSequencer
 * Pure logic for Sequencer-driven spell animations.
 * This file never needs editing when adding new animations — edit sequencer-config.mjs instead.
 */
import { SPELL_FX, getJB2ADefaults } from './sequencer-config.mjs';
import { VagabondFXResolver } from './fx-file-resolver.mjs';

// Video metadata cache — keyed by file path. Populated in play() before building the sequence.
const _metaCache = new Map();

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
   * Apply aspect-ratio-correct scale to an area effect.
   * Computes a uniform scale factor so the animation fills the target footprint
   * while preserving the asset's native ratio.
   * 'fixed' mode plays at native size (no scale applied).
   * Falls back to no-op when dimensions are not yet configured.
   * @param {EffectSection} fx
   * @param {number} distanceFt
   * @param {object} cfg
   * @returns {EffectSection}
   * @private
   */
  static _applyAreaSize(fx, distanceFt, cfg) {
    const mode = cfg.scaleMode;
    if (mode === 'fixed' || !distanceFt) return fx;

    const meta = this._getMeta(cfg.file);
    const nativeW = meta?.w ?? cfg.nativeW ?? 0;
    const nativeH = meta?.h ?? cfg.nativeH ?? 0;
    if (!nativeW || !nativeH) return fx;

    // Sequencer's non-stretchTo path multiplies our scale by gridSizeDifference
    // (canvas.grid.size / 100). Use the normalized density (100px default grid /
    // system feet-per-square) so the multiplication cancels out correctly on any
    // scene grid size.
    const normPxPerFt = 100 / (game.system.grid?.distance ?? 5);

    if (mode === 'radius') {
      return fx.scale((distanceFt * 2 * normPxPerFt) / Math.max(nativeW, nativeH));
    }
    if (mode === 'diameter') {
      return fx.scale((distanceFt * normPxPerFt) / Math.max(nativeW, nativeH));
    }
    if (mode === 'length') {
      return fx.scale((distanceFt * normPxPerFt) / nativeW);
    }
    return fx;
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
   * Load and cache video metadata (dimensions + duration) for a real file path.
   * Skips Sequencer database paths (no file extension) silently.
   * @param {string} file
   * @returns {Promise<void>}
   * @private
   */
  static _warmMeta(file) {
    if (!file || _metaCache.has(file)) return Promise.resolve();
    if (!/\.\w{2,5}$/.test(file)) return Promise.resolve(); // Sequencer DB path, skip
    return new Promise(resolve => {
      const v = document.createElement('video');
      v.addEventListener('loadedmetadata', () => {
        _metaCache.set(file, { w: v.videoWidth, h: v.videoHeight, duration: Math.round(v.duration * 1000) });
        v.src = '';
        resolve();
      }, { once: true });
      v.addEventListener('error', () => resolve(), { once: true });
      v.src = file;
    });
  }

  /**
   * Return cached video metadata for a file, or null if not yet loaded / unavailable.
   * @param {string} file
   * @returns {{ w: number, h: number, duration: number }|null}
   * @private
   */
  static _getMeta(file) {
    return _metaCache.get(file) ?? null;
  }

  /**
   * Return the play duration (ms) for a cfg entry.
   * Prefers video metadata; falls back to cfg.duration; falls back to 0 (natural length).
   * @param {object} cfg
   * @returns {number}
   * @private
   */
  static _getDuration(cfg) {
    const meta = this._getMeta(cfg.file);
    if (meta?.duration) return meta.duration;
    return cfg.duration ?? 0;
  }

  /**
   * Pre-warm video metadata for every file currently configured.
   * Called at ready time and whenever the sequencerFxConfig setting changes,
   * so play() never needs to wait for metadata at cast time.
   */
  static warmConfigFiles() {
    if (!this.isAvailable()) return;
    const cfg = this._getConfig();
    const files = new Set();
    for (const entry of Object.values(cfg.castAnims ?? {})) if (entry.file) files.add(entry.file);
    for (const school of Object.values(cfg.areaAnims ?? {}))
      for (const entry of Object.values(school)) if (entry.file) files.add(entry.file);
    for (const f of files) this._warmMeta(f);
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
  static _addCastAnim(seq, school, casterToken, fileMap) {
    let cfg = this._getConfig().castAnims?.[school];
    if (!cfg?.file) return;
    cfg = { ...cfg, file: fileMap?.get(cfg.file) ?? cfg.file };
    let fx = seq.effect()
      .file(cfg.file)
      .atLocation(casterToken)
      .scale(cfg.scale ?? 1.0)
      .duration(this._getDuration(cfg))
      .waitUntilFinished(-200); // slight overlap into area anim
    this._applyOpacity(fx, cfg);
  }

  /**
   * Draw a beam from srcPos to dstPos using Sequencer's native stretchTo.
   * stretchTo handles rotation, positioning, and aspect-ratio-correct scaling
   * (scaleX = scaleY = dist / texture.width) without any manual intervention.
   * @param {Sequence} seq
   * @param {object} cfg   - { file, duration }
   * @param {{x,y}} srcPos
   * @param {{x,y}} dstPos
   * @returns {EffectSection}
   * @private
   */
  static _beamEffect(seq, cfg, srcPos, dstPos) {
    const dist = Math.hypot(dstPos.x - srcPos.x, dstPos.y - srcPos.y);
    if (!dist) return seq.effect().file(cfg.file).atLocation(srcPos).duration(this._getDuration(cfg));

    const fx = seq.effect()
      .file(cfg.file)
      .atLocation(srcPos)
      .stretchTo(dstPos)
      .duration(this._getDuration(cfg));

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
  static _addAreaAnim(seq, school, deliveryType, distanceFt, casterToken, targetTokens, fileMap) {
    const schoolAnims = this._getConfig().areaAnims?.[school];
    if (!schoolAnims) return;
    let cfg = schoolAnims[deliveryType];
    if (!cfg?.file) return;
    cfg = { ...cfg, file: fileMap?.get(cfg.file) ?? cfg.file };

    // ── Beam-mode patterns: fixed Y-scale, X scales with distance ────────────
    if (cfg.scaleMode === 'chain') {
      const nodes = [casterToken, ...targetTokens];
      const chainSeq = new Sequence();
      for (let i = 0; i < nodes.length - 1; i++) {
        let fx = chainSeq.effect()
          .file(cfg.file)
          .attachTo(nodes[i])
          .stretchTo(nodes[i + 1], { attachTo: true })
          .duration(this._getDuration(cfg))
          .waitUntilFinished(-100);
        this._applyOpacity(fx, cfg);
      }
      chainSeq.play();
      return;
    }
    if (cfg.scaleMode === 'multiray') {
      // Fresh sequence per the working Sequencer macro pattern — attachTo + stretchTo
      // misbehaves when added to a sequence that already has waitUntilFinished effects.
      const beamSeq = new Sequence();
      for (const target of targetTokens) {
        let fx = beamSeq.effect()
          .file(cfg.file)
          .attachTo(casterToken)
          .stretchTo(target, { attachTo: true })
          .duration(this._getDuration(cfg));
        this._applyOpacity(fx, cfg);
      }
      beamSeq.play();
      return;
    }

    switch (deliveryType) {
      case 'aura': {
        // attachTo: effect follows caster during duration; centers on token
        // regardless of token size. atLocation(tokenPlaceable) + .size(gridUnits)
        // misbehaves in Sequencer v14 (size collapses to token bounds).
        // Aura radius is measured from the token border (adjacent square), so add
        // 1 grid square so the animation covers the token itself + the N-foot extent.
        const auraGridSizeFt = game.system.grid?.distance ?? 5;
        let fx = seq.effect()
          .file(cfg.file)
          .attachTo(casterToken, { align: 'center', edge: 'on' })
          .duration(this._getDuration(cfg));
        this._applyAreaSize(fx, distanceFt + auraGridSizeFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'cone': {
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(casterToken)
          .rotate(-this._getConeDirection(casterToken, targetTokens))
          .anchor({ x: 0, y: 0.5 })
          .duration(this._getDuration(cfg));
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'sphere': {
        const centroid = this._centroid(targetTokens) ?? this._center(casterToken);
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(centroid)
          .duration(this._getDuration(cfg));
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
        const pxPerFt = canvas.grid.size / (game.system.grid?.distance ?? 5);
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
          .duration(this._getDuration(cfg));
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'glyph': {
        const glyphCenter = this._centroid(targetTokens) ?? this._center(casterToken);
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(glyphCenter)
          .duration(this._getDuration(cfg));
        this._applyAreaSize(fx, distanceFt, cfg);
        this._applyOpacity(fx, cfg);
        break;
      }

      case 'touch':
        // Beam from caster to each target, then impact at each target
        for (const target of targetTokens) {
          this._beamEffect(seq, cfg, this._center(casterToken), this._center(target));
          let impact = seq.effect()
            .file(cfg.file)
            .atLocation(this._center(target))
            .duration(this._getDuration(cfg));
          this._applyOpacity(impact, cfg);
        }
        break;

      case 'imbue':
        // Glow/fixed on each target (use scaleMode 'chain' or 'multiray' for beam behavior)
        for (const target of targetTokens) {
          let fx = seq.effect()
            .file(cfg.file)
            .atLocation(target)
            .duration(this._getDuration(cfg));
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
            .duration(this._getDuration(cfg));
          this._applyAreaSize(fx, distanceFt, cfg);
          this._applyOpacity(fx, cfg);
        }
        break;

      default: {
        // Unknown delivery type — play at caster location as fallback
        let fx = seq.effect()
          .file(cfg.file)
          .atLocation(casterToken)
          .duration(this._getDuration(cfg));
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
   * @param {object} [options]
   * @param {boolean} [options.deliveryEnabled=true] - Whether to play the area anim and delivery
   *   sound. Pass false on a failed spell roll; cast anim and cast sound always play regardless.
   */
  static async play(spellItem, deliveryType, increaseCount, casterToken, targetTokens, options = {}) {
    if (!this.isEnabledForWorld() || !this.isAvailable() || !this.isEnabledForUser()) return;
    if (!casterToken) return;

    const { deliveryEnabled = true } = options;
    const school = this._resolveSchool(spellItem);
    const distanceFt = this._getTotalDistanceFt(deliveryType, increaseCount);

    try {
      const cfg     = this._getConfig();
      const castCfg = cfg.castAnims?.[school];
      const areaCfg = cfg.areaAnims?.[school]?.[deliveryType];
      const vol     = castCfg?.volume ?? 0.6;

      // Pre-expand any wildcard file paths so player clients never browse the filesystem.
      const fileMap = await VagabondFXResolver.resolveMap([castCfg?.file, areaCfg?.file]);

      const seq = new Sequence();

      // Cast sound: plays immediately via AudioHelper.
      if (castCfg?.sound) {
        foundry.audio.AudioHelper.play({ src: castCfg.sound, volume: vol, loop: false });
      }

      // Delivery sound: fires after the cast animation finishes.
      if (deliveryType && deliveryEnabled && areaCfg?.sound) {
        const castDelay = castCfg?.file ? Math.max(0, this._getDuration(castCfg) - 200) : 0;
        if (castDelay > 0) {
          setTimeout(() => foundry.audio.AudioHelper.play({ src: areaCfg.sound, volume: vol, loop: false }), castDelay);
        } else {
          foundry.audio.AudioHelper.play({ src: areaCfg.sound, volume: vol, loop: false });
        }
      }

      // Cast animation (always plays; blocks next section via .waitUntilFinished(-200)).
      this._addCastAnim(seq, school, casterToken, fileMap);

      // Area animation (only on success).
      if (deliveryType && deliveryEnabled) {
        this._addAreaAnim(seq, school, deliveryType, distanceFt, casterToken, targetTokens, fileMap);
      }

      seq.play();
    } catch (err) {
      // Never crash the spell cast due to FX errors
      console.warn('Vagabond | SpellSequencer error (non-fatal):', err);
    }
  }
}
