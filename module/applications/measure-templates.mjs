/**
 * Manages creation and previewing of measured templates for Vagabond.
 */
export class VagabondMeasureTemplates {
  constructor() {
    // Stores active preview template IDs keyed by "${actorId}-${itemId}"
    this.activePreviews = new Map();
  }

  /* -------------------------------------------- */
  /* Sheet Preview API                           */
  /* -------------------------------------------- */

  /**
   * Updates (or creates) a preview template for a specific spell/item.
   * @param {Actor} actor - The actor casting the spell.
   * @param {string} itemId - The item ID.
   * @param {string} deliveryType - The delivery type (e.g. 'cone', 'aura').
   * @param {number} distance - The distance in feet.
   */
  async updatePreview(actor, itemId, deliveryType, distance) {
    // 1. Cleanup existing preview for this item
    await this.clearPreview(actor.id, itemId);

    if (!deliveryType || !distance) return;

    // 2. Get the token (Caster)
    const token = actor.token?.object || actor.getActiveTokens()[0];
    if (!token) {
      ui.notifications.warn("No token found for this actor on the current scene.");
      return;
    }

    // 3. Calculate centroid from current targets
    const targetArray = Array.from(game.user.targets);
    let centroid = null;
    if (targetArray.length > 0) {
      centroid = this._calculateTargetCentroid(targetArray);
    }

    // 4. Construct Data
    const templateData = this._constructTemplateData({
      type: deliveryType,
      distance: distance,
      token: token,
      targets: game.user.targets,
      centroid: centroid
    });

    if (!templateData) return;

    // 5. Create the Template
    // Flag it so we know it's a Vagabond preview
    templateData.flags = { 
      vagabond: { 
        isPreview: true, 
        actorId: actor.id, 
        itemId: itemId 
      } 
    };

    const doc = await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [templateData]);

    // 6. Track the ID
    if (doc && doc[0]) {
      this.activePreviews.set(`${actor.id}-${itemId}`, doc[0].id);
    }
  }

  /**
   * Removes the preview template for a specific item.
   * @param {string} actorId 
   * @param {string} itemId 
   */
  async clearPreview(actorId, itemId) {
    const key = `${actorId}-${itemId}`;
    const templateId = this.activePreviews.get(key);
    
    if (templateId) {
      const template = canvas.scene.templates.get(templateId);
      if (template) {
        await template.delete();
      }
      this.activePreviews.delete(key);
    }
  }

  /**
   * Clears all active previews for a specific actor (used when closing sheet).
   * @param {string} actorId 
   */
  async clearActorPreviews(actorId) {
    for (const [key, templateId] of this.activePreviews.entries()) {
      if (key.startsWith(`${actorId}-`)) {
        const template = canvas.scene.templates.get(templateId);
        if (template) await template.delete();
        this.activePreviews.delete(key);
      }
    }
  }

  /* -------------------------------------------- */
  /* Chat Card API                               */
  /* -------------------------------------------- */

  /**
   * Creates a template from Chat Card metadata.
   * @param {string} deliveryType
   * @param {string} deliveryText
   * @param {ChatMessage} message
   */
  async fromChat(deliveryType, deliveryText, message) {
    // 1. Parse Distance
    const distanceMatch = deliveryText.match(/(\d+)'/);
    if (!distanceMatch) {
      ui.notifications.warn('Could not parse template distance from delivery text.');
      return;
    }
    const distance = parseInt(distanceMatch[1], 10);

    // 2. Get Caster Token
    const speaker = message.speaker;
    let casterToken = null;
    if (speaker?.token) casterToken = canvas.tokens.get(speaker.token);
    if (!casterToken && speaker?.actor) {
        const actor = game.actors.get(speaker.actor);
        casterToken = actor?.getActiveTokens()[0];
    }

    // 3. Get stored targets from message flags and resolve to tokens
    const storedTargets = message.flags?.vagabond?.targetsAtRollTime || [];
    const resolvedTargets = [];

    for (const targetData of storedTargets) {
      // Check if target is on current scene
      if (targetData.sceneId !== canvas.scene?.id) continue;

      // Get token from current scene
      const token = canvas.tokens.get(targetData.tokenId);
      if (token) {
        resolvedTargets.push(token);
      }
    }

    // 4. Calculate centroid if we have multiple targets
    let centroid = null;
    if (resolvedTargets.length > 0) {
      centroid = this._calculateTargetCentroid(resolvedTargets);
      console.log(`VagabondMeasureTemplates | Calculated centroid from ${resolvedTargets.length} stored targets:`, centroid);
    }

    // 5. Construct Data with centroid
    const templateData = this._constructTemplateData({
      type: deliveryType,
      distance: distance,
      token: casterToken,
      targets: game.user.targets, // Still pass for fallback
      centroid: centroid
    });

    if (templateData) {
      templateData.flags = {
        vagabond: {
          deliveryType: deliveryType,
          deliveryText: deliveryText,
          targetsAtRollTime: storedTargets // Preserve stored targets
        }
      };
      await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [templateData]);
    }
  }

  /* -------------------------------------------- */
  /* Internal Geometry Logic                     */
  /* -------------------------------------------- */

  /**
   * Calculate the geometric centroid (midpoint) of multiple targets
   * @param {Array} targets - Array of Token objects
   * @returns {Object|null} {x, y} coordinates of centroid, or null if no targets
   */
  _calculateTargetCentroid(targets) {
    if (!targets || targets.length === 0) return null;

    // Sum all x and y coordinates
    const sum = targets.reduce((acc, token) => {
      acc.x += token.center.x;
      acc.y += token.center.y;
      return acc;
    }, { x: 0, y: 0 });

    // Return average (centroid)
    return {
      x: sum.x / targets.length,
      y: sum.y / targets.length
    };
  }

  /**
   * Generates the MeasuredTemplateDocument data.
   * @param {Object} params
   * @param {string} params.type - Delivery type (cone, line, etc.)
   * @param {number} params.distance - Distance in feet
   * @param {Token} params.token - The caster token
   * @param {UserTargets} params.targets - The user's targets
   * @param {Object} params.centroid - Optional precalculated centroid {x, y}
   * @returns {Object|null} Template data
   */
  _constructTemplateData({ type, distance, token, targets, centroid = null }) {
    if (!token && ['cone','line','aura'].includes(type)) {
       ui.notifications.warn('Could not determine origin point (Caster Token) for template.');
       return null;
    }

    const targetToken = targets?.first();

    const templateData = {
      t: '',
      distance: distance,
      fillColor: game.user.color || '#FF0000',
      direction: 0,
      x: 0,
      y: 0
    };

    // Use centroid for positioning if available, otherwise fall back to first target
    const destinationPoint = centroid || (targetToken ? targetToken.center : null);

    switch (type.toLowerCase()) {
      case 'aura':
        // Aura remains centered on caster (unchanged)
        templateData.t = 'circle';
        templateData.x = token.center.x;
        templateData.y = token.center.y;
        break;

      case 'cone':
        templateData.t = 'cone';
        templateData.angle = 90;
        templateData.x = token.center.x;
        templateData.y = token.center.y;

        // Use centroid or first target for direction
        if (destinationPoint) {
          const ray = new foundry.canvas.geometry.Ray(token.center, destinationPoint);
          templateData.direction = Math.toDegrees(ray.angle);
        } else {
          templateData.direction = token.document.rotation || 0;
        }
        break;

      case 'line':
        templateData.t = 'ray';
        templateData.width = canvas.scene.grid.distance; // usually 5ft width
        templateData.x = token.center.x;
        templateData.y = token.center.y;

        // Use centroid or first target for direction
        if (destinationPoint) {
          const ray = new foundry.canvas.geometry.Ray(token.center, destinationPoint);
          templateData.direction = Math.toDegrees(ray.angle);
        } else {
          templateData.direction = token.document.rotation || 0;
        }
        break;

      case 'cube':
        // Require either centroid or target for positioning
        if (!destinationPoint) {
          ui.notifications.warn(`Please target a token to place the ${type}.`);
          return null;
        }
        templateData.t = 'rect';

        // Cube logic: position so centroid is at the center of the rectangle
        const sideLength = distance;
        templateData.distance = sideLength * Math.sqrt(2); // Hypotenuse
        templateData.direction = 45;

        const gridPixels = canvas.grid.size;
        const sceneGridDist = canvas.scene.grid.distance;
        const sideLengthPixels = (sideLength / sceneGridDist) * gridPixels;

        // Center the cube on the destination point (centroid or target)
        templateData.x = destinationPoint.x - (sideLengthPixels / 2);
        templateData.y = destinationPoint.y - (sideLengthPixels / 2);
        break;

      case 'sphere':
        // Require either centroid or target for positioning
        if (!destinationPoint) {
          ui.notifications.warn(`Please target a token to place the ${type}.`);
          return null;
        }
        templateData.t = 'circle';
        // Center on destination point (centroid or target)
        templateData.x = destinationPoint.x;
        templateData.y = destinationPoint.y;
        break;

      default:
        ui.notifications.warn(`Template creation not supported: ${type}`);
        return null;
    }

    return templateData;
  }
}