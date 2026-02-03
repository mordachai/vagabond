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
    return ['perks', 'classPerks', 'previewUuid'];
  }

  /**
   * Prepare perks-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state) {
    // Collect and auto-add guaranteed perks (single-choice allowed perks)
    const guaranteedPerks = await this._collectGuaranteedPerks(state);
    const currentClassPerks = state.classPerks || [];
    const updatedClassPerks = [...new Set([...currentClassPerks, ...guaranteedPerks])];
    
    if (updatedClassPerks.length !== currentClassPerks.length) {
      this.updateState('classPerks', updatedClassPerks);
      // Update local reference to use the new state
      state.classPerks = updatedClassPerks;
    }

    const availablePerks = await this._loadPerkOptions(state);
    const selectedPerks = state.perks || [];
    const classPerks = state.classPerks || [];
    const previewUuid = state.previewUuid;

    // Check if perks are being filtered by ancestry traits or class level 1 features
    let hasAllowedPerksRestriction = false;
    let restrictionSource = '';

    if (state.selectedAncestry) {
      try {
        const ancestry = await fromUuid(state.selectedAncestry);
        const traits = ancestry.system.traits || [];
        for (const trait of traits) {
          if ((trait.allowedPerks || []).length > 0) {
            hasAllowedPerksRestriction = true;
            restrictionSource = restrictionSource
              ? `${restrictionSource}, ${trait.name}`
              : trait.name;
          }
        }
      } catch (error) {
        console.warn('Failed to load ancestry for restriction notice:', error);
      }
    }

    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        const levelFeatures = classItem.system.levelFeatures || [];
        const level1Features = levelFeatures.filter(f => f.level === 1);
        for (const feature of level1Features) {
          if ((feature.allowedPerks || []).length > 0) {
            hasAllowedPerksRestriction = true;
            restrictionSource = restrictionSource
              ? `${restrictionSource}, ${feature.name}`
              : feature.name;
          }
        }
      } catch (error) {
        console.warn('Failed to load class for restriction notice:', error);
      }
    }

    // Get preview item details with prerequisite checking
    let previewItem = null;
    if (previewUuid) {
      try {
        const item = await fromUuid(previewUuid);
        if (item) {
          const previewActor = await this._createPreviewActor(state);
          const prereqCheck = await this._checkPerkPrerequisites(item, previewActor, state.spells || []);
          const prerequisitesHTML = await this._formatPrerequisites(item, previewActor, state.spells || []);

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

    // Prepare tray data
    const trayData = await this._prepareTrayData(selectedPerks, classPerks);

    // Get origin references for display
    const originReferences = await this._getOriginReferences(state);

    return {
      availableOptions: availablePerks,
      selectedPerks: selectedPerks,
      classPerks: classPerks,
      selectedItem: previewItem,
      previewItem: previewItem,
      hasSelection: selectedPerks.length > 0 || classPerks.length > 0,
      showTray: true,
      trayData: trayData,
      useTripleColumn: true,
      showAllPerks: this.showAllPerks,
      originReferences: originReferences,
      hasAllowedPerksRestriction: hasAllowedPerksRestriction,
      restrictionSource: restrictionSource,
      instruction: (selectedPerks.length === 0 && classPerks.length === 0 && !previewUuid) ?
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Perks') : null
    };
  }

  /**
   * Collect guaranteed perks from ancestry traits and class level 1 features
   * (where allowedPerks has exactly 1 entry)
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
          if (allowed.length === 1 && allowed[0]) {
            guaranteedPerks.add(allowed[0]);
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
          if (allowed.length === 1 && allowed[0]) {
            guaranteedPerks.add(allowed[0]);
          }
        }
      } catch (error) {
        console.warn('Failed to load class for guaranteed perks:', error);
      }
    }

    return Array.from(guaranteedPerks);
  }

  /**
   * Load available perk options with prerequisite checking
   * @private
   */
  async _loadPerkOptions(state) {
    await this.dataService.ensureDataLoaded(['perks']);

    const perks = this.dataService.getFilteredItems('perks', {});
    const selectedPerks = state.perks || [];
    const classPerks = state.classPerks || [];
    const previewActor = await this._createPreviewActor(state);

    // Collect allowed perks from ancestry traits and class level 1 features
    const allowedPerkUuids = new Set();
    let hasAllowedPerksRestriction = false;

    if (state.selectedAncestry) {
      try {
        const ancestry = await fromUuid(state.selectedAncestry);
        const traits = ancestry.system.traits || [];
        for (const trait of traits) {
          const traitAllowed = trait.allowedPerks || [];
          if (traitAllowed.length > 0) {
            hasAllowedPerksRestriction = true;
            traitAllowed.forEach(uuid => {
              if (uuid) allowedPerkUuids.add(uuid);
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load ancestry for allowed perks:', error);
      }
    }

    if (state.selectedClass) {
      try {
        const classItem = await fromUuid(state.selectedClass);
        const levelFeatures = classItem.system.levelFeatures || [];
        const level1Features = levelFeatures.filter(f => f.level === 1);
        for (const feature of level1Features) {
          const featureAllowed = feature.allowedPerks || [];
          if (featureAllowed.length > 0) {
            hasAllowedPerksRestriction = true;
            featureAllowed.forEach(uuid => {
              if (uuid) allowedPerkUuids.add(uuid);
            });
          }
        }
      } catch (error) {
        console.warn('Failed to load class for allowed perks:', error);
      }
    }

    // Sort perks alphabetically
    const sortedPerks = perks.sort((a, b) => a.name.localeCompare(b.name));

    const perkOptions = [];

    for (const perk of sortedPerks) {
      try {
        const perkItem = await fromUuid(perk.uuid);
        if (!perkItem) continue;

        const prereqCheck = await this._checkPerkPrerequisites(perkItem, previewActor, state.spells || []);
        const isSelected = selectedPerks.includes(perk.uuid) || classPerks.includes(perk.uuid);

        // If there are allowed perks restrictions and this perk isn't in the list, skip it (unless already selected)
        if (hasAllowedPerksRestriction && !allowedPerkUuids.has(perk.uuid) && !isSelected) {
          continue;
        }

        // Filter based on showAllPerks setting
        if (!this.showAllPerks && !prereqCheck.met && !isSelected) {
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
          isClassPerk: classPerks.includes(perk.uuid)
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
  async _createPreviewActor(state) {
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
      spells: state.spells || [],
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
   * @private
   */
  async _prepareTrayData(selectedPerks, classPerks) {
    const trayItems = [];
    const allPerks = [...new Set([...classPerks, ...selectedPerks])];

    for (const uuid of allPerks) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          trayItems.push({
            uuid: uuid,
            name: item.name,
            img: item.img,
            type: 'perk',
            isClassPerk: classPerks.includes(uuid),
            canDelete: !classPerks.includes(uuid) // Can't remove class perks
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
   * @private
   */
  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const currentPerks = state.perks || [];
    const classPerks = state.classPerks || [];

    // Check if already selected
    if (currentPerks.includes(uuid) || classPerks.includes(uuid)) {
      ui.notifications.warn('Perk already selected');
      return;
    }

    try {
      // Validate the perk exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'perk') {
        ui.notifications.error('Invalid perk selection');
        return;
      }

      // Check prerequisites
      const previewActor = await this._createPreviewActor(state);
      const prereqCheck = await this._checkPerkPrerequisites(item, previewActor, state.spells || []);
      
      if (!prereqCheck.met) {
        ui.notifications.warn(`Prerequisites not met: ${prereqCheck.missing.join(', ')}`);
        return;
      }

      // Add to selected perks
      const newPerks = [...currentPerks, uuid];
      this.updateState('perks', newPerks);
      this.updateState('previewUuid', uuid);
      
      
    } catch (error) {
      console.error('Failed to add perk:', error);
      ui.notifications.error('Failed to add perk');
    }
  }

  /**
   * Handle removing perk from tray
   * @private
   */
  async _onRemoveFromTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const currentPerks = state.perks || [];
    const classPerks = state.classPerks || [];

    // Can't remove class perks
    if (classPerks.includes(uuid)) {
      ui.notifications.warn('Cannot remove class perks');
      return;
    }

    if (!currentPerks.includes(uuid)) {
      ui.notifications.warn('Perk not in selection');
      return;
    }

    try {
      const item = await fromUuid(uuid);
      const newPerks = currentPerks.filter(perkUuid => perkUuid !== uuid);
      
      this.updateState('perks', newPerks);
      
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
   * @private
   */
  async _onClearTray(event, target) {
    const state = this.getCurrentState();
    const currentPerks = state.perks || [];

    if (currentPerks.length === 0) {
      return;
    }

    this.updateState('perks', []);
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
    this.updateState('perks', [], { skipValidation: true });
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