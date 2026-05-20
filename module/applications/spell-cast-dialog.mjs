const { api } = foundry.applications;

/**
 * RGB accent triplets per damage type. Used as CSS custom property --ac.
 * Tune in playtest.
 */
const ACCENT_RGB = {
  '-':         '250, 250, 255',
  'fire':      '255, 190, 130',
  'cold':      '200, 240, 255',
  'shock':     '255, 245, 170',
  'acid':      '220, 255, 175',
  'poison':    '235, 255, 195',
  'blunt':     '255, 240, 215',
  'piercing':  '255, 245, 225',
  'slashing':  '255, 215, 195',
  'physical':  '255, 245, 225',
  'necrotic':  '240, 205, 255',
  'psychic':   '245, 200, 255',
  'magical':   '240, 220, 255',
  'healing':   '215, 255, 225',
  'recover':   '230, 255, 245',
  'recharge':  '240, 250, 255',
};

/**
 * PT-BR humour phrases per damage type, transliterated into Elder Futhark at render time.
 * Outer ring + inner ring. Tweak freely.
 */
const RUNE_PHRASES = {
  '-':         { outer: 'FAZ A MAGIA AI',           inner: 'ABRACADABRA' },
  'fire':      { outer: 'QUEIMA TUDO IRMAO',         inner: 'ESQUECI O FOGAO' },
  'cold':      { outer: 'CONGELA A ALMA',           inner: 'QUE FRIO DESGRACA' },
  'shock':     { outer: 'RAIO NO RABO',             inner: 'TOMA CHOQUE OTARIO' },
  'acid':      { outer: 'DERRETE FEITO PUDIM',       inner: 'BANHO DE LIMAO' },
  'poison':    { outer: 'VENENO DA SOGRA',          inner: 'BEBE QUE EH BOM' },
  'blunt':     { outer: 'PORRADA SEM DO',            inner: 'PANCADA NA NUCA' },
  'piercing':  { outer: 'FURA QUE NEM AGULHA',       inner: 'ESPETO BEM FUNDO' },
  'slashing':  { outer: 'RETALHA O BICHO',          inner: 'CORTE LIMPO IRMAO' },
  'physical':  { outer: 'MURRO NA CARA',            inner: 'SOCO BEM DADO' },
  'necrotic':  { outer: 'MORRE LOGO VAGABUNDO',      inner: 'PODRIDAO ETERNA' },
  'psychic':   { outer: 'ENLOUQUECE MISERAVEL',      inner: 'DOR DE CABECA' },
  'magical':   { outer: 'ABRACADABRA PORRA',         inner: 'POOF SUMIU' },
  'healing':   { outer: 'SARA AI TROUXA',           inner: 'TOMA VIDA OTARIO' },
  'recover':   { outer: 'DESCANSA OTARIO',          inner: 'RELAXA AI MOLEQUE' },
  'recharge':  { outer: 'PILHA NOVA MOLEQUE',        inner: 'ENERGIZA AI' },
};

const RUNE_MAP = {
  A: 'ᚨ', B: 'ᛒ', C: 'ᚲ', D: 'ᛞ', E: 'ᛖ', F: 'ᚠ', G: 'ᚷ', H: 'ᚺ',
  I: 'ᛁ', J: 'ᛃ', K: 'ᚲ', L: 'ᛚ', M: 'ᛗ', N: 'ᚾ', O: 'ᛟ', P: 'ᛈ',
  Q: 'ᚲ', R: 'ᚱ', S: 'ᛋ', T: 'ᛏ', U: 'ᚢ', V: 'ᚹ', W: 'ᚹ', Y: 'ᛇ',
  Z: 'ᛉ',
};

/**
 * Strip diacritics, uppercase, map each letter to a rune. Spaces preserved.
 */
function transliterate(str) {
  if (!str) return '';
  const stripped = str.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  let out = '';
  for (const ch of stripped) {
    if (ch === ' ') { out += ' '; continue; }
    if (ch === 'X') { out += 'ᚲᛋ'; continue; }
    out += RUNE_MAP[ch] ?? ch;
  }
  return out;
}

/**
 * Distribute glyphs evenly around a circle. Returns [{glyph, angle}].
 * angle is degrees; 0 = top, increasing clockwise.
 */
function distributeRunes(phrase) {
  const glyphs = [...transliterate(phrase)].filter(g => g !== ' ');
  const step = 360 / glyphs.length;
  return glyphs.map((glyph, i) => ({ glyph, angle: i * step }));
}

/**
 * Vagabond spell cast dialog. ApplicationV2 frameless overlay with a SVG magic circle.
 * Local state only; nothing writes back to actor/item until Cast is confirmed.
 */
export class SpellCastDialog extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  #actor;
  #spell;
  #state;
  #onCast;
  #onChange;          // live-sync callback fired after each state mutation
  #anchorEl;          // DOM element to dock beside (typically the actor sheet)
  #ctrl = null;
  #openedAt = performance.now();
  #pos = null;        // null = anchored/centered; once dragged, holds { left, top }
  #minimized = false; // collapsed-to-header state, toggled by dblclick on header
  #messages = [];     // last-computed message list (validation + module-contributed)

  /** Singleton — at most one spell cast dialog open at a time. */
  static #current = null;

  constructor({ actor, spell, initialState, onCast, onChange, anchorEl }, options = {}) {
    super(options);
    // Close any prior dialog before opening this one
    if (SpellCastDialog.#current && SpellCastDialog.#current !== this) {
      SpellCastDialog.#current.close();
    }
    SpellCastDialog.#current = this;
    this.#actor = actor;
    this.#spell = spell;
    this.#onCast = onCast;
    this.#onChange = onChange ?? null;
    this.#anchorEl = anchorEl ?? null;
    this.#state = {
      damageDice: initialState?.damageDice ?? 1,
      deliveryType: initialState?.deliveryType ?? null,
      deliveryIncrease: initialState?.deliveryIncrease ?? 0,
      useFx: initialState?.useFx ?? (spell.system.damageType === '-'),
      focusOn: (actor.system.focus?.spellIds ?? []).includes(spell.id),
      previewActive: false,
      manaOverrideDelta: 0,
    };
  }

  static DEFAULT_OPTIONS = {
    id: 'spell-cast-dialog-{id}',
    classes: ['vagabond', 'spell-cast-dialog'],
    window: { frame: false },
    position: { width: 350, height: 'auto' },
    actions: {
      vscClose:          SpellCastDialog._onClose,
      vscCast:           SpellCastDialog._onCast,
      vscBumpDice:       SpellCastDialog._onBumpDice,
      vscBumpRange:      SpellCastDialog._onBumpRange,
      vscBumpMana:       SpellCastDialog._onBumpMana,
      vscOpenDelivery:   SpellCastDialog._onOpenDelivery,
      vscPickDelivery:   SpellCastDialog._onPickDelivery,
      vscToggleTemplate: SpellCastDialog._onToggleTemplate,
      vscToggleFocus:    SpellCastDialog._onToggleFocus,
      vscToggleFx:       SpellCastDialog._onToggleFx,
      vscModifyMana:     SpellCastDialog._onModifyMana,
    },
  };

  static PARTS = {
    dialog: { template: 'systems/vagabond/templates/apps/spell-cast-dialog.hbs' },
  };

  // ── Context ──────────────────────────────────────────────────────────────

  async _prepareContext(options) {
    const ctx = await super._prepareContext(options);
    const spell = this.#spell;
    const actor = this.#actor;
    const state = this.#state;
    const dmgType = spell.system.damageType ?? '-';
    const accent = ACCENT_RGB[dmgType] ?? ACCENT_RGB['-'];
    const phrases = RUNE_PHRASES[dmgType] ?? RUNE_PHRASES['-'];

    const costs = SpellCastDialog.calculateCosts(spell, actor, state);
    const finalMana = Math.max(0, costs.totalCost + state.manaOverrideDelta);

    const deliveryLabel = state.deliveryType
      ? game.i18n.localize(CONFIG.VAGABOND.deliveryTypes[state.deliveryType])
      : game.i18n.localize('VAGABOND.UI.Labels.Delivery');

    const damageTypeLabel = dmgType === '-'
      ? game.i18n.localize('VAGABOND.SpellCast.Damage')
      : game.i18n.localize(CONFIG.VAGABOND.damageTypes[dmgType] ?? dmgType);

    const range = this._computeRangeDisplay(state.deliveryType, state.deliveryIncrease);
    const rangeInactive = this._isRangeInactive(state.deliveryType);

    const deliveryOptions = Object.entries(CONFIG.VAGABOND.deliveryTypes).map(([key, lbl]) => {
      const cost = CONFIG.VAGABOND.deliveryDefaults[key]?.cost ?? 0;
      return {
        key,
        label: `${game.i18n.localize(lbl)} (${cost})`,
        selected: state.deliveryType === key,
      };
    });

    const mana = actor.system.mana ?? {};

    const messages = this._buildMessages(state, finalMana, costs);

    return foundry.utils.mergeObject(ctx, {
      spell: { id: spell.id, name: spell.name, img: spell.img },
      accentRGB: accent,
      runesOuter: distributeRunes(phrases.outer),
      runesInner: distributeRunes(phrases.inner),
      dice: state.damageDice,
      hasDamage: dmgType !== '-',
      deliveryType: state.deliveryType,
      deliveryLabel,
      deliveryCost: costs.deliveryBaseCost + costs.deliveryIncreaseCost,
      rangeValue: range.value,
      rangeUnit: range.unit,
      rangeInactive,
      totalMana: finalMana,
      manaOverrideActive: state.manaOverrideDelta !== 0,
      damageTypeLabel,
      focusOn: state.focusOn,
      fxOn: state.useFx,
      previewOn: state.previewActive,
      deliveryOptions,
      manaCurrent: mana.current ?? 0,
      manaMax: mana.max ?? 0,
      castingMax: mana.castingMax ?? 0,
      messages,
    });
  }

  /**
   * Build the message list shown below the Cast button.
   *
   * Order: the built-in validation message first (if any), then anything that
   * modules contribute via the `vagabond.spellCastMessages` hook. The hook
   * receives a mutable array and a read-only context snapshot:
   *
   *   Hooks.on('vagabond.spellCastMessages', (dialog, messages, context) => {
   *     messages.push({ text: 'Imbue requires Focus.', type: 'warning', blocking: true });
   *   });
   *
   * Each message: `{ text: string, type?: 'error'|'warning'|'info', blocking?: boolean }`.
   * A `blocking: true` message prevents casting (see `_onCast`).
   * See docs/spell-cast-dialog-messages.md for the full contract.
   *
   * The result is cached on `#messages` so `_onCast` can re-check blocking
   * without re-firing the hook.
   */
  _buildMessages(state, finalMana, costs) {
    const messages = [];
    const validationError = this._validate(state, finalMana);
    if (validationError) messages.push({ text: validationError, type: 'error', blocking: true });

    try {
      Hooks.callAll('vagabond.spellCastMessages', this, messages, {
        actor: this.#actor,
        spell: this.#spell,
        state: { ...state },
        finalMana,
        costs,
      });
    } catch (e) {
      console.error('Vagabond | spellCastMessages hook failed', e);
    }

    // Defensive: drop malformed entries so a bad module can't break render.
    this.#messages = messages.filter(m => m && typeof m.text === 'string' && m.text.length);
    return this.#messages;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  /** Override V2 setPosition — frameless dialog must be force-positioned via fixed.
   *  After the first compute the position is latched into #pos so re-renders
   *  don't re-anchor and teleport the dialog. Drag overwrites #pos directly. */
  setPosition(pos = {}) {
    const el = this.element;
    if (!el) return pos;
    // Compact mode renders a narrower root (matches .vsc-root.no-rings width)
    const hideRings = game.settings.get('vagabond', 'hideCastRings');
    const w = hideRings ? 260 : 350;
    // Measure the inner root (the actual painted dialog) — el is the
    // V2 wrapper and can report 0 or a very large value before layout.
    const inner = el.querySelector('.vsc-root');
    const measured = inner?.offsetHeight || el.offsetHeight || 0;
    const h = (measured > 100 && measured < window.innerHeight)
      ? measured
      : 600; // fallback approx — circle + header + button
    let left, top;
    if (this.#pos) {
      left = this.#pos.left;
      top = this.#pos.top;
    } else if (this.#anchorEl && document.body.contains(this.#anchorEl)) {
      // Dock beside the anchor horizontally; vertical center on screen
      const r = this.#anchorEl.getBoundingClientRect();
      const gap = 12;
      const spaceRight = window.innerWidth - r.right;
      const spaceLeft = r.left;
      if (spaceRight >= w + gap) {
        left = Math.round(r.right + gap);
      } else if (spaceLeft >= w + gap) {
        left = Math.round(r.left - w - gap);
      } else {
        left = Math.max(0, window.innerWidth - w - gap);
      }
      top = Math.max(0, Math.round((window.innerHeight - h) / 2));
      // Only latch after real measurement — first render usually returns the
      // fallback height. Recompute on the next frame once layout settles.
      if (measured > 100) this.#pos = { left, top };
    } else {
      left = Math.max(0, Math.round((window.innerWidth - w) / 2));
      top = Math.max(0, Math.round((window.innerHeight - h) / 2));
      if (measured > 100) this.#pos = { left, top };
    }
    el.style.position = 'fixed';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${w}px`;
    el.style.height = 'auto';
    return { left, top, width: w, height: h };
  }

  /** Attach drag handlers to the dialog root. Drag starts on any non-action element. */
  _attachDrag(signal) {
    const el = this.element;
    if (!el) return;
    let startX, startY, startLeft, startTop, dragging = false;

    el.addEventListener('mousedown', (ev) => {
      if (ev.button !== 0) return;
      // Skip if click originated on an actionable element
      if (ev.target.closest('[data-action], button, select, input, textarea, a')) return;
      const rect = el.getBoundingClientRect();
      startX = ev.clientX;
      startY = ev.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      dragging = true;
      ev.preventDefault();
    }, { signal });

    document.addEventListener('mousemove', (ev) => {
      if (!dragging) return;
      this.#pos = {
        left: Math.round(startLeft + (ev.clientX - startX)),
        top: Math.round(startTop + (ev.clientY - startY)),
      };
      this.setPosition();
    }, { signal });

    document.addEventListener('mouseup', () => { dragging = false; }, { signal });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.setPosition();
    // Re-measure after layout/font/svg paint so the centering uses the real
    // height. The first call inside _onRender often sees offsetHeight=0.
    requestAnimationFrame(() => this.setPosition());

    // Inline accent triplet + backdrop blur on root for CSS rgb(var(--ac))
    const root = this.element.querySelector('.vsc-root');
    if (root) {
      root.style.setProperty('--ac', context.accentRGB);
      const blur = Number(game.settings.get('vagabond', 'spellCastDialogBlur')) || 0;
      root.style.setProperty('--vsc-blur', `${blur}px`);
      const darkPct = Number(game.settings.get('vagabond', 'spellCastDialogDarkness')) || 0;
      root.style.setProperty('--vsc-dark', String(darkPct / 100));
      const hideRings = game.settings.get('vagabond', 'hideCastRings');
      root.classList.toggle('no-rings', !!hideRings);
      // Crop the SVG viewBox in compact mode so inner content (triangle, nodes)
      // stays the same pixel size while the dialog footprint shrinks.
      // Inner ring is at r=124 from center (180,180) → trim to 248x248 box.
      const svg = root.querySelector('.vsc-circle');
      if (svg) {
        svg.setAttribute('viewBox', hideRings ? '56 56 248 248' : '0 0 360 360');
      }
    }

    // Animation continuity across re-renders: rewind animation-delay so CSS keyframes
    // appear continuous despite SVG nodes being replaced on every render.
    const elapsedSec = (performance.now() - this.#openedAt) / 1000;
    const outer = this.element.querySelector('.vsc-runes.outer');
    const inner = this.element.querySelector('.vsc-runes.inner');
    if (outer) outer.style.animationDelay = `-${elapsedSec % 42}s`;
    if (inner) inner.style.animationDelay = `-${elapsedSec % 24}s`;
    this.element.querySelectorAll('.vsc-side.on circle').forEach(c => {
      c.style.animationDelay = `-${elapsedSec % 2}s`;
    });

    this.#ctrl?.abort();
    this.#ctrl = new AbortController();
    const signal = this.#ctrl.signal;

    this._attachDrag(signal);

    // Restore minimized state across re-renders
    const rootEl = this.element.querySelector('.vsc-root');
    if (rootEl && this.#minimized) rootEl.classList.add('minimized');

    // Double-click header → toggle minimized state (only header visible)
    const header = this.element.querySelector('.vsc-header');
    if (header) {
      header.addEventListener('dblclick', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.#minimized = !this.#minimized;
        const root = this.element.querySelector('.vsc-root');
        if (root) root.classList.toggle('minimized', this.#minimized);
      }, { signal });
    }

    // Right-click decrements for the three bumpable nodes
    const bindCtx = (selector, handler) => {
      this.element.querySelectorAll(selector).forEach(el => {
        el.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          handler.call(this, ev);
        }, { signal });
      });
    };

    bindCtx('[data-action="vscBumpDice"]', (ev) => this._bumpDice(-1));
    bindCtx('[data-action="vscBumpRange"]', (ev) => this._bumpRange(-1));
    bindCtx('[data-action="vscBumpMana"]', (ev) => this._bumpMana(-1));
    bindCtx('[data-action="vscModifyMana"]', (ev) => this._bumpActorMana(+1));

    // Manual click delegation for SVG-group actions — V2 action delegation
    // is unreliable on SVG <g> elements in some setups.
    const actions = SpellCastDialog.DEFAULT_OPTIONS.actions;
    this.element.querySelectorAll('svg [data-action]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const key = el.dataset.action;
        const fn = actions[key];
        if (typeof fn === 'function') fn.call(this, ev, el);
      }, { signal });
    });

    // Outside-click closes delivery list
    document.addEventListener('mousedown', (ev) => {
      const list = this.element.querySelector('.vsc-delivery-list:not(.hidden)');
      if (!list) return;
      if (!list.contains(ev.target) && !ev.target.closest('[data-action="vscOpenDelivery"]')) {
        list.classList.add('hidden');
      }
    }, { signal });
  }

  async close(options = {}) {
    this.#ctrl?.abort();
    if (this.#state.previewActive) {
      await globalThis.vagabond?.managers?.templates?.clearPreview(this.#actor.id, this.#spell.id);
    }
    if (SpellCastDialog.#current === this) SpellCastDialog.#current = null;
    return super.close({ ...options, animate: false });
  }

  // ── State mutation ───────────────────────────────────────────────────────

  /** Notify external listeners (e.g. character sheet) of live state changes. */
  _emitChange() {
    if (typeof this.#onChange === 'function') {
      try { this.#onChange({ ...this.#state }); } catch (e) { console.error('Vagabond | SpellCastDialog onChange failed', e); }
    }
  }

  _bumpDice(delta) {
    if (this.#spell.system.damageType === '-') return;
    const next = Math.max(0, this.#state.damageDice + delta);
    this.#state.damageDice = next;
    if (next === 0) this.#state.useFx = true;
    else if (this.#state.damageDice === 1 && delta > 0) this.#state.useFx = false;
    this._emitChange();
    this.render();
  }

  _bumpRange(delta) {
    const t = this.#state.deliveryType;
    if (!t) return;
    if (this._isRangeInactive(t)) return;
    const next = Math.max(0, this.#state.deliveryIncrease + delta);
    this.#state.deliveryIncrease = next;
    this._emitChange();
    this.render();
    this._refreshPreview();
  }

  _bumpMana(delta) {
    this.#state.manaOverrideDelta += delta;
    // Clamp so total can't go below 0
    const costs = SpellCastDialog.calculateCosts(this.#spell, this.#actor, this.#state);
    const minDelta = -costs.totalCost;
    if (this.#state.manaOverrideDelta < minDelta) this.#state.manaOverrideDelta = minDelta;
    this._emitChange();
    this.render();
  }

  _isRangeInactive(deliveryType) {
    if (!deliveryType) return true;
    const inc = CONFIG.VAGABOND.deliveryIncrement[deliveryType] ?? 0;
    const base = CONFIG.VAGABOND.deliveryBaseRanges[deliveryType];
    return inc === 0 || !base || base.value == null;
  }

  _computeRangeDisplay(deliveryType, deliveryIncrease) {
    if (!deliveryType) return { value: '—', unit: '' };
    const base = CONFIG.VAGABOND.deliveryBaseRanges[deliveryType];
    const inc = CONFIG.VAGABOND.deliveryIncrement[deliveryType] ?? 0;
    // Touch / Glyph (or any non-increasable, no-range delivery) — fixed limit of 1
    if (!base || base.value == null || inc === 0) return { value: '1', unit: '' };
    const total = base.value + inc * deliveryIncrease;
    if (base.type === 'count') return { value: String(total), unit: base.unit + (total > 1 ? 's' : '') };
    return { value: String(total), unit: 'ft' };
  }

  _validate(state, finalMana) {
    if (!state.deliveryType) return game.i18n.localize('VAGABOND.SpellCast.NoDelivery') || 'Select a delivery type.';
    const mana = this.#actor.system.mana;
    if (finalMana > mana.current) return `Not enough mana (need ${finalMana}, have ${mana.current}).`;
    if (finalMana > mana.castingMax) return `Exceeds casting max (${mana.castingMax}).`;
    return '';
  }

  async _refreshPreview() {
    if (!this.#state.previewActive) return;
    const t = this.#state.deliveryType;
    if (!t) return;
    const base = CONFIG.VAGABOND.deliveryBaseRanges[t];
    const inc = CONFIG.VAGABOND.deliveryIncrement[t] ?? 0;
    const distance = (base?.value ?? 0) + inc * this.#state.deliveryIncrease;
    await globalThis.vagabond?.managers?.templates?.updatePreview(
      this.#actor, this.#spell.id, t, distance
    );
  }

  // ── Cost calculation (static, reusable) ──────────────────────────────────

  /**
   * Pure cost computation for an explicit state object.
   * Mirrors SpellHandler._calculateSpellCost but reads from passed state.
   */
  static calculateCosts(spell, actor, state) {
    const hasDamage = spell.system.damageType !== '-' && state.damageDice >= 1;
    const damageCost = hasDamage && state.damageDice > 1 ? state.damageDice - 1 : 0;
    const fxCost = state.useFx && hasDamage ? 1 : 0;

    let deliveryBaseCost = state.deliveryType
      ? CONFIG.VAGABOND.deliveryDefaults[state.deliveryType].cost
      : 0;
    if (deliveryBaseCost > 0) {
      const reduce = actor.system.bonuses?.deliveryManaCostReduction || 0;
      deliveryBaseCost = Math.max(0, deliveryBaseCost - reduce);
    }

    const incPerStep = state.deliveryType
      ? (CONFIG.VAGABOND.deliveryIncreaseCost[state.deliveryType] ?? 0)
      : 0;
    const deliveryIncreaseCost = state.deliveryIncrease * incPerStep;

    let totalCost = damageCost + fxCost + deliveryBaseCost + deliveryIncreaseCost;
    const spellReduce = actor.system.bonuses?.spellManaCostReduction || 0;
    totalCost = Math.max(0, totalCost - spellReduce);

    return { damageCost, fxCost, deliveryBaseCost, deliveryIncreaseCost, totalCost };
  }

  // ── Action handlers ──────────────────────────────────────────────────────
  // V2 binds `this` to the instance when invoking action handlers, even when
  // they are declared static. The @this JSDoc tells TypeScript so it accepts
  // private-field access (#state etc) instead of flagging TS1111.

  /** @this {SpellCastDialog} */
  static async _onClose(event, target) {
    return this.close();
  }

  /** @this {SpellCastDialog} */
  static async _onCast(event, target) {
    const state = this.#state;
    const costs = SpellCastDialog.calculateCosts(this.#spell, this.#actor, state);
    const finalMana = Math.max(0, costs.totalCost + state.manaOverrideDelta);
    const err = this._validate(state, finalMana);
    // Recompute messages so module-contributed blocking entries are current,
    // then refuse to cast if anything blocks.
    const blocked = (this._buildMessages(state, finalMana, costs) ?? []).some(m => m.blocking);
    if (err || blocked) {
      // Re-render so the message panel shows. Don't notify.
      return this.render();
    }
    // Commit focus state to actor if changed
    const focusIds = this.#actor.system.focus?.spellIds ?? [];
    const currentlyFocused = focusIds.includes(this.#spell.id);
    if (state.focusOn !== currentlyFocused) {
      let next = state.focusOn
        ? [...focusIds, this.#spell.id]
        : focusIds.filter(id => id !== this.#spell.id);
      const focusMax = this.#actor.system.focus?.max ?? 5;
      if (state.focusOn && focusIds.length >= focusMax) {
        next = focusIds; // ignore — can't add
      }
      await this.#actor.update({ 'system.focus.spellIds': next });
      const wasFocusing = focusIds.length > 0;
      const isFocusing = next.length > 0;
      if (isFocusing !== wasFocusing) {
        await this.#actor.toggleStatusEffect('focusing', { active: isFocusing });
      }
    }
    // Clear preview before cast (sequencer takes over)
    if (state.previewActive) {
      await globalThis.vagabond?.managers?.templates?.clearPreview(this.#actor.id, this.#spell.id);
      this.#state.previewActive = false;
    }
    // Hand off to handler
    if (typeof this.#onCast === 'function') {
      await this.#onCast(event, {
        damageDice: state.damageDice,
        deliveryType: state.deliveryType,
        deliveryIncrease: state.deliveryIncrease,
        useFx: state.useFx,
      }, state.manaOverrideDelta);
    }
    return this.close();
  }

  /** @this {SpellCastDialog} */
  static async _onBumpDice(event, target) { this._bumpDice(+1); }
  /** @this {SpellCastDialog} */
  static async _onBumpRange(event, target) { this._bumpRange(+1); }
  /** @this {SpellCastDialog} */
  static async _onBumpMana(event, target)  { this._bumpMana(+1); }

  /** @this {SpellCastDialog} */
  static async _onOpenDelivery(event, target) {
    const list = this.element.querySelector('.vsc-delivery-list');
    if (list) list.classList.toggle('hidden');
  }

  /** @this {SpellCastDialog} */
  static async _onPickDelivery(event, target) {
    const key = target.dataset.key;
    if (!key) return;
    this.#state.deliveryType = key;
    this.#state.deliveryIncrease = 0;
    this._emitChange();
    this.render();
    this._refreshPreview();
  }

  /** @this {SpellCastDialog} */
  static async _onToggleTemplate(event, target) {
    if (!this.#state.deliveryType) return;
    this.#state.previewActive = !this.#state.previewActive;
    if (this.#state.previewActive) {
      await this._refreshPreview();
    } else {
      await globalThis.vagabond?.managers?.templates?.clearPreview(this.#actor.id, this.#spell.id);
    }
    this.render();
  }

  /** @this {SpellCastDialog} */
  static async _onToggleFocus(event, target) {
    this.#state.focusOn = !this.#state.focusOn;
    this.render();
  }

  /** @this {SpellCastDialog} */
  static async _onToggleFx(event, target) {
    this.#state.useFx = !this.#state.useFx;
    this._emitChange();
    this.render();
  }

  /** @this {SpellCastDialog} */
  static async _onModifyMana(event, target) { this._bumpActorMana(-1); }

  /** Bump actor's current mana by delta, clamp to [0, max], re-render dialog. */
  async _bumpActorMana(delta) {
    const mana = this.#actor.system.mana ?? {};
    const max = mana.max ?? 0;
    const current = mana.current ?? 0;
    const next = Math.max(0, Math.min(max, current + delta));
    if (next === current) return;
    await this.#actor.update({ 'system.mana.current': next });
    this.render();
  }
}
