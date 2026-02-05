/**
 * Perks Step Manager - Handles perk selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';

export class PerksStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for perks step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'removeFromTray': this._onRemoveFromTray.bind(this),
      'clearTray': this._onClearTray.bind(this),
      'toggleShowAllPerks': this._onToggleShowAllPerks.bind(this)
    };
    
    // Required data for perks step
    this.requiredData = ['perks'];
    
    // Show all perks toggle
    this.showAllPerks = false;
  }

  /**
   * Step name identifier
   */
  get stepName() {
    return 'perks';
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['perks', 'classPerks', 'previewUuid', 'perkGrants'];
  }

  /**
   * Prepare perks-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state) {
    // Collect and auto-add guaranteed perks (where amount >= options)
    const guaranteedPerks = await this._collectGuaranteedPerks(state);
    const currentClassPerks = state.classPerks || [];
    const updatedClassPerks = [...new Set([...currentClassPerks, ...guaranteedPerks])];

    if (updatedClassPerks.length !== currentClassPerks.length) {
      this.updateState('classPerks', updatedClassPerks);
      state.classPerks = updatedClassPerks;
    }

    // Collect all spells (mandatory + selected) for prerequisite checking
    const mandatorySpells = await this._collectRequiredSpells(state);
    const allKnownSpells = [...new Set([...(state.spells || []), ...mandatorySpells])];

    // Initialize grant tracking system
    const collectedGrants = await this._collectPerkGrants(state);
    let grants = state.perkGrants || [];

    // Sync grants with collected data (in case ancestry/class changed)
    if (grants.length === 0 || grants.length !== collectedGrants.length) {
      grants = collectedGrants;
      this.updateState('perkGrants', grants);
    } else {
      // Preserve fulfillment status when grants structure hasn't changed
      // Use ?? (nullish coalescing) to preserve auto-fulfilled status
      grants = collectedGrants.map((collected, index) => ({
        ...collected,
        fulfilled: grants[index]?.fulfilled ?? collected.fulfilled
      }));
      this.updateState('perkGrants', grants);
    }

    // Match existing selected perks to grants (in case we have legacy data)
    const selectedPerks = state.perks || [];
    for (const perkUuid of selectedPerks) {
      const unfulfilledGrant = grants.find(g => !g.fulfilled);
      if (unfulfilledGrant && this._perkMatchesGrant(perkUuid, unfulfilledGrant)) {
        unfulfilledGrant.fulfilled = perkUuid;
      }
    }

    // Find the active grant (first unfulfilled)
    const activeGrant = grants.find(g => !g.fulfilled) || null;

    const classPerks = state.classPerks || [];
    const previewUuid = state.previewUuid;
    const perkLimit = grants.length; // Total number of grants = perk limit

    // Prepare grant display data
    const grantDisplay = this._prepareGrantDisplay(grants, activeGrant);

    // Load available perks with active grant filtering
    const availablePerks = await this._loadPerkOptions(state, allKnownSpells, activeGrant);

    // Get preview item details with prerequisite checking
    let previewItem = null;
    if (previewUuid) {
      try {
        const item = await fromUuid(previewUuid);
        if (item) {
          const previewActor = await this._createPreviewActor(state, allKnownSpells);
          const prereqCheck = await this._checkPerkPrerequisites(item, previewActor, allKnownSpells);
          const prerequisitesHTML = await this._formatPrerequisites(item, previewActor, allKnownSpells);

          // Enrich the description for display
          const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
            async: true,
            secrets: false,
            relativeTo: item
          });

          // Check if perk has any prerequisites
          const prereqs = item.system.prerequisites || {};
          const hasPrerequisites =
            (prereqs.stats?.length > 0) ||
            (prereqs.trainedSkills?.length > 0) ||
            (prereqs.spells?.length > 0) ||
            prereqs.hasAnySpell ||
            (prereqs.resources?.length > 0);

          previewItem = {
            ...item.toObject(),
            uuid: previewUuid,
            enrichedDescription: enrichedDescription,
            hasPrerequisites: hasPrerequisites,
            prerequisitesMet: prereqCheck.met,
            prerequisitesCompactHTML: prerequisitesHTML
          };
        }
      } catch (error) {
        console.warn('Failed to load preview perk:', error);
      }
    }

    // Collect all fulfilled perk UUIDs for tray
    const allSelectedPerks = grants.filter(g => g.fulfilled).map(g => g.fulfilled);

    // Prepare tray data
    const trayData = await this._prepareTrayData(allSelectedPerks, classPerks, grants);

    // Get origin references for display
    const originReferences = await this._getOriginReferences(state);

    // Calculate fulfillment counts
    const fulfilledCount = grants.filter(g => g.fulfilled).length;

    return {
      availableOptions: availablePerks,
      selectedPerks: allSelectedPerks,
      classPerks: classPerks,
      selectedItem: previewItem,
      previewItem: previewItem,
      perkLimit: perkLimit,
      currentPerkCount: fulfilledCount + classPerks.length,
      hasSelection: fulfilledCount > 0 || classPerks.length > 0,
      showTray: true,
      trayData: trayData,
      useTripleColumn: true,
      showAllPerks: this.showAllPerks,
      originReferences: originReferences,
      grants: grantDisplay,
      activeGrant: activeGrant,
      hasActiveGrant: !!activeGrant,
      instruction: (fulfilledCount === 0 && classPerks.length === 0 && !previewUuid) ?
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Perks') : null
    };
  }

  /**
   * Check if a perk UUID matches a grant's restrictions
   * @private
   */
  _perkMatchesGrant(perkUuid, grant) {
    if (!grant.allowedPerks || grant.allowedPerks.length === 0) {
      return true; // Unrestricted grant accepts any perk
    }
    return grant.allowedPerks.includes(perkUuid);
  }

  /**
   * Prepare grant display data for UI
   * @private
   */
  _prepareGrantDisplay(grants, activeGrant) {
    return grants.map(grant => {
      const isActive = activeGrant && grant.id === activeGrant.id;
      const isFulfilled = !!grant.fulfilled;
      const label = `${grant.sourceName} - ${grant.featureName}: x1`;

      return {
        id: grant.id,
        label: label,
        isActive: isActive,
        isFulfilled: isFulfilled,
        isRestricted: grant.allowedPerks.length > 0
      };
    });
  }

  /**
   * Collect all perk grants from ancestry traits and class level 1 features
   * Each grant is tracked separately with its own restrictions and fulfillment
   * Guaranteed perks (amount >= allowedPerks.length) are auto-fulfilled
   * @private
   */
  async _collectPerkGrants(state) {
    const grants = [];

    // From ancestry traits
    if (state.selectedAncestry) {
      try {
        const ancestry = await fromUuid(state.selectedAncestry);
        const traits = ancestry.system.traits || [];
        for (const trait of traits) {
          const amount = trait.perkAmount || 0;
          const allowedPerks = trait.allowedPerks || [];

          // Check if this is a guaranteed perk (auto-granted)
          const isGuaranteed = amount > 0 && allowedPerks.length > 0 && amount >= allowedPerks.length;

          if (amount > 0) {
            // Create one grant entry per amount
            for (let i = 0; i < amount; i++) {
              grants.push({
                id: `ancestry-${trait.name}-${i}`,
                source: 'ancestry',
                sourceName: ancestry.name,
                featureName: trait.name,
                allowedPerks: allowedPerks,
                // Auto-fulfill guaranteed perks with their UUID
                fulfilled: isGuaranteed ? allowedPerks[i] || allowedPerks[0] : null
              });
            }
          }
        }
      } catch (error) {
        console.warn('Failed to collect ancestry perk grants:', error);
      }
    }

    // From class level 1 features
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        const levelFeatures = classItem.system.levelFeatures || [];
        const level1Features = levelFeatures.filter(f => f.level === 1);
        for (const feature of level1Features) {
          const amount = feature.perkAmount || 0;
          const allowedPerks = feature.allowedPerks || [];

          // Check if this is a guaranteed perk (auto-granted)
          const isGuaranteed = amount > 0 && allowedPerks.length > 0 && amount >= allowedPerks.length;

          if (amount > 0) {
            // Create one grant entry per amount
            for (let i = 0; i < amount; i++) {
              grants.push({
                id: `class-${feature.name}-${i}`,
                source: 'class',
                sourceName: classItem.name,
                featureName: feature.name,
                allowedPerks: allowedPerks,
                // Auto-fulfill guaranteed perks with their UUID
                fulfilled: isGuaranteed ? allowedPerks[i] || allowedPerks[0] : null
              });
            }
          }
        }
      } catch (error) {
        console.warn('Failed to collect class perk grants:', error);
      }
    }

    // Sort grants: most restrictive first (fewer options), unrestricted (any) last
    grants.sort((a, b) => {
      const aRestricted = a.allowedPerks.length > 0;
      const bRestricted = b.allowedPerks.length > 0;

      if (aRestricted && !bRestricted) return -1; // a comes first
      if (!aRestricted && bRestricted) return 1; // b comes first

      // Both restricted: fewer options = more restrictive = comes first
      if (aRestricted && bRestricted) {
        return a.allowedPerks.length - b.allowedPerks.length;
      }

      // Both unrestricted: maintain order (stable sort)
      return 0;
    });

    return grants;
  }

  /**
   * Collect guaranteed perks from ancestry traits and class level 1 features
   * (where perkAmount >= number of allowedPerks options)
   * @private
   */
  async _collectGuaranteedPerks(state) {
    const guaranteedPerks = new Set();

    // From ancestry traits
    if (state.selectedAncestry) {
      try {
        const ancestry = await fromUuid(state.selectedAncestry);
        const traits = ancestry.system.traits || [];
        for (const trait of traits) {
          const allowed = trait.allowedPerks || [];
          const amount = trait.perkAmount || 0;
          // If amount is >= options, they are all guaranteed
          if (amount > 0 && amount >= allowed.length && allowed.length > 0) {
            allowed.forEach(uuid => {
              if (uuid) guaranteedPerks.add(uuid);
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load ancestry for guaranteed perks:', error);
      }
    }

    // From class level 1 features
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        const levelFeatures = classItem.system.levelFeatures || [];
        const level1Features = levelFeatures.filter(f => f.level === 1);
        for (const feature of level1Features) {
          const allowed = feature.allowedPerks || [];
          const amount = feature.perkAmount || 0;
          // If amount is >= options, they are all guaranteed
          if (amount > 0 && amount >= allowed.length && allowed.length > 0) {
            allowed.forEach(uuid => {
              if (uuid) guaranteedPerks.add(uuid);
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load class for guaranteed perks:', error);
      }
    }

    return Array.from(guaranteedPerks);
  }

  /**
   * Get total perk limit from selected ancestry and class
   * @private
   */
  async _getPerkLimit(state) {
    let limit = 0;

    // From ancestry traits
    if (state.selectedAncestry) {
      try {
        const ancestry = await fromUuid(state.selectedAncestry);
        const traits = ancestry.system.traits || [];
        for (const trait of traits) {
          limit += (trait.perkAmount || 0);
        }
      } catch (error) {
        console.warn('Failed to get perk limit from ancestry:', error);
      }
    }

    // From class level 1 features
    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        const levelFeatures = classItem.system.levelFeatures || [];
        const level1Features = levelFeatures.filter(f => f.level === 1);
        for (const feature of level1Features) {
          limit += (feature.perkAmount || 0);
        }
      } catch (error) {
        console.warn('Failed to get perk limit from class:', error);
      }
    }

    return limit;
  }

  /**
   * Load available perk options with prerequisite checking
   * Filters based on active grant if present
   * @private
   */
  async _loadPerkOptions(state, allKnownSpells = [], activeGrant = null) {
    await this.dataService.ensureDataLoaded(['perks']);

    const perks = this.dataService.getFilteredItems('perks', {});
    const grants = state.perkGrants || [];
    const classPerks = state.classPerks || [];
    const previewActor = await this._createPreviewActor(state, allKnownSpells);

    // Collect all selected perk UUIDs from grants
    const selectedPerks = grants.filter(g => g.fulfilled).map(g => g.fulfilled);

    // Determine filtering based on active grant
    const shouldFilter = activeGrant && activeGrant.allowedPerks.length > 0;
    const allowedPerkUuids = shouldFilter ? new Set(activeGrant.allowedPerks) : new Set();

    // Sort perks alphabetically
    const sortedPerks = perks.sort((a, b) => a.name.localeCompare(b.name));

    const perkOptions = [];

    for (const perk of sortedPerks) {
      try {
        const perkItem = await fromUuid(perk.uuid);
        if (!perkItem) continue;

        const prereqCheck = await this._checkPerkPrerequisites(perkItem, previewActor, allKnownSpells);
        const isSelected = selectedPerks.includes(perk.uuid) || classPerks.includes(perk.uuid);

        // Determine if perk is allowed by active grant
        const isAllowedByActiveGrant = !shouldFilter || allowedPerkUuids.has(perk.uuid) || isSelected;

        // If "Show All" is disabled, filter by prerequisites
        if (!this.showAllPerks && !prereqCheck.met && !isSelected) {
          continue;
        }

        // Mark perks as ghosted if not allowed by active grant (when Show All is enabled)
        const isGhosted = this.showAllPerks && shouldFilter && !allowedPerkUuids.has(perk.uuid) && !isSelected;

        // If Show All is disabled and not allowed by active grant, skip
        if (!this.showAllPerks && !isAllowedByActiveGrant) {
          continue;
        }

        perkOptions.push({
          ...perk,
          uuid: perk.uuid,
          name: perk.name,
          img: perk.img,
          type: 'perk',
          selected: isSelected,
          prerequisitesMet: prereqCheck.met,
          isClassPerk: classPerks.includes(perk.uuid),
          isGhosted: isGhosted
        });
      } catch (error) {
        console.warn(`Failed to process perk ${perk.uuid}:`, error);
      }
    }

    return perkOptions;
  }

  /**
   * Create preview actor for prerequisite checking
   * @private
   */
  async _createPreviewActor(state, allKnownSpells = []) {
    // Create a comprehensive preview actor with all current selections
    // for accurate prerequisite checking

    // Build stats object with value property for each stat
    const stats = {};
    const assignedStats = state.assignedStats || {};
    for (const [statName, statValue] of Object.entries(assignedStats)) {
      stats[statName] = {
        value: statValue || 0,
        total: statValue || 0
      };
    }

    // Load ancestry and class data for additional context
    let ancestryData = null;
    let classData = null;

    if (state.selectedAncestry) {
      try {
        const ancestry = await fromUuid(state.selectedAncestry);
        if (ancestry) {
          ancestryData = {
            name: ancestry.name,
            beingType: ancestry.system?.beingType || 'humanlike',
            size: ancestry.system?.size || 'medium'
          };
        }
      } catch (error) {
        console.warn('Failed to load ancestry for preview actor:', error);
      }
    }

    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        if (classItem) {
          classData = {
            name: classItem.name,
            isSpellcaster: classItem.system?.isSpellcaster || false,
            castingStat: classItem.system?.castingStat || 'reason',
            manaMultiplier: classItem.system?.manaMultiplier || 0
          };
        }
      } catch (error) {
        console.warn('Failed to load class for preview actor:', error);
      }
    }

    // Build comprehensive system data
    const systemData = {
      stats: stats,
      skills: state.skills || [],
      spells: allKnownSpells,
      perks: state.perks || [],
      classPerks: state.classPerks || [],
      attributes: {
        level: { value: 1 }, // New characters start at level 1
        beingType: ancestryData?.beingType || 'humanlike',
        size: ancestryData?.size || 'medium',
        isSpellcaster: classData?.isSpellcaster || false,
        castingStat: classData?.castingStat || 'reason',
        manaMultiplier: classData?.manaMultiplier || 0
      },
      ancestry: ancestryData,
      class: classData
    };

    // Return mock actor object with comprehensive data
    return {
      system: systemData,
      items: [] // Empty items array for now
    };
  }

  /**
   * Check perk prerequisites
   * @private
   */
  async _checkPerkPrerequisites(perkItem, actor, knownSpellUuids = []) {
    const prereqs = perkItem.system.prerequisites || {};
    const missing = [];

    // Check if any prerequisites are set
    const hasAnyPrereqs =
      (prereqs.stats?.length > 0) ||
      (prereqs.trainedSkills?.length > 0) ||
      (prereqs.spells?.length > 0) ||
      prereqs.hasAnySpell ||
      (prereqs.resources?.length > 0);

    if (!hasAnyPrereqs) {
      return { met: true, missing: [] };
    }

    // Check stat prerequisites
    if (prereqs.stats?.length > 0) {
      for (const statReq of prereqs.stats) {
        const statValue = actor.system.stats?.[statReq.stat]?.value || 0;
        if (statValue < statReq.value) {
          missing.push(`${statReq.stat} ${statReq.value}+`);
        }
      }
    }

    // Check skill prerequisites
    if (prereqs.trainedSkills?.length > 0) {
      const actorSkills = actor.system.skills || [];
      for (const skill of prereqs.trainedSkills) {
        if (!actorSkills.includes(skill)) {
          missing.push(`Skill: ${skill}`);
        }
      }
    }

    // Check "has any spell" prerequisite
    if (prereqs.hasAnySpell && knownSpellUuids.length === 0) {
      missing.push('Any spell');
    }

    // Check specific spell prerequisites
    if (prereqs.spells?.length > 0) {
      for (const spellUuid of prereqs.spells) {
        if (!knownSpellUuids.includes(spellUuid)) {
          try {
            const spell = await fromUuid(spellUuid);
            missing.push(`Spell: ${spell?.name || 'Unknown'}`);
          } catch (error) {
            missing.push('Spell: Unknown');
          }
        }
      }
    }

    return {
      met: missing.length === 0,
      missing: missing
    };
  }

  /**
   * Format prerequisites for display
   * @private
   */
  async _formatPrerequisites(perkItem, actor, knownSpellUuids = []) {
    const prereqs = perkItem.system.prerequisites || {};
    const parts = [];

    // Stat prerequisites
    if (prereqs.stats?.length > 0) {
      const statParts = prereqs.stats.map(s => {
        const abbr = CONFIG.VAGABOND.statAbbreviations[s.stat];
        const localizedAbbr = game.i18n.localize(abbr);
        const statValue = actor.system.stats?.[s.stat]?.value || 0;
        const isMet = statValue >= s.value;
        const text = `${localizedAbbr} ${s.value}+`;
        return isMet ? text : `<span class="prereq-not-met">${text}</span>`;
      });
      parts.push(`<strong>Stat:</strong> ${statParts.join(', ')}`);
    }

    // Skill prerequisites
    if (prereqs.trainedSkills?.length > 0) {
      const actorSkills = actor.system.skills || [];
      const skillParts = prereqs.trainedSkills.map(skill => {
        const isMet = actorSkills.includes(skill);
        // Capitalize first letter to match en.json keys (e.g., "athletics" -> "Athletics")
        const capitalizedSkill = skill.charAt(0).toUpperCase() + skill.slice(1);
        const skillName = game.i18n.localize(`VAGABOND.Skills.${capitalizedSkill}`);
        return isMet ? skillName : `<span class="prereq-not-met">${skillName}</span>`;
      });
      parts.push(`<strong>Skill:</strong> ${skillParts.join(', ')}`);
    }

    // "Has any spell" prerequisite
    if (prereqs.hasAnySpell) {
      const hasAnySpellMet = knownSpellUuids.length > 0;
      const text = game.i18n.localize('VAGABOND.Item.Perk.HasAnySpell');
      parts.push(`<strong>Spell:</strong> ${hasAnySpellMet ? text : `<span class="prereq-not-met">${text}</span>`}`);
    }

    // Specific spell prerequisites
    if (prereqs.spells?.length > 0) {
      const spellParts = [];
      for (const uuid of prereqs.spells) {
        if (!uuid) continue;
        try {
          const spell = await fromUuid(uuid);
          if (spell) {
            const hasSpell = knownSpellUuids.includes(uuid);
            spellParts.push(hasSpell ? spell.name : `<span class="prereq-not-met">${spell.name}</span>`);
          }
        } catch (error) {
          spellParts.push('<span class="prereq-not-met">Unknown Spell</span>');
        }
      }
      if (spellParts.length > 0) {
        parts.push(`<strong>Spell:</strong> ${spellParts.join(', ')}`);
      }
    }

    return parts.join('<br>');
  }

  /**
   * Prepare tray data for selected perks
   * Includes grant source information for ALL perks
   * @private
   */
  async _prepareTrayData(selectedPerks, classPerks, grants = []) {
    const trayItems = [];
    const allPerks = [...new Set([...classPerks, ...selectedPerks])];

    for (const uuid of allPerks) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          // Find which grant this perk fulfills
          const grant = grants.find(g => g.fulfilled === uuid);

          // Always show grant label for all perks
          let grantLabel = null;
          if (grant) {
            grantLabel = `${grant.sourceName} - ${grant.featureName}`;
          } else if (classPerks.includes(uuid)) {
            // For class perks (guaranteed/auto-granted), show generic label
            grantLabel = 'Granted by class';
          }

          trayItems.push({
            uuid: uuid,
            name: item.name,
            img: item.img,
            type: 'perk',
            isClassPerk: classPerks.includes(uuid),
            canDelete: !classPerks.includes(uuid), // Can't remove class perks
            grantLabel: grantLabel,
            grantId: grant?.id || null
          });
        }
      } catch (error) {
        console.warn(`Failed to load perk ${uuid}:`, error);
      }
    }

    return {
      perks: trayItems,
      isEmpty: trayItems.length === 0
    };
  }

  /**
   * Get origin references (ancestry and class info)
   * @private
   */
  async _getOriginReferences(state) {
    const data = { ancestry: null, class: null };
    
    if (state.selectedAncestry) {
      try {
        const item = await fromUuid(state.selectedAncestry);
        if (item) {
          data.ancestry = { 
            name: item.name, 
            traits: item.system.traits || [] 
          };
        }
      } catch (error) {
        console.warn('Failed to load ancestry for origin references:', error);
      }
    }
    
    if (state.selectedClass) {
      try {
        const item = await fromUuid(state.selectedClass);
        if (item) {
          data.class = { 
            name: item.name,
            isSpellcaster: item.system.isSpellcaster || false
          };
        }
      } catch (error) {
        console.warn('Failed to load class for origin references:', error);
      }
    }
    
    return data;
  }

  /**
   * Handle perk selection (preview)
   * @private
   */
  async _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    // Set preview
    this.updateState('previewUuid', uuid);
  }

  /**
   * Handle adding perk to tray
   * Fulfills the active grant with the selected perk
   * @private
   */
  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const grants = state.perkGrants || [];
    const classPerks = state.classPerks || [];

    // Find the active grant (first unfulfilled)
    const activeGrant = grants.find(g => !g.fulfilled);
    if (!activeGrant) {
      ui.notifications.warn('All perk grants have been fulfilled');
      return;
    }

    // Check if perk is already selected (in any grant)
    const alreadySelected = grants.some(g => g.fulfilled === uuid) || classPerks.includes(uuid);
    if (alreadySelected) {
      ui.notifications.warn('Perk already selected');
      return;
    }

    // Check if perk matches the active grant's restrictions
    if (!this._perkMatchesGrant(uuid, activeGrant)) {
      ui.notifications.warn('This perk is not allowed for the current grant');
      return;
    }

    try {
      // Validate the perk exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'perk') {
        ui.notifications.error('Invalid perk selection');
        return;
      }

      // Check prerequisites (warning only, not blocking)
      const mandatorySpells = await this._collectRequiredSpells(state);
      const allKnownSpells = [...new Set([...(state.spells || []), ...mandatorySpells])];
      const previewActor = await this._createPreviewActor(state, allKnownSpells);
      const prereqCheck = await this._checkPerkPrerequisites(item, previewActor, allKnownSpells);

      if (!prereqCheck.met) {
        ui.notifications.warn(`Warning: Prerequisites not met - ${prereqCheck.missing.join(', ')}`);
        // Continue anyway - prerequisites are warnings, not requirements
      }

      // Fulfill the active grant
      activeGrant.fulfilled = uuid;
      this.updateState('perkGrants', grants);
      this.updateState('previewUuid', uuid);

    } catch (error) {
      console.error('Failed to add perk:', error);
      ui.notifications.error('Failed to add perk');
    }
  }

  /**
   * Handle removing perk from tray
   * Unfulfills the grant and reactivates it
   * @private
   */
  async _onRemoveFromTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const grants = state.perkGrants || [];
    const classPerks = state.classPerks || [];

    // Can't remove class perks
    if (classPerks.includes(uuid)) {
      ui.notifications.warn('Cannot remove class perks');
      return;
    }

    // Find the grant that this perk fulfills
    const grant = grants.find(g => g.fulfilled === uuid);
    if (!grant) {
      ui.notifications.warn('Perk not in selection');
      return;
    }

    try {
      // Unfulfill the grant
      grant.fulfilled = null;
      this.updateState('perkGrants', grants);

      // Clear preview if removing the previewed item
      if (state.previewUuid === uuid) {
        this.updateState('previewUuid', null);
      }

    } catch (error) {
      console.error('Failed to remove perk:', error);
      ui.notifications.error('Failed to remove perk');
    }
  }

  /**
   * Handle clearing all perks from tray
   * Unfulfills all grants
   * @private
   */
  async _onClearTray(event, target) {
    const state = this.getCurrentState();
    const grants = state.perkGrants || [];

    const hasFulfilledGrants = grants.some(g => g.fulfilled);
    if (!hasFulfilledGrants) {
      return;
    }

    // Unfulfill all grants
    grants.forEach(g => g.fulfilled = null);
    this.updateState('perkGrants', grants);
    this.updateState('previewUuid', null);

  }

  /**
   * Handle toggling show all perks
   * @private
   */
  _onToggleShowAllPerks(event, target) {
    this.showAllPerks = !this.showAllPerks;

    // Update state to persist the toggle
    this.updateState('showAllPerks', this.showAllPerks);

    // Trigger re-render to update the perk list
    if (this.render) {
      this.render();
    }
  }

  /**
   * Check if step is complete (optional step)
   */
  isComplete() {
    // Perks step is always considered complete (optional)
    return true;
  }

  /**
   * Reset perks step
   * @protected
   */
  _onReset() {
    const state = this.getCurrentState();
    const grants = state.perkGrants || [];

    // Unfulfill all grants
    grants.forEach(g => g.fulfilled = null);
    this.updateState('perkGrants', grants, { skipValidation: true });
  }

  /**
   * Step-specific activation logic
   * @protected
   */
  async _onActivate() {
    // Ensure perk data is loaded and ready
    await this.dataService.ensureDataLoaded(['perks']);

    // Sync showAllPerks from state
    const state = this.getCurrentState();
    if (state.showAllPerks !== undefined) {
      this.showAllPerks = state.showAllPerks;
    }

  }
}