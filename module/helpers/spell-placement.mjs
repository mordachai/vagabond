import { VagabondMeasureTemplates } from '../applications/measure-templates.mjs';

/**
 * Hand placement of a Cast on the map, from the Cast dialog's crosshair button — the token layer stays active
 * (listeners on `canvas.stage` in the capture phase, ghost on `canvas.interface`, same as Glyph placement).
 *
 * - **Area** (Cube, Sphere): one aim point (`state.areaAnchor = {x, y, tokenId?}`) the area is built around, so an
 *   Increase grows it from that point. Clicking a token aims at it and attaches the area to it (it follows the token).
 *   The tokens inside become the user's targets (the dialog re-targets whenever the area changes).
 *   **Line** uses the same aim point as its direction: it still starts at the caster, points at the aim, and stays
 *   where it was put (a wall of fire, an ice bridge) — no token needed. Its aim gets no range check (it starts at you).
 * - **Spaces** (Remote): "a Target" can be a space with nothing on it (Erupt, a cart drawn on the map). Each click on
 *   empty ground adds / removes a space (`state.targetSpaces = [{x, y}]`), a click on a token targets / untargets it;
 *   right-click, Esc or Enter ends. Spaces count as Targets of the Cast.
 *
 * Range check (world settings): `spellPlacementEnforce` off | warn | block, `spellPlacementSight` (walls between the
 * caster and the point block it — "you can see"), `spellPlacementMaxFeet` (0 = no limit) — tested on every placed
 * point from the caster's token.
 */
export class SpellPlacement {

  static AREA = ['cube', 'sphere', 'line'];
  static SPACES = ['remote'];
  /** Area deliveries whose aim is only a direction from the caster (no range check on the aim point). */
  static DIRECTION = ['line'];

  static aimsDirection(deliveryType) {
    return this.DIRECTION.includes(String(deliveryType ?? '').toLowerCase());
  }

  static #session = null;          // { finish } of the running session
  static #cooldownUntil = 0;

  /** True while a session runs (plus a short tail so the completing click doesn't reach a glyph). */
  static get isPlacing() {
    return !!this.#session || Date.now() < this.#cooldownUntil;
  }

  /** 'area' | 'spaces' | null for a delivery. */
  static modeFor(deliveryType) {
    const t = String(deliveryType ?? '').toLowerCase();
    if (this.AREA.includes(t)) return 'area';
    if (this.SPACES.includes(t)) return 'spaces';
    return null;
  }

  /** End the running session (dialog closed / Cast). */
  static cancel() {
    this.#session?.finish(null);
  }

  /* -------------------------------------------- */
  /*  Geometry                                    */
  /* -------------------------------------------- */

  static #casterToken(actor) {
    return actor?.token?.object ?? actor?.getActiveTokens(true)[0] ?? null;
  }

  /** Grid-space center of a point (raw point on gridless scenes). */
  static snapToSpace(point) {
    if (canvas.grid.isGridless) return { x: point.x, y: point.y };
    return canvas.grid.getCenterPoint(point);
  }

  /** Topmost visible token under a point. */
  static tokenAt(point) {
    const list = canvas.tokens.placeables.filter(t => t.visible && t.actor && t.bounds.contains(point.x, point.y));
    return list.sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0))[0] ?? null;
  }

  /** Feet from the caster's token to a point (grid: edge to edge, like the Distance table; gridless: from its edge). */
  static distanceFeet(token, point) {
    const fps = game.system.grid?.distance ?? 5;
    const grid = canvas.grid;
    const doc = token.document;
    if (!grid.isGridless) {
      const { width, height } = doc.getSize();
      const tl = grid.getOffset({ x: doc.x, y: doc.y });
      const br = grid.getOffset({ x: doc.x + width - 1, y: doc.y + height - 1 });
      const p = grid.getOffset(point);
      const gapI = Math.max(0, Math.min(tl.i, br.i) - p.i, p.i - Math.max(tl.i, br.i));
      const gapJ = Math.max(0, Math.min(tl.j, br.j) - p.j, p.j - Math.max(tl.j, br.j));
      return Math.max(gapI, gapJ) * fps;
    }
    const c = token.center;
    const radius = Math.max(token.w, token.h) / 2;
    return Math.max(0, Math.hypot(point.x - c.x, point.y - c.y) - radius) * fps / grid.size;
  }

  /* -------------------------------------------- */
  /*  Range check                                 */
  /* -------------------------------------------- */

  static #setting(key, fallback) {
    try { return game.settings.get('vagabond', key); } catch { return fallback; }
  }

  /** 'off' | 'warn' | 'block' */
  static get enforce() {
    return this.#setting('spellPlacementEnforce', 'block');
  }

  /**
   * Why the caster can't reach this point, or null. Checks only what the world settings ask for (in sight, within
   * the max distance); no caster token on the scene = no check.
   * @returns {string|null}
   */
  static rangeError(actor, point) {
    if (!point || this.enforce === 'off' || !canvas?.ready) return null;
    const caster = this.#casterToken(actor);
    if (!caster) return null;
    if (this.#setting('spellPlacementSight', true)) {
      const origin = { ...caster.center, elevation: caster.document.elevation ?? 0 };
      let blocked = false;
      try {
        blocked = !!CONFIG.Canvas.polygonBackends.sight.testCollision(origin, point, { type: 'sight', mode: 'any' });
      } catch (err) {
        console.warn('Vagabond | sight test failed', err);
      }
      if (blocked) return game.i18n.localize('VAGABOND.SpellPlace.OutOfSight');
    }
    const max = Number(this.#setting('spellPlacementMaxFeet', 0)) || 0;
    if (max > 0) {
      const feet = Math.round(this.distanceFeet(caster, point));
      if (feet > max) return game.i18n.format('VAGABOND.SpellPlace.OutOfRange', { feet, max });
    }
    return null;
  }

  /* -------------------------------------------- */
  /*  Cast outputs                                */
  /* -------------------------------------------- */

  /** Center of a Cast area shape (rectangle / circle), or null. */
  static shapeCenter(shape) {
    if (!shape) return null;
    if (shape.type === 'rectangle') return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
    if (shape.type === 'circle') return { x: shape.x, y: shape.y };
    if (shape.type === 'line') {
      const a = Math.toRadians(shape.rotation ?? 0);
      return { x: shape.x + Math.cos(a) * shape.length / 2, y: shape.y + Math.sin(a) * shape.length / 2 };
    }
    return null;
  }

  /** Corners of a v14 'line' Region shape (origin at one end, `width` across). */
  static lineCorners(shape) {
    const a = Math.toRadians(shape.rotation ?? 0);
    const dx = Math.cos(a), dy = Math.sin(a);
    const nx = -dy * shape.width / 2, ny = dx * shape.width / 2;
    const ex = shape.x + dx * shape.length, ey = shape.y + dy * shape.length;
    return [
      { x: shape.x + nx, y: shape.y + ny }, { x: ex + nx, y: ey + ny },
      { x: ex - nx, y: ey - ny }, { x: shape.x - nx, y: shape.y - ny },
    ];
  }

  /** Spaces of the current scene as pseudo-tokens for the spell FX (point + center, flagged `isSpace`). */
  static pseudoTargets(spaces) {
    const sceneId = canvas.scene?.id;
    return (spaces ?? [])
      .filter(p => !p.sceneId || p.sceneId === sceneId)
      .map(p => ({ isSpace: true, x: p.x, y: p.y, center: { x: p.x, y: p.y }, document: { width: 1, height: 1 } }));
  }

  /* -------------------------------------------- */
  /*  Markers (Remote spaces while the dialog is open) */
  /* -------------------------------------------- */

  static #color() {
    const c = game.user.color;
    return Number(c?.valueOf?.() ?? 0xE8D060);
  }

  /** 'r, g, b' (the Cast dialog's accent triplet) → 0xRRGGBB, or null. */
  static rgbToNumber(rgb) {
    const [r, g, b] = String(rgb ?? '').split(',').map(n => parseInt(n, 10));
    if (![r, g, b].every(Number.isFinite)) return null;
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Ring + crosshair in `color`. With `outline` (placed spaces) every stroke is thicker and edged in that color
   * (the Spell's magic color); without it (the hover ghost) thin, over a dark edge.
   */
  static #drawMarker(g, point, color, alpha = 0.95, outline = null) {
    const r = canvas.grid.size * 0.32;
    const strokes = (width, c, a) => {
      g.lineStyle(width, c, a).drawCircle(point.x, point.y, r);
      g.moveTo(point.x - r * 1.4, point.y).lineTo(point.x - r * 0.45, point.y);
      g.moveTo(point.x + r * 0.45, point.y).lineTo(point.x + r * 1.4, point.y);
      g.moveTo(point.x, point.y - r * 1.4).lineTo(point.x, point.y - r * 0.45);
      g.moveTo(point.x, point.y + r * 0.45).lineTo(point.x, point.y + r * 1.4);
    };
    g.lineStyle(0).beginFill(color, 0.15 * alpha).drawCircle(point.x, point.y, r).endFill();
    if (outline != null) {
      strokes(7, outline, alpha);
      strokes(3.5, color, alpha);
    } else {
      strokes(4, 0x000000, 0.5 * alpha);
      strokes(2, color, alpha);
    }
  }

  /**
   * Draw the placed space markers (player color, edged in the Spell's color); returns the PIXI object (pass it
   * back to `clearMarkers`).
   * @param {Array<{x,y}>} points
   * @param {number|null} [outline]  0xRRGGBB magic color of the Spell
   */
  static drawMarkers(points, outline = null) {
    if (!canvas?.ready || !points?.length) return null;
    const g = new PIXI.Graphics();
    g.eventMode = 'none';
    const color = this.#color();
    for (const p of points) this.#drawMarker(g, p, color, 0.95, outline ?? 0x000000);
    canvas.interface.addChild(g);
    return g;
  }

  static clearMarkers(g) {
    if (!g || g.destroyed) return;
    g.parent?.removeChild(g);
    g.destroy();
  }

  /* -------------------------------------------- */
  /*  Sessions                                    */
  /* -------------------------------------------- */

  /**
   * Run a click session on the stage. `onMove(world)` / `onClick(world)` (return true to end) — right-click, Esc
   * or Enter end it with `endValue()`.
   */
  static #run({ ghost, onMove, onClick, endValue = () => null, prompt }) {
    if (!canvas?.ready) return Promise.resolve(null);
    this.cancel();
    if (prompt) ui.notifications.info(prompt);
    canvas.interface.addChild(ghost);
    return new Promise((resolve) => {
      const stage = canvas.stage;
      const finish = (result) => {
        stage.removeEventListener('pointermove', move, { capture: true });
        stage.removeEventListener('pointerdown', down, { capture: true });
        window.removeEventListener('keydown', key, { capture: true });
        if (!ghost.destroyed) { ghost.parent?.removeChild(ghost); ghost.destroy({ children: true }); }
        if (SpellPlacement.#session?.finish === finish) SpellPlacement.#session = null;
        SpellPlacement.#cooldownUntil = Date.now() + 300;
        resolve(result);
      };
      const move = (ev) => onMove(ev.getLocalPosition(stage));
      const down = (ev) => {
        ev.stopPropagation();
        if (ev.button !== 0) return finish(endValue());
        const res = onClick(ev.getLocalPosition(stage));
        if (res !== undefined) finish(res);
      };
      const key = (ev) => {
        if (ev.key !== 'Escape' && ev.key !== 'Enter') return;
        ev.stopPropagation();
        ev.preventDefault();
        finish(endValue());
      };
      stage.addEventListener('pointermove', move, { capture: true });
      stage.addEventListener('pointerdown', down, { capture: true });
      window.addEventListener('keydown', key, { capture: true });
      SpellPlacement.#session = { finish };
    });
  }

  /** Range check at click time: block = refuse (toast), warn = toast and accept. @returns {boolean} accepted */
  static #clickInRange(actor, point) {
    const err = this.rangeError(actor, point);
    if (!err) return true;
    ui.notifications.warn(err);
    return this.enforce !== 'block';
  }

  /** Range error of an area's aim point, or null (a Line's aim is only its direction from the caster). */
  static aimRangeError(actor, type, anchor) {
    if (this.aimsDirection(type)) return null;
    return this.rangeError(actor, VagabondMeasureTemplates.anchorPoint(anchor));
  }

  /**
   * Aim a Cube / Sphere / Line: a ghost of the area at its current size follows the cursor (snapped like the real
   * area); over a token it aims at the token. A Line points from the caster at the aim (space centers on a grid).
   * Resolves the anchor `{x, y, tokenId}` or null (cancelled).
   * @param {{actor: Actor, type: string, distance: number}} opts
   */
  static pickArea({ actor, type, distance }) {
    const manager = globalThis.vagabond?.managers?.templates ?? new VagabondMeasureTemplates();
    const caster = this.#casterToken(actor);
    const color = this.#color();
    const direction = this.aimsDirection(type);
    const ghost = new PIXI.Graphics();
    ghost.eventMode = 'none';
    const anchorAt = (world) => {
      const tok = this.tokenAt(world);
      if (tok && !(direction && tok === caster)) return { x: tok.center.x, y: tok.center.y, tokenId: tok.id };
      const p = direction ? this.snapToSpace(world) : world;
      return { x: p.x, y: p.y, tokenId: null };
    };
    const draw = (anchor) => {
      ghost.clear();
      const shape = manager._constructRegionData({ type, distance, token: caster, targets: null, anchor, notify: false })?.shapes?.[0];
      if (!shape) return;
      const out = this.aimRangeError(actor, type, anchor);
      const c = out ? 0xD04040 : color;
      ghost.lineStyle(2, c, 0.95).beginFill(c, 0.18);
      if (shape.type === 'rectangle') ghost.drawRect(shape.x, shape.y, shape.width, shape.height);
      else if (shape.type === 'circle') ghost.drawCircle(shape.x, shape.y, shape.radius);
      else if (shape.type === 'line') ghost.drawPolygon(this.lineCorners(shape).flatMap(p => [p.x, p.y]));
      ghost.endFill();
      const p = VagabondMeasureTemplates.anchorPoint(anchor);
      ghost.lineStyle(0).beginFill(c, 0.9).drawCircle(p.x, p.y, Math.max(3, canvas.grid.size * 0.06)).endFill();
    };
    return this.#run({
      ghost,
      prompt: game.i18n.localize(direction ? 'VAGABOND.SpellPlace.LinePrompt' : 'VAGABOND.SpellPlace.AreaPrompt'),
      onMove: (world) => draw(anchorAt(world)),
      onClick: (world) => {
        const anchor = anchorAt(world);
        if (!direction && !this.#clickInRange(actor, VagabondMeasureTemplates.anchorPoint(anchor))) return undefined;
        return anchor;
      },
    });
  }

  /**
   * Remote: click empty ground to add / remove a space, a token to target / untarget it. `onChange(spaces)` fires
   * after each change; resolves the final spaces when the session ends.
   * @param {{actor: Actor, spaces: Array<{x,y}>, onChange: Function}} opts
   */
  static pickSpaces({ actor, spaces = [], onChange }) {
    let list = spaces.map(p => ({ x: p.x, y: p.y }));
    const color = this.#color();
    const ghost = new PIXI.Graphics();
    ghost.eventMode = 'none';
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < canvas.grid.size / 2;
    return this.#run({
      ghost,
      prompt: game.i18n.localize('VAGABOND.SpellPlace.SpacesPrompt'),
      endValue: () => list,
      onMove: (world) => {
        ghost.clear();
        const tok = this.tokenAt(world);
        if (tok) {
          ghost.lineStyle(3, color, 0.9).drawCircle(tok.center.x, tok.center.y, Math.max(tok.w, tok.h) * 0.6);
          return;
        }
        const p = this.snapToSpace(world);
        this.#drawMarker(ghost, p, this.rangeError(actor, p) ? 0xD04040 : color, 0.6);
      },
      onClick: (world) => {
        const tok = this.tokenAt(world);
        if (tok) {
          tok.setTarget(!tok.isTargeted, { releaseOthers: false });
          return undefined;
        }
        const p = this.snapToSpace(world);
        const i = list.findIndex(q => near(q, p));
        if (i >= 0) list = list.filter((_, k) => k !== i);
        else if (this.#clickInRange(actor, p)) list = [...list, p];
        else return undefined;
        onChange?.(list);
        return undefined;
      },
    });
  }
}
