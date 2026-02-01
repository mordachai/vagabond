/**
 * Item Processor
 * 
 * Handles data transformation and processing for different item types.
 * Converts raw compendium data into formats optimized for the character builder.
 */

export class ItemProcessor {
  constructor() {
    this.processors = {
      ancestries: this._processAncestries.bind(this),
      classes: this._processClasses.bind(this),
      spells: this._processSpells.bind(this),
      perks: this._processPerks.bind(this),
      gear: this._processGear.bind(this),
      ancestryFeatures: this._processAncestryFeatures.bind(this),
      classFeatures: this._processClassFeatures.bind(this),
      startingPacks: this._processStartingPacks.bind(this)
    };
  }

  /**
   * Process data for a specific type
   * @param {string} dataType - Type of data to process
   * @param {array} rawData - Raw compendium data
   * @returns {array} Processed data
   */
  processData(dataType, rawData) {
    const processor = this.processors[dataType];
    
    if (!processor) {
      console.warn(`No processor found for data type: ${dataType}, using default processing`);
      return this._processDefault(rawData);
    }

    try {
      return processor(rawData);
    } catch (error) {
      console.error(`Error processing ${dataType}:`, error);
      return this._processDefault(rawData);
    }
  }

  /**
   * Process a single item
   * @param {object} item - Raw item data
   * @param {string} type - Item type
   * @returns {object} Processed item
   */
  processItem(item, type) {
    const baseItem = this._extractBaseProperties(item);
    
    switch (type) {
      case 'ancestries':
        return this._processAncestryItem(baseItem, item);
      case 'classes':
        return this._processClassItem(baseItem, item);
      case 'spells':
        return this._processSpellItem(baseItem, item);
      case 'perks':
        return this._processPerkItem(baseItem, item);
      case 'gear':
        return this._processGearItem(baseItem, item);
      default:
        return baseItem;
    }
  }

  /**
   * Process ancestries data
   * @param {array} rawData - Raw ancestry data
   * @returns {array} Processed ancestries
   */
  _processAncestries(rawData) {
    return rawData.map(item => this._processAncestryItem(this._extractBaseProperties(item), item));
  }

  /**
   * Process a single ancestry item
   * @param {object} baseItem - Base item properties
   * @param {object} rawItem - Raw item data
   * @returns {object} Processed ancestry
   */
  _processAncestryItem(baseItem, rawItem) {
    const system = rawItem.system || {};
    
    return {
      ...baseItem,
      type: 'ancestry',
      statModifiers: system.statModifiers || {},
      features: system.features || [],
      languages: system.languages || [],
      size: system.size || 'Medium',
      speed: system.speed || 30,
      darkvision: system.darkvision || false,
      resistances: system.resistances || [],
      vulnerabilities: system.vulnerabilities || [],
      immunities: system.immunities || [],
      traits: system.traits || [],
      flavorText: system.description || baseItem.description || '',
      randomizationWeight: system.randomizationWeight || 1
    };
  }

  /**
   * Process classes data
   * @param {array} rawData - Raw class data
   * @returns {array} Processed classes
   */
  _processClasses(rawData) {
    return rawData.map(item => this._processClassItem(this._extractBaseProperties(item), item));
  }

  /**
   * Process a single class item
   * @param {object} baseItem - Base item properties
   * @param {object} rawItem - Raw item data
   * @returns {object} Processed class
   */
  _processClassItem(baseItem, rawItem) {
    const system = rawItem.system || {};
    
    return {
      ...baseItem,
      type: 'class',
      hitDie: system.hitDie || 'd8',
      primaryStats: system.primaryStats || [],
      savingThrows: system.savingThrows || [],
      skillProficiencies: system.skillProficiencies || [],
      armorProficiencies: system.armorProficiencies || [],
      weaponProficiencies: system.weaponProficiencies || [],
      features: system.features || [],
      spellcasting: system.spellcasting || null,
      spellSlots: system.spellSlots || {},
      cantripsKnown: system.cantripsKnown || 0,
      spellsKnown: system.spellsKnown || 0,
      perkPoints: system.perkPoints || 0,
      startingGold: system.startingGold || 0,
      randomizationWeight: system.randomizationWeight || 1
    };
  }

  /**
   * Process spells data
   * @param {array} rawData - Raw spell data
   * @returns {array} Processed spells
   */
  _processSpells(rawData) {
    return rawData.map(item => this._processSpellItem(this._extractBaseProperties(item), item));
  }

  /**
   * Process a single spell item
   * @param {object} baseItem - Base item properties
   * @param {object} rawItem - Raw item data
   * @returns {object} Processed spell
   */
  _processSpellItem(baseItem, rawItem) {
    const system = rawItem.system || {};
    
    return {
      ...baseItem,
      type: 'spell',
      level: system.level || 0,
      school: system.school || 'Evocation',
      castingTime: system.castingTime || '1 action',
      range: system.range || 'Touch',
      components: system.components || { verbal: false, somatic: false, material: false },
      duration: system.duration || 'Instantaneous',
      concentration: system.concentration || false,
      ritual: system.ritual || false,
      classes: system.classes || [],
      damage: system.damage || null,
      healing: system.healing || null,
      save: system.save || null,
      attack: system.attack || null,
      cost: system.cost || 1,
      prerequisites: system.prerequisites || [],
      randomizationWeight: system.randomizationWeight || 1
    };
  }

  /**
   * Process perks data
   * @param {array} rawData - Raw perk data
   * @returns {array} Processed perks
   */
  _processPerks(rawData) {
    return rawData.map(item => this._processPerkItem(this._extractBaseProperties(item), item));
  }

  /**
   * Process a single perk item
   * @param {object} baseItem - Base item properties
   * @param {object} rawItem - Raw item data
   * @returns {object} Processed perk
   */
  _processPerkItem(baseItem, rawItem) {
    const system = rawItem.system || {};
    
    return {
      ...baseItem,
      type: 'perk',
      cost: system.cost || 1,
      prerequisites: system.prerequisites || [],
      category: system.category || 'General',
      effects: system.effects || [],
      statModifiers: system.statModifiers || {},
      skillModifiers: system.skillModifiers || {},
      combatModifiers: system.combatModifiers || {},
      passive: system.passive || false,
      active: system.active || false,
      uses: system.uses || null,
      recharge: system.recharge || null,
      randomizationWeight: system.randomizationWeight || 1
    };
  }

  /**
   * Process gear data
   * @param {array} rawData - Raw gear data
   * @returns {array} Processed gear
   */
  _processGear(rawData) {
    return rawData.map(item => this._processGearItem(this._extractBaseProperties(item), item));
  }

  /**
   * Process a single gear item
   * @param {object} baseItem - Base item properties
   * @param {object} rawItem - Raw item data
   * @returns {object} Processed gear
   */
  _processGearItem(baseItem, rawItem) {
    const system = rawItem.system || {};
    
    return {
      ...baseItem,
      type: 'gear',
      category: system.category || 'Equipment',
      subcategory: system.subcategory || '',
      weight: system.weight || 0,
      cost: system.cost || 0,
      rarity: system.rarity || 'Common',
      properties: system.properties || [],
      damage: system.damage || null,
      armor: system.armor || null,
      requirements: system.requirements || [],
      magical: system.magical || false,
      attunement: system.attunement || false,
      charges: system.charges || null,
      randomizationWeight: system.randomizationWeight || 1
    };
  }

  /**
   * Process ancestry features data
   * @param {array} rawData - Raw ancestry feature data
   * @returns {array} Processed ancestry features
   */
  _processAncestryFeatures(rawData) {
    return rawData.map(item => ({
      ...this._extractBaseProperties(item),
      type: 'ancestryFeature',
      ancestry: item.system?.ancestry || '',
      level: item.system?.level || 1,
      optional: item.system?.optional || false,
      effects: item.system?.effects || []
    }));
  }

  /**
   * Process class features data
   * @param {array} rawData - Raw class feature data
   * @returns {array} Processed class features
   */
  _processClassFeatures(rawData) {
    return rawData.map(item => ({
      ...this._extractBaseProperties(item),
      type: 'classFeature',
      class: item.system?.class || '',
      level: item.system?.level || 1,
      optional: item.system?.optional || false,
      effects: item.system?.effects || []
    }));
  }

  /**
   * Process starting packs data
   * @param {array} rawData - Raw starting pack data
   * @returns {array} Processed starting packs
   */
  _processStartingPacks(rawData) {
    return rawData.map(item => ({
      ...this._extractBaseProperties(item),
      type: 'startingPack',
      class: item.system?.class || '',
      items: item.system?.items || [],
      gold: item.system?.gold || 0,
      spells: item.system?.spells || [],
      equipment: item.system?.equipment || []
    }));
  }

  /**
   * Default processing for unknown data types
   * @param {array} rawData - Raw data
   * @returns {array} Processed data with base properties only
   */
  _processDefault(rawData) {
    return rawData.map(item => this._extractBaseProperties(item));
  }

  /**
   * Extract base properties common to all items
   * @param {object} item - Raw item data
   * @returns {object} Base properties
   */
  _extractBaseProperties(item) {
    return {
      id: item.id || item._id,
      name: item.name || 'Unnamed Item',
      description: item.system?.description || item.description || '',
      img: item.img || 'icons/svg/mystery-man.svg',
      uuid: item.uuid,
      sort: item.sort || 0,
      flags: item.flags || {},
      folder: item.folder,
      ownership: item.ownership || {}
    };
  }

  /**
   * Validate processed data structure
   * @param {array} processedData - Processed data to validate
   * @param {string} dataType - Data type
   * @returns {boolean} True if data structure is valid
   */
  validateProcessedData(processedData, dataType) {
    if (!Array.isArray(processedData)) {
      return false;
    }

    if (processedData.length === 0) {
      return true; // Empty array is valid
    }

    // Check that all items have required base properties
    const requiredProperties = ['id', 'name', 'type'];
    
    return processedData.every(item => {
      return requiredProperties.every(prop => 
        item.hasOwnProperty(prop) && item[prop] !== undefined
      );
    });
  }

  /**
   * Get processing statistics
   * @param {string} dataType - Data type
   * @param {array} rawData - Raw data
   * @param {array} processedData - Processed data
   * @returns {object} Processing statistics
   */
  getProcessingStats(dataType, rawData, processedData) {
    return {
      dataType,
      rawCount: rawData?.length || 0,
      processedCount: processedData?.length || 0,
      hasProcessor: this.processors.hasOwnProperty(dataType),
      processingTime: null, // Could be added with timing
      errors: [] // Could be populated with processing errors
    };
  }

  /**
   * Add custom processor for a data type
   * @param {string} dataType - Data type
   * @param {function} processor - Processing function
   */
  addProcessor(dataType, processor) {
    if (typeof processor !== 'function') {
      throw new Error('Processor must be a function');
    }
    
    this.processors[dataType] = processor;
  }

  /**
   * Remove processor for a data type
   * @param {string} dataType - Data type
   */
  removeProcessor(dataType) {
    delete this.processors[dataType];
  }

  /**
   * Get list of available processors
   * @returns {string[]} Array of data types with processors
   */
  getAvailableProcessors() {
    return Object.keys(this.processors);
  }
}