/**
 * Compendium Loader
 *
 * Handles loading data from Foundry VTT compendiums with error handling and retry logic.
 * Scans ALL Item compendiums (system, world, and modules) to support custom content.
 */

export class CompendiumLoader {
  constructor() {
    // Legacy system compendium mappings (for backwards compatibility)
    this.systemCompendiumMappings = {
      ancestries: 'vagabond.ancestries',
      classes: 'vagabond.classes',
      spells: 'vagabond.spells',
      perks: 'vagabond.perks',
      gear: 'vagabond.gear',
      ancestryFeatures: 'vagabond.ancestry-features',
      classFeatures: 'vagabond.class-features',
      startingPacks: 'vagabond.starting-packs'
    };

    // Map data types to item types for filtering
    this.itemTypeMap = {
      ancestries: 'ancestry',
      classes: 'class',
      spells: 'spell',
      perks: 'perk',
      gear: 'equipment',
      ancestryFeatures: 'feature',
      classFeatures: 'feature',
      startingPacks: 'starterPack'
    };

    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000
    };
  }

  /**
   * Load compendium data for a specific type
   * Scans ALL Item compendiums (system, world, modules) and filters by item type
   * Respects the GM's compendium selection settings
   * @param {string} dataType - Type of data to load
   * @returns {Promise<array>} Array of compendium documents
   */
  async loadCompendiumData(dataType) {
    const itemType = this.itemTypeMap[dataType];

    if (!itemType) {
      throw new Error(`Unknown data type: ${dataType}`);
    }

    // Get all Item compendiums
    let itemCompendiums = Array.from(game.packs).filter(pack => pack.documentName === 'Item');

    // Filter by GM's compendium settings
    const settings = game.settings.get('vagabond', 'characterBuilderCompendiums');
    const totalCompendiums = itemCompendiums.length;

    console.log(`CompendiumLoader [${dataType}]: Settings check`, {
      useAll: settings.useAll,
      enabledCount: settings.enabled.length,
      enabled: settings.enabled,
      totalPacks: totalCompendiums,
      packIds: itemCompendiums.map(p => p.collection)
    });

    if (!settings.useAll && settings.enabled.length > 0) {
      const beforeFilter = itemCompendiums.length;
      const beforeIds = itemCompendiums.map(p => p.collection);
      itemCompendiums = itemCompendiums.filter(pack => settings.enabled.includes(pack.collection));
      const afterIds = itemCompendiums.map(p => p.collection);
      const filteredOut = beforeIds.filter(id => !afterIds.includes(id));

      console.log(`Character Builder: Filtered ${beforeFilter - itemCompendiums.length} compendiums (${itemCompendiums.length} remain)`);
      if (filteredOut.length > 0) {
        console.log(`  Filtered out:`, filteredOut);
      }
    } else if (!settings.useAll && settings.enabled.length === 0) {
      // No compendiums selected - return empty array
      console.log('Character Builder: No compendiums enabled, returning empty array');
      itemCompendiums = [];
    }

    // Categorize compendiums by source for logging
    const sources = {
      system: itemCompendiums.filter(p => p.metadata.packageType === 'system').length,
      world: itemCompendiums.filter(p => p.metadata.packageType === 'world').length,
      module: itemCompendiums.filter(p => !['system', 'world'].includes(p.metadata.packageType)).length
    };

    // Load documents from all compendiums in parallel
    const allDocuments = [];
    const loadPromises = itemCompendiums.map(async (pack) => {
      try {
        const documents = await this._loadCompendium(pack.collection);
        return { pack: pack.collection, documents };
      } catch (error) {
        console.warn(`Character Builder: Failed to load compendium ${pack.collection}:`, error);
        return { pack: pack.collection, documents: [] };
      }
    });

    const results = await Promise.all(loadPromises);

    // Flatten and filter by item type
    let foundInPacks = [];
    for (const { pack, documents } of results) {
      const filtered = documents.filter(doc => doc.type === itemType);
      if (filtered.length > 0) {
        foundInPacks.push(`${pack} (${filtered.length})`);
      }
      allDocuments.push(...filtered);
    }

    console.log(`Character Builder: Loaded ${allDocuments.length} ${dataType} from ${itemCompendiums.length} compendiums (${sources.system} system, ${sources.world} world, ${sources.module} module)`);
    if (foundInPacks.length > 0) {
      console.log(`  Found in: ${foundInPacks.join(', ')}`);
    }

    return allDocuments;
  }

  /**
   * Load compendium data with retry logic
   * @param {string} compendiumId - Compendium identifier
   * @param {string} dataType - Data type for error reporting
   * @returns {Promise<array>} Array of compendium documents
   */
  async _loadWithRetry(compendiumId, dataType) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this._loadCompendium(compendiumId);
      } catch (error) {
        lastError = error;
        
        if (attempt < this.retryConfig.maxRetries) {
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(2, attempt),
            this.retryConfig.maxDelay
          );
          
          console.warn(`Failed to load ${dataType} (attempt ${attempt + 1}), retrying in ${delay}ms:`, error);
          await this._delay(delay);
        }
      }
    }

    throw new Error(`Failed to load ${dataType} after ${this.retryConfig.maxRetries + 1} attempts: ${lastError.message}`);
  }

  /**
   * Load a specific compendium
   * @param {string} compendiumId - Compendium identifier
   * @returns {Promise<array>} Array of compendium documents
   */
  async _loadCompendium(compendiumId) {
    const compendium = game.packs.get(compendiumId);
    
    if (!compendium) {
      throw new Error(`Compendium not found: ${compendiumId}`);
    }

    // Check if compendium is indexed
    if (!compendium.indexed) {
      await compendium.getIndex();
    }

    // Load all documents from the compendium
    const documents = await compendium.getDocuments();
    
    if (!Array.isArray(documents)) {
      throw new Error(`Invalid compendium data format for ${compendiumId}`);
    }

    return documents;
  }

  /**
   * Load multiple compendiums in parallel
   * @param {string[]} dataTypes - Array of data types to load
   * @returns {Promise<Map<string, array>>} Map of loaded data by type
   */
  async loadMultipleCompendiums(dataTypes) {
    const loadPromises = dataTypes.map(async (dataType) => {
      try {
        const data = await this.loadCompendiumData(dataType);
        return [dataType, data];
      } catch (error) {
        console.error(`Failed to load compendium for ${dataType}:`, error);
        return [dataType, []];
      }
    });

    const results = await Promise.all(loadPromises);
    return new Map(results);
  }

  /**
   * Check if any Item compendiums are available for a data type
   * @param {string} dataType - Data type to check
   * @returns {boolean} True if at least one Item compendium is accessible
   */
  isCompendiumAvailable(dataType) {
    const itemType = this.itemTypeMap[dataType];

    if (!itemType) {
      return false;
    }

    // Check if any Item compendiums exist
    const itemCompendiums = Array.from(game.packs).filter(pack => pack.documentName === 'Item');
    return itemCompendiums.length > 0;
  }

  /**
   * Get metadata for all Item compendiums that contain a specific data type
   * @param {string} dataType - Data type
   * @returns {array} Array of compendium metadata objects
   */
  getCompendiumMetadata(dataType) {
    const itemType = this.itemTypeMap[dataType];

    if (!itemType) {
      return [];
    }

    const itemCompendiums = Array.from(game.packs).filter(pack => pack.documentName === 'Item');

    return itemCompendiums.map(compendium => ({
      id: compendium.collection,
      title: compendium.title,
      type: compendium.documentName,
      indexed: compendium.indexed,
      size: compendium.index?.size || 0,
      metadata: compendium.metadata
    }));
  }

  /**
   * Get all available compendium types
   * @returns {string[]} Array of available data types
   */
  getAvailableTypes() {
    return Object.keys(this.itemTypeMap).filter(type =>
      this.isCompendiumAvailable(type)
    );
  }

  /**
   * Preload all Item compendium indexes for faster access
   * @returns {Promise<void>}
   */
  async preloadIndexes() {
    const itemCompendiums = Array.from(game.packs).filter(pack => pack.documentName === 'Item');

    const indexPromises = itemCompendiums.map(async (compendium) => {
      try {
        if (!compendium.indexed) {
          await compendium.getIndex();
        }
      } catch (error) {
        console.warn(`Failed to preload index for ${compendium.collection}:`, error);
      }
    });

    await Promise.all(indexPromises);
    console.log(`Character Builder: Preloaded ${itemCompendiums.length} Item compendium indexes`);
  }

  /**
   * Get compendium loading statistics
   * @returns {object} Loading statistics
   */
  getLoadingStats() {
    const itemCompendiums = Array.from(game.packs).filter(pack => pack.documentName === 'Item');

    const stats = {
      totalItemCompendiums: itemCompendiums.length,
      indexedCompendiums: 0,
      compendiumsBySource: {
        system: [],
        world: [],
        module: []
      },
      compendiumDetails: {}
    };

    for (const compendium of itemCompendiums) {
      if (compendium.indexed) {
        stats.indexedCompendiums++;
      }

      // Categorize by source
      const [source] = compendium.collection.split('.');
      if (source === 'vagabond') {
        stats.compendiumsBySource.system.push(compendium.collection);
      } else if (source === 'world') {
        stats.compendiumsBySource.world.push(compendium.collection);
      } else {
        stats.compendiumsBySource.module.push(compendium.collection);
      }

      stats.compendiumDetails[compendium.collection] = {
        title: compendium.title,
        indexed: compendium.indexed,
        size: compendium.index?.size || 0,
        source: source
      };
    }

    return stats;
  }

  /**
   * Utility method to create a delay
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate compendium data structure
   * @param {array} documents - Array of compendium documents
   * @param {string} dataType - Expected data type
   * @returns {boolean} True if data structure is valid
   */
  validateCompendiumData(documents, dataType) {
    if (!Array.isArray(documents)) {
      return false;
    }

    if (documents.length === 0) {
      return true; // Empty compendium is valid
    }

    // Basic validation - ensure documents have required properties
    const requiredProperties = ['id', 'name', 'system'];
    
    return documents.every(doc => {
      return requiredProperties.every(prop => 
        doc.hasOwnProperty(prop) && doc[prop] !== undefined
      );
    });
  }

  /**
   * Clear any cached compendium data
   */
  clearCompendiumCaches() {
    // Clear Foundry's internal compendium caches for all Item compendiums
    const itemCompendiums = Array.from(game.packs).filter(pack => pack.documentName === 'Item');

    for (const compendium of itemCompendiums) {
      if (compendium.apps) {
        // Clear any open compendium applications
        Object.values(compendium.apps).forEach(app => {
          if (app.close) app.close();
        });
      }
    }
  }
}