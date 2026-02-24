import { VAGABOND_HOMEBREW_DEFAULTS, applyRuntimeHomebrewOverrides, applyTermOverrides } from '../helpers/homebrew-config.mjs';

const { api } = foundry.applications;

/**
 * HomebrewSettingsApp — ApplicationV2 dialog for GM homebrew configuration.
 * All settings are stored as a single JSON object in the 'homebrewConfig' world setting.
 * GM-only.
 */
export class HomebrewSettingsApp extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'homebrew-settings',
    tag: 'form',
    classes: ['homebrew-settings-form'],
    window: {
      title: 'VAGABOND.HomebrewSettings.Title',
      icon: 'fas fa-flask-round-potion',
      resizable: true,
    },
    position: {
      width: 720,
      height: 580,
    },
    actions: {
      switchTab:         HomebrewSettingsApp.#onSwitchTab,
      resetDefaults:     HomebrewSettingsApp.#onResetDefaults,
      addStat:           HomebrewSettingsApp.#onAddStat,
      removeStat:        HomebrewSettingsApp.#onRemoveStat,
      addSkill:          HomebrewSettingsApp.#onAddSkill,
      removeSkill:       HomebrewSettingsApp.#onRemoveSkill,
      addSave:           HomebrewSettingsApp.#onAddSave,
      removeSave:        HomebrewSettingsApp.#onRemoveSave,
      addXpQuestion:     HomebrewSettingsApp.#onAddXpQuestion,
      removeXpQuestion:  HomebrewSettingsApp.#onRemoveXpQuestion,
      addDamageType:     HomebrewSettingsApp.#onAddDamageType,
      removeDamageType:  HomebrewSettingsApp.#onRemoveDamageType,
      exportConfig:      HomebrewSettingsApp.#onExportConfig,
      importConfig:      HomebrewSettingsApp.#onImportConfig,
      saveToLibrary:     HomebrewSettingsApp.#onSaveToLibrary,
      activateHomebrew:  HomebrewSettingsApp.#onActivateHomebrew,
      updateHomebrew:    HomebrewSettingsApp.#onUpdateHomebrew,
      deleteHomebrew:    HomebrewSettingsApp.#onDeleteHomebrew,
      toggleSaveForm:    HomebrewSettingsApp.#onToggleSaveForm,
      resetAll:          HomebrewSettingsApp.#onResetAll,
      saveAndClose:      HomebrewSettingsApp.#onSaveAndClose,
      close: function() { this.close(); },
    },
    form: {
      handler: HomebrewSettingsApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: false,
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/homebrew-settings.hbs',
      scrollable: ['.homebrew-tab-content'],
    },
  };

  static #TABS = [
    { id: 'stats',       label: 'VAGABOND.HomebrewSettings.Tabs.Stats',       icon: 'fa-solid fa-chart-bar',         requiresReload: true },
    { id: 'skills',      label: 'VAGABOND.HomebrewSettings.Tabs.Skills',      icon: 'fa-solid fa-graduation-cap',    requiresReload: true },
    { id: 'dice',        label: 'VAGABOND.HomebrewSettings.Tabs.Dice',        icon: 'fa-solid fa-dice-d20',          requiresReload: false },
    { id: 'leveling',    label: 'VAGABOND.HomebrewSettings.Tabs.Leveling',    icon: 'fa-solid fa-arrow-up',          requiresReload: false },
    { id: 'derivations', label: 'VAGABOND.HomebrewSettings.Tabs.Derivations', icon: 'fa-solid fa-function',          requiresReload: false },
    { id: 'damageTypes', label: 'VAGABOND.HomebrewSettings.Tabs.DamageTypes', icon: 'fa-solid fa-burst',             requiresReload: false },
    { id: 'statCap',     label: 'VAGABOND.HomebrewSettings.Tabs.StatCap',     icon: 'fa-solid fa-lock',              requiresReload: true },
    { id: 'advanced',    label: 'VAGABOND.HomebrewSettings.Tabs.Advanced',    icon: 'fa-solid fa-sliders',           requiresReload: false },
    { id: 'terms',       label: 'VAGABOND.HomebrewSettings.Tabs.Terms',       icon: 'fa-solid fa-spell-check',       requiresReload: false },
    { id: 'library',     label: 'VAGABOND.HomebrewSettings.Tabs.Library',     icon: 'fa-solid fa-books',             requiresReload: false },
  ];

  /** In-memory copy of the config being edited across tab switches. */
  #config = null;

  /** JSON snapshot of config as it was when last saved (or first opened). Used for unsaved-changes detection. */
  #savedConfigSnapshot = null;

  /** Currently active tab ID. */
  #activeTab = 'stats';

  /** Saved homebrew library — array of { id, name, savedAt, config }. Null until first load. */
  #directory = null;

  /** ID of the currently active library entry, or '' if none / custom. */
  #activeId = '';

  /** Whether the inline "save to library" form is visible. */
  #showSaveForm = false;

  /** Name pre-filled into the save-form from the last import. */
  #importedName = '';

  /** @override */
  async _prepareContext(_options) {
    // Initialize in-memory config once when the app first opens
    if (!this.#config) {
      this.#config = foundry.utils.deepClone(CONFIG.VAGABOND.homebrew);
      this.#normalizeXpTable();
      this.#savedConfigSnapshot = JSON.stringify(this.#config);
    }

    // Load library from shared file once per session
    if (!this.#directory) {
      this.#directory = await HomebrewSettingsApp.#loadLibrary();
      try { this.#activeId = game.settings.get('vagabond', 'activeHomebrewId') ?? ''; }
      catch { this.#activeId = ''; }
    }

    const activeTabDef = HomebrewSettingsApp.#TABS.find(t => t.id === this.#activeTab);

    // Build stat options for dropdown menus in Skills & Saves tab (with per-row selected state)
    const statOptions = this.#config.stats.map(s => ({ value: s.key, label: s.label }));

    // Validate cross-references before building rows (so error flags can be embedded)
    const validation = this.#computeValidation();

    const tabs = HomebrewSettingsApp.#TABS.map(tab => ({
      ...tab,
      active: tab.id === this.#activeTab,
      label: game.i18n.localize(tab.label),
      hasErrors: validation.tabsWithErrors[tab.id] ?? false,
    }));

    // Stats rows with error flags (for duplicate key detection)
    const statsRows = this.#config.stats.map((s, i) => ({
      ...s,
      hasError: validation.statErrors[i]?.duplicateKey ?? false,
    }));

    // Luck stat dropdown (Derivations tab) — includes a "None" option to disable the luck pool
    const currentLuckStat = this.#config.derivations?.luckStat ?? 'luck';
    const luckStatOptions = [
      { value: 'none', label: 'None (pool hidden)', selected: currentLuckStat === 'none' },
      ...this.#config.stats.map(s => ({ value: s.key, label: s.label, selected: s.key === currentLuckStat })),
    ];
    const skillRows = this.#config.skills.map((skill, i) => ({
      ...skill,
      index: i,
      statOptions: statOptions.map(o => ({ ...o, selected: o.value === skill.stat })),
      hasError: validation.skillErrors[i]?.statMissing ?? false,
    }));
    const saveRows = this.#config.saves.map((save, i) => ({
      ...save,
      index: i,
      stat1Options: statOptions.map(o => ({ ...o, selected: o.value === save.stat1 })),
      stat2Options: statOptions.map(o => ({ ...o, selected: o.value === save.stat2 })),
      stat1Missing: validation.saveErrors[i]?.stat1Missing ?? false,
      stat2Missing: validation.saveErrors[i]?.stat2Missing ?? false,
      hasError: (validation.saveErrors[i]?.stat1Missing || validation.saveErrors[i]?.stat2Missing) ?? false,
    }));

    return {
      config: this.#config,
      tabs,
      activeTab: this.#activeTab,
      statOptions,
      statsRows,
      skillRows,
      saveRows,
      luckStatOptions,
      derivErrors: validation.derivErrors,
      hasAnyErrors: validation.hasAnyErrors,
      // Pre-computed tab visibility booleans (avoids need for 'eq' helper)
      showStats:       this.#activeTab === 'stats',
      showSkills:      this.#activeTab === 'skills',
      showDice:        this.#activeTab === 'dice',
      showLeveling:    this.#activeTab === 'leveling',
      showDerivations: this.#activeTab === 'derivations',
      showDamageTypes: this.#activeTab === 'damageTypes',
      showStatCap:     this.#activeTab === 'statCap',
      showAdvanced:    this.#activeTab === 'advanced',
      showTerms:       this.#activeTab === 'terms',
      showLibrary:     this.#activeTab === 'library',
      activeTabRequiresReload: activeTabDef?.requiresReload ?? false,
      // Library tab data
      library: (() => {
        const activeEntry = this.#activeId ? this.#directory.find(e => e.id === this.#activeId) : null;
        return {
          entries: this.#directory.map(e => ({
            ...e,
            isActive:   e.id === this.#activeId,
            isModified: e.id === this.#activeId && this.#savedConfigSnapshot !== JSON.stringify(e.config),
            savedAtDisplay: new Date(e.savedAt).toLocaleDateString(),
          })),
          activeId:      this.#activeId,
          showSaveForm:  this.#showSaveForm,
          importedName:  this.#importedName,
          hasEntries:    this.#directory.length > 0,
          filePath:      HomebrewSettingsApp.#LIBRARY_DIR,
        };
      })(),
    };
  }

  /** @override — attach live input listeners for the active tab after each render. */
  _onRender(context, options) {
    if (this.#activeTab === 'stats') {
      this.#setupStatsListeners();
    } else if (this.#activeTab === 'skills') {
      this.#setupSkillsSavesListeners();
    } else if (this.#activeTab === 'leveling') {
      this.#setupLevelingListeners();
    } else if (this.#activeTab === 'dice') {
      this.#setupDiceListeners();
      this.#renderDiceChart();
    } else if (this.#activeTab === 'damageTypes') {
      this.#setupDamageTypeListeners();
    } else if (this.#activeTab === 'derivations') {
      this.#setupDerivationsListeners();
    } else if (this.#activeTab === 'statCap') {
      this.#setupStatCapListeners();
    } else if (this.#activeTab === 'advanced') {
      this.#setupAdvancedListeners();
    } else if (this.#activeTab === 'terms') {
      this.#setupTermsListeners();
    }
  }

  /** Attach input listeners for the Stats tab fields. Updates #config in real time. */
  #setupStatsListeners() {
    const el = this.element;
    el.querySelectorAll('[data-stat-index]').forEach(input => {
      if (input.tagName !== 'INPUT') return;
      input.addEventListener('input', (e) => {
        const i = parseInt(input.dataset.statIndex);
        const field = input.dataset.statField;
        const entry = this.#config.stats[i];
        if (!entry) return;
        entry[field] = e.target.value;
      });
    });
  }

  /** Attach input/change listeners for the Skills & Saves tab. Updates #config in real time. */
  #setupSkillsSavesListeners() {
    const el = this.element;

    // Skills rows
    el.querySelectorAll('[data-skill-index]').forEach(input => {
      if (input.tagName !== 'INPUT' && input.tagName !== 'SELECT') return;
      const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventType, (e) => {
        const i = parseInt(input.dataset.skillIndex);
        const field = input.dataset.skillField;
        const entry = this.#config.skills[i];
        if (!entry) return;
        if (field === 'isWeaponSkill' || field === 'showInSkillsList') {
          entry[field] = input.checked;
        } else {
          entry[field] = e.target.value;
        }
      });
    });

    // Saves rows
    el.querySelectorAll('[data-save-index]').forEach(input => {
      if (input.tagName !== 'INPUT' && input.tagName !== 'SELECT') return;
      const eventType = input.tagName === 'SELECT' ? 'change' : 'input';
      input.addEventListener(eventType, (e) => {
        const i = parseInt(input.dataset.saveIndex);
        const field = input.dataset.saveField;
        const entry = this.#config.saves[i];
        if (!entry) return;
        if (field === 'baseValue') {
          entry[field] = parseInt(e.target.value) || 20;
        } else {
          entry[field] = e.target.value;
        }
      });
    });
  }

  /** Attach input/change listeners for the Leveling tab fields. Updates #config in real time. */
  #setupLevelingListeners() {
    const el = this.element;

    // Max level
    el.querySelector('[data-field="leveling.maxLevel"]')?.addEventListener('change', (e) => {
      this.#config.leveling.maxLevel = parseInt(e.target.value) || 10;
      this.#normalizeXpTable();
      this.render();
    });

    // XP table — one input per level row
    el.querySelectorAll('[data-xp-level]').forEach(input => {
      input.addEventListener('change', (e) => {
        const level = parseInt(input.dataset.xpLevel);
        const entry = this.#config.leveling.xpTable.find(t => t.level === level);
        if (entry) entry.xp = parseInt(e.target.value) || 0;
      });
    });

    // XP questions — text and xp per row
    el.querySelectorAll('[data-q-index]').forEach(input => {
      const eventType = input.type === 'text' ? 'input' : 'change';
      input.addEventListener(eventType, (e) => {
        const i = parseInt(input.dataset.qIndex);
        const field = input.dataset.qField;
        const q = this.#config.leveling.xpQuestions[i];
        if (!q) return;
        if (field === 'xp') {
          q.xp = parseInt(e.target.value) || 1;
        } else {
          q.question = e.target.value;
        }
      });
    });
  }

  /** Attach input listeners for the Dice tab fields. Updates #config in real time and refreshes chart. */
  #setupDiceListeners() {
    const el = this.element;
    el.querySelectorAll('[data-field^="dice."]').forEach(input => {
      input.addEventListener('input', (e) => {
        const field = input.dataset.field.replace('dice.', '');
        this.#config.dice[field] = e.target.value;
        this.#renderDiceChart();
      });
    });
  }

  /** Attach input listeners for the Damage Types tab. Updates #config in real time. */
  #setupDamageTypeListeners() {
    const el = this.element;
    el.querySelectorAll('[data-dt-index]').forEach(input => {
      if (input.tagName !== 'INPUT') return;
      input.addEventListener('input', (e) => {
        const i = parseInt(input.dataset.dtIndex);
        const field = input.dataset.dtField;
        const entry = this.#config.damageTypes[i];
        if (!entry) return;
        entry[field] = e.target.value;
        // Live-update icon preview when the icon class field changes
        if (field === 'icon') {
          const preview = el.querySelector(`[data-dt-icon-preview="${i}"]`);
          if (preview) preview.className = e.target.value;
        }
      });
    });
  }

  /** Attach input/change listeners for the Derivations tab fields. Updates #config in real time. */
  #setupDerivationsListeners() {
    const el = this.element;
    el.querySelectorAll('[data-field^="derivations."]').forEach(input => {
      const isSelect = input.tagName === 'SELECT';
      const isRadio  = input.type === 'radio';
      const eventType = (isSelect || input.type === 'number' || isRadio) ? 'change' : 'input';
      input.addEventListener(eventType, (e) => {
        if (isRadio && !input.checked) return;
        const field = input.dataset.field.replace('derivations.', '');
        if (input.type === 'number') {
          this.#config.derivations[field] = parseInt(e.target.value) || 0;
        } else {
          this.#config.derivations[field] = e.target.value;
        }
      });
    });
  }

  /** Attach change listener for the Stat Cap tab. Updates #config in real time. */
  #setupStatCapListeners() {
    const el = this.element;
    el.querySelector('[data-field="statCap"]')?.addEventListener('change', (e) => {
      this.#config.statCap = parseInt(e.target.value) || 7;
    });
  }

  /** Attach change listeners for the Advanced tab fields. Updates #config in real time. */
  #setupAdvancedListeners() {
    const el = this.element;
    el.querySelectorAll('[data-field^="multipliers."]').forEach(input => {
      input.addEventListener('change', (e) => {
        const field = input.dataset.field.replace('multipliers.', '');
        this.#config.multipliers[field] = parseFloat(e.target.value) || 1;
      });
    });
  }

  /** Attach input listeners for the Terms tab. Updates #config.terms in real time. */
  #setupTermsListeners() {
    if (!this.#config.terms) this.#config.terms = {};
    this.element.querySelectorAll('[data-term-key]').forEach(input => {
      input.addEventListener('input', (e) => {
        this.#config.terms[input.dataset.termKey] = e.target.value;
      });
    });
  }

  /**
   * Scan #config for broken cross-references (e.g. skills/saves/derivations referencing a deleted stat).
   * Returns flags used to highlight broken fields in the UI.
   */
  #computeValidation() {
    const statKeys = new Set(this.#config.stats.map(s => s.key));

    // Stats: duplicate keys (second occurrence is the bad one)
    const seenKeys = new Set();
    const statErrors = this.#config.stats.map(s => {
      const dup = seenKeys.has(s.key);
      seenKeys.add(s.key);
      return { duplicateKey: dup };
    });

    // Skills: stat references a key not in config.stats
    const skillErrors = this.#config.skills.map(skill => ({
      statMissing: !statKeys.has(skill.stat),
    }));

    // Saves: stat1/stat2 reference a key not in config.stats
    const saveErrors = this.#config.saves.map(save => ({
      stat1Missing: !statKeys.has(save.stat1),
      stat2Missing: !statKeys.has(save.stat2),
    }));

    // Derivations: formula contains @statKey references to unknown stats
    // Known non-stat @ prefixes: 'speed' (computed value), 'attributes' (level/etc.)
    const NON_STAT_REFS = new Set(['speed', 'attributes']);
    const formulaHasError = (formula) => {
      const refs = [...(formula ?? '').matchAll(/@(\w+)\./g)].map(m => m[1]);
      return refs.some(r => !NON_STAT_REFS.has(r) && !statKeys.has(r));
    };
    const ls = this.#config.derivations?.luckStat ?? 'luck';
    const derivErrors = {
      hp:        formulaHasError(this.#config.derivations?.hp),
      inventory: formulaHasError(this.#config.derivations?.inventory),
      speed:     formulaHasError(this.#config.derivations?.speed),
      crawl:     formulaHasError(this.#config.derivations?.crawl),
      travel:    formulaHasError(this.#config.derivations?.travel),
      luckStat:  ls !== 'none' && !statKeys.has(ls),
    };

    const tabsWithErrors = {
      stats:       statErrors.some(e => e.duplicateKey),
      skills:      skillErrors.some(e => e.statMissing) || saveErrors.some(e => e.stat1Missing || e.stat2Missing),
      derivations: Object.values(derivErrors).some(Boolean),
    };

    return {
      statErrors,
      skillErrors,
      saveErrors,
      derivErrors,
      tabsWithErrors,
      hasAnyErrors: Object.values(tabsWithErrors).some(Boolean),
    };
  }

  /**
   * Ensure xpTable has exactly one entry per level from 2 to maxLevel.
   * Missing entries get a default value of 5 × level. Entries beyond maxLevel are removed.
   */
  #normalizeXpTable() {
    const maxLevel = this.#config.leveling.maxLevel;
    const table = this.#config.leveling.xpTable;
    const existingLevels = new Set(table.map(t => t.level));
    for (let level = 2; level <= maxLevel; level++) {
      if (!existingLevels.has(level)) table.push({ level, xp: 5 * level });
    }
    this.#config.leveling.xpTable = table
      .filter(t => t.level <= maxLevel)
      .sort((a, b) => a.level - b.level);
  }

  /** Render the probability chart SVG into #hb-dice-chart. */
  #renderDiceChart() {
    const container = this.element?.querySelector('#hb-dice-chart');
    if (!container) return;
    const dice = this.#config.dice;
    const data = HomebrewSettingsApp.#computeChartData(dice.baseCheck, dice.favorBonus, dice.hinderPenalty);
    if (!data) {
      container.innerHTML = '<p class="hb-hint">Unable to parse dice formulas.</p>';
      return;
    }

    const W = 370, H = 180;
    const pad = { top: 12, right: 12, bottom: 28, left: 32 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const { targets, base, favor, hinder } = data;
    const tMin = targets[0];
    const tMax = targets[targets.length - 1];
    const tRange = tMax - tMin || 1;

    // Dynamic Y-scale based on the highest peak in any series
    const maxP = Math.max(...base, ...favor, ...hinder, 0.01);
    const yScale = p => pad.top + chartH * (1 - p / maxP);

    // Grid lines for frequency percentages
    let grids = '';
    const numGrids = 4;
    for (let i = 0; i <= numGrids; i++) {
      const p = (i / numGrids) * maxP;
      const y = yScale(p).toFixed(1);
      const label = `${(p * 100).toFixed(1)}%`;
      grids += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="rgba(128,128,128,0.2)" stroke-width="1"/>`;
      grids += `<text x="${(pad.left - 5).toFixed(1)}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="8" fill="currentColor" opacity="0.6">${label}</text>`;
    }
    
    // Add Y-axis title
    grids += `<text x="${pad.left - 26}" y="${pad.top + chartH / 2}" transform="rotate(-90, ${pad.left - 26}, ${pad.top + chartH / 2})" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.5">Frequency</text>`;

    // X-axis labels (~7-8 evenly spaced)
    const xScale = t => pad.left + ((t - tMin) / tRange) * chartW;
    const labelStep = Math.max(1, Math.round(tRange / 8));
    let xLabels = '';
    for (const t of targets) {
      if ((t - tMin) % labelStep !== 0 && t !== tMax) continue;
      xLabels += `<text x="${xScale(t).toFixed(1)}" y="${(pad.top + chartH + 12).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">${t}</text>`;
    }

    // Axes
    const axisY = (pad.top + chartH).toFixed(1);
    const axes = `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${axisY}" stroke="currentColor" stroke-width="1" opacity="0.35"/>
                  <line x1="${pad.left}" y1="${axisY}" x2="${W - pad.right}" y2="${axisY}" stroke="currentColor" stroke-width="1" opacity="0.35"/>`;

    // Clustered Bar helper
    const unitWidth = chartW / (tRange + 1);
    const subBarWidth = (unitWidth * 0.85) / 3;
    
    const drawClusteredBars = () => {
      let bars = '';
      targets.forEach((t, i) => {
        const xCenter = xScale(t);
        
        // Hinder (left)
        const pHinder = hinder[i];
        if (pHinder > 0) {
          const yH = yScale(pHinder);
          const hH = Math.max(1, (pad.top + chartH) - yH);
          bars += `<rect x="${(xCenter - 1.5 * subBarWidth).toFixed(1)}" y="${yH.toFixed(1)}" width="${subBarWidth.toFixed(1)}" height="${hH.toFixed(1)}" fill="#c05050" opacity="0.8" rx="0.3" />`;
        }

        // Base (center)
        const pBase = base[i];
        if (pBase > 0) {
          const yB = yScale(pBase);
          const hB = Math.max(1, (pad.top + chartH) - yB);
          bars += `<rect x="${(xCenter - 0.5 * subBarWidth).toFixed(1)}" y="${yB.toFixed(1)}" width="${subBarWidth.toFixed(1)}" height="${hB.toFixed(1)}" fill="#6b91c1" opacity="0.9" rx="0.3" />`;
        }

        // Favor (right)
        const pFavor = favor[i];
        if (pFavor > 0) {
          const yF = yScale(pFavor);
          const hF = Math.max(1, (pad.top + chartH) - yF);
          bars += `<rect x="${(xCenter + 0.5 * subBarWidth).toFixed(1)}" y="${yF.toFixed(1)}" width="${subBarWidth.toFixed(1)}" height="${hF.toFixed(1)}" fill="#4caf72" opacity="0.8" rx="0.3" />`;
        }
      });
      return bars;
    };

    // Legend
    const lx = pad.left + 25;
    const ly = H - 7;
    const legend = `<rect x="${lx}" y="${ly - 4}" width="12" height="4" rx="2" fill="#6b91c1"/>
      <text x="${lx + 15}" y="${ly}" font-size="9" fill="currentColor" opacity="0.7">Base</text>
      <rect x="${lx + 45}" y="${ly - 4}" width="12" height="4" rx="2" fill="#4caf72"/>
      <text x="${lx + 60}" y="${ly}" font-size="9" fill="currentColor" opacity="0.7">Favor</text>
      <rect x="${lx + 103}" y="${ly - 4}" width="12" height="4" rx="2" fill="#c05050"/>
      <text x="${lx + 118}" y="${ly}" font-size="9" fill="currentColor" opacity="0.7">Hinder</text>`;

    container.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" class="hb-chart-svg">
      ${grids}${axes}
      ${drawClusteredBars()}
      ${xLabels}${legend}
    </svg>`;
  }

  // ─── Static helpers for dice probability chart ───────────────────────────

  static #parseFormula(formula) {
    const m = (formula ?? '').match(/(\d+)d(\d+)/i);
    if (m) return { count: parseInt(m[1]), sides: parseInt(m[2]) };
    const m2 = (formula ?? '').match(/d(\d+)/i);
    if (m2) return { count: 1, sides: parseInt(m2[1]) };
    return null;
  }

  static #uniformPMF(sides) {
    const pmf = {};
    for (let i = 1; i <= sides; i++) pmf[i] = 1 / sides;
    return pmf;
  }

  static #multiConvolve(sides, count) {
    let pmf = { 0: 1 };
    const die = HomebrewSettingsApp.#uniformPMF(sides);
    for (let i = 0; i < count; i++) {
      pmf = HomebrewSettingsApp.#convolveAdd(pmf, die);
    }
    return pmf;
  }

  static #convolveAdd(pmf1, pmf2) {
    const out = {};
    for (const [k1, p1] of Object.entries(pmf1)) {
      for (const [k2, p2] of Object.entries(pmf2)) {
        const k = +k1 + +k2;
        out[k] = (out[k] ?? 0) + p1 * p2;
      }
    }
    return out;
  }

  static #convolveSub(pmf1, pmf2) {
    const out = {};
    for (const [k1, p1] of Object.entries(pmf1)) {
      for (const [k2, p2] of Object.entries(pmf2)) {
        const k = +k1 - +k2;
        out[k] = (out[k] ?? 0) + p1 * p2;
      }
    }
    return out;
  }

  static #computeChartData(baseFormula, favorFormula, hinderFormula) {
    const base = HomebrewSettingsApp.#parseFormula(baseFormula);
    const favor = HomebrewSettingsApp.#parseFormula(favorFormula);
    const hinder = HomebrewSettingsApp.#parseFormula(hinderFormula);
    
    if (!base) return null;

    const basePMF   = HomebrewSettingsApp.#multiConvolve(base.sides, base.count);
    const favorPMF  = favor ? HomebrewSettingsApp.#multiConvolve(favor.sides, favor.count) : { 0: 1 };
    const hinderPMF = hinder ? HomebrewSettingsApp.#multiConvolve(hinder.sides, hinder.count) : { 0: 1 };

    const favorDist  = HomebrewSettingsApp.#convolveAdd(basePMF, favorPMF);
    const hinderDist = HomebrewSettingsApp.#convolveSub(basePMF, hinderPMF);

    const allKeys = [
      ...Object.keys(basePMF),
      ...Object.keys(favorDist),
      ...Object.keys(hinderDist),
    ].map(Number);
    const tMin = Math.min(...allKeys);
    const tMax = Math.max(...allKeys);

    const targets = [];
    for (let t = tMin; t <= tMax; t++) targets.push(t);

    return {
      targets,
      base:   targets.map(t => basePMF[t] || 0),
      favor:  targets.map(t => favorDist[t] || 0),
      hinder: targets.map(t => hinderDist[t] || 0),
    };
  }

  /** Add a blank stat entry to the list. */
  static #onAddStat() {
    this.#config.stats.push({ key: 'newStat', label: 'New Stat', abbreviation: 'NEW' });
    this.render();
  }

  /** Remove a stat by index. */
  static #onRemoveStat(event, target) {
    const index = parseInt(target.dataset.index);
    if (!isNaN(index)) {
      this.#config.stats.splice(index, 1);
      this.render();
    }
  }

  /** Add a blank skill entry. */
  static #onAddSkill() {
    this.#config.skills.push({ key: 'newSkill', label: 'New Skill', hint: '', stat: Object.keys(CONFIG.VAGABOND.stats)[0] ?? 'might', trainedMultiplier: 2 });
    this.render();
  }

  /** Remove a skill by index. */
  static #onRemoveSkill(event, target) {
    const index = parseInt(target.dataset.index);
    if (!isNaN(index)) {
      this.#config.skills.splice(index, 1);
      this.render();
    }
  }

  /** Add a blank save entry. */
  static #onAddSave() {
    const firstStat = Object.keys(CONFIG.VAGABOND.stats)[0] ?? 'might';
    this.#config.saves.push({ key: 'newSave', label: 'New Save', description: '', checkDie: '1d20', stat1: firstStat, stat2: firstStat, baseValue: 20 });
    this.render();
  }

  /** Remove a save by index. */
  static #onRemoveSave(event, target) {
    const index = parseInt(target.dataset.index);
    if (!isNaN(index)) {
      this.#config.saves.splice(index, 1);
      this.render();
    }
  }

  /** Add a blank damage type entry to the list. */
  static #onAddDamageType() {
    this.#config.damageTypes.push({ key: 'new', label: 'New Type', icon: 'fa-solid fa-star' });
    this.render();
  }

  /** Remove a damage type by index. */
  static #onRemoveDamageType(event, target) {
    const index = parseInt(target.dataset.index);
    if (!isNaN(index)) {
      this.#config.damageTypes.splice(index, 1);
      this.render();
    }
  }

  /** Export a library entry as a downloadable JSON file. */
  static #onExportConfig(event, target) {
    const id = target.dataset.id;
    const entry = this.#directory?.find(e => e.id === id);
    if (!entry) return;
    const exportData = { name: entry.name, ...entry.config };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${game.system.id}-${entry.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Open a file picker to import a JSON config, deep-merge it into #config, and re-render. */
  static #onImportConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        // Extract the embedded name (if any) before merging into config
        const { name: importedName, ...importedConfig } = imported;
        this.#importedName = importedName || file.name.replace(/\.json$/i, '');
        this.#config = foundry.utils.mergeObject(
          foundry.utils.deepClone(this.#config),
          importedConfig,
          { inplace: false, recursive: true }
        );
        this.#normalizeXpTable();
        // Switch to library tab and open save form so user can add it to the directory
        this.#activeTab = 'library';
        this.#showSaveForm = true;
        this.render();
        ui.notifications.info(`Homebrew config loaded from "${file.name}". Review the tabs and save when ready.`);
      } catch (err) {
        ui.notifications.error(`Failed to import homebrew config: ${err.message}`);
      }
    });
    input.click();
  }

  /** Add a blank question to the XP questionnaire. */
  static #onAddXpQuestion() {
    this.#config.leveling.xpQuestions.push({ question: 'New question', xp: 1 });
    this.render();
  }

  /** Remove an XP question by index. */
  static #onRemoveXpQuestion(event, target) {
    const index = parseInt(target.dataset.index);
    if (!isNaN(index)) {
      this.#config.leveling.xpQuestions.splice(index, 1);
      this.render();
    }
  }

  /** Switch to a different tab without saving. */
  static #onSwitchTab(event, target) {
    this.#activeTab = target.dataset.tab;
    this.render();
  }

  /** Reset the entire config to factory defaults after a confirmation dialog. */
  static async #onResetAll() {
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Reset All to Defaults?' },
      content: `
        <p><strong>This will reset every homebrew setting to its factory default.</strong></p>
        <p>All your customisations — stats, skills, dice, leveling, derivations, damage types, terms, and more — will be discarded from this session.</p>
        <p style="margin-top:0.75rem; opacity:0.8;"><i class="fa-solid fa-circle-info fa-xs"></i>
          If you want to keep your current config, cancel and use the <strong>Export / Import</strong> tab to download a backup first.
        </p>
      `,
      yes: { label: 'Reset Everything', icon: 'fa-solid fa-arrow-rotate-left' },
      no:  { label: 'Cancel',           icon: 'fa-solid fa-xmark' },
    });
    if (!confirmed) return;
    this.#config = foundry.utils.deepClone(VAGABOND_HOMEBREW_DEFAULTS);
    this.#normalizeXpTable();
    this.render();
  }

  /** Reset the currently active tab's portion of the config to defaults. */
  static #onResetDefaults(event, target) {
    const tab = target.dataset.tab ?? this.#activeTab;
    const d = VAGABOND_HOMEBREW_DEFAULTS;
    switch (tab) {
      case 'stats':        this.#config.stats        = foundry.utils.deepClone(d.stats);        break;
      case 'skills':       this.#config.skills        = foundry.utils.deepClone(d.skills);
                           this.#config.saves         = foundry.utils.deepClone(d.saves);        break;
      case 'dice':         this.#config.dice          = foundry.utils.deepClone(d.dice);         break;
      case 'leveling':     this.#config.leveling      = foundry.utils.deepClone(d.leveling);     break;
      case 'derivations':  this.#config.derivations   = foundry.utils.deepClone(d.derivations);  break;
      case 'damageTypes':  this.#config.damageTypes   = foundry.utils.deepClone(d.damageTypes);  break;
      case 'statCap':      this.#config.statCap       = d.statCap;                               break;
      case 'advanced':     this.#config.multipliers   = foundry.utils.deepClone(d.multipliers);  break;
    }
    this.render();
  }

  /** @override — intercept close to warn about unsaved changes. */
  async close(options = {}) {
    if (!options.force && this.#config && JSON.stringify(this.#config) !== this.#savedConfigSnapshot) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('VAGABOND.HomebrewSettings.UnsavedTitle') },
        content: `<p>${game.i18n.localize('VAGABOND.HomebrewSettings.UnsavedBody')}</p>`,
      });
      if (!confirmed) return;
    }
    this.#directory = null; // force re-scan next open
    return super.close(options);
  }

  /**
   * Core save logic — persists #config, applies runtime overrides, re-renders open sheets.
   * Returns true if the user confirmed a world reload (page is about to refresh).
   */
  async #performSave() {
    const prev = CONFIG.VAGABOND.homebrew;
    const next = this.#config;
    const requiresReload =
      JSON.stringify(prev.stats)      !== JSON.stringify(next.stats)      ||
      JSON.stringify(prev.skills)     !== JSON.stringify(next.skills)     ||
      JSON.stringify(prev.saves)      !== JSON.stringify(next.saves)      ||
      prev.statCap                    !== next.statCap                    ||
      prev.leveling?.maxLevel         !== next.leveling?.maxLevel;

    await game.settings.set('vagabond', 'homebrewConfig', this.#config);
    const configClone = foundry.utils.deepClone(this.#config);
    applyRuntimeHomebrewOverrides(configClone);
    applyTermOverrides(configClone);
    this.#savedConfigSnapshot = JSON.stringify(this.#config);
    // Re-prepare and re-render open actor sheets so derived values (fatigue max,
    // HP, speed, etc.) are recalculated from the new config before the sheet redraws.
    for (const actor of game.actors) {
      if (actor.sheet?.rendered) {
        actor.prepareData();
        actor.sheet.render();
      }
    }
    for (const item of game.items) item.sheet?.rendered && item.sheet.render();
    ui.notifications.info(game.i18n.localize('VAGABOND.HomebrewSettings.Saved'));

    if (requiresReload) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('VAGABOND.HomebrewSettings.ReloadTitle') },
        content: `<p>${game.i18n.localize('VAGABOND.HomebrewSettings.ReloadBody')}</p>`,
      });
      if (confirmed) { window.location.reload(); return true; }
    }
    return false;
  }

  // ─── Library file helpers ─────────────────────────────────────────────

  static #LIBRARY_DIR = 'assets/vagabond/homebrew';

  /** Read all individual entry files from the shared assets folder. Returns [] if not found. */
  static async #loadLibrary() {
    try {
      await foundry.applications.apps.FilePicker.createDirectory('data', 'assets/vagabond').catch(() => {});
      await foundry.applications.apps.FilePicker.createDirectory('data', HomebrewSettingsApp.#LIBRARY_DIR).catch(() => {});
      const result = await foundry.applications.apps.FilePicker.browse('data', HomebrewSettingsApp.#LIBRARY_DIR);
      const jsonFiles = (result.files ?? []).filter(f => f.endsWith('.json'));
      const entries = await Promise.all(jsonFiles.map(async (filePath) => {
        try {
          const res = await fetch(filePath);
          if (!res.ok) return null;
          const data = await res.json();
          if (!data || data.deleted) return null;
          // Skip legacy library.json (was an array) or any file missing required fields
          if (!data.id || !data.config || typeof data.name !== 'string') return null;
          return data;
        } catch { return null; }
      }));
      return entries.filter(Boolean).sort((a, b) => a.savedAt - b.savedAt);
    } catch {
      return [];
    }
  }

  /** Write a single entry as its own JSON file in the library folder. */
  static async #saveLibraryEntry(entry) {
    try {
      await foundry.applications.apps.FilePicker.createDirectory('data', 'assets/vagabond').catch(() => {});
      await foundry.applications.apps.FilePicker.createDirectory('data', HomebrewSettingsApp.#LIBRARY_DIR).catch(() => {});
      const json = JSON.stringify(entry, null, 2);
      const file = new File([json], `${entry.id}.json`, { type: 'application/json' });
      await foundry.applications.apps.FilePicker.upload('data', HomebrewSettingsApp.#LIBRARY_DIR, file, {}, { notify: false });
    } catch (err) {
      ui.notifications.error(`Failed to save homebrew library entry: ${err.message}`);
    }
  }

  /** Mark an entry as deleted by overwriting its file (Foundry has no client-side file delete). */
  static async #deleteLibraryEntry(id) {
    try {
      const json = JSON.stringify({ deleted: true });
      const file = new File([json], `${id}.json`, { type: 'application/json' });
      await foundry.applications.apps.FilePicker.upload('data', HomebrewSettingsApp.#LIBRARY_DIR, file, {}, { notify: false });
    } catch (err) {
      ui.notifications.error(`Failed to delete homebrew library entry: ${err.message}`);
    }
  }

  // ─── Library actions ──────────────────────────────────────────────────

  /** Toggle the inline save-to-library form. */
  static #onToggleSaveForm() {
    this.#showSaveForm = !this.#showSaveForm;
    this.render();
  }

  /** Save the current config as a new library entry. */
  static async #onSaveToLibrary() {
    const nameInput = this.element.querySelector('#hb-lib-name-input');
    const name = nameInput?.value.trim();
    if (!name) {
      ui.notifications.warn('Please enter a name for this homebrew configuration.');
      nameInput?.focus();
      return;
    }
    const entry = {
      id:      foundry.utils.randomID(),
      name,
      savedAt: Date.now(),
      config:  foundry.utils.deepClone(this.#config),
    };
    if (!this.#directory) this.#directory = [];
    this.#directory.push(entry);
    await HomebrewSettingsApp.#saveLibraryEntry(entry);
    this.#importedName = '';
    this.#showSaveForm = false;
    this.render();
    ui.notifications.info(`"${name}" saved to homebrew library.`);
  }

  /** Load a library entry into the active config and apply it immediately. */
  static async #onActivateHomebrew(event, target) {
    const id = target.dataset.id;
    const entry = this.#directory?.find(e => e.id === id);
    if (!entry) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Activate "${entry.name}"?` },
      content: `<p>This will replace the current active homebrew configuration with <strong>${entry.name}</strong> and save it immediately.</p>`,
      yes: { label: 'Activate', icon: 'fa-solid fa-check' },
      no:  { label: 'Cancel',   icon: 'fa-solid fa-xmark' },
    });
    if (!confirmed) return;

    this.#config = foundry.utils.deepClone(entry.config);
    this.#normalizeXpTable();
    this.#activeId = id;
    await game.settings.set('vagabond', 'activeHomebrewId', id);
    const willReload = await this.#performSave();
    if (!willReload) this.render();
  }

  /** Overwrite the active library entry with the current (modified) config. */
  static async #onUpdateHomebrew() {
    const entry = this.#directory?.find(e => e.id === this.#activeId);
    if (!entry) return;

    entry.config  = foundry.utils.deepClone(this.#config);
    entry.savedAt = Date.now();
    await HomebrewSettingsApp.#saveLibraryEntry(entry);
    const willReload = await this.#performSave();
    if (!willReload) this.render();
    ui.notifications.info(`"${entry.name}" updated in library.`);
  }

  /** Remove a library entry. */
  static async #onDeleteHomebrew(event, target) {
    const id = target.dataset.id;
    const entry = this.#directory?.find(e => e.id === id);
    if (!entry) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: `Delete "${entry.name}"?` },
      content: `<p>Remove <strong>${entry.name}</strong> from the library? This only removes the saved entry — it does not change the current active configuration.</p>`,
      yes: { label: 'Delete', icon: 'fa-solid fa-trash' },
      no:  { label: 'Cancel', icon: 'fa-solid fa-xmark' },
    });
    if (!confirmed) return;

    this.#directory = this.#directory.filter(e => e.id !== id);
    if (this.#activeId === id) {
      this.#activeId = '';
      await game.settings.set('vagabond', 'activeHomebrewId', '');
    }
    await HomebrewSettingsApp.#deleteLibraryEntry(id);
    this.render();
  }

  /** Save without closing — re-renders the app so validation state refreshes. */
  static async #onSubmit(event, form, formData) {
    await this.#performSave();
    this.render();
  }

  /** Save and close — mirrors old behaviour. */
  static async #onSaveAndClose() {
    const willReload = await this.#performSave();
    if (!willReload) this.close({ force: true });
  }
}
