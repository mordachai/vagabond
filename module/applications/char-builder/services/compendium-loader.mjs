/**
 * Compendium Loader
 * 
 * Handles loading data from Foundry VTT compendiums with error handling and retry logic.
 */

export class CompendiumLoader {
  constructor() {
    this.compendiumMappings = {
      ancestries: 'vagabond.ancestries',
      classes: 'vagabond.classes',
      spells: 'vagabond.spells',
      perks: 'vagabond.perks',
      gear: 'vagabond.gear',
      ancestryFeatures: 'vagabond.ancestry-features',
      classFeatures: 'vagabond.class-features',
      startingPacks: 'vagabond.starting-packs'
    };

    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000
    };
  }

  /**
   * Load compendium data for a specific type
   * @param {string} dataType - Type of data to load
   * @returns {Promise<array>} Array of compendium documents
   */
  async loadCompendiumData(dataType) {
    const compendiumId = this.compendiumMappings[dataType];
    
    if (!compendiumId) {
      throw new Error(`Unknown data type: ${dataType}`);
    }

    return await this._loadWithRetry(compendiumId, dataType);
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
   * Check if a compendium exists and is accessible
   * @param {string} dataType - Data type to check
   * @returns {boolean} True if compendium is accessible
   */
  isCompendiumAvailable(dataType) {
    const compendiumId = this.compendiumMappings[dataType];
    
    if (!compendiumId) {
      return false;
    }

    const compendium = game.packs.get(compendiumId);
    return compendium !== undefined;
  }

  /**
   * Get compendium metadata
   * @param {string} dataType - Data type
   * @returns {object|null} Compendium metadata or null if not found
   */
  getCompendiumMetadata(dataType) {
    const compendiumId = this.compendiumMappings[dataType];
    
    if (!compendiumId) {
      return null;
    }

    const compendium = game.packs.get(compendiumId);
    
    if (!compendium) {
      return null;
    }

    return {
      id: compendium.id,
      title: compendium.title,
      type: compendium.documentName,
      indexed: compendium.indexed,
      size: compendium.index?.size || 0
    };
  }

  /**
   * Get all available compendium types
   * @returns {string[]} Array of available data types
   */
  getAvailableTypes() {
    return Object.keys(this.compendiumMappings).filter(type => 
      this.isCompendiumAvailable(type)
    );
  }

  /**
   * Preload compendium indexes for faster access
   * @param {string[]} dataTypes - Data types to preload indexes for
   * @returns {Promise<void>}
   */
  async preloadIndexes(dataTypes = Object.keys(this.compendiumMappings)) {
    const indexPromises = dataTypes.map(async (dataType) => {
      try {
        const compendiumId = this.compendiumMappings[dataType];
        if (!compendiumId) return;

        const compendium = game.packs.get(compendiumId);
        if (!compendium) return;

        if (!compendium.indexed) {
          await compendium.getIndex();
        }
      } catch (error) {
        console.warn(`Failed to preload index for ${dataType}:`, error);
      }
    });

    await Promise.all(indexPromises);
  }

  /**
   * Get compendium loading statistics
   * @returns {object} Loading statistics
   */
  getLoadingStats() {
    const stats = {
      totalCompendiums: Object.keys(this.compendiumMappings).length,
      availableCompendiums: 0,
      indexedCompendiums: 0,
      compendiumDetails: {}
    };

    for (const [dataType, compendiumId] of Object.entries(this.compendiumMappings)) {
      const compendium = game.packs.get(compendiumId);
      
      if (compendium) {
        stats.availableCompendiums++;
        
        if (compendium.indexed) {
          stats.indexedCompendiums++;
        }

        stats.compendiumDetails[dataType] = {
          available: true,
          indexed: compendium.indexed,
          size: compendium.index?.size || 0,
          title: compendium.title
        };
      } else {
        stats.compendiumDetails[dataType] = {
          available: false,
          indexed: false,
          size: 0,
          title: 'Not Found'
        };
      }
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
    // Clear Foundry's internal compendium caches if needed
    for (const compendiumId of Object.values(this.compendiumMappings)) {
      const compendium = game.packs.get(compendiumId);
      if (compendium && compendium.apps) {
        // Clear any open compendium applications
        Object.values(compendium.apps).forEach(app => {
          if (app.close) app.close();
        });
      }
    }
  }
}