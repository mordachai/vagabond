/**
 * Flanking/Flanked detection. RAW: "If at least two Allies are Close to a Foe that
 * is no more than one size larger than the Allies, the Foe is Vulnerable and takes
 * an extra 2 damage from attacks." Generalized here to any two tokens of an
 * opposing faction (disposition-driven, not hardcoded Ally→Foe direction) so it
 * works symmetrically for PCs flanking NPCs and NPCs flanking PCs alike.
 *
 * Close means grid-adjacent in Vagabond — this compares the two tokens' occupied
 * grid-cell rectangles (Chebyshev gap <= 1), NOT canvas.grid.testAdjacency on the
 * center points: testAdjacency snaps each center to one cell, so a Large/Huge
 * token (whose center sits on an interior cell) never reads as adjacent to a
 * token touching its edge. Distance-based fallback for gridless scenes.
 *
 * Evaluated per-attack (see roll-handler.mjs rollWeapon) AND on token movement
 * (see the GM-gated updateToken hook in vagabond.mjs, debounced scene sweep) so
 * the status tracks live as tokens move in/out of adjacency.
 */
export class FlankingHelper {
  /** Grid-adjacent (or, on a gridless scene, within Close range) test between two token placeables. */
  static isAdjacent(tokenA, tokenB) {
    if (!tokenA || !tokenB || tokenA === tokenB) return false;
    const grid = canvas.grid;
    if (grid?.isGridless) {
      const feetPerPixel = (game.system.grid?.distance ?? 5) / grid.size;
      const pixelDist = Math.hypot(tokenA.center.x - tokenB.center.x, tokenA.center.y - tokenB.center.y);
      return (pixelDist * feetPerPixel) <= (CONFIG.VAGABOND.closeRangeFeet ?? 5);
    }
    // Multi-cell aware. testAdjacency(center, center) snaps each center to ONE
    // cell offset — for a Large/Huge token the center lands on a single interior
    // cell, so a contributor touching the far edge reads as 2+ cells away and
    // flanking silently fails until tokens are nudged. Instead compare the two
    // tokens' occupied-cell rectangles: Close = Chebyshev gap <= 1 (edge-adjacent
    // or diagonally touching).
    const a = this._cellRect(tokenA);
    const b = this._cellRect(tokenB);
    if (!a || !b) return !!grid?.testAdjacency(tokenA.center, tokenB.center);
    const gapI = Math.max(0, a.i0 - b.i1, b.i0 - a.i1);
    const gapJ = Math.max(0, a.j0 - b.j1, b.j0 - a.j1);
    return Math.max(gapI, gapJ) <= 1;
  }

  /** Inclusive occupied-cell rectangle {i0,j0,i1,j1} for a token, from its committed document position. */
  static _cellRect(token) {
    const grid = canvas.grid;
    const doc = token.document;
    if (!grid || !doc) return null;
    const { width, height } = doc.getSize();
    const tl = grid.getOffset({ x: doc.x, y: doc.y });
    const br = grid.getOffset({ x: doc.x + width - 1, y: doc.y + height - 1 });
    return {
      i0: Math.min(tl.i, br.i), i1: Math.max(tl.i, br.i),
      j0: Math.min(tl.j, br.j), j1: Math.max(tl.j, br.j)
    };
  }

  /** Dead actors can't contribute to a flank and can't be a flank target. */
  static isDead(actor) {
    return actor?.statuses?.has('dead') ?? false;
  }

  /** Whether two faction keys are opposed (friendly vs hostile). Neutral/secret never oppose. */
  static isOpposingFaction(factionA, factionB) {
    return (factionA === 'friendly' && factionB === 'hostile')
        || (factionA === 'hostile' && factionB === 'friendly');
  }

  /** Index into CONFIG.VAGABOND.sizes (small→colossal) for an actor's size. */
  static sizeIndex(actor) {
    // Character size lives at attributes.size but is usually null — the resolved
    // value (ancestry fallback → 'medium') is on system.ancestryData.size.
    const size = actor.type === 'npc'
      ? (actor.system.size || 'medium')
      : (actor.system.attributes?.size || actor.system.ancestryData?.size || 'medium');
    const keys = Object.keys(CONFIG.VAGABOND.sizes);
    const idx = keys.indexOf(size);
    return idx >= 0 ? idx : keys.indexOf('medium');
  }

  /**
   * Tokens Close to `targetToken` whose faction opposes it and which satisfy the
   * RAW size clause: the Foe (target) must be "no more than one size larger than
   * the Allies" (contributors) — i.e. contributorSizeIdx >= targetSizeIdx - 1.
   * A smaller or equal-size foe is always flankable; a foe 2+ sizes larger than a
   * given contributor does not count that contributor. Need >= 2 that qualify.
   * @param {Token} targetToken
   * @returns {Promise<Token[]>}
   */
  static async findContributors(targetToken) {
    const { CombatTrackerHelper } = await import('./combat-tracker-helper.mjs');
    const targetFaction = CombatTrackerHelper.factionKeyForToken(targetToken.document);
    const targetSizeIdx = this.sizeIndex(targetToken.actor);

    return canvas.tokens.placeables.filter(t => {
      if (t === targetToken || !t.actor) return false;
      if (this.isDead(t.actor)) return false;
      if (!this.isAdjacent(targetToken, t)) return false;
      const faction = CombatTrackerHelper.factionKeyForToken(t.document);
      if (!this.isOpposingFaction(targetFaction, faction)) return false;
      return this.sizeIndex(t.actor) >= targetSizeIdx - 1;
    });
  }

  /**
   * Toggle a status on an actor, routing through the GM socket relay when the
   * calling client doesn't own it (a player attacking an NPC, most commonly) —
   * a direct actor.update()/toggleStatusEffect() would be silently dropped by
   * the server for lack of permission otherwise.
   */
  static async _setStatus(actor, statusId, active) {
    if (actor.isOwner || game.user.isGM) {
      await actor.toggleStatusEffect(statusId, { active });
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('applyStatus', { actorUuid: actor.uuid, statusId, active });
    }
  }

  /**
   * Remove a status by PRESENCE — scans actor.effects for any effect whose
   * `statuses` set contains `statusId` and deletes them directly, instead of
   * going through toggleStatusEffect({ active: false }). Foundry v14's origin
   * migration can rewrite a status effect's `origin` such that it no longer
   * registers in `actor.statuses`; toggleStatusEffect then can't find it and the
   * icon stays stuck. Deleting the embedded docs by id always works.
   * @returns {Promise<boolean>} true if anything was removed
   */
  static async _forceRemoveStatus(actor, statusId) {
    const ids = actor.effects.filter(e => e.statuses?.has(statusId)).map(e => e.id);
    if (!ids.length) return false;
    if (actor.isOwner || game.user.isGM) {
      await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('applyStatus', { actorUuid: actor.uuid, statusId, active: false });
    }
    return true;
  }

  /**
   * Combat-end / roster-change safety net. Hard-removes 'flanked' and 'flanking'
   * from every actor with a token on the current scene, by presence. The
   * geometry sweep (evaluateScene) clears statuses it can still see; this catches
   * the origin-migrated strays it can't. Cheap, GM-gated by the caller.
   */
  static async cleanupOrphans() {
    if (!canvas.scene) return;
    const seen = new Set();
    for (const token of canvas.tokens.placeables) {
      const actor = token.actor;
      if (!actor || seen.has(actor.uuid)) continue;
      seen.add(actor.uuid);
      try {
        await this._forceRemoveStatus(actor, 'flanked');
        await this._forceRemoveStatus(actor, 'flanking');
      } catch (err) {
        console.error('Vagabond | Flanking: orphan cleanup failed for', token.name, err);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Live per-application descriptions (name the tokens involved)       */
  /* ------------------------------------------------------------------ */

  /** Homebrew-configurable extra-damage value for a Flank (RAW default 2). */
  static _flankedDamageBonus() {
    return CONFIG.VAGABOND?.homebrew?.derivations?.flankedDamageBonus ?? 2;
  }

  /** "A" · "A and B" · "A, B and C" (localized joiners) — deduped, blanks dropped. */
  static _nameList(names) {
    const a = [...new Set((names || []).filter(Boolean))];
    if (a.length === 0) return '';
    if (a.length === 1) return a[0];
    if (a.length === 2) return game.i18n.format('VAGABOND.Flanking.ListTwo', { a: a[0], b: a[1] });
    return game.i18n.format('VAGABOND.Flanking.ListMore', {
      head: a.slice(0, -1).join(', '),
      last: a[a.length - 1]
    });
  }

  /** Description stored on a contributor's 'flanking' effect. */
  static _describeFlanking(foeNames, allyNames) {
    const bonus = this._flankedDamageBonus();
    const foes = this._nameList(foeNames);
    const plural = [...new Set(foeNames.filter(Boolean))].length > 1;
    const allies = this._nameList(allyNames);
    const withPart = allies ? game.i18n.format('VAGABOND.Flanking.With', { allies }) : '';
    const key = plural ? 'VAGABOND.Flanking.FlankingPlural' : 'VAGABOND.Flanking.FlankingSingular';
    return game.i18n.format(key, { foes, with: withPart, bonus });
  }

  /** Description stored on a Foe's 'flanked' effect. */
  static _describeFlanked(contributorNames) {
    const bonus = this._flankedDamageBonus();
    const names = this._nameList(contributorNames);
    const key = names ? 'VAGABOND.Flanking.FlankedBy' : 'VAGABOND.Flanking.FlankedNoNames';
    return game.i18n.format(key, { names, bonus });
  }

  /**
   * Toggle a flank status ON (if not already) and stamp it with a live
   * description naming the tokens involved. Owner/GM writes directly; a
   * non-owning client routes the whole thing (toggle + description) through the
   * one 'applyStatus' socket action. The `eff.description !== description` guard
   * keeps this from writing on every sweep — only when the name set changes.
   */
  static async _applyFlankStatus(actor, statusId, description) {
    if (actor.isOwner || game.user.isGM) {
      if (!actor.statuses?.has(statusId)) {
        await actor.toggleStatusEffect(statusId, { active: true });
      }
      const eff = actor.effects.find(e => e.statuses?.has(statusId));
      if (eff && eff.description !== description) {
        await eff.update({ description, 'flags.vagabond.flankInfo': true });
      }
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('applyStatus', { actorUuid: actor.uuid, statusId, active: true, description });
    }
  }

  /** Token display name, preferring the document's. */
  static _tokenName(token) {
    return token.document?.name || token.name || 'a Foe';
  }

  /**
   * Evaluate and apply Flanking/Flanked around one target — used at attack time,
   * where only this one target's situation is known. Additive only on the
   * contributor side here (never clears 'flanking' — lacks scene-wide context to
   * know if a contributor is still flanking someone else); the movement-driven
   * evaluateScene() below is what actually clears stale 'flanking'.
   * - 2+ qualifying contributors → target gets 'flanked' (if not already active),
   *   contributors get 'flanking' (if not already active).
   * - Fewer than 2 → target's 'flanked' is cleared.
   * @param {Token} targetToken
   */
  static async evaluate(targetToken) {
    if (!targetToken?.actor || !canvas.scene) return;
    if (this.isDead(targetToken.actor)) {
      await this._forceRemoveStatus(targetToken.actor, 'flanked');
      return;
    }
    const contributors = await this.findContributors(targetToken);

    if (contributors.length >= 2) {
      const contribNames = contributors.map(c => this._tokenName(c));
      await this._applyFlankStatus(targetToken.actor, 'flanked', this._describeFlanked(contribNames));
      const foeName = this._tokenName(targetToken);
      for (const c of contributors) {
        const allyNames = contributors.filter(o => o !== c).map(o => this._tokenName(o));
        await this._applyFlankStatus(c.actor, 'flanking', this._describeFlanking([foeName], allyNames));
      }
    } else {
      await this._forceRemoveStatus(targetToken.actor, 'flanked');
    }
  }

  /**
   * Re-evaluate 'flanked' AND 'flanking' for every token on the current scene —
   * called on token movement (GM-gated updateToken hook, debounced). Unlike
   * evaluate() (per-attack, additive-only on the contributor side), this has
   * full-scene context, so it can safely clear 'flanking' too: a contributor
   * loses it only once it is no longer part of ANY currently-qualifying flank
   * on the scene (so it never erases a token's 'flanking' from a separate,
   * still-active flank elsewhere).
   */
  static async evaluateScene() {
    if (!canvas.scene) return;

    // Overlap guard — evaluateScene is async and re-triggered on every token
    // move. Two runs interleaving would read each other's half-applied statuses
    // and thrash. Serialize: a run requested while one is active just sets a
    // flag, and the active run loops once more when it finishes.
    if (this._sweepRunning) {
      this._sweepAgain = true;
      return;
    }
    this._sweepRunning = true;
    try {
      do {
        this._sweepAgain = false;
        await this._evaluateSceneOnce();
      } while (this._sweepAgain);
    } finally {
      this._sweepRunning = false;
    }
  }

  static async _evaluateSceneOnce() {
    // actor.uuid -> { foes:Set<string>, allies:Set<string> } — accumulated across
    // every flank on the scene so a contributor's 'flanking' text can name ALL
    // the Foes it is helping to pin, and all its co-flankers.
    const flankMap = new Map();

    for (const token of canvas.tokens.placeables) {
      if (!token.actor) continue;
      if (this.isDead(token.actor)) {
        await this._forceRemoveStatus(token.actor, 'flanked');
        continue;
      }
      try {
        const contributors = await this.findContributors(token);
        if (contributors.length >= 2) {
          const contribNames = contributors.map(c => this._tokenName(c));
          await this._applyFlankStatus(token.actor, 'flanked', this._describeFlanked(contribNames));
          const foeName = this._tokenName(token);
          for (const c of contributors) {
            let info = flankMap.get(c.actor.uuid);
            if (!info) { info = { foes: new Set(), allies: new Set() }; flankMap.set(c.actor.uuid, info); }
            info.foes.add(foeName);
            for (const o of contributors) if (o !== c) info.allies.add(this._tokenName(o));
          }
        } else {
          // Presence-based: also sweeps up an origin-migrated 'flanked' AE that
          // actor.statuses can't see. No-op when nothing is attached.
          await this._forceRemoveStatus(token.actor, 'flanked');
        }
      } catch (err) {
        // Isolate per-token failures so one bad toggle never aborts the sweep
        // and leaves the rest of the scene stale.
        console.error('Vagabond | Flanking: flanked eval failed for', token.name, err);
      }
    }

    for (const token of canvas.tokens.placeables) {
      if (!token.actor) continue;
      try {
        const info = flankMap.get(token.actor.uuid);
        if (info) {
          await this._applyFlankStatus(token.actor, 'flanking',
            this._describeFlanking([...info.foes], [...info.allies]));
        } else {
          await this._forceRemoveStatus(token.actor, 'flanking');
        }
      } catch (err) {
        console.error('Vagabond | Flanking: flanking eval failed for', token.name, err);
      }
    }
  }
}
