import { RegionTextureOverlay } from '../ui/region-texture-overlay.mjs';

/**
 * Manages creation and previewing of spell area regions for Vagabond.
 * Uses Scene Regions (v14) instead of MeasuredTemplates (removed in v14).
 */
export class VagabondMeasureTemplates {
  constructor() {
    // Stores active preview Region IDs keyed by "${actorId}-${itemId}"
    this.activePreviews = new Map();
    // Stores chat-card Region IDs keyed by message ID
    this.chatRegions = new Map();
    // Serializes preview mutations. Rapid `targetToken` events fire overlapping
    // updatePreview calls; without this they race on region delete/create and
    // throw "Region <id> does not exist!" when two calls delete the same region.
    this._previewChain = Promise.resolve();
  }

  /**
   * Deletes regions by id, skipping any that no longer exist and swallowing
   * the not-found rejection that races produce. Returns nothing.
   * @param {Scene} scene
   * @param {string[]} ids
   */
  async _safeDeleteRegions(scene, ids) {
    if (!scene || !ids?.length) return;
    const existing = ids.filter(id => scene.regions?.get(id));
    if (!existing.length) return;
    try {
      await scene.deleteEmbeddedDocuments('Region', existing);
    } catch (err) {
      // A concurrent sweep may have removed these between filter and delete.
      console.debug('Vagabond | region delete race ignored:', err?.message ?? err);
    }
  }

  /* -------------------------------------------- */
  /* Sheet Preview API                           */
  /* -------------------------------------------- */

  /**
   * Updates (or creates) a preview region for a specific spell/item.
   * @param {Actor} actor - The actor casting the spell.
   * @param {string} itemId - The item ID.
   * @param {string} deliveryType - The delivery type (e.g. 'cone', 'aura').
   * @param {number} distance - The distance in feet.
   */
  async updatePreview(actor, itemId, deliveryType, distance, opts = {}) {
    // Chain onto the previous call so mutations never overlap. The .catch keeps
    // one failed link from poisoning the chain for subsequent calls.
    const run = this._previewChain.then(
      () => this._updatePreview(actor, itemId, deliveryType, distance, opts),
      () => this._updatePreview(actor, itemId, deliveryType, distance, opts),
    );
    this._previewChain = run.catch(() => {});
    return run;
  }

  async _updatePreview(actor, itemId, deliveryType, distance, { notify = true, damageType = null, fxSchool = null } = {}) {
    await this.clearPreview(actor.id, itemId);
    await this.cleanupOrphanedSpellRegions();

    if (!deliveryType || !distance) return;

    const token = actor.token?.object || actor.getActiveTokens()[0];
    if (!token) {
      if (notify) ui.notifications.warn("No token found for this actor on the current scene.");
      return;
    }

    const targetArray = Array.from(game.user.targets);
    const centroid = targetArray.length > 0 ? this._calculateTargetCentroid(targetArray) : null;

    const regionData = this._constructRegionData({ type: deliveryType, distance, token, targets: game.user.targets, centroid, notify });
    if (!regionData) return;

    regionData.flags = { vagabond: { isPreview: true, actorId: actor.id, itemId, texture: this._resolveTexture(damageType, fxSchool) } };

    const docs = await canvas.scene.createEmbeddedDocuments('Region', [regionData]);
    if (docs?.[0]) {
      this.activePreviews.set(`${actor.id}-${itemId}`, docs[0].id);
    }
  }

  /**
   * Removes the preview region for a specific item.
   * @param {string} actorId
   * @param {string} itemId
   */
  async clearPreview(actorId, itemId) {
    const key = `${actorId}-${itemId}`;
    const regionId = this.activePreviews.get(key);
    if (regionId) {
      this.activePreviews.delete(key);
      await this._safeDeleteRegions(canvas.scene, [regionId]);
    }
  }

  /**
   * Clears all active previews for a specific actor (used when closing sheet).
   * @param {string} actorId
   */
  async clearActorPreviews(actorId) {
    const ids = [];
    for (const [key, regionId] of this.activePreviews.entries()) {
      if (key.startsWith(`${actorId}-`)) {
        ids.push(regionId);
        this.activePreviews.delete(key);
      }
    }
    await this._safeDeleteRegions(canvas.scene, ids);
  }

  /**
   * Delete every spell-created region on the current scene that is not tracked
   * in `activePreviews` or `chatRegions`. Spell regions are identified by
   * `flags.vagabond.isPreview` (sheet preview) or `flags.vagabond.deliveryType`
   * (chat-placed). Only touches our own regions — never user/world regions.
   */
  async cleanupOrphanedSpellRegions() {
    const scene = canvas.scene;
    if (!scene) return;
    const tracked = new Set([
      ...this.activePreviews.values(),
      ...this.chatRegions.values(),
    ]);
    const toDelete = [];
    for (const region of scene.regions) {
      const flags = region.flags?.vagabond;
      if (!flags) continue;
      if (!flags.isPreview && !flags.deliveryType) continue;
      if (!tracked.has(region.id)) toDelete.push(region.id);
    }
    await this._safeDeleteRegions(scene, toDelete);
  }

  /**
   * Delete every spell-created region on the current scene, tracked or not.
   * Used on `canvasReady` so stale regions from a prior session don't linger.
   */
  async cleanupAllSpellRegions() {
    const scene = canvas.scene;
    if (!scene) return;
    const toDelete = [];
    for (const region of scene.regions) {
      const flags = region.flags?.vagabond;
      if (!flags) continue;
      if (flags.isPreview || flags.deliveryType) toDelete.push(region.id);
    }
    await this._safeDeleteRegions(scene, toDelete);
    this.activePreviews.clear();
    this.chatRegions.clear();
  }

  /* -------------------------------------------- */
  /* Chat Card API                               */
  /* -------------------------------------------- */

  /**
   * Toggles a region from Chat Card metadata.
   * If a region already exists for this message, it is deleted; otherwise one is created.
   * @param {string} deliveryType
   * @param {string} deliveryText
   * @param {ChatMessage} message
   * @returns {Promise<boolean>} true if a region was created, false if one was removed
   */
  async fromChat(deliveryType, deliveryText, message, damageType = null, fxSchool = null) {
    const messageId = message.id;

    // Toggle off: remove existing region for this message
    if (this.chatRegions.has(messageId)) {
      const regionId = this.chatRegions.get(messageId);
      this.chatRegions.delete(messageId);
      await this._safeDeleteRegions(canvas.scene, [regionId]);
      return false;
    }

    // Sweep orphans from prior sessions before placing a new template
    await this.cleanupOrphanedSpellRegions();

    const distanceMatch = deliveryText.match(/(\d+)'/);
    if (!distanceMatch) {
      ui.notifications.warn('Could not parse template distance from delivery text.');
      return false;
    }
    const distance = parseInt(distanceMatch[1], 10);

    const speaker = message.speaker;
    let casterToken = null;
    if (speaker?.token) casterToken = canvas.tokens.get(speaker.token);
    if (!casterToken && speaker?.actor) {
      const actor = game.actors.get(speaker.actor);
      casterToken = actor?.getActiveTokens()[0];
    }

    const storedTargets = message.flags?.vagabond?.targetsAtRollTime || [];
    const resolvedTargets = [];
    for (const targetData of storedTargets) {
      if (targetData.sceneId !== canvas.scene?.id) continue;
      const token = canvas.tokens.get(targetData.tokenId);
      if (token) resolvedTargets.push(token);
    }

    const centroid = resolvedTargets.length > 0 ? this._calculateTargetCentroid(resolvedTargets) : null;

    const regionData = this._constructRegionData({
      type: deliveryType,
      distance,
      token: casterToken,
      targets: game.user.targets,
      centroid
    });

    if (regionData) {
      regionData.flags = {
        vagabond: {
          deliveryType,
          deliveryText,
          targetsAtRollTime: storedTargets,
          texture: this._resolveTexture(damageType, fxSchool)
        }
      };
      const docs = await canvas.scene.createEmbeddedDocuments('Region', [regionData]);
      if (docs?.[0]) this.chatRegions.set(messageId, docs[0].id);
      return true;
    }
    return false;
  }

  /* -------------------------------------------- */
  /* Internal Geometry Logic                     */
  /* -------------------------------------------- */

  /**
   * Calculate the geometric centroid of multiple targets.
   * @param {Token[]} targets
   * @returns {{x: number, y: number}|null}
   */
  _calculateTargetCentroid(targets) {
    if (!targets?.length) return null;
    const sum = targets.reduce((acc, token) => {
      acc.x += token.center.x;
      acc.y += token.center.y;
      return acc;
    }, { x: 0, y: 0 });
    return { x: sum.x / targets.length, y: sum.y / targets.length };
  }

  /** Delivery types that need a destination (a target token / centroid) to place. */
  static AREA_NEEDS_TARGET = ['cube', 'sphere', 'line'];
  /** Delivery types that need a caster-token origin point to place. */
  static AREA_NEEDS_ORIGIN = ['cone', 'line', 'aura'];

  /** Delivery types that attach the region to the caster token (origin-anchored). */
  static ATTACH_TO_ORIGIN = ['aura', 'cone', 'line'];
  /** Delivery types that attach the region to the target token (target-anchored). */
  static ATTACH_TO_TARGET = ['cube', 'sphere'];

  /**
   * Resolve the token id this delivery type should attach to (v14 `attachment.token`),
   * so the region follows that token when it moves. Returns null for static placement.
   * Origin types attach to the caster; target types attach to a single target token
   * (multi-target centroid placements stay static — no single token to follow).
   * @param {string} type           Delivery type key
   * @param {Token} casterToken     The caster token placeable
   * @param {Token} targetToken     The first target token placeable
   * @param {number} targetCount    How many tokens are targeted
   * @returns {string|null}
   */
  _resolveAttachmentTokenId(type, casterToken, targetToken, targetCount) {
    const lc = (type || '').toLowerCase();
    if (VagabondMeasureTemplates.ATTACH_TO_ORIGIN.includes(lc)) {
      return casterToken?.document?.id ?? null;
    }
    if (VagabondMeasureTemplates.ATTACH_TO_TARGET.includes(lc)) {
      if (targetToken && targetCount <= 1) return targetToken.document?.id ?? null;
    }
    return null;
  }

  /**
   * Resolve the seamless art texture path for a spell, honoring the
   * `regionUseTextures` GM toggle. Stored in the region's `flags.vagabond.texture`
   * and painted by RegionTextureOverlay. Returns null when textures are off or
   * no matching art exists.
   *
   * An explicit `fxSchool` wins — it picks school art so no-damage spells still
   * get a fitting template; otherwise we fall back to the damage-type art.
   * @param {string|null} damageType
   * @param {string|null} [fxSchool]
   * @returns {string|null}
   */
  _resolveTexture(damageType, fxSchool = null) {
    let useTextures = true;
    try { useTextures = game.settings.get('vagabond', 'regionUseTextures'); }
    catch (_e) { /* setting not registered yet */ }
    if (!useTextures) return null;
    if (fxSchool) {
      const path = RegionTextureOverlay.texturePathForSchool(fxSchool);
      if (path) return path;
    }
    return RegionTextureOverlay.texturePathForType(damageType);
  }

  /**
   * Pure pre-flight check for area placement. Returns a user-facing error
   * string if the area can't be placed with the given inputs, else null.
   *
   * Single source of truth for placement requirements — both
   * `_constructRegionData` (drawing) and `SpellCastDialog` (showing the message
   * inline) call this so the wording and rules never drift apart.
   *
   * @param {string} type                  Delivery type key
   * @param {object} opts
   * @param {boolean} opts.hasTarget       A target token / centroid is available
   * @param {boolean} opts.hasOrigin       A caster token is available
   * @returns {string|null}
   */
  static areaRequirementError(type, { hasTarget, hasOrigin } = {}) {
    const t = (type || '').toLowerCase();
    if (this.AREA_NEEDS_ORIGIN.includes(t) && !hasOrigin) {
      return 'Could not determine origin point (caster token) for area.';
    }
    if (this.AREA_NEEDS_TARGET.includes(t) && !hasTarget) {
      return `Please target a token to place the ${t}.`;
    }
    return null;
  }

  /**
   * Builds Region document data for the given spell area type.
   * Shape field names follow the v14 RegionDocument schema (circle, cone, line, rectangle).
   * @param {object} params
   * @param {string} params.type       - Delivery type (aura, cone, line, cube, sphere)
   * @param {number} params.distance   - Distance in feet
   * @param {Token}  params.token      - The caster token
   * @param {*}      params.targets    - The user's current targets (UserTargets or array)
   * @param {{x,y}}  params.centroid   - Optional precalculated centroid
   * @param {boolean} params.notify    - Whether to surface failures via ui.notifications (default true)
   * @returns {object|null}            - Region creation data, or null on failure
   */
  _constructRegionData({ type, distance, token, targets, centroid = null, notify = true }) {
    // pixel-per-foot conversion
    const distancePixels = canvas.grid.size / canvas.scene.grid.distance;
    const radiusPixels = distance * distancePixels;

    const targetToken = targets?.first?.() ?? null;
    const destinationPoint = centroid || (targetToken ? targetToken.center : null);

    // Single pre-flight requirement check (origin + target) — same rules the
    // cast dialog uses to show the message inline.
    const reqErr = VagabondMeasureTemplates.areaRequirementError(type, {
      hasTarget: !!destinationPoint,
      hasOrigin: !!token,
    });
    if (reqErr) {
      if (notify) ui.notifications.warn(reqErr);
      return null;
    }

    let shape;
    let name;

    switch (type.toLowerCase()) {
      case 'aura':
        name = 'Aura';
        shape = { type: 'circle', x: token.center.x, y: token.center.y, radius: radiusPixels };
        break;

      case 'cone': {
        let rotation = token.document.rotation || 0;
        if (destinationPoint) {
          const ray = new foundry.canvas.geometry.Ray(token.center, destinationPoint);
          rotation = Math.toDegrees(ray.angle);
        }
        name = 'Cone';
        shape = { type: 'cone', x: token.center.x, y: token.center.y, radius: radiusPixels, angle: 90, rotation, curvature: 'round' };
        break;
      }

      case 'line': {
        // Origin + target presence already guaranteed by areaRequirementError above.
        const ray = new foundry.canvas.geometry.Ray(token.center, destinationPoint);
        const rotation = Math.toDegrees(ray.angle);
        const widthPixels = canvas.scene.grid.distance * distancePixels;
        name = 'Line';
        // v14 Region shape type for rays is "line" (not "ray")
        shape = { type: 'line', x: token.center.x, y: token.center.y, length: radiusPixels, width: widthPixels, rotation };
        break;
      }

      case 'cube': {
        const sidePixels = (distance / canvas.scene.grid.distance) * canvas.grid.size;
        name = 'Cube';
        shape = {
          type: 'rectangle',
          x: destinationPoint.x - sidePixels / 2,
          y: destinationPoint.y - sidePixels / 2,
          width: sidePixels,
          height: sidePixels,
          anchorX: 0,
          anchorY: 0,
          rotation: 0
        };
        break;
      }

      case 'sphere': {
        name = 'Sphere';
        shape = { type: 'circle', x: destinationPoint.x, y: destinationPoint.y, radius: radiusPixels };
        break;
      }

      default:
        if (notify) ui.notifications.warn(`Area creation not supported: ${type}`);
        return null;
    }

    // Resolve token attachment so the region follows the caster (origin types) or
    // the target (target types) when that token moves. Multi-target placements stay static.
    const targetCount = targets?.size ?? targets?.length ?? (centroid ? 1 : 0);
    const attachTokenId = this._resolveAttachmentTokenId(type, token, targetToken, targetCount);

    // True Shape ('shapes') vs Covered Grid Spaces ('coverage') — GM-configurable, default True Shape.
    let highlightMode = 'shapes';
    try { highlightMode = game.settings.get('vagabond', 'regionHighlightMode') || 'shapes'; }
    catch (_e) { /* setting not registered yet — fall back to True Shape */ }

    return {
      name,
      color: game.user.color?.toString() ?? '#FF0000',
      shapes: [shape],
      elevation: { bottom: null, top: null },
      levels: [],
      restriction: { enabled: false, type: 'move', priority: 0 },
      attachment: { token: attachTokenId },
      behaviors: [],
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      highlightMode,
      displayMeasurements: true,
      hidden: false,
      locked: false,
    };
  }
}
