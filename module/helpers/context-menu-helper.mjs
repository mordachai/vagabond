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

      // Disabled state
      if (itemConfig.enabled === false) {
        item.classList.add('disabled');
      }

      // Build item content
      const iconHtml = itemConfig.icon ? `<i class="${itemConfig.icon}"></i>` : '';
      const labelHtml = `<span>${itemConfig.label}</span>`;
      item.innerHTML = `${iconHtml}${labelHtml}`;

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
