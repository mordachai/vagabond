import { ContextMenuHelper } from './context-menu-helper.mjs';

/**
 * Shared helper for applying/removing status effects from the party sheet
 * and compact party view portraits. Respects NPC status immunities.
 *
 * Main menu uses ContextMenuHelper. "Apply Status" item opens a hover submenu
 * with a 3-column grid of all available statuses.
 */
export class PartyStatusHelper {

  /** Currently open submenu element, kept as class state to allow cleanup. */
  static #submenu = null;

  /**
   * Show the status context menu for an actor (GM only).
   * @param {Actor} actor
   * @param {number} x  Screen X
   * @param {number} y  Screen Y
   */
  static async showStatusMenu(actor, x, y) {
    if (!game.user.isGM) return;

    ContextMenuHelper.closeAll();
    this.#closeSubmenu();

    const activeIds = new Set(
      actor.effects.filter(e => !e.disabled).flatMap(e => [...(e.statuses ?? [])])
    );

    const items = [
      { label: actor.name, enabled: false },
      {
        label: `${game.i18n.localize('VAGABOND.Actor.Party.Card.AssignStatusEffects')} ▶`,
        img: 'icons/svg/aura.svg',
        // action is handled via mouseenter below — we override after creation
      },
      {
        label: game.i18n.localize('VAGABOND.Actor.Party.Card.RemoveAllStatuses'),
        icon: 'fas fa-trash',
        enabled: activeIds.size > 0,
        action: () => this._removeAll(actor),
      },
    ];

    const menu = ContextMenuHelper.create({
      position: { x, y },
      items,
      className: 'party-status-context-menu',
      onClose: () => this.#closeSubmenu(),
    });

    // Wire the "Apply Status" item to open the submenu on hover
    const applyItem = [...menu.querySelectorAll('.context-menu-item')]
      .find(el => el.textContent.includes(game.i18n.localize('VAGABOND.Actor.Party.Card.AssignStatusEffects')));

    if (applyItem) {
      // Prevent ContextMenuHelper from closing the menu when this item is clicked
      applyItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._openSubmenu(actor, applyItem, menu);
      });

      applyItem.addEventListener('mouseenter', () => {
        this._openSubmenu(actor, applyItem, menu);
      });

      applyItem.addEventListener('mouseleave', (e) => {
        // Keep submenu open if mouse is moving toward it
        setTimeout(() => {
          if (this.#submenu && !this.#submenu.matches(':hover') && !applyItem.matches(':hover')) {
            this.#closeSubmenu();
          }
        }, 80);
      });
    }

    // Close submenu when hovering other items
    for (const item of menu.querySelectorAll('.context-menu-item')) {
      if (item === applyItem) continue;
      item.addEventListener('mouseenter', () => this.#closeSubmenu());
    }
  }

  // ── Submenu ─────────────────────────────────────────────────────────────────

  static _openSubmenu(actor, parentItem, mainMenu) {
    this.#closeSubmenu();

    const defs = CONFIG.statusEffects ?? [];
    const activeIds = new Set(
      actor.effects.filter(e => !e.disabled).flatMap(e => [...(e.statuses ?? [])])
    );
    const immuneIds = new Set(actor.system.statusImmunities ?? []);

    const submenu = document.createElement('div');
    submenu.className = 'vagabond-context-menu party-status-submenu';

    for (const def of defs) {
      const isActive = activeIds.has(def.id);
      const isImmune = immuneIds.has(def.id);
      const label    = game.i18n.localize(def.name ?? def.label ?? def.id);

      const item = document.createElement('div');
      item.className = 'context-menu-item';
      if (isActive) item.classList.add('status-active');
      if (isImmune) item.classList.add('status-immune');

      const imgSrc = def.img ?? 'icons/svg/aura.svg';
      item.innerHTML = `<img class="status-icon" src="${imgSrc}" alt="${label}" width="16" height="16"><span>${label}</span>`;

      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.#closeSubmenu();
        ContextMenuHelper.closeAll();
        await this._handleToggle(actor, def, isActive, isImmune);
      });

      submenu.appendChild(item);
    }

    // Position: right of the parent item
    const rect = parentItem.getBoundingClientRect();
    submenu.style.position = 'fixed';
    submenu.style.zIndex   = '10001';
    submenu.style.left     = `${rect.right + 4}px`;
    submenu.style.top      = `${rect.top}px`;

    document.body.appendChild(submenu);
    this.#submenu = submenu;

    // Clamp to viewport
    const sr = submenu.getBoundingClientRect();
    if (sr.right > window.innerWidth)  submenu.style.left = `${rect.left - sr.width - 4}px`;
    if (sr.bottom > window.innerHeight) submenu.style.top = `${window.innerHeight - sr.height - 10}px`;

    // Close when leaving both the submenu and the parent item
    submenu.addEventListener('mouseleave', () => {
      setTimeout(() => {
        if (!parentItem.matches(':hover')) this.#closeSubmenu();
      }, 80);
    });
  }

  /** Close all open status menus. Call from sheet _onRender() and close(). */
  static closeAll() {
    ContextMenuHelper.closeAll();
    this.#closeSubmenu();
  }

  static #closeSubmenu() {
    this.#submenu?.remove();
    this.#submenu = null;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  static async _handleToggle(actor, def, isActive, isImmune) {
    if (isImmune) {
      const label = game.i18n.localize(def.name ?? def.label ?? def.id);
      await ChatMessage.create({
        content: this._immunityHtml(actor, def, label),
        speaker: ChatMessage.getSpeaker({ actor }),
      });
      return;
    }
    await actor.toggleStatusEffect(def.id, { active: !isActive });
  }

  static _immunityHtml(actor, def, label) {
    const img = def.img ?? 'icons/svg/aura.svg';
    return `<div class="vagabond chat-card">
  <header class="card-header flexrow">
    <img src="${img}" width="36" height="36" alt="${label}" style="border:none;object-fit:contain;">
    <h3>${actor.name}</h3>
  </header>
  <div class="card-content">
    <p>${game.i18n.format('VAGABOND.Status.Immune', { actor: `<strong>${actor.name}</strong>`, status: `<strong>${label}</strong>` })}</p>
  </div>
</div>`;
  }

  static async _removeAll(actor) {
    const toRemove = actor.effects.filter(e => e.statuses?.size > 0 && !e.disabled);
    for (const effect of toRemove) await effect.delete();
  }
}
