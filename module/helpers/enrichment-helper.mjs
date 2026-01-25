/**
 * Helper utilities for enriching HTML content in items.
 * Eliminates 3+ duplicate text enrichment loops across the codebase.
 */
export class EnrichmentHelper {
  /**
   * Enrich class features with HTML content
   * @param {Object} context - The render context containing features
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichFeatures(context, actor) {
    if (!context.features?.length) {
      context.enrichedFeatures = [];
      return;
    }

    context.enrichedFeatures = [];
    for (const feature of context.features) {
      const description = feature.system?.description || feature.description;
      if (description) {
        feature.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: feature.sourceItem || actor,
          }
        );
      }
      context.enrichedFeatures.push(feature);
    }
  }

  /**
   * Enrich ancestry traits with HTML content
   * @param {Object} context - The render context containing traits
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichTraits(context, actor) {
    if (!context.traits?.length) {
      context.enrichedTraits = [];
      return;
    }

    context.enrichedTraits = [];
    for (const trait of context.traits) {
      const description = trait.system?.description || trait.description;
      if (description) {
        trait.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: trait.sourceItem || actor,
          }
        );
      }
      context.enrichedTraits.push(trait);
    }
  }

  /**
   * Enrich perks with HTML content
   * @param {Object} context - The render context containing perks
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichPerks(context, actor) {
    if (!context.perks?.length) {
      context.enrichedPerks = [];
      return;
    }

    context.enrichedPerks = [];
    for (const perk of context.perks) {
      const description = perk.system?.description || perk.description;
      if (description) {
        perk.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: perk,
          }
        );
      }
      context.enrichedPerks.push(perk);
    }
  }

  /**
   * Enrich spell descriptions with HTML content
   * @param {Object} context - The render context containing spells
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichSpells(context, actor) {
    if (!context.spells?.length) return;

    for (const spell of context.spells) {
      if (spell.system?.description) {
        spell.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          spell.system.description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: spell,
          }
        );
      }
    }
  }

  /**
   * Enrich NPC actions with HTML content and formatted fields
   * @param {Object} context - The render context containing actions
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichActions(context, actor) {
    if (!context.actions?.length) {
      context.enrichedActions = [];
      return;
    }

    context.enrichedActions = [];
    
    for (let i = 0; i < context.actions.length; i++) {
      const action = context.actions[i];
      const enrichedAction = { ...action };

      // Enrich description
      if (action.description) {
        enrichedAction.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          action.description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: actor,
          }
        );
      }

      // Format recharge field for display
      if (action.recharge) {
        enrichedAction.rechargeFormatted = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          action.recharge,
          {
            async: true,
            secrets: actor.isOwner,
            rollData: actor.getRollData(),
            relativeTo: actor,
          }
        );
      }

      // Format extra info field for display
      if (action.extraInfo) {
        enrichedAction.extraInfoFormatted = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          action.extraInfo,
          {
            async: true,
            secrets: actor.isOwner,
            rollData: actor.getRollData(),
            relativeTo: actor,
          }
        );
      }

      context.enrichedActions.push(enrichedAction);
    }
  }

  /**
   * Enrich NPC abilities with HTML content
   * @param {Object} context - The render context containing abilities
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichAbilities(context, actor) {
    if (!context.abilities?.length) return;

    for (const ability of context.abilities) {
      if (ability.description) {
        ability.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
          ability.description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: actor,
          }
        );
      }
    }
  }

  /**
   * Enrich all actor items in one call
   * @param {Object} context - The render context
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichAllActorItems(context, actor) {
    await Promise.all([
      this.enrichFeatures(context, actor),
      this.enrichTraits(context, actor),
      this.enrichPerks(context, actor),
      this.enrichSpells(context, actor),
    ]);
  }

  /**
   * Enrich all NPC content in one call
   * @param {Object} context - The render context
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichAllNPCContent(context, actor) {
    await Promise.all([
      this.enrichActions(context, actor),
      this.enrichAbilities(context, actor),
    ]);
  }

  /**
   * Enrich a single item's description
   * @param {Object} item - The item to enrich
   * @param {Object} actor - The actor document (for ownership check)
   * @returns {Promise<string>} The enriched HTML
   */
  static async enrichItemDescription(item, actor) {
    if (!item?.system?.description) return '';

    return await foundry.applications.ux.TextEditor.implementation.enrichHTML(
      item.system.description,
      {
        async: true,
        secrets: actor?.isOwner || false,
        relativeTo: item,
      }
    );
  }

  /**
   * Enrich arbitrary text content
   * @param {string} content - The text content to enrich
   * @param {Object} [options={}] - Enrichment options
   * @param {boolean} [options.secrets=false] - Show secret blocks
   * @param {Object} [options.relativeTo=null] - Document for relative references
   * @returns {Promise<string>} The enriched HTML
   */
  static async enrichText(content, options = {}) {
    if (!content) return '';

    return await foundry.applications.ux.TextEditor.implementation.enrichHTML(content, {
      async: true,
      secrets: options.secrets || false,
      relativeTo: options.relativeTo || null,
    });
  }
}
