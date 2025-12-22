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
      perks: [],
      spells: [],
      startingPack: null,
      gear: [],
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
      finish: VagabondCharBuilder.prototype._onFinish
    }
  };

  static PARTS = { form: { template: "systems/vagabond/templates/apps/char-builder.hbs" } };

  /** @override */
  async _prepareContext(options) {
    const getProperty = foundry.utils.getProperty;
    const availableOptions = await this._loadStepOptions();
    const stepKey = this.currentStep === 'starting-packs' ? 'startingPack' : this.currentStep;

    // --- 1. PREPARE RAW DATA & SANITIZE ---
    const actorData = this.actor.toObject();

    // A. Wipe Lingering Actor Effects & Data (Prevents the "17" issue)
    actorData.effects = []; 
    if (actorData.system.inventory) actorData.system.inventory.bonusSlots = 0;
    
    // B. Zero out Stat Bonuses
    if (actorData.system.stats) {
        for (const key of Object.keys(actorData.system.stats)) {
            if (actorData.system.stats[key]) {
                actorData.system.stats[key].bonus = 0;
                actorData.system.stats[key].mod = 0;
            }
        }
    }

    // --- 2. APPLY BUILDER STATS ---
    const builderStats = this.builderData.stats;
    for (const [key, val] of Object.entries(builderStats)) {
        if (val !== null) actorData.system.stats[key].value = val;
    }

    // --- 3. INJECT ITEMS ---
    const itemUuids = [
        this.builderData.ancestry,
        this.builderData.class,
        this.builderData.startingPack,
        ...this.builderData.perks,
        ...this.builderData.gear
    ].filter(uuid => uuid);

    if (itemUuids.length > 0) {
        const validItems = await Promise.all(itemUuids.map(uuid => fromUuid(uuid)));
        
        // Convert to Object (RESTORED: We do NOT filter effects anymore)
        const newItems = validItems.filter(i => i).map(item => item.toObject());

        // Singleton Check: Prevent adding a second Ancestry/Class if one exists in the list
        const singletonTypes = ['ancestry', 'class'];
        const typesBeingAdded = new Set(newItems.map(i => i.type));

        actorData.items = actorData.items.filter(existingItem => {
            // If we are adding a new Class, remove the old Class from the array
            if (singletonTypes.includes(existingItem.type) && typesBeingAdded.has(existingItem.type)) return false; 
            return true;
        });

        actorData.items.push(...newItems);
    }

    // --- 4. CREATE PREVIEW ---
    // Since 'actorData.type' is 'character', this creates a VagabondCharacter
    // It will automatically apply the 'transfer: true' effects from the injected items.
    const previewActor = new Actor.implementation(actorData);
    previewActor.prepareData();

    // Debug Access
    window.debugBuilder = previewActor; 

    // --- UI LOGIC ---
    let previewUuid = this.builderData.previewUuid;
    if (!previewUuid && this.currentStep !== 'gear') previewUuid = this.builderData[stepKey];
    
    let selectedItem = null;
    if (previewUuid && typeof previewUuid === 'string') {
        const item = await fromUuid(previewUuid);
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
                    level: lvl, isOpen: parseInt(lvl) === 1, features: feats
                })).sort((a, b) => a.level - b.level);
            }
             selectedItem.displayStats = {
                subType: sys.equipmentType || "",
                slots: sys.baseSlots || 0,
                costLabel: sys.baseCost?.gold ? `${sys.baseCost.gold}G` : `${sys.baseCost?.silver || 0}S`,
                damage1h: sys.damageOneHand || null,
                damage2h: sys.damageTwoHands || null,
                damageType: sys.damageType || "-",
                range: sys.range || null,
                grip: sys.grip || null,
                skill: sys.weaponSkill || null
            };
        }
    }

    let budget = 0;
    let currentSpending = 0;
    if (this.builderData.startingPack) {
        const pack = await fromUuid(this.builderData.startingPack);
        budget = pack?.system.startingSilver || 0;
    }
    for (const uuid of this.builderData.gear) {
        const item = await fromUuid(uuid);
        if (item) {
            const goldInSilver = (item.system.baseCost?.gold || 0) * 10;
            currentSpending += goldInSilver + (item.system.baseCost?.silver || 0);
        }
    }

    return {
      actor: previewActor,
      step: this.currentStep,
      steps: this._getStepsContext(),
      hasChoices: ['class', 'stats'].includes(this.currentStep),
      useTripleColumn: ['perks', 'spells'].includes(this.currentStep),
      options: availableOptions,
      selectedItem,
      originRefs: await this._getOriginReferences(),
      classChoices: await this._prepareClassChoices(),
      statData: this._prepareStatsContext(),
      isGearStep: this.currentStep === 'gear',
      budget: { 
        total: budget, 
        spent: currentSpending, 
        remaining: budget - currentSpending, 
        isOver: (budget - currentSpending) < 0 
      }
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
          const index = await pack.getIndex({ fields: ["img", "type", "system.baseCost"] });
          this.indices[p] = { label: pack.metadata.label, id: pack.metadata.name, items: index };
        }
      }
      const cached = this.indices[p];
      if (!cached) continue;

      if (this.currentStep === 'gear') {
        results.push({ 
            label: cached.label, 
            id: cached.id, 
            isOpen: this.openCategories.has(cached.id), 
            items: cached.items.map(i => ({ ...i, selected: this.builderData.gear.includes(i.uuid) })) 
        });
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

  /** @override */
/** @override */
  _onRender(context, options) {
    console.log("Vagabond | _onRender called. Attaching listeners...");
    const html = this.element;
    
    // 1. Draggable Chips Initialization
    const chips = html.querySelectorAll('.value-chip');
    console.log(`Vagabond | Found ${chips.length} value chips.`);

    chips.forEach(chip => {
        chip.setAttribute('draggable', 'true');
        
        chip.addEventListener('dragstart', (ev) => {
            console.log("Vagabond | DragStart detected.");
            const target = ev.currentTarget; 
            
            // Log what we are trying to drag
            console.log("Vagabond | Drag Target Dataset:", target.dataset);

            const transfer = { 
                index: target.dataset.index, 
                value: target.dataset.value 
            };
            
            console.log("Vagabond | Transfer Data:", transfer);

            ev.dataTransfer.setData("text/plain", JSON.stringify(transfer));
            ev.dataTransfer.effectAllowed = "move"; 
            target.classList.add('dragging');
        });

        chip.addEventListener('dragend', (ev) => {
            console.log("Vagabond | DragEnd.");
            ev.currentTarget.classList.remove('dragging');
        });
    });

    // 2. Drop Zones (Stat Slots) Initialization
    const slots = html.querySelectorAll('.stat-slot');
    console.log(`Vagabond | Found ${slots.length} stat slots.`);

    slots.forEach(slot => {
        slot.addEventListener('dragover', (ev) => {
            ev.preventDefault(); // Necessary to allow dropping
            ev.dataTransfer.dropEffect = "move";
        });

        slot.addEventListener('dragenter', (ev) => ev.currentTarget.classList.add('drag-over'));
        slot.addEventListener('dragleave', (ev) => ev.currentTarget.classList.remove('drag-over'));

        slot.addEventListener('drop', (ev) => {
            console.log("Vagabond | Drop detected on slot.");
            ev.preventDefault();
            ev.currentTarget.classList.remove('drag-over');

            try {
                const rawData = ev.dataTransfer.getData("text/plain");
                console.log("Vagabond | Raw Drop Data:", rawData);

                if (!rawData) {
                    console.warn("Vagabond | No data found in drop event.");
                    return;
                }

                const data = JSON.parse(rawData);
                const statKey = ev.currentTarget.dataset.stat;
                
                console.log(`Vagabond | Dropping value ${data.value} (index ${data.index}) into ${statKey}`);

                this._assignStatValue(statKey, parseInt(data.value), parseInt(data.index));
            } catch (err) { 
                console.error("Vagabond | Drag drop failed with error:", err); 
            }
        });
    });
  }

 _assignStatValue(statKey, value, poolIndex) {
      console.log("Vagabond | _assignStatValue called");
      console.log(`Vagabond | Args - Key: ${statKey}, Value: ${value}, PoolIndex: ${poolIndex}`);

      // Check validity
      if (isNaN(value) || isNaN(poolIndex)) {
          console.error("Vagabond | Validation Failed: Value or PoolIndex is NaN");
          return;
      }

      const prev = this.builderData.stats[statKey];
      console.log("Vagabond | Previous value in slot:", prev);

      // Return previous value to pool if replacing
      if (prev !== null) {
          console.log("Vagabond | Pushing previous value back to pool");
          this.builderData.unassignedValues.push(prev);
      }
      
      this.builderData.stats[statKey] = value;
      
      // Remove the used value from the pool
      console.log(`Vagabond | Attempting to splice index ${poolIndex} from pool (Size: ${this.builderData.unassignedValues.length})`);
      
      if (poolIndex >= 0 && poolIndex < this.builderData.unassignedValues.length) {
          const removed = this.builderData.unassignedValues.splice(poolIndex, 1);
          console.log("Vagabond | Spliced value:", removed);
      } else {
          console.warn("Vagabond | Pool Index out of bounds, splice skipped.");
      }
      
      this.builderData.selectedValue = null;
      console.log("Vagabond | Re-rendering...");
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
      this.builderData.previewUuid = uuid;
      if (this.currentStep === 'stats') {
          const id = target.dataset.id;
          this.builderData.selectedArrayId = id;
          this.builderData.unassignedValues = [...this.statArrays[id]];
          this.builderData.stats = { might: null, dexterity: null, awareness: null, reason: null, presence: null, luck: null };
      } else if (this.currentStep === 'gear') {
          if (this.builderData.gear.includes(uuid)) this.builderData.gear = this.builderData.gear.filter(u => u !== uuid);
          else this.builderData.gear.push(uuid);
      } else {
          const stepKey = this.currentStep === 'starting-packs' ? 'startingPack' : this.currentStep;
          this.builderData[stepKey] = uuid;
      }
      this.render();
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

  _onGoToStep(event, target) { this.currentStep = target.dataset.step; this.render(); }

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