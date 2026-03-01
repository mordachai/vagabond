/**
 * Spells Step Manager - Handles spell selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';

export class SpellsStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for spells step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'removeFromTray': this._onRemoveFromTray.bind(this),
      'clearTray': this._onClearTray.bind(this),
      'randomize': this._onRandomize.bind(this)
    };
    
    // Required data for spells step
    this.requiredData = ['spells'];
  }

  /**
   * Step name identifier
   */
  get stepName() {
    return 'spells';
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['spells', 'previewUuid', 'spellGrants'];
  }

  /**
   * Prepare spells-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state) {
    // Collect required spells from ancestry, class, and perks (auto-granted)
    const requiredSpellUuids = await this._collectRequiredSpells(state);

    // Auto-add required spells to state if not already there
    const currentSpells = state.spells || [];
    const updatedSpells = [...new Set([...currentSpells, ...requiredSpellUuids])];

    if (updatedSpells.length !== currentSpells.length) {
      this.updateState('spells', updatedSpells);
    }

    // Initialize spell grant tracking (mirrors perks grant system)
    const collectedGrants = await this._collectSpellGrants(state);
    let grants = state.spellGrants || [];

    if (grants.length === 0 || grants.length !== collectedGrants.length) {
      grants = collectedGrants;
      this.updateState('spellGrants', grants);
    } else {
      grants = collectedGrants.map((collected, i) => ({
        ...collected,
        fulfilled: grants[i]?.fulfilled ?? collected.fulfilled
      }));
      this.updateState('spellGrants', grants);
    }

    // Match existing selected spells to unfulfilled grants (legacy data recovery)
    const allSelected = [...updatedSpells];
    for (const uuid of allSelected) {
      if (requiredSpellUuids.includes(uuid)) continue; // skip auto-granted
      const unfulfilled = grants.find(g => !g.fulfilled && this._spellMatchesGrant(uuid, g));
      if (unfulfilled) unfulfilled.fulfilled = uuid;
    }

    // Find the active grant (first unfulfilled)
    const activeGrant = grants.find(g => !g.fulfilled) || null;
    const grantDisplay = this._prepareSpellGrantDisplay(grants, activeGrant);

    const availableSpells = await this._loadSpellOptions(requiredSpellUuids, activeGrant);
    const selectedSpells = updatedSpells;
    const previewUuid = state.previewUuid;
    const spellLimit = await this._getSpellLimit(state);

    // Mark items as previewing for template
    const markedSpells = availableSpells.map(spell => ({
      ...spell,
      previewing: spell.uuid === previewUuid
    }));

    // Get preview item details
    let previewItem = null;
    if (previewUuid) {
      try {
        const item = await fromUuid(previewUuid);
        if (item) {
          // Enrich the description for display
          const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
            async: true,
            secrets: false,
            relativeTo: item
          });

          previewItem = {
            ...item.toObject(),
            uuid: previewUuid,
            enrichedDescription: enrichedDescription,
            displayStats: this._prepareSpellDisplayStats(item),
            damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[item.system.damageType] || null,
            damageTypeLabel: item.system.damageType !== '-' ? item.system.damageType : null
          };
        }
      } catch (error) {
        console.warn('Failed to load preview spell:', error);
      }
    }

    // Prepare tray data
    const trayData = await this._prepareTrayData(selectedSpells, requiredSpellUuids);

    // Prepare mana stats from preview actor
    const manaStats = await this._prepareManaStats(state);

    // Prepare ancestry data for reference column
    const ancestryData = await this._prepareAncestryData(state);

    // Prepare class preview data for reference column
    const classPreviewData = await this._prepareClassPreviewData(state);

    const fulfilledGrantUuids = grants.filter(g => g.fulfilled).map(g => g.fulfilled);
    const totalSelectableSlots = spellLimit + grants.length;

    return {
      availableOptions: markedSpells,
      selectedSpells: selectedSpells,
      selectedItem: previewItem,
      previewItem: previewItem,
      spellLimit: totalSelectableSlots,
      currentSpellCount: selectedSpells.length,
      hasSelection: selectedSpells.length > 0,
      showRandomButton: true,
      showTray: true,
      trayData: trayData,
      useTripleColumn: true,
      requiredSpellCount: requiredSpellUuids.length,
      requiredSpells: requiredSpellUuids,
      grants: grantDisplay,
      activeGrant: activeGrant,
      hasActiveGrant: !!activeGrant,
      instruction: (selectedSpells.length === 0 && !previewUuid) ?
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Spells') : null,
      manaStats: manaStats,
      ancestryData: ancestryData,
      classPreviewData: classPreviewData
    };
  }

  /**
   * Load available spell options, filtered by active grant restrictions
   * @private
   */
  async _loadSpellOptions(requiredSpellUuids = [], activeGrant = null) {
    await this.dataService.ensureDataLoaded(['spells']);

    const spells = this.dataService.getFilteredItems('spells', {});
    const state = this.getCurrentState();
    const selectedSpells = state.spells || [];

    const shouldFilter = activeGrant && activeGrant.allowedSpells.length > 0;
    const allowedSet = shouldFilter ? new Set(activeGrant.allowedSpells) : null;

    // Sort spells alphabetically and mark selected ones
    const sortedSpells = spells.sort((a, b) => a.name.localeCompare(b.name));

    return sortedSpells
      .filter(spell => !shouldFilter || allowedSet.has(spell.uuid))
      .map(spell => ({
        ...spell,
        uuid: spell.uuid,
        name: spell.name,
        img: spell.img,
        type: 'spell',
        selected: selectedSpells.includes(spell.uuid),
        isRequired: requiredSpellUuids.includes(spell.uuid),
        isGranted: (state.spellGrants || []).some(g => g.fulfilled === spell.uuid),
        damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[spell.damageType] || null,
        damageTypeLabel: spell.damageType !== '-' ? spell.damageType : null
      }));
  }

  /**
   * Get spell limit from selected class (class slots only; grants are added separately)
   * @private
   */
  async _getSpellLimit(state) {
    let classSlots = 0;
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        if (classItem?.system.isSpellcaster) {
          const level1Data = (classItem.system.levelSpells || []).find(ls => ls.level === 1);
          classSlots = level1Data?.spells || 0;
        }
      } catch (error) {
        console.error('Failed to get spell limit:', error);
      }
    }
    return classSlots;
  }

  /**
   * Prepare tray data for selected spells
   * @private
   */
  async _prepareTrayData(selectedSpells, requiredSpellUuids = []) {
    const trayItems = [];

    for (const uuid of selectedSpells) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          trayItems.push({
            uuid: uuid,
            name: item.name,
            img: item.img,
            type: 'spell',
            isRequired: requiredSpellUuids.includes(uuid),
            damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[item.system.damageType] || null,
            damageTypeLabel: item.system.damageType !== '-' ? item.system.damageType : null
          });
        }
      } catch (error) {
        console.warn(`Failed to load spell ${uuid}:`, error);
      }
    }

    // Calculate empty slots
    const state = this.getCurrentState();
    const spellLimit = state.spellLimit || 0;
    const emptySlotCount = Math.max(0, spellLimit - trayItems.length);
    const emptySlots = Array(emptySlotCount).fill({});

    return {
      spells: trayItems,
      emptySlots: emptySlots,
      isEmpty: trayItems.length === 0
    };
  }

  /**
   * Prepare spell display stats for preview
   * @private
   */
  _prepareSpellDisplayStats(spell) {
    const sys = spell.system || {};

    const displayStats = {
      baseDamage: sys.baseDamage || null,
      damageType: sys.damageType || '-',
      damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[sys.damageType] || null,
      damageTypeLabel: sys.damageType !== '-' ? sys.damageType : null,
      crit: sys.crit || null,
      delivery: sys.delivery || null,
      deliveryLabel: sys.delivery ? (CONFIG.VAGABOND.deliveryTypes[sys.delivery] ?? game.i18n.localize(`VAGABOND.Spell.Delivery.${sys.delivery}`) ?? sys.delivery) : null,
      manaCost: sys.manaCost || 0,
      range: sys.range || null,
      duration: sys.duration || null,
      condition: sys.condition || null,
      areaOfEffect: sys.areaOfEffect || null
    };

    return displayStats;
  }

  /**
   * Prepare mana stats from preview actor
   * @private
   */
  async _prepareManaStats(state) {
    // Check if all stats are assigned
    const assignedStats = state.assignedStats || {};
    const allAssigned = Object.values(assignedStats).every(v => v !== null && v !== undefined);

    if (!allAssigned) {
      return null;
    }

    try {
      // Create preview actor to get calculated mana values
      const previewActor = await this._createPreviewActor(state);
      if (!previewActor) {
        return null;
      }

      return {
        manaMax: previewActor.system.mana.max,
        manaCast: previewActor.system.mana.castingMax
      };
    } catch (error) {
      console.error('Failed to prepare mana stats:', error);
      return null;
    }
  }

  /**
   * Prepare ancestry data for reference column
   * @private
   */
  async _prepareAncestryData(state) {
    if (!state.selectedAncestry) {
      return null;
    }

    try {
      const ancestry = await fromUuid(state.selectedAncestry);
      if (!ancestry) {
        return null;
      }

      return {
        name: ancestry.name,
        traits: ancestry.system.traits || []
      };
    } catch (error) {
      console.error('Failed to prepare ancestry data:', error);
      return null;
    }
  }

  /**
   * Prepare class preview data for reference column (all levels)
   * @private
   */
  async _prepareClassPreviewData(state) {
    if (!state.selectedClass) {
      return null;
    }

    try {
      const classItem = await fromUuid(state.selectedClass);
      if (!classItem) {
        return null;
      }

      // Get all level features
      const levelFeatures = classItem.system.levelFeatures || [];

      // Group features by level
      const levelGroups = {};
      for (const feature of levelFeatures) {
        const level = feature.level || 1;
        if (!levelGroups[level]) {
          levelGroups[level] = [];
        }

        // Enrich feature description
        const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(
          feature.description || '',
          {
            async: true,
            secrets: false,
            relativeTo: classItem
          }
        );

        levelGroups[level].push({
          name: feature.name,
          description: feature.description,
          enrichedDescription: enrichedDescription
        });
      }

      // Convert to array format
      const levels = Object.keys(levelGroups).map(level => ({
        level: parseInt(level),
        features: levelGroups[level]
      })).sort((a, b) => a.level - b.level);

      return {
        name: classItem.name,
        levels: levels
      };
    } catch (error) {
      console.error('Failed to prepare class preview data:', error);
      return null;
    }
  }

  /**
   * Create a preview actor with current builder state
   * @private
   */
  async _createPreviewActor(state) {
    try {
      // Apply bonuses to stats
      const finalStats = { ...state.assignedStats };
      const appliedBonuses = state.appliedBonuses || {};

      for (const [bonusId, application] of Object.entries(appliedBonuses)) {
        if (finalStats[application.target] !== null && finalStats[application.target] !== undefined) {
          finalStats[application.target] += application.amount;
        }
      }

      // Get trained skills from builder state
      const trainedSkills = state.skills || [];

      const skillsDefinition = Object.fromEntries(
        (CONFIG.VAGABOND.homebrew?.skills ?? []).map(s => [s.key, { stat: s.stat }])
      );

      const skills = {};
      for (const [key, def] of Object.entries(skillsDefinition)) {
        skills[key] = {
          trained: trainedSkills.includes(key),
          stat: def.stat,
          bonus: 0
        };
      }

      // Build actor data
      const actorData = {
        name: "Preview Character",
        type: "character",
        system: {
          stats: {
            might: { value: finalStats.might || 0 },
            dexterity: { value: finalStats.dexterity || 0 },
            awareness: { value: finalStats.awareness || 0 },
            reason: { value: finalStats.reason || 0 },
            presence: { value: finalStats.presence || 0 },
            luck: { value: finalStats.luck || 0 }
          },
          skills: skills,
        },
        items: []
      };

      // Apply builder selections (ancestry, class, perks)
      const itemUuids = [
        state.selectedAncestry,
        state.selectedClass,
        ...(state.perks || []),
        ...(state.classPerks || [])
      ].filter(uuid => uuid);

      // Load all items
      if (itemUuids.length > 0) {
        const items = await Promise.all(itemUuids.map(uuid => fromUuid(uuid)));
        actorData.items = items.filter(i => i).map(i => i.toObject());
      }

      // Create and prepare the preview actor
      const previewActor = new Actor.implementation(actorData);
      previewActor.prepareData();

      return previewActor;
    } catch (error) {
      console.error('Failed to create preview actor:', error);
      return null;
    }
  }

  /**
   * Handle spell selection (preview)
   * @private
   */
  async _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    // Set preview
    this.updateState('previewUuid', uuid);
  }

  /**
   * Handle adding spell to tray
   * @private
   */
  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const currentSpells = state.spells || [];
    const grants = state.spellGrants || [];
    const classSpellLimit = await this._getSpellLimit(state);

    // Check if already selected
    if (currentSpells.includes(uuid)) {
      ui.notifications.warn('Spell already selected');
      return;
    }

    // Find the active (first unfulfilled) grant
    const activeGrant = grants.find(g => !g.fulfilled) || null;

    // If there's an active grant, enforce its restrictions
    if (activeGrant) {
      if (!this._spellMatchesGrant(uuid, activeGrant)) {
        ui.notifications.warn(`This spell is not allowed by the current grant (${activeGrant.featureName})`);
        return;
      }
      // Fulfill the grant
      const updatedGrants = grants.map(g => g.id === activeGrant.id ? { ...g, fulfilled: uuid } : g);
      this.updateState('spellGrants', updatedGrants);
    } else {
      // No active grant — check class spell limit
      const requiredSpells = await this._collectRequiredSpells(state);
      const nonGrantSpells = currentSpells.filter(u => !grants.some(g => g.fulfilled === u));
      if (classSpellLimit > 0 && nonGrantSpells.length >= classSpellLimit) {
        ui.notifications.warn(`You can only select ${classSpellLimit} class spells`);
        return;
      }
    }

    try {
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'spell') {
        ui.notifications.error('Invalid spell selection');
        return;
      }

      const newSpells = [...currentSpells, uuid];
      this.updateState('spells', newSpells);
      this.updateState('previewUuid', uuid);
    } catch (error) {
      console.error('Failed to add spell:', error);
      ui.notifications.error('Failed to add spell');
    }
  }

  /**
   * Handle removing spell from tray
   * @private
   */
  async _onRemoveFromTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const currentSpells = state.spells || [];

    if (!currentSpells.includes(uuid)) {
      ui.notifications.warn('Spell not in selection');
      return;
    }

    // Check if spell is auto-required (cannot remove)
    const requiredSpells = await this._collectRequiredSpells(state);
    if (requiredSpells.includes(uuid)) {
      ui.notifications.warn('Cannot remove required spell');
      return;
    }

    try {
      const newSpells = currentSpells.filter(u => u !== uuid);
      this.updateState('spells', newSpells);

      // Un-fulfill any grant that this spell was satisfying
      const grants = state.spellGrants || [];
      const fulfilledGrant = grants.find(g => g.fulfilled === uuid);
      if (fulfilledGrant) {
        const updatedGrants = grants.map(g => g.id === fulfilledGrant.id ? { ...g, fulfilled: null } : g);
        this.updateState('spellGrants', updatedGrants);
      }

      if (state.previewUuid === uuid) {
        this.updateState('previewUuid', null);
      }
    } catch (error) {
      console.error('Failed to remove spell:', error);
      ui.notifications.error('Failed to remove spell');
    }
  }

  /**
   * Handle clearing all spells from tray
   * @private
   */
  async _onClearTray(event, target) {
    const state = this.getCurrentState();
    const currentSpells = state.spells || [];

    if (currentSpells.length === 0) {
      return;
    }

    // Keep only auto-required spells, remove all others
    const requiredSpells = await this._collectRequiredSpells(state);
    this.updateState('spells', requiredSpells);
    this.updateState('previewUuid', null);

    // Reset all grant fulfillments (except guaranteed ones)
    const grants = state.spellGrants || [];
    const resetGrants = grants.map(g => {
      const isGuaranteed = g.allowedSpells.length > 0 && g.allowedSpells.includes(g.fulfilled);
      return isGuaranteed ? g : { ...g, fulfilled: null };
    });
    this.updateState('spellGrants', resetGrants);
  }

  /**
   * Handle spell randomization
   * @private
   */
  async _onRandomize(event, target) {
    await this.randomize();
  }

  /**
   * Randomize spell selection (fills both grant slots and class slots)
   */
  async randomize() {
    const state = this.getCurrentState();
    const classSpellLimit = await this._getSpellLimit(state);
    const grants = (state.spellGrants || []);
    const requiredSpells = await this._collectRequiredSpells(state);

    let selectedUuids = [...requiredSpells];
    let updatedGrants = grants.map(g => ({ ...g }));

    // Fill unfulfilled grants first
    for (const grant of updatedGrants) {
      if (grant.fulfilled) continue;
      const pool = grant.allowedSpells.length > 0
        ? await this._loadSpellOptions(requiredSpells, grant)
        : await this._loadSpellOptions(requiredSpells, null);
      const available = pool.filter(s => !selectedUuids.includes(s.uuid));
      if (available.length > 0) {
        const pick = available[Math.floor(Math.random() * available.length)];
        grant.fulfilled = pick.uuid;
        selectedUuids.push(pick.uuid);
      }
    }
    this.updateState('spellGrants', updatedGrants);

    // Fill remaining class slots
    if (classSpellLimit > 0) {
      const options = await this._loadSpellOptions(requiredSpells, null);
      const available = options.filter(s => !selectedUuids.includes(s.uuid));
      const needed = classSpellLimit - (selectedUuids.length - requiredSpells.length - updatedGrants.filter(g => g.fulfilled).length);
      const shuffled = available.sort(() => Math.random() - 0.5);
      selectedUuids.push(...shuffled.slice(0, Math.max(0, needed)).map(s => s.uuid));
    }

    this.updateState('spells', [...new Set(selectedUuids)]);
    if (selectedUuids.length > 0) this.updateState('previewUuid', selectedUuids[0]);
  }

  /**
   * Check if step is complete — all spell grants must be fulfilled
   */
  isComplete() {
    const state = this.getCurrentState();
    const grants = state.spellGrants || [];
    return grants.every(g => !!g.fulfilled);
  }

  /**
   * Reset spells step
   * @protected
   */
  async _onReset() {
    const state = this.getCurrentState();
    const requiredSpells = await this._collectRequiredSpells(state);
    this.updateState('spells', requiredSpells, { skipValidation: true });
    this.updateState('spellGrants', [], { skipValidation: true });
  }

    /**
     * Step-specific activation logic
     * @protected
     */
    async _onActivate() {
      await this.dataService.ensureDataLoaded(['spells']);
    }

  /**
   * Collect all spell grants from ancestry traits and class level 1 features.
   * Mirrors _collectPerkGrants from PerksStepManager.
   * @private
   */
  async _collectSpellGrants(state) {
    const grants = [];

    // From ancestry traits (spellAmount > 0, requiredSpells = allowed pool)
    if (state.selectedAncestry) {
      try {
        const ancestry = await fromUuid(state.selectedAncestry);
        const traits = ancestry.system.traits || [];
        for (const trait of traits) {
          const amount = trait.spellAmount || 0;
          const allowedSpells = (trait.requiredSpells || []).filter(u => u);
          if (amount > 0) {
            const isGuaranteed = allowedSpells.length > 0 && amount >= allowedSpells.length;
            for (let i = 0; i < amount; i++) {
              grants.push({
                id: `ancestry-${trait.name}-spell-${i}`,
                source: 'ancestry',
                sourceName: ancestry.name,
                featureName: trait.name,
                allowedSpells,
                fulfilled: isGuaranteed ? (allowedSpells[i] || allowedSpells[0]) : null
              });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to collect ancestry spell grants:', e);
      }
    }

    // From class level 1 features
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        const level1Features = (classItem.system.levelFeatures || []).filter(f => f.level === 1);
        for (const feature of level1Features) {
          const amount = feature.spellAmount || 0;
          const allowedSpells = (feature.requiredSpells || []).filter(u => u);
          if (amount > 0) {
            const isGuaranteed = allowedSpells.length > 0 && amount >= allowedSpells.length;
            for (let i = 0; i < amount; i++) {
              grants.push({
                id: `class-${feature.name}-spell-${i}`,
                source: 'class',
                sourceName: classItem.name,
                featureName: feature.name,
                allowedSpells,
                fulfilled: isGuaranteed ? (allowedSpells[i] || allowedSpells[0]) : null
              });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to collect class spell grants:', e);
      }
    }

    // Most restrictive (smallest pool) first; unrestricted last
    grants.sort((a, b) => {
      const aR = a.allowedSpells.length > 0;
      const bR = b.allowedSpells.length > 0;
      if (aR && !bR) return -1;
      if (!aR && bR) return 1;
      if (aR && bR) return a.allowedSpells.length - b.allowedSpells.length;
      return 0;
    });

    return grants;
  }

  /**
   * Whether a spell UUID satisfies a grant's restrictions.
   * @private
   */
  _spellMatchesGrant(spellUuid, grant) {
    if (!grant.allowedSpells || grant.allowedSpells.length === 0) return true;
    return grant.allowedSpells.includes(spellUuid);
  }

  /**
   * Build display data for grant badges shown in the UI.
   * @private
   */
  _prepareSpellGrantDisplay(grants, activeGrant) {
    return grants.map(grant => ({
      id: grant.id,
      label: `${grant.sourceName} – ${grant.featureName}: ×1`,
      isActive: activeGrant && grant.id === activeGrant.id,
      isFulfilled: !!grant.fulfilled,
      isRestricted: grant.allowedSpells.length > 0
    }));
  }
}

  