const { api } = foundry.applications;
import { ContextMenuHelper } from '../helpers/context-menu-helper.mjs';

/**
 * Floating compact party overview — frameless, draggable.
 * Open via PartyCompactView.open(actor). One singleton per party actor.
 * Right-click anywhere → context menu (open sheet / remove viewer).
 * Right-click HP icon → +1 HP. Left-click HP icon → -1 HP.
 * Left-click Fatigue → +1. Right-click Fatigue → -1.
 */
export class PartyCompactView extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  #actor;
  #hookIds = [];
  #listenerController = null;
  /** Persists across re-renders so the window doesn't jump on refresh. */
  #pos = { left: 120, top: 80 };

  constructor(actor, options = {}) {
    super(options);
    this.#actor = actor;
  }

  // ── Singleton ───────────────────────────────────────────────────────────────

  static #instances = new Map();

  static open(actor) {
    if (!game.user.isGM) return null;
    if (!PartyCompactView.#instances.has(actor.id)) {
      PartyCompactView.#instances.set(actor.id, new PartyCompactView(actor));
    }
    const view = PartyCompactView.#instances.get(actor.id);
    view.render({ force: true });
    return view;
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  static DEFAULT_OPTIONS = {
    id: 'party-compact-view-{id}',
    classes: ['vagabond', 'party-compact-view'],
    window: { frame: false },
    actions: {},
  };

  static PARTS = {
    view: { template: 'systems/vagabond/templates/party/party-compact-view.hbs' },
  };

  // ── Context ─────────────────────────────────────────────────────────────────

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.members = await this._resolveMembers();
    return context;
  }

  async _resolveMembers() {
    const uuids = this.#actor.system.members ?? [];
    return (await Promise.all(uuids.map(u => this._resolveMember(u)))).filter(Boolean);
  }

  async _resolveMember(uuid) {
    let actor;
    try { actor = await fromUuid(uuid); } catch { return null; }
    if (!actor) return null;
    const sys = actor.system;
    return {
      uuid: actor.uuid,
      name: actor.name,
      img: actor.img,
      level: sys.attributes?.level?.value ?? 1,
      armor: sys.armor ?? 0,
      hp: { value: sys.health?.value ?? 0, max: sys.health?.max ?? 1 },
      fatigue: sys.fatigue ?? 0,
      fatigueMax: sys.fatigueMax ?? 5,
      mana: {
        current: sys.mana?.current ?? 0,
        max: sys.mana?.max ?? 0,
        isSpellcaster: sys.attributes?.isSpellcaster ?? false,
      },
      speed: sys.speed?.base ?? 6,
      luck: sys.currentLuck ?? 0,
      saves: {
        reflex: { difficulty: sys.saves?.reflex?.difficulty ?? 20, label: sys.saves?.reflex?.label ?? game.i18n.localize('VAGABOND.Saves.Reflex.name') },
        endure: { difficulty: sys.saves?.endure?.difficulty ?? 20, label: sys.saves?.endure?.label ?? game.i18n.localize('VAGABOND.Saves.Endure.name') },
        will:   { difficulty: sys.saves?.will?.difficulty   ?? 20, label: sys.saves?.will?.label   ?? game.i18n.localize('VAGABOND.Saves.Will.name')   },
      },
    };
  }

  // ── Position ────────────────────────────────────────────────────────────────

  /** Override ApplicationV2's setPosition to always enforce our tracked #pos. */
  setPosition(pos = {}) {
    const el = this.element;
    if (!el) return this.#pos;
    el.style.position = 'fixed';
    el.style.left     = `${this.#pos.left}px`;
    el.style.top      = `${this.#pos.top}px`;
    el.style.width    = 'auto';
    el.style.height   = 'auto';
    return this.#pos;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  _onRender(context, options) {
    this.setPosition();

    // Rebuild all element-level listeners on every render.
    this.#listenerController?.abort();
    this.#listenerController = new AbortController();
    const { signal } = this.#listenerController;

    this._makeDraggable(signal);
    this._bindStatClicks(signal);
    this._bindContextMenu(signal);
    this._bindActorHooks();
  }

  async close(options = {}) {
    PartyCompactView.#instances.delete(this.#actor.id);
    this._clearHooks();
    this.#listenerController?.abort();
    this.#listenerController = null;
    ContextMenuHelper.closeAll();
    return super.close(options);
  }

  // ── Drag ───────────────────────────────────────────────────────────────────

  _makeDraggable(signal) {
    const el = this.element;
    let startX, startY, startLeft, startTop;

    const onMouseMove = (e) => {
      this.#pos.left = startLeft + (e.clientX - startX);
      this.#pos.top  = startTop  + (e.clientY - startY);
      this.setPosition();
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
    };

    el.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;                                // left-button only
      if (e.target.closest('.compact-hp, .compact-fatigue')) return; // let stat clicks through
      const rect = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup',   onMouseUp);
    }, { signal });
  }

  // ── Stat interactions ───────────────────────────────────────────────────────

  _bindStatClicks(signal) {
    // HP: left = −1, right = +1
    for (const el of this.element.querySelectorAll('.compact-hp')) {
      const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
      el.addEventListener('click',       ()  => this._changeHp(uuid, -1),                         { signal });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this._changeHp(uuid, +1); }, { signal });
    }
    // Fatigue: left = +1, right = −1
    for (const el of this.element.querySelectorAll('.compact-fatigue')) {
      const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
      el.addEventListener('click',       ()  => this._changeFatigue(uuid, +1),                         { signal });
      el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); this._changeFatigue(uuid, -1); }, { signal });
    }
  }

  async _changeHp(uuid, delta) {
    const actor = await fromUuid(uuid);
    if (!actor) return;
    const val = Math.clamp(actor.system.health.value + delta, 0, actor.system.health.max);
    actor.update({ 'system.health.value': val });
  }

  async _changeFatigue(uuid, delta) {
    const actor = await fromUuid(uuid);
    if (!actor) return;
    const val = Math.clamp((actor.system.fatigue ?? 0) + delta, 0, actor.system.fatigueMax ?? 5);
    actor.update({ 'system.fatigue': val });
  }

  // ── Context menu ────────────────────────────────────────────────────────────

  _bindContextMenu(signal) {
    // Listen on the inner content wrapper so Foundry's root-element handling
    // doesn't interfere. Mirrors how actor-sheet.mjs registers contextmenu.
    const inner = this.element.querySelector('.compact-members') ?? this.element;
    inner.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      ContextMenuHelper.create({
        position: { x: e.clientX, y: e.clientY },
        className: 'party-compact-context-menu',
        items: [
          {
            label: game.i18n.localize('VAGABOND.Actor.Party.CompactView.OpenSheet'),
            icon: 'fas fa-users',
            action: () => this.#actor.sheet.render(true),
          },
          {
            label: game.i18n.localize('VAGABOND.Actor.Party.CompactView.Remove'),
            icon: 'fas fa-xmark',
            action: () => this.close(),
          },
        ],
      });
    }, { signal });
  }

  // ── Hooks ───────────────────────────────────────────────────────────────────

  _bindActorHooks() {
    this._clearHooks();
    this.#hookIds.push(Hooks.on('updateActor', () => this.render()));
  }

  _clearHooks() {
    this.#hookIds.forEach(id => Hooks.off('updateActor', id));
    this.#hookIds = [];
  }
}
