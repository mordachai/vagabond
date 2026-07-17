/**
 * Screen-corner panel that displays the selected token's status conditions.
 *
 * Used when the world setting `tokenStatusDisplay` is `left` or `right` (native
 * PIXI token icons are hidden in those modes — see `_applyTokenEffectVisibility`
 * in vagabond.mjs). Only the 20 system status conditions defined in
 * `CONFIG.statusEffects` are shown — item/aura effects are ignored.
 *
 * Fixed HTML overlay appended to <body>; not anchored to the canvas. Reflects
 * `canvas.tokens.controlled[0]` only (empty when nothing selected).
 */
export class TokenStatusPanel {
  /** @type {TokenStatusPanel|null} */
  static instance = null;

  constructor() {
    this.container = null;
    this._hooksRegistered = false;
    this._fadeTimer = null;
    this._refresh = foundry.utils.debounce(() => this.refresh(), 50);
  }

  /** Idle delay (ms) before icons fade out. */
  static FADE_DELAY = 10000;

  /** Current display mode from settings: 'none' | 'tokens' | 'left' | 'right'. */
  static get mode() {
    return game.settings.get('vagabond', 'tokenStatusDisplay');
  }

  /**
   * Create the overlay element and wire reactive hooks (idempotent).
   */
  initialize() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'vagabond-token-status-panel';
      document.body.appendChild(this.container);

      // Reveal on hover, re-arm the idle fade on leave. Events bubble up from the
      // pointer-events:auto icons even though the container itself is none.
      this.container.addEventListener('mouseover', () => {
        clearTimeout(this._fadeTimer);
        this.container.classList.remove('faded');
      });
      this.container.addEventListener('mouseout', () => this._scheduleFade());
    }

    if (!this._hooksRegistered) {
      Hooks.on('controlToken', this._refresh);
      Hooks.on('canvasReady', this._refresh);
      Hooks.on('createActiveEffect', this._onEffectChange.bind(this));
      Hooks.on('updateActiveEffect', this._onEffectChange.bind(this));
      Hooks.on('deleteActiveEffect', this._onEffectChange.bind(this));
      Hooks.on('updateActor', this._onActorChange.bind(this));
      // Reposition the right column when the sidebar expands/collapses or the
      // window resizes (the sidebar's left edge is the panel's right anchor).
      // A ResizeObserver fires continuously while the sidebar width animates, so
      // the column slides with it instead of snapping.
      window.addEventListener('resize', this._refresh);
      this._sidebarObserver = new ResizeObserver(() => {
        if (TokenStatusPanel.mode === 'right') this._positionForSidebar('right');
      });
      for (const id of ['sidebar', 'sidebar-content', 'ui-right']) {
        const el = document.getElementById(id);
        if (el) this._sidebarObserver.observe(el);
      }
      this._hooksRegistered = true;
    }

    this.refresh();
  }

  /**
   * Actor whose statuses the panel shows.
   * - GM: the selected token's actor (selection-driven, as before).
   * - Player: their assigned character, always — so owners always see what's
   *   affecting them — falling back to the selected token if unassigned.
   * @returns {Actor|null}
   */
  _getSourceActor() {
    const controlled = canvas?.tokens?.controlled?.[0]?.actor ?? null;
    if (game.user?.isGM) return controlled;
    return game.user?.character ?? controlled;
  }

  /** Re-render only when the changed effect belongs to the source actor. */
  _onEffectChange(effect) {
    const actor = this._getSourceActor();
    if (actor && effect?.parent === actor) this._refresh();
  }

  /** Re-render only when the source actor updates. */
  _onActorChange(actor) {
    if (actor === this._getSourceActor()) this._refresh();
  }

  /**
   * Collect the source actor's active status conditions.
   * Mirrors actor-sheet `_prepareStatusEffects` — only CONFIG.statusEffects ids.
   * @returns {{name: string, icon: string}[]}
   */
  _getStatuses() {
    const actor = this._getSourceActor();
    if (!actor) return [];

    const validIds = new Set((CONFIG.statusEffects ?? []).map(s => s.id));
    const out = [];
    for (const effect of actor.effects) {
      if (effect.disabled) continue;
      const hasStatus = Array.from(effect.statuses ?? []).some(id => validIds.has(id));
      if (!hasStatus) continue;
      out.push({
        name: effect.name || effect.label || 'Unknown',
        icon: effect.img || 'icons/svg/aura.svg'
      });
    }
    return out;
  }

  /**
   * Rebuild the panel for the current mode + selection.
   */
  refresh() {
    if (!this.container) return;

    const mode = TokenStatusPanel.mode;
    this.container.classList.remove('left', 'right');

    if (mode !== 'left' && mode !== 'right') {
      clearTimeout(this._fadeTimer);
      this.container.classList.remove('faded');
      this.container.style.display = 'none';
      this.container.replaceChildren();
      return;
    }

    this.container.classList.add(mode);
    this._positionForSidebar(mode);
    const statuses = this._getStatuses();

    if (!statuses.length) {
      clearTimeout(this._fadeTimer);
      this.container.classList.remove('faded');
      this.container.style.display = 'none';
      this.container.replaceChildren();
      return;
    }

    this.container.style.display = 'flex';
    const frag = document.createDocumentFragment();
    for (const s of statuses) {
      const img = document.createElement('img');
      img.className = 'vtsp-icon';
      img.src = s.icon;
      img.alt = s.name;
      img.title = s.name;
      frag.appendChild(img);
    }
    this.container.replaceChildren(frag);

    // Setup context menus for status icons
    this._setupStatusIconListeners();

    // Show now, fade out after the idle delay.
    this.container.classList.remove('faded');
    this._scheduleFade();
  }

  /**
   * Arm the idle timer that fades the icons out (left/right modes only).
   */
  _scheduleFade() {
    clearTimeout(this._fadeTimer);
    const mode = TokenStatusPanel.mode;
    if (mode !== 'left' && mode !== 'right') return;
    this._fadeTimer = setTimeout(() => this.container?.classList.add('faded'), TokenStatusPanel.FADE_DELAY);
  }

  /**
   * Anchor the right column just left of the sidebar's left edge so it sits
   * outside the sidebar regardless of its expanded/collapsed width. Left mode
   * uses the CSS `left` anchor untouched.
   * @param {string} mode
   */
  _positionForSidebar(mode) {
    if (mode !== 'right') {
      this.container.style.right = '';
      return;
    }
    const gap = 8;
    // Anchor to the actual visible sidebar panel's left edge.
    const sidebar = document.getElementById('sidebar') || document.getElementById('ui-right');
    const rect = sidebar?.getBoundingClientRect();
    const offset = rect && rect.width > 0 ? Math.max(gap, window.innerWidth - rect.left + gap) : gap;
    this.container.style.right = `${offset}px`;
  }

  /**
   * Setup status icon context menu listeners
   * @private
   */
  _setupStatusIconListeners() {
    if (!this.container) return;

    const icons = this.container.querySelectorAll('.vtsp-icon');
    const actor = this._getSourceActor();
    if (!actor) return;

    icons.forEach(icon => {
      icon.addEventListener('contextmenu', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        // Match icon to effect by title
        const statusName = icon.title;
        const effect = Array.from(actor.effects).find(e => (e.name || e.label) === statusName);
        if (!effect) return;

        const { ContextMenuHelper } = globalThis.vagabond.utils;
        const { VagabondChatCard } = globalThis.vagabond.utils;

        const menuItems = [
          {
            label: game.i18n.localize('VAGABOND.ContextMenu.SendToChat'),
            icon: 'fas fa-comment',
            enabled: true,
            action: async () => {
              await VagabondChatCard.statusEffect(actor, effect);
            }
          },
          {
            label: game.i18n.localize('VAGABOND.ContextMenu.RemoveStatus'),
            icon: 'fas fa-times',
            enabled: true,
            action: async () => {
              await effect.delete();
            }
          }
        ];

        ContextMenuHelper.create({
          position: { x: event.clientX, y: event.clientY },
          items: menuItems,
          onClose: () => {},
          className: 'status-context-menu'
        });
      });
    });
  }
}
