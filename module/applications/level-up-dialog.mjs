/**
 * Level-Up Dialog
 *
 * A tabbed ApplicationV2 dialog that guides players through all level-up decisions:
 * - XP Questionnaire (award XP from session questions)
 * - Summary (what the character gains at the new level)
 * - Stat Increase (pick one stat to increase, even levels by default)
 * - Perks (choose a perk from class grants, odd levels > 1 by default)
 * - Spells (choose new spells if the class/perks/ancestry grants them)
 */

import { CharacterBuilderDataService } from './char-builder/services/data-service.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class LevelUpDialog extends HandlebarsApplicationMixin(ApplicationV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'level-up-dialog',
    classes: ['vagabond', 'level-up-dialog'],
    tag: 'div',
    window: {
      title: 'VAGABOND.LevelUp.DialogTitle',
      icon: 'fas fa-arrow-up',
      resizable: true,
    },
    position: {
      width: 720,
      height: 'auto',
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: false,
    },
    actions: {
      toggleQuestion: LevelUpDialog._onToggleQuestion,
      awardXP: LevelUpDialog._onAwardXP,
      triggerLevelUp: LevelUpDialog._onTriggerLevelUp,
      selectStat: LevelUpDialog._onSelectStat,
      selectPerk: LevelUpDialog._onSelectPerk,
      addPerk: LevelUpDialog._onAddPerk,
      removePerk: LevelUpDialog._onRemovePerk,
      selectSpell: LevelUpDialog._onSelectSpell,
      addSpell: LevelUpDialog._onAddSpell,
      removeSpell: LevelUpDialog._onRemoveSpell,
      changeTab: LevelUpDialog._onChangeTab,
      toggleGmOverride: LevelUpDialog._onToggleGmOverride,
      toggleShowAllPerks: LevelUpDialog._onToggleShowAllPerks,
      applyLevelUp: LevelUpDialog._onApplyLevelUp,
    },
  };

  /** @override */
  static PARTS = {
    levelUp: {
      template: 'systems/vagabond/templates/apps/level-up.hbs',
      scrollable: ['.level-up-tab-content'],
    },
  };

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;

    // Data service for loading perks/spells from compendiums
    this.dataService = new CharacterBuilderDataService();

    // Dialog state
    this.activeTab = 'questionnaire';
    this.gmOverride = false;

    // XP questionnaire state
    this.questions = [false, false, false, false, false];
    this.xpAwarded = false;

    // Whether the level has been incremented in this dialog session
    this.levelApplied = false;

    // Stat increase selection
    this.selectedStat = null;

    // Perk selection state
    this.selectedPerkUuid = null; // preview
    this.chosenPerkUuid = null; // added to tray
    this.perkChoice = null; // for choice-based perks
    this.showAllPerks = false; // toggle to show perks that don't meet prerequisites
    this.chosenPerkPrereqsMet = true; // track if chosen perk met prerequisites

    // Spell selection state
    this.selectedSpellUuid = null; // preview
    this.chosenSpells = []; // added to tray

    // Cache
    this._perkCache = null;
    this._spellCache = null;
  }

  /** @override */
  get title() {
    return `${game.i18n.localize('VAGABOND.LevelUp.DialogTitle')} — ${this.actor.name}`;
  }

  // ─── Tab & Level Helpers ──────────────────────────────────

  /**
   * The level the character will reach after leveling up
   */
  get newLevel() {
    return this.actor.system.attributes.level.value + (this.levelApplied ? 0 : 1);
  }

  /**
   * The current level before level up
   */
  get currentLevel() {
    return this.actor.system.attributes.level.value - (this.levelApplied ? 1 : 0);
  }

  /**
   * Whether the new level is even (stat increase)
   */
  get isEvenLevel() {
    return this.newLevel % 2 === 0;
  }

  /**
   * Whether the new level qualifies for a perk (odd levels > 1)
   */
  get isPerkLevel() {
    return this.newLevel > 1 && this.newLevel % 2 !== 0;
  }

  /**
   * Get the actor's class item
   */
  get classItem() {
    return this.actor.items.find(i => i.type === 'class') ?? null;
  }

  /**
   * Check if actor is a spellcaster (from class, perks, or ancestry via Active Effects)
   */
  get isSpellcaster() {
    return this.actor.system.attributes.isSpellcaster;
  }

  /**
   * Get new spells granted at the new level
   */
  get newSpellSlots() {
    if (!this.isSpellcaster || !this.classItem) return 0;
    const levelSpells = this.classItem.system.levelSpells || [];
    const currentLevelData = levelSpells.find(ls => ls.level === this.currentLevel);
    const newLevelData = levelSpells.find(ls => ls.level === this.newLevel);
    const prevSpells = currentLevelData?.spells || 0;
    const nextSpells = newLevelData?.spells || 0;
    return Math.max(0, nextSpells - prevSpells);
  }

  /**
   * Get level features for the new level
   */
  get newLevelFeatures() {
    if (!this.classItem) return [];
    return this.classItem.system.levelFeatures.filter(f => f.level === this.newLevel);
  }

  /**
   * Which tabs should be visible
   */
  get visibleTabs() {
    const tabs = ['questionnaire'];

    // Stat increase: even levels, or GM override
    if (this.isEvenLevel || this.gmOverride) {
      tabs.push('stats');
    }

    // Perks: odd levels > 1, or if level features grant perks, or GM override
    const hasPerkGrants = this.newLevelFeatures.some(f => (f.perkAmount || 0) > 0);
    if (this.isPerkLevel || hasPerkGrants || this.gmOverride) {
      tabs.push('perks');
    }

    // Spells: if spellcaster gains new spells, or level features grant spells
    const hasSpellGrants = this.newLevelFeatures.some(f => (f.requiredSpells?.length || 0) > 0);
    if ((this.isSpellcaster && this.newSpellSlots > 0) || hasSpellGrants || this.gmOverride) {
      tabs.push('spells');
    }

    // Summary is always last
    tabs.push('summary');

    return tabs;
  }

  // ─── Context Preparation ──────────────────────────────────

  /** @override */
  async _prepareContext(options) {
    const context = {};
    const sys = this.actor.system;

    // Basic info
    context.actor = this.actor;
    context.system = sys;
    context.currentLevel = this.currentLevel;
    context.newLevel = this.newLevel;
    context.isGM = game.user.isGM;
    context.gmOverride = this.gmOverride;
    context.levelApplied = this.levelApplied;

    // Footer buttons — always visible
    const canLevelFromXP = (sys.attributes.xp || 0) >= (sys.attributes.xpRequired || 10) && !this.levelApplied;
    context.showLevelUpBtn = (canLevelFromXP || (sys.attributes.canLevelUp && !this.levelApplied));
    context.showApplyBtn = this.levelApplied;

    // Tab state
    context.activeTab = this.activeTab;
    context.visibleTabs = this.visibleTabs;
    context.tabs = this._prepareTabData();

    // XP Questionnaire
    context.questionnaire = this._prepareQuestionnaireContext();

    // Summary
    context.summary = await this._prepareSummaryContext();

    // Stat Increase
    if (this.visibleTabs.includes('stats')) {
      context.statIncrease = this._prepareStatIncreaseContext();
    }

    // Perks
    if (this.visibleTabs.includes('perks')) {
      context.perks = await this._preparePerksContext();
    }

    // Spells
    if (this.visibleTabs.includes('spells')) {
      context.spells = await this._prepareSpellsContext();
    }

    return context;
  }

  _prepareTabData() {
    const visible = this.visibleTabs;
    const tabDefs = [
      { id: 'questionnaire', label: 'XP', icon: 'fas fa-star' },
      { id: 'stats', label: 'Stats', icon: 'fas fa-chart-bar' },
      { id: 'perks', label: 'Perks', icon: 'fas fa-gem' },
      { id: 'spells', label: 'Spells', icon: 'fas fa-hat-wizard' },
      { id: 'summary', label: 'Summary', icon: 'fas fa-scroll' },
    ];
    return tabDefs
      .filter(t => visible.includes(t.id))
      .map(t => ({ ...t, active: t.id === this.activeTab }));
  }

  _prepareQuestionnaireContext() {
    const sys = this.actor.system;
    const questionLabels = [
      'Did you complete a Quest?',
      'Did you Fail and allow the Fail to resolve?',
      'Did you pass a Hindered Check?',
      'Did you make a discovery?',
      'Did you loot at least 50g of treasure?',
    ];

    const xpGained = this.questions.filter(Boolean).length;
    const currentXP = sys.attributes.xp || 0;
    const xpRequired = sys.attributes.xpRequired || 10;
    const projectedXP = currentXP + (this.xpAwarded ? 0 : xpGained);
    const canLevelUp = projectedXP >= xpRequired && !this.levelApplied;
    const currentLevel = sys.attributes.level.value || 1;
    const xpProgress = Math.min(100, Math.round((projectedXP / xpRequired) * 100));

    return {
      questions: questionLabels.map((label, i) => ({
        index: i,
        label,
        checked: this.questions[i],
      })),
      xpGained,
      currentXP,
      xpRequired,
      projectedXP,
      xpProgress,
      currentLevel,
      nextLevel: currentLevel + 1,
      canLevelUp,
      xpAwarded: this.xpAwarded,
      alreadyCanLevel: sys.attributes.canLevelUp && !this.levelApplied,
    };
  }

  async _prepareSummaryContext() {
    const sys = this.actor.system;
    const features = this.newLevelFeatures;

    // Enrich feature descriptions
    const enrichedFeatures = [];
    for (const f of features) {
      const enriched = await foundry.applications.ux.TextEditor.enrichHTML(f.description || '', {
        async: true,
        secrets: false,
      });
      enrichedFeatures.push({
        name: f.name,
        description: enriched,
        statBonusPoints: f.statBonusPoints || 0,
        extraTraining: f.extraTraining || 0,
        perkAmount: f.perkAmount || 0,
      });
    }

    // Calculate projected changes
    // We can't calculate exact new HP/mana without actually applying the level,
    // so we show current values and what changes at the new level
    const checklist = [];

    if (this.isEvenLevel || this.gmOverride) {
      checklist.push({
        label: 'Choose a stat to increase by +1',
        tab: 'stats',
        done: !!this.selectedStat,
      });
    }

    const hasPerkGrants = features.some(f => (f.perkAmount || 0) > 0);
    if (this.isPerkLevel || hasPerkGrants || this.gmOverride) {
      checklist.push({
        label: 'Choose a perk',
        tab: 'perks',
        done: !!this.chosenPerkUuid,
      });
    }

    if ((this.isSpellcaster && this.newSpellSlots > 0) || this.gmOverride) {
      checklist.push({
        label: `Learn ${this.newSpellSlots || 'new'} spell(s)`,
        tab: 'spells',
        done: this.chosenSpells.length > 0,
      });
    }

    return {
      newLevel: this.newLevel,
      features: enrichedFeatures,
      hasFeatures: enrichedFeatures.length > 0,
      checklist,
      hasChecklist: checklist.length > 0,
      isSpellcaster: this.isSpellcaster,
      levelApplied: this.levelApplied,
    };
  }

  _prepareStatIncreaseContext() {
    const sys = this.actor.system;
    const stats = sys.stats;
    const selected = this.selectedStat;

    // Build a preview totals map: if a stat is selected, its total is +1
    const previewTotals = {};
    for (const [key] of Object.entries(CONFIG.VAGABOND.stats)) {
      previewTotals[key] = (stats[key]?.total || 0) + (selected === key ? 1 : 0);
    }

    const statEntries = Object.entries(CONFIG.VAGABOND.stats).map(([key, label]) => {
      const current = stats[key]?.value || 0;
      const total = stats[key]?.total || current;
      const isMaxed = current >= 7;
      const isSelected = selected === key;
      return {
        key,
        label: game.i18n.localize(label),
        abbr: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[key] || ''),
        current,
        total,
        isMaxed,
        isSelected,
        preview: isSelected ? current + 1 : current,
      };
    });

    // Calculate preview derived stats using the +1 if stat is selected
    // Saves use the formula: difficulty = 20 - sum(stat totals) - bonus
    // We keep current bonuses and just adjust the stat contribution
    const savesDef = {
      reflex: { stats: ['dexterity', 'awareness'] },
      endure: { stats: ['might', 'might'] },
      will: { stats: ['reason', 'presence'] },
    };

    const saves = Object.entries(sys.saves || {}).map(([key, save]) => {
      let previewValue = save.difficulty;
      const def = savesDef[key];
      if (def && selected) {
        // Check if the selected stat affects this save
        const currentStatSum = def.stats.reduce((sum, s) => sum + (stats[s]?.total || 0), 0);
        const previewStatSum = def.stats.reduce((sum, s) => sum + previewTotals[s], 0);
        const delta = previewStatSum - currentStatSum;
        if (delta !== 0) previewValue = save.difficulty - delta;
      }
      return {
        key,
        label: save.label || key,
        statAbbr: save.statAbbr || '',
        value: save.difficulty,
        previewValue,
        changed: previewValue !== save.difficulty,
      };
    });

    // Skills: difficulty = 20 - (trained ? stat*2 : stat) - bonus
    const skills = Object.entries(sys.skills || {}).map(([key, skill]) => {
      let previewValue = skill.difficulty;
      if (selected && skill.stat === selected) {
        const multiplier = skill.trained ? 2 : 1;
        previewValue = skill.difficulty - multiplier; // -1 difficulty for each +1 stat
      }
      return {
        key,
        label: skill.label || key,
        statAbbr: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[skill.stat] || ''),
        value: skill.difficulty,
        previewValue,
        trained: skill.trained,
        changed: previewValue !== skill.difficulty,
      };
    });

    const weaponSkills = Object.entries(sys.weaponSkills || {}).map(([key, skill]) => {
      let previewValue = skill.difficulty;
      if (selected && skill.stat === selected) {
        const multiplier = skill.trained ? 2 : 1;
        previewValue = skill.difficulty - multiplier;
      }
      return {
        key,
        label: skill.label || key,
        statAbbr: game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[skill.stat] || ''),
        value: skill.difficulty,
        previewValue,
        trained: skill.trained,
        changed: previewValue !== skill.difficulty,
      };
    });

    const isSpellcaster = sys.attributes.isSpellcaster;

    // HP preview: HP increases with might (base formula depends on level + might)
    // Simple approach: +1 might = +1 HP per level (from the hpPerLevel formula in prepareDerivedData)
    // Actually the HP formula is complex, so we just note it might change
    const hpCurrent = sys.health.max;
    const hpPreview = selected === 'might' ? hpCurrent + 1 : hpCurrent;

    // Luck pool = luck total
    const luckCurrent = stats.luck?.total || 0;
    const luckPreview = selected === 'luck' ? luckCurrent + 1 : luckCurrent;

    // Inventory = might based
    const invCurrent = sys.inventory?.maxSlots || 0;
    const invPreview = selected === 'might' ? invCurrent + 1 : invCurrent;

    // Speed = dexterity based (speed.base is 25 + dex)
    const speedCurrent = sys.speed?.base || 0;
    const speedPreview = selected === 'dexterity' ? speedCurrent + 5 : speedCurrent;

    // Mana: castingStat based
    const castingStat = this.classItem?.system?.castingStat || 'reason';
    const manaCurrent = sys.mana.max;
    const castCurrent = sys.mana.castingMax;
    const manaPreview = selected === castingStat ? manaCurrent + 1 : manaCurrent;
    const castPreview = selected === castingStat ? castCurrent + 1 : castCurrent;

    return {
      stats: statEntries,
      selectedStat: selected,
      hasSelection: !!selected,
      derived: {
        hp: hpCurrent,
        hpPreview,
        hpChanged: hpPreview !== hpCurrent,
        isSpellcaster,
        manaMax: manaCurrent,
        manaMaxPreview: manaPreview,
        manaChanged: manaPreview !== manaCurrent,
        manaCast: castCurrent,
        manaCastPreview: castPreview,
        manaCastChanged: castPreview !== castCurrent,
        luckPool: luckCurrent,
        luckPreview,
        luckChanged: luckPreview !== luckCurrent,
        inventory: invCurrent,
        inventoryPreview: invPreview,
        inventoryChanged: invPreview !== invCurrent,
        speed: speedCurrent,
        speedPreview,
        speedChanged: speedPreview !== speedCurrent,
        saves,
        skills,
        weaponSkills,
      },
    };
  }

  async _preparePerksContext() {
    // Load perks from compendiums
    await this.dataService.ensureDataLoaded(['perks']);
    const allPerks = this.dataService.getAllItems('perks');

    // Determine allowed perks from level features
    const features = this.newLevelFeatures;
    const allowedPerkUuids = new Set();
    let isRestricted = false;

    for (const feature of features) {
      if (feature.allowedPerks?.length > 0) {
        feature.allowedPerks.forEach(uuid => { if (uuid) allowedPerkUuids.add(uuid); });
        isRestricted = true;
      }
    }

    // Get actor's existing perks for ownership display (by sourceId and name)
    const ownedPerkItems = this.actor.items.filter(i => i.type === 'perk');
    const ownedPerkUuids = new Set(
      ownedPerkItems.map(i => i.flags?.core?.sourceId).filter(Boolean)
    );
    const ownedPerkNames = {};
    for (const p of ownedPerkItems) {
      const key = p.name.toLowerCase().replace(/\s*\(.*\)$/, ''); // strip choice suffix like " (Athletics)"
      ownedPerkNames[key] = (ownedPerkNames[key] || 0) + 1;
    }

    // Build perk list
    const perkList = [];
    for (const perk of allPerks.sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const item = await fromUuid(perk.uuid);
        if (!item) continue;

        // Filter by allowed perks if restricted
        if (isRestricted && !allowedPerkUuids.has(perk.uuid)) continue;

        // Check prerequisites against the actual actor
        const prereqCheck = await this._checkPerkPrerequisites(item);
        const nameKey = perk.name.toLowerCase();
        const isOwned = ownedPerkUuids.has(perk.uuid) || (ownedPerkNames[nameKey] || 0) > 0;
        const ownedCount = (ownedPerkNames[nameKey] || 0);

        perkList.push({
          uuid: perk.uuid,
          name: perk.name,
          img: perk.img,
          prerequisitesMet: prereqCheck.met,
          missingPrereqs: prereqCheck.missing,
          isOwned,
          ownedCount,
          isPreviewing: perk.uuid === this.selectedPerkUuid,
          isChosen: perk.uuid === this.chosenPerkUuid,
        });
      } catch (e) {
        console.warn(`Level Up | Failed to load perk ${perk.uuid}:`, e);
      }
    }

    // Preview item
    let previewItem = null;
    if (this.selectedPerkUuid) {
      try {
        const item = await fromUuid(this.selectedPerkUuid);
        if (item) {
          const enrichedDesc = await foundry.applications.ux.TextEditor.enrichHTML(
            item.system.description || '', { async: true, secrets: false, relativeTo: item }
          );
          const prereqCheck = await this._checkPerkPrerequisites(item);
          const allPrereqs = await this._formatAllPrerequisites(item);
          previewItem = {
            uuid: this.selectedPerkUuid,
            name: item.name,
            img: item.img,
            enrichedDescription: enrichedDesc,
            prerequisitesMet: prereqCheck.met,
            missingPrereqs: prereqCheck.missing,
            allPrereqs,
            hasPrereqs: allPrereqs.length > 0,
            hasChoice: item.system.choiceConfig?.type && item.system.choiceConfig.type !== 'none',
          };
        }
      } catch (e) {
        console.warn('Level Up | Failed to load preview perk:', e);
      }
    }

    // Chosen perk for tray
    let chosenPerk = null;
    if (this.chosenPerkUuid) {
      try {
        const item = await fromUuid(this.chosenPerkUuid);
        if (item) {
          chosenPerk = {
            uuid: this.chosenPerkUuid,
            name: item.name,
            img: item.img,
            choiceLabel: this.perkChoice ? await this._getChoiceLabel(this.perkChoice, item.system.choiceConfig?.type) : null,
          };
        }
      } catch (e) {
        console.warn('Level Up | Failed to load chosen perk:', e);
      }
    }

    // Split perks into those meeting prereqs and those that don't
    const metPrereqs = perkList.filter(p => p.prerequisitesMet);
    const failedPrereqs = perkList.filter(p => !p.prerequisitesMet);
    const displayPerks = this.showAllPerks ? perkList : metPrereqs;

    return {
      availablePerks: displayPerks,
      hiddenCount: failedPrereqs.length,
      showAllPerks: this.showAllPerks,
      previewItem,
      chosenPerk,
      hasChosen: !!this.chosenPerkUuid,
      isRestricted,
    };
  }

  async _prepareSpellsContext() {
    await this.dataService.ensureDataLoaded(['spells']);
    const allSpells = this.dataService.getAllItems('spells');
    const maxNewSpells = this.newSpellSlots;

    // Get existing spells - match by both sourceId (compendium UUID) and name (fallback)
    const ownedSpellItems = this.actor.items.filter(i => i.type === 'spell');
    const existingSpellUuids = new Set(
      ownedSpellItems.map(i => i.flags?.core?.sourceId).filter(Boolean)
    );
    const existingSpellNames = new Set(
      ownedSpellItems.map(i => i.name.toLowerCase())
    );

    // Required spells from level features
    const requiredSpellUuids = [];
    for (const feature of this.newLevelFeatures) {
      if (feature.requiredSpells?.length) {
        requiredSpellUuids.push(...feature.requiredSpells.filter(u => u));
      }
    }

    // Build spell list
    const spellList = [];
    for (const spell of allSpells.sort((a, b) => a.name.localeCompare(b.name))) {
      const isOwned = existingSpellUuids.has(spell.uuid) || existingSpellNames.has(spell.name.toLowerCase());
      const isChosen = this.chosenSpells.includes(spell.uuid);
      const isRequired = requiredSpellUuids.includes(spell.uuid);

      // Get full item for extra fields
      let baseDamage = null;
      let crit = null;
      try {
        const item = await fromUuid(spell.uuid);
        if (item) {
          baseDamage = item.system.baseDamage || null;
          crit = item.system.crit || null;
        }
      } catch { /* ignore */ }

      spellList.push({
        uuid: spell.uuid,
        name: spell.name,
        img: spell.img,
        isOwned,
        isChosen,
        isRequired,
        isPreviewing: spell.uuid === this.selectedSpellUuid,
        damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[spell.damageType] || null,
        damageType: spell.damageType !== '-' ? spell.damageType : null,
        baseDamage,
        crit,
      });
    }

    // Preview item
    let previewItem = null;
    if (this.selectedSpellUuid) {
      try {
        const item = await fromUuid(this.selectedSpellUuid);
        if (item) {
          const enrichedDesc = await foundry.applications.ux.TextEditor.enrichHTML(
            item.system.description || '', { async: true, secrets: false, relativeTo: item }
          );
          const deliveryKey = item.system.delivery;
          const isOwned = existingSpellUuids.has(this.selectedSpellUuid) || existingSpellNames.has(item.name.toLowerCase());
          const isChosen = this.chosenSpells.includes(this.selectedSpellUuid);
          previewItem = {
            uuid: this.selectedSpellUuid,
            name: item.name,
            img: item.img,
            enrichedDescription: enrichedDesc,
            manaCost: item.system.manaCost || 0,
            delivery: deliveryKey || null,
            deliveryLabel: deliveryKey ? (game.i18n.localize(`VAGABOND.Spell.Delivery.${deliveryKey}`) || deliveryKey) : null,
            damageTypeIcon: CONFIG.VAGABOND.damageTypeIcons?.[item.system.damageType] || null,
            damageType: item.system.damageType !== '-' ? item.system.damageType : null,
            baseDamage: item.system.baseDamage || null,
            crit: item.system.crit || null,
            duration: item.system.duration || null,
            range: item.system.range || null,
            isOwned,
            isChosen,
          };
        }
      } catch (e) {
        console.warn('Level Up | Failed to load preview spell:', e);
      }
    }

    // Chosen spells for tray
    const chosenSpellItems = [];
    for (const uuid of this.chosenSpells) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          chosenSpellItems.push({
            uuid,
            name: item.name,
            img: item.img,
          });
        }
      } catch (e) {
        console.warn(`Level Up | Failed to load chosen spell ${uuid}:`, e);
      }
    }

    return {
      availableSpells: spellList,
      previewItem,
      chosenSpells: chosenSpellItems,
      maxNewSpells,
      currentCount: this.chosenSpells.length,
      canAddMore: this.chosenSpells.length < maxNewSpells,
      requiredSpells: requiredSpellUuids,
    };
  }

  // ─── Prerequisite Checking ────────────────────────────────

  async _checkPerkPrerequisites(perkItem) {
    const prereqs = perkItem.system.prerequisites || {};
    const missing = [];

    const hasAnyPrereqs =
      (prereqs.stats?.length > 0) ||
      (prereqs.statOrGroups?.length > 0) ||
      (prereqs.trainedSkills?.length > 0) ||
      (prereqs.trainedSkillOrGroups?.length > 0) ||
      (prereqs.spells?.length > 0) ||
      (prereqs.spellOrGroups?.length > 0) ||
      prereqs.hasAnySpell ||
      (prereqs.resources?.length > 0) ||
      (prereqs.resourceOrGroups?.length > 0);

    if (!hasAnyPrereqs) return { met: true, missing: [] };

    const sys = this.actor.system;

    // Check stat prerequisites
    if (prereqs.stats?.length > 0) {
      for (const statReq of prereqs.stats) {
        const statValue = sys.stats?.[statReq.stat]?.total || 0;
        if (statValue < statReq.value) {
          const abbr = CONFIG.VAGABOND.statAbbreviations[statReq.stat];
          missing.push(`${game.i18n.localize(abbr)} ${statReq.value}+`);
        }
      }
    }

    // Check stat OR groups
    if (prereqs.statOrGroups?.length > 0) {
      for (const group of prereqs.statOrGroups) {
        let groupMet = false;
        const groupLabels = [];
        for (const statReq of group) {
          const statValue = sys.stats?.[statReq.stat]?.total || 0;
          if (statValue >= statReq.value) { groupMet = true; break; }
          const abbr = CONFIG.VAGABOND.statAbbreviations[statReq.stat];
          groupLabels.push(`${game.i18n.localize(abbr)} ${statReq.value}+`);
        }
        if (!groupMet) missing.push(`(${groupLabels.join(' or ')})`);
      }
    }

    // Check skill prerequisites
    if (prereqs.trainedSkills?.length > 0) {
      for (const skill of prereqs.trainedSkills) {
        const isTrained = sys.skills?.[skill]?.trained || sys.weaponSkills?.[skill]?.trained;
        if (!isTrained) {
          const cap = skill.charAt(0).toUpperCase() + skill.slice(1);
          const label = CONFIG.VAGABOND.weaponSkills?.[cap] || CONFIG.VAGABOND.skills?.[cap] || skill;
          missing.push(`Trained: ${game.i18n.localize(label)}`);
        }
      }
    }

    // Check trained skill OR groups
    if (prereqs.trainedSkillOrGroups?.length > 0) {
      for (const group of prereqs.trainedSkillOrGroups) {
        let groupMet = false;
        const groupLabels = [];
        for (const skill of group) {
          const isTrained = sys.skills?.[skill]?.trained || sys.weaponSkills?.[skill]?.trained;
          if (isTrained) { groupMet = true; break; }
          const cap = skill.charAt(0).toUpperCase() + skill.slice(1);
          const label = CONFIG.VAGABOND.weaponSkills?.[cap] || CONFIG.VAGABOND.skills?.[cap] || skill;
          groupLabels.push(game.i18n.localize(label));
        }
        if (!groupMet) missing.push(`Trained: (${groupLabels.join(' or ')})`);
      }
    }

    // Check has any spell
    if (prereqs.hasAnySpell) {
      const hasSpells = this.actor.items.some(i => i.type === 'spell');
      if (!hasSpells) missing.push(game.i18n.localize('VAGABOND.Item.Perk.HasAnySpell'));
    }

    // Check specific spells
    if (prereqs.spells?.length > 0) {
      const ownedSpellUuids = new Set(
        this.actor.items.filter(i => i.type === 'spell').map(i => i.flags?.core?.sourceId || i.uuid)
      );
      for (const spellUuid of prereqs.spells) {
        if (!spellUuid) continue;
        if (!ownedSpellUuids.has(spellUuid)) {
          try {
            const spell = await fromUuid(spellUuid);
            missing.push(`Spell: ${spell?.name || 'Unknown'}`);
          } catch (e) {
            missing.push('Spell: Unknown');
          }
        }
      }
    }

    // Check spell OR groups
    if (prereqs.spellOrGroups?.length > 0) {
      const ownedSpellUuids = new Set(
        this.actor.items.filter(i => i.type === 'spell').map(i => i.flags?.core?.sourceId || i.uuid)
      );
      for (const group of prereqs.spellOrGroups) {
        let groupMet = false;
        const groupLabels = [];
        for (const spellUuid of group) {
          if (!spellUuid) continue;
          if (ownedSpellUuids.has(spellUuid)) { groupMet = true; break; }
          try {
            const spell = await fromUuid(spellUuid);
            groupLabels.push(spell?.name || 'Unknown');
          } catch {
            groupLabels.push('Unknown');
          }
        }
        if (!groupMet && groupLabels.length > 0) missing.push(`Spell: (${groupLabels.join(' or ')})`);
      }
    }

    // Check resource prerequisites
    if (prereqs.resources?.length > 0) {
      for (const res of prereqs.resources) {
        const value = this._getResourceValue(res.resourceType);
        if (value < res.minimum) {
          const resourceLabel = CONFIG.VAGABOND.resourceTypes?.[res.resourceType] || res.resourceType;
          missing.push(`${game.i18n.localize(resourceLabel)} ${res.minimum}+`);
        }
      }
    }

    // Check resource OR groups
    if (prereqs.resourceOrGroups?.length > 0) {
      for (const group of prereqs.resourceOrGroups) {
        let groupMet = false;
        const groupLabels = [];
        for (const res of group) {
          const value = this._getResourceValue(res.resourceType);
          if (value >= res.minimum) { groupMet = true; break; }
          const resourceLabel = CONFIG.VAGABOND.resourceTypes?.[res.resourceType] || res.resourceType;
          groupLabels.push(`${game.i18n.localize(resourceLabel)} ${res.minimum}+`);
        }
        if (!groupMet && groupLabels.length > 0) missing.push(`(${groupLabels.join(' or ')})`);
      }
    }

    return { met: missing.length === 0, missing };
  }

  /** Build a formatted list of ALL prerequisites for display (regardless of met/not met). */
  async _formatAllPrerequisites(perkItem) {
    const prereqs = perkItem.system.prerequisites || {};
    const list = [];
    const sys = this.actor.system;

    // Stat requirements
    if (prereqs.stats?.length > 0) {
      for (const statReq of prereqs.stats) {
        const abbr = CONFIG.VAGABOND.statAbbreviations?.[statReq.stat] || statReq.stat;
        const label = game.i18n.localize(abbr);
        const current = sys.stats?.[statReq.stat]?.total || 0;
        list.push({ text: `${label} ${statReq.value}+`, met: current >= statReq.value });
      }
    }

    // Stat OR groups
    if (prereqs.statOrGroups?.length > 0) {
      for (const group of prereqs.statOrGroups) {
        let groupMet = false;
        const labels = [];
        for (const statReq of group) {
          const abbr = CONFIG.VAGABOND.statAbbreviations?.[statReq.stat] || statReq.stat;
          labels.push(`${game.i18n.localize(abbr)} ${statReq.value}+`);
          const current = sys.stats?.[statReq.stat]?.total || 0;
          if (current >= statReq.value) groupMet = true;
        }
        list.push({ text: labels.join(' or '), met: groupMet });
      }
    }

    // Trained skills
    if (prereqs.trainedSkills?.length > 0) {
      for (const skill of prereqs.trainedSkills) {
        const isTrained = sys.skills?.[skill]?.trained || sys.weaponSkills?.[skill]?.trained;
        const cap = skill.charAt(0).toUpperCase() + skill.slice(1);
        const label = CONFIG.VAGABOND.weaponSkills?.[cap] || CONFIG.VAGABOND.skills?.[cap] || skill;
        list.push({ text: `Trained: ${game.i18n.localize(label)}`, met: !!isTrained });
      }
    }

    // Trained skill OR groups
    if (prereqs.trainedSkillOrGroups?.length > 0) {
      for (const group of prereqs.trainedSkillOrGroups) {
        let groupMet = false;
        const labels = [];
        for (const skill of group) {
          const isTrained = sys.skills?.[skill]?.trained || sys.weaponSkills?.[skill]?.trained;
          if (isTrained) groupMet = true;
          const cap = skill.charAt(0).toUpperCase() + skill.slice(1);
          const label = CONFIG.VAGABOND.weaponSkills?.[cap] || CONFIG.VAGABOND.skills?.[cap] || skill;
          labels.push(game.i18n.localize(label));
        }
        list.push({ text: `Trained: ${labels.join(' or ')}`, met: groupMet });
      }
    }

    // Has any spell
    if (prereqs.hasAnySpell) {
      const has = this.actor.items.some(i => i.type === 'spell');
      list.push({ text: 'Knows at least one spell', met: has });
    }

    // Specific spells
    const ownedUuids = new Set(this.actor.items.filter(i => i.type === 'spell').map(i => i.flags?.core?.sourceId || i.uuid));
    if (prereqs.spells?.length > 0) {
      for (const uuid of prereqs.spells) {
        if (!uuid) continue;
        const owned = ownedUuids.has(uuid);
        try {
          const spell = await fromUuid(uuid);
          list.push({ text: `Spell: ${spell?.name || 'Unknown'}`, met: owned });
        } catch {
          list.push({ text: 'Spell: Unknown', met: owned });
        }
      }
    }

    // Spell OR groups
    if (prereqs.spellOrGroups?.length > 0) {
      for (const group of prereqs.spellOrGroups) {
        let groupMet = false;
        const labels = [];
        for (const uuid of group) {
          if (!uuid) continue;
          const owned = ownedUuids.has(uuid);
          if (owned) groupMet = true;
          try {
            const spell = await fromUuid(uuid);
            labels.push(spell?.name || 'Unknown');
          } catch {
            labels.push('Unknown');
          }
        }
        if (labels.length > 0) {
          list.push({ text: `Spell: ${labels.join(' or ')}`, met: groupMet });
        }
      }
    }

    // Resources
    if (prereqs.resources?.length > 0) {
      for (const res of prereqs.resources) {
        const value = this._getResourceValue(res.resourceType);
        const resourceLabel = CONFIG.VAGABOND.resourceTypes?.[res.resourceType] || res.resourceType;
        list.push({ text: `${game.i18n.localize(resourceLabel)} ${res.minimum}+`, met: value >= res.minimum });
      }
    }

    // Resource OR groups
    if (prereqs.resourceOrGroups?.length > 0) {
      for (const group of prereqs.resourceOrGroups) {
        let groupMet = false;
        const labels = [];
        for (const res of group) {
          const value = this._getResourceValue(res.resourceType);
          if (value >= res.minimum) groupMet = true;
          const resourceLabel = CONFIG.VAGABOND.resourceTypes?.[res.resourceType] || res.resourceType;
          labels.push(`${game.i18n.localize(resourceLabel)} ${res.minimum}+`);
        }
        list.push({ text: labels.join(' or '), met: groupMet });
      }
    }

    return list;
  }

  _getResourceValue(resourceType) {
    const sys = this.actor.system;
    switch (resourceType) {
      case 'maxMana': return sys.mana?.max || 0;
      case 'manaPerCast': return sys.mana?.castingMax || 0;
      case 'maxHP': return sys.health?.max || 0;
      case 'currentLuck': return sys.stats?.luck?.total || 0;
      case 'speed': return sys.speed?.base || 0;
      case 'inventorySlots': return sys.inventory?.maxSlots || 0;
      case 'wealth': {
        const gold = sys.currency?.gold || 0;
        const silver = sys.currency?.silver || 0;
        const copper = sys.currency?.copper || 0;
        return gold * 100 + silver + copper / 10;
      }
      default: return 0;
    }
  }

  async _getChoiceLabel(choice, choiceType) {
    switch (choiceType) {
      case 'skill':
        return game.i18n.localize(CONFIG.VAGABOND.skills[choice] || choice);
      case 'weaponSkill':
        return game.i18n.localize(CONFIG.VAGABOND.weaponSkills[choice?.charAt(0).toUpperCase() + choice?.slice(1)] || choice);
      case 'stat':
        return game.i18n.localize(CONFIG.VAGABOND.stats[choice] || choice);
      case 'spell':
        try { const s = await fromUuid(choice); return s?.name || choice; } catch { return choice; }
      default:
        return choice;
    }
  }

  // ─── Action Handlers ──────────────────────────────────────

  static _onChangeTab(event, target) {
    const tab = target.dataset.tab;
    if (tab) {
      this.activeTab = tab;
      this.render();
    }
  }

  static _onToggleQuestion(event, target) {
    const index = parseInt(target.dataset.index);
    if (!isNaN(index) && index >= 0 && index < 5) {
      this.questions[index] = !this.questions[index];
      this.render();
    }
  }

  static async _onAwardXP(event, target) {
    const xpGained = this.questions.filter(Boolean).length;
    if (xpGained === 0) {
      ui.notifications.warn('No XP to award - answer at least one question.');
      return;
    }

    const currentXP = this.actor.system.attributes.xp || 0;
    const newXP = currentXP + xpGained;

    await this.actor.update({ 'system.attributes.xp': newXP });
    this.xpAwarded = true;
    this.questions = [false, false, false, false, false];

    ui.notifications.info(`Awarded ${xpGained} XP to ${this.actor.name}. Total: ${newXP}`);
    this.render();
  }

  static async _onTriggerLevelUp(event, target) {
    if (this.levelApplied) return;

    const currentLevel = this.actor.system.attributes.level.value;
    const newLevel = currentLevel + 1;

    if (newLevel > 10) {
      ui.notifications.warn('Maximum level (10) reached!');
      return;
    }

    // Increment level and reset XP
    await this.actor.update({
      'system.attributes.level.value': newLevel,
      'system.attributes.xp': 0,
    });

    // Force data refresh
    await this.actor.prepareData();

    this.levelApplied = true;
    this.xpAwarded = true; // prevent re-awarding
    this.activeTab = 'summary';

    ui.notifications.info(`${this.actor.name} is now level ${newLevel}!`);
    this.render();
  }

  static _onSelectStat(event, target) {
    const stat = target.dataset.stat;
    if (!stat) return;

    const current = this.actor.system.stats?.[stat]?.value || 0;
    if (current >= 7) {
      ui.notifications.warn('That stat is already at maximum (7).');
      return;
    }

    this.selectedStat = this.selectedStat === stat ? null : stat;
    this.render();
  }

  static async _onSelectPerk(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    this.selectedPerkUuid = uuid;
    this.render();
  }

  static async _onAddPerk(event, target) {
    const uuid = target.dataset.uuid || this.selectedPerkUuid;
    if (!uuid) return;

    try {
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'perk') return;

      // Check prerequisites and track result
      const prereqCheck = await this._checkPerkPrerequisites(item);
      this.chosenPerkPrereqsMet = prereqCheck.met;
      this.chosenPerkMissingPrereqs = prereqCheck.missing;

      // Check if perk has a choice
      const choiceConfig = item.system.choiceConfig;
      if (choiceConfig && choiceConfig.type && choiceConfig.type !== 'none' && !choiceConfig.selected) {
        const { default: PerkChoiceDialog } = await import('./perk-choice-dialog.mjs');
        const choice = await PerkChoiceDialog.show(item, this.actor);

        if (!choice) {
          ui.notifications.info(`${item.name} was not added - no selection made.`);
          return;
        }
        this.perkChoice = choice;
      }

      this.chosenPerkUuid = uuid;
      this.selectedPerkUuid = uuid;
      this.render();
    } catch (e) {
      console.error('Level Up | Failed to add perk:', e);
      ui.notifications.error('Failed to add perk.');
    }
  }

  static _onRemovePerk(event, target) {
    this.chosenPerkUuid = null;
    this.perkChoice = null;
    this.render();
  }

  static _onSelectSpell(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    this.selectedSpellUuid = uuid;
    this.render();
  }

  static async _onAddSpell(event, target) {
    const uuid = target.dataset.uuid || this.selectedSpellUuid;
    if (!uuid) return;

    // Check if already owned by the actor (match by sourceId or name)
    const ownedSpells = this.actor.items.filter(i => i.type === 'spell');
    const ownedByUuid = ownedSpells.some(i => i.flags?.core?.sourceId === uuid);
    let ownedByName = false;
    try {
      const item = await fromUuid(uuid);
      if (item) {
        ownedByName = ownedSpells.some(i => i.name.toLowerCase() === item.name.toLowerCase());
      }
    } catch { /* ignore */ }

    if (ownedByUuid || ownedByName) {
      ui.notifications.warn('You already know this spell.');
      return;
    }

    if (this.chosenSpells.includes(uuid)) {
      ui.notifications.warn('Spell already selected.');
      return;
    }

    const maxNew = this.newSpellSlots;
    if (maxNew > 0 && this.chosenSpells.length >= maxNew) {
      ui.notifications.warn(`You can only learn ${maxNew} new spell(s) at this level.`);
      return;
    }

    this.chosenSpells.push(uuid);
    this.selectedSpellUuid = uuid;
    this.render();
  }

  static _onRemoveSpell(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    this.chosenSpells = this.chosenSpells.filter(u => u !== uuid);
    this.render();
  }

  static _onToggleGmOverride(event, target) {
    this.gmOverride = !this.gmOverride;
    this.render();
  }

  static _onToggleShowAllPerks(event, target) {
    this.showAllPerks = !this.showAllPerks;
    this.render();
  }

  // ─── Apply Level Up (Final) ───────────────────────────────

  static async _onApplyLevelUp(event, target) {
    if (!this.levelApplied) {
      ui.notifications.warn('You must level up first (use the XP tab).');
      return;
    }

    // Store previous values for chat card
    const previousMaxHP = this.actor.system.health.max;
    const previousMaxMana = this.actor.system.mana.max;
    const previousCastingMax = this.actor.system.mana.castingMax;

    const updates = {};

    // 1. Apply stat increase
    if (this.selectedStat) {
      const currentVal = this.actor.system.stats[this.selectedStat].value || 0;
      updates[`system.stats.${this.selectedStat}.value`] = currentVal + 1;
    }

    // Apply stat updates first (affects HP/mana calculations)
    if (Object.keys(updates).length > 0) {
      await this.actor.update(updates);
    }

    // 2. Add chosen perk
    if (this.chosenPerkUuid) {
      try {
        const perkItem = await fromUuid(this.chosenPerkUuid);
        if (perkItem) {
          const perkData = perkItem.toObject();
          // Store source UUID for future duplicate detection
          foundry.utils.setProperty(perkData, 'flags.core.sourceId', this.chosenPerkUuid);

          // Apply choice if present
          if (this.perkChoice && perkItem.system.choiceConfig?.type) {
            const config = perkItem.system.choiceConfig;
            perkData.system.choiceConfig = { ...perkData.system.choiceConfig, selected: this.perkChoice };

            // Rename perk based on choice
            const choiceLabel = await this._getChoiceLabel(this.perkChoice, config.type);
            perkData.name = `${perkData.name} (${choiceLabel})`;
          }

          const [createdPerk] = await this.actor.createEmbeddedDocuments('Item', [perkData]);

          // If choice-based, create the Active Effect
          if (this.perkChoice && perkItem.system.choiceConfig?.type) {
            const config = perkItem.system.choiceConfig;
            const targetField = config.targetField?.replace('{choice}', this.perkChoice);
            if (targetField) {
              await this.actor.createEmbeddedDocuments('ActiveEffect', [{
                name: `${createdPerk.name}`,
                icon: createdPerk.img,
                origin: createdPerk.uuid,
                changes: [{
                  key: targetField,
                  mode: config.effectMode || CONST.ACTIVE_EFFECT_MODES.ADD,
                  value: config.effectValue || '1',
                }],
                flags: { vagabond: { applicationMode: 'permanent' } },
              }]);
            }
          }
        }
      } catch (e) {
        console.error('Level Up | Failed to add perk:', e);
        ui.notifications.error('Failed to add perk to character.');
      }
    }

    // 3. Add chosen spells
    if (this.chosenSpells.length > 0) {
      try {
        const spellItems = [];
        for (const uuid of this.chosenSpells) {
          const item = await fromUuid(uuid);
          if (item) {
            const data = item.toObject();
            data.system.favorite = true; // Auto-favorite new spells
            // Store source UUID for future duplicate detection
            foundry.utils.setProperty(data, 'flags.core.sourceId', uuid);
            spellItems.push(data);
          }
        }
        if (spellItems.length > 0) {
          await this.actor.createEmbeddedDocuments('Item', spellItems);
        }
      } catch (e) {
        console.error('Level Up | Failed to add spells:', e);
        ui.notifications.error('Failed to add spells to character.');
      }
    }

    // 4. Refresh data
    await this.actor.prepareData();

    // 5. Build and send chat card
    await this._sendLevelUpChatCard(previousMaxHP, previousMaxMana, previousCastingMax);

    // 6. Close dialog
    this.close();
  }

  async _sendLevelUpChatCard(previousMaxHP, previousMaxMana, previousCastingMax) {
    const sys = this.actor.system;
    const newMaxHP = sys.health.max;
    const newMaxMana = sys.mana.max;
    const newCastingMax = sys.mana.castingMax;
    const hpChange = newMaxHP - previousMaxHP;
    const manaChange = newMaxMana - previousMaxMana;
    const castingMaxChange = newCastingMax - previousCastingMax;

    const tags = [
      { label: game.i18n.format('VAGABOND.LevelUp.NewLevel', { level: this.newLevel }), cssClass: 'tag-level', icon: 'fas fa-arrow-up' },
    ];

    let description = '';

    // HP
    description += `<p><strong>${game.i18n.localize('VAGABOND.LevelUp.MaxHP')}</strong> ${previousMaxHP} → ${newMaxHP}`;
    if (hpChange !== 0) description += ` (${hpChange >= 0 ? '+' : ''}${hpChange})`;
    description += '</p>';

    // Mana (if spellcaster)
    if (this.isSpellcaster) {
      description += `<p><strong>${game.i18n.localize('VAGABOND.LevelUp.MaxMana')}</strong> ${previousMaxMana} → ${newMaxMana}`;
      if (manaChange !== 0) description += ` (${manaChange >= 0 ? '+' : ''}${manaChange})`;
      description += '</p>';

      description += `<p><strong>${game.i18n.localize('VAGABOND.LevelUp.ManaPerCast')}</strong> ${previousCastingMax} → ${newCastingMax}`;
      if (castingMaxChange !== 0) description += ` (${castingMaxChange >= 0 ? '+' : ''}${castingMaxChange})`;
      description += '</p>';
    }

    // Stat increase
    if (this.selectedStat) {
      const label = game.i18n.localize(CONFIG.VAGABOND.stats[this.selectedStat]);
      description += `<p><strong>Stat Increase:</strong> ${label} +1</p>`;
    }

    // Perk
    if (this.chosenPerkUuid) {
      try {
        const item = await fromUuid(this.chosenPerkUuid);
        const name = this.perkChoice
          ? `${item?.name} (${await this._getChoiceLabel(this.perkChoice, item?.system.choiceConfig?.type)})`
          : item?.name || 'Unknown';
        description += `<p><strong>New Perk:</strong> ${name}</p>`;
        if (!this.chosenPerkPrereqsMet && this.chosenPerkMissingPrereqs?.length) {
          description += `<p class="prereq-warning-chat"><i class="fas fa-exclamation-triangle"></i> <em>Prerequisites not met: ${this.chosenPerkMissingPrereqs.join(', ')}</em></p>`;
        }
      } catch { /* ignore */ }
    }

    // Spells
    if (this.chosenSpells.length > 0) {
      const names = [];
      for (const uuid of this.chosenSpells) {
        try { const s = await fromUuid(uuid); if (s) names.push(s.name); } catch { /* ignore */ }
      }
      if (names.length > 0) {
        description += `<p><strong>New Spells:</strong> ${names.join(', ')}</p>`;
      }
    }

    // Features
    const features = this.newLevelFeatures;
    if (features.length > 0) {
      description += `<div class="features-section">
        <div class="features-header-container">
          <div class="features-header-arrow"><span>${game.i18n.localize('VAGABOND.LevelUp.NewFeatures')}</span></div>
        </div>
        <div class="features-content">
          ${features.map(f => `<div class="feature-item"><h4>${f.name}</h4>${f.description ? `<p>${f.description}</p>` : ''}</div>`).join('')}
        </div>
      </div>`;
    }

    const card = new VagabondChatCard()
      .setType('level-up')
      .setActor(this.actor)
      .setTitle(game.i18n.localize('VAGABOND.LevelUp.Title'))
      .setSubtitle(this.actor.name)
      .setDescription(description);

    card.data.standardTags = tags;
    await card.send();
  }
}
