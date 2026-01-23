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
    if (!context.features?.length) return;

    for (const feature of context.features) {
      if (feature.system?.description) {
        feature.enrichedDescription = await TextEditor.enrichHTML(
          feature.system.description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: feature,
          }
        );
      }
    }
  }

  /**
   * Enrich ancestry traits with HTML content
   * @param {Object} context - The render context containing traits
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichTraits(context, actor) {
    if (!context.traits?.length) return;

    for (const trait of context.traits) {
      if (trait.system?.description) {
        trait.enrichedDescription = await TextEditor.enrichHTML(
          trait.system.description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: trait,
          }
        );
      }
    }
  }

  /**
   * Enrich perks with HTML content
   * @param {Object} context - The render context containing perks
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichPerks(context, actor) {
    if (!context.perks?.length) return;

    for (const perk of context.perks) {
      if (perk.system?.description) {
        perk.enrichedDescription = await TextEditor.enrichHTML(
          perk.system.description,
          {
            async: true,
            secrets: actor.isOwner,
            relativeTo: perk,
          }
        );
      }
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
        spell.enrichedDescription = await TextEditor.enrichHTML(
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
   * Enrich NPC actions with HTML content
   * @param {Object} context - The render context containing actions
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichActions(context, actor) {
    if (!context.actions?.length) return;

    for (const action of context.actions) {
      if (action.description) {
        action.enrichedDescription = await TextEditor.enrichHTML(
          action.description,
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
   * Enrich NPC abilities with HTML content
   * @param {Object} context - The render context containing abilities
   * @param {Object} actor - The actor document
   * @returns {Promise<void>}
   */
  static async enrichAbilities(context, actor) {
    if (!context.abilities?.length) return;

    for (const ability of context.abilities) {
      if (ability.description) {
        ability.enrichedDescription = await TextEditor.enrichHTML(
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

    return await TextEditor.enrichHTML(
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

    return await TextEditor.enrichHTML(content, {
      async: true,
      secrets: options.secrets || false,
      relativeTo: options.relativeTo || null,
    });
  }
}
