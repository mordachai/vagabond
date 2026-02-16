/**
 * Helper utilities for managing accordion UI components.
 * Provides unified accordion state management across the system.
 */
export class AccordionHelper {
  /**
   * Open an accordion
   * @param {HTMLElement} accordion - The accordion element
   */
  static open(accordion) {
    if (!accordion) return;

    const content = accordion.querySelector('.accordion-content');
    const icon = accordion.querySelector('.accordion-icon');
    const header = accordion.querySelector('.accordion-header');

    // Remove 'collapsed' and add 'expanded'
    accordion.classList.remove('collapsed');
    accordion.classList.add('expanded');

    if (content) {
      content.classList.add('open');
      content.classList.remove('collapsed');
    }
    if (icon) {
      icon.classList.add('open');
    }

    // Set aria-expanded on the header for accessibility
    if (header) {
      header.setAttribute('aria-expanded', 'true');
    }
  }

  /**
   * Close an accordion
   * @param {HTMLElement} accordion - The accordion element
   */
  static close(accordion) {
    if (!accordion) return;

    const content = accordion.querySelector('.accordion-content');
    const icon = accordion.querySelector('.accordion-icon');
    const header = accordion.querySelector('.accordion-header');

    // Add 'collapsed' and remove 'expanded'
    accordion.classList.add('collapsed');
    accordion.classList.remove('expanded');

    if (content) {
      content.classList.remove('open');
      content.classList.add('collapsed');
    }
    if (icon) {
      icon.classList.remove('open');
    }

    // Set aria-expanded on the header for accessibility
    if (header) {
      header.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * Toggle an accordion open/closed
   * @param {HTMLElement} accordion - The accordion element
   * @returns {boolean} True if now open, false if now closed
   */
  static toggle(accordion) {
    if (!accordion) return false;

    if (this.isOpen(accordion)) {
      this.close(accordion);
      return false;
    } else {
      this.open(accordion);
      return true;
    }
  }

  /**
   * Check if an accordion is open
   * @param {HTMLElement} accordion - The accordion element
   * @returns {boolean} True if the accordion is open
   */
  static isOpen(accordion) {
    if (!accordion) return false;

    // Check content state first as the source of truth
    const content = accordion.querySelector('.accordion-content');
    if (content) {
      return content.classList.contains('open') && !content.classList.contains('collapsed');
    }

    // Fallback: check wrapper classes
    return accordion.classList.contains('expanded') && !accordion.classList.contains('collapsed');
  }

  /**
   * Close all accordions in a container
   * @param {HTMLElement} container - The container element
   * @param {string} [selector='.accordion-item'] - CSS selector for accordions
   */
  static closeAll(container, selector = '.accordion-item') {
    if (!container) return;

    const accordions = container.querySelectorAll(selector);
    accordions.forEach(acc => this.close(acc));
  }

  /**
   * Open all accordions in a container
   * @param {HTMLElement} container - The container element
   * @param {string} [selector='.accordion-item'] - CSS selector for accordions
   */
  static openAll(container, selector = '.accordion-item') {
    if (!container) return;

    const accordions = container.querySelectorAll(selector);
    accordions.forEach(acc => this.open(acc));
  }

  /**
   * Get all open accordion IDs in a container
   * @param {HTMLElement} container - The container element
   * @param {string} [selector='.accordion-item'] - CSS selector for accordions
   * @returns {string[]} Array of accordion IDs that are open
   */
  static getOpenIds(container, selector = '.accordion-item') {
    if (!container) return [];

    const accordions = container.querySelectorAll(selector);
    const openIds = [];

    accordions.forEach(acc => {
      if (this.isOpen(acc) && acc.dataset.accordionId) {
        openIds.push(acc.dataset.accordionId);
      }
    });

    return openIds;
  }

  /**
   * Restore accordion states from a list of IDs
   * @param {HTMLElement} container - The container element
   * @param {string[]} openIds - Array of accordion IDs to open
   * @param {string} [selector='.accordion-item'] - CSS selector for accordions
   * @param {Object} [options] - Additional options
   * @param {boolean} [options.forceClose=true] - Whether to force close accordions not in the openIds list
   */
  static restoreState(container, openIds, selector = '.accordion-item', { forceClose = true } = {}) {
    if (!container || !openIds) return;

    const accordions = container.querySelectorAll(selector);

    accordions.forEach(acc => {
      const accordionId = acc.dataset.accordionId;
      if (accordionId && openIds.includes(accordionId)) {
        this.open(acc);
      } else if (forceClose) {
        this.close(acc);
      }
    });
  }

  /**
   * Create an accordion state manager for a specific container
   * Useful for persisting accordion states across re-renders
   * @param {HTMLElement} container - The container element
   * @param {string} [selector='.accordion-item'] - CSS selector for accordions
   * @returns {Object} State manager with capture() and restore() methods
   */
  static createStateManager(container, selector = '.accordion-item') {
    let savedState = [];

    return {
      /**
       * Capture current accordion states
       * @returns {string[]} Array of open accordion IDs
       */
      capture() {
        savedState = AccordionHelper.getOpenIds(container, selector);
        return savedState;
      },

      /**
       * Restore previously captured states
       * @param {Object} [options] - Options passed to restoreState
       */
      restore(options) {
        AccordionHelper.restoreState(container, savedState, selector, options);
      },

      /**
       * Get the saved state
       * @returns {string[]} Array of open accordion IDs
       */
      getState() {
        return [...savedState];
      },

      /**
       * Set the state to restore
       * @param {string[]} state - Array of accordion IDs to mark as open
       */
      setState(state) {
        savedState = [...state];
      },
    };
  }
}
