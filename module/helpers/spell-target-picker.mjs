import { VagabondMeasureTemplates } from '../applications/measure-templates.mjs';
import { EquipmentHelper } from './equipment-helper.mjs';

/**
 * Spell Target picker — the Cast dialog's ring of Targets for Spells that choose what they affect.
 *
 * Two per-Spell switches (`system.targetBeings`, `system.targetObjects`) turn it on:
 * - **Target Beings** (area deliveries, or any delivery listing Objects too; only with the player's client setting
 *   `castTargetPicker` on): every Being the area touches (else the targeted tokens) is listed, the caster picks who
 *   is affected. Area deliveries never pay per Target, so picking changes nothing in their cost.
 * - **Target Objects** (any delivery but Imbue / Glyph): the equipped weapons (not "Can't be Imbued") of the Beings
 *   in the area, else the targeted tokens, else the caster. Remote pays per Target as usual (picks - 1 = the
 *   Increase); Touch takes a single Target. With Objects alone, an area delivery makes every Being it touches a
 *   Target (the table can rule some out), else the user's targets stand.
 * Both on: each Being is listed right before its own weapons.
 *
 * The picks leave the dialog as `{ beings: [tokenUuid] | null, objects: [itemUuid] | null }` (`null` = that kind is
 * not picked, the user's targets stand). SpellHandler turns picked Beings into the card's Targets and threads picked
 * Objects to the hit macro as `scope.targetObjects` (Items) with `scope.targetsPicked` (the Targets are final, no
 * fallback to the user's current targets).
 *
 * Layout: the triangle lines are hidden, the bottom nodes move to the lower corners, and the picks sit on two
 * side arcs near the inner ring (like the Imbue ring), bordered with their player's color. A crowded ring adds an
 * inner row.
 */
export class SpellTargetPicker {

  static AREA_DELIVERIES = ['aura', 'cone', 'line', 'cube', 'sphere'];
  /** Areas that grow out of the caster (the caster is never inside them). */
  static #EMANATES = ['cone', 'line'];

  /** Row radii (viewBox units: outer, then the inner row of a crowded ring) and the two side arcs (degrees,
   *  top → bottom) clear of the top Range node and the delivery label (the bottom nodes sit in the corners). */
  static #ROWS_R = [90, 62];
  static #ARCS = [[241, 130], [-61, 50]];
  static #ICON_MAX = 44;
  static #ICON_MIN = 26;

  /**
   * Which kinds the ring lists for this Spell and delivery, or null when the picker is off.
   * @param {Item} spell
   * @param {string|null} deliveryType
   * @returns {{beings: boolean, objects: boolean}|null}
   */
  static modes(spell, deliveryType) {
    const t = String(deliveryType ?? '').toLowerCase();
    if (!t || t === 'imbue' || t === 'glyph') return null;
    // Objects always (no other way to target them); Beings only when the player picks Targets in the dialog
    const objects = !!spell?.system?.targetObjects;
    // Beings are listed for areas, or beside the Objects (both count as Targets of a Remote / Touch Cast)
    const beings = this.#pickBeings() && !!spell?.system?.targetBeings && (this.AREA_DELIVERIES.includes(t) || objects);
    return (beings || objects) ? { beings, objects } : null;
  }

  /** Player option: pick the Beings in the Cast dialog. */
  static #pickBeings() {
    try { return !!game.settings.get('vagabond', 'castTargetPicker'); } catch { return false; }
  }

  /**
   * Targets of the Cast as the Range node counts them: the picks, plus the user's targets when Beings aren't
   * picked (Objects alone on a Remote Cast add to the targeted Beings).
   */
  static targetCount(actor, spell, state) {
    const modes = this.modes(spell, state.deliveryType);
    if (!modes) return 0;
    const picked = this.candidates(actor, spell, state).filter(c => c.selected).length;
    return picked + (modes.beings ? 0 : game.user.targets.size);
  }

  /** At most this many picks (Touch = one Target), else Infinity. */
  static pickLimit(deliveryType) {
    return String(deliveryType ?? '').toLowerCase() === 'touch' ? 1 : Infinity;
  }

  /** Delivery whose Increase is the number of Targets (picks drive it, like Imbue). */
  static picksDriveIncrease(deliveryType) {
    const t = String(deliveryType ?? '').toLowerCase();
    return CONFIG.VAGABOND.deliveryBaseRanges?.[t]?.type === 'count';
  }

  /** The caster's token on the canvas. */
  static casterToken(actor) {
    return actor.token?.object ?? actor.getActiveTokens(true)[0] ?? null;
  }

  /** Area size in feet for the state's delivery + Increase. */
  static #areaDistance(state) {
    const t = state.deliveryType;
    const base = CONFIG.VAGABOND.deliveryBaseRanges?.[t]?.value ?? 0;
    const inc = CONFIG.VAGABOND.deliveryIncrement?.[t] ?? 0;
    return base + inc * (state.deliveryIncrease ?? 0);
  }

  /**
   * Tokens the area touches, built with the same placement as the spell template (caster origin, targets centroid).
   * Generous on purpose (the caster still picks, the GM can veto): any part of the token's footprint inside counts.
   * @returns {Token[]}
   */
  static tokensInArea(actor, state) {
    const type = String(state.deliveryType ?? '').toLowerCase();
    const shape = this.areaShape(actor, state);
    if (!shape) return [];
    const caster = this.casterToken(actor);
    const inside = this.shapeTest(shape);
    const skipCaster = this.#EMANATES.includes(type);
    return canvas.tokens.placeables.filter(t => {
      if (!t.actor || !t.visible) return false;
      if (t.document.hidden && !game.user.isGM) return false;
      if (skipCaster && t === caster) return false;
      return this.#tokenPoints(t).some(inside);
    });
  }

  /**
   * The Cast's area as a plain v14 Region shape (same placement as the spell template: caster origin, hand-placed
   * aim point `state.areaAnchor` (SpellPlacement), else targets centroid), or null for a non-area delivery / no canvas. Also snapshotted on the Cast for hit macros
   * (`scope.castArea`, Conjure placement).
   * @returns {object|null}
   */
  static areaShape(actor, state) {
    const type = String(state.deliveryType ?? '').toLowerCase();
    if (!this.AREA_DELIVERIES.includes(type) || !canvas?.ready) return null;
    const caster = this.casterToken(actor);
    const targets = Array.from(game.user.targets);
    const manager = globalThis.vagabond?.managers?.templates ?? new VagabondMeasureTemplates();
    const centroid = targets.length ? manager._calculateTargetCentroid(targets) : null;
    const data = manager._constructRegionData({
      type, distance: this.#areaDistance(state), token: caster, targets: game.user.targets, centroid,
      anchor: state.areaAnchor ?? null, notify: false,
    });
    const shape = data?.shapes?.[0];
    if (!shape) return null;
    return foundry.utils.deepClone(shape.toObject?.() ?? shape);
  }

  /** Point test for a v14 Region shape (circle, cone, line, rectangle). */
  static shapeTest(s) {
    switch (s.type) {
      case 'circle':
        return (p) => Math.hypot(p.x - s.x, p.y - s.y) <= s.radius;
      case 'cone': {
        const half = (s.angle ?? 90) / 2;
        return (p) => {
          const d = Math.hypot(p.x - s.x, p.y - s.y);
          if (d > s.radius) return false;
          if (d === 0) return true;
          const deg = Math.toDegrees(Math.atan2(p.y - s.y, p.x - s.x));
          const diff = Math.abs(((deg - s.rotation) % 360 + 540) % 360 - 180);
          return diff <= half;
        };
      }
      case 'line': {
        const rad = Math.toRadians(s.rotation ?? 0);
        const dx = Math.cos(rad), dy = Math.sin(rad);
        return (p) => {
          const vx = p.x - s.x, vy = p.y - s.y;
          const along = vx * dx + vy * dy;
          const across = Math.abs(vx * dy - vy * dx);
          return along >= 0 && along <= s.length && across <= s.width / 2;
        };
      }
      case 'rectangle':
        return (p) => p.x >= s.x && p.x <= s.x + s.width && p.y >= s.y && p.y <= s.y + s.height;
      default:
        return () => false;
    }
  }

  /** Sample points over a token's footprint: a 5×5 grid per grid space, 10% in from each edge. */
  static #tokenPoints(token) {
    const size = canvas.grid.size;
    const w = Math.max(1, token.document.width ?? 1) * size;
    const h = Math.max(1, token.document.height ?? 1) * size;
    const nx = Math.max(5, Math.round(5 * w / size)), ny = Math.max(5, Math.round(5 * h / size));
    const points = [];
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        points.push({ x: token.document.x + w * (0.1 + 0.8 * i / (nx - 1)), y: token.document.y + h * (0.1 + 0.8 * j / (ny - 1)) });
      }
    }
    return points;
  }

  /** Color of the player who owns this actor (their Character first), or null (GM-only actors). */
  static #playerColor(actor) {
    const players = game.users.filter(u => !u.isGM);
    const user = players.find(u => u.character === actor) ?? players.find(u => actor?.testUserPermission(u, 'OWNER'));
    const c = user?.color;
    return c ? (c.css ?? String(c)) : null;
  }

  /** Beings whose weapons are offered: in the area, else the targets, else the caster. */
  static #sourceTokens(actor, state) {
    if (this.AREA_DELIVERIES.includes(String(state.deliveryType ?? '').toLowerCase())) return this.tokensInArea(actor, state);
    const targets = Array.from(game.user.targets);
    if (targets.length) return targets;
    const caster = this.casterToken(actor);
    return caster ? [caster] : [];
  }

  /**
   * Ring entries, each Being followed by its weapons, each with its selection. `picks` holds explicit choices (key → bool); unpicked
   * Beings default to selected (the caster excluded), Objects to not selected; Touch keeps the first selection only.
   * @returns {Array<{key, kind, uuid, img, color, tooltip, selected}>}
   */
  static candidates(actor, spell, state) {
    const modes = this.modes(spell, state.deliveryType);
    if (!modes) return [];
    const picks = state.targetPicks ?? {};
    const caster = this.casterToken(actor);
    const tokens = this.#sourceTokens(actor, state);
    const list = [];
    for (const t of tokens) {
      const color = this.#playerColor(t.actor);
      if (modes.beings) {
        const key = `b:${t.document.uuid}`;
        list.push({
          key, kind: 'being', uuid: t.document.uuid, img: t.document.texture.src, color,
          tooltip: t.name, selected: picks[key] ?? (t !== caster),
        });
      }
      if (!modes.objects) continue;
      for (const w of t.actor.items.filter(i => EquipmentHelper.canImbue(i))) {
        const key = `o:${w.uuid}`;
        list.push({
          key, kind: 'object', uuid: w.uuid, img: w.img, color,
          tooltip: `${t.name}: ${w.name}`, selected: picks[key] ?? false,
        });
      }
    }
    if (this.pickLimit(state.deliveryType) === 1) {
      let kept = false;
      for (const c of list) {
        if (c.selected && kept) c.selected = false;
        if (c.selected) kept = true;
      }
    }
    return list;
  }

  /**
   * Flip one entry. Touch: picking an entry drops every other pick.
   * @returns {object} the new `targetPicks`
   */
  static toggle(actor, spell, state, key) {
    const list = this.candidates(actor, spell, state);
    const entry = list.find(c => c.key === key);
    if (!entry) return state.targetPicks ?? {};
    const picks = { ...(state.targetPicks ?? {}) };
    const next = !entry.selected;
    if (next && this.pickLimit(state.deliveryType) === 1) {
      for (const c of list) picks[c.key] = false;
    }
    picks[key] = next;
    return picks;
  }

  /**
   * The picks handed to the Cast: uuids per kind, `null` when the user's targets stand. Objects on an area delivery
   * make every Being the area touches a Target.
   * @returns {{beings: string[]|null, objects: string[]|null}|null}
   */
  static result(actor, spell, state) {
    const modes = this.modes(spell, state.deliveryType);
    if (!modes) return null;
    const list = this.candidates(actor, spell, state).filter(c => c.selected);
    const isArea = this.AREA_DELIVERIES.includes(String(state.deliveryType ?? '').toLowerCase());
    let beings = null;
    if (modes.beings) beings = list.filter(c => c.kind === 'being').map(c => c.uuid);
    else if (modes.objects && isArea) beings = this.tokensInArea(actor, state).map(t => t.document.uuid);
    return {
      beings,
      objects: modes.objects ? list.filter(c => c.kind === 'object').map(c => c.uuid) : null,
    };
  }

  /**
   * Place the entries on the two side arcs (first half on the left, the rest on the right, each top → bottom and
   * centered on its arc). Icons shrink when an arc gets crowded; past the smallest size the overflow goes to an
   * inner row.
   * @returns {{entries: Array, iconSize: number}}
   */
  static layout(entries) {
    const [outerR, innerR] = this.#ROWS_R;
    const ideal = this.#ICON_MAX + 6;
    const tight = this.#ICON_MIN + 4;
    const arcLen = (R, i) => R * Math.toRadians(Math.abs(this.#ARCS[i][1] - this.#ARCS[i][0]));
    // Most icons one row holds at the smallest size
    const capacity = (R) => this.#ARCS.reduce((n, _, i) => n + Math.floor(arcLen(R, i) / tight) + 1, 0);
    const sidesOf = (list) => {
      const half = Math.ceil(list.length / 2);
      return [list.slice(0, half), list.slice(half)];
    };
    // Spacing (viewBox units) between neighbours on the busier arc of a row
    const rowSpacing = (list, R, max) => Math.min(max, ...sidesOf(list).map((side, i) => side.length > 1 ? arcLen(R, i) / (side.length - 1) : max));
    const place = (list, R, spacing) => {
      const stepDeg = Math.toDegrees(spacing / R);
      sidesOf(list).forEach((side, i) => {
        const [a, b] = this.#ARCS[i];
        const dir = Math.sign(b - a);
        const start = (a + b) / 2 - dir * stepDeg * (side.length - 1) / 2;
        side.forEach((e, k) => {
          const rad = Math.toRadians(start + dir * stepDeg * k);
          e.x = Math.round((180 + R * Math.cos(rad)) * 10) / 10;
          e.y = Math.round((180 + R * Math.sin(rad)) * 10) / 10;
        });
      });
    };

    const cap = capacity(outerR);
    if (entries.length <= cap) {
      const spacing = rowSpacing(entries, outerR, ideal);
      place(entries, outerR, spacing);
      return { entries, iconSize: Math.round(Math.max(this.#ICON_MIN, Math.min(this.#ICON_MAX, spacing - 4))) };
    }
    const outer = entries.slice(0, cap);
    const inner = entries.slice(cap);
    place(outer, outerR, rowSpacing(outer, outerR, tight));
    place(inner, innerR, rowSpacing(inner, innerR, tight));
    return { entries, iconSize: this.#ICON_MIN };
  }

  /**
   * Resolve the picks at Cast time.
   * @param {{beings: string[]|null, objects: string[]|null}|null} picks
   * @returns {Promise<{tokens: Token[]|null, objects: Item[]|null}>}
   */
  static async resolve(picks) {
    const docs = async (uuids) => (await Promise.all((uuids ?? []).map(u => fromUuid(u)))).filter(Boolean);
    const tokens = Array.isArray(picks?.beings) ? (await docs(picks.beings)).map(d => d.object).filter(Boolean) : null;
    const objects = Array.isArray(picks?.objects) ? (await docs(picks.objects)).filter(i => EquipmentHelper.canImbue(i)) : null;
    return { tokens, objects };
  }
}
