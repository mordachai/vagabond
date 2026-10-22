import { AutomationMode } from './automation-mode.mjs';
import { VagabondSpellSequencer } from './spell-sequencer.mjs';
import { VagabondFXResolver } from './fx-file-resolver.mjs';
import { RegionTextureOverlay } from '../ui/region-texture-overlay.mjs';
import { GMRelay, isActiveGM } from './gm-relay.mjs';

/**
 * Spell Surface — Spells that leave their area on the map, driven by the Spell's `system.surface` rules (no per-Spell
 * code): Goop / Erupt ("coats the nearest surface to the Target … Difficult Terrain"), Sprout / Adhere / Terraform
 * ("… out to Close from it"), Fog ("obscures an area"), Gas ("Sickened while in the area").
 *
 * Hit macro `system:spell.surface` (any client) → the shapes are worked out from the Cast (its area `scope.castArea`,
 * else one patch per Targeted space `scope.targetSpaces` and per Target token, grown by `around` Close spaces) → the
 * active GM creates ONE Region (query `vagabond.surface.create`) flagged `flags.vagabond.surface` (rules snapshot +
 * caster stamp) with:
 * - core `modifyMovementCost` (walk ×2) when Difficult — the book's "spends 2' to Move 1'";
 * - the system behavior `spellSurface` ({@link SpellSurfaceBehavior}): on the active GM only, a Being entering gets
 *   the while-inside statuses (Vulnerable for Difficult Terrain unless flying, `whileIn`), loses them on exit;
 *   `enterDamage` the first time it enters on a Turn (real movement only), `turnEndDamage` when it ends its Turn
 *   inside — a damage card with the Save buttons, like a Glyph. Statuses + damage follow the world `automationMode`
 *   (`AutomationMode.isOn(caster)`); by hand always works (status toggles, the GM's damage).
 * - Fog's Hinder is a vote in `VagabondRollBuilder.targetingVotes` (`obscure` flag on the Regions the tokens are in).
 * Visuals per client: the looping `clip` plays locally when Sequencer, the world animations and this device's FX
 * toggle allow it and the clip resolves (JB2A database paths work for the free and Patreon packs); otherwise the
 * Region keeps its template art (`flags.vagabond.texture`, RegionTextureOverlay).
 * Duration: a Focused Cast ends with the Focus (`vagabond.focusDropped`); any other Cast at the start of the caster's
 * next Turn in a started Combat; the result card's Dismiss button or deleting the Region by hand end it too.
 */
export class SpellSurface {

  static COMMAND = 'system:spell.surface';
  static BEHAVIOR = 'spellSurface';
  static QUERIES = { create: 'vagabond.surface.create', dismiss: 'vagabond.surface.dismiss' };

  /** Pack Spells and their rules (world copies matched by source id, see migrateWorldSpells). */
  static PACK_SPELLS = {
    '3H1Rh1UMaBZHunID': { name: 'Goop', surface: { difficult: true, clip: 'jb2a.grease.dark_brown.loop', tint: '#9fd05a' } },
    tDbOfV4nMk1JeTCG: { name: 'Erupt', surface: { difficult: true, enterDamage: 'd6', turnEndDamage: 'd6', clip: 'jb2a.flames.orange.03.2x2' } },
    oGdK9T2toIepnctx: { name: 'Sprout', surface: { around: 1, difficult: true, clip: 'jb2a.entangle.02.loop.02.green' } },
    TeYGLxvayzVi3j9X: { name: 'Adhere', surface: { around: 1, difficult: true, clip: 'jb2a.grease.dark_brown.loop', tint: '#c8e06a' } },
    esyFdjFw1BqejR8X: { name: 'Terraform', surface: { around: 1, difficult: true } },
    lINJx8x3YGpnFtzS: { name: 'Fog', surface: { obscure: true, clip: 'jb2a.fog_cloud.01.white' } },
    // Freeze: the frozen water, visual only (its Speed -10' is the Tracker on the Target)
    toYD8Nm61vMhBbZ7: { name: 'Freeze', surface: { clip: 'jb2a.ice_spikes.radial.loop.white', tint: '#bde9ff' } },
    '0SVJ6QW8j6i3JkGe': { name: 'Gas', surface: { whileIn: 'sickened', clip: 'jb2a.fog_cloud.01.white', tint: '#8fd14f' } },
  };

  /** Region ids whose loop this client plays. */
  static #looping = new Set();
  /** Sequencer has set up this scene's effects (it tears down every effect while it does, ours too). */
  static #seqReady = false;
  /** Region ids whose loop is starting (the clip loads first). */
  static #starting = new Set();

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.Surface.${key}`, data);
  }

  static #esc(s) { return foundry.utils.escapeHTML(String(s ?? '')); }

  /** One at a time on the GM (the relay handlers share this queue). */
  static #serialize(fn) {
    return GMRelay.serialize('surface', fn);
  }

  /** The Spell's Surface rules, or null. */
  static rules(spell) {
    const s = spell?.system?.surface;
    return s?.enabled ? s : null;
  }

  /** The Surface flag of a Region document, or null. */
  static of(region) {
    return region?.flags?.vagabond?.surface ?? null;
  }

  /* -------------------------------------------- */
  /*  Registration (init)                         */
  /* -------------------------------------------- */

  /** Region behavior type + hit macro + GM queries. Synchronous, called from init. */
  static register(registerMacroHandler) {
    CONFIG.RegionBehavior.dataModels[this.BEHAVIOR] = SpellSurfaceBehavior;
    CONFIG.RegionBehavior.typeIcons ??= {};
    CONFIG.RegionBehavior.typeIcons[this.BEHAVIOR] = 'fa-solid fa-wand-magic-sparkles';
    registerMacroHandler('spell.surface', (scope) => this.cast(scope));
    GMRelay.register(this.QUERIES.create, (data, user) => this._create(data, user), { queue: 'surface' });
    GMRelay.register(this.QUERIES.dismiss, (data, user) => this._dismiss(data, user), { queue: 'surface' });
  }

  /** Run a handler on the active GM (here when this user is it). */
  static async #request(name, data, spellName) {
    try {
      return await GMRelay.run(name, data, { timeout: 60 * 1000 });
    } catch (err) {
      if (GMRelay.isNoGM(err)) ui.notifications.warn(this.#L('NoGM', { spell: spellName }));
      else {
        console.error(`vagabond | Spell Surface: GM query ${name} failed`, err);
        ui.notifications.error(this.#L('RelayFailed', { spell: spellName, gm: game.users.activeGM?.name ?? '' }));
      }
      return null;
    }
  }

  /* -------------------------------------------- */
  /*  Hit macro                                   */
  /* -------------------------------------------- */

  /** Hit macro `system:spell.surface`: work out the area, ask the GM to place it. */
  static async cast(scope) {
    const caster = scope?.actor;
    const spell = scope?.item?.id ? scope.item : null;
    const rules = this.rules(spell);
    if (!caster || !rules) return;
    // A damage-only Cast has no Effect: nothing is left on the map (undefined = run by hand / older card)
    if (scope.spellEffect === false) return;
    const where = this.shapesFor(scope, rules, caster);
    if (!where?.shapes.length) {
      ui.notifications.warn(this.#L('NoArea', { spell: spell.name }));
      return;
    }
    const res = await this.#request(this.QUERIES.create, {
      casterUuid: caster.uuid,
      spellUuid: spell.uuid,
      held: scope.focusHeld === true,
      deliveryType: scope.deliveryType ?? null,
      sceneId: where.sceneId,
      shapes: where.shapes,
    }, spell.name);
    if (res?.error) ui.notifications.error(res.error);
    return res;
  }

  /**
   * Region shapes of the Cast: its area (Cube / Sphere / Cone / Line / Aura), else one patch per Targeted space
   * (Remote) and per Target token — the space(s) it stands on plus `around` Close spaces each way; no Target → the
   * caster's space. Worked out from document data (any scene, no canvas needed).
   * @returns {{sceneId: string, shapes: object[]}|null}
   */
  static shapesFor(scope, rules, caster) {
    const area = scope.castArea;
    if (area?.shape) return { sceneId: area.sceneId ?? canvas.scene?.id, shapes: [foundry.utils.deepClone(area.shape)] };

    const spaces = (scope.targetSpaces ?? []).filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y));
    let tokens = (scope.targets ?? []).map(t => t?.document ?? t).filter(d => d?.documentName === 'Token');
    if (!spaces.length && !tokens.length) {
      const own = caster.token ?? caster.getActiveTokens(false, true)[0];
      if (own) tokens = [own];
    }
    const sceneId = spaces[0]?.sceneId ?? tokens[0]?.parent?.id ?? canvas.scene?.id;
    const scene = game.scenes.get(sceneId);
    if (!scene) return null;
    const size = scene.grid.size;
    const ring = Math.max(0, Number(rules.around) || 0) * size;
    const rect = (x, y, w, h) => ({ type: 'rectangle', x: x - ring, y: y - ring, width: w + 2 * ring, height: h + 2 * ring, anchorX: 0, anchorY: 0, rotation: 0 });
    const shapes = [];
    for (const p of spaces) {
      if (p.sceneId && p.sceneId !== sceneId) continue;
      shapes.push(rect(p.x - size / 2, p.y - size / 2, size, size));   // a Targeted space is its center
    }
    for (const d of tokens) {
      if (d.parent?.id !== sceneId) continue;
      shapes.push(rect(d.x, d.y, d.width * size, d.height * size));
    }
    return { sceneId, shapes };
  }

  /* -------------------------------------------- */
  /*  Create / dismiss (active GM)                */
  /* -------------------------------------------- */

  /** Started Combat the actor is in: where "Until your next Turn" is counted. */
  static #combatOf(actor) {
    const combat = game.combats.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid));
    return combat ? { combatId: combat.id, round: combat.round, turn: combat.turn } : null;
  }

  /**
   * Create the Region. Active GM (query `vagabond.surface.create`).
   * @param {object} data  {casterUuid, spellUuid, held, sceneId, shapes}
   * @param {User} user  the requesting user
   */
  static async _create(data, user) {
    try {
      const caster = await fromUuid(data.casterUuid);
      const spell = await fromUuid(data.spellUuid);
      const rules = this.rules(spell);
      if (!caster || !rules || spell.parent?.uuid !== caster.uuid) return { error: this.#L('NoArea', { spell: spell?.name ?? '' }) };
      if (!user.isGM && !caster.testUserPermission(user, 'OWNER')) return { error: this.#L('NotYours', { name: caster.name }) };
      const scene = game.scenes.get(data.sceneId);
      if (!scene || !data.shapes?.length) return { error: this.#L('NoArea', { spell: spell.name }) };

      const surface = {
        castId: foundry.utils.randomID(),
        casterUuid: caster.uuid,
        casterName: caster.name,
        spellId: spell.id,
        spellUuid: spell.uuid,
        spellName: spell.name,
        held: !!data.held,
        createdIn: this.#combatOf(caster),
        damageType: spell.system.damageType ?? '-',
        fxSchool: VagabondSpellSequencer.schoolOf(spell),
        deliveryType: data.deliveryType ?? null,
        difficult: !!rules.difficult,
        enterDamage: String(rules.enterDamage ?? '').trim(),
        turnEndDamage: String(rules.turnEndDamage ?? '').trim(),
        whileIn: rules.whileIn || '',
        obscure: !!rules.obscure,
        clip: String(rules.clip ?? '').trim(),
        tint: String(rules.tint ?? '').trim(),
        hits: {},
      };
      const manager = globalThis.vagabond?.managers?.templates;
      const texture = manager?._resolveTexture?.(spell.system.damageType, spell.system.fxSchool) ?? null;
      const owner = game.users.find(u => !u.isGM && caster.testUserPermission(u, 'OWNER'));
      const behaviors = [];
      if (surface.difficult) {
        behaviors.push({ type: 'modifyMovementCost', name: this.#L('DifficultBehavior'), system: { difficulties: { walk: 2 } } });
      }
      behaviors.push({ type: this.BEHAVIOR, name: spell.name, system: {} });

      // One non-Focused area per Spell: a new Cast replaces the last one (a Focused one goes with its Focus)
      await this._dismiss({ casterUuid: caster.uuid, spellIds: [spell.id], held: false }, game.user);

      const [region] = await scene.createEmbeddedDocuments('Region', [{
        name: spell.name,
        color: (owner ?? game.user).color?.toString() ?? '#E8D060',
        shapes: data.shapes,
        elevation: { bottom: null, top: null },
        levels: [],
        restriction: { enabled: false, type: 'move', priority: 0 },
        attachment: { token: null },
        behaviors,
        visibility: CONST.REGION_VISIBILITY.ALWAYS,
        highlightMode: 'shapes',
        displayMeasurements: false,
        hidden: false,
        locked: false,
        flags: { vagabond: { surface, ...(texture ? { texture } : {}) } },
      }]);
      if (!region) return { error: this.#L('NoArea', { spell: spell.name }) };
      return { regionUuid: region.uuid };
    } catch (err) {
      console.error('vagabond | Spell Surface: create failed', err);
      return { error: err?.message ?? String(err) };
    }
  }

  /**
   * Delete matching Surfaces, silently (the area going away is the message). Active GM (query
   * `vagabond.surface.dismiss`).
   * @param {object} q  {casterUuid, castId?, spellIds?, exceptSpellIds?, held?: boolean, notIn?: {combatId, round, turn}}
   * @param {User} user
   */
  static async _dismiss(q, user) {
    const caster = await fromUuid(q.casterUuid);
    if (!user.isGM && !caster?.testUserPermission(user, 'OWNER')) return { error: this.#L('NotYours', { name: caster?.name ?? '' }) };
    const sameTurn = (c) => !!c && !!q.notIn && c.combatId === q.notIn.combatId && c.round === q.notIn.round && c.turn === q.notIn.turn;
    const match = (s) => !!s && s.casterUuid === q.casterUuid
      && (!q.castId || s.castId === q.castId)
      && (!q.spellIds || q.spellIds.includes(s.spellId))
      && (!q.exceptSpellIds || !q.exceptSpellIds.includes(s.spellId))
      && (q.held === undefined || q.held === null || !!s.held === q.held)
      && !sameTurn(s.createdIn);
    let removed = 0;
    for (const scene of game.scenes) {
      const docs = scene.regions.filter(r => match(this.of(r)));
      if (!docs.length) continue;
      await scene.deleteEmbeddedDocuments('Region', docs.map(r => r.id)).catch(err => console.warn('vagabond | Spell Surface: delete failed', err));
      removed += docs.length;
    }
    return { removed };
  }

  /** Does `caster`'s Spell have an area on the map (any scene)? Spell context menu shows Dismiss then. */
  static hasActive(caster, spellId) {
    if (!caster) return false;
    return game.scenes.some(scene => scene.regions.some(r => {
      const s = this.of(r);
      return s?.casterUuid === caster.uuid && s.spellId === spellId;
    }));
  }

  /** Does `caster` have a non-Focused area out (other than `exceptSpellId`'s)? */
  static #hasLoose(caster, exceptSpellId) {
    return game.scenes.some(scene => scene.regions.some(r => {
      const s = this.of(r);
      return s?.casterUuid === caster.uuid && !s.held && s.spellId !== exceptSpellId;
    }));
  }

  /** Spell context menu Dismiss: end every area of this Spell (caster's owner or GM). */
  static async dismissSpell(caster, spellId) {
    if (!this.hasActive(caster, spellId)) return;
    const res = await this.#request(this.QUERIES.dismiss, { casterUuid: caster.uuid, spellIds: [spellId] }, caster.name);
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
    const res = await this.#request(this.QUERIES.dismiss, { casterUuid, castId: button.dataset.castId }, caster?.name ?? '');
    if (res?.error) ui.notifications.error(res.error);
    else button.disabled = true;
  }

  /* -------------------------------------------- */
  /*  Region events (active GM)                   */
  /* -------------------------------------------- */

  /** Do the statuses / damage run by themselves for this Surface? (world automation mode, from the caster) */
  static async #auto(s) {
    const caster = s?.casterUuid ? await fromUuid(s.casterUuid) : null;
    return caster ? AutomationMode.isOn(caster) : false;
  }

  // Region events run one at a time: a quick move through the area fires enter and exit almost together, and an
  // exit handled while the enter is still creating the status would find nothing to remove (status left stuck).

  /** A Being entered: while-inside statuses; damage the first time it enters on a Turn (real movement only). */
  static onEnter(region, event) {
    return this.#serialize(async () => {
      const s = this.of(region);
      const token = event.data?.token;
      if (!s || !token?.actor || !(await this.#auto(s))) return;
      await this.#applyWhileIn(region, token, s);
      if (event.data.movement && s.enterDamage && (await this.#claimTurnHit(region, token))) {
        await this.#damageCard(region, s, token, s.enterDamage, 'EnteredTitle');
      }
    });
  }

  /** A Being left: its while-inside statuses from this Surface end (whatever the automation mode). */
  static onExit(region, event) {
    return this.#serialize(async () => {
      const actor = event.data?.token?.actor;
      if (actor) await this.#removeWhileIn(actor, region.uuid);
    });
  }

  /** A Being ended its Turn inside. */
  static onTurnEnd(region, event) {
    return this.#serialize(async () => {
      const s = this.of(region);
      const token = event.data?.token;
      if (!s?.turnEndDamage || !token?.actor || !(await this.#auto(s))) return;
      await this.#damageCard(region, s, token, s.turnEndDamage, 'TurnEndTitle');
    });
  }

  /**
   * "The first time a Being enters the area on a Turn": one hit per Being per Combat Turn (stored on the Region);
   * outside a started Combat every entry counts.
   */
  static async #claimTurnHit(region, token) {
    const combat = game.combats.find(c => c.started && c.combatants.some(cb => cb.tokenId === token.id && cb.sceneId === token.parent?.id))
      ?? game.combats.find(c => c.started && c.scene?.id === token.parent?.id);
    if (!combat) return true;
    const key = `${combat.id}.${combat.round}.${combat.turn}`;
    if (this.of(region)?.hits?.[token.id] === key) return false;
    await region.update({ [`flags.vagabond.surface.hits.${token.id}`]: key });
    return true;
  }

  /** Statuses a Being has while inside: Vulnerable in Difficult Terrain (not while flying), plus `whileIn`. */
  static async #applyWhileIn(region, token, s) {
    const actor = token.actor;
    const ids = new Set();
    if (s.difficult && token.movementAction !== 'fly') ids.add('vulnerable');
    if (s.whileIn) ids.add(s.whileIn);
    if (!ids.size) return;
    // Already gone again (moved through the area): nothing to add
    if (token.regions && !token.regions.has(region)) return;
    const { StatusHelper } = await import('./status-helper.mjs');
    const toCreate = [];
    for (const id of ids) {
      // This Surface already gave it, or a non-Surface source holds it (that one keeps it). Another Surface's copy
      // doesn't count: each Surface keeps its own, so leaving one of two touching areas keeps the status.
      const holders = actor.effects.filter(e => e.statuses?.has(id));
      if (holders.some(e => !e.flags?.vagabond?.surfaceRegion || e.flags.vagabond.surfaceRegion === region.uuid)) continue;
      if (StatusHelper.isStatusImmune(actor, id)) continue;
      const effect = await ActiveEffect.implementation.fromStatusEffect(id).catch(() => null);
      if (!effect) continue;
      const data = effect.toObject();
      foundry.utils.setProperty(data, 'flags.vagabond.surfaceRegion', region.uuid);
      foundry.utils.setProperty(data, 'flags.vagabond.surfaceSpell', s.spellName);
      toCreate.push(data);
    }
    if (toCreate.length) await actor.createEmbeddedDocuments('ActiveEffect', toCreate);
  }

  static async #removeWhileIn(actor, regionUuid) {
    const ids = actor.effects.filter(e => e.flags?.vagabond?.surfaceRegion === regionUuid).map(e => e.id);
    if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids).catch(() => {});
  }

  /** Damage card for one Being (Save buttons, applied by the usual card flow — by hand or per autoApplySaveDamage). */
  static async #damageCard(region, s, token, formula, titleKey) {
    const caster = await fromUuid(s.casterUuid);
    const spell = await fromUuid(s.spellUuid);
    if (!caster) return;
    let roll;
    try {
      roll = await new Roll(formula, caster.getRollData()).evaluate();
    } catch (err) {
      console.warn(`vagabond | Spell Surface: bad damage formula "${formula}"`, err);
      return;
    }
    const targetsAtRollTime = [{
      tokenId: token.id,
      sceneId: token.parent?.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.texture?.src,
    }];
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.createActionCard({
      actor: caster,
      item: spell ?? null,
      title: this.#L(titleKey, { spell: s.spellName, name: token.name }),
      subtitle: caster.name,
      rollData: { isCritical: false, isHit: false },
      damageRoll: roll,
      damageType: s.damageType,
      hasDefenses: true,
      attackType: 'cast',
      targetsAtRollTime,
    });
  }

  /* -------------------------------------------- */
  /*  Fog (dependency-free read, used by roll-builder too) */
  /* -------------------------------------------- */

  /** Is any token of `actor` inside an obscuring Surface (Fog)? */
  static isObscured(actor) {
    const tokens = actor?.getActiveTokens?.(false, true) ?? [];
    return tokens.some(td => Array.from(td.regions ?? []).some(r => r.flags?.vagabond?.surface?.obscure));
  }

  /* -------------------------------------------- */
  /*  Visuals (each client)                       */
  /* -------------------------------------------- */

  /** Can THIS client play the Surface's loop? Else RegionTextureOverlay paints the template art. */
  static loopsHere(regionDoc) {
    const s = this.of(regionDoc);
    if (!s || this.#displayMode() === 'art') return false;
    if (!VagabondSpellSequencer.isAvailable() || !VagabondSpellSequencer.isEnabledForWorld()) return false;
    try { if (!VagabondSpellSequencer.isEnabledForUser()) return false; } catch { return false; }
    return !!this.#areaAnim(regionDoc) || (!!s.clip && this.#clipExists(s.clip)) || !!this.#lineCfg(regionDoc);
  }

  /**
   * The school's area animation for the Cast's delivery (Spell FX config), which wins over the Spell's own `clip`:
   * its loop video, else the clip held on a frame (VagabondSpellSequencer.surfaceAnimFor). Older areas without a
   * stored delivery keep the Spell's clip.
   */
  static #areaAnim(regionDoc) {
    const s = this.of(regionDoc);
    if (!s?.deliveryType || !s.fxSchool) return null;
    const anim = VagabondSpellSequencer.surfaceAnimFor(s.fxSchool, s.deliveryType);
    return (anim && this.#clipExists(String(anim.file))) ? anim : null;
  }

  /** World setting `spellAreaDisplay` (loop | art), unless this player overrides it. */
  static #displayMode() {
    const get = (k) => { try { return game.settings.get('vagabond', k); } catch { return undefined; } };
    const mine = get('spellAreaDisplayUser');
    return (mine && mine !== 'inherit') ? mine : (get('spellAreaDisplay') ?? 'loop');
  }

  /** A Line area loops the Spell's Line cast beam (one continuous clip), when one is configured for its school. */
  static #lineCfg(regionDoc) {
    if (!regionDoc.shapes?.some(sh => sh.type === 'line')) return null;
    const s = this.of(regionDoc);
    let school = s?.fxSchool;
    if (!school) {
      const spell = s?.spellUuid ? fromUuidSync(s.spellUuid) : null;
      school = spell ? VagabondSpellSequencer.schoolOf(spell) : 'arcane';
    }
    const cfg = VagabondSpellSequencer.areaAnimFor(school, 'line');
    const file = Array.isArray(cfg?.file) ? cfg.file[0] : cfg?.file;
    return (file && this.#clipExists(String(file))) ? cfg : null;
  }

  static #clipExists(clip) {
    if (/\.\w{2,5}$/.test(clip)) {
      const mod = clip.match(/^modules\/([^/]+)\//)?.[1];
      return !mod || !!game.modules.get(mod)?.active;
    }
    try { return !!Sequencer.Database.entryExists(clip); } catch { return false; }
  }

  static #loopName(regionDoc) { return `vagabond-surface-${regionDoc.id}`; }

  /** Bounds of one Region shape (canvas px). */
  static #shapeBounds(shape, fallback) {
    switch (shape.type) {
      case 'rectangle': return { x: shape.x, y: shape.y, width: shape.width, height: shape.height, rect: true };
      case 'circle':
      case 'emanation':
        if (Number.isFinite(shape.radius)) return { x: shape.x - shape.radius, y: shape.y - shape.radius, width: 2 * shape.radius, height: 2 * shape.radius };
        return fallback;
      default: return fallback;
    }
  }

  /** Is this Region's loop really on screen here (Sequencer holds its effects)? */
  static isLooping(regionDoc) {
    if (!regionDoc || !this.#looping.has(regionDoc.id)) return false;
    try { return Sequencer.EffectManager.getEffects({ name: this.#loopName(regionDoc) }).length > 0; } catch { return false; }
  }

  /** Start the loop (no-op while it plays, or before Sequencer has set up the scene). The art steps aside once it runs. */
  static async #drawLoop(placeable) {
    const doc = placeable?.document;
    if (!doc || !this.#seqReady || this.#starting.has(doc.id) || !this.loopsHere(doc) || this.isLooping(doc)) return;
    const s = this.of(doc);
    const name = this.#loopName(doc);
    this.#endLoop(doc);
    this.#starting.add(doc.id);
    try {
      const clipOk = !!s.clip && this.#clipExists(s.clip);
      const lineCfg = this.#lineCfg(doc);
      const lineFile = lineCfg ? await VagabondFXResolver.resolve(lineCfg.file) : null;
      const area = this.#areaAnim(doc);
      let areaFile = area ? await VagabondFXResolver.resolve(area.file) : null;
      if (Array.isArray(areaFile)) areaFile = areaFile[0];
      // Its size, when the file name doesn't carry it (`_1000x400`)
      if (lineFile) await VagabondSpellSequencer._warmMeta(Array.isArray(lineFile) ? lineFile[0] : lineFile);
      if (area?.cone && areaFile) await VagabondSpellSequencer._warmMeta(areaFile);
      if (placeable.destroyed || !this.#seqReady) return;
      const b = placeable.bounds;
      const fallback = { x: b.x, y: b.y, width: b.width, height: b.height };
      const seq = new Sequence({ moduleName: 'Vagabond', softFail: true });
      for (const shape of doc.shapes) {
        if (shape.type === 'line' && shape.length > 0 && shape.width > 0) {
          const a = Math.toRadians(shape.rotation ?? 0);
          // A Line (wall of fire, ice bridge): the Line cast beam, stretched along it in one piece
          if (lineFile) {
            // What the eye sees of the clip spans the Line, as thick as the Line is wide: its visible content box
            // (measured on the frame it shows), else the JB2A margins, else a plain stretch
            const hold = VagabondSpellSequencer.surfaceHoldFor(lineCfg, lineFile);
            const fit = await VagabondSpellSequencer.lineFit(lineFile, shape.length, shape.width, hold ? hold * 100 : 50);
            if (placeable.destroyed || !this.#seqReady) return;
            const fx = seq.effect();
            if (fit) {
              fx.file(fit.file)
                .atLocation({ x: shape.x, y: shape.y })
                .anchor(fit.anchor)
                .rotate(-(shape.rotation ?? 0))
                .size(fit.size);
            } else {
              fx.file(lineFile)
                .atLocation({ x: shape.x, y: shape.y })
                .stretchTo({ x: shape.x + Math.cos(a) * shape.length, y: shape.y + Math.sin(a) * shape.length });
            }
            fx.belowTokens()
              .fadeIn(400)
              .persist()
              .locally()
              .name(name)
              .tieToDocuments(doc);
            VagabondSpellSequencer._applyOpacity(fx, lineCfg);
            // A clip that forms and then breaks apart (the ice line) plays once and stays on its whole frame
            if (hold && hold < 1) fx.endTimePerc(1 - hold).loopOptions({ loops: 1 });
            else if (hold) fx.loopOptions({ loops: 1 });
            continue;
          }
          // No beam for its school: the Surface clip, one per width-sized square, turned with it
          if (!clipOk) continue;
          const n = Math.max(1, Math.round(shape.length / shape.width));
          const step = shape.length / n;
          for (let i = 0; i < n; i++) {
            const fx = seq.effect()
              .file(s.clip)
              .atLocation({ x: shape.x + Math.cos(a) * step * (i + 0.5), y: shape.y + Math.sin(a) * step * (i + 0.5) })
              .size({ width: step, height: shape.width })
              .rotate(-(shape.rotation ?? 0))
              .belowTokens()
              .opacity(0.9)
              .fadeIn(400)
              .persist()
              .locally()
              .name(name)
              .tieToDocuments(doc);
            if (s.tint) fx.tint(s.tint);
          }
          continue;
        }
        // A Cone: its own cone clip, laid out like the Cast FX (tip at the caster's edge, turned with the Cone),
        // the loop version when there is one, else held on a frame
        const cone = (area?.cone && areaFile) ? VagabondSpellSequencer.coneLayout(shape, areaFile) : null;
        if (cone) {
          const fx = seq.effect()
            .file(areaFile)
            .atLocation(cone.at)
            .anchor(cone.anchor)
            .rotate(cone.rotate)
            .size(cone.size)
            .belowTokens()
            .opacity(0.9)
            .fadeIn(400)
            .persist()
            .locally()
            .name(name)
            .tieToDocuments(doc)
            .mask(doc);
          VagabondSpellSequencer._applyOpacity(fx, area.cfg);
          if (area.hold && area.hold < 1) fx.endTimePerc(1 - area.hold).loopOptions({ loops: 1 });
          else if (area.hold) fx.loopOptions({ loops: 1 });
          continue;
        }
        if (!areaFile && !clipOk) continue;
        const box = this.#shapeBounds(shape, fallback);
        if (!box?.width || !box?.height) continue;
        const fx = seq.effect()
          .file(areaFile ?? s.clip)
          .atLocation({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
          .size({ width: box.width, height: box.height })
          .belowTokens()
          .opacity(0.9)
          .fadeIn(400)
          .persist()
          .locally()
          .name(name)
          .tieToDocuments(doc);
        if (!box.rect) fx.mask(doc);
        if (areaFile) {
          // No loop version: play it once and stay on its frame
          if (area.hold && area.hold < 1) fx.endTimePerc(1 - area.hold).loopOptions({ loops: 1 });
          else if (area.hold) fx.loopOptions({ loops: 1 });
        } else if (s.tint) fx.tint(s.tint);
      }
      this.#looping.add(doc.id);
      await seq.play();
    } catch (err) {
      console.warn('vagabond | Spell Surface: loop failed', err);
    } finally {
      this.#starting.delete(doc.id);
    }
    // The art hides only while the loop really plays (else it stays, or comes back)
    if (!placeable.destroyed) placeable.renderFlags?.set({ refreshState: true });
  }

  /** Start every Surface loop of the scene that isn't playing. */
  static #drawAllLoops() {
    for (const region of canvas?.regions?.placeables ?? []) {
      if (this.of(region.document)) this.#drawLoop(region);
    }
  }

  static #endLoop(doc) {
    if (!this.#looping.delete(doc.id)) return;
    try { Sequencer.EffectManager.endEffects({ name: this.#loopName(doc) }); } catch { /* scene torn down */ }
  }

  /* -------------------------------------------- */
  /*  Hooks                                       */
  /* -------------------------------------------- */

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    // Visuals: the loop where this client can play it, the template art elsewhere
    RegionTextureOverlay.suppressWhen((doc) => this.isLooping(doc));
    Hooks.on('drawRegion', (region) => this.#drawLoop(region));
    Hooks.on('destroyRegion', (region) => { if (region?.document) this.#endLoop(region.document); });
    // Sequencer tears down every effect on a scene load and sets the scene up again a moment after canvasReady:
    // loops started during the canvas draw are lost, so they start once it is done
    // (the JB2A database also registers only then, in its own sequencerReady listener)
    // Loop / area art switched (world default or this player's choice)
    Hooks.on('vagabond.spellAreaDisplay', () => {
      for (const region of canvas?.regions?.placeables ?? []) {
        if (!this.of(region.document)) continue;
        if (this.loopsHere(region.document)) { this.#drawLoop(region); continue; }
        this.#endLoop(region.document);
        region.renderFlags?.set({ refreshState: true });
      }
    });
    Hooks.on('canvasTearDown', () => { this.#seqReady = false; this.#looping.clear(); this.#starting.clear(); });
    Hooks.on('sequencerEffectManagerReady', () => setTimeout(() => {
      this.#seqReady = true;
      this.#drawAllLoops();
    }, 100));
    // Fallback if Sequencer never says it is ready (a saved effect failed to play)
    Hooks.on('canvasReady', () => setTimeout(() => {
      if (typeof Sequencer === 'undefined' || !canvas?.ready) return;
      this.#seqReady = true;
      this.#drawAllLoops();
    }, 3000));

    // A Focused Cast ends with the Focus (SpellTrackerHelper fires this on the active GM)
    Hooks.on('vagabond.focusDropped', (caster, spellIds) => {
      this.#serialize(() => this._dismiss({ casterUuid: caster.uuid, spellIds, held: true }, game.user))
        .catch(err => console.error('vagabond | Spell Surface: Focus end failed', err));
    });
    // Any other Cast lasts "Until your next Turn"
    Hooks.on('updateCombat', (combat, changed) => {
      if (!isActiveGM()) return;
      if (changed.turn === undefined && changed.round === undefined) return;
      if (!combat.started) return;
      const actor = combat.combatant?.actor;
      if (!actor) return;
      const notIn = { combatId: combat.id, round: combat.round, turn: combat.turn };
      this.#serialize(() => this._dismiss({ casterUuid: actor.uuid, held: false, notIn }, game.user))
        .catch(err => console.error('vagabond | Spell Surface: Turn end failed', err));
    });
    // ...or until the caster does anything else (attack, Check, Cast, Item use; Saves don't count), so it also ends
    // with no Combat running. Fires on the acting client. A Cast's own Luck reroll is the same Cast, so that Spell
    // is skipped (a new Cast of it replaces the old area anyway, see _create).
    Hooks.on('vagabond.actorActed', (actor, { source, itemId } = {}) => {
      if (!actor || (!actor.isOwner && !game.user.isGM)) return;
      const except = source === 'cast' ? itemId : null;
      if (!this.#hasLoose(actor, except)) return;
      this.#request(this.QUERIES.dismiss, { casterUuid: actor.uuid, held: false, exceptSpellIds: except ? [except] : null }, actor.name)
        .catch(err => console.error('vagabond | Spell Surface: next action end failed', err));
    });
    // The Surface is gone (any way): its while-inside statuses end
    Hooks.on('deleteRegion', (region) => {
      if (!isActiveGM() || !this.of(region)) return;
      const actors = new Set([...region.parent.tokens.map(t => t.actor), ...game.actors].filter(Boolean));
      // Queued with the TOKEN_EXIT removals the deletion also fires, so one effect is never deleted twice
      this.#serialize(async () => { for (const actor of actors) await this.#removeWhileIn(actor, region.uuid); });
    });
  }

  /* -------------------------------------------- */
  /*  Migration                                   */
  /* -------------------------------------------- */

  /**
   * One-time (guard `spellSurfaceMigrated3`): world copies of the pack Surface Spells get their `surface` rules and
   * the `system:spell.surface` hit macro (when they have no hit macro of their own) and Focus on Cast. Active GM only.
   */
  static async migrateWorldSpells() {
    if (!isActiveGM()) return;
    if (game.settings.get('vagabond', 'spellSurfaceMigrated3')) return;
    const { isCopyOf } = await import('./source-id.mjs');
    const actors = [...game.actors.contents, ...game.scenes.contents.flatMap(s => s.tokens.contents.filter(t => !t.actorLink && t.actor).map(t => t.actor))];
    const spells = [...game.items.contents, ...actors.flatMap(a => Array.from(a.items))].filter(i => i?.type === 'spell');
    for (const item of spells) {
      try {
        const [, def] = Object.entries(this.PACK_SPELLS).find(([id, d]) => isCopyOf(item, id, d.name)) ?? [];
        if (!def) continue;
        const update = {};
        if (!this.rules(item)) update['system.surface'] = { ...item.system.surface, ...def.surface, enabled: true };
        if (!item.system.focusOnCast) update['system.focusOnCast'] = true;
        if (!String(item.system.hitMacro?.command ?? '').trim() && !item.system.hitMacro?.uuid) {
          update['system.hitMacro'] = { enabled: true, uuid: '', command: this.COMMAND, label: item.name, runAsGM: false };
        }
        if (Object.keys(update).length) await item.update(update);
      } catch (err) {
        console.warn(`vagabond | Spell Surface migration: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }
    await game.settings.set('vagabond', 'spellSurfaceMigrated3', true);
  }
}

/**
 * Region behavior `spellSurface`: forwards the Region events to {@link SpellSurface} on the active GM only (events
 * reach every client).
 */
export class SpellSurfaceBehavior extends foundry.data.regionBehaviors.RegionBehaviorType {

  static defineSchema() {
    return {};
  }

  static #gm() {
    return isActiveGM();
  }

  static async #onEnter(event) {
    if (!SpellSurfaceBehavior.#gm()) return;
    await SpellSurface.onEnter(this.region, event);
  }

  static async #onExit(event) {
    if (!SpellSurfaceBehavior.#gm()) return;
    await SpellSurface.onExit(this.region, event);
  }

  static async #onTurnEnd(event) {
    if (!SpellSurfaceBehavior.#gm()) return;
    await SpellSurface.onTurnEnd(this.region, event);
  }

  static events = {
    [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onEnter,
    [CONST.REGION_EVENTS.TOKEN_EXIT]: this.#onExit,
    [CONST.REGION_EVENTS.TOKEN_TURN_END]: this.#onTurnEnd,
  };
}
