/**
 * Character Builder Data Service
 * 
 * Manages all data loading, caching, and processing for the character builder.
 * Provides intelligent caching system with invalidation strategies and batch loading.
 */

import { CompendiumLoader } from './compendium-loader.mjs';
import { ItemProcessor } from './item-processor.mjs';

export class CharacterBuilderDataService {
  constructor() {
    this.cache = new Map();
    this.cacheTimestamps = new Map();
    this.compendiumLoader = new CompendiumLoader();
    this.itemProcessor = new ItemProcessor();
    this.loadingPromises = new Map();
    
    // Cache configuration
    this.cacheConfig = {
      maxAge: 5 * 60 * 1000, // 5 minutes
      maxSize: 100, // Maximum number of cached data types
      preloadTypes: ['ancestries', 'classes', 'spells', 'perks', 'gear'],
      invalidationStrategies: {
        lru: true, // Least Recently Used
        ttl: true, // Time To Live
        size: true // Size-based eviction
      },
      batchSize: 10, // Maximum items to load in a single batch
      warmupDelay: 1000 // Delay before cache warmup
    };
    
    // Cache access tracking for LRU
    this.accessTimes = new Map();
    this.accessCounts = new Map();
  }

  /**
   * Ensure required data types are loaded and cached
   * @param {string[]} dataTypes - Array of data types to ensure are loaded
   * @returns {Promise<void>}
   */
  async ensureDataLoaded(dataTypes) {
    const missingData = dataTypes.filter(type => !this._isCacheValid(type));
    
    if (missingData.length === 0) {
      return;
    }

    // Check for ongoing loading operations
    const loadingOps = missingData.map(type => {
      if (this.loadingPromises.has(type)) {
        return this.loadingPromises.get(type);
      }
      
      const loadPromise = this._loadDataType(type);
      this.loadingPromises.set(type, loadPromise);
      
      // Clean up promise when done
      loadPromise.finally(() => {
        this.loadingPromises.delete(type);
      });
      
      return loadPromise;
    });

    await Promise.all(loadingOps);
  }

  /**
   * Load a specific data type
   * @param {string} dataType - The type of data to load
   * @returns {Promise<any>}
   */
  async _loadDataType(dataType) {
    try {
      const rawData = await this.compendiumLoader.loadCompendiumData(dataType);
      const processedData = this.itemProcessor.processData(dataType, rawData);
      
      this._setCacheData(dataType, processedData);
      return processedData;
    } catch (error) {
      console.error(`Failed to load data type ${dataType}:`, error);
      throw error;
    }
  }

  /**
   * Get ancestry by ID
   * @param {string} id - Ancestry ID
   * @returns {object|null} Ancestry data or null if not found
   */
  getAncestry(id) {
    this._trackAccess('ancestries');
    const ancestries = this.cache.get('ancestries');
    return ancestries?.find(a => a.id === id) || null;
  }

  /**
   * Get class by ID
   * @param {string} id - Class ID
   * @returns {object|null} Class data or null if not found
   */
  getClass(id) {
    this._trackAccess('classes');
    const classes = this.cache.get('classes');
    return classes?.find(c => c.id === id) || null;
  }

  /**
   * Get spell by ID
   * @param {string} id - Spell ID
   * @returns {object|null} Spell data or null if not found
   */
  getSpell(id) {
    this._trackAccess('spells');
    const spells = this.cache.get('spells');
    return spells?.find(s => s.id === id) || null;
  }

  /**
   * Get perk by ID
   * @param {string} id - Perk ID
   * @returns {object|null} Perk data or null if not found
   */
  getPerk(id) {
    this._trackAccess('perks');
    const perks = this.cache.get('perks');
    return perks?.find(p => p.id === id) || null;
  }

  /**
   * Get gear item by ID
   * @param {string} id - Gear ID
   * @returns {object|null} Gear data or null if not found
   */
  getGear(id) {
    this._trackAccess('gear');
    const gear = this.cache.get('gear');
    return gear?.find(g => g.id === id) || null;
  }

  /**
   * Get filtered items of a specific type
   * @param {string} type - Data type
   * @param {object} filters - Filter criteria
   * @returns {array} Filtered items
   */
  getFilteredItems(type, filters = {}) {
    this._trackAccess(type);
    const items = this.cache.get(type) || [];
    
    return items.filter(item => {
      return Object.entries(filters).every(([key, value]) => {
        if (Array.isArray(value)) {
          return value.includes(item[key]);
        }
        return item[key] === value;
      });
    });
  }

  /**
   * Get all items of a specific type
   * @param {string} type - Data type
   * @returns {array} All items of the specified type
   */
  getAllItems(type) {
    this._trackAccess(type);
    return this.cache.get(type) || [];
  }

  /**
   * Process item data for use in the character builder
   * @param {object} item - Raw item data
   * @param {string} type - Item type
   * @returns {object} Processed item data
   */
  processItemData(item, type) {
    return this.itemProcessor.processItem(item, type);
  }

  /**
   * Preload all essential data for the character builder
   * @returns {Promise<void>}
   */
  async preloadAllData() {
    await this.ensureDataLoaded(this.cacheConfig.preloadTypes);
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
    this.cacheTimestamps.clear();
    this.loadingPromises.clear();
    this.accessTimes.clear();
    this.accessCounts.clear();
  }

  /**
   * Clear cache for specific data type
   * @param {string} dataType - Data type to clear
   */
  clearCacheType(dataType) {
    this.cache.delete(dataType);
    this.cacheTimestamps.delete(dataType);
    this.accessTimes.delete(dataType);
    this.accessCounts.delete(dataType);
    
    if (this.loadingPromises.has(dataType)) {
      this.loadingPromises.delete(dataType);
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getCacheStats() {
    return {
      totalTypes: this.cache.size,
      cachedTypes: Array.from(this.cache.keys()),
      loadingTypes: Array.from(this.loadingPromises.keys()),
      cacheSize: this._calculateCacheSize(),
      oldestEntry: this._getOldestCacheEntry(),
      mostAccessed: this._getMostAccessedTypes(),
      hitRate: this._calculateHitRate(),
      memoryUsage: this._estimateMemoryUsage()
    };
  }

  /**
   * Check if cache data is valid for a given type
   * @param {string} dataType - Data type to check
   * @returns {boolean} True if cache is valid
   */
  _isCacheValid(dataType) {
    if (!this.cache.has(dataType)) {
      return false;
    }

    const timestamp = this.cacheTimestamps.get(dataType);
    if (!timestamp) {
      return false;
    }

    const age = Date.now() - timestamp;
    return age < this.cacheConfig.maxAge;
  }

  /**
   * Set cache data with timestamp
   * @param {string} dataType - Data type
   * @param {any} data - Data to cache
   */
  _setCacheData(dataType, data) {
    // Implement cache size management
    if (this.cache.size >= this.cacheConfig.maxSize) {
      this._evictOldestCacheEntry();
    }

    this.cache.set(dataType, data);
    this.cacheTimestamps.set(dataType, Date.now());
  }

  /**
   * Evict the oldest cache entry
   */
  _evictOldestCacheEntry() {
    if (this.cacheConfig.invalidationStrategies.lru) {
      this._evictLRU();
    } else if (this.cacheConfig.invalidationStrategies.ttl) {
      this._evictOldestByTime();
    } else {
      this._evictOldestByTime(); // Default fallback
    }
  }

  /**
   * Evict least recently used entry
   */
  _evictLRU() {
    let lruType = null;
    let oldestAccess = Date.now();

    for (const [type, accessTime] of this.accessTimes.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        lruType = type;
      }
    }

    if (lruType) {
      this.clearCacheType(lruType);
    }
  }

  /**
   * Evict oldest entry by timestamp
   */
  _evictOldestByTime() {
    let oldestType = null;
    let oldestTime = Date.now();

    for (const [type, timestamp] of this.cacheTimestamps.entries()) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestType = type;
      }
    }

    if (oldestType) {
      this.clearCacheType(oldestType);
    }
  }

  /**
   * Calculate total cache size (approximate)
   * @returns {number} Cache size in bytes (approximate)
   */
  _calculateCacheSize() {
    let size = 0;
    for (const data of this.cache.values()) {
      size += JSON.stringify(data).length;
    }
    return size;
  }

  /**
   * Get the oldest cache entry timestamp
   * @returns {number|null} Oldest timestamp or null if cache is empty
   */
  _getOldestCacheEntry() {
    if (this.cacheTimestamps.size === 0) {
      return null;
    }

    return Math.min(...this.cacheTimestamps.values());
  }

  /**
   * Batch load multiple data types efficiently
   * @param {string[]} dataTypes - Array of data types to load
   * @returns {Promise<Map<string, any>>} Map of loaded data by type
   */
  async batchLoadData(dataTypes) {
    const results = new Map();
    
    // Load all data types in parallel
    const loadPromises = dataTypes.map(async (type) => {
      try {
        await this.ensureDataLoaded([type]);
        results.set(type, this.cache.get(type));
      } catch (error) {
        console.error(`Failed to load ${type} in batch:`, error);
        results.set(type, null);
      }
    });

    await Promise.all(loadPromises);
    return results;
  }

  /**
   * Warm cache with frequently accessed data
   * @returns {Promise<void>}
   */
  async warmCache() {
    const warmupTypes = ['ancestries', 'classes'];
    await this.ensureDataLoaded(warmupTypes);
  }

  /**
   * Track access to cache data for LRU
   * @param {string} dataType - Data type being accessed
   */
  _trackAccess(dataType) {
    const now = Date.now();
    this.accessTimes.set(dataType, now);
    this.accessCounts.set(dataType, (this.accessCounts.get(dataType) || 0) + 1);
  }

  /**
   * Get most accessed data types
   * @param {number} limit - Number of top types to return
   * @returns {array} Array of {type, count} objects
   */
  _getMostAccessedTypes(limit = 5) {
    const accessArray = Array.from(this.accessCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    
    return accessArray.slice(0, limit);
  }

  /**
   * Calculate cache hit rate (approximate)
   * @returns {number} Hit rate as percentage
   */
  _calculateHitRate() {
    const totalAccesses = Array.from(this.accessCounts.values()).reduce((sum, count) => sum + count, 0);
    const cacheHits = this.cache.size * 10; // Rough estimate
    
    if (totalAccesses === 0) return 0;
    return Math.min(100, (cacheHits / totalAccesses) * 100);
  }

  /**
   * Estimate memory usage of cache
   * @returns {object} Memory usage statistics
   */
  _estimateMemoryUsage() {
    let totalSize = 0;
    const typeSizes = {};

    for (const [type, data] of this.cache.entries()) {
      const size = JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
      typeSizes[type] = size;
      totalSize += size;
    }

    return {
      totalBytes: totalSize,
      totalKB: Math.round(totalSize / 1024),
      totalMB: Math.round(totalSize / (1024 * 1024)),
      byType: typeSizes
    };
  }

  /**
   * Perform cache maintenance
   * @returns {object} Maintenance results
   */
  performMaintenance() {
    const results = {
      evicted: [],
      errors: [],
      sizeBefore: this.cache.size,
      sizeAfter: 0
    };

    // Remove expired entries
    const now = Date.now();
    for (const [type, timestamp] of this.cacheTimestamps.entries()) {
      if (now - timestamp > this.cacheConfig.maxAge) {
        this.clearCacheType(type);
        results.evicted.push({ type, reason: 'expired' });
      }
    }

    // Check size limits
    while (this.cache.size > this.cacheConfig.maxSize) {
      const sizeBefore = this.cache.size;
      this._evictOldestCacheEntry();
      
      if (this.cache.size === sizeBefore) {
        // Prevent infinite loop
        break;
      }
      
      results.evicted.push({ type: 'unknown', reason: 'size_limit' });
    }

    results.sizeAfter = this.cache.size;
    return results;
  }

  /**
   * Schedule automatic cache maintenance
   * @param {number} intervalMs - Maintenance interval in milliseconds
   */
  scheduleMaintenace(intervalMs = 5 * 60 * 1000) { // Default 5 minutes
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
    }

    this.maintenanceInterval = setInterval(() => {
      try {
        this.performMaintenance();
      } catch (error) {
        console.error('Cache maintenance error:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop automatic cache maintenance
   */
  stopMaintenance() {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
  }
}