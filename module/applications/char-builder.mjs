/**
 * Vagabond Character Builder - Core Logic
 * Implementation for Foundry VTT v13+ using ApplicationV2.
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { VagabondUIHelper } from '../helpers/ui-helper.mjs';

export class VagabondCharBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.currentStep = 'ancestry';
    
    // Internal state for the builder
    this.builderData = {
      ancestry: null,
      class: null,
      stats: { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null },
      skills: [],
      perks: [],      // Manually added perks
      classPerks: [], // Perks granted by class features (auto-populated)
      spells: [],     // Spells in tray
      startingPack: null,
      gear: [],       // Gear in tray (includes starting pack items if selected)
      previewUuid: null,
      selectedArrayId: null,
      unassignedValues: [],
      selectedValue: null,
      lastClassForPerks: null // Track which class we last extracted perks from
    };

    this.openCategories = new Set();
    this.indices = {};
    this.compendiumTypeCache = {}; // Cache which compendiums contain which types

    // Step 3: The 1d12 Stat Array Table
    this.statArrays = {
      1: [5, 5, 5, 4, 4, 3], 2: [5, 5, 5, 5, 3, 2], 3: [6, 5, 4, 4, 4, 3],
      4: [6, 5, 5, 4, 3, 2], 5: [6, 6, 4, 3, 3, 3], 6: [6, 6, 4, 4, 3, 2],
      7: [6, 6, 5, 3, 2, 2], 8: [7, 4, 4, 4, 4, 2], 9: [7, 4, 4, 4, 3, 3],
      10: [7, 5, 4, 3, 3, 2], 11: [7, 5, 5, 2, 2, 2], 12: [7, 6, 4, 2, 2, 2]
    };
  }

  // Navigation order for steps
  static STEPS_ORDER = ['ancestry', 'class', 'stats', 'perks', 'spells', 'starting-packs', 'gear'];

  static DEFAULT_OPTIONS = {
    id: "vagabond-char-builder",
    tag: "form",
    window: { title: "VAGABOND.CharBuilder.Title", resizable: true, icon: "fas fa-scroll" },
    position: { width: 1100, height: 850 },
    // We use .prototype here to reference the instance methods safely from a static context
    actions: {
      goToStep: VagabondCharBuilder.prototype._onGoToStep,
      next: VagabondCharBuilder.prototype._onNext,
      prev: VagabondCharBuilder.prototype._onPrev,
      selectOption: VagabondCharBuilder.prototype._onSelectOption,
      toggleCategory: VagabondCharBuilder.prototype._onToggleCategory,
      randomize: VagabondCharBuilder.prototype._onRandomize,
      randomizeFullCharacter: VagabondCharBuilder.prototype._onRandomizeFullCharacter,
      pickValue: VagabondCharBuilder.prototype._onPickValue,
      assignStat: VagabondCharBuilder.prototype._onAssignStat,
      toggleSkill: VagabondCharBuilder.prototype._onToggleSkill,
      resetStats: VagabondCharBuilder.prototype._onResetStats,
      addToTray: VagabondCharBuilder.prototype._onAddToTray,
      removeFromTray: VagabondCharBuilder.prototype._onRemoveFromTray,
      clearTray: VagabondCharBuilder.prototype._onClearTray,
      removeStartingPack: VagabondCharBuilder.prototype._onRemoveStartingPack,
      finish: VagabondCharBuilder.prototype._onFinish,
      dismissBuilder: VagabondCharBuilder.prototype._onDismissBuilder
    }
  };

  static PARTS = { form: { template: "systems/vagabond/templates/apps/char-builder.hbs" } };

  /** @override */
  async _prepareContext(options) {
    // Auto-populate perks from class features when entering perks step
    if (this.currentStep === 'perks') {
      // Check if class has changed since we last extracted perks
      if (this.builderData.class !== this.builderData.lastClassForPerks) {
        // Class changed - update class perks
        if (this.builderData.class) {
          this.builderData.classPerks = await this._extractPerksFromClass();
        } else {
          this.builderData.classPerks = [];
        }
        this.builderData.lastClassForPerks = this.builderData.class;
      }
    }

    const availableOptions = await this._loadStepOptions();
    const stepKey = this.currentStep === 'starting-packs' ? 'startingPack' : this.currentStep;
    
    // --- 0. INSTRUCTION & SELECTION LOGIC ---
    let hasSelection = false;
    if (this.currentStep === 'stats') {
        hasSelection = !!this.builderData.selectedArrayId; 
    } else if (Array.isArray(this.builderData[stepKey])) {
        hasSelection = this.builderData[stepKey].length > 0;
    } else {
        hasSelection = !!this.builderData[stepKey];
    }

    const locId = this.currentStep.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    // Show instruction only if tray is empty AND nothing is being previewed
    const instruction = (!hasSelection && !this.builderData.previewUuid) ? game.i18n.localize(`VAGABOND.CharBuilder.Instructions.${locId}`) : null;
        
    // --- 1. PREPARE RAW DATA & SANITIZE ---
    const actorData = this.actor.toObject();
    actorData.effects = []; 
    if (actorData.system.inventory) actorData.system.inventory.bonusSlots = 0;
    
    if (actorData.system.stats) {
        for (const key of Object.keys(actorData.system.stats)) {
            if (actorData.system.stats[key]) {
                actorData.system.stats[key].bonus = 0;
                actorData.system.stats[key].mod = 0;
            }
        }
    }

    // --- 2. APPLY BUILDER STATS ---
    for (const [key, val] of Object.entries(this.builderData.stats)) {
        if (val !== null && actorData.system.stats[key]) actorData.system.stats[key].value = val;
    }

    // --- 2.5 APPLY BUILDER SKILLS & CLASS SKILLS ---
    const skillsToTrain = [...this.builderData.skills];
    // Fetch class item if exists to get guaranteed skills
    const classItemObj = this.builderData.class ? await fromUuid(this.builderData.class) : null;
    if (classItemObj) {
        const guaranteed = classItemObj.system.skillGrant?.guaranteed || [];
        for (const s of guaranteed) {
            if (!skillsToTrain.includes(s)) skillsToTrain.push(s);
        }
    }

    for (const sKey of skillsToTrain) {
        if (actorData.system.skills && actorData.system.skills[sKey]) actorData.system.skills[sKey].trained = true;
        if (actorData.system.weaponSkills && actorData.system.weaponSkills[sKey]) actorData.system.weaponSkills[sKey].trained = true;
    }

    // --- 3. INJECT ITEMS ---
    // Combine class perks and manually added perks
    const allPerks = [...new Set([...this.builderData.classPerks, ...this.builderData.perks])];

    const itemUuids = [
        this.builderData.ancestry,
        this.builderData.class,
        this.builderData.startingPack,
        ...allPerks,
        ...this.builderData.gear
    ].filter(uuid => uuid);

    // Optimized: Fetch items once to use for both Injection and Spellcaster checks
    const validItemDocs = itemUuids.length > 0 ? await Promise.all(itemUuids.map(uuid => fromUuid(uuid))) : [];
    const validItems = validItemDocs.filter(i => i);

    if (validItems.length > 0) {
        const itemObjects = validItems.map(item => item.toObject());
        const singletonTypes = ['ancestry', 'class'];
        const typesBeingAdded = new Set(itemObjects.map(i => i.type));

        actorData.items = actorData.items.filter(existingItem => {
            return !(singletonTypes.includes(existingItem.type) && typesBeingAdded.has(existingItem.type));
        });
        actorData.items.push(...itemObjects);
    }

    // --- 4. CREATE PREVIEW ---
    const previewActor = new Actor.implementation(actorData);
    previewActor.prepareData();

    // --- 5. DYNAMIC MAGIC LOGIC (Stats Step) ---
    // Check if class OR any selected perks grant spellcasting
    const perkGrantsMagic = validItems.some(i => i.type === 'perk' && i.system.grantSpellcasting === true);
    const classItem = validItems.find(i => i.type === 'class');
    const isSpellcaster = classItem?.system.isSpellcaster || perkGrantsMagic;

    // --- 6. UI & ITEM PREVIEW LOGIC ---
    // Only allow a preview if it was explicitly clicked (previewUuid) 
    // OR if we are on a tab where the main selection should be shown.
    let previewUuid = this.builderData.previewUuid;

    // If no specific item is clicked, only default to the step's selection 
    // IF we are actually on that step.
    if (!previewUuid) {
        if (this.currentStep === 'ancestry') previewUuid = this.builderData.ancestry;
        else if (this.currentStep === 'class') previewUuid = this.builderData.class;
        else if (this.currentStep === 'starting-packs') previewUuid = this.builderData.startingPack;
    }

    let selectedItem = null;
    let classPreviewData = null;

    if (previewUuid && typeof previewUuid === 'string') {
        const item = validItems.find(i => i.uuid === previewUuid) || await fromUuid(previewUuid);
        if (item) {
            selectedItem = item.toObject();
            selectedItem.uuid = item.uuid;
            selectedItem.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
                item.system.description || "", { async: true, secrets: false, relativeTo: item }
            );
            
            const sys = item.system;
            if (item.type === 'ancestry') {
              selectedItem.traits = sys.traits || [];
              selectedItem.size = sys.size || 'medium';
              selectedItem.ancestryType = sys.ancestryType || 'Humanlike';
            }
            
            if (item.type === 'class') {
                const features = sys.levelFeatures || [];

                // Enrich each feature's description for display
                const enrichedFeatures = await Promise.all(features.map(async (feat) => {
                    const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
                        feat.description || '',
                        {
                            secrets: false,
                            rollData: item.getRollData(),
                            relativeTo: item,
                        }
                    );
                    return { ...feat, enrichedDescription };
                }));

                const grouped = enrichedFeatures.reduce((acc, feat) => {
                    const lvl = feat.level || 1;
                    if (!acc[lvl]) acc[lvl] = [];
                    acc[lvl].push(feat);
                    return acc;
                }, {});

                const manaMultiplier = sys.manaMultiplier || 2;
                const levelSpells = sys.levelSpells || [];

                selectedItem.levelGroups = Object.entries(grouped).map(([lvl, feats]) => {
                    const levelNum = parseInt(lvl);
                    // Find spells for this level
                    const spellData = levelSpells.find(ls => ls.level === levelNum);
                    const spells = spellData?.spells || 0;
                    const maxMana = manaMultiplier * levelNum;
                    return {
                        level: lvl,
                        isOpen: levelNum === 1,
                        features: feats,
                        spells: spells,
                        maxMana: maxMana
                    };
                }).sort((a, b) => a.level - b.level);

                const rawSkill = sys.manaSkill || "None";
                const localizedSkillKey = rawSkill.charAt(0).toUpperCase() + rawSkill.slice(1);

                classPreviewData = {
                    isSpellcaster: isSpellcaster ? "Yes" : "No",
                    manaSkill: localizedSkillKey,
                    manaMultiplier: sys.manaMultiplier || 2,
                    levelGroups: selectedItem.levelGroups
                };
            }

// Prepare detailed display stats based on equipment type
            const displayStats = {
                subType: sys.equipmentType || "",
                slots: sys.baseSlots || 0,
                cost: sys.baseCost || { gold: 0, silver: 0, copper: 0 }
            };

            // Add equipment-type-specific fields
            if (item.type === 'equipment') {
                const eqType = sys.equipmentType;

                // Weapons
                if (eqType === 'weapon') {
                    displayStats.weaponSkill = sys.weaponSkill || null;
                    displayStats.range = sys.range || null;
                    displayStats.grip = sys.grip || null;
                    displayStats.damage1h = sys.damageOneHand || null;
                    displayStats.damage2h = sys.damageTwoHands || null;
                    displayStats.damageType = sys.damageType || "-";
                    displayStats.damageTypeIcon = CONFIG.VAGABOND.damageTypeIcons?.[sys.damageType] || null;
                    displayStats.properties = sys.properties || [];
                    displayStats.propertiesWithHints = (sys.properties || []).map(prop => ({
                        name: prop,
                        label: CONFIG.VAGABOND.weaponProperties?.[prop] || prop,
                        hint: CONFIG.VAGABOND.weaponPropertyHints?.[prop] || ""
                    }));
                }

                // Armor
                else if (eqType === 'armor') {
                    displayStats.armorRating = sys.armorRating || 0;
                    displayStats.mightRequirement = sys.mightRequirement || 0;
                    displayStats.armorType = sys.armorType || null;
                    displayStats.armorTypeDescription = CONFIG.VAGABOND.armorTypeDescriptions?.[sys.armorType] || null;
                }

                // Alchemicals
                else if (eqType === 'alchemical') {
                    displayStats.alchemicalType = sys.alchemicalType || null;
                    displayStats.damage = sys.damage || null;
                    displayStats.damageType = sys.damageType || "-";
                    displayStats.damageTypeIcon = CONFIG.VAGABOND.damageTypeIcons?.[sys.damageType] || null;
                }

                // Relics
                else if (eqType === 'relic') {
                    displayStats.lore = sys.lore || null;
                    if (sys.lore) {
                        displayStats.enrichedLore = await foundry.applications.ux.TextEditor.enrichHTML(
                            sys.lore, { async: true, secrets: false, relativeTo: item }
                        );
                    }
                }

                // Gear - no additional fields needed beyond slots and cost
            }

            // Add spell-specific fields
            if (item.type === 'spell') {
                const damageType = sys.damageType || '-';
                displayStats.damageType = damageType;
                displayStats.damageTypeIcon = CONFIG.VAGABOND.damageTypeIcons?.[damageType] || null;
                displayStats.damageTypeLabel = damageType !== '-'
                    ? game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageType] || damageType)
                    : null;
                displayStats.crit = sys.crit || null;
            }

            selectedItem.displayStats = displayStats;
        }
    }

    // --- 7. TRAY DATA & STARTING PACK ---
    const trayData = await this._prepareTrayData();
    const startingPackItems = await this._getStartingPackItems();

    // --- 8. ECONOMY LOGIC ---
    let budget = 300; // Default 300 silver
    let currentSpending = 0;
    const packItem = validItems.find(i => i.uuid === this.builderData.startingPack);

    // Fix: Use currency field instead of non-existent startingSilver
    if (packItem && packItem.system.currency) {
      const curr = packItem.system.currency;
      budget = (curr.gold || 0) * 10 + (curr.silver || 0) + (curr.copper || 0) / 10;
    }

    // Calculate spending from gear in tray (exclude starting pack items)
    if (trayData.gear) {
      trayData.gear.forEach(item => {
        // Skip starting pack items - they don't count toward spending
        if (!item.fromStartingPack) {
          const goldInSilver = (item.cost?.gold || 0) * 10;
          currentSpending += goldInSilver + (item.cost?.silver || 0) + (item.cost?.copper || 0) / 10;
        }
      });
    }

    // Get spell limit for spells step
    const spellLimit = this.currentStep === 'spells' ? await this._getSpellLimit() : null;
    const currentSpellCount = this.currentStep === 'spells' ? this.builderData.spells.length : null;


    return {
      actor: previewActor,
      step: this.currentStep,
      steps: this._getStepsContext(),
      hasChoices: ['class', 'stats'].includes(this.currentStep),
      useTripleColumn: ['class', 'perks', 'spells'].includes(this.currentStep),
      options: availableOptions,
      selectedItem: selectedItem, // Always show preview if item is clicked
      previewUuid: this.builderData.previewUuid,
      classPreviewData,
      isSpellcaster, // Used for showing Mana in stats preview
      manaStats: {
          max: previewActor.system.mana?.max || 0,
          castingMax: previewActor.system.mana?.castingMax || 0
      },
      originRefs: await this._getOriginReferences(),
      classChoices: await this._prepareClassChoices(),
      statData: this._prepareStatsContext(previewActor),
      isGearStep: this.currentStep === 'gear',
      showTray: ['perks', 'spells', 'gear'].includes(this.currentStep),
      trayData,
      startingPackItems,
      budget: { 
        total: budget, 
        spent: currentSpending, 
        remaining: budget - currentSpending, 
        isOver: (budget - currentSpending) < 0 
      },
      instruction,
      spellLimit,
      currentSpellCount,
      // Randomization controls
      showRandomButton: ["ancestry", "class", "stats", "spells", "starting-packs"].includes(this.currentStep),
      showFullRandomButton: this.currentStep === "ancestry",
      canAdvance: this._isStepComplete(this.currentStep),
      canFinish: this._areMandatoryStepsComplete()
    };
  }

  _getStepsContext() {
    return this.constructor.STEPS_ORDER.map((id, i) => {
        // Disable steps based on completion of previous required steps
        let disabled = false;
        if (i > 0) {
            // Can't access step 2+ without completing step 1 (ancestry)
            if (!this.builderData.ancestry) disabled = true;
            // Can't access step 3+ without completing step 2 (class)
            else if (i >= 2 && !this.builderData.class) disabled = true;
            // Can't access step 4+ without completing step 3 (stats)
            else if (i >= 3 && !this._isStepComplete('stats')) disabled = true;
        }

        return {
            id,
            number: i + 1,
            label: `VAGABOND.CharBuilder.Steps.${id.charAt(0).toUpperCase() + id.slice(1).replace('-', '')}`,
            active: id === this.currentStep,
            disabled: disabled
        };
    });
  }

  async _prepareClassChoices() {
    if (this.currentStep !== 'class' || !this.builderData.class) return null;
    const item = await fromUuid(this.builderData.class);
    if (!item) return null;

    const grant = item.system.skillGrant;
    return {
      guaranteed: grant.guaranteed.map(s => ({ key: s, label: game.i18n.localize(CONFIG.VAGABOND.skills[s]) || s })),
      choices: grant.choices.map((c, i) => ({
        index: i, label: c.label, count: c.count,
        pool: (c.pool.length ? c.pool : Object.keys(CONFIG.VAGABOND.skills)).map(s => ({
            key: s, label: game.i18n.localize(CONFIG.VAGABOND.skills[s]) || s,
            selected: this.builderData.skills.includes(s),
            disabled: grant.guaranteed.includes(s)
        }))
      }))
    };
  }

  _prepareStatsContext(actor) {
    const labels = { might: "Might", dexterity: "Dexterity", awareness: "Awareness", reason: "Reason", presence: "Presence", luck: "Luck" };
    
    // Prepare Derived Data (Saves, Skills, Weapon Skills)
    const derived = {
        saves: [],
        skills: [],
        weaponSkills: [],
        hpTooltip: VagabondUIHelper.getAttributeTooltip('derived', 'hp', actor),
        luckTooltip: VagabondUIHelper.getAttributeTooltip('derived', 'luck', actor),
        inventoryTooltip: VagabondUIHelper.getAttributeTooltip('derived', 'inventory', actor),
        speedTooltip: VagabondUIHelper.getAttributeTooltip('derived', 'speed', actor),
        manaMaxTooltip: VagabondUIHelper.getAttributeTooltip('derived', 'manaMax', actor),
        manaCastTooltip: VagabondUIHelper.getAttributeTooltip('derived', 'manaCast', actor)
    };

    if (actor) {
        // Saves
        for (const [key, save] of Object.entries(actor.system.saves)) {
            let stats = [];
            if (key === 'reflex') stats = ['dexterity', 'awareness'];
            else if (key === 'endure') stats = ['might', 'might'];
            else if (key === 'will') stats = ['reason', 'presence'];

            const statAbbrs = stats.map(s => game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[s])).join('+');
            
            derived.saves.push({
                key,
                label: save.label,
                statAbbr: statAbbrs,
                value: save.difficulty,
                tooltip: VagabondUIHelper.getAttributeTooltip('save', key, actor)
            });
        }

        // Skills (Following en.json order or alphabetical)
        const skillKeys = Object.keys(CONFIG.VAGABOND.skills);
        for (const key of skillKeys) {
            const skill = actor.system.skills[key];
            if (!skill) continue;

            const statAbbr = game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[skill.stat]);

            derived.skills.push({
                key,
                label: skill.label,
                statAbbr: statAbbr,
                trained: skill.trained,
                value: skill.difficulty,
                tooltip: VagabondUIHelper.getAttributeTooltip('skill', key, actor)
            });
        }

        // Weapon Skills
        const weaponSkillKeys = ['melee', 'ranged', 'brawl', 'finesse']; // Core weapon skills
        for (const key of weaponSkillKeys) {
            const skill = actor.system.weaponSkills[key];
            if (!skill) continue;

            const statAbbr = game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[skill.stat]);

            derived.weaponSkills.push({
                key,
                label: skill.label,
                statAbbr: statAbbr,
                trained: skill.trained,
                value: skill.difficulty,
                tooltip: VagabondUIHelper.getAttributeTooltip('weaponSkill', key, actor)
            });
        }
    }

    // Update Primary Derived Stat Labels with Stat Abbreviations
    const migAbbr = game.i18n.localize(CONFIG.VAGABOND.statAbbreviations['might']);
    const dexAbbr = game.i18n.localize(CONFIG.VAGABOND.statAbbreviations['dexterity']);
    const lukAbbr = game.i18n.localize(CONFIG.VAGABOND.statAbbreviations['luck']);
    const castStat = actor?.system.attributes.castingStat;
    const castAbbr = castStat ? game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[castStat]) : '';

    derived.hp = { label: 'HP', statAbbr: migAbbr };
    derived.manaMax = { label: game.i18n.localize("VAGABOND.Actor.Character.FIELDS.mana.max.label"), statAbbr: castAbbr };
    derived.manaCast = { label: game.i18n.localize("VAGABOND.Actor.Character.FIELDS.mana.castingMax.label"), statAbbr: castAbbr };
    derived.luck = { label: 'Luck Pool', statAbbr: lukAbbr };
    derived.inventory = { label: 'Inventory', statAbbr: migAbbr };
    derived.speed = { label: 'Speed', statAbbr: dexAbbr };

    return {
      slots: Object.entries(this.builderData.stats).map(([key, value]) => ({ key, label: labels[key], value })),
      unassigned: this.builderData.unassignedValues.map((v, i) => ({ 
        value: v, 
        index: i, 
        active: this.builderData.selectedValue?.index === i 
      })),
      arrays: Object.entries(this.statArrays).map(([id, values]) => ({ 
        id, values: values.join(', '), 
        selected: this.builderData.selectedArrayId === id 
      })),
      derived
    };
  }

  async _loadStepOptions(stepOverride = null) {
    const step = stepOverride || this.currentStep;
    if (step === 'stats') return [];

    // Dynamically find all compendiums that contain the appropriate item type
    const typeMap = {
        'ancestry': 'ancestry',
        'class': 'class',
        'perks': 'perk',
        'spells': 'spell',
        'starting-packs': 'starterPack',
        'gear': 'equipment'
    };

    const targetType = typeMap[step];
    let packs = [];

    // Check cache first
    if (this.compendiumTypeCache[step]) {
      packs = this.compendiumTypeCache[step];
    } else {
      // Search all compendiums for matching item types (first time only)
      for (const pack of game.packs) {
        // Only include Item compendiums
        if (pack.metadata.type !== 'Item') continue;

        // Check if this compendium contains items of the target type
        const index = await pack.getIndex({ fields: ["type", "system.equipmentType"] });

        if (step === 'gear') {
          // For gear, check if any items are equipment type
          const hasEquipment = index.some(i => i.type === 'equipment');
          if (hasEquipment) packs.push(pack.metadata.id);
        } else {
          // For other steps, check for exact type match
          const hasType = index.some(i => i.type === targetType);
          if (hasType) packs.push(pack.metadata.id);
        }
      }

      // Cache the results
      this.compendiumTypeCache[step] = packs;
    }

    const results = [];

    for (const p of packs) {
      if (!this.indices[p]) {
        const pack = game.packs.get(p);
        if (pack) {
          // Include spell-specific fields in the index for spells step
          const fields = step === 'spells'
            ? ["img", "type", "system.damageType", "system.crit"]
            : ["img", "type", "system.baseCost", "system.baseSlots", "system.equipmentType"];
          const index = await pack.getIndex({ fields });
          this.indices[p] = { label: pack.metadata.label, id: pack.metadata.name, items: index };
        }
      }
      const cached = this.indices[p];
      if (!cached) continue;

      // Filter items by type for this step
      let filteredItems = cached.items;
      if (step === 'gear') {
        // Only show equipment items for gear step
        filteredItems = cached.items.filter(i => i.type === 'equipment');
      } else {
        // Only show items matching the target type
        filteredItems = cached.items.filter(i => i.type === targetType);
      }

      // Skip empty categories
      if (filteredItems.length === 0) continue;

      if (step === 'gear') {
        // Sort items alphabetically within each category
        const sortedItems = [...filteredItems].sort((a, b) => a.name.localeCompare(b.name));
        results.push({
            label: cached.label,
            id: cached.id,
            isOpen: this.openCategories.has(cached.id),
            items: sortedItems.map(i => ({
              ...i,
              selected: this.builderData.gear.includes(i.uuid),
              previewing: i.uuid === this.builderData.previewUuid
            }))
        });
      } else {
        const stepKey = step === 'starting-packs' ? 'startingPack' : step;
        // Sort items alphabetically
        const sortedItems = [...filteredItems].sort((a, b) => a.name.localeCompare(b.name));

        // For perks/spells (arrays), mark items that are in the tray
        if (['perks', 'spells'].includes(step)) {
          // For perks, check both class perks and manual perks
          const isInTray = step === 'perks'
            ? (uuid) => this.builderData.classPerks.includes(uuid) || this.builderData.perks.includes(uuid)
            : (uuid) => this.builderData[stepKey].includes(uuid);

          results.push(...sortedItems.map(i => {
            const baseData = {
              ...i,
              selected: isInTray(i.uuid),
              previewing: i.uuid === this.builderData.previewUuid
            };

            // Enrich spell items with damage type data
            if (step === 'spells' && i.system?.damageType) {
              const damageType = i.system.damageType;
              baseData.damageTypeIcon = CONFIG.VAGABOND.damageTypeIcons?.[damageType] || null;
              baseData.damageTypeLabel = damageType !== '-'
                ? game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageType] || damageType)
                : null;
            }

            return baseData;
          }));
        } else {
          // For single selections (ancestry, class, starting-packs)
          results.push(...sortedItems.map(i => ({
            ...i,
            selected: i.uuid === this.builderData[stepKey],
            previewing: i.uuid === this.builderData.previewUuid
          })));
        }
      }
    }
    return results;
  }

  async _getOriginReferences() {
    if (!['perks', 'spells'].includes(this.currentStep)) return null;
    const data = { ancestry: null, class: null };
    if (this.builderData.ancestry) {
      const item = await fromUuid(this.builderData.ancestry);
      if (item) data.ancestry = { name: item.name, traits: item.system.traits || [] };
    }
    if (this.builderData.class) {
      const item = await fromUuid(this.builderData.class);
      if (item) {
        const level1Features = (item.system.levelFeatures || []).filter(f => f.level === 1);
        // Enrich feature descriptions
        const enrichedFeatures = await Promise.all(level1Features.map(async (feat) => {
          const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
            feat.description || '',
            {
              secrets: false,
              rollData: item.getRollData(),
              relativeTo: item,
            }
          );
          return { ...feat, enrichedDescription };
        }));
        data.class = { name: item.name, features: enrichedFeatures };
      }
    }
    return data;
  }

  /**
   * Prepare tray data for perks, spells, and gear
   */
  async _prepareTrayData() {
    const stepKey = this.currentStep;
    const trayItems = [];

    if (stepKey === 'perks' || stepKey === 'spells') {
      // For perks, combine class perks and manual perks
      const uuids = stepKey === 'perks'
        ? [...new Set([...this.builderData.classPerks, ...this.builderData.perks])]
        : this.builderData[stepKey];

      for (const uuid of uuids) {
        const item = await fromUuid(uuid);
        if (item) {
          // Mark if this perk came from the class
          const isClassPerk = stepKey === 'perks' && this.builderData.classPerks.includes(uuid);
          trayItems.push({
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            type: item.type,
            isClassPerk: isClassPerk,
            canDelete: !isClassPerk // Can't delete class-granted perks
          });
        }
      }
    } else if (stepKey === 'gear') {
      const uuids = this.builderData.gear;
      for (const uuid of uuids) {
        const item = await fromUuid(uuid);
        if (item) {
          const cost = item.system.baseCost || {};
          trayItems.push({
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            type: item.type,
            slots: item.system.baseSlots || 0,
            cost: {
              gold: cost.gold || 0,
              silver: cost.silver || 0,
              copper: cost.copper || 0
            },
            costDisplay: this._formatCost(cost)
          });
        }
      }

      // Add starting pack items to gear tray
      if (this.builderData.startingPack) {
        const packData = await this._getStartingPackItems();
        if (packData?.items) {
          // Prepend starting pack items with special flags
          const packItems = packData.items.map(packItem => ({
            uuid: `${this.builderData.startingPack}-${packItem.name}`, // Unique ID for pack items
            name: packItem.name,
            img: packItem.img,
            type: 'equipment',
            slots: packItem.slots,
            cost: {
              gold: 0,
              silver: 0,
              copper: 0
            },
            costDisplay: '0s',
            qty: packItem.qty,
            fromStartingPack: true,
            canDelete: false
          }));
          trayItems.unshift(...packItems);
        }
      }
    }

    return {
      perks: stepKey === 'perks' ? trayItems : null,
      spells: stepKey === 'spells' ? trayItems : null,
      gear: stepKey === 'gear' ? trayItems : null,
      isEmpty: trayItems.length === 0,
      emptySlots: Array(Math.max(0, 8 - trayItems.length)).fill({})
    };
  }

  /**
   * Extract perk UUIDs from class level features
   * Parses @UUID[Compendium.vagabond.perks.Item.xxx]{Name} links
   * @returns {Array<string>} Array of perk UUIDs
   */
  async _extractPerksFromClass() {
    if (!this.builderData.class) return [];

    const classItem = await fromUuid(this.builderData.class);
    if (!classItem) return [];

    const features = classItem.system.levelFeatures || [];
    const perkUuids = [];

    // Regex to match @UUID[...] links in perk compendium
    const uuidRegex = /@UUID\[Compendium\.vagabond\.perks\.Item\.([^\]]+)\]/g;

    for (const feature of features) {
      const description = feature.description || '';
      let match;
      while ((match = uuidRegex.exec(description)) !== null) {
        const fullUuid = `Compendium.vagabond.perks.Item.${match[1]}`;
        if (!perkUuids.includes(fullUuid)) {
          perkUuids.push(fullUuid);
        }
      }
    }

    return perkUuids;
  }

  /**
   * Get the spell limit for level 1 from the selected class
   * @returns {number} Number of spells the character can learn at level 1
   */
  async _getSpellLimit() {
    if (!this.builderData.class) return 0;

    const classItem = await fromUuid(this.builderData.class);
    if (!classItem) return 0;

    // Check if class is a spellcaster
    if (!classItem.system.isSpellcaster) return 0;

    // Get level 1 spells from levelSpells array
    const levelSpells = classItem.system.levelSpells || [];
    const level1Data = levelSpells.find(ls => ls.level === 1);

    return level1Data?.spells || 0;
  }

  /**
   * Get starting pack items with details
   */
  async _getStartingPackItems() {
    if (!this.builderData.startingPack) return null;

    const packItem = await fromUuid(this.builderData.startingPack);
    if (!packItem) return null;

    const packItems = packItem.system.items || [];
    const itemDetails = [];

    for (const packItemEntry of packItems) {
      const item = await fromUuid(packItemEntry.uuid);
      if (item) {
        const cost = item.system.baseCost || {};
        itemDetails.push({
          name: item.name,
          img: item.img,
          slots: item.system.baseSlots || 0,
          qty: packItemEntry.quantity || 1,
          costDisplay: this._formatCost(cost)
        });
      }
    }

    return {
      packName: packItem.name,
      startingSilver: (() => { const curr = packItem.system.currency || {}; return (curr.gold || 0) * 10 + (curr.silver || 0) + (curr.copper || 0) / 10; })(),
      items: itemDetails
    };
  }

  /**
   * Format cost for display (only show non-zero values)
   */
  _formatCost(cost = {}) {
    const parts = [];
    if (cost.gold > 0) parts.push(`${cost.gold}g`);
    if (cost.silver > 0) parts.push(`${cost.silver}s`);
    if (cost.copper > 0) parts.push(`${cost.copper}c`);
    return parts.join(' ') || '0s';
  }

  /** @override */
  _onRender(context, options) {
    const html = this.element;

    // Search input filter
    const searchInput = html.querySelector('.search-input');
    const searchClear = html.querySelector('.search-clear');

    if (searchInput) {
      searchInput.addEventListener('input', (ev) => {
        this._onFilterList(ev, ev.target);
        // Show/hide clear button based on input
        if (searchClear) {
          searchClear.style.display = ev.target.value ? 'flex' : 'none';
        }
      });
    }

    if (searchClear) {
      searchClear.style.display = 'none'; // Hidden by default
      searchClear.addEventListener('click', (ev) => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input')); // Trigger filter update
          searchInput.focus();
        }
      });
    }

    // UNIVERSAL: Attach click handlers to ALL directory items for preview
    const allDirectoryItems = html.querySelectorAll('.directory-item[data-uuid]');
    allDirectoryItems.forEach(item => {
      item.addEventListener('click', (ev) => {
        const uuid = ev.currentTarget.dataset.uuid;
        this.builderData.previewUuid = uuid;
        this.render();
      });
    });

    // 1. Draggable Chips Initialization
    const chips = html.querySelectorAll('.value-chip');
    chips.forEach(chip => {
        chip.setAttribute('draggable', 'true');
        
        chip.addEventListener('dragstart', (ev) => {
            const target = ev.currentTarget; 
           
            const transfer = { 
                index: target.dataset.index, 
                value: target.dataset.value 
            };
            
            ev.dataTransfer.setData("text/plain", JSON.stringify(transfer));
            ev.dataTransfer.effectAllowed = "move"; 
            target.classList.add('dragging');
        });

        chip.addEventListener('dragend', (ev) => {
            ev.currentTarget.classList.remove('dragging');
        });
    });

    // 2. Drop Zones (Stat Slots) Initialization
    const slots = html.querySelectorAll('.stat-slot');

    slots.forEach(slot => {
        slot.addEventListener('dragover', (ev) => {
            ev.preventDefault(); // Necessary to allow dropping
            ev.dataTransfer.dropEffect = "move";
        });

        slot.addEventListener('dragenter', (ev) => ev.currentTarget.classList.add('drag-over'));
        slot.addEventListener('dragleave', (ev) => ev.currentTarget.classList.remove('drag-over'));

        slot.addEventListener('drop', (ev) => {
            ev.preventDefault();
            ev.currentTarget.classList.remove('drag-over');

            try {
                const rawData = ev.dataTransfer.getData("text/plain");
                if (!rawData) {
                    console.warn("Vagabond | No data found in drop event.");
                    return;
                }

                const data = JSON.parse(rawData);
                const statKey = ev.currentTarget.dataset.stat;
                
                this._assignStatValue(statKey, parseInt(data.value), parseInt(data.index));
            } catch (err) { 
                console.error("Vagabond | Drag drop failed with error:", err); 
            }
        });
    });

    // 3. Tray drag-drop for perks/spells/gear
    if (['perks', 'spells', 'gear'].includes(this.currentStep)) {
      // Make selection list items draggable
      const selectableItems = html.querySelectorAll('.directory-item[data-uuid]');
      selectableItems.forEach(item => {
        item.setAttribute('draggable', 'true');

        item.addEventListener('dragstart', (ev) => {
          const uuid = ev.currentTarget.dataset.uuid;
          ev.dataTransfer.setData('text/plain', JSON.stringify({ uuid, type: 'item' }));
          ev.dataTransfer.effectAllowed = 'copy';
          ev.currentTarget.classList.add('dragging');
        });

        item.addEventListener('dragend', (ev) => {
          ev.currentTarget.classList.remove('dragging');
        });
      });
      
      // Make tray grid a drop zone
      const trayGrid = html.querySelector('.tray-items-grid');
      if (trayGrid) {
        trayGrid.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
          trayGrid.classList.add('drag-over');
        });

        trayGrid.addEventListener('dragleave', (ev) => {
          if (ev.currentTarget === ev.target) {
            trayGrid.classList.remove('drag-over');
          }
        });
        
        trayGrid.addEventListener('drop', (ev) => {
          ev.preventDefault();
          trayGrid.classList.remove('drag-over');
          
          try {
            const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
            if (data.type === 'item' && data.uuid) {
              // Trigger add to tray
              this._onAddToTray({}, { dataset: { uuid: data.uuid } });
            }
          } catch (err) {
            console.error("Vagabond | Drag drop failed:", err);
          }
        });
      }
    }
  }

  /**
   * Internal helper to handle the logic of assigning a value to a stat slot.
   * @param {string} statKey - The attribute key (e.g., 'might')
   * @param {number} value - The numeric value being assigned
   * @param {number} poolIndex - The index of the value in the unassigned pool
   */
  _assignStatValue(statKey, value, poolIndex) {
      // 1. Validation: Ensure we have a valid number and index
      if (isNaN(value) || isNaN(poolIndex)) {
          console.error("Vagabond | Validation Failed: Value or PoolIndex is NaN");
          return;
      }

      // 2. Handle Reassignment: If the slot already has a value, return it to the pool
      const previousValue = this.builderData.stats[statKey];
      if (previousValue !== null) {
          this.builderData.unassignedValues.push(previousValue);
      }

      // 3. Update the Stat: Set the new value to the chosen attribute
      this.builderData.stats[statKey] = value;

      // 4. Remove from Pool: Remove the specific value used from the unassigned list
      // We use the index to ensure we remove the exact 'chip' the user dragged
      if (poolIndex >= 0 && poolIndex < this.builderData.unassignedValues.length) {
          this.builderData.unassignedValues.splice(poolIndex, 1);
      } else {
          // Fallback: if index is lost for some reason, find the first matching value
          const fallbackIndex = this.builderData.unassignedValues.indexOf(value);
          if (fallbackIndex > -1) this.builderData.unassignedValues.splice(fallbackIndex, 1);
      }

      // 5. Cleanup: Clear any active selection state and re-render
      this.builderData.selectedValue = null;
      this.render();
  }

  // ACTION HANDLERS
  _onNext(event, target) {
      // Check if current step is complete before advancing
      if (!this._isStepComplete(this.currentStep)) {
          ui.notifications.warn("Complete the current step before advancing.");
          return;
      }

      const idx = this.constructor.STEPS_ORDER.indexOf(this.currentStep);
      if (idx < this.constructor.STEPS_ORDER.length - 1) {
          this.currentStep = this.constructor.STEPS_ORDER[idx + 1];
          this.builderData.previewUuid = null;
          this.render();
      }
  }

  _onPrev(event, target) {
      const idx = this.constructor.STEPS_ORDER.indexOf(this.currentStep);
      if (idx > 0) {
          this.currentStep = this.constructor.STEPS_ORDER[idx - 1];
          this.builderData.previewUuid = null;
          this.render();
      }
  }

  _onSelectOption(event, target) {
      const uuid = target.dataset.uuid;
      // ALWAYS set preview
      this.builderData.previewUuid = uuid;

      // Special handling for stats step
      if (this.currentStep === 'stats') {
          const id = target.dataset.id;
          this.builderData.selectedArrayId = id;
          this.builderData.unassignedValues = [...this.statArrays[id]];
          this.builderData.stats = { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null };
      }
      // For single-selection steps (ancestry, class, starting-packs)
      else if (['ancestry', 'class', 'starting-packs'].includes(this.currentStep)) {
          const stepKey = this.currentStep === 'starting-packs' ? 'startingPack' : this.currentStep;
          this.builderData[stepKey] = uuid;
      }
      // For tray steps (perks, spells, gear) - ONLY PREVIEW, DO NOT ADD TO TRAY
      // Add to tray is done via drag-drop or "Add to Tray" button only

      this.render();
  }

  // Add to Tray action handler
  async _onAddToTray(event, target) {
      const uuid = target.dataset.uuid;
      if (!uuid) return;

      const stepKey = this.currentStep;

      // Validate we're on a tray step
      if (!['perks', 'spells', 'gear'].includes(stepKey)) return;

      // Check if already in tray (for perks, check both class perks and manual perks)
      const isInTray = stepKey === 'perks'
        ? this.builderData.classPerks.includes(uuid) || this.builderData.perks.includes(uuid)
        : this.builderData[stepKey].includes(uuid);

      if (isInTray) {
          ui.notifications.warn("This item is already in your tray.");
          return;
      }

      // For spells, check the spell limit
      if (stepKey === 'spells') {
          const spellLimit = await this._getSpellLimit();
          const currentSpellCount = this.builderData.spells.length;

          if (currentSpellCount >= spellLimit) {
              ui.notifications.error(`You can only learn ${spellLimit} spell${spellLimit !== 1 ? 's' : ''} at level 1. Remove a spell first.`);
              return; // Block adding more spells
          }
      }

      // For gear, check budget and warn if overspending
      if (stepKey === 'gear') {
          const newItem = await fromUuid(uuid);
          if (newItem && newItem.type === 'equipment') {
              const itemCost = (newItem.system.baseCost?.gold || 0) * 10 + (newItem.system.baseCost?.silver || 0) + (newItem.system.baseCost?.copper || 0) / 10;

              // Calculate current budget
              let budget = 300;
              const packItem = await fromUuid(this.builderData.startingPack);
              if (packItem && packItem.system.currency) {
                  const curr = packItem.system.currency;
                  budget = (curr.gold || 0) * 10 + (curr.silver || 0) + (curr.copper || 0) / 10;
              }

              // Calculate current spending
              let currentSpending = 0;
              for (const gearUuid of this.builderData.gear) {
                  const gearItem = await fromUuid(gearUuid);
                  if (gearItem?.type === 'equipment') {
                      currentSpending += (gearItem.system.baseCost?.gold || 0) * 10 + (gearItem.system.baseCost?.silver || 0) + (gearItem.system.baseCost?.copper || 0) / 10;
                  }
              }

              const newTotal = currentSpending + itemCost;
              if (newTotal > budget) {
                  const overage = Math.round((newTotal - budget) * 10) / 10; // Round to 1 decimal
                  ui.notifications.warn(`You would be ${overage}s over budget! Remove items or change your starting pack.`);
                  // Still allow adding (don't return), just warn
              }
          }
      }

      // Add to tray
      this.builderData[stepKey].push(uuid);

      // Render to update tray display
      this.render();
  }

  // Remove from Tray action handler
  _onRemoveFromTray(event, target) {
      const uuid = target.dataset.uuid;
      if (!uuid) return;

      const stepKey = this.currentStep;

      // For perks, prevent removing class-granted perks
      if (stepKey === 'perks' && this.builderData.classPerks.includes(uuid)) {
          ui.notifications.warn("This perk is granted by your class and cannot be removed.");
          return;
      }

      // Remove from appropriate array
      if (this.builderData[stepKey]) {
          this.builderData[stepKey] = this.builderData[stepKey].filter(u => u !== uuid);
      }

      // If this was the previewed item, clear preview
      if (this.builderData.previewUuid === uuid) {
          this.builderData.previewUuid = null;
      }

      this.render();
  }

  // Clear Tray action handler
  async _onClearTray(event, target) {
      const stepKey = this.currentStep;

      // Confirm before clearing (unless empty)
      if (this.builderData[stepKey]?.length > 0) {
          const confirmed = await Dialog.confirm({
              title: "Clear Tray?",
              content: `<p>Remove all items from your ${stepKey} tray?</p>`
          });

          if (confirmed) {
              this.builderData[stepKey] = [];
              this.builderData.previewUuid = null;
              this.render();
          }
      }
  }

  async _onRemoveStartingPack(event, target) {
      if (!this.builderData.startingPack) return;

      const confirmed = await Dialog.confirm({
          title: "Remove Starting Pack?",
          content: "<p>This will remove the selected starting pack and return to the default budget.</p>"
      });

      if (confirmed) {
          this.builderData.startingPack = null;
          this.builderData.previewUuid = null;
          this.render();
      }
  }

  _onPickValue(event, target) {
      const index = parseInt(target.dataset.index);
      this.builderData.selectedValue = { value: this.builderData.unassignedValues[index], index };
      this.render();
  }

  _onAssignStat(event, target) {
    if (!this.builderData.selectedValue) return;
    this._assignStatValue(target.dataset.stat, this.builderData.selectedValue.value, this.builderData.selectedValue.index);
  }

  async _onToggleSkill(event, target) {
    const skill = target.value;
    const item = await fromUuid(this.builderData.class);
    if (!item) return;

    const grant = item.system.skillGrant;
    if (grant.guaranteed.includes(skill)) return this.render();

    const poolIndex = grant.choices.findIndex(c => c.pool.includes(skill) || c.pool.length === 0);
    if (poolIndex === -1) return;

    const choiceLimit = grant.choices[poolIndex].count;
    const selectedFromPool = this.builderData.skills.filter(s => {
        const pool = grant.choices[poolIndex].pool;
        return pool.length ? pool.includes(s) : true;
    });

    if (this.builderData.skills.includes(skill)) {
      this.builderData.skills = this.builderData.skills.filter(s => s !== skill);
    } else if (selectedFromPool.length < choiceLimit) {
      this.builderData.skills.push(skill);
    } else {
      ui.notifications.warn(`You can only choose ${choiceLimit} skills from this category.`);
    }
    this.render();
  }

  async _onRandomize() {
    // Step-by-step randomization based on current step
    switch (this.currentStep) {
      case 'ancestry':
        await this._randomizeAncestry();
        break;
      case 'class':
        await this._randomizeClass();
        break;
      case 'stats':
        await this._randomizeStats(false); // false = don't auto-assign
        break;
      case 'spells':
        await this._randomizeSpells();
        break;
      case 'starting-packs':
        await this._randomizeStartingPack();
        break;
    }
    this.render();
  }

  _onResetStats() {
    if (!this.builderData.selectedArrayId) return;
    this.builderData.unassignedValues = [...this.statArrays[this.builderData.selectedArrayId]];
    this.builderData.stats = { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null };
    this.render();
  }

  _onToggleCategory(event, target) {
      const id = target.dataset.category;
      if (this.openCategories.has(id)) this.openCategories.delete(id); else this.openCategories.add(id);
      this.render();
  }

  _onFilterList(event, target) {
    const query = target.value.toLowerCase().trim();
    const html = this.element;

    if (this.currentStep === 'gear') {
      // For gear step with accordions, filter items within each category
      const accordions = html.querySelectorAll('.gear-accordion');
      accordions.forEach(accordion => {
        const items = accordion.querySelectorAll('.directory-item');
        let hasVisibleItems = false;

        items.forEach(item => {
          const name = item.querySelector('.name')?.textContent.toLowerCase() || '';
          if (!query || name.includes(query)) {
            item.style.display = '';
            hasVisibleItems = true;
          } else {
            item.style.display = 'none';
          }
        });

        // Hide entire accordion if no items match
        if (query && !hasVisibleItems) {
          accordion.style.display = 'none';
        } else {
          accordion.style.display = '';
        }
      });
    } else {
      // For non-gear steps, filter directory items directly
      const items = html.querySelectorAll('.directory-list > .directory-item');
      items.forEach(item => {
        // For stats step, check array values; for other steps, check name
        const name = item.querySelector('.name')?.textContent.toLowerCase() || '';
        const arrayValues = item.querySelector('.array-values')?.textContent.toLowerCase() || '';
        const searchText = name || arrayValues;

        if (!query || searchText.includes(query)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    }
  }

  _onGoToStep(event, target) {
    const requestedStep = target.dataset.step;
    const steps = this._getStepsContext();
    const stepData = steps.find(s => s.id === requestedStep);

    // Prevent navigation to disabled steps
    if (stepData && stepData.disabled) {
        ui.notifications.warn("Complete the required steps before accessing this step.");
        return;
    }

    this.currentStep = requestedStep;

    // Clear the active preview item so it doesn't bleed into the next tab
    this.builderData.previewUuid = null;

    this.render();
}

  async _onFinish() {
    // Validate mandatory steps are complete
    if (!this._areMandatoryStepsComplete()) {
        ui.notifications.error("You must complete Ancestry, Class, and Stats before finishing character creation.");
        return;
    }

    const actor = this.actor;
    const data = this.builderData;
    
    // 1. Initial Update: Stats & Currency
    const updateData = {
        "system.stats.might.value": data.stats.might,
        "system.stats.dexterity.value": data.stats.dexterity,
        "system.stats.awareness.value": data.stats.awareness,
        "system.stats.reason.value": data.stats.reason,
        "system.stats.presence.value": data.stats.presence,
        "system.stats.luck.value": data.stats.luck,
        "system.details.constructed": true 
    };

    const itemsToCreate = [];
    const addByUuid = async (uuid) => {
        const item = await fromUuid(uuid);
        if (item) itemsToCreate.push(item.toObject());
    };

    if (data.ancestry) await addByUuid(data.ancestry);
    
    // Get class item for later skill check
    let classItem = null;
    if (data.class) {
        await addByUuid(data.class);
        classItem = await fromUuid(data.class);
    }

    // Handle starting pack - add the pack itself AND extract its items
    if (data.startingPack) {
        await addByUuid(data.startingPack);

        // Extract items from the starting pack and add them
        const packItem = await fromUuid(data.startingPack);
        if (packItem && packItem.system.items) {
            for (const packItemEntry of packItem.system.items) {
                const gearItem = await fromUuid(packItemEntry.uuid);
                if (gearItem) {
                    const gearObj = gearItem.toObject();
                    // Set quantity if specified in the pack
                    if (packItemEntry.quantity && packItemEntry.quantity > 1) {
                        gearObj.system.quantity = packItemEntry.quantity;
                    }
                    itemsToCreate.push(gearObj);
                }
            }
        }

        // Add starting pack currency to character
        if (packItem && packItem.system.currency) {
            const curr = packItem.system.currency;
            updateData["system.currency.gold"] = (curr.gold || 0);
            updateData["system.currency.silver"] = (curr.silver || 0);
            updateData["system.currency.copper"] = (curr.copper || 0);
        }
    }

    // Combine class perks and manual perks
    const allPerks = [...new Set([...data.classPerks, ...data.perks])];
    for (const uuid of [...allPerks, ...data.spells, ...data.gear]) await addByUuid(uuid);

    // FIX: Auto-equip items and favorite spells
    itemsToCreate.forEach(item => {
        // Auto-favorite spells
        if (item.type === 'spell') {
            foundry.utils.setProperty(item, 'system.favorite', true);
        } 
        // Auto-equip Armor
        else if (item.type === 'armor') {
            foundry.utils.setProperty(item, 'system.equipped', true);
        } 
        else if (item.type === 'equipment' && item.system.equipmentType === 'armor') {
            foundry.utils.setProperty(item, 'system.equipped', true);
        } 
        // Auto-equip Weapons
        else if (item.type === 'weapon' || (item.type === 'equipment' && item.system.equipmentType === 'weapon')) {
            const grip = item.system.grip;
            // Default to oneHand unless it's strictly 2H
            const state = (grip === '2H') ? 'twoHands' : 'oneHand';
            foundry.utils.setProperty(item, 'system.equipmentState', state);
            // Also set equipped flag for compatibility
            foundry.utils.setProperty(item, 'system.equipped', true);
        }
    });

    // Execute first update (Stats) and Item Creation
    await actor.update(updateData);
    await actor.createEmbeddedDocuments("Item", itemsToCreate);

    // 2. Final Update: Skills & Derived Pools (HP, Luck, Mana)
    // We do this AFTER item creation so that derived data (like Max HP from perks/stats) is accurate
    const finalUpdates = {};

    // Merge guaranteed class skills with selected skills
    const skillsToTrain = [...data.skills];
    if (classItem) {
        const guaranteed = classItem.system.skillGrant?.guaranteed || [];
        for (const s of guaranteed) {
            if (!skillsToTrain.includes(s)) skillsToTrain.push(s);
        }
    }
    
    for (const sKey of skillsToTrain) {
        // Check and update standard skills
        if (actor.system.skills && sKey in actor.system.skills) {
            finalUpdates[`system.skills.${sKey}.trained`] = true;
        }
        // Check and update weapon skills (e.g., melee, ranged)
        if (actor.system.weaponSkills && sKey in actor.system.weaponSkills) {
            finalUpdates[`system.weaponSkills.${sKey}.trained`] = true;
        }
    }

    // Set Pools to Max
    // HP: Use the now-calculated max from the actor
    finalUpdates["system.health.value"] = actor.system.health.max;
    
    // Luck: Use the Luck stat value (which is the max for the pool)
    finalUpdates["system.currentLuck"] = actor.system.stats.luck.value;

    // Mana: If spellcaster, set to max
    if (actor.system.attributes.isSpellcaster) {
        finalUpdates["system.mana.current"] = actor.system.mana.max;
    }

    await actor.update(finalUpdates);

    ui.notifications.info(`Character ${actor.name} successfully created!`);
    this.close();
  }

  async _onDismissBuilder() {
    // Confirm dismissal
    const confirmed = await Dialog.confirm({
      title: "Dismiss Character Builder",
      content: `<p>Are you sure you want to dismiss the character builder?</p>
                <p>You can still manually build your character using the normal character sheet.</p>
                <p><strong>This action cannot be undone.</strong></p>`,
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      await this.actor.update({ "system.details.builderDismissed": true });
      ui.notifications.info("Character builder dismissed. You can use the normal character sheet to build your character.");
      this.close();
    }
  }

  // RANDOMIZATION METHODS

  /**
   * Full random character generation - one click creates entire character
   */
  async _onRandomizeFullCharacter() {
    // Step 1: Ancestry (weighted)
    await this._randomizeAncestry();

    // Step 2: Class (equal weight)
    await this._randomizeClass();

    // Step 3: Stats (auto-assign)
    await this._randomizeStats(true); // true = auto-assign

    // Step 4: Perks - skip, already set by class

    // Step 5: Spells (4 random)
    await this._randomizeSpells();

    // Step 6: Starting Pack (1 random)
    await this._randomizeStartingPack();

    // Step 7: Gear - skip, starting pack is enough

    ui.notifications.info("Full random character generated!");
    this.render();
  }

  /**
   * Randomize ancestry with weighted distribution
   * Human: 5/8, Dwarf: 1/8, Elf: 1/8, Halfling: 1/8
   */
  async _randomizeAncestry() {
    const options = await this._loadStepOptions('ancestry');
    if (options.length === 0) return;

    // Create weighted array based on d8 distribution
    const weightedNames = {
      'Human': 5,
      'Dwarf': 1,
      'Elf': 1,
      'Halfling': 1
    };

    // Build weighted pool
    const weightedPool = [];
    options.forEach(option => {
      const weight = weightedNames[option.name] || 0;
      for (let i = 0; i < weight; i++) {
        weightedPool.push(option);
      }
    });

    if (weightedPool.length === 0) {
      // Fallback: equal distribution if names don't match
      const randomIndex = Math.floor(Math.random() * options.length);
      this.builderData.ancestry = options[randomIndex].uuid;
    } else {
      const randomIndex = Math.floor(Math.random() * weightedPool.length);
      this.builderData.ancestry = weightedPool[randomIndex].uuid;
    }

    this.builderData.previewUuid = this.builderData.ancestry;
  }

  /**
   * Randomize class - equal weight for all 18 classes
   */
  async _randomizeClass() {
    const options = await this._loadStepOptions('class');
    if (options.length === 0) return;

    const randomIndex = Math.floor(Math.random() * options.length);
    this.builderData.class = options[randomIndex].uuid;
    this.builderData.previewUuid = this.builderData.class;

    // Auto-select guaranteed skills
    const classItem = await fromUuid(this.builderData.class);
    if (classItem) {
      const grant = classItem.system.skillGrant;
      this.builderData.skills = [...grant.guaranteed];

      // Auto-select random skills from choices
      for (const choice of grant.choices) {
        const pool = choice.pool.length ? choice.pool : Object.keys(CONFIG.VAGABOND.skills);
        const available = pool.filter(s => !this.builderData.skills.includes(s));
        const shuffled = available.sort(() => Math.random() - 0.5);
        this.builderData.skills.push(...shuffled.slice(0, choice.count));
      }
    }
  }

  /**
   * Randomize stats - choose random array and optionally auto-assign
   * @param {boolean} autoAssign - If true, automatically assign values in order
   */
  async _randomizeStats(autoAssign = false) {
    // Roll 1d12 to select stat array
    const roll = await new Roll("1d12").evaluate();
    this.builderData.selectedArrayId = String(roll.total);
    this.builderData.unassignedValues = [...this.statArrays[roll.total]];

    if (autoAssign) {
      // Auto-assign in order: Might, Dexterity, Awareness, Reason, Presence, Luck
      const statOrder = ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];
      const values = [...this.statArrays[roll.total]];

      this.builderData.stats = {};
      statOrder.forEach((stat, index) => {
        this.builderData.stats[stat] = values[index];
      });

      this.builderData.unassignedValues = [];
    } else {
      // Just select array, player will assign
      this.builderData.stats = { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null };
    }
  }

  /**
   * Randomize 4 spells from available spell list
   */
  async _randomizeSpells() {
    const options = await this._loadStepOptions('spells');
    if (options.length === 0) return;

    // Get spell limit from class
    const spellLimit = await this._getSpellLimit();
    if (spellLimit === 0) {
      ui.notifications.warn("Your class does not grant spells at level 1.");
      return;
    }

    // Clear current spells
    this.builderData.spells = [];

    // Shuffle and pick spells up to the limit
    const shuffled = options.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, spellLimit);

    this.builderData.spells = selected.map(s => s.uuid);

    if (selected.length > 0) {
      this.builderData.previewUuid = selected[0].uuid;
    }
  }

  /**
   * Randomize starting pack - equal weight for all 36 packs
   */
  async _randomizeStartingPack() {
    const options = await this._loadStepOptions('starting-packs');
    if (options.length === 0) return;

    const randomIndex = Math.floor(Math.random() * options.length);
    this.builderData.startingPack = options[randomIndex].uuid;
    this.builderData.previewUuid = this.builderData.startingPack;
  }

  /**
   * Check if current step is completed
   */
  _isStepComplete(step) {
    switch (step) {
      case 'ancestry':
        return !!this.builderData.ancestry;
      case 'class':
        return !!this.builderData.class;
      case 'stats':
        // Stats complete when all 6 values are assigned
        return Object.values(this.builderData.stats).every(v => v !== null);
      case 'perks':
        // Perks are optional
        return true;
      case 'spells':
        // Spells are optional
        return true;
      case 'starting-packs':
        // Starting packs are optional
        return true;
      case 'gear':
        // Gear is optional
        return true;
      default:
        return true;
    }
  }

  /**
   * Check if mandatory steps are complete (steps 1, 2, 3)
   */
  _areMandatoryStepsComplete() {
    return this._isStepComplete('ancestry') &&
           this._isStepComplete('class') &&
           this._isStepComplete('stats');
  }
}
