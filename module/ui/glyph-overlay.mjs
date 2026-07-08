/**
 * Glyph Overlay
 *
 * Renders placed spell glyphs (Region documents carrying
 * `flags.vagabond.glyph`, created by VagabondGlyphHelper) as an emblem sprite
 * centered on the glyph square, with a slow idle spin + alpha pulse.
 *
 * Lifecycle mirrors RegionTextureOverlay (drawRegion / refreshRegion /
 * destroyRegion), but draws a single fitted PIXI.Sprite instead of a masked
 * tiling texture — glyph art is a discrete emblem, not seamless fill.
 *
 * Click-to-trigger: region placeables aren't interactive while the token
 * layer is active, so a stage-level pointer listener hit-tests glyph squares
 * on plain left-clicks (no drag, no token underneath) and opens the glyph
 * action dialog for the caster/GM. The token layer never deactivates.
 */
import { VagabondGlyphHelper } from '../helpers/glyph-helper.mjs';

export class GlyphOverlay {
  /** Per-placeable overlay state. @type {WeakMap<object, {container: PIXI.Container, sprite: PIXI.Sprite, path: string, tick: Function}>} */
  static #overlays = new WeakMap();

  /** Placeables with an async build in flight. @type {WeakSet<object>} */
  static #pending = new WeakSet();

  /** Stage listeners currently attached, so canvasReady can re-wire cleanly. */
  static #stageHandlers = null;

  /** Where the last pointerdown landed, to tell clicks from drags. */
  static #downAt = null;

  /* -------------------------------------------- */

  /** Register hooks. Safe to call once at `ready`. */
  static register() {
    Hooks.on('drawRegion', (region) => GlyphOverlay.#onDraw(region));
    Hooks.on('refreshRegion', (region) => GlyphOverlay.#onRefresh(region));
    Hooks.on('destroyRegion', (region) => GlyphOverlay.#onDestroy(region));
    Hooks.on('canvasReady', () => GlyphOverlay.#wireStage());
    if (canvas?.ready) GlyphOverlay.#wireStage();
  }

  /* -------------------------------------------- */
  /*  Click-to-trigger (token layer stays active) */
  /* -------------------------------------------- */

  static #wireStage() {
    const stage = canvas.stage;
    if (!stage) return;
    if (GlyphOverlay.#stageHandlers) {
      const { down, up } = GlyphOverlay.#stageHandlers;
      stage.off('pointerdown', down);
      stage.off('pointerup', up);
    }
    const down = (ev) => {
      if (ev.button !== 0 || VagabondGlyphHelper.isPlacing) { GlyphOverlay.#downAt = null; return; }
      GlyphOverlay.#downAt = ev.getLocalPosition(stage);
    };
    const up = (ev) => {
      const start = GlyphOverlay.#downAt;
      GlyphOverlay.#downAt = null;
      if (!start || ev.button !== 0 || VagabondGlyphHelper.isPlacing) return;
      const pos = ev.getLocalPosition(stage);
      if (Math.hypot(pos.x - start.x, pos.y - start.y) > 5) return; // drag, not click

      // A token under the cursor wins — its own click handling must not be hijacked.
      const tokenHit = canvas.tokens.placeables.some((t) => t.visible && t.bounds.contains(pos.x, pos.y));
      if (tokenHit) return;

      for (const region of VagabondGlyphHelper.glyphRegions()) {
        const r = VagabondGlyphHelper.regionRect(region);
        if (!r) continue;
        if (pos.x >= r.x && pos.x < r.x + r.width && pos.y >= r.y && pos.y < r.y + r.height) {
          // Fire-and-forget: permission is checked inside promptTrigger.
          VagabondGlyphHelper.promptTrigger(region);
          return;
        }
      }
    };
    stage.on('pointerdown', down);
    stage.on('pointerup', up);
    GlyphOverlay.#stageHandlers = { down, up };
  }

  /* -------------------------------------------- */
  /*  Hook handlers                               */
  /* -------------------------------------------- */

  static #payload(region) {
    return region?.document?.flags?.vagabond?.glyph ?? null;
  }

  static #onDraw(region) {
    const payload = GlyphOverlay.#payload(region);
    if (!payload) return;
    GlyphOverlay.#styleCore(region);
    GlyphOverlay.#build(region, payload.art);
  }

  static #onRefresh(region) {
    const payload = GlyphOverlay.#payload(region);
    const state = GlyphOverlay.#overlays.get(region);
    if (!payload) {
      if (state) GlyphOverlay.#teardown(region);
      return;
    }
    GlyphOverlay.#styleCore(region);
    if (!state) {
      GlyphOverlay.#build(region, payload.art);
      return;
    }
    GlyphOverlay.#reposition(region, state);
  }

  static #onDestroy(region) {
    GlyphOverlay.#teardown(region);
  }

  /* -------------------------------------------- */
  /*  Core region styling                         */
  /* -------------------------------------------- */

  /**
   * Quiet Foundry's own region visuals so only the emblem shows: no hatch,
   * no color fill, no measurement outline, no border. Re-applied every
   * refresh because refreshState resets them (same dance as
   * RegionTextureOverlay.#styleCore).
   */
  static #styleCore(region) {
    const mesh = region.layer?._highlights?.children?.find((c) => c.region === region);
    if (mesh) {
      if (mesh.shader?.uniforms) mesh.shader.uniforms.hatchEnabled = false;
      mesh.alpha = 0;
    }
    if (region._measurementLines) region._measurementLines.visible = false;
    const border = region.children?.find((c) => (c instanceof PIXI.Graphics) && c !== region._measurementLines);
    if (border) border.visible = false;
  }

  /* -------------------------------------------- */
  /*  Build / reposition / teardown               */
  /* -------------------------------------------- */

  /** Emitted-light color for a glyph, from its art basename. */
  static #glowColor(path) {
    const basename = String(path ?? '').split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';
    const hex = CONFIG.VAGABOND.glyphGlowColors?.[basename]
      ?? CONFIG.VAGABOND.glyphGlowColors?.[CONFIG.VAGABOND.glyphDefaultArt]
      ?? '#F2E4AE';
    return Number(`0x${hex.replace('#', '')}`);
  }

  static async #build(region, path) {
    if (!path) return;
    if (GlyphOverlay.#overlays.has(region) || GlyphOverlay.#pending.has(region)) return;
    GlyphOverlay.#pending.add(region);
    let texture = null;
    try {
      texture = await foundry.canvas.loadTexture(path);
    } catch (_e) { /* missing art — skip silently */ }
    GlyphOverlay.#pending.delete(region);

    if (!texture || region.destroyed || !GlyphOverlay.#payload(region)) return;
    if (GlyphOverlay.#overlays.has(region)) return;

    const color = GlyphOverlay.#glowColor(path);

    // Layer order (bottom→top): ground halo → tinted glow copy → emblem.
    // Everything is centered on (0,0); the container carries the square center,
    // so reposition only ever moves/scales the container.
    const container = new PIXI.Container();
    container.eventMode = 'none';

    // Soft light pool on the ground — blurred additive disc in the glyph color.
    const halo = new PIXI.Graphics();
    halo.beginFill(color, 1).drawCircle(0, 0, 100).endFill();
    halo.filters = [new PIXI.BlurFilter(24)];
    halo.blendMode = PIXI.BLEND_MODES.ADD;
    halo.alpha = 0.18;

    // Additive tinted copy of the emblem, slightly oversized — the "emission".
    const glow = new PIXI.Sprite(texture);
    glow.anchor.set(0.5);
    glow.tint = color;
    glow.blendMode = PIXI.BLEND_MODES.ADD;
    glow.filters = [new PIXI.BlurFilter(6)];
    glow.alpha = 0.5;

    // The emblem itself — stationary, steady.
    const sprite = new PIXI.Sprite(texture);
    sprite.eventMode = 'none';
    sprite.anchor.set(0.5);
    sprite.alpha = 0.95;

    container.addChild(halo, glow, sprite);
    region.addChildAt(container, Math.min(1, region.children.length));

    const state = { container, sprite, glow, halo, path, tick: null, fit: 1, t: Math.random() * Math.PI * 2 };
    GlyphOverlay.#overlays.set(region, state);
    GlyphOverlay.#reposition(region, state);

    // Idle animation: no rotation — the glyph is stationary. Only the light
    // breathes: glow + halo pulse in alpha, glow swells slightly.
    state.tick = (dt) => {
      if (region.destroyed) return;
      state.t += 0.025 * dt;
      const pulse = (Math.sin(state.t) + 1) / 2; // 0..1
      glow.alpha = 0.30 + 0.40 * pulse;
      glow.scale.set(state.fit * (1.04 + 0.08 * pulse));
      halo.alpha = 0.10 + 0.16 * pulse;
    };
    canvas.app.ticker.add(state.tick);
  }

  static #reposition(region, state) {
    if (region.destroyed) return;
    const shape = region.document?.shapes?.[0];
    if (!shape) return;
    const { container, sprite, glow, halo } = state;
    const side = Math.min(shape.width ?? 0, shape.height ?? 0);
    if (!side || !sprite.texture?.width) return;
    const fit = (side * 0.85) / Math.max(sprite.texture.width, sprite.texture.height);
    state.fit = fit;
    sprite.scale.set(fit);
    glow.scale.set(fit * 1.08);
    // Halo drawn at radius 100 — scale it to a light pool just past the square.
    const haloScale = (side * 0.62) / 100;
    halo.scale.set(haloScale);
    container.position.set(shape.x + (shape.width ?? 0) / 2, shape.y + (shape.height ?? 0) / 2);
  }

  static #teardown(region) {
    const state = GlyphOverlay.#overlays.get(region);
    if (!state) return;
    GlyphOverlay.#overlays.delete(region);
    if (state.tick) canvas.app?.ticker?.remove(state.tick);
    if (!region.destroyed && state.container.parent) region.removeChild(state.container);
    state.container.destroy({ children: true });
  }
}
