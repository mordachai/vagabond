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
  async updatePreview(actor, itemId, deliveryType, distance) {
    await this.clearPreview(actor.id, itemId);

    if (!deliveryType || !distance) return;

    const token = actor.token?.object || actor.getActiveTokens()[0];
    if (!token) {
      ui.notifications.warn("No token found for this actor on the current scene.");
      return;
    }

    const targetArray = Array.from(game.user.targets);
    const centroid = targetArray.length > 0 ? this._calculateTargetCentroid(targetArray) : null;

    const regionData = this._constructRegionData({ type: deliveryType, distance, token, targets: game.user.targets, centroid });
    if (!regionData) return;

    regionData.flags = { vagabond: { isPreview: true, actorId: actor.id, itemId } };

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
      const region = canvas.scene?.regions?.get(regionId);
      if (region) await region.delete();
      this.activePreviews.delete(key);
    }
  }

  /**
   * Clears all active previews for a specific actor (used when closing sheet).
   * @param {string} actorId
   */
  async clearActorPreviews(actorId) {
    for (const [key, regionId] of this.activePreviews.entries()) {
      if (key.startsWith(`${actorId}-`)) {
        const region = canvas.scene?.regions?.get(regionId);
        if (region) await region.delete();
        this.activePreviews.delete(key);
      }
    }
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
  async fromChat(deliveryType, deliveryText, message) {
    const messageId = message.id;

    // Toggle off: remove existing region for this message
    if (this.chatRegions.has(messageId)) {
      const regionId = this.chatRegions.get(messageId);
      const region = canvas.scene?.regions?.get(regionId);
      if (region) await region.delete();
      this.chatRegions.delete(messageId);
      return false;
    }

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
          targetsAtRollTime: storedTargets
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

  /**
   * Builds Region document data for the given spell area type.
   * Shape field names follow the v14 RegionDocument schema (circle, cone, line, rectangle).
   * @param {object} params
   * @param {string} params.type       - Delivery type (aura, cone, line, cube, sphere)
   * @param {number} params.distance   - Distance in feet
   * @param {Token}  params.token      - The caster token
   * @param {*}      params.targets    - The user's current targets (UserTargets or array)
   * @param {{x,y}}  params.centroid   - Optional precalculated centroid
   * @returns {object|null}            - Region creation data, or null on failure
   */
  _constructRegionData({ type, distance, token, targets, centroid = null }) {
    if (!token && ['cone', 'line', 'aura'].includes(type)) {
      ui.notifications.warn('Could not determine origin point (caster token) for area.');
      return null;
    }

    // pixel-per-foot conversion
    const distancePixels = canvas.grid.size / canvas.scene.grid.distance;
    const radiusPixels = distance * distancePixels;

    const targetToken = targets?.first?.() ?? null;
    const destinationPoint = centroid || (targetToken ? targetToken.center : null);

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
        if (!destinationPoint) {
          ui.notifications.warn('Please target a token to place the line.');
          return null;
        }
        const ray = new foundry.canvas.geometry.Ray(token.center, destinationPoint);
        const rotation = Math.toDegrees(ray.angle);
        const widthPixels = canvas.scene.grid.distance * distancePixels;
        name = 'Line';
        // v14 Region shape type for rays is "line" (not "ray")
        shape = { type: 'line', x: token.center.x, y: token.center.y, length: radiusPixels, width: widthPixels, rotation };
        break;
      }

      case 'cube': {
        if (!destinationPoint) {
          ui.notifications.warn('Please target a token to place the cube.');
          return null;
        }
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
        if (!destinationPoint) {
          ui.notifications.warn('Please target a token to place the sphere.');
          return null;
        }
        name = 'Sphere';
        shape = { type: 'circle', x: destinationPoint.x, y: destinationPoint.y, radius: radiusPixels };
        break;
      }

      default:
        ui.notifications.warn(`Area creation not supported: ${type}`);
        return null;
    }

    return {
      name,
      color: game.user.color?.toString() ?? '#FF0000',
      shapes: [shape],
      elevation: { bottom: null, top: null },
      levels: [],
      restriction: { enabled: false, type: 'move', priority: 0 },
      attachment: { token: null },
      behaviors: [],
      visibility: CONST.REGION_VISIBILITY.ALWAYS,
      highlightMode: 'coverage',
      displayMeasurements: true,
      hidden: false,
      locked: false,
    };
  }
}
