import { SETTINGS_SUBJECTS, SETTINGS_GROUPS } from '../settings/settings-layout.mjs';
import { HomebrewSettingsApp } from './homebrew-settings-app.mjs';
import { CraftingSettingsApp } from './crafting-settings-app.mjs';
import { SequencerFxConfig } from './sequencer-fx-config.mjs';
import { DsnDamageAppearanceConfig } from './dsn-damage-appearance-config.mjs';
import { CompendiumSettings } from './compendium-settings.mjs';

const { api } = foundry.applications;
const NS = 'vagabond';

/** Big standalone config windows the hub opens from a launcher row. */
const LAUNCHERS = {
  homebrew: HomebrewSettingsApp,
  crafting: CraftingSettingsApp,
  sequencerFx: SequencerFxConfig,
  dsnDamage: DsnDamageAppearanceConfig,
  compendiums: CompendiumSettings,
};

/**
 * Vagabond Settings Hub — one window for every system setting, organised by
 * subject (layout in `settings/settings-layout.mjs`). Foundry's settings tab shows
 * a single button opening this singleton; `open(subject)` deep-links a subject.
 *
 * - Every control saves on change (no Save button). Ranges save on release.
 * - World sections are GM-editable; players see them read-only and collapsed,
 *   and GM-only subjects are hidden from players entirely.
 * - Dependent rows grey out live, without a re-render (keeps focus/scroll).
 * - Settings flagged `requiresReload` raise a footer notice; closing the hub
 *   with a pending reload asks once.
 */
export class VagabondSettingsHub extends api.HandlebarsApplicationMixin(api.ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: 'vagabond-settings-hub',
    tag: 'div',
    classes: ['vagabond-settings-hub'],
    window: {
      title: 'VAGABOND.SettingsHub.Title',
      icon: 'fas fa-gears',
      resizable: true,
    },
    position: { width: 860, height: 700 },
    actions: {
      selectSubject: VagabondSettingsHub.#onSelectSubject,
      resetSubject: VagabondSettingsHub.#onResetSubject,
      launch: VagabondSettingsHub.#onLaunch,
      forcePush: VagabondSettingsHub.#onForcePush,
      reloadNow: VagabondSettingsHub.#onReloadNow,
    },
  };

  static PARTS = {
    hub: {
      template: 'systems/vagabond/templates/apps/settings-hub.hbs',
      scrollable: ['.vsh-body'],
    },
  };

  static #instance = null;

  /** Open (or focus) the hub on a subject. */
  static async open(subject) {
    const app = (VagabondSettingsHub.#instance ??= new VagabondSettingsHub());
    if (subject) app.#subject = subject;
    app.#query = '';
    await app.render({ force: true });
    app.bringToFront?.();
    return app;
  }

  #subject = 'rules';
  #query = '';
  #pendingReload = null; // null | { world: boolean }
  #abort = null;

  /* -------------------------------------------- */
  /*  Context                                     */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext(_options) {
    const isGM = game.user.isGM;
    const L = k => game.i18n.localize(k);

    const subjects = SETTINGS_SUBJECTS
      .filter(s => isGM || s.sections.some(sec => sec.scope === 'client'))
      .map(s => {
        const sections = s.sections
          .map(sec => this.#prepareSection(sec, isGM))
          .filter(sec => sec.rows.length);
        const count = sections
          .filter(sec => !sec.readOnly)
          .reduce((n, sec) => n + sec.rows.filter(r => r.counts).length, 0);
        return {
          id: s.id, icon: s.icon, group: s.group, sections, count,
          name: L(`VAGABOND.SettingsHub.Subjects.${s.id}.name`),
          desc: L(`VAGABOND.SettingsHub.Subjects.${s.id}.desc`),
        };
      });
    if (!subjects.some(s => s.id === this.#subject)) this.#subject = subjects[0]?.id;
    for (const s of subjects) s.active = s.id === this.#subject;

    const groups = SETTINGS_GROUPS
      .map(g => ({ label: L(`VAGABOND.SettingsHub.Groups.${g}`), subjects: subjects.filter(s => s.group === g) }))
      .filter(g => g.subjects.length);

    return { groups, subjects, query: this.#query, pendingReload: !!this.#pendingReload };
  }

  #prepareSection(sec, isGM) {
    const readOnly = !isGM && sec.scope === 'world';
    const rows = sec.rows
      .map(row => this.#prepareRow(row, readOnly))
      .filter(Boolean);
    return {
      id: sec.id,
      title: game.i18n.localize(`VAGABOND.SettingsHub.Sections.${sec.id}`),
      note: sec.note ? game.i18n.localize(sec.note) : '',
      isWorld: sec.scope === 'world',
      readOnly,
      rows,
    };
  }

  #prepareRow(row, readOnly) {
    const L = k => (k ? game.i18n.localize(k) : '');
    const kind = row.kind ?? 'setting';
    const search = (...parts) => parts.filter(Boolean).join(' ').toLowerCase();

    if (kind === 'launcher' || kind === 'action') {
      if (readOnly) return null; // GM tools
      const label = L(row.label), hint = L(row.hint);
      return {
        kind, isLauncher: kind === 'launcher', isAction: kind === 'action',
        app: row.app, action: row.action, icon: row.icon, label, hint, button: L(row.button),
        search: search(label, hint),
      };
    }

    if (kind === 'factions') {
      const factions = ['Friendly', 'Neutral', 'Hostile', 'Secret'].map(f => {
        const nameKey = `faction${f}`;
        return {
          nameKey, colorKey: `${nameKey}Color`,
          label: L(`VAGABOND.EncounterSettings.Factions.${f}`).replace(/[:\s]+$/, ''),
          name: game.settings.get(NS, nameKey),
          color: game.settings.get(NS, `${nameKey}Color`),
        };
      });
      return {
        kind, isFactions: true, factions, disabled: readOnly, counts: true,
        search: search(L('VAGABOND.EncounterSettings.Factions.Title'), ...factions.flatMap(f => [f.label, f.name])),
      };
    }

    const cfg = VagabondSettingsHub.#config(row.key);
    if (!cfg) {
      console.warn(`VagabondSettingsHub | unknown setting "${row.key}"`);
      return null;
    }

    if (kind === 'override') return this.#prepareOverride(row, cfg, search);

    const raw = game.settings.get(NS, row.key);
    const value = row.path ? foundry.utils.getProperty(raw, row.path) : raw;
    const widget = row.widget ?? VagabondSettingsHub.#inferWidget(cfg);
    const label = L(row.label ?? cfg.name) || row.key;
    let hint = L(row.hint ?? cfg.hint);
    let locked = false;

    // Rows tied to the user's assigned character (User Configuration → Character).
    if (row.key === 'hudAlwaysOnForMainChar') {
      const char = game.user.character;
      if (char) hint = `${hint} ${char.name}.`;
      else { hint = L('VAGABOND.Settings.hudDisplayConfig.alwaysOnNoChar'); locked = true; }
    }

    return {
      kind, isSetting: true, counts: true,
      id: `vsh-${row.key}${row.path ? `-${row.path}` : ''}`,
      key: row.key, path: row.path ?? '',
      label, hint, value, locked, disabled: readOnly || locked,
      isCheckbox: widget === 'checkbox',
      isSelect: widget === 'select',
      isRange: widget === 'range',
      isNumber: widget === 'number',
      isText: widget === 'text',
      mono: !!row.mono,
      options: widget === 'select' ? VagabondSettingsHub.#options(cfg, value) : null,
      ...VagabondSettingsHub.#rangeOf(row, cfg),
      format: row.format ?? '',
      display: VagabondSettingsHub.#format(value, row.format),
      reload: !!cfg.requiresReload,
      dep: row.dep ?? '',
      depNot: row.depNot ?? '',
      hasDepNot: row.depNot !== undefined,
      depInvert: !!row.depInvert,
      search: search(label, hint, row.key),
    };
  }

  #prepareOverride(row, cfg, search) {
    const L = k => (k ? game.i18n.localize(k) : '');
    const ofCfg = VagabondSettingsHub.#config(row.of);
    const value = game.settings.get(NS, row.key);
    const inherit = row.flag ? !!game.settings.get(NS, row.flag) : value === 'inherit';
    const isRange = !!row.flag;
    const label = L(cfg.name) || row.key;
    const hint = L('VAGABOND.SettingsHub.OverrideHint');
    return {
      kind: 'override', isOverride: true, counts: true,
      id: `vsh-${row.key}`, key: row.key, of: row.of, flag: row.flag ?? '',
      label, hint, inherit, isRange,
      value,
      options: isRange ? null : VagabondSettingsHub.#options(cfg, value).filter(o => o.value !== 'inherit'),
      ...VagabondSettingsHub.#rangeOf(row, cfg),
      format: row.format ?? '',
      display: VagabondSettingsHub.#format(value, row.format),
      defaultDisplay: VagabondSettingsHub.#displayValue(ofCfg, game.settings.get(NS, row.of), row.format),
      search: search(label, hint, row.key),
    };
  }

  /* -------------------------------------------- */
  /*  Helpers                                     */
  /* -------------------------------------------- */

  static #config(key) {
    return game.settings.settings.get(`${NS}.${key}`);
  }

  static #inferWidget(cfg) {
    if (cfg.type === Boolean) return 'checkbox';
    if (cfg.choices) return 'select';
    if (cfg.range) return 'range';
    if (cfg.type === Number) return 'number';
    return 'text';
  }

  static #options(cfg, value) {
    return Object.entries(cfg.choices ?? {}).map(([v, label]) => ({
      value: v, label: game.i18n.localize(label), selected: v === value,
    }));
  }

  static #rangeOf(row, cfg) {
    return {
      min: row.min ?? cfg.range?.min ?? '',
      max: row.max ?? cfg.range?.max ?? '',
      step: row.step ?? cfg.range?.step ?? 'any',
    };
  }

  static #format(value, format) {
    const n = Number(value);
    switch (format) {
      case 'pct': return `${Math.round(n * 100)}%`;
      case 'percent': return `${n}%`;
      case 'px': return `${n}px`;
      case 'x': return `${n}×`;
      case 's': return `${n}s`;
      default: return `${value ?? ''}`;
    }
  }

  /** Human-readable value of a setting (used for "table default" labels). */
  static #displayValue(cfg, value, format) {
    if (typeof value === 'boolean') return game.i18n.localize(value ? 'VAGABOND.SettingsHub.On' : 'VAGABOND.SettingsHub.Off');
    if (cfg?.choices?.[value]) return game.i18n.localize(cfg.choices[value]);
    return VagabondSettingsHub.#format(value, format);
  }

  /** Current value of `key` or `key.path`. */
  static #read(ref) {
    const [key, ...path] = ref.split('.');
    const value = game.settings.get(NS, key);
    return path.length ? foundry.utils.getProperty(value, path.join('.')) : value;
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#abort?.abort();
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const el = this.element;

    el.addEventListener('change', event => this.#onChange(event), { signal });
    el.addEventListener('input', event => {
      const t = event.target;
      if (t.matches('.vsh-search input')) { this.#query = t.value; this.#filter(); return; }
      if (t.type === 'range') {
        const out = t.parentElement.querySelector('.vsh-range-val');
        if (out) out.textContent = VagabondSettingsHub.#format(t.value, t.dataset.format);
      }
    }, { signal });

    this.#applyDeps();
    this.#filter();
  }

  /** @override */
  async close(options) {
    this.#abort?.abort();
    const pending = this.#pendingReload;
    this.#pendingReload = null;
    const result = await super.close(options);
    if (pending) VagabondSettingsHub.#reloadConfirm(pending);
    return result;
  }

  /** Grey out rows whose `dep` is off; read-only sections stay disabled. */
  #applyDeps() {
    for (const row of this.element.querySelectorAll('[data-dep]')) {
      const v = VagabondSettingsHub.#read(row.dataset.dep);
      let on = row.dataset.depNot !== undefined ? v !== row.dataset.depNot : !!v;
      if (row.dataset.depInvert !== undefined) on = !on;
      row.classList.toggle('is-off', !on);
      const readOnly = !!row.closest('[data-readonly]');
      const locked = row.dataset.locked !== undefined;
      for (const c of row.querySelectorAll('input, select')) c.disabled = !on || readOnly || locked;
    }
  }

  /** Refresh "table default: X" labels and faction chips after a save. */
  #refreshDisplays() {
    for (const b of this.element.querySelectorAll('[data-default-of]')) {
      const cfg = VagabondSettingsHub.#config(b.dataset.defaultOf);
      b.textContent = VagabondSettingsHub.#displayValue(cfg, game.settings.get(NS, b.dataset.defaultOf), b.dataset.format);
    }
    for (const chip of this.element.querySelectorAll('[data-chip]')) {
      chip.textContent = game.settings.get(NS, chip.dataset.chip);
      chip.style.background = game.settings.get(NS, `${chip.dataset.chip}Color`);
    }
  }

  /** Search: show matching rows across every subject; empty query = active subject. */
  #filter() {
    const q = this.#query.trim().toLowerCase();
    const el = this.element;
    let any = false;
    for (const panel of el.querySelectorAll('.vsh-panel')) {
      panel.classList.toggle('is-searching', !!q);
      let panelHit = false;
      for (const sec of panel.querySelectorAll('.vsh-sec')) {
        let secHit = false;
        for (const row of sec.querySelectorAll('[data-search]')) {
          const hit = !q || row.dataset.search.includes(q);
          row.hidden = !hit;
          secHit ||= hit;
        }
        sec.hidden = !secHit;
        if (q && secHit && sec.tagName === 'DETAILS') sec.open = true;
        panelHit ||= secHit;
      }
      panel.hidden = q ? !panelHit : panel.dataset.subject !== this.#subject;
      any ||= panelHit;
    }
    const empty = el.querySelector('.vsh-empty');
    if (empty) empty.hidden = !q || any;
    for (const b of el.querySelectorAll('.vsh-nav-btn')) {
      b.classList.toggle('active', !q && b.dataset.subject === this.#subject);
    }
    const reset = el.querySelector('.vsh-reset');
    if (reset) reset.hidden = !!q;
  }

  /* -------------------------------------------- */
  /*  Saving                                      */
  /* -------------------------------------------- */

  async #onChange(event) {
    const t = event.target;
    if (t.matches('.vsh-search input')) return;
    try {
      if (t.dataset.override) await this.#saveOverrideToggle(t);
      else if (t.dataset.setting) await this.#saveInput(t);
      else return;
    } catch (err) {
      console.error('VagabondSettingsHub | save failed', err);
      ui.notifications.error(game.i18n.format('VAGABOND.SettingsHub.SaveFailed', { error: err.message }));
      this.render();
      return;
    }
    this.#applyDeps();
    this.#refreshDisplays();
  }

  async #saveInput(input) {
    const key = input.dataset.setting;
    const path = input.dataset.path;
    const cfg = VagabondSettingsHub.#config(key);
    const fallback = path ? foundry.utils.getProperty(cfg.default, path) : cfg.default;

    let value;
    if (input.type === 'checkbox') value = input.checked;
    else if (input.type === 'range' || input.type === 'number') {
      value = Number(input.value);
      if (!Number.isFinite(value)) value = fallback;
      if (input.min !== '') value = Math.max(Number(input.min), value);
      if (input.max !== '') value = Math.min(Number(input.max), value);
      if (input.type === 'number') input.value = value;
    }
    else {
      value = input.value.trim();
      if (!value && input.type === 'text') { value = fallback; input.value = value; }
    }

    if (path) {
      const obj = foundry.utils.deepClone(game.settings.get(NS, key) ?? {});
      foundry.utils.setProperty(obj, path, value);
      value = obj;
    }
    await game.settings.set(NS, key, value);
    if (cfg.requiresReload) this.#flagReload(cfg.scope);
  }

  /** "Use table default" checkbox of an override row. */
  async #saveOverrideToggle(box) {
    const key = box.dataset.override;
    const useDefault = box.checked;
    const ctl = box.closest('.vsh-ctl').querySelector('.vsh-ovr-ctl');
    if (ctl) ctl.hidden = useDefault;

    if (box.dataset.flag) {
      await game.settings.set(NS, box.dataset.flag, useDefault);
      return;
    }
    if (useDefault) {
      await game.settings.set(NS, key, 'inherit');
      return;
    }
    // Leaving the table default: start from what the table uses now.
    const cfg = VagabondSettingsHub.#config(key);
    const tableValue = game.settings.get(NS, box.dataset.of);
    const choices = Object.keys(cfg.choices ?? {}).filter(c => c !== 'inherit');
    let seed = typeof tableValue === 'boolean' ? (tableValue ? 'on' : 'off') : tableValue;
    if (!choices.includes(seed)) seed = choices[0];
    await game.settings.set(NS, key, seed);
    const select = ctl?.querySelector('select');
    if (select) select.value = seed;
  }

  #flagReload(scope) {
    this.#pendingReload = { world: (this.#pendingReload?.world ?? false) || scope === 'world' };
    const notice = this.element.querySelector('.vsh-reload-notice');
    if (notice) notice.hidden = false;
  }

  static #reloadConfirm({ world }) {
    const SC = foundry.applications.settings?.SettingsConfig ?? globalThis.SettingsConfig;
    return SC?.reloadConfirm?.({ world: world && game.user.isGM });
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onSelectSubject(event, target) {
    this.#subject = target.dataset.subject;
    this.#query = '';
    const search = this.element.querySelector('.vsh-search input');
    if (search) search.value = '';
    this.#filter();
    const body = this.element.querySelector('.vsh-body');
    if (body) body.scrollTop = 0;
  }

  static #onLaunch(event, target) {
    const App = LAUNCHERS[target.dataset.app];
    if (App) new App().render({ force: true });
  }

  /** Reset every player's spell-area outline/opacity overrides to the table defaults. */
  static async #onForcePush() {
    const ok = await api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.SpellSettings.ForceTitle') },
      content: `<p>${game.i18n.localize('VAGABOND.SpellSettings.ForceConfirm')}</p>`,
    });
    if (!ok) return;
    await game.settings.set(NS, 'regionForcePush', (game.settings.get(NS, 'regionForcePush') || 0) + 1);
  }

  static async #onReloadNow() {
    const pending = this.#pendingReload;
    if (!pending) return;
    this.#pendingReload = null;
    const notice = this.element.querySelector('.vsh-reload-notice');
    if (notice) notice.hidden = true;
    await VagabondSettingsHub.#reloadConfirm(pending);
  }

  /** Put every setting the user can edit on the current subject back to its default. */
  static async #onResetSubject() {
    const subject = SETTINGS_SUBJECTS.find(s => s.id === this.#subject);
    if (!subject) return;
    const name = game.i18n.localize(`VAGABOND.SettingsHub.Subjects.${subject.id}.name`);
    const ok = await api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.SettingsHub.ResetTitle') },
      content: `<p>${game.i18n.format('VAGABOND.SettingsHub.ResetConfirm', { subject: name })}</p>`,
    });
    if (!ok) return;

    const isGM = game.user.isGM;
    const values = new Map(); // key -> value (object settings merged across paths)
    const def = key => foundry.utils.deepClone(VagabondSettingsHub.#config(key)?.default);
    for (const sec of subject.sections) {
      if (sec.scope === 'world' && !isGM) continue;
      for (const row of sec.rows) {
        const kind = row.kind ?? 'setting';
        if (kind === 'factions') {
          for (const f of ['Friendly', 'Neutral', 'Hostile', 'Secret']) {
            values.set(`faction${f}`, def(`faction${f}`));
            values.set(`faction${f}Color`, def(`faction${f}Color`));
          }
        } else if (kind === 'override') {
          values.set(row.key, def(row.key));
          if (row.flag) values.set(row.flag, def(row.flag));
        } else if (kind === 'setting') {
          if (!row.path) { values.set(row.key, def(row.key)); continue; }
          const obj = values.get(row.key) ?? foundry.utils.deepClone(game.settings.get(NS, row.key) ?? {});
          foundry.utils.setProperty(obj, row.path, foundry.utils.getProperty(def(row.key), row.path));
          values.set(row.key, obj);
        }
      }
    }
    for (const [key, value] of values) {
      const cfg = VagabondSettingsHub.#config(key);
      if (!cfg || foundry.utils.objectsEqual({ v: game.settings.get(NS, key) }, { v: value })) continue;
      await game.settings.set(NS, key, value);
      if (cfg.requiresReload) this.#pendingReload = { world: (this.#pendingReload?.world ?? false) || cfg.scope === 'world' };
    }
    ui.notifications.info(game.i18n.format('VAGABOND.SettingsHub.ResetDone', { subject: name }));
    this.render();
  }
}

/**
 * Settings menu type: Foundry calls `new type().render(true)` from its settings
 * tab, which opens (or refocuses) the hub — on `subject` if given, else on the
 * last subject viewed.
 * Must subclass ApplicationV2 (registerMenu checks the prototype); the instance
 * itself is never rendered.
 */
export function hubMenu(subject) {
  return class VagabondSettingsHubMenu extends api.ApplicationV2 {
    render() { return VagabondSettingsHub.open(subject); }
  };
}
