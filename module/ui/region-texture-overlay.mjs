/**
 * Region Texture Overlay
 *
 * Foundry v14 Region documents render with a single solid `color` tint only
 * (the highlight is a RegionMesh + HighlightRegionShader — no texture sampling).
 * To paint spell-area regions with seamless damage-type artwork we layer a
 * masked PIXI.TilingSprite over the region placeable.
 *
 * A region opts in by carrying `flags.vagabond.texture` (a resolved image path).
 * That flag is set at creation time in `measure-templates.mjs` via
 * `RegionTextureOverlay.texturePathForType(damageType)`.
 *
 * Lifecycle is driven by the PlaceableObject draw hooks:
 *   drawRegion    → build the overlay (async, fire-and-forget)
 *   refreshRegion → reposition the mask + sprite (tracks token-attached movement)
 *   destroyRegion → tear the overlay down
 */
export class RegionTextureOverlay {
  /** Per-placeable overlay state. @type {WeakMap<object, {container: PIXI.Container, sprite: PIXI.TilingSprite, mask: PIXI.Graphics, path: string}>} */
  static #overlays = new WeakMap();

  /** Placeables with an async build in flight, to avoid double-building. @type {WeakSet<object>} */
  static #pending = new WeakSet();

  /** Live textured placeables, so style tweaks can be pushed without a re-render. @type {Set<object>} */
  static #active = new Set();

  /** Discovered art basenames (lowercased, no extension), or null until scanned. @type {Set<string>|null} */
  static #available = null;

  /* -------------------------------------------- */

  /**
   * Register hooks and scan the art directory once. Safe to call at `ready`.
   */
  static register() {
    Hooks.on('drawRegion', (region) => RegionTextureOverlay.#onDraw(region));
    Hooks.on('refreshRegion', (region) => RegionTextureOverlay.#onRefresh(region));
    Hooks.on('destroyRegion', (region) => RegionTextureOverlay.#onDestroy(region));
    // Expose for live console tuning: vagabond.ui.regionTexture.setBlendMode('ADD')
    globalThis.vagabond ??= {};
    globalThis.vagabond.ui ??= {};
    globalThis.vagabond.ui.regionTexture = RegionTextureOverlay;
    RegionTextureOverlay.#scanArt(); // fire-and-forget
  }

  /* -------------------------------------------- */
  /*  Live style tuning (console-friendly)        */
  /* -------------------------------------------- */

  /**
   * Set the texture blend mode and apply it to every live region immediately.
   * @param {string} name   A PIXI.BLEND_MODES key: NORMAL, ADD, SCREEN, MULTIPLY, OVERLAY, ...
   */
  static setBlendMode(name) {
    const mode = PIXI.BLEND_MODES[name];
    if (mode === undefined) {
      console.warn(`VagabondSystem | Unknown blend mode "${name}". Valid keys:`, Object.keys(PIXI.BLEND_MODES));
      return;
    }
    CONFIG.VAGABOND.regionTextureBlendMode = name;
    for (const region of RegionTextureOverlay.#active) {
      const state = RegionTextureOverlay.#overlays.get(region);
      if (state) state.sprite.blendMode = mode;
    }
  }

  /**
   * Set the texture opacity (0–1) and apply it to every live region immediately.
   * @param {number} alpha
   */
  static setAlpha(alpha) {
    CONFIG.VAGABOND.regionTextureAlpha = alpha;
    for (const region of RegionTextureOverlay.#active) {
      const state = RegionTextureOverlay.#overlays.get(region);
      if (state) state.sprite.alpha = alpha;
    }
  }

  /** Enable/disable texture animation globally. @param {boolean} on */
  static setAnimate(on) { CONFIG.VAGABOND.regionTextureAnimate = !!on; }

  /** Spin speed (radians/frame) for circle/rectangle areas. @param {number} v */
  static setSpinSpeed(v) { CONFIG.VAGABOND.regionTextureSpinSpeed = v; }

  /** Scroll speed (px/frame) for cone/line areas; negative reverses. @param {number} v */
  static setScrollSpeed(v) { CONFIG.VAGABOND.regionTextureScrollSpeed = v; }

  /**
   * Animation mode for a region, from its shape type.
   * cone/line scroll along their aim; everything else spins.
   * @returns {'spin'|'scroll'}
   */
  static #animMode(region) {
    const t = region.document?.shapes?.[0]?.type;
    return (t === 'cone' || t === 'line') ? 'scroll' : 'spin';
  }

  /**
   * Apply the configured blend mode + alpha to one sprite.
   */
  static #applyStyle(sprite) {
    sprite.blendMode = PIXI.BLEND_MODES[CONFIG.VAGABOND?.regionTextureBlendMode] ?? PIXI.BLEND_MODES.NORMAL;
    sprite.alpha = CONFIG.VAGABOND?.regionTextureAlpha ?? 0.65;
  }

  /** Hide/show the solid color fill on textured regions. @param {boolean} on */
  static setHideFill(on) {
    CONFIG.VAGABOND.regionTextureHideFill = !!on;
    for (const region of RegionTextureOverlay.#active) RegionTextureOverlay.#styleCore(region);
  }

  /** Set border treatment ('player'|'hide'|'default') and apply live. @param {string} mode */
  static setBorderMode(mode) {
    CONFIG.VAGABOND.regionBorderMode = mode;
    for (const region of RegionTextureOverlay.#active) RegionTextureOverlay.#styleCore(region);
  }

  /**
   * Resolve the effective border + opacity from the GM table defaults and the
   * current player's overrides, push them into CONFIG, and re-style live regions.
   * Border: player override unless 'inherit' → GM default.
   * Opacity: GM default unless the player turned off "use GM opacity".
   */
  static applyPreferences() {
    const get = (k) => { try { return game.settings.get('vagabond', k); } catch (_e) { return undefined; } };

    const gmBorder = get('regionBorderMode') ?? 'hide';
    const userBorder = get('regionBorderModeUser') ?? 'inherit';
    RegionTextureOverlay.setBorderMode((userBorder && userBorder !== 'inherit') ? userBorder : gmBorder);

    const gmAlpha = get('regionTextureAlpha') ?? 0.65;
    const userAlpha = get('regionTextureAlphaUser') ?? 0.65;
    RegionTextureOverlay.setAlpha(get('regionTextureAlphaUseGM') === false ? userAlpha : gmAlpha);
  }

  /**
   * Restyle the core (Foundry-owned) region visuals for a textured region:
   *  - disable the diagonal hatch (shows through transparent art)
   *  - optionally hide the solid color fill so only the artwork shows
   *  - retint or hide the border outline
   * Foundry resets these on every refreshState, so this is re-applied each refresh.
   */
  static #styleCore(region) {
    // Color fill + hatch live on the highlight mesh in the layer's _highlights container.
    const mesh = region.layer?._highlights?.children?.find(c => c.region === region);
    if (mesh) {
      if (mesh.shader?.uniforms) mesh.shader.uniforms.hatchEnabled = false;
      mesh.alpha = CONFIG.VAGABOND?.regionTextureHideFill ? 0 : 0.5;
    }

    const mode = CONFIG.VAGABOND?.regionBorderMode ?? 'player';

    // Two outline sources exist: the disposition #border AND the measurement lines,
    // which draw the shape outline in solid black (color 0x000000) because we set
    // displayMeasurements: true. Hide the black measurement outline so it never
    // double-draws over the art (labels live in a separate container and stay).
    if (region._measurementLines && mode !== 'default') region._measurementLines.visible = false;

    // The border is the placeable's PIXI.Graphics child that isn't the measurement lines.
    // Foundry only shows it on hover/control for placed regions, so we force visibility
    // per mode — otherwise 'hide' vs 'player' look identical (both invisible).
    const border = region.children?.find(c => (c instanceof PIXI.Graphics) && c !== region._measurementLines);
    if (border) {
      if (mode === 'hide') {
        border.visible = false;
      } else if (mode === 'player') {
        const tint = Number(region.document.color);
        border.tint = Number.isFinite(tint) ? tint : 0xffffff;
        border.visible = true;
      }
      // 'default' → leave Foundry's tint/visibility untouched
    }
  }

  /* -------------------------------------------- */

  /**
   * Browse the damage-art directory once and cache the available basenames so
   * `texturePathForType` never points at a missing file (avoids 404 noise).
   */
  static async #scanArt() {
    const base = CONFIG.VAGABOND?.damageArtBasePath;
    if (!base) { RegionTextureOverlay.#available = new Set(); return; }
    try {
      const FP = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
      const res = await FP.browse('data', base);
      RegionTextureOverlay.#available = new Set(
        (res?.files ?? []).map(f => f.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase())
      );
    } catch (_e) {
      // Browse can fail on some hosts — leave null so the resolver falls back to convention.
      RegionTextureOverlay.#available = null;
    }
  }

  /* -------------------------------------------- */

  /**
   * Resolve the art texture path for a key under an alias map, or null if none
   * applies. Convention: `{base}/{key}.webp`, with optional aliases for filename
   * mismatches. When the directory scan succeeded, gate on discovered files to
   * avoid 404s.
   * @param {string} key            Lookup key (damage type or fx school).
   * @param {Object<string,string>} [aliases]  Key → art basename overrides.
   * @returns {string|null}
   * @private
   */
  static #pathForKey(key, aliases) {
    if (!key || key === '-') return null;
    const base = CONFIG.VAGABOND?.damageArtBasePath;
    if (!base) return null;
    const k = String(key).toLowerCase();
    const file = aliases?.[k] ?? k;
    if (RegionTextureOverlay.#available && !RegionTextureOverlay.#available.has(file.toLowerCase())) return null;
    return `${base}/${file}.webp`;
  }

  /**
   * Resolve the art texture path for a damage type, or null if none applies.
   * @param {string} damageType
   * @returns {string|null}
   */
  static texturePathForType(damageType) {
    return RegionTextureOverlay.#pathForKey(damageType, CONFIG.VAGABOND?.damageArtAliases);
  }

  /**
   * Resolve the art texture path for an FX school (see `VAGABOND.fxSchools`), or
   * null if none applies. Used when a spell carries an explicit `fxSchool`.
   * @param {string} school
   * @returns {string|null}
   */
  static texturePathForSchool(school) {
    return RegionTextureOverlay.#pathForKey(school, CONFIG.VAGABOND?.fxSchoolArt);
  }

  /* -------------------------------------------- */
  /*  Hook handlers                               */
  /* -------------------------------------------- */

  static #onDraw(region) {
    const path = region?.document?.flags?.vagabond?.texture;
    if (!path) return;
    RegionTextureOverlay.#styleCore(region);
    RegionTextureOverlay.#build(region, path);
  }

  static #onRefresh(region) {
    const path = region?.document?.flags?.vagabond?.texture;
    const state = RegionTextureOverlay.#overlays.get(region);
    if (!path) {
      if (state) RegionTextureOverlay.#teardown(region);
      return;
    }
    RegionTextureOverlay.#styleCore(region);
    if (!state) {
      RegionTextureOverlay.#build(region, path);
      return;
    }
    if (state.path !== path) {
      RegionTextureOverlay.#teardown(region);
      RegionTextureOverlay.#build(region, path);
      return;
    }
    RegionTextureOverlay.#reposition(region, state);
  }

  static #onDestroy(region) {
    RegionTextureOverlay.#teardown(region);
  }

  /* -------------------------------------------- */
  /*  Build / reposition / teardown               */
  /* -------------------------------------------- */

  /**
   * Build the masked tiling-sprite overlay for a region (async texture load).
   */
  static async #build(region, path) {
    if (RegionTextureOverlay.#overlays.has(region) || RegionTextureOverlay.#pending.has(region)) return;
    RegionTextureOverlay.#pending.add(region);
    let texture = null;
    try {
      texture = await foundry.canvas.loadTexture(path);
    } catch (_e) { /* missing/unloadable — silently skip */ }
    RegionTextureOverlay.#pending.delete(region);

    // The region may have been destroyed or lost its flag while we awaited.
    if (!texture || region.destroyed || !region.document?.flags?.vagabond?.texture) return;
    if (RegionTextureOverlay.#overlays.has(region)) return;

    const container = new PIXI.Container();
    container.eventMode = 'none';
    const sprite = new PIXI.TilingSprite(texture, 100, 100);
    sprite.eventMode = 'none';
    RegionTextureOverlay.#applyStyle(sprite);
    const mask = new PIXI.Graphics();
    container.addChild(sprite);
    container.addChild(mask);
    sprite.mask = mask;

    // Sit just above the hitbox (index 0) so the region border + labels stay on top.
    region.addChildAt(container, Math.min(1, region.children.length));

    const state = { container, sprite, mask, path, tick: null };
    RegionTextureOverlay.#overlays.set(region, state);
    RegionTextureOverlay.#active.add(region);
    RegionTextureOverlay.#reposition(region, state);

    // Per-frame animation: spin (circle/rectangle) or scroll along aim (cone/line).
    state.tick = (dt) => {
      if (region.destroyed) return;
      if (!CONFIG.VAGABOND?.regionTextureAnimate) return;
      if (RegionTextureOverlay.#animMode(region) === 'spin') {
        sprite.rotation += (CONFIG.VAGABOND?.regionTextureSpinSpeed ?? 0.005) * dt;
      } else {
        const rad = Math.toRadians(region.document?.shapes?.[0]?.rotation ?? 0);
        const speed = (CONFIG.VAGABOND?.regionTextureScrollSpeed ?? 1.5) * dt;
        sprite.tilePosition.x += Math.cos(rad) * speed;
        sprite.tilePosition.y += Math.sin(rad) * speed;
      }
    };
    canvas.app.ticker.add(state.tick);
  }

  /**
   * Reposition + remask the sprite to the region's current (possibly animated) shape.
   */
  static #reposition(region, state) {
    if (region.destroyed) return;
    RegionTextureOverlay.#styleCore(region);
    const anim = region.animationState;
    const polys = anim?.polygons ?? region.document.polygons;
    const bounds = anim?.bounds ?? region.bounds;
    if (!polys?.length || !bounds) return;

    const { sprite, mask } = state;
    if (RegionTextureOverlay.#animMode(region) === 'spin') {
      // Oversize to a centered diagonal square so the mask stays covered at any rotation.
      const diag = Math.hypot(bounds.width, bounds.height);
      sprite.width = diag;
      sprite.height = diag;
      sprite.pivot.set(diag / 2, diag / 2);
      sprite.position.set(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    } else {
      sprite.pivot.set(0, 0);
      sprite.position.set(bounds.x, bounds.y);
      sprite.width = bounds.width;
      sprite.height = bounds.height;
    }

    mask.clear();
    mask.beginFill(0xFFFFFF);
    for (const poly of polys) mask.drawPolygon(poly);
    mask.endFill();
  }

  /**
   * Destroy the overlay and forget the region.
   */
  static #teardown(region) {
    const state = RegionTextureOverlay.#overlays.get(region);
    if (!state) return;
    RegionTextureOverlay.#overlays.delete(region);
    RegionTextureOverlay.#active.delete(region);
    if (state.tick) canvas.app?.ticker?.remove(state.tick);
    if (!region.destroyed && state.container.parent) region.removeChild(state.container);
    state.container.destroy({ children: true });
  }
}
