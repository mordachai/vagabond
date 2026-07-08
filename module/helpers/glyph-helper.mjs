/**
 * Automation for the "Glyph" spell delivery: at cast time the caster inscribes
 * a 5' square glyph on a grid square of their choice (click-to-place, no canvas
 * layer switch — the token layer stays active). The glyph persists as a Region
 * document carrying a snapshot of the cast (`flags.vagabond.glyph`) and is
 * rendered by `GlyphOverlay` (module/ui/glyph-overlay.mjs). When the caster
 * chooses, the spell fires in that 5' cube: targets are collected from the
 * square, damage is rolled from the snapshot, and the glyph disappears.
 *
 * Rules: "Creates a 5' square glyph on a Target you can see, where no other
 * glyph is within Close. The Spell is Cast in a 5' cube from the glyph when
 * you choose, then the glyph disappears."
 */
export class VagabondGlyphHelper {
  /** In-flight placement session, so two casts can't place simultaneously. */
  static #placing = false;

  /** Placement just ended — swallow the trailing pointerup (see GlyphOverlay). */
  static #cooldownUntil = 0;

  /** True while a placement session runs (plus a short tail so the click that
   *  completed placement can't immediately re-open the glyph dialog). */
  static get isPlacing() {
    return this.#placing || Date.now() < this.#cooldownUntil;
  }

  /* -------------------------------------------- */
  /*  Art resolution                              */
  /* -------------------------------------------- */

  /**
   * Resolve the glyph emblem art path for a spell. An explicit `fxSchool`
   * wins; otherwise the damage type picks the art; generic fallback last.
   * @param {Item} spell
   * @returns {string}
   */
  static artPathFor(spell) {
    const base = CONFIG.VAGABOND.glyphArtBasePath;
    const aliases = CONFIG.VAGABOND.glyphArtAliases ?? {};
    const resolve = (key) => {
      if (!key || key === '-') return null;
      const k = String(key).toLowerCase();
      return `${base}/${aliases[k] ?? k}.webp`;
    };
    return resolve(spell.system.fxSchool)
      ?? resolve(spell.system.damageType)
      ?? `${base}/${CONFIG.VAGABOND.glyphDefaultArt}.webp`;
  }

  /* -------------------------------------------- */
  /*  Geometry                                    */
  /* -------------------------------------------- */

  /** Pixels per 5' glyph square on the current scene. */
  static _sidePixels() {
    const FEET_PER_SQUARE = game.system.grid?.distance ?? 5;
    return (5 / FEET_PER_SQUARE) * canvas.grid.size;
  }

  /** Feet per canvas pixel on the current scene. */
  static _feetPerPixel() {
    const FEET_PER_SQUARE = game.system.grid?.distance ?? 5;
    return FEET_PER_SQUARE / canvas.grid.size;
  }

  /** All placed-glyph regions on a scene. @param {Scene} scene */
  static glyphRegions(scene = canvas.scene) {
    return scene?.regions?.filter((r) => r.flags?.vagabond?.glyph) ?? [];
  }

  /** Center point {x,y} of a glyph region's square. @param {RegionDocument} region */
  static _regionCenter(region) {
    const s = region.shapes?.[0];
    if (!s) return { x: 0, y: 0 };
    return { x: s.x + (s.width ?? 0) / 2, y: s.y + (s.height ?? 0) / 2 };
  }

  /** Rect {x,y,width,height} of a glyph region's square. @param {RegionDocument} region */
  static regionRect(region) {
    const s = region.shapes?.[0];
    return s ? { x: s.x, y: s.y, width: s.width ?? 0, height: s.height ?? 0 } : null;
  }

  /**
   * "No other glyph is within Close" — returns the offending glyph region if
   * `center` is within the Close band of an existing glyph, else null.
   * @param {{x:number,y:number}} center
   * @param {string|null} exceptRegionId  Skip this region (repositioning itself)
   * @returns {RegionDocument|null}
   */
  static _separationConflict(center, exceptRegionId = null) {
    const closeFt = CONFIG.VAGABOND.glyphCloseSeparationFeet ?? 5;
    const ftPerPx = this._feetPerPixel();
    for (const region of this.glyphRegions()) {
      if (region.id === exceptRegionId) continue;
      const c = this._regionCenter(region);
      const distFt = Math.hypot(c.x - center.x, c.y - center.y) * ftPerPx;
      if (distFt <= closeFt + 0.01) return region;
    }
    return null;
  }

  /* -------------------------------------------- */
  /*  Click-to-place (no layer switch)            */
  /* -------------------------------------------- */

  /**
   * Let the user pick a grid square by clicking the canvas. The token layer
   * stays active the whole time — we listen on `canvas.stage` in the capture
   * phase and stop propagation so nothing beneath reacts. A ghost preview of
   * the glyph follows the cursor, snapped to the grid. Right-click or Escape
   * cancels.
   * @param {string} artPath                     Glyph emblem to preview
   * @param {object} [opts]
   * @param {string|null} [opts.exceptRegionId]  Ignore this glyph in the separation check
   * @returns {Promise<{x:number,y:number,side:number,center:{x:number,y:number}}|null>}
   */
  static async pickSquare(artPath, { exceptRegionId = null } = {}) {
    if (!canvas?.ready) return null;
    if (this.#placing) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Glyph.AlreadyPlacing'));
      return null;
    }
    this.#placing = true;

    const side = this._sidePixels();
    let texture = null;
    try { texture = await foundry.canvas.loadTexture(artPath); } catch (_e) { /* preview without art */ }

    // Ghost preview: emblem sprite + square outline, world coordinates.
    const preview = new PIXI.Container();
    preview.eventMode = 'none';
    const outline = new PIXI.Graphics();
    outline.lineStyle(2, 0xE8D060, 0.9).drawRect(0, 0, side, side);
    preview.addChild(outline);
    if (texture) {
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);
      const fit = (side * 0.85) / Math.max(texture.width, texture.height);
      sprite.scale.set(fit);
      sprite.position.set(side / 2, side / 2);
      sprite.alpha = 0.8;
      preview.addChild(sprite);
    }
    preview.visible = false;
    canvas.interface.addChild(preview);

    ui.notifications.info(game.i18n.localize('VAGABOND.Glyph.PlacePrompt'));

    const snapTopLeft = (world) => {
      if (canvas.grid.isGridless) return { x: world.x - side / 2, y: world.y - side / 2 };
      return canvas.grid.getTopLeftPoint(world);
    };

    return new Promise((resolve) => {
      const stage = canvas.stage;

      const finish = (result) => {
        stage.removeEventListener('pointermove', onMove, { capture: true });
        stage.removeEventListener('pointerdown', onDown, { capture: true });
        window.removeEventListener('keydown', onKey, { capture: true });
        if (preview.parent) preview.parent.removeChild(preview);
        preview.destroy({ children: true });
        this.#placing = false;
        VagabondGlyphHelper.#cooldownUntil = Date.now() + 300;
        resolve(result);
      };

      const onMove = (ev) => {
        const world = ev.getLocalPosition(stage);
        const tl = snapTopLeft(world);
        preview.position.set(tl.x, tl.y);
        preview.visible = true;
      };

      const onDown = (ev) => {
        // Right/middle click cancels.
        if (ev.button !== 0) {
          ev.stopPropagation();
          finish(null);
          return;
        }
        ev.stopPropagation();
        const world = ev.getLocalPosition(stage);
        const tl = snapTopLeft(world);
        const center = { x: tl.x + side / 2, y: tl.y + side / 2 };
        const conflict = this._separationConflict(center, exceptRegionId);
        if (conflict) {
          ui.notifications.warn(game.i18n.format('VAGABOND.Glyph.TooClose', {
            name: conflict.flags.vagabond.glyph.spellName ?? conflict.name,
          }));
          return; // keep placing
        }
        finish({ x: tl.x, y: tl.y, side, center });
      };

      const onKey = (ev) => {
        if (ev.key !== 'Escape') return;
        ev.stopPropagation();
        finish(null);
      };

      stage.addEventListener('pointermove', onMove, { capture: true });
      stage.addEventListener('pointerdown', onDown, { capture: true });
      window.addEventListener('keydown', onKey, { capture: true });
    });
  }

  /* -------------------------------------------- */
  /*  Placement (cast time)                       */
  /* -------------------------------------------- */

  /**
   * Full cast-time placement flow: pick a square, create the glyph Region with
   * the cast snapshot, post the "Glyph placed" chat card.
   * Returns the created RegionDocument, or null if the player cancelled
   * (callers must then abort the cast at no mana cost).
   * @param {{actor: Actor, spell: Item, state: object, manaSkillKey: string}} opts
   * @returns {Promise<RegionDocument|null>}
   */
  static async placeFromCast({ actor, spell, state, manaSkillKey }) {
    if (!canvas?.ready || !canvas.scene) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Glyph.NoScene'));
      return null;
    }

    const art = this.artPathFor(spell);
    const spot = await this.pickSquare(art);
    if (!spot) return null;

    const payload = {
      casterActorUuid: actor.uuid,
      casterName: actor.name,
      spellUuid: spell.uuid,
      spellName: spell.name,
      spellImg: spell.img,
      damageTypeKey: spell.system.damageType || '-',
      damageDice: state.damageDice ?? 0,
      useFx: !!state.useFx,
      manaSkillKey: manaSkillKey || '',
      art,
    };

    const region = await this._createGlyphRegion(spot, payload);
    if (!region) return null;

    await this._postPlacedCard(actor, region, payload);
    return region;
  }

  /**
   * Create the glyph Region document. Identified solely by
   * `flags.vagabond.glyph` — deliberately NOT `deliveryType`/`isPreview`, so
   * the spell-area orphan sweeps in measure-templates.mjs never touch it and
   * the glyph survives across sessions until triggered or dismissed.
   * @private
   */
  static async _createGlyphRegion(spot, payload) {
    const regionData = {
      name: game.i18n.format('VAGABOND.Glyph.RegionName', { spell: payload.spellName }),
      color: game.user.color?.toString() ?? '#E8D060',
      shapes: [{
        type: 'rectangle',
        x: spot.x,
        y: spot.y,
        width: spot.side,
        height: spot.side,
        anchorX: 0,
        anchorY: 0,
        rotation: 0,
      }],
      elevation: { bottom: null, top: null },
      levels: [],
      restriction: { enabled: false, type: 'move', priority: 0 },
      attachment: { token: null },
      behaviors: [],
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      highlightMode: 'shapes',
      displayMeasurements: false,
      hidden: false,
      locked: false,
      flags: { vagabond: { glyph: payload } },
    };
    try {
      const docs = await canvas.scene.createEmbeddedDocuments('Region', [regionData]);
      return docs?.[0] ?? null;
    } catch (err) {
      console.error('Vagabond | Failed to create glyph region', err);
      ui.notifications.error(game.i18n.localize('VAGABOND.Glyph.CreateFailed'));
      return null;
    }
  }

  /**
   * Post the "Glyph placed" chat card with Trigger / Dismiss controls.
   * @private
   */
  static async _postPlacedCard(actor, region, payload) {
    const trigger = game.i18n.localize('VAGABOND.Glyph.TriggerButton');
    const dismiss = game.i18n.localize('VAGABOND.Glyph.DismissButton');
    const placed = game.i18n.format('VAGABOND.Glyph.PlacedBy', { caster: payload.casterName });
    const content = `<div class="vagabond-glyph-card" data-region-uuid="${region.uuid}">
      <div class="glyph-card-header">
        <img src="${payload.spellImg}" alt="" />
        <div class="glyph-card-title">
          <strong>${game.i18n.format('VAGABOND.Glyph.CardTitle', { spell: payload.spellName })}</strong>
          <span>${placed}</span>
        </div>
      </div>
      <div class="glyph-card-buttons">
        <button type="button" class="vagabond-glyph-trigger-button" data-region-uuid="${region.uuid}">
          <i class="fa-solid fa-wand-magic-sparkles"></i> ${trigger}
        </button>
        <button type="button" class="vagabond-glyph-dismiss-button" data-region-uuid="${region.uuid}">
          <i class="fa-solid fa-xmark"></i> ${dismiss}
        </button>
      </div>
    </div>`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
    });
  }

  /* -------------------------------------------- */
  /*  Interaction (trigger / reposition / dismiss) */
  /* -------------------------------------------- */

  /** May the current user operate this glyph? GM or the caster's owner. */
  static async _canControl(region) {
    if (game.user.isGM) return true;
    const payload = region.flags?.vagabond?.glyph;
    const caster = payload?.casterActorUuid ? await fromUuid(payload.casterActorUuid) : null;
    return !!caster?.isOwner;
  }

  /**
   * Canvas-click entry point: card-picker action dialog for the glyph
   * (spell portrait + Trigger / Reposition / Dismiss icon cards).
   * @param {RegionDocument} region
   */
  static async promptTrigger(region) {
    const payload = region.flags?.vagabond?.glyph;
    if (!payload) return;
    if (!(await this._canControl(region))) return;

    const { GlyphActionDialog } = await import('../applications/glyph-action-dialog.mjs');
    const action = await GlyphActionDialog.prompt(region);

    if (action === 'trigger') await this.trigger(region);
    else if (action === 'reposition') await this.reposition(region);
    else if (action === 'dismiss') await this.dismiss(region);
  }

  /**
   * Fire the glyph: play the activation FX at the square, collect every token
   * whose center is inside it, roll the snapshotted damage, post the action
   * card (targets get save buttons), and delete the glyph.
   * @param {RegionDocument} region
   */
  static async trigger(region) {
    const payload = region.flags?.vagabond?.glyph;
    if (!payload) return;
    if (!(await this._canControl(region))) {
      ui.notifications.warn(game.i18n.format('VAGABOND.Glyph.OnlyCasterOrGM', { caster: payload.casterName }));
      return;
    }
    if (region.parent !== canvas.scene) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Glyph.WrongScene'));
      return;
    }

    const sourceActor = await fromUuid(payload.casterActorUuid);
    const spell = await fromUuid(payload.spellUuid);
    if (!spell || !sourceActor) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Glyph.SpellGone'));
      await this.dismiss(region);
      return;
    }

    const rect = this.regionRect(region);
    const center = this._regionCenter(region);

    // Targets: every token whose center lies in the 5' cube (the glyph square).
    const targetTokens = canvas.tokens.placeables.filter((t) => {
      const c = t.center;
      return c.x >= rect.x && c.x < rect.x + rect.width
          && c.y >= rect.y && c.y < rect.y + rect.height;
    });
    const targetsAtRollTime = targetTokens.map((token) => ({
      tokenId: token.id,
      sceneId: token.scene.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.document.texture.src,
    }));

    // Activation FX at the glyph square. A pseudo-token carries the exact
    // center so the sequencer's glyph case fires on the square, not on
    // whatever the caster happens to target right now.
    const { VagabondSpellSequencer } = await import('./spell-sequencer.mjs');
    const pseudo = { center, x: center.x, y: center.y, document: { width: 1, height: 1 } };
    const casterToken = sourceActor.token?.object ?? sourceActor.getActiveTokens(true)[0] ?? pseudo;
    VagabondSpellSequencer.play(spell, 'glyph', 0, casterToken, [pseudo], { deliveryEnabled: true });

    const { VagabondDamageHelper } = await import('./damage-helper.mjs');
    const { VagabondChatCard } = await import('./chat-card.mjs');

    const manaSkill = payload.manaSkillKey ? sourceActor.system.skills[payload.manaSkillKey] : null;
    const manaSkillStat = manaSkill?.stat || 'reason';

    const damageRoll =
      spell.system.damageType !== '-' && payload.damageDice > 0
        ? await VagabondDamageHelper.rollSpellDamage(
            sourceActor,
            spell,
            { damageDice: payload.damageDice },
            false, // glyph casts bypass the roll — never critical
            manaSkillStat,
            targetsAtRollTime
          )
        : null;

    await VagabondChatCard.createActionCard({
      actor: sourceActor,
      item: spell,
      title: game.i18n.format('VAGABOND.Glyph.DeliveryTitle', { spell: spell.name }),
      subtitle: sourceActor.name,
      rollData: { isCritical: false, isHit: true, manaSkill },
      damageRoll,
      damageType: spell.system.damageType,
      description: spell.system.formatDescription(spell.system.description),
      hasDefenses: true,
      attackType: CONFIG.VAGABOND.spellDeliveryAttackTypes.glyph,
      targetsAtRollTime,
    });

    // "…then the glyph disappears."
    await this._deleteRegion(region);
  }

  /**
   * Re-run click-to-place for an existing glyph and move it there.
   * @param {RegionDocument} region
   */
  static async reposition(region) {
    const payload = region.flags?.vagabond?.glyph;
    if (!payload) return;
    if (!(await this._canControl(region))) return;
    if (region.parent !== canvas.scene) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Glyph.WrongScene'));
      return;
    }
    const spot = await this.pickSquare(payload.art, { exceptRegionId: region.id });
    if (!spot) return;
    const shape = { ...region.shapes[0].toObject?.() ?? region.shapes[0], x: spot.x, y: spot.y, width: spot.side, height: spot.side };
    await region.update({ shapes: [shape] });
  }

  /**
   * Remove the glyph without firing it.
   * @param {RegionDocument} region
   */
  static async dismiss(region) {
    if (!(await this._canControl(region))) return;
    await this._deleteRegion(region);
  }

  /** @private */
  static async _deleteRegion(region) {
    try {
      await region.delete();
    } catch (err) {
      console.error('Vagabond | Failed to delete glyph region', err);
    }
  }

  /**
   * Chat-card button entry point — resolves the region from its uuid and
   * routes to trigger/dismiss. Warns when the glyph is already gone.
   * @param {string} regionUuid
   * @param {'trigger'|'dismiss'} action
   */
  static async fromChatButton(regionUuid, action) {
    const region = await fromUuid(regionUuid);
    if (!region || !region.flags?.vagabond?.glyph) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Glyph.AlreadyResolved'));
      return;
    }
    if (action === 'trigger') await this.trigger(region);
    else if (action === 'dismiss') await this.dismiss(region);
  }
}
