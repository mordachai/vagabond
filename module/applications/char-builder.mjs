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
      skills: [], // Selected skills from class pools
      perks: [],
      spells: [],
      startingPack: null,
      gear: [],
      selectedArrayId: null,
      unassignedValues: [], // Current pool of numbers from the d12 array
      selectedValue: null   // The value currently "picked up" to be placed in a stat
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

  static DEFAULT_OPTIONS = {
    id: "vagabond-char-builder",
    tag: "form",
    window: { title: "VAGABOND.CharBuilder.Title", resizable: true, icon: "fas fa-scroll" },
    position: { width: 1100, height: 850 },
    actions: {
      goToStep: this._onGoToStep,
      next: this._onNext,
      prev: this._onPrev,
      selectOption: this._onSelectOption,
      toggleCategory: this._onToggleCategory,
      randomize: this._onRandomize,
      pickValue: this._onPickValue,
      assignStat: this._onAssignStat,
      toggleSkill: this._onToggleSkill,
      resetStats: this._onResetStats,
      finish: this._onFinish
    }
  };

  static PARTS = { form: { template: "systems/vagabond/templates/apps/char-builder.hbs" } };

  /** @override */
  async _prepareContext(options) {
    const availableOptions = await this._loadStepOptions();
    const stepKey = this.currentStep === 'starting-packs' ? 'startingPack' : this.currentStep;
    const selectedUuid = this.builderData[stepKey];
    
    // Rich Item Preview
    let selectedItem = null;
    if (selectedUuid && typeof selectedUuid === 'string') {
        // We use fromUuid to get the full Document, not just the index
        const item = await fromUuid(selectedUuid);
        
        if (item) {
            console.log("VagabondBuilder | Full Item Data:", item.system); // Check F12 now

            selectedItem = item.toObject();
            selectedItem.uuid = item.uuid;
            selectedItem.enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
                item.system.description || "", 
                { async: true, secrets: false, relativeTo: item }
            );
            
            const sys = item.system;
            
            // Use equipmentType to drive the logic as per the Battleaxe JSON
            const subType = sys.equipmentType || ""; 

            selectedItem.displayStats = {
                subType: subType,
                slots: sys.baseSlots || 0,
                cost: sys.baseCost?.silver || 0,
                
                // Sublabels based on item category
                sublabel: subType === 'gear' ? sys.gearCategory : 
                          (subType === 'alchemical' ? sys.alchemicalType : 
                          (subType === 'relic' ? sys.lore : null)),
                
                // Data mapping matching your specific JSON keys
                damage1h: sys.damageOneHand || null, 
                damage2h: sys.damageTwoHands || null, // Corrected with 's'
                damageType: sys.damageType || null,
                range: sys.range || null,
                grip: sys.grip || null,
                skill: sys.weaponSkill || null, // Mapped to 'weaponSkill'
                rating: sys.rating || null,
                mightReq: sys.mightReq || 0
            };

            console.log("VagabondBuilder | Final Mapped Stats:", selectedItem.displayStats);
        }
    }

    // Calculate Budget and Current Spending
    let budget = 0;
    let currentSpending = 0;
    
    if (this.builderData.startingPack) {
        const pack = await fromUuid(this.builderData.startingPack);
        budget = pack?.system.startingSilver || 0;
    }

    // Calculate total cost of selected gear
    for (const uuid of this.builderData.gear) {
        const item = await fromUuid(uuid);
        currentSpending += (item?.system.baseCost || 0);
    }

    return {
      step: this.currentStep,
      steps: this._getStepsContext(),
      hasChoices: ['class', 'stats', 'perks', 'spells'].includes(this.currentStep),
      useTripleColumn: ['perks', 'spells'].includes(this.currentStep),
      options: availableOptions,
      selectedItem,
      originRefs: await this._getOriginReferences(),
      classChoices: await this._prepareClassChoices(),
      statData: this._prepareStatsContext(),
      isGearStep: this.currentStep === 'gear',
      isFirstStep: this.currentStep === 'ancestry',
      isLastStep: this.currentStep === 'gear',
      budget: {
          total: budget,
          spent: currentSpending,
          remaining: budget - currentSpending,
          isOver: (budget - currentSpending) < 0
      }
    };
  }

  _getStepsContext() {
    const steps = [
      { id: 'ancestry', number: 1, label: 'VAGABOND.CharBuilder.Steps.Ancestry' },
      { id: 'class', number: 2, label: 'VAGABOND.CharBuilder.Steps.Class' },
      { id: 'stats', number: 3, label: 'VAGABOND.CharBuilder.Steps.Stats' },
      { id: 'perks', number: 4, label: 'VAGABOND.CharBuilder.Steps.Perks' },
      { id: 'spells', number: 5, label: 'VAGABOND.CharBuilder.Steps.Spells' },
      { id: 'starting-packs', number: 6, label: 'VAGABOND.CharBuilder.Steps.StartingPacks' },
      { id: 'gear', number: 7, label: 'VAGABOND.CharBuilder.Steps.Gear' }
    ];
    return steps.map(s => ({ ...s, active: s.id === this.currentStep, disabled: s.number > 1 && !this.builderData.ancestry }));
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
      unassigned: this.builderData.unassignedValues.map((v, i) => ({ value: v, index: i, active: this.builderData.selectedValue?.index === i })),
      arrays: Object.entries(this.statArrays).map(([id, values]) => ({ id, values: values.join(', '), selected: this.builderData.selectedArrayId === id }))
    };
  }

  async _loadStepOptions() {
    if (this.currentStep === 'stats') return [];
    const packMap = { 'ancestry': ['vagabond.ancestries'], 'class': ['vagabond.classes'], 'perks': ['vagabond.perks'], 'spells': ['vagabond.spells'], 'starting-packs': ['vagabond.starting-packs'], 'gear': ['vagabond.alchemical-items', 'vagabond.armor', 'vagabond.gear', 'vagabond.weapons', 'vagabond.relics'] };
    const packs = packMap[this.currentStep] || [];
    const results = [];

    for (const p of packs) {
      if (!this.indices[p]) {
        const pack = game.packs.get(p);
        if (pack) {
          const index = await pack.getIndex({ fields: ["img", "type", "system.baseCost", "system.damageAmount", "system.armorType"] });
          this.indices[p] = { label: pack.metadata.label, id: pack.metadata.name, items: index };
        }
      }
      const cached = this.indices[p];
      if (!cached) continue;

      if (this.currentStep === 'gear') {
        results.push({ label: cached.label, id: cached.id, isOpen: this.openCategories.has(cached.id), items: cached.items.map(i => ({ ...i, selected: this.builderData.gear.includes(i.uuid) })) });
      } else {
        const stepKey = this.currentStep === 'starting-packs' ? 'startingPack' : this.currentStep;
        results.push(...cached.items.map(i => ({ ...i, selected: i.uuid === this.builderData[stepKey] })));
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

  // EVENT HANDLERS
  static _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;
    if (this.currentStep === 'stats') {
        const id = target.dataset.id;
        this.builderData.selectedArrayId = id;
        this.builderData.unassignedValues = [...this.statArrays[id]];
        this.builderData.stats = { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null };
    } else if (this.currentStep === 'gear') {
        if (this.builderData.gear.includes(uuid)) this.builderData.gear = this.builderData.gear.filter(u => u !== uuid);
        else this.builderData.gear.push(uuid);
    } else {
        this.builderData[this.currentStep === 'starting-packs' ? 'startingPack' : this.currentStep] = uuid;
    }
    this.render();
  }

  static _onPickValue(event, target) {
      const index = parseInt(target.dataset.index);
      const value = this.builderData.unassignedValues[index];
      this.builderData.selectedValue = { value, index };
      this.render();
  }

  static _onAssignStat(event, target) {
      if (!this.builderData.selectedValue) return;
      const key = target.dataset.stat;
      const { value, index } = this.builderData.selectedValue;
      
      if (this.builderData.stats[key] !== null) {
          this.builderData.unassignedValues.push(this.builderData.stats[key]);
      }
      this.builderData.stats[key] = value;
      this.builderData.unassignedValues.splice(index, 1);
      this.builderData.selectedValue = null;
      this.render();
  }

  static async _onToggleSkill(event, target) {
    const skill = target.value;
    const item = await fromUuid(this.builderData.class);
    if (!item) return;

    const grant = item.system.skillGrant;
    
    // 1. Prevent toggling guaranteed skills
    if (grant.guaranteed.includes(skill)) return this.render();

    // 2. Identify which choice pool this skill belongs to
    const poolIndex = grant.choices.findIndex(c => c.pool.includes(skill) || c.pool.length === 0);
    if (poolIndex === -1) return;

    const choiceLimit = grant.choices[poolIndex].count;
    const skillsInThisPool = grant.choices[poolIndex].pool.length > 0 
      ? grant.choices[poolIndex].pool 
      : Object.keys(CONFIG.VAGABOND.skills);

    // Count how many from this specific pool are already selected
    const selectedFromPool = this.builderData.skills.filter(s => skillsInThisPool.includes(s));

    if (this.builderData.skills.includes(skill)) {
      // Allow unchecking
      this.builderData.skills = this.builderData.skills.filter(s => s !== skill);
    } else {
      // Check if limit is reached for this specific choice pool
      if (selectedFromPool.length < choiceLimit) {
        this.builderData.skills.push(skill);
      } else {
        ui.notifications.warn(`You can only choose ${choiceLimit} skills from this category.`);
      }
    }
    this.render();
  }

  static async _onRandomize() {
    if (this.currentStep === 'stats') {
        const roll = await new Roll("1d12").evaluate();
        this.builderData.selectedArrayId = String(roll.total);
        this.builderData.unassignedValues = [...this.statArrays[roll.total]];
        this.builderData.stats = { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null };
    }
    this.render();
  }

  static _onResetStats(event, target) {
    const id = this.builderData.selectedArrayId;
    if (!id) return;
    
    // Restore the full array to unassigned
    this.builderData.unassignedValues = [...this.statArrays[id]];
    // Clear assigned stats
    this.builderData.stats = { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null };
    this.builderData.selectedValue = null;
    this.render();
  }

  static _onGoToStep(event, target) { this.currentStep = target.dataset.step; this.render(); }
  static _onNext() { /* Navigation Logic */ this.render(); }
  static _onPrev() { /* Navigation Logic */ this.render(); }
  static _onToggleCategory(event, target) { const id = target.dataset.category; if (this.openCategories.has(id)) this.openCategories.delete(id); else this.openCategories.add(id); }
  
  async _onFinish() {
    const actor = this.actor;
    const data = this.builderData;

    // 1. Prepare Update Data for Stats
    const updateData = {
        "system.stats.might.value": data.stats.might,
        "system.stats.dexterity.value": data.stats.dexterity,
        "system.stats.awareness.value": data.stats.awareness,
        "system.stats.reason.value": data.stats.reason,
        "system.stats.presence.value": data.stats.presence,
        "system.stats.luck.value": data.stats.luck,
        "system.details.constructed": true // Flag to hide the builder button later
    };

    // 2. Collect Items to Create
    const itemsToCreate = [];
    
    // Simple helper to fetch and convert to Object
    const addByUuid = async (uuid) => {
        const item = await fromUuid(uuid);
        if (item) itemsToCreate.push(item.toObject());
    };

    if (data.ancestry) await addByUuid(data.ancestry);
    if (data.class) await addByUuid(data.class);
    if (data.startingPack) await addByUuid(data.startingPack);
    
    for (const uuid of [...data.perks, ...data.spells, ...data.gear]) {
        await addByUuid(uuid);
    }

    // 3. Update Actor and Create Items
    await actor.update(updateData);
    await actor.createEmbeddedDocuments("Item", itemsToCreate);

    // 4. Handle Skill Proficiencies
    // Assuming Vagabond uses a boolean or rank system for skills
    const skillUpdates = {};
    for (const sKey of data.skills) {
        skillUpdates[`system.skills.${sKey}.trained`] = true;
    }
    await actor.update(skillUpdates);

    ui.notifications.info(`Character ${actor.name} successfully created!`);
    this.close();
  }
}