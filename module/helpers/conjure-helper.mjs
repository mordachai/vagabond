import { SpellTargetPicker } from './spell-target-picker.mjs';
import { CurrencyHelper } from './currency-helper.mjs';

/**
 * Conjure — Spells that call things forth, driven by the Spell's `system.conjure` rules (no per-Spell code):
 * - Beast (`kind: 'beings'`): "You call forth Beasts that can fit in the area or nearest open space to the Target
 *   for the duration. They can have a cumulative HD no higher than half your Level (minimum 1). … They use your
 *   Cast Skill for any Check they make."
 * - Forge (`kind: 'items'`): "You materialize an Item of 1 Slot or less worth no more than 1g either in an
 *   unoccupied space near the Target, worn by the Target, or one Item per 5' cube within the Target area. … If you
 *   Target yourself with this Spell, you can Equip the Item when it is created (no Action). Doing so can't cause an
 *   Equipped Item to become unequipped. The Item is usable for the duration, then disappears."
 * A future Summoner (Hellspawn, …) is the same rules with another `beingType` / `budget`.
 *
 * Hit macro `system:spell.conjure` (NOT runAsGM: the Conjure picker opens for the caster's player) → the picks are
 * placed on this client's canvas (`place`: free grid spaces inside the Cast's area, nearest first, else the nearest
 * open spaces around each Target / the caster; Glyph = the glyph square, a live trap) → the active GM creates them
 * (query `vagabond.conjure.spawn`) and posts the result card (Dismiss button).
 * - Beings: one world actor per source in "Conjured / <caster>" (flag `conjureSource`, never matched by name),
 *   owned by the caster's players, `commandedBy` the caster (RaiseHelper command Check with the Cast Skill);
 *   unlinked tokens with the caster's disposition.
 * - Items: into each Target Being's inventory (one each; the caster may Equip into free hands); an area Cast drops
 *   one per 5' cube on the ground through Canvas Loot (caster's inventory without the module).
 * Everything conjured is stamped `flags.vagabond.conjured = {castId, casterUuid, spellId, held, createdIn}`.
 *
 * Duration: a Focused Cast (`focusHeld`) ends with the Focus (`vagabond.focusDropped`); any other Cast ends at the
 * start of the caster's next Turn in a started Combat ("Until your next Turn"), else by its Dismiss button.
 */
export class ConjureHelper {

  static COMMAND = 'system:spell.conjure';
  static QUERIES = { spawn: 'vagabond.conjure.spawn', dismiss: 'vagabond.conjure.dismiss', candidates: 'vagabond.conjure.candidates' };

  /** Pack Spells and their rules (world copies matched by source id, see migrateWorldSpells). */
  static PACK_SPELLS = {
    sObsXPGpVI0rIGYu: {
      name: 'Beast',
      conjure: { kind: 'beings', beingType: 'Beasts', budget: 'max(1, floor(@lvl / 2))' },
    },
    Jo4OZhfZO9Q1ROw6: {
      name: 'Forge',
      // "a solid Item made of either copper, iron, glass, stone, or wood": the Item's "Can be Forged" switch
      conjure: { kind: 'items', maxSlots: 1, maxCost: { gold: 1, silver: 0, copper: 0 }, forgeableOnly: true },
    },
  };

  static #queue = Promise.resolve();

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.Conjure.${key}`, data);
  }

  static #esc(s) { return foundry.utils.escapeHTML(String(s ?? '')); }

  /** Register the hit macro. Synchronous, called from init. */
  static registerMacroHandlers(registerMacroHandler, registerCastGate) {
    registerMacroHandler('spell.conjure', (scope) => this.conjure(scope));
    registerCastGate('spell.conjure', (ctx) => this.castGate(ctx));
  }

  /** GM queries. Synchronous, called from init. */
  static registerQueries() {
    CONFIG.queries[this.QUERIES.spawn] = (data, { user }) => this.#serialize(() => this._spawn(data, user));
    CONFIG.queries[this.QUERIES.dismiss] = (data, { user }) => this.#serialize(() => this._dismiss(data, user));
    CONFIG.queries[this.QUERIES.candidates] = (data, { user }) => this._candidates(data, user);
  }

  static #serialize(fn) {
    const run = this.#queue.then(fn, fn);
    this.#queue = run.catch(() => {});
    return run;
  }

  /** Run a query on the active GM (locally when this user is it). */
  static async #request(name, data) {
    const gm = game.users.activeGM;
    if (!gm) {
      ui.notifications.warn(this.#L('NoGM'));
      return null;
    }
    if (gm.isSelf) {
      if (name === this.QUERIES.candidates) return this._candidates(data, game.user);
      return this.#serialize(() => (name === this.QUERIES.spawn ? this._spawn(data, game.user) : this._dismiss(data, game.user)));
    }
    try {
      return await gm.query(name, data, { timeout: 60 * 1000 });
    } catch (err) {
      console.error(`vagabond | Conjure: GM query ${name} failed`, err);
      ui.notifications.error(this.#L('RelayFailed', { gm: gm.name }));
      return null;
    }
  }

  /* -------------------------------------------- */
  /*  Rules                                       */
  /* -------------------------------------------- */

  /** The Spell's Conjure rules, or null. */
  static rules(spell) {
    const c = spell?.system?.conjure;
    return c && ['beings', 'items'].includes(c.kind) ? c : null;
  }

  /** Cumulative HD the caster may call forth (budget formula on the caster's roll data, default 1). */
  static beingBudget(caster, rules) {
    const formula = String(rules.budget ?? '').trim();
    if (!formula) return 1;
    try {
      const roll = new Roll(formula, caster.getRollData());
      roll.evaluateSync({ strict: false });
      return Math.max(0, Math.floor(Number(roll.total) || 0));
    } catch (err) {
      console.warn(`vagabond | Conjure: bad budget formula "${formula}"`, err);
      return 1;
    }
  }

  /** HD a Being spends from the budget. */
  static #hdOf(system) {
    return Math.max(1, Number(system?.hd) || 0);
  }

  /** Not a Being to offer: a Conjured / Raised copy or a Metamorph form. */
  static #isCopy(actor) {
    const f = actor.flags ?? {};
    return !!(f.vagabond?.conjureSource || f.vagabond?.raised || f.metamorph?.temp);
  }

  /**
   * Beings the caster may call forth: NPCs of the Being type with HD within the budget, from the world (the ones
   * this user can see) and every Actor compendium. A world copy of a listed compendium Being is left out.
   * @returns {Promise<Array<{uuid, name, img, cost, badge, w, h}>>}
   */
  static async beingCandidates(rules, budget, user = game.user) {
    const type = rules.beingType || '';
    const fits = (sys) => !!sys && (!type || sys.beingType === type) && this.#hdOf(sys) <= budget;
    const entry = (uuid, name, img, sys, proto) => ({
      uuid, name, img,
      cost: this.#hdOf(sys),
      badge: this.#L('HD', { hd: Number(sys.hd) || 0 }),
      w: Math.max(1, Math.ceil(Number(proto?.width) || 1)),
      h: Math.max(1, Math.ceil(Number(proto?.height) || 1)),
    });
    const out = [];
    // Every Actor compendium (the bestiary is hidden from players: a player's list comes from the GM, see _candidates)
    for (const pack of game.packs.filter(p => p.documentName === 'Actor')) {
      const index = await pack.getIndex({ fields: ['system.beingType', 'system.hd', 'prototypeToken.width', 'prototypeToken.height'] });
      for (const e of index) {
        if (e.type !== 'npc' || !fits(e.system)) continue;
        out.push(entry(e.uuid ?? pack.getUuid(e._id), e.name, e.img, e.system, e.prototypeToken));
      }
    }
    const listed = new Set(out.map(e => e.uuid));
    for (const a of game.actors) {
      if (a.type !== 'npc' || !a.testUserPermission(user, 'LIMITED') || this.#isCopy(a) || !fits(a.system)) continue;
      if (listed.has(a._stats?.compendiumSource)) continue;
      out.push(entry(a.uuid, a.name, a.img, a.system, a.prototypeToken));
    }
    return out.sort((x, y) => x.cost - y.cost || x.name.localeCompare(y.name));
  }

  /**
   * Items the caster may materialize: equipment (no Alchemical / Relic / Supply, nothing priced 0, nothing marked
   * Relic) within the Slots and cost limits — with `forgeableOnly`, only Items switched "Can be Forged" — from the
   * world and every Item compendium (look-alike copies shown once).
   * @returns {Promise<Array<{uuid, name, img, cost, badge}>>}
   */
  static async itemCandidates(rules, user = game.user) {
    const maxCopper = CurrencyHelper.toCopper(rules.maxCost ?? {});
    const maxSlots = Number(rules.maxSlots ?? 1);
    const fits = (type, sys) => {
      if (type !== 'equipment' || !sys) return false;
      const copper = CurrencyHelper.toCopper(sys.baseCost ?? {});
      return !['alchemical', 'relic'].includes(sys.equipmentType) && !sys.isSupply && !sys.relic?.isRelic
        && (!rules.forgeableOnly || sys.forgeable === true)
        && copper > 0 && (!maxCopper || copper <= maxCopper)
        && (Number(sys.baseSlots) || 0) <= maxSlots;
    };
    const seen = new Set();
    const out = [];
    const add = (uuid, name, img, sys) => {
      const copper = CurrencyHelper.toCopper(sys.baseCost ?? {});
      const key = `${name}|${img}|${copper}`;   // visual duplicates (shop stock), not identity
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ uuid, name, img, cost: 1, badge: CurrencyHelper.format(CurrencyHelper.fromCopper(copper)) });
    };
    for (const pack of game.packs.filter(p => p.documentName === 'Item')) {
      const index = await pack.getIndex({ fields: ['system.equipmentType', 'system.baseCost', 'system.baseSlots', 'system.isSupply', 'system.forgeable', 'system.relic.isRelic'] });
      for (const e of index) if (fits(e.type, e.system)) add(e.uuid ?? pack.getUuid(e._id), e.name, e.img, e.system);
    }
    for (const i of game.items) {
      if (i.testUserPermission(user, 'LIMITED') && !i.flags?.vagabond?.conjured && fits(i.type, i.system)) add(i.uuid, i.name, i.img, i.system);
    }
    return out.sort((x, y) => x.name.localeCompare(y.name));
  }

  /* -------------------------------------------- */
  /*  Hit macro (caster's client)                 */
  /* -------------------------------------------- */

  /** Hit macro `system:spell.conjure`: pick, place, ask the GM to create. */
  static async conjure(scope) {
    const caster = scope?.actor;
    const spell = scope?.item?.id ? scope.item : null;
    const rules = this.rules(spell);
    if (!caster || !rules) return;
    if (!caster.isOwner) {
      ui.notifications.warn(this.#L('NotYours', { name: caster.name }));
      return;
    }
    if (!canvas?.ready || !canvas.scene) {
      ui.notifications.warn(this.#L('NoScene'));
      return;
    }
    const castArea = scope.castArea ?? null;
    if (castArea?.sceneId && castArea.sceneId !== canvas.scene.id) {
      ui.notifications.warn(this.#L('WrongScene'));
      return;
    }
    const area = castArea?.shape ?? null;
    const targets = (scope.targets ?? []).map(t => t?.object ?? t)
      .filter(t => t?.document && t.document.parent?.id === canvas.scene.id);
    // Remote Targets that are spaces on the map (SpellPlacement, grid-space centers)
    const spaces = (scope.targetSpaces ?? [])
      .filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y) && (!p.sceneId || p.sceneId === canvas.scene.id))
      .map(p => ({ x: p.x, y: p.y }));
    const casterToken = SpellTargetPicker.casterToken(caster);
    const base = {
      casterUuid: caster.uuid,
      spellUuid: spell.uuid,
      held: scope.focusHeld === true,
      sceneId: canvas.scene.id,
      levelId: casterToken?.document?.level ?? canvas.level?.id ?? null,
    };
    if (rules.kind === 'beings') return this.#conjureBeings(caster, spell, rules, { area, targets, spaces, casterToken, base });
    return this.#conjureItems(caster, spell, rules, { area, targets, spaces, casterToken, base });
  }

  static async #conjureBeings(caster, spell, rules, { area, targets, spaces, casterToken, base }) {
    const budget = this.beingBudget(caster, rules);
    const candidates = await this.#candidatesFor(caster, spell, budget);
    if (!candidates.length) {
      ui.notifications.warn(this.#L('NoneFit', { budget }));
      return;
    }
    const { ConjurePicker } = await import('../applications/conjure-picker.mjs');
    const { picks } = await ConjurePicker.prompt({
      title: spell.name,
      hint: this.#L('BeingsHint', { budget }),
      budget,
      budgetLabel: this.#L('BudgetHD'),
      candidates,
    }) ?? {};
    if (!picks?.length) return;
    const list = picks.flatMap(p => Array(p.count).fill(p.entry));
    const spaceAnchors = spaces.map(p => ({ center: p }));
    const anchors = (targets.length || spaceAnchors.length) ? [...spaceAnchors, ...targets] : [casterToken].filter(Boolean);
    if (!area && !anchors.length) {
      ui.notifications.warn(this.#L('NoToken'));
      return;
    }
    const spots = this.place(list.map(e => ({ w: e.w, h: e.h })), { area, anchors });
    const beings = list.map((e, i) => (spots[i] ? { uuid: e.uuid, x: spots[i].x, y: spots[i].y } : null)).filter(Boolean);
    if (beings.length < list.length) ui.notifications.warn(this.#L('NoRoom', { n: list.length - beings.length }));
    if (!beings.length) return;
    return this.#report(await this.#request(this.QUERIES.spawn, { ...base, kind: 'beings', beings }));
  }

  static async #conjureItems(caster, spell, rules, { area, targets, spaces, casterToken, base }) {
    const loot = this.#canvasLoot();
    // Where each Item goes (one per Target, or per 5' cube of the area), worked out before the picker opens
    let slots;
    if (area) {
      if (!loot) {
        ui.notifications.warn(this.#L('AreaNeedsLoot'));
        return;
      }
      slots = this.cellsIn(area).map(point => ({ point }));
    } else {
      slots = this.#targetSlots(caster, targets, spaces, casterToken, base.levelId, loot);
      if (!slots) return;
    }
    const budget = slots.length;
    if (!budget) {
      ui.notifications.warn(this.#L('NoRoom', { n: 1 }));
      return;
    }
    const candidates = await this.#candidatesFor(caster, spell, budget);
    if (!candidates.length) {
      ui.notifications.warn(this.#L('NoItems'));
      return;
    }
    const selfTarget = slots.some(s => s.actorUuid === caster.uuid);
    const { ConjurePicker } = await import('../applications/conjure-picker.mjs');
    const { picks, equip } = await ConjurePicker.prompt({
      title: spell.name,
      hint: area ? this.#L('ItemsAreaHint', { n: budget }) : this.#L('ItemsTargetHint', { n: budget }),
      budget,
      budgetLabel: this.#L('BudgetItems'),
      candidates,
      equipToggle: selfTarget ? this.#L('EquipSelf') : null,
    }) ?? {};
    if (!picks?.length) return;
    const list = picks.flatMap(p => Array(p.count).fill(p.entry));
    const items = list.map((e, i) => ({
      uuid: e.uuid,
      ...slots[i],
      equip: !!equip && slots[i].actorUuid === caster.uuid,
    }));
    return this.#report(await this.#request(this.QUERIES.spawn, { ...base, kind: 'items', items }));
  }

  /**
   * One Item per Target ("in an unoccupied space near the Target, worn by the Target"): the caster gets it in their
   * inventory (may Equip it); another Target gets it on the ground in a free space next to it with Canvas Loot, else
   * in a Character's inventory. An NPC can't receive Items: without Canvas Loot the Cast warns and stops (the cast
   * gate already blocks such a Cast before any Mana is spent). A Targeted space (Remote) gets its Item on the ground
   * in that space (Canvas Loot only). No Target → the caster.
   * @returns {Array<{actorUuid?: string, point?: {x, y}, near?: string}>|null}  null = stopped
   */
  static #targetSlots(caster, targets, spaces, casterToken, levelId, loot) {
    const seen = new Set();
    const tokens = targets.filter(t => t.actor && !seen.has(t.actor.uuid) && seen.add(t.actor.uuid));
    if (!tokens.length && !spaces.length) return [{ actorUuid: caster.uuid }];
    if (spaces.length && !loot) {
      ui.notifications.warn(this.#L('SpacesNeedLoot'));
      return null;
    }
    const blocked = tokens.filter(t => t.actor.uuid !== caster.uuid && !loot && t.actor.type !== 'character');
    if (blocked.length) {
      ui.notifications.warn(this.#L('NpcNoItems', { names: blocked.map(t => t.name).join(', ') }));
      return null;
    }
    const size = canvas.grid.size;
    const avoid = [];
    const slots = [];
    // Targeted spaces first, so the Items dropped next to Target tokens keep off them
    for (const p of spaces) {
      const point = canvas.grid.getCenterPoint(p);
      avoid.push({ x: point.x - size / 2, y: point.y - size / 2, width: size, height: size });
      slots.push({ point });
    }
    for (const t of tokens) {
      if (t.actor.uuid === caster.uuid) { slots.push({ actorUuid: caster.uuid }); continue; }
      if (loot) {
        let point = null;
        try {
          const d = t.document;
          [point] = loot.findLootSpaces({
            scene: canvas.scene, levelId: levelId ?? d.level, origin: t.center,
            around: { x: d.x, y: d.y, width: d.width * size, height: d.height * size },
            count: 1, avoid,
          });
        } catch (err) {
          console.warn('vagabond | Conjure: no Canvas Loot space next to', t.name, err);
        }
        if (point) {
          avoid.push({ x: point.x - size / 2, y: point.y - size / 2, width: size, height: size });
          slots.push({ point, near: t.name });
          continue;
        }
        if (t.actor.type !== 'character') {
          ui.notifications.warn(this.#L('NoRoomNear', { name: t.name }));
          continue;
        }
      }
      slots.push({ actorUuid: t.actor.uuid });
    }
    return slots;
  }

  /**
   * Cast gate (before any roll or Mana): an Items Conjure that can't put its Items anywhere is refused — an area
   * Cast (or Glyph) without Canvas Loot, or NPC Targets (they can't receive Items) without Canvas Loot.
   */
  static castGate({ actor, spell, state, tokens }) {
    const rules = this.rules(spell);
    if (rules?.kind !== 'items' || this.#canvasLoot()) return null;
    const t = String(state?.deliveryType ?? '').toLowerCase();
    if (t === 'glyph' || SpellTargetPicker.AREA_DELIVERIES.includes(t)) return this.#L('AreaNeedsLoot');
    if (state?.targetSpaces?.length) return this.#L('SpacesNeedLoot');
    const npcs = (tokens ?? []).filter(tk => tk.actor && tk.actor.uuid !== actor.uuid && tk.actor.type !== 'character');
    return npcs.length ? this.#L('NpcNoItems', { names: npcs.map(tk => tk.name).join(', ') }) : null;
  }

  /**
   * The picker's list. Players can't read hidden compendiums (the bestiary is GM-only), so a player's list is
   * built by the active GM (query `vagabond.conjure.candidates`) with that player's view of the world documents.
   */
  static async #candidatesFor(caster, spell, budget) {
    if (game.user.isGM) {
      const rules = this.rules(spell);
      return rules.kind === 'beings' ? this.beingCandidates(rules, budget) : this.itemCandidates(rules);
    }
    const res = await this.#request(this.QUERIES.candidates, { casterUuid: caster.uuid, spellUuid: spell.uuid });
    if (res?.error) ui.notifications.error(res.error);
    return res?.candidates ?? [];
  }

  /** Active GM: the candidate list for `user`'s Cast (budget recomputed from the caster). */
  static async _candidates({ casterUuid, spellUuid }, user) {
    try {
      const caster = await fromUuid(casterUuid);
      const spell = await fromUuid(spellUuid);
      const rules = this.rules(spell);
      if (!caster || !rules || spell.parent?.uuid !== caster.uuid) return { error: this.#L('SpellGone') };
      if (!user.isGM && !caster.testUserPermission(user, 'OWNER')) return { error: this.#L('NotYours', { name: caster.name }) };
      const candidates = rules.kind === 'beings'
        ? await this.beingCandidates(rules, this.beingBudget(caster, rules), user)
        : await this.itemCandidates(rules, user);
      return { candidates };
    } catch (err) {
      console.error('vagabond | Conjure: candidate list failed', err);
      return { error: err?.message ?? String(err) };
    }
  }

  static #report(result) {
    if (result?.error) ui.notifications.error(result.error);
    for (const n of result?.notes ?? []) ui.notifications[n.level]?.(n.message);
    return result;
  }

  /** Canvas Loot API (optional module), or null. */
  static #canvasLoot() {
    const mod = game.modules.get('canvas-loot');
    return mod?.active ? (mod.api ?? null) : null;
  }

  /* -------------------------------------------- */
  /*  Placement (client canvas)                   */
  /* -------------------------------------------- */

  static #key(i, j) { return `${i},${j}`; }

  /** Grid spaces covered by every token of the scene. */
  static #occupied() {
    const set = new Set();
    for (const t of canvas.scene.tokens) {
      for (const k of this.#footprint(canvas.grid.getOffset({ x: t.x + 1, y: t.y + 1 }), t.width, t.height)) set.add(k);
    }
    return set;
  }

  /** Keys of the w×h spaces from top-left space {i, j}. */
  static #footprint({ i, j }, w = 1, h = 1) {
    const keys = [];
    for (let di = 0; di < Math.max(1, Math.ceil(h)); di++) {
      for (let dj = 0; dj < Math.max(1, Math.ceil(w)); dj++) keys.push(this.#key(i + di, j + dj));
    }
    return keys;
  }

  static #inScene({ i, j }, w, h) {
    const rect = canvas.dimensions.sceneRect;
    const tl = canvas.grid.getTopLeftPoint({ i, j });
    const size = canvas.grid.size;
    return tl.x >= rect.x && tl.y >= rect.y && tl.x + w * size <= rect.x + rect.width && tl.y + h * size <= rect.y + rect.height;
  }

  static #blocked(from, to) {
    try {
      return !!CONFIG.Canvas.polygonBackends.move.testCollision(from, to, { type: 'move', mode: 'any' });
    } catch {
      return false;
    }
  }

  /** Grid spaces within `r` spaces of a point, nearest first. */
  static #ring(center, r) {
    const c = canvas.grid.getOffset(center);
    const out = [];
    for (let di = -r; di <= r; di++) {
      for (let dj = -r; dj <= r; dj++) {
        const off = { i: c.i + di, j: c.j + dj };
        const p = canvas.grid.getCenterPoint(off);
        out.push({ off, d: Math.hypot(p.x - center.x, p.y - center.y) });
      }
    }
    return out.sort((a, b) => a.d - b.d).map(e => e.off);
  }

  /** Grid spaces whose centre lies in the area, nearest its middle first. Also Forge's "5' cubes". */
  static #areaSpaces(shape) {
    const inside = SpellTargetPicker.shapeTest(shape);
    const r = shape.radius ?? shape.length ?? Math.max(shape.width ?? 0, shape.height ?? 0);
    const origin = shape.type === 'rectangle' ? { x: shape.x, y: shape.y } : { x: shape.x - r, y: shape.y - r };
    const span = shape.type === 'rectangle' ? { w: shape.width, h: shape.height } : { w: 2 * r, h: 2 * r };
    const size = canvas.grid.size;
    const spaces = [];
    const seen = new Set();
    for (let y = origin.y; y <= origin.y + span.h + size; y += size / 2) {
      for (let x = origin.x; x <= origin.x + span.w + size; x += size / 2) {
        const off = canvas.grid.getOffset({ x, y });
        const k = this.#key(off.i, off.j);
        if (seen.has(k)) continue;
        seen.add(k);
        const p = canvas.grid.getCenterPoint(off);
        if (inside(p) && this.#inScene(off, 1, 1)) spaces.push({ off, p });
      }
    }
    const mid = spaces.length
      ? { x: spaces.reduce((s, e) => s + e.p.x, 0) / spaces.length, y: spaces.reduce((s, e) => s + e.p.y, 0) / spaces.length }
      : { x: shape.x, y: shape.y };
    spaces.sort((a, b) => Math.hypot(a.p.x - mid.x, a.p.y - mid.y) - Math.hypot(b.p.x - mid.x, b.p.y - mid.y));
    return { spaces, mid };
  }

  /** Centres of the area's grid spaces, nearest its middle first (Forge: one Item per 5' cube). */
  static cellsIn(shape) {
    return this.#areaSpaces(shape).spaces.map(e => ({ x: e.p.x, y: e.p.y }));
  }

  /**
   * Top-left canvas positions for tokens of the given sizes (grid spaces): free spaces inside the area, nearest its
   * middle first, then the nearest open spaces outside it; without an area, the nearest open spaces around each
   * anchor in turn (not behind a wall from it). null where nothing fits.
   * @param {Array<{w: number, h: number}>} sizes
   * @param {{area: object|null, anchors: Token[]}} where
   * @returns {Array<{x: number, y: number}|null>}
   */
  static place(sizes, { area = null, anchors = [] }) {
    const occupied = this.#occupied();
    const fits = (off, w, h, test) => {
      if (!this.#inScene(off, w, h)) return false;
      for (let di = 0; di < h; di++) {
        for (let dj = 0; dj < w; dj++) {
          const cell = { i: off.i + di, j: off.j + dj };
          if (occupied.has(this.#key(cell.i, cell.j))) return false;
          if (test && !test(cell)) return false;
        }
      }
      return true;
    };
    const take = (off, w, h) => {
      for (const k of this.#footprint(off, w, h)) occupied.add(k);
      return canvas.grid.getTopLeftPoint(off);
    };
    const nearOpen = (center, w, h) => {
      for (const off of this.#ring(center, 12)) {
        if (!fits(off, w, h, (cell) => !this.#blocked(center, canvas.grid.getCenterPoint(cell)))) continue;
        return take(off, w, h);
      }
      return null;
    };

    const order = sizes.map((s, idx) => ({ ...s, idx })).sort((a, b) => b.w * b.h - a.w * a.h);
    const out = new Array(sizes.length).fill(null);
    if (area) {
      const { spaces, mid } = this.#areaSpaces(area);
      const inArea = new Set(spaces.map(e => this.#key(e.off.i, e.off.j)));
      for (const s of order) {
        const spot = spaces.find(e => fits(e.off, s.w, s.h, (cell) => inArea.has(this.#key(cell.i, cell.j))));
        out[s.idx] = spot ? take(spot.off, s.w, s.h) : nearOpen(mid, s.w, s.h);
      }
      return out;
    }
    order.forEach((s, n) => {
      const anchor = anchors[n % anchors.length];
      out[s.idx] = anchor ? nearOpen(anchor.center, s.w, s.h) : null;
    });
    return out;
  }

  /* -------------------------------------------- */
  /*  Spawn (active GM)                           */
  /* -------------------------------------------- */

  /** Started Combat the caster is in: where "Until your next Turn" is counted. */
  static #combatOf(caster) {
    const combat = game.combats.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === caster.uuid));
    return combat ? { combatId: combat.id, round: combat.round, turn: combat.turn } : null;
  }

  /**
   * Create what the caster's client picked and placed. Active GM (query `vagabond.conjure.spawn`).
   * @param {object} data  {kind, casterUuid, spellUuid, held, sceneId, levelId, beings: [{uuid, x, y}], items: [{uuid, actorUuid?, point?, equip?}]}
   * @param {User} user  the requesting user
   */
  static async _spawn(data, user) {
    const notes = [];
    try {
      const caster = await fromUuid(data.casterUuid);
      const spell = await fromUuid(data.spellUuid);
      const rules = this.rules(spell);
      if (!caster || !rules || spell.parent?.uuid !== caster.uuid) return { error: this.#L('SpellGone') };
      if (!user.isGM && !caster.testUserPermission(user, 'OWNER')) return { error: this.#L('NotYours', { name: caster.name }) };
      const scene = game.scenes.get(data.sceneId);
      if (!scene) return { error: this.#L('NoScene') };
      const stamp = {
        castId: foundry.utils.randomID(),
        casterUuid: caster.uuid,
        casterName: caster.name,
        spellId: spell.id,
        spellName: spell.name,
        held: !!data.held,
        createdIn: this.#combatOf(caster),
      };
      const done = rules.kind === 'beings'
        ? await this.#spawnBeings(caster, rules, scene, data, stamp, notes)
        : await this.#spawnItems(caster, scene, data, stamp, notes);
      if (done.lines.length) await this.#resultCard(caster, spell, stamp, done);
      return { notes };
    } catch (err) {
      console.error('vagabond | Conjure: spawn failed', err);
      return { notes, error: err?.message ?? String(err) };
    }
  }

  static async #spawnBeings(caster, rules, scene, data, stamp, notes) {
    // The client placed them; the rules are checked again here (budget)
    const budget = this.beingBudget(caster, rules);
    const casterToken = caster.getActiveTokens(false, true).find(t => t.parent?.id === scene.id) ?? caster.getActiveTokens(false, true)[0];
    const disposition = casterToken?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY;
    const folder = await this.#folder(caster);
    const tokenData = [];
    const counts = new Map();
    let spent = 0;
    for (const b of data.beings ?? []) {
      const src = await fromUuid(b.uuid);
      if (src?.documentName !== 'Actor' || (rules.beingType && src.system?.beingType !== rules.beingType)) continue;
      const hd = this.#hdOf(src.system);
      if (spent + hd > budget) {
        notes.push({ level: 'warn', message: this.#L('OverBudget', { name: src.name, budget }) });
        continue;
      }
      spent += hd;
      const base = await this.#summonActor(src, b.uuid, caster, folder);
      const doc = await base.getTokenDocument({
        x: b.x, y: b.y, actorLink: false, disposition, hidden: false,
        ...(data.levelId ? { level: data.levelId } : {}),
        flags: { vagabond: { conjured: stamp } },
      }, { parent: scene });
      tokenData.push(doc.toObject());
      counts.set(src.name, (counts.get(src.name) ?? 0) + 1);
    }
    const created = tokenData.length ? await scene.createEmbeddedDocuments('Token', tokenData) : [];
    const lines = [...counts].map(([name, n]) => this.#L('Appears', { name: this.#esc(name), n }));
    return {
      lines,
      targets: created.map(t => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId, actorName: t.name, actorImg: t.texture.src })),
    };
  }

  /** The caster's world copy of a Being (reused across Casts): full HP, statuses off, their players own it. */
  static async #summonActor(src, sourceUuid, caster, folder) {
    const existing = game.actors.find(a => {
      const f = a.flags?.vagabond?.conjureSource;
      return f?.casterUuid === caster.uuid && f.sourceUuid === sourceUuid;
    });
    if (existing) return existing;
    const data = src.toObject();
    delete data._id;
    data.folder = folder.id;
    data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    for (const u of game.users.filter(u => !u.isGM && caster.testUserPermission(u, 'OWNER'))) {
      data.ownership[u.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    }
    data.effects = (data.effects ?? []).filter(e => !e.statuses?.length);
    foundry.utils.setProperty(data, 'system.health.value', src.system.health?.max ?? data.system?.health?.max ?? 1);
    data.prototypeToken = { ...(data.prototypeToken ?? {}), actorLink: false };
    data.flags ??= {};
    data.flags.vagabond = {
      ...(data.flags.vagabond ?? {}),
      conjureSource: { casterUuid: caster.uuid, sourceUuid },
      // "They use your Cast Skill for any Check they make" — always, Focused or not (no spellId)
      commandedBy: { casterUuid: caster.uuid, spellId: null },
    };
    return Actor.implementation.create(data);
  }

  static async #spawnItems(caster, scene, data, stamp, notes) {
    const loot = this.#canvasLoot();
    const lines = [];
    const targets = new Map();
    const levelId = data.levelId ?? scene.firstLevel?.id ?? scene.levels?.contents?.[0]?.id ?? null;
    for (const it of data.items ?? []) {
      const src = await fromUuid(it.uuid);
      if (src?.documentName !== 'Item') continue;
      const itemData = src.toObject();
      delete itemData._id;
      delete itemData.folder;
      foundry.utils.setProperty(itemData, 'system.equipmentState', 'unequipped');
      foundry.utils.setProperty(itemData, 'system.equipped', false);
      foundry.utils.setProperty(itemData, 'flags.vagabond.conjured', stamp);

      if (it.point && loot && levelId) {
        const tile = await loot.spawnLoot({ scene, levelId, point: it.point, itemData, chat: false }).catch(err => {
          console.warn('vagabond | Conjure: Canvas Loot spawn failed', err);
          return null;
        });
        if (tile) {
          await tile.update({ 'flags.vagabond.conjured': stamp });
          lines.push(it.near
            ? this.#L('OnGroundNear', { item: this.#esc(src.name), name: this.#esc(it.near) })
            : this.#L('OnGround', { item: this.#esc(src.name) }));
          continue;
        }
      }
      const receiver = it.actorUuid ? await fromUuid(it.actorUuid) : caster;
      if (!receiver || receiver.documentName !== 'Actor') continue;
      const [item] = await receiver.createEmbeddedDocuments('Item', [itemData]);
      let line = this.#L('Given', { item: this.#esc(src.name), name: this.#esc(receiver.name) });
      if (it.equip && receiver === caster && item) {
        line += await this.#equipFree(caster, item) ? ` ${this.#L('Equipped')}` : ` ${this.#L('NoFreeHands')}`;
      }
      lines.push(line);
      const tok = receiver.token ?? receiver.getActiveTokens(false, true)[0];
      if (tok && !targets.has(receiver.uuid)) {
        targets.set(receiver.uuid, { tokenId: tok.id, sceneId: tok.parent?.id, actorId: receiver.id, actorName: tok.name, actorImg: tok.texture.src });
      }
    }
    return { lines, targets: [...targets.values()] };
  }

  /** Forge on yourself: Equip the Item only when that unequips nothing (free hands, no worn Armor replaced). */
  static async #equipFree(actor, item) {
    const { EquipmentHelper } = await import('./equipment-helper.mjs');
    const state = EquipmentHelper.defaultEquipState(item);
    const need = { oneHand: 1, twoHands: 2 }[state] ?? 0;
    const used = actor.items.reduce((sum, i) => sum + (i.id === item.id ? 0 : EquipmentHelper.handsFor(i)), 0);
    if (used + need > 2) return false;
    if (item.system.equipmentType === 'armor' && EquipmentHelper.getWornArmor(actor)) return false;
    await EquipmentHelper.equipWithHandLimit(actor, item.id, state);
    return true;
  }

  /** "Conjured" root folder + the caster's sub-folder (found by flag, created when missing). */
  static async #folder(caster) {
    const actorFolders = game.folders.filter(f => f.type === 'Actor');
    let root = actorFolders.find(f => f.getFlag('vagabond', 'conjureFolder') && !f.getFlag('vagabond', 'conjureCaster'));
    root ??= await Folder.implementation.create({
      name: this.#L('FolderName'), type: 'Actor', color: '#2b3a2f',
      flags: { vagabond: { conjureFolder: true } },
    });
    let sub = actorFolders.find(f => f.getFlag('vagabond', 'conjureCaster') === caster.uuid);
    sub ??= await Folder.implementation.create({
      name: caster.name, type: 'Actor', folder: root.id,
      flags: { vagabond: { conjureFolder: true, conjureCaster: caster.uuid } },
    });
    return sub;
  }

  static async #resultCard(caster, spell, stamp, { lines, targets }) {
    const until = stamp.held ? this.#L('UntilFocus') : this.#L('UntilTurn');
    const dismiss = `<div class="protect-buttons-row conjure-buttons">
      <button type="button" class="vagabond-conjure-dismiss" data-caster-uuid="${stamp.casterUuid}" data-cast-id="${stamp.castId}">
        <i class="fa-solid fa-ban"></i> ${this.#L('Dismiss')}</button></div>`;
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.createActionCard({
      actor: caster,
      item: spell,
      title: spell.name,
      subtitle: caster.name,
      description: `<ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul><p><em>${until}</em></p>`,
      targetsAtRollTime: targets,
      footerActions: [dismiss],
    });
  }

  /* -------------------------------------------- */
  /*  End (active GM)                             */
  /* -------------------------------------------- */

  /** Every actor: sidebar + unlinked token actors. */
  static #actors() {
    return [
      ...game.actors.contents,
      ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink && t.actor).map(t => t.actor)),
    ];
  }

  /**
   * Remove what matching Casts conjured: tokens, ground tiles, Items in any inventory; then the caster's world
   * copies no token uses any more, and empty folders — silently (what vanishes is the message). Active GM
   * (query `vagabond.conjure.dismiss`).
   * @param {object} q  {casterUuid, castId?, spellIds?, exceptSpellIds?, held?: boolean, notIn?: {combatId, round, turn}}
   * @param {User} user
   * @returns {Promise<{removed: number}|{error: string}>}
   */
  static async _dismiss(q, user) {
    const caster = await fromUuid(q.casterUuid);
    if (!user.isGM && !caster?.testUserPermission(user, 'OWNER')) return { error: this.#L('NotYours', { name: caster?.name ?? '' }) };
    const sameTurn = (c) => !!c && !!q.notIn && c.combatId === q.notIn.combatId && c.round === q.notIn.round && c.turn === q.notIn.turn;
    const match = (st) => !!st && st.casterUuid === q.casterUuid
      && (!q.castId || st.castId === q.castId)
      && (!q.spellIds || q.spellIds.includes(st.spellId))
      && (!q.exceptSpellIds || !q.exceptSpellIds.includes(st.spellId))
      && (q.held === undefined || q.held === null || !!st.held === q.held)
      && !sameTurn(st.createdIn);
    const conj = (doc) => doc.flags?.vagabond?.conjured;
    let removed = 0;

    for (const scene of game.scenes) {
      for (const coll of ['Token', 'Tile']) {
        const docs = scene.getEmbeddedCollection(coll).filter(d => match(conj(d)));
        if (!docs.length) continue;
        await scene.deleteEmbeddedDocuments(coll, docs.map(d => d.id)).catch(err => console.warn('vagabond | Conjure: delete failed', err));
        removed += docs.length;
      }
    }
    for (const actor of this.#actors()) {
      const ids = actor.items.filter(i => match(conj(i))).map(i => i.id);
      if (!ids.length) continue;
      await actor.deleteEmbeddedDocuments('Item', ids).catch(err => console.warn('vagabond | Conjure: delete failed', err));
      removed += ids.length;
    }
    // World copies with no token left, then empty caster folders
    const inUse = new Set(game.scenes.contents.flatMap(s => s.tokens.contents.map(t => t.actorId)));
    for (const a of game.actors.filter(a => a.flags?.vagabond?.conjureSource?.casterUuid === q.casterUuid && !inUse.has(a.id))) {
      await a.delete().catch(() => {});
    }
    for (const f of game.folders.filter(f => f.type === 'Actor' && f.getFlag('vagabond', 'conjureCaster'))) {
      if (!f.contents.length && !f.children.length) await f.delete().catch(() => {});
    }
    return { removed };
  }

  /** Does `caster`'s Spell have Conjured Beings / Items out (any scene, any inventory)? Spell context menu Dismiss. */
  static hasActive(caster, spellId) {
    if (!caster) return false;
    const mine = (doc) => {
      const c = doc.flags?.vagabond?.conjured;
      return c?.casterUuid === caster.uuid && c.spellId === spellId;
    };
    if (game.scenes.some(s => s.tokens.some(mine) || s.tiles.some(mine))) return true;
    return this.#actors().some(a => a.items.some(mine));
  }

  /** Does `caster` have non-Focused conjurings out (other than `exceptSpellId`'s)? */
  static #hasLoose(caster, exceptSpellId) {
    const loose = (doc) => {
      const c = doc.flags?.vagabond?.conjured;
      return c?.casterUuid === caster.uuid && !c.held && c.spellId !== exceptSpellId;
    };
    if (game.scenes.some(s => s.tokens.some(loose) || s.tiles.some(loose))) return true;
    return this.#actors().some(a => a.items.some(loose));
  }

  /** Spell context menu Dismiss: end everything this Spell conjured (caster's owner or GM). */
  static async dismissSpell(caster, spellId) {
    if (!this.hasActive(caster, spellId)) return;
    const res = await this.#request(this.QUERIES.dismiss, { casterUuid: caster.uuid, spellIds: [spellId] });
    if (res?.error) ui.notifications.error(res.error);
  }

  /** Result card Dismiss button (caster's owner or GM). */
  static async handleDismissButton(button) {
    const casterUuid = button.dataset.casterUuid;
    const caster = await fromUuid(casterUuid);
    if (!caster?.isOwner && !game.user.isGM) {
      ui.notifications.warn(this.#L('NotYours', { name: caster?.name ?? '' }));
      return;
    }
    const res = await this.#request(this.QUERIES.dismiss, { casterUuid, castId: button.dataset.castId });
    if (res?.error) ui.notifications.error(res.error);
    else button.disabled = true;
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    // A Focused Cast ends with the Focus (SpellTrackerHelper fires this on the active GM)
    Hooks.on('vagabond.focusDropped', (caster, spellIds) => {
      this.#serialize(() => this._dismiss({ casterUuid: caster.uuid, spellIds, held: true }, game.user))
        .catch(err => console.error('vagabond | Conjure: Focus end failed', err));
    });
    // Any other Cast lasts "Until your next Turn": gone at the start of the caster's next Turn in a started Combat
    Hooks.on('updateCombat', (combat, changed) => {
      if (game.user !== game.users.activeGM) return;
      if (changed.turn === undefined && changed.round === undefined) return;
      if (!combat.started) return;
      const actor = combat.combatant?.actor;
      if (!actor) return;
      const notIn = { combatId: combat.id, round: combat.round, turn: combat.turn };
      this.#serialize(() => this._dismiss({ casterUuid: actor.uuid, held: false, notIn }, game.user))
        .catch(err => console.error('vagabond | Conjure: Turn end failed', err));
    });
    // ...or until the caster does anything else (attack, Check, Cast, Item use; Saves don't count), so it also ends
    // with no Combat running. Fires on the acting client; a Cast's own Luck reroll (same Spell) is skipped.
    Hooks.on('vagabond.actorActed', (actor, { source, itemId } = {}) => {
      if (!actor || (!actor.isOwner && !game.user.isGM)) return;
      const except = source === 'cast' ? itemId : null;
      if (!this.#hasLoose(actor, except)) return;
      this.#request(this.QUERIES.dismiss, { casterUuid: actor.uuid, held: false, exceptSpellIds: except ? [except] : null })
        .catch(err => console.error('vagabond | Conjure: next action end failed', err));
    });
  }

  /* -------------------------------------------- */
  /*  Migration                                   */
  /* -------------------------------------------- */

  /**
   * One-time (guard `conjureSpellsMigrated2`): world copies of the pack Conjure Spells get their `conjure` rules
   * (missing `forgeableOnly` filled in) and the `system:spell.conjure` hit macro (when they have no hit macro of their
   * own); world copies of compendium Items switched "Can be Forged" get the switch. Active GM only; waits for a
   * rebuilt compendium (no gear Item has the switch yet).
   */
  static async migrateWorldSpells() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'conjureSpellsMigrated2')) return;
    const gear = game.packs.get('vagabond.gear');
    const gearIndex = gear ? await gear.getIndex({ fields: ['system.forgeable'] }) : null;
    if (gearIndex && !gearIndex.some(e => e.system?.forgeable)) return;   // compendium not rebuilt yet
    const { isCopyOf, sourceDocId } = await import('./source-id.mjs');
    const spells = [...game.items.contents, ...this.#actors().flatMap(a => Array.from(a.items))].filter(i => i?.type === 'spell');
    for (const item of spells) {
      try {
        const [, def] = Object.entries(this.PACK_SPELLS).find(([id, d]) => isCopyOf(item, id, d.name)) ?? [];
        if (!def) continue;
        const update = {};
        if (!this.rules(item)) update['system.conjure'] = { ...item.system.conjure, ...def.conjure };
        else if (def.conjure.forgeableOnly && !item.system.conjure.forgeableOnly) update['system.conjure.forgeableOnly'] = true;
        if (!String(item.system.hitMacro?.command ?? '').trim() && !item.system.hitMacro?.uuid) {
          update['system.hitMacro'] = { enabled: true, uuid: '', command: this.COMMAND, label: item.name, runAsGM: false };
        }
        if (Object.keys(update).length) await item.update(update);
      } catch (err) {
        console.warn(`vagabond | Conjure migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    // Item copies (sidebar + inventories) of compendium Items switched "Can be Forged"
    const forgeable = new Set();
    for (const pack of game.packs.filter(p => p.documentName === 'Item' && p.metadata.packageName === 'vagabond')) {
      const index = await pack.getIndex({ fields: ['system.forgeable'] });
      for (const e of index) if (e.system?.forgeable) forgeable.add(e._id);
    }
    const items = [...game.items.contents, ...this.#actors().flatMap(a => Array.from(a.items))]
      .filter(i => i?.type === 'equipment' && !i.system.forgeable);
    for (const item of items) {
      try {
        if (forgeable.has(sourceDocId(item))) await item.update({ 'system.forgeable': true });
      } catch (err) {
        console.warn(`vagabond | Conjure migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'conjureSpellsMigrated2', true);
  }
}
