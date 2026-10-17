import { VagabondMeasureTemplates } from './measure-templates.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { SpellTargetPicker } from '../helpers/spell-target-picker.mjs';
import { FocusUpkeep } from '../helpers/focus-upkeep.mjs';
import { SpellPlacement } from '../helpers/spell-placement.mjs';

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
  #dragCtrl = null;   // separate, longer-lived controller for _attachDrag — see _onRender
  #openedAt = performance.now();
  #pos = null;        // null = anchored/centered; once dragged, holds { left, top }
  #dragged = false;   // true once the user has manually dragged — suppresses re-anchoring
  #minimized = false; // collapsed-to-header state, toggled by dblclick on header
  #previewEl = null;  // body-level floating delivery-image preview (anchored to the ? icon)
  #messages = [];     // last-computed message list (validation + module-contributed)
  #targetHookId = null; // Foundry 'targetToken' hook — keeps area-requirement message live
  #tokenHookIds = null; // token create/update/delete hooks — keeps the Target picker's area list live
  #pickKey = '';        // Target picker entry keys at the last render (skip renders when nothing changed)
  #focusTouched = false; // the player flipped the Focus switch: stop deriving it from the Cast
  #renderDebounce = foundry.utils.debounce(() => { if (this.rendered) this.render(); }, 50);
  #previewDebounce = foundry.utils.debounce(() => this._refreshPreview(), 80);
  #retargetDebounce = foundry.utils.debounce(() => this._autoTargetArea(), 80);
  #markers = null;      // Remote spaces drawn on the canvas (SpellPlacement.drawMarkers)

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
    // No damage type and no dice scaling: the dice node shows 0 and stays locked.
    const noDice = spell.system.damageType === '-' && !spell.system.usesDiceScaling;
    this.#state = {
      damageDice: noDice ? 0 : (initialState?.damageDice ?? 1),
      deliveryType: initialState?.deliveryType ?? null,
      deliveryIncrease: initialState?.deliveryIncrease ?? 0,
      // No damage type: the Effect IS the Cast, so FX is always on (locked).
      useFx: spell.system.damageType === '-' ? true : (initialState?.useFx ?? false),
      focusOn: false, // derived in _prepareContext until the player flips the switch (#focusTouched)
      previewActive: false,
      manaOverrideDelta: 0,
      imbueAssignments: {}, // weaponUuid -> true (multi-select, not one-per-target)
      targetPicks: {},      // Target picker: entry key -> bool (explicit choices; see SpellTargetPicker)
      areaAnchor: null,     // Cube / Sphere placed by hand: {x, y, tokenId?} (SpellPlacement)
      targetSpaces: [],     // Remote: Targets that are spaces on the map [{x, y}] (SpellPlacement)
    };
  }

  static DEFAULT_OPTIONS = {
    id: 'spell-cast-dialog-{id}',
    classes: ['vagabond', 'spell-cast-dialog'],
    window: { frame: false },
    position: { width: 390, height: 'auto' },
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
      vscPickImbueWeapon: SpellCastDialog._onPickImbueWeapon,
      vscPickTarget:     SpellCastDialog._onPickTarget,
      vscPlace:          SpellCastDialog._onPlace,
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

    // Imbue: the Target ("Increase") count is not player-bumped — it IS the
    // number of selected weapons (book: Target = a weapon; first free, +2 mana
    // each additional). Re-derive on every render so weapon clicks, target
    // changes, and delivery re-picks all stay consistent before costing.
    if (state.deliveryType === 'imbue') {
      state.deliveryIncrease = Math.max(0, this._imbueCandidates().filter(c => c.selected).length - 1);
    }

    // Target picker (Spells that pick their Beings / Objects): a Remote Increase is the number of picks.
    const pickModes = SpellTargetPicker.modes(spell, state.deliveryType);
    const pickEntries = pickModes ? SpellTargetPicker.candidates(actor, spell, state) : [];
    // Remote: the Increase follows the Targets (picks / targeted tokens + spaces), see _syncTargetIncrease
    this._syncTargetIncrease();
    const pickRing = SpellTargetPicker.layout(pickEntries);
    this.#pickKey = pickEntries.map(e => e.key).join('|');

    // Focus switch: on when already Focused, or when a Focus on Cast Spell's Cast includes its Effect
    if (!this.#focusTouched) {
      state.focusOn = (actor.system.focus?.spellIds ?? []).includes(spell.id) || SpellCastDialog.castOpensFocus(spell, state);
    }

    const costs = SpellCastDialog.calculateCosts(spell, actor, state);
    const finalMana = Math.max(0, costs.totalCost + state.manaOverrideDelta);

    const deliveryLabel = state.deliveryType
      ? game.i18n.localize(CONFIG.VAGABOND.deliveryTypes[state.deliveryType])
      : game.i18n.localize('VAGABOND.UI.Labels.Delivery');

    const usesDiceScaling = !!spell.system.usesDiceScaling;
    // Dice node is interactive when there's a real damage type OR dice scaling.
    let diceClickable = dmgType !== '-' || usesDiceScaling;

    // Imbue: triangle + delivery-cost/dice nodes give way to the weapon picker.
    // In deferred-mana mode (default), dice/FX aren't chosen until delivery time,
    // so they go inactive too; upfront mode still decides them at cast.
    const imbueActive = state.deliveryType === 'imbue';
    const imbueUpfront = game.settings.get('vagabond', 'imbueUpfrontMana');
    const hideDiceFx = imbueActive && !imbueUpfront;
    diceClickable = diceClickable && !hideDiceFx;
    const imbueRing = imbueActive ? this._imbueRingLayout() : { weapons: [], iconSize: 42 };
    const damageTypeLabel = dmgType !== '-'
      ? game.i18n.localize(CONFIG.VAGABOND.damageTypes[dmgType] ?? dmgType)
      : (usesDiceScaling
          ? (spell.system.diceScaleLabel || game.i18n.localize('VAGABOND.SpellCast.Dice'))
          : game.i18n.localize('VAGABOND.SpellCast.Damage'));

    const range = this._computeRangeDisplay(state.deliveryType, state.deliveryIncrease);
    const rangeInactive = this._isRangeInactive(state.deliveryType);

    const deliveryOptions = Object.entries(CONFIG.VAGABOND.deliveryTypes).map(([key, lbl]) => {
      const cost = CONFIG.VAGABOND.deliveryDefaults[key]?.cost ?? 0;
      const img = CONFIG.VAGABOND.deliveryImages?.[key] ?? null;
      const Cap = key.charAt(0).toUpperCase() + key.slice(1);
      return {
        key,
        label: `${game.i18n.localize(lbl)} (${cost})`,
        selected: state.deliveryType === key,
        hasImg: !!img,
        img,
        name: game.i18n.localize(lbl),
        hint: game.i18n.localize(`VAGABOND.DeliveryTypes.${Cap}.hint`),
        description: game.i18n.localize(`VAGABOND.DeliveryTypes.${Cap}.description`),
      };
    });

    const mana = actor.system.mana ?? {};

    const messages = this._buildMessages(state, finalMana, costs);

    // Crosshair: aim a Cube / Sphere, or add Remote spaces (SpellPlacement)
    const placeMode = SpellPlacement.modeFor(state.deliveryType);
    const placeOn = placeMode === 'area' ? !!state.areaAnchor : (placeMode === 'spaces' && state.targetSpaces.length > 0);

    return foundry.utils.mergeObject(ctx, {
      spell: { id: spell.id, name: spell.name, img: spell.img },
      accentRGB: accent,
      runesOuter: distributeRunes(phrases.outer),
      runesInner: distributeRunes(phrases.inner),
      dice: state.damageDice,
      hasDamage: dmgType !== '-',
      diceClickable,
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
      fxLocked: dmgType === '-',
      previewOn: state.previewActive,
      deliveryOptions,
      manaCurrent: mana.current ?? 0,
      manaMax: mana.max ?? 0,
      castingMax: mana.castingMax ?? 0,
      messages,
      imbueActive,
      imbueWeapons: imbueRing.weapons,
      imbueIconSize: imbueRing.iconSize,
      hideDiceFx,
      picksActive: !!pickModes,
      pickEntries: pickRing.entries,
      pickIconSize: pickRing.iconSize,
      placeMode,
      placeOn,
      placeTitle: placeMode ? game.i18n.localize(placeMode === 'area' ? 'VAGABOND.SpellPlace.AreaButton' : 'VAGABOND.SpellPlace.SpacesButton') : '',
    });
  }

  /**
   * Build the message list shown below the Cast button.
   *
   * Order: first-party messages first — capability gates, then cost/delivery
   * validation, then the area-placement requirement — followed by anything
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

    // 1. Capability gates — mirror the hard checks in SpellHandler._executeCast.
    //    These truly prevent a cast, so they are blocking errors.
    const classData = this.#actor.system.classData ?? {};
    if (!classData.isSpellcaster) {
      messages.push({ text: 'Your class cannot cast spells!', type: 'error', blocking: true });
    } else if (!classData.manaSkill) {
      messages.push({ text: 'No mana skill configured for this class!', type: 'error', blocking: true });
    }

    // 2. Built-in cost/delivery validation (delivery selected, mana, casting max).
    const validationError = this._validate(state, finalMana);
    if (validationError) messages.push({ text: validationError, type: 'error', blocking: true });

    // 3. Area placement requirement for the chosen delivery (e.g. cube/sphere/line
    //    need a target). Non-blocking: matches legacy behaviour where the cast
    //    proceeds and only the template draw waits for a target.
    const areaError = this._areaRequirementMessage(state);
    if (areaError) messages.push(areaError);

    // 3a. Range check of what was placed by hand (world settings spellPlacement*)
    const rangeError = this._placementRangeMessage(state);
    if (rangeError) messages.push(rangeError);

    // 3b. Imbue: surface the mana implications of the delivery timing.
    if (state.deliveryType === 'imbue' && !game.settings.get('vagabond', 'imbueUpfrontMana')) {
      messages.push({
        text: game.i18n.localize('VAGABOND.Status.Imbue.DeferredHint'),
        type: 'info',
        blocking: false,
      });
    } else if (costs.deferredMana > 0) {
      messages.push({
        text: game.i18n.format('VAGABOND.Status.Imbue.DeferredCost', { cost: costs.deferredMana }),
        type: 'info',
        blocking: false,
      });
    }

    // 3b'. Focus Mana on Cast (Ward: "1 Mana per Target to Focus on this Spell")
    if (costs.focusCost > 0) {
      const perTarget = FocusUpkeep.rule(this.#spell)?.perTarget;
      messages.push({
        text: game.i18n.format(perTarget ? 'VAGABOND.FocusUpkeep.CastLineTargets' : 'VAGABOND.FocusUpkeep.CastLine',
          { mana: costs.focusCost, targets: costs.focusTargets }),
        type: 'info',
        blocking: false,
      });
    }

    // 3c. Imbue: warn (non-blocking) about targeted beings with no weapon to imbue —
    // the weapon-picker panel omits them entirely, so surface it here.
    if (state.deliveryType === 'imbue') {
      for (const token of this._imbueTargetTokens()) {
        const hasWeapon = token.actor?.items.some(i => EquipmentHelper.canImbue(i));
        if (hasWeapon) continue;
        messages.push({
          text: game.i18n.format('VAGABOND.SpellCast.ImbueNoWeaponSkip', { name: token.name }),
          type: 'warning',
          blocking: false,
        });
      }
    }

    // 3d. Target picker: Targets listed but none picked.
    if (SpellTargetPicker.modes(this.#spell, state.deliveryType)?.beings) {
      const entries = SpellTargetPicker.candidates(this.#actor, this.#spell, state);
      if (entries.length && !entries.some(c => c.selected)) {
        messages.push({ text: game.i18n.localize('VAGABOND.SpellCast.NoTargetPicked'), type: 'warning', blocking: false });
      }
    }

    // 4. Module-contributed messages.
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

  /** Bounding box of the docking anchor, expanded to include the sliding panel
   *  when it is open. The panel is an absolutely-positioned child of the sheet,
   *  so it overflows the sheet's own border box and would otherwise be ignored
   *  by getBoundingClientRect — leaving the dialog docked on top of it. */
  _anchorRect() {
    const el = this.#anchorEl;
    const r = el.getBoundingClientRect();
    let { left, right, top, bottom } = r;
    const panel = el.querySelector?.('.sliding-panel.panel-open');
    if (panel) {
      const pr = panel.getBoundingClientRect(); // accounts for the 2deg rotate
      left = Math.min(left, pr.left);
      right = Math.max(right, pr.right);
      top = Math.min(top, pr.top);
      bottom = Math.max(bottom, pr.bottom);
    }
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  /** Raise the dialog above every other open window. Frameless dialogs are not
   *  z-managed by Foundry's window manager, so a static CSS z-index loses the
   *  moment the actor sheet is brought to front (its inline z-index floats
   *  upward on every click — e.g. when opening the sliding panel). We compute
   *  the current top z ourselves and sit one above it. Re-invoked on any
   *  outside pointerdown so we reclaim the top after the sheet re-raises. */
  _raiseToTop() {
    const el = this.element;
    if (!el) return;
    let max = 0;
    for (const node of document.querySelectorAll('.application, .app')) {
      if (node === el) continue;
      const z = parseInt(node.style.zIndex || window.getComputedStyle(node).zIndex, 10);
      if (Number.isFinite(z) && z > max) max = z;
    }
    el.style.zIndex = String(Math.max(max + 1, 1100));
  }

  /** Override V2 setPosition — frameless dialog must be force-positioned via fixed.
   *  After the first compute the position is latched into #pos so re-renders
   *  don't re-anchor and teleport the dialog. Drag overwrites #pos directly. */
  setPosition(pos = {}) {
    const el = this.element;
    if (!el) return pos;
    // Compact mode renders a narrower root (matches .vsc-root.no-rings width)
    const hideRings = game.settings.get('vagabond', 'hideCastRings');
    const w = hideRings ? 300 : 390;
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
      // Dock beside the anchor horizontally; vertical center on screen.
      // _anchorRect() folds in the sliding panel when it is open so we dock
      // beyond it rather than landing inside the expanded sheet footprint.
      const r = this._anchorRect();
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

  /** Attach drag handlers to the dialog root. Drag starts on any non-action element.
   *  Pointer Events (not mouse-only) so touch/pen drag it too, with no separate
   *  touch-to-mouse translation needed elsewhere. Pointer capture keeps move/up
   *  routed to `el` even once the finger/cursor leaves its bounds, so a single
   *  pair of listeners on `el` covers the whole gesture — no document-level
   *  listeners, and nothing to lose track of if the pointer strays off-element. */
  _attachDrag(signal) {
    const el = this.element;
    if (!el) return;
    let startX, startY, startLeft, startTop, dragging = false;

    el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      // Skip if the gesture originated on an actionable element
      if (ev.target.closest('[data-action], button, select, input, textarea, a')) return;
      const rect = el.getBoundingClientRect();
      startX = ev.clientX;
      startY = ev.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      dragging = true;
      el.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    }, { signal });

    el.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      this.#dragged = true; // suppress automatic re-anchoring once moved by hand
      this.#pos = {
        left: Math.round(startLeft + (ev.clientX - startX)),
        top: Math.round(startTop + (ev.clientY - startY)),
      };
      this.setPosition();
    }, { signal });

    el.addEventListener('pointerup', () => { dragging = false; }, { signal });
    el.addEventListener('pointercancel', () => { dragging = false; }, { signal });

    // Belt-and-suspenders: `touch-action: none` (CSS) is what's SUPPOSED to stop
    // the browser from claiming a one-finger drag as a native page scroll, but
    // preventDefault() on the pointer events above does NOT do that itself (only
    // the Touch Events API does) — so if the CSS is missing, stale-cached, or
    // simply not applied to the exact touched descendant, a touch browser can
    // still hijack the gesture as a scroll a few px in and fire `pointercancel`,
    // which looks exactly like "drag moves a little then stops." A real
    // non-passive touchmove listener removes that whole dependency.
    el.addEventListener('touchmove', (ev) => { if (dragging) ev.preventDefault(); }, { signal, passive: false });
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.setPosition();
    this._raiseToTop();
    // Re-measure after layout/font/svg paint so the centering uses the real
    // height. The first call inside _onRender often sees offsetHeight=0.
    requestAnimationFrame(() => { this.setPosition(); this._raiseToTop(); });

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
    this.element.querySelectorAll('.vsc-side.on circle:not(.vsc-side-run)').forEach(c => {
      c.style.animationDelay = `-${elapsedSec % 2}s`;
    });
    this.element.querySelectorAll('.vsc-side.on circle.vsc-side-run').forEach(c => {
      c.style.animationDelay = `-${elapsedSec % 1.6}s`;
    });
    this.element.querySelectorAll('.vsc-message--warning').forEach(m => {
      m.style.animationDelay = `-${elapsedSec % 1.6}s`;
    });

    this.#ctrl?.abort();
    this.#ctrl = new AbortController();
    const signal = this.#ctrl.signal;

    // Bound once for the dialog's lifetime, on its own controller — el persists
    // across re-renders (only the part's inner HTML is replaced), but #ctrl is
    // recycled on every render. Rebinding drag on #ctrl's signal would reset
    // the in-progress-drag closure state (and drop pointer capture) if a
    // render happens mid-drag, e.g. from the targetToken-triggered #renderDebounce.
    if (!this.#dragCtrl) {
      this.#dragCtrl = new AbortController();
      this._attachDrag(this.#dragCtrl.signal);
    }

    // Stay above the actor sheet at all times. Any click outside the dialog
    // may have raised another window (notably the sheet, when the user opens
    // the sliding panel). Re-raise on the next frame — after the window
    // manager has assigned the new z — so we never end up behind it. Capture
    // phase + rAF guarantees we run last; rAF fires before paint, so no flicker.
    document.addEventListener('pointerdown', (ev) => {
      if (this.element?.contains(ev.target)) return;
      requestAnimationFrame(() => this._raiseToTop());
    }, { signal, capture: true });

    // Re-dock when the sliding panel finishes opening/closing so the dialog
    // never overlaps it. Skipped once the user has dragged the dialog by hand.
    const panel = this.#anchorEl?.querySelector?.('.sliding-panel');
    if (panel) {
      panel.addEventListener('transitionend', (ev) => {
        if (ev.propertyName !== 'transform' || this.#dragged) return;
        this.#pos = null; // unlatch so setPosition re-anchors to the new footprint
        this.setPosition();
        requestAnimationFrame(() => { this.setPosition(); this._raiseToTop(); });
      }, { signal });
    }

    // Keep the area-requirement message (and template preview) live as the
    // player targets/untargets tokens on the canvas. Registered once; removed
    // in close(). Debounced so rapid target changes don't thrash render.
    if (this.#targetHookId == null) {
      this.#targetHookId = Hooks.on('targetToken', () => {
        this.#renderDebounce();
        this.#previewDebounce();
      });
    }
    // Target picker: Beings walking in / out of the area refresh the ring.
    // One check per move, after the token stops (the area is built from the
    // animated Token#center); the dialog re-renders only when the list changed,
    // the preview redraws only when the caster or a Target moved (shape moved).
    if (this.#tokenHookIds == null) {
      const settled = (doc) => {
        if (!this.rendered) return;
        // Hand-placed area: a token moving in / out (or the one it follows) re-targets and redraws
        if (this.#state.areaAnchor && SpellPlacement.modeFor(this.#state.deliveryType) === 'area') {
          this.#previewDebounce();
          this.#retargetDebounce();
        }
        if (!SpellTargetPicker.modes(this.#spell, this.#state.deliveryType)) return;
        const tok = doc?.object;
        if (tok && (tok === SpellTargetPicker.casterToken(this.#actor) || game.user.targets.has(tok))) this.#previewDebounce();
        if (this.#pickListKey() !== this.#pickKey) this.#renderDebounce();
      };
      const onUpdate = (doc, change) => {
        if (!('x' in change || 'y' in change || 'width' in change || 'height' in change || 'hidden' in change)) return;
        const anim = doc.object?.movementAnimationPromise;
        if (anim?.then) anim.then(() => settled(doc), () => settled(doc));
        else settled(doc);
      };
      this.#tokenHookIds = [
        ['createToken', Hooks.on('createToken', () => settled(null))],
        ['updateToken', Hooks.on('updateToken', onUpdate)],
        ['deleteToken', Hooks.on('deleteToken', () => settled(null))],
      ];
    }

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
    bindCtx('[data-action="vscPlace"]', (ev) => this._clearPlacement());

    // Remote spaces stay visible on the map while the dialog is open
    this._syncMarkers();

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

    this._bindDeliveryPreviews(signal);
  }

  /**
   * Hover preview for delivery-type explainer images. The preview is a single
   * `position: fixed` <img> appended to <body> — so it can never be clipped or
   * stacked behind the dialog's SVG/overlays — anchored to the hovered "?" icon
   * via getBoundingClientRect (NOT to the dialog/HUD position).
   * @param {AbortSignal} signal
   */
  _bindDeliveryPreviews(signal) {
    // The "?" help is a standalone sibling of the pick button (not a child), so
    // it receives its own pointer events — the preview shows ONLY on its hover.
    const helps = this.element.querySelectorAll('.vsc-del-help[data-img]');
    if (!helps.length) return;

    const accent = this.element.querySelector('.vsc-root')?.style.getPropertyValue('--ac') || '';

    // Panel = hint title (top) + image + description (bottom). Built once,
    // re-used; appended to <body> so it can't be clipped by the dialog.
    const ensureEl = () => {
      if (this.#previewEl) return this.#previewEl;
      const panel = document.createElement('div');
      panel.className = 'vsc-delivery-preview-float';
      if (accent) panel.style.setProperty('--ac', accent);
      panel.innerHTML = `
        <div class="vsc-dp-name"></div>
        <div class="vsc-dp-hint"></div>
        <img class="vsc-dp-img" />
        <div class="vsc-dp-desc"></div>`;
      document.body.appendChild(panel);
      this.#previewEl = panel;
      return panel;
    };

    const show = (el) => {
      const src = el.dataset.img;
      if (!src) return;
      const panel = ensureEl();
      const img = panel.querySelector('.vsc-dp-img');
      if (img.dataset.src !== src) { img.src = src; img.dataset.src = src; }
      panel.querySelector('.vsc-dp-name').textContent = el.dataset.name || '';
      panel.querySelector('.vsc-dp-hint').textContent = el.dataset.hint || '';
      panel.querySelector('.vsc-dp-desc').textContent = el.dataset.desc || '';
      const r = el.getBoundingClientRect();
      const W = 240;
      // Open to the RIGHT of the icon; flip left if it would clip the viewport.
      let left = r.right + 12;
      if (left + W > window.innerWidth - 8) left = r.left - 12 - W;
      panel.style.left = `${Math.max(8, left)}px`;
      panel.style.top = `${r.top + r.height / 2}px`;
      panel.classList.add('visible');
    };

    const hide = () => this.#previewEl?.classList.remove('visible');

    helps.forEach((el) => {
      el.addEventListener('mouseenter', () => show(el), { signal });
      el.addEventListener('mouseleave', hide, { signal });
    });
  }

  async close(options = {}) {
    SpellPlacement.cancel();
    SpellPlacement.clearMarkers(this.#markers);
    this.#markers = null;
    this.#ctrl?.abort();
    this.#dragCtrl?.abort();
    this.#previewEl?.remove();
    this.#previewEl = null;
    if (this.#targetHookId != null) {
      Hooks.off('targetToken', this.#targetHookId);
      this.#targetHookId = null;
    }
    for (const [hook, id] of this.#tokenHookIds ?? []) Hooks.off(hook, id);
    this.#tokenHookIds = null;
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
    if (this.#spell.system.damageType === '-' && !this.#spell.system.usesDiceScaling) return;
    if (this.#state.deliveryType === 'imbue' && !game.settings.get('vagabond', 'imbueUpfrontMana')) return;
    const next = Math.max(0, this.#state.damageDice + delta);
    this.#state.damageDice = next;
    if (this.#spell.system.damageType !== '-') {
      if (next === 0) this.#state.useFx = true;
      else if (next === 1 && delta > 0) this.#state.useFx = false;
    }
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
    this._autoTargetArea();
  }

  // ── Hand placement (SpellPlacement) ───────────────────────────────────────

  /** Targets of a Remote Cast: picks / targeted tokens, plus spaces. */
  _remoteTargetCount() {
    const state = this.#state;
    const base = SpellTargetPicker.modes(this.#spell, state.deliveryType)
      ? SpellTargetPicker.targetCount(this.#actor, this.#spell, state)
      : game.user.targets.size;
    return base + (state.targetSpaces?.length ?? 0);
  }

  /** Remote whose Increase is read from its Targets: always with the Target picker, else once something is targeted. */
  _targetsDriveIncrease(deliveryType) {
    if (deliveryType === 'imbue' || !SpellTargetPicker.picksDriveIncrease(deliveryType)) return false;
    if (SpellTargetPicker.modes(this.#spell, deliveryType)) return true;
    return this._remoteTargetCount() > 0;
  }

  /** Remote: Increase = Targets - 1 (book: +1 per additional Target). */
  _syncTargetIncrease() {
    if (!this._targetsDriveIncrease(this.#state.deliveryType)) return;
    this.#state.deliveryIncrease = Math.max(0, this._remoteTargetCount() - 1);
  }

  /** Area size in feet for the current delivery + Increase. */
  _areaDistance() {
    const t = this.#state.deliveryType;
    const base = CONFIG.VAGABOND.deliveryBaseRanges[t]?.value ?? 0;
    const inc = CONFIG.VAGABOND.deliveryIncrement[t] ?? 0;
    return base + inc * this.#state.deliveryIncrease;
  }

  /** Hand-placed area: the tokens inside become the user's targets (the caster excluded). */
  _autoTargetArea() {
    const state = this.#state;
    if (!this.rendered || !state.areaAnchor || SpellPlacement.modeFor(state.deliveryType) !== 'area' || !canvas?.ready) return;
    const caster = SpellTargetPicker.casterToken(this.#actor);
    const ids = SpellTargetPicker.tokensInArea(this.#actor, state).filter(t => t !== caster).map(t => t.id);
    const current = new Set(Array.from(game.user.targets).map(t => t.id));
    if (ids.length === current.size && ids.every(id => current.has(id))) return;
    canvas.tokens.setTargets(ids, { mode: 'replace' });
  }

  /** Right-click on the crosshair: forget the aim point / spaces. */
  _clearPlacement() {
    SpellPlacement.cancel();
    this.#state.areaAnchor = null;
    this.#state.targetSpaces = [];
    this._syncTargetIncrease();
    this._emitChange();
    this.render();
    this._refreshPreview();
  }

  /** Draw the Remote spaces on the map (redrawn on every render). */
  _syncMarkers() {
    SpellPlacement.clearMarkers(this.#markers);
    this.#markers = SpellPlacement.modeFor(this.#state.deliveryType) === 'spaces'
      ? SpellPlacement.drawMarkers(this.#state.targetSpaces,
        SpellPlacement.rgbToNumber(ACCENT_RGB[this.#spell.system.damageType ?? '-'] ?? ACCENT_RGB['-']))
      : null;
  }

  /** Placed point(s) the caster can't reach (sight / distance setting), or null. */
  _placementRangeMessage(state) {
    const mode = SpellPlacement.modeFor(state.deliveryType);
    let err = null;
    if (mode === 'area' && state.areaAnchor) {
      err = SpellPlacement.rangeError(this.#actor, VagabondMeasureTemplates.anchorPoint(state.areaAnchor));
    } else if (mode === 'spaces') {
      const bad = state.targetSpaces.map(p => SpellPlacement.rangeError(this.#actor, p)).filter(Boolean);
      if (bad.length) err = bad.length > 1 ? game.i18n.format('VAGABOND.SpellPlace.SpacesOutOfRange', { n: bad.length }) : bad[0];
    }
    if (!err) return null;
    const block = SpellPlacement.enforce === 'block';
    return { text: err, type: block ? 'error' : 'warning', blocking: block };
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

  /** Currently-targeted tokens eligible for Imbue — all of them, uncapped.
   *  The book's "Target" is a WEAPON, not a being: every equipped weapon of
   *  every targeted willing being is a candidate; cost scales with how many
   *  weapons get selected, not how many beings are pointed at. */
  _imbueTargetTokens() {
    if (this.#state.deliveryType !== 'imbue') return [];
    return Array.from(game.user.targets);
  }

  /** Every equipped weapon across all currently-targeted tokens, each a
   *  candidate the player can freely toggle on/off (no per-target exclusivity). */
  _imbueCandidates() {
    const assignments = this.#state.imbueAssignments;
    const candidates = [];
    for (const token of this._imbueTargetTokens()) {
      const actor = token.actor;
      if (!actor) continue;
      const weapons = actor.items.filter(i => EquipmentHelper.canImbue(i));
      for (const w of weapons) {
        candidates.push({
          tokenId: token.id,
          uuid: w.uuid,
          img: w.img,
          selected: !!assignments[w.uuid],
          tooltip: `${token.name}: ${w.name}`,
        });
      }
    }
    return candidates;
  }

  /** Render-only ring layout of `_imbueCandidates()`: icons sit on a circle
   *  of radius 86 around the center mana node (viewBox units), split into two
   *  side arcs so the top Range node and bottom delivery label stay clear.
   *  Alternating left/right spread — no grouping by target. Icon size shrinks
   *  past 6 candidates. */
  _imbueRingLayout() {
    const candidates = this._imbueCandidates();
    const R = 86;
    const ARC_SPAN_MAX = 100; // degrees per side arc
    const left = candidates.filter((_, i) => i % 2 === 0);
    const right = candidates.filter((_, i) => i % 2 === 1);

    const place = (list, centerDeg) => {
      const k = list.length;
      const span = Math.min(ARC_SPAN_MAX, (k - 1) * 35);
      list.forEach((c, i) => {
        const deg = k === 1 ? centerDeg : centerDeg - span / 2 + (span * i) / (k - 1);
        const rad = (deg * Math.PI) / 180;
        c.x = Math.round((180 + R * Math.cos(rad)) * 10) / 10;
        c.y = Math.round((180 + R * Math.sin(rad)) * 10) / 10;
      });
    };
    place(left, 180); // left arc, centered at 9 o'clock
    place(right, 0);  // right arc, centered at 3 o'clock

    const n = candidates.length;
    const iconSize = n <= 6 ? 42 : Math.max(28, 42 - 3 * (n - 6));
    return { weapons: candidates, iconSize };
  }

  _isRangeInactive(deliveryType) {
    if (!deliveryType) return true;
    // Imbue's target count is driven by weapon selection, never bumped manually.
    if (deliveryType === 'imbue') return true;
    // Same for a Remote Cast counted from its Targets (picker, targeted tokens, spaces).
    if (this._targetsDriveIncrease(deliveryType)) return true;
    const inc = CONFIG.VAGABOND.deliveryIncrement[deliveryType] ?? 0;
    const base = CONFIG.VAGABOND.deliveryBaseRanges[deliveryType];
    return inc === 0 || !base || base.value == null;
  }

  _computeRangeDisplay(deliveryType, deliveryIncrease) {
    if (!deliveryType) return { value: '—', unit: '' };
    // Imbue: read-only counter of selected weapons — starts at 0.
    if (deliveryType === 'imbue') {
      const n = this._imbueCandidates().filter(c => c.selected).length;
      return { value: String(n), unit: n === 1 ? 'target' : 'targets' };
    }
    // Remote counted from its Targets (picker, targeted tokens, spaces): read-only counter, like Imbue.
    if (this._targetsDriveIncrease(deliveryType)) {
      const n = this._remoteTargetCount();
      return { value: String(n), unit: n === 1 ? 'target' : 'targets' };
    }
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
    if (state.deliveryType === 'imbue') {
      const hasAssignment = this._imbueCandidates().some(c => c.selected);
      if (!hasAssignment) return game.i18n.localize('VAGABOND.SpellCast.NoImbueTarget');
    }
    return '';
  }

  /**
   * Area-placement requirement message for the current delivery type, or null.
   * Delegates the rules to VagabondMeasureTemplates so the wording matches the
   * actual draw step exactly. Non-blocking — the cast may proceed; the template
   * simply won't draw until a target exists.
   */
  _areaRequirementMessage(state) {
    if (!state.deliveryType) return null;
    const casterToken = this.#actor.token?.object ?? this.#actor.getActiveTokens(true)[0];
    const err = VagabondMeasureTemplates.areaRequirementError(state.deliveryType, {
      hasTarget: game.user.targets.size > 0 || !!VagabondMeasureTemplates.anchorPoint(state.areaAnchor),
      hasOrigin: !!casterToken,
    });
    return err ? { text: err, type: 'warning', blocking: false } : null;
  }

  /** Target picker entry keys right now (compared with #pickKey from the last render). */
  #pickListKey() {
    if (!SpellTargetPicker.modes(this.#spell, this.#state.deliveryType)) return '';
    return SpellTargetPicker.candidates(this.#actor, this.#spell, this.#state).map(e => e.key).join('|');
  }

  async _refreshPreview() {
    if (!this.#state.previewActive) return;
    const t = this.#state.deliveryType;
    if (!t) return;
    const distance = this._areaDistance();
    // notify:false — the dialog already shows any placement issue inline via
    // _areaRequirementMessage; suppress the duplicate toast.
    await globalThis.vagabond?.managers?.templates?.updatePreview(
      this.#actor, this.#spell.id, t, distance,
      { notify: false, damageType: this.#spell.system.damageType, fxSchool: this.#spell.system.fxSchool,
        anchor: SpellPlacement.modeFor(t) === 'area' ? this.#state.areaAnchor : null }
    );
  }

  // ── Cost calculation (static, reusable) ──────────────────────────────────

  /**
   * Focus on Cast (`system.focusOnCast`): the Cast opens Focused only when it includes the Spell's Effect —
   * an Effect-only Spell always, a damage Spell only with FX on (a damage-only Cast has no Effect to sustain).
   * Deferred Imbue picks Damage / Effect at delivery, so it counts as including it.
   */
  static castOpensFocus(spell, state) {
    if (!spell.system.focusOnCast) return false;
    if ((spell.system.damageType ?? '-') === '-') return true;
    if (state.deliveryType === 'imbue' && !game.settings.get('vagabond', 'imbueUpfrontMana')) return true;
    return !!state.useFx;
  }

  /**
   * Pure cost computation for an explicit state object.
   * Mirrors SpellHandler._calculateSpellCost but reads from passed state.
   */
  static calculateCosts(spell, actor, state) {
    const hasDamage = spell.system.damageType !== '-' && state.damageDice >= 1;
    // Dice-scaling spells (no damage type) charge the same per-die mana as damage
    // dice so the dice are a real resource; the first die is free.
    const diceActive = hasDamage || (spell.system.usesDiceScaling && state.damageDice >= 1);
    // noFreeDie spells (Life) pay for every die, the first included.
    const freeDice = spell.system.noFreeDie ? 0 : 1;
    const damageCost = diceActive ? Math.max(0, state.damageDice - freeDice) : 0;
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

    // Imbue defers casting (Damage/Effect) mana to delivery-on-hit — the Attack
    // Check is the Cast Check, so the spell isn't cast (and its mana isn't owed)
    // until then. Only the Delivery/targeting cost is paid at Imbue time, unless
    // the table prefers the simpler legacy upfront model via the world setting.
    const isImbue = state.deliveryType === 'imbue';
    const imbueUpfront = isImbue && game.settings.get('vagabond', 'imbueUpfrontMana');
    const IMBUE_TRIGGER_FEE = 1; // flat "spend 1 Mana to do so when the attack hits" cost

    const spellReduce = actor.system.bonuses?.spellManaCostReduction || 0;

    const upfrontRaw = deliveryBaseCost + deliveryIncreaseCost + (!isImbue || imbueUpfront ? damageCost + fxCost : 0);
    const upfrontReduction = Math.min(upfrontRaw, spellReduce);
    // Focus Mana on Cast (Ward: 1 per Target) — counted on the resolved Targets at Cast time
    // (state.focusTargetCount), else the dialog's estimate. Charged only if the Cast Focuses.
    const focusTargets = Number.isFinite(state.focusTargetCount)
      ? state.focusTargetCount
      : (FocusUpkeep.rule(spell)?.perTarget ? FocusUpkeep.estimateTargets(actor, spell, state) : 1);
    const focusCost = FocusUpkeep.castCost(spell, state, focusTargets);
    const totalCost = upfrontRaw - upfrontReduction + focusCost;

    // Deferred (non-upfront) mode has no fixed deferredMana figure — the caster
    // chooses Damage dice + Effect live at delivery time (see imbue-helper.mjs
    // deliverImbue), so there is nothing to pre-compute or pre-charge here.
    let deferredMana = 0;
    if (isImbue && imbueUpfront) {
      deferredMana = IMBUE_TRIGGER_FEE;
    }

    return { damageCost, fxCost, deliveryBaseCost, deliveryIncreaseCost, focusCost, focusTargets, totalCost, deferredMana };
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
    // Focus is committed by the Cast itself (SpellHandler._executeCast): only once it succeeds
    SpellPlacement.cancel();
    // Clear preview before cast (sequencer takes over)
    if (state.previewActive) {
      await globalThis.vagabond?.managers?.templates?.clearPreview(this.#actor.id, this.#spell.id);
      this.#state.previewActive = false;
    }
    // Hand off to handler
    let imbueAssignments = null;
    if (state.deliveryType === 'imbue') {
      imbueAssignments = this._imbueCandidates().filter(c => c.selected).map(c => c.uuid);
    }
    const targetPicks = SpellTargetPicker.result(this.#actor, this.#spell, state);
    if (typeof this.#onCast === 'function') {
      await this.#onCast(event, {
        damageDice: state.damageDice,
        deliveryType: state.deliveryType,
        deliveryIncrease: state.deliveryIncrease,
        useFx: state.useFx,
        focusOn: state.focusOn,
        imbueAssignments,
        targetPicks,
        areaAnchor: SpellPlacement.modeFor(state.deliveryType) === 'area' ? state.areaAnchor : null,
        targetSpaces: SpellPlacement.modeFor(state.deliveryType) === 'spaces' ? state.targetSpaces.map(p => ({ x: p.x, y: p.y })) : [],
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
    this.#state.imbueAssignments = {};
    this.#state.targetPicks = {};
    // The aim point carries over between Cube and Sphere; spaces belong to Remote only
    const mode = SpellPlacement.modeFor(key);
    if (mode !== 'area') this.#state.areaAnchor = null;
    if (mode !== 'spaces') this.#state.targetSpaces = [];
    SpellPlacement.cancel();
    this._syncTargetIncrease();
    this._emitChange();
    this.render();
    this._refreshPreview();
    this._autoTargetArea();
  }

  /** @this {SpellCastDialog} */
  static async _onPickImbueWeapon(event, target) {
    const weaponUuid = target.dataset.weaponUuid;
    if (!weaponUuid) return;
    if (this.#state.imbueAssignments[weaponUuid]) delete this.#state.imbueAssignments[weaponUuid];
    else this.#state.imbueAssignments[weaponUuid] = true;
    // Re-derive before emitting so listeners see the fresh target count/cost
    // (render would recompute it anyway, but _emitChange fires first).
    this.#state.deliveryIncrease = Math.max(0, this._imbueCandidates().filter(c => c.selected).length - 1);
    this._emitChange();
    this.render();
  }

  /** @this {SpellCastDialog} */
  static async _onPickTarget(event, target) {
    const key = target.dataset.pickKey;
    if (!key) return;
    this.#state.targetPicks = SpellTargetPicker.toggle(this.#actor, this.#spell, this.#state, key);
    this._syncTargetIncrease();
    this._emitChange();
    this.render();
  }

  /**
   * Crosshair: Cube / Sphere → aim the area on the map (a token = aim at it, the area follows it), then the tokens
   * inside become the targets and the preview turns on. Remote → add / remove spaces and (un)target tokens until
   * right-click / Esc / Enter. Right-click on the button clears (_clearPlacement).
   * @this {SpellCastDialog}
   */
  static async _onPlace(event, target) {
    const state = this.#state;
    const mode = SpellPlacement.modeFor(state.deliveryType);
    if (!mode) return;
    if (mode === 'area') {
      const anchor = await SpellPlacement.pickArea({ actor: this.#actor, type: state.deliveryType, distance: this._areaDistance() });
      if (!anchor || !this.rendered) return;
      state.areaAnchor = anchor;
      state.previewActive = true;
      this._emitChange();
      await this._refreshPreview();
      this._autoTargetArea();
      this.render();
      return;
    }
    await SpellPlacement.pickSpaces({
      actor: this.#actor,
      spaces: state.targetSpaces,
      onChange: (spaces) => {
        if (!this.rendered) return;
        state.targetSpaces = spaces;
        this._syncTargetIncrease();
        this._emitChange();
        this.render();
      },
    });
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
    this.#focusTouched = true;
    this.#state.focusOn = !this.#state.focusOn;
    this.render();
  }

  /** @this {SpellCastDialog} */
  static async _onToggleFx(event, target) {
    if (this.#state.deliveryType === 'imbue' && !game.settings.get('vagabond', 'imbueUpfrontMana')) return;
    if (this.#spell.system.damageType === '-') return; // Effect-only Spell: FX locked on
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
