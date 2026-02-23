import { VAGABOND_HOMEBREW_DEFAULTS, applyRuntimeHomebrewOverrides } from '../helpers/homebrew-config.mjs';

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
      close: function() { this.close(); },
    },
    form: {
      handler: HomebrewSettingsApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true,
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
  ];

  /** In-memory copy of the config being edited across tab switches. */
  #config = null;

  /** Currently active tab ID. */
  #activeTab = 'stats';

  /** @override */
  async _prepareContext(_options) {
    // Initialize in-memory config once when the app first opens
    if (!this.#config) {
      this.#config = foundry.utils.deepClone(CONFIG.VAGABOND.homebrew);
    }

    const tabs = HomebrewSettingsApp.#TABS.map(tab => ({
      ...tab,
      active: tab.id === this.#activeTab,
      label: game.i18n.localize(tab.label),
    }));

    const activeTabDef = HomebrewSettingsApp.#TABS.find(t => t.id === this.#activeTab);

    // Build stat options for dropdown menus in Skills & Saves tab (with per-row selected state)
    const statOptions = this.#config.stats.map(s => ({ value: s.key, label: s.label }));
    const skillRows = this.#config.skills.map((skill, i) => ({
      ...skill,
      index: i,
      statOptions: statOptions.map(o => ({ ...o, selected: o.value === skill.stat })),
    }));
    const saveRows = this.#config.saves.map((save, i) => ({
      ...save,
      index: i,
      stat1Options: statOptions.map(o => ({ ...o, selected: o.value === save.stat1 })),
      stat2Options: statOptions.map(o => ({ ...o, selected: o.value === save.stat2 })),
    }));

    return {
      config: this.#config,
      tabs,
      activeTab: this.#activeTab,
      statOptions,
      skillRows,
      saveRows,
      // Pre-computed tab visibility booleans (avoids need for 'eq' helper)
      showStats:       this.#activeTab === 'stats',
      showSkills:      this.#activeTab === 'skills',
      showDice:        this.#activeTab === 'dice',
      showLeveling:    this.#activeTab === 'leveling',
      showDerivations: this.#activeTab === 'derivations',
      showDamageTypes: this.#activeTab === 'damageTypes',
      showStatCap:     this.#activeTab === 'statCap',
      showAdvanced:    this.#activeTab === 'advanced',
      activeTabRequiresReload: activeTabDef?.requiresReload ?? false,
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

  /** Attach input listeners for the Derivations tab fields. Updates #config in real time. */
  #setupDerivationsListeners() {
    const el = this.element;
    el.querySelectorAll('[data-field^="derivations."]').forEach(input => {
      input.addEventListener('input', (e) => {
        const field = input.dataset.field.replace('derivations.', '');
        this.#config.derivations[field] = e.target.value;
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
    const pad = { top: 8, right: 12, bottom: 28, left: 32 };
    const chartW = W - pad.left - pad.right;
    const chartH = H - pad.top - pad.bottom;
    const { targets, base, favor, hinder } = data;
    const tMin = targets[0];
    const tMax = targets[targets.length - 1];
    const tRange = tMax - tMin || 1;

    const xScale = t => pad.left + ((t - tMin) / tRange) * chartW;
    const yScale = p => pad.top + chartH * (1 - p);

    // Grid lines at 25%, 50%, 75%, 100%
    let grids = '';
    for (const p of [0.25, 0.5, 0.75, 1.0]) {
      const y = yScale(p).toFixed(1);
      grids += `<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="rgba(128,128,128,0.25)" stroke-width="1"/>`;
      grids += `<text x="${(pad.left - 3).toFixed(1)}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="9" fill="currentColor" opacity="0.6">${Math.round(p * 100)}%</text>`;
    }

    // X-axis labels (~7 evenly spaced)
    const labelStep = Math.max(1, Math.round(tRange / 7));
    let xLabels = '';
    for (const t of targets) {
      if ((t - tMin) % labelStep !== 0 && t !== tMax) continue;
      xLabels += `<text x="${xScale(t).toFixed(1)}" y="${(pad.top + chartH + 12).toFixed(1)}" text-anchor="middle" font-size="9" fill="currentColor" opacity="0.6">${t}</text>`;
    }

    // Axes
    const axisY = (pad.top + chartH).toFixed(1);
    const axes = `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${axisY}" stroke="currentColor" stroke-width="1" opacity="0.35"/>
                  <line x1="${pad.left}" y1="${axisY}" x2="${W - pad.right}" y2="${axisY}" stroke="currentColor" stroke-width="1" opacity="0.35"/>`;

    // Polyline helper
    const poly = (series, color, sw = 2) => {
      const pts = targets.map((t, i) => `${xScale(t).toFixed(1)},${yScale(series[i]).toFixed(1)}`).join(' ');
      return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
    };

    // Legend
    const lx = pad.left + 4;
    const ly = H - 7;
    const legend = `<rect x="${lx}" y="${ly - 4}" width="12" height="4" rx="2" fill="#6b91c1"/>
      <text x="${lx + 15}" y="${ly}" font-size="9" fill="currentColor" opacity="0.7">Base</text>
      <rect x="${lx + 45}" y="${ly - 4}" width="12" height="4" rx="2" fill="#4caf72"/>
      <text x="${lx + 60}" y="${ly}" font-size="9" fill="currentColor" opacity="0.7">Favor</text>
      <rect x="${lx + 103}" y="${ly - 4}" width="12" height="4" rx="2" fill="#c05050"/>
      <text x="${lx + 118}" y="${ly}" font-size="9" fill="currentColor" opacity="0.7">Hinder</text>`;

    container.innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}" class="hb-chart-svg">
      ${grids}${axes}
      ${poly(hinder, '#c05050')}
      ${poly(base, '#6b91c1', 2.5)}
      ${poly(favor, '#4caf72')}
      ${xLabels}${legend}
    </svg>`;
  }

  // ─── Static helpers for dice probability chart ───────────────────────────

  static #parseDieSides(formula) {
    const m = (formula ?? '').match(/d(\d+)/i);
    return m ? parseInt(m[1]) : 0;
  }

  static #uniformPMF(sides) {
    const pmf = {};
    for (let i = 1; i <= sides; i++) pmf[i] = 1 / sides;
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

  static #cdfAbove(pmf, t) {
    let sum = 0;
    for (const [k, p] of Object.entries(pmf)) {
      if (+k >= t) sum += p;
    }
    return sum;
  }

  static #computeChartData(baseFormula, favorFormula, hinderFormula) {
    const baseSides   = HomebrewSettingsApp.#parseDieSides(baseFormula);
    const favorSides  = HomebrewSettingsApp.#parseDieSides(favorFormula);
    const hinderSides = HomebrewSettingsApp.#parseDieSides(hinderFormula);
    if (!baseSides || !favorSides || !hinderSides) return null;

    const basePMF    = HomebrewSettingsApp.#uniformPMF(baseSides);
    const favorDist  = HomebrewSettingsApp.#convolveAdd(basePMF, HomebrewSettingsApp.#uniformPMF(favorSides));
    const hinderDist = HomebrewSettingsApp.#convolveSub(basePMF, HomebrewSettingsApp.#uniformPMF(hinderSides));

    const allKeys = [
      ...Object.keys(basePMF),
      ...Object.keys(favorDist),
      ...Object.keys(hinderDist),
    ].map(Number);
    const tMin = Math.min(...allKeys);
    const tMax = Math.max(...allKeys);

    const targets = [];
    for (let t = tMin; t <= tMax + 1; t++) targets.push(t);

    return {
      targets,
      base:   targets.map(t => HomebrewSettingsApp.#cdfAbove(basePMF,    t)),
      favor:  targets.map(t => HomebrewSettingsApp.#cdfAbove(favorDist,  t)),
      hinder: targets.map(t => HomebrewSettingsApp.#cdfAbove(hinderDist, t)),
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

  /** Save the in-memory config to world settings. Called on form submit. */
  static async #onSubmit(event, form, formData) {
    await game.settings.set('vagabond', 'homebrewConfig', this.#config);
    applyRuntimeHomebrewOverrides(foundry.utils.deepClone(this.#config));
    ui.notifications.info(game.i18n.localize('VAGABOND.HomebrewSettings.Saved'));
  }
}
