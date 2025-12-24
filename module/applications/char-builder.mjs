/**
 * Vagabond Character Builder - Core Logic
 * Implementation for Foundry VTT v13+ using ApplicationV2.
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
      perks: [],      // Perks in tray
      spells: [],     // Spells in tray
      startingPack: null,
      gear: [],       // Gear in tray (includes starting pack items if selected)
      previewUuid: null,
      selectedArrayId: null,
      unassignedValues: [],
      selectedValue: null
    };

    this.openCategories = new Set();
    this.indices = {};

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
      pickValue: VagabondCharBuilder.prototype._onPickValue,
      assignStat: VagabondCharBuilder.prototype._onAssignStat,
      toggleSkill: VagabondCharBuilder.prototype._onToggleSkill,
      resetStats: VagabondCharBuilder.prototype._onResetStats,
      addToTray: VagabondCharBuilder.prototype._onAddToTray,
      removeFromTray: VagabondCharBuilder.prototype._onRemoveFromTray,
      clearTray: VagabondCharBuilder.prototype._onClearTray,
      finish: VagabondCharBuilder.prototype._onFinish
    }
  };

  static PARTS = { form: { template: "systems/vagabond/templates/apps/char-builder.hbs" } };

  /** @override */
  async _prepareContext(options) {
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
    const instruction = !hasSelection ? game.i18n.localize(`VAGABOND.CharBuilder.Instructions.${locId}`) : null;
        
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

    // --- 3. INJECT ITEMS ---
    const itemUuids = [
        this.builderData.ancestry,
        this.builderData.class,
        this.builderData.startingPack,
        ...this.builderData.perks,
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
            if (item.type === 'ancestry') selectedItem.traits = sys.traits || [];
            
            if (item.type === 'class') {
                const features = sys.levelFeatures || [];
                const grouped = features.reduce((acc, feat) => {
                    const lvl = feat.level || 1;
                    if (!acc[lvl]) acc[lvl] = [];
                    acc[lvl].push(feat);
                    return acc;
                }, {});

                selectedItem.levelGroups = Object.entries(grouped).map(([lvl, feats]) => ({
                    level: lvl, 
                    isOpen: parseInt(lvl) === 1, 
                    features: feats
                })).sort((a, b) => a.level - b.level);

                const rawSkill = sys.manaSkill || "None";
                const localizedSkillKey = rawSkill.charAt(0).toUpperCase() + rawSkill.slice(1);

                classPreviewData = {
                    isSpellcaster: isSpellcaster ? "Yes" : "No",
                    manaSkill: localizedSkillKey,
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
                if (eqType === 'weapons') {
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
                }

                // Alchemicals
                else if (eqType === 'alchemical-items') {
                    displayStats.alchemicalType = sys.alchemicalType || null;
                    displayStats.damage = sys.damage || null;
                    displayStats.damageType = sys.damageType || "-";
                    displayStats.damageTypeIcon = CONFIG.VAGABOND.damageTypeIcons?.[sys.damageType] || null;
                }

                // Relics
                else if (eqType === 'relics') {
                    displayStats.lore = sys.lore || null;
                    if (sys.lore) {
                        displayStats.enrichedLore = await foundry.applications.ux.TextEditor.enrichHTML(
                            sys.lore, { async: true, secrets: false, relativeTo: item }
                        );
                    }
                }

                // Gear - no additional fields needed beyond slots and cost
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


    return {
      actor: previewActor,
      step: this.currentStep,
      steps: this._getStepsContext(),
      hasChoices: ['class', 'stats'].includes(this.currentStep),
      useTripleColumn: ['class', 'perks', 'spells'].includes(this.currentStep),
      options: availableOptions,
      selectedItem: instruction ? null : selectedItem,
      classPreviewData,
      isSpellcaster, // Used for showing Mana in stats preview
      manaStats: {
          max: previewActor.system.mana?.max || 0,
          castingMax: previewActor.system.mana?.castingMax || 0
      },
      originRefs: await this._getOriginReferences(),
      classChoices: await this._prepareClassChoices(),
      statData: this._prepareStatsContext(),
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
      instruction
    };
  }

  _getStepsContext() {
    return this.constructor.STEPS_ORDER.map((id, i) => ({
        id, number: i + 1, label: `VAGABOND.CharBuilder.Steps.${id.charAt(0).toUpperCase() + id.slice(1).replace('-', '')}`,
        active: id === this.currentStep,
        disabled: i > 0 && !this.builderData.ancestry
    }));
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

  _prepareStatsContext() {
    const labels = { might: "Might", dexterity: "Dexterity", awareness: "Awareness", reason: "Reason", presence: "Presence", luck: "Luck" };
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
      }))
    };
  }

  async _loadStepOptions() {
    if (this.currentStep === 'stats') return [];
    const packMap = {
        'ancestry': ['vagabond.ancestries'],
        'class': ['vagabond.classes'],
        'perks': ['vagabond.perks'],
        'spells': ['vagabond.spells'],
        'starting-packs': ['vagabond.starting-packs'],
        'gear': ['vagabond.alchemical-items', 'vagabond.armor', 'vagabond.gear', 'vagabond.weapons', 'vagabond.relics']
    };
    const packs = packMap[this.currentStep] || [];
    const results = [];

    for (const p of packs) {
      if (!this.indices[p]) {
        const pack = game.packs.get(p);
        if (pack) {
          const index = await pack.getIndex({ fields: ["img", "type", "system.baseCost", "system.baseSlots"] });
          this.indices[p] = { label: pack.metadata.label, id: pack.metadata.name, items: index };
        }
      }
      const cached = this.indices[p];
      if (!cached) continue;

      if (this.currentStep === 'gear') {
        // Sort items alphabetically within each category
        const sortedItems = [...cached.items].sort((a, b) => a.name.localeCompare(b.name));
        results.push({
            label: cached.label,
            id: cached.id,
            isOpen: this.openCategories.has(cached.id),
            items: sortedItems.map(i => ({ ...i, selected: this.builderData.gear.includes(i.uuid) }))
        });
      } else {
        const stepKey = this.currentStep === 'starting-packs' ? 'startingPack' : this.currentStep;
        // Sort items alphabetically
        const sortedItems = [...cached.items].sort((a, b) => a.name.localeCompare(b.name));

        // For perks/spells (arrays), mark items that are in the tray
        if (['perks', 'spells'].includes(this.currentStep)) {
          results.push(...sortedItems.map(i => ({ ...i, selected: this.builderData[stepKey].includes(i.uuid) })));
        } else {
          // For single selections (ancestry, class, starting-packs)
          results.push(...sortedItems.map(i => ({ ...i, selected: i.uuid === this.builderData[stepKey] })));
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
      if (item) data.class = { name: item.name, features: (item.system.levelFeatures || []).filter(f => f.level === 1) };
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
      const uuids = this.builderData[stepKey];
      for (const uuid of uuids) {
        const item = await fromUuid(uuid);
        if (item) {
          trayItems.push({
            uuid: item.uuid,
            name: item.name,
            img: item.img,
            type: item.type
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
/** @override */
  _onRender(context, options) {
    const html = this.element;
    
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

      // Check if already in tray
      if (this.builderData[stepKey].includes(uuid)) {
          ui.notifications.warn("This item is already in your tray.");
          return;
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
    if (this.currentStep === 'stats') {
        const roll = await new Roll("1d12").evaluate();
        this.builderData.selectedArrayId = String(roll.total);
        this.builderData.unassignedValues = [...this.statArrays[roll.total]];
        this.builderData.stats = { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null };
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

  _onGoToStep(event, target) {
    this.currentStep = target.dataset.step;
    
    // Clear the active preview item so it doesn't bleed into the next tab
    this.builderData.previewUuid = null;
    
    this.render();
}

  async _onFinish() {
    const actor = this.actor;
    const data = this.builderData;
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
    if (data.class) await addByUuid(data.class);
    if (data.startingPack) await addByUuid(data.startingPack);
    for (const uuid of [...data.perks, ...data.spells, ...data.gear]) await addByUuid(uuid);

    await actor.update(updateData);
    await actor.createEmbeddedDocuments("Item", itemsToCreate);

    const skillUpdates = {};
    for (const sKey of data.skills) skillUpdates[`system.skills.${sKey}.trained`] = true;
    await actor.update(skillUpdates);

    ui.notifications.info(`Character ${actor.name} successfully created!`);
    this.close();
  }
}
