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

    // 3. Construct Data
    const templateData = this._constructTemplateData({
      type: deliveryType,
      distance: distance,
      token: token,
      targets: game.user.targets
    });

    if (!templateData) return;

    // 4. Create the Template
    // Flag it so we know it's a Vagabond preview
    templateData.flags = { 
      vagabond: { 
        isPreview: true, 
        actorId: actor.id, 
        itemId: itemId 
      } 
    };

    const doc = await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [templateData]);
    
    // 5. Track the ID
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

    // 3. Construct Data
    const templateData = this._constructTemplateData({
      type: deliveryType,
      distance: distance,
      token: casterToken,
      targets: game.user.targets
    });

    if (templateData) {
      templateData.flags = {
        vagabond: {
          deliveryType: deliveryType,
          deliveryText: deliveryText
        }
      };
      await canvas.scene.createEmbeddedDocuments('MeasuredTemplate', [templateData]);
    }
  }

  /* -------------------------------------------- */
  /* Internal Geometry Logic                     */
  /* -------------------------------------------- */

  /**
   * Generates the MeasuredTemplateDocument data.
   * @param {Object} params
   * @param {string} params.type - Delivery type (cone, line, etc.)
   * @param {number} params.distance - Distance in feet
   * @param {Token} params.token - The caster token
   * @param {UserTargets} params.targets - The user's targets
   * @returns {Object|null} Template data
   */
  _constructTemplateData({ type, distance, token, targets }) {
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

    switch (type.toLowerCase()) {
      case 'aura':
        templateData.t = 'circle';
        templateData.x = token.center.x;
        templateData.y = token.center.y;
        break;

      case 'cone':
        templateData.t = 'cone';
        templateData.angle = 90;
        templateData.x = token.center.x;
        templateData.y = token.center.y;
        
        if (targetToken) {
          const ray = new foundry.canvas.geometry.Ray(token.center, targetToken.center);
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
        
        if (targetToken) {
          const ray = new foundry.canvas.geometry.Ray(token.center, targetToken.center);
          templateData.direction = Math.toDegrees(ray.angle);
        } else {
          templateData.direction = token.document.rotation || 0;
        }
        break;

      case 'cube':
        if (!targetToken) {
          ui.notifications.warn(`Please target a token to place the ${type}.`);
          return null;
        }
        templateData.t = 'rect';
        
        // Cube logic from original file
        const sideLength = distance;
        templateData.distance = sideLength * Math.sqrt(2); // Hypotenuse
        templateData.direction = 45;
        
        const gridPixels = canvas.grid.size;
        const sceneGridDist = canvas.scene.grid.distance;
        const sideLengthPixels = (sideLength / sceneGridDist) * gridPixels;

        templateData.x = targetToken.center.x - (sideLengthPixels / 2);
        templateData.y = targetToken.center.y - (sideLengthPixels / 2);
        break;

      case 'sphere':
        if (!targetToken) {
          ui.notifications.warn(`Please target a token to place the ${type}.`);
          return null;
        }
        templateData.t = 'circle';
        templateData.x = targetToken.center.x;
        templateData.y = targetToken.center.y;
        break;

      default:
        ui.notifications.warn(`Template creation not supported: ${type}`);
        return null;
    }

    return templateData;
  }
}