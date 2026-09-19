/**
 * Helper utilities for creating and managing context menus.
 * Eliminates 4+ duplicate context menu implementations.
 */
export class ContextMenuHelper {
  /**
   * Create and display a context menu
   * @param {Object} options - Menu configuration
   * @param {Object} options.position - { x, y } screen coordinates
   * @param {Array} options.items - Menu items: [{ label, icon, action, enabled, divider }]
   * @param {Function} options.onClose - Cleanup callback
   * @param {string} [options.className] - Additional CSS class for the menu
   * @returns {HTMLElement} The created menu element
   */
  static create(options) {
    const { position, items, onClose, className } = options;

    // Create menu element
    const menu = document.createElement('div');
    menu.classList.add('vagabond-context-menu');
    if (className) {
      menu.classList.add(className);
    }

    // Position the menu
    menu.style.left = `${position.x}px`;
    menu.style.top = `${position.y}px`;
    menu.style.position = 'fixed';
    menu.style.zIndex = '10000';

    // Build menu items
    items.forEach(itemConfig => {
      // Divider
      if (itemConfig.divider) {
        const divider = document.createElement('hr');
        divider.classList.add('context-menu-divider');
        menu.appendChild(divider);
        return;
      }

      // Menu item
      const item = document.createElement('div');
      item.classList.add('context-menu-item');

      // Section header: non-interactive label row (`header: true`)
      if (itemConfig.header) {
        item.classList.add('context-menu-header');
        item.innerHTML = `${itemConfig.icon ? `<i class="${itemConfig.icon}"></i>` : ''}<span>${itemConfig.label}</span>`;
        menu.appendChild(item);
        return;
      }

      // Disabled state
      if (itemConfig.enabled === false) {
        item.classList.add('disabled');
      }
      // Opt-in greyed-out look for entries that are unavailable (`dim: true`)
      if (itemConfig.dim) {
        item.classList.add('is-dim');
      }

      // Build item content — supports FA class string (`icon`) or image URL (`img`)
      const iconHtml = itemConfig.img
        ? `<img src="${itemConfig.img}" width="16" height="16" style="object-fit:contain;border:none;flex-shrink:0;">`
        : itemConfig.icon ? `<i class="${itemConfig.icon}"></i>` : '';
      const labelHtml = `<span>${itemConfig.label}</span>`;
      item.innerHTML = `${iconHtml}${labelHtml}`;

      // Stepper row: "Label  − N +". Buttons adjust in place and keep the menu open.
      if (itemConfig.stepper) {
        const { value, onChange } = itemConfig.stepper;
        item.classList.add('context-menu-stepper-row');
        const stepper = document.createElement('span');
        stepper.classList.add('context-menu-stepper');
        stepper.innerHTML = `<button type="button" data-delta="-1"><i class="fas fa-minus"></i></button>`
          + `<span class="context-menu-stepper-value">${value}</span>`
          + `<button type="button" data-delta="1"><i class="fas fa-plus"></i></button>`;
        const valueEl = stepper.querySelector('.context-menu-stepper-value');
        stepper.querySelectorAll('button').forEach(btn => btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            const next = await onChange(Number(btn.dataset.delta));
            if (next !== undefined) valueEl.textContent = next;
          } catch (error) {
            console.error('Context menu stepper error:', error);
          }
        }));
        item.appendChild(stepper);
        menu.appendChild(item);
        return;
      }

      // Switch row: "Label  (o )". Clicking anywhere on the row flips it in place and keeps the
      // menu open; `onChange(next)` may resolve to the confirmed state (omit to trust `next`).
      if (itemConfig.toggle) {
        const { value, disabled, onChange } = itemConfig.toggle;
        item.classList.add('context-menu-toggle-row');
        const sw = document.createElement('span');
        sw.classList.add('context-menu-switch');
        sw.setAttribute('role', 'switch');
        const setState = (on) => {
          sw.classList.toggle('is-on', on);
          sw.setAttribute('aria-checked', String(on));
        };
        setState(!!value);
        item.appendChild(sw);

        if (disabled) {
          item.classList.add('is-dim');
        } else {
          item.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (item.classList.contains('is-busy')) return;
            item.classList.add('is-busy');
            try {
              const next = !sw.classList.contains('is-on');
              const confirmed = await onChange(next);
              setState(confirmed ?? next);
            } catch (error) {
              console.error('Context menu toggle error:', error);
            } finally {
              item.classList.remove('is-busy');
            }
          });
        }
        menu.appendChild(item);
        return;
      }

      // Add click handler (only if enabled)
      if (itemConfig.enabled !== false && itemConfig.action) {
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();

          try {
            await itemConfig.action();
          } catch (error) {
            console.error('Context menu action error:', error);
          }

          this.close(menu, onClose);
        });

        // Add hover effect
        item.addEventListener('mouseenter', () => {
          item.classList.add('hover');
        });
        item.addEventListener('mouseleave', () => {
          item.classList.remove('hover');
        });
      }

      menu.appendChild(item);
    });

    // Attach to body
    document.body.appendChild(menu);

    // Adjust position if menu goes off-screen
    this._adjustMenuPosition(menu);

    // Close on outside click (with small delay to avoid immediate closure)
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!menu.contains(e.target)) {
          this.close(menu, onClose);
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 10);

    // Close on Escape key
    const escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.close(menu, onClose);
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    return menu;
  }

  /**
   * Adjust menu position to keep it within viewport bounds
   * @param {HTMLElement} menu - The menu element
   * @private
   */
  static _adjustMenuPosition(menu) {
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position
    if (rect.right > viewportWidth) {
      menu.style.left = `${viewportWidth - rect.width - 10}px`;
    }
    if (rect.left < 0) {
      menu.style.left = '10px';
    }

    // Adjust vertical position
    if (rect.bottom > viewportHeight) {
      menu.style.top = `${viewportHeight - rect.height - 10}px`;
    }
    if (rect.top < 0) {
      menu.style.top = '10px';
    }
  }

  /**
   * Close and remove a context menu
   * @param {HTMLElement} menu - The menu element to close
   * @param {Function} [onClose] - Optional cleanup callback
   */
  static close(menu, onClose) {
    if (menu && menu.parentNode) {
      menu.remove();
    }

    if (onClose && typeof onClose === 'function') {
      try {
        onClose();
      } catch (error) {
        console.error('Context menu onClose error:', error);
      }
    }
  }

  /**
   * Close all open context menus
   */
  static closeAll() {
    const menus = document.querySelectorAll('.vagabond-context-menu');
    menus.forEach(menu => {
      menu.remove();
    });
  }

  /**
   * Create a simple confirm dialog context menu
   * @param {Object} options - Configuration
   * @param {Object} options.position - { x, y } screen coordinates
   * @param {string} options.message - Confirmation message
   * @param {Function} options.onConfirm - Action to execute on confirmation
   * @param {Function} [options.onCancel] - Optional action on cancel
   * @returns {HTMLElement} The created menu element
   */
  static createConfirm(options) {
    const { position, message, onConfirm, onCancel } = options;

    return this.create({
      position,
      items: [
        {
          label: message,
          enabled: false,
        },
        { divider: true },
        {
          label: 'Confirm',
          icon: 'fas fa-check',
          enabled: true,
          action: onConfirm,
        },
        {
          label: 'Cancel',
          icon: 'fas fa-times',
          enabled: true,
          action: onCancel || (() => {}),
        },
      ],
    });
  }
}
