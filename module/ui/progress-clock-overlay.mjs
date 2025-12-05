import { ProgressClock } from '../documents/progress-clock.mjs';
import { ProgressClockConfig } from '../applications/progress-clock-config.mjs';

/**
 * HTML-based Progress Clock Overlay Manager
 * Renders clocks as fixed HTML elements on top of the canvas
 */
export class ProgressClockOverlay {
  constructor() {
    this.container = null;
    this.clockElements = new Map();
    this._drawPending = false;
  }

  /**
   * Initialize the overlay container
   */
  initialize() {
    // Create container element
    this.container = document.createElement('div');
    this.container.id = 'progress-clocks-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 100;
    `;

    // Add to document body
    document.body.appendChild(this.container);

    // Watch for sidebar changes
    this._setupSidebarObserver();
  }

  /**
   * Setup observer for sidebar changes
   */
  _setupSidebarObserver() {
    // Watch for changes to the sidebar-content element
    const observer = new MutationObserver(() => {
      this._onSidebarChange();
    });

    // Observe the sidebar-content element for class changes (expanded/collapsed)
    const sidebarContent = document.getElementById('sidebar-content');
    if (sidebarContent) {
      observer.observe(sidebarContent, {
        attributes: true,
        attributeFilter: ['class']
      });
    }

    // Also watch for window resize
    window.addEventListener('resize', () => {
      this._onSidebarChange();
    });

    this._sidebarObserver = observer;
  }

  /**
   * Handle sidebar open/close or window resize
   */
  _onSidebarChange() {
    if (!canvas?.scene) return;

    const sceneId = canvas.scene.id;
    const sidebarContent = document.getElementById('sidebar-content');
    const isSidebarExpanded = sidebarContent?.classList.contains('expanded');
    const MIN_DISTANCE_FROM_RIGHT = 350; // Minimum distance from right edge when sidebar is expanded
    const screenWidth = window.innerWidth;

    for (const [clockId, element] of this.clockElements.entries()) {
      const clock = game.journal.get(clockId);
      if (!clock) continue;

      const data = clock.flags.vagabond.progressClock;
      const currentLeft = parseInt(element.style.left) || 0;
      const currentTop = parseInt(element.style.top) || 0;
      const clockSize = ProgressClock.getClockSize(data.size);

      // Calculate distance from right edge (accounting for clock width)
      const clockRightEdge = currentLeft + clockSize;
      const distanceFromRight = screenWidth - clockRightEdge;

      // Check if clock is within 350px of right edge and sidebar is expanded
      const isInCollisionZone = distanceFromRight < MIN_DISTANCE_FROM_RIGHT;

      if (isSidebarExpanded && isInCollisionZone) {
        // Sidebar is expanded and clock is too close to the right edge
        // Move it left ONLY (preserve vertical position)
        const maxLeft = screenWidth - clockSize - MIN_DISTANCE_FROM_RIGHT;
        element.style.left = Math.min(currentLeft, maxLeft) + 'px';
        // Keep existing vertical position
        element.style.top = currentTop + 'px';
      } else if (!isSidebarExpanded && data.positions?.[sceneId]) {
        // Sidebar collapsed - restore saved position if it exists
        element.style.left = data.positions[sceneId].x + 'px';
        element.style.top = data.positions[sceneId].y + 'px';
      }
      // Otherwise, don't move the clock at all
    }
  }

  /**
   * Get the order/index of a clock in its position group
   */
  _getClockOrder(clock) {
    const clocks = ProgressClock.getForScene();
    const data = clock.flags.vagabond.progressClock;
    const position = data.defaultPosition || 'top-right';

    // Get all clocks in same position
    const clocksInPosition = clocks.filter(c => {
      const cData = c.flags.vagabond.progressClock;
      return (cData.defaultPosition || 'top-right') === position;
    });

    // Sort by order
    clocksInPosition.sort((a, b) => {
      const sceneId = canvas.scene.id;
      const orderA = a.flags.vagabond.progressClock.positions?.[sceneId]?.order ?? 0;
      const orderB = b.flags.vagabond.progressClock.positions?.[sceneId]?.order ?? 0;
      return orderA - orderB;
    });

    return clocksInPosition.findIndex(c => c.id === clock.id);
  }

  /**
   * Draw all clocks for the current scene
   */
  async draw() {
    if (!this.container) {
      return;
    }

    // If a draw is already pending, queue another one after it completes
    if (this._drawPending) {
      this._drawQueued = true;
      return;
    }

    this._drawPending = true;

    try {
      // Clear existing clocks
      this.clear();

      // Safety check: remove any orphaned clock elements from DOM
      const orphanedClocks = this.container.querySelectorAll('.progress-clock');
      orphanedClocks.forEach(el => el.remove());

      // Get all visible clocks for current user
      const clocks = ProgressClock.getForScene();

      // Group clocks by default position for stacking
      const clocksByPosition = new Map();
      for (const clock of clocks) {
        const data = clock.flags.vagabond.progressClock;
        const pos = data.defaultPosition || 'top-right';

        if (!clocksByPosition.has(pos)) {
          clocksByPosition.set(pos, []);
        }
        clocksByPosition.get(pos).push(clock);
      }

      // Create elements for each clock
      for (const [position, posClocks] of clocksByPosition.entries()) {
        // Sort by order
        posClocks.sort((a, b) => {
          const sceneId = canvas.scene.id;
          const orderA = a.flags.vagabond.progressClock.positions?.[sceneId]?.order ?? 0;
          const orderB = b.flags.vagabond.progressClock.positions?.[sceneId]?.order ?? 0;
          return orderA - orderB;
        });

        // Create element for each clock
        for (let i = 0; i < posClocks.length; i++) {
          const clock = posClocks[i];
          await this.createClockElement(clock, i);
        }
      }
    } finally {
      this._drawPending = false;

      // If a draw was queued while we were drawing, do it now
      if (this._drawQueued) {
        this._drawQueued = false;
        await this.draw();
      }
    }
  }

  /**
   * Create an HTML element for a single clock
   * Note: This should only be called when creating a new clock or during a full redraw
   */
  async createClockElement(clock, order = 0) {
    // Remove any existing element for this clock ID from Map
    const existingElement = this.clockElements.get(clock.id);
    if (existingElement) {
      if (existingElement._cleanup) {
        existingElement._cleanup();
      }
      existingElement.remove();
      this.clockElements.delete(clock.id);
    }

    // Also check DOM for any elements with this clock's ID
    const domElement = document.getElementById(`progress-clock-${clock.id}`);
    if (domElement) {
      if (domElement._cleanup) {
        domElement._cleanup();
      }
      domElement.remove();
    }

    // Check for any elements with this clock's data-clock-id
    const dataElement = this.container?.querySelector(`[data-clock-id="${clock.id}"]`);
    if (dataElement) {
      if (dataElement._cleanup) {
        dataElement._cleanup();
      }
      dataElement.remove();
    }

    const data = clock.flags.vagabond.progressClock;
    const size = ProgressClock.getClockSize(data.size);

    // Get position
    const sceneId = canvas.scene?.id;
    let position;

    if (sceneId && data.positions?.[sceneId]) {
      // Use scene-specific position
      position = data.positions[sceneId];
    } else {
      // Calculate default position
      position = ProgressClock.defaultPositionCoords(
        data.defaultPosition,
        data.size,
        order
      );
    }

    // Create clock container with unique ID
    const clockEl = document.createElement('div');
    clockEl.className = 'progress-clock';
    clockEl.id = `progress-clock-${clock.id}`;
    clockEl.dataset.clockId = clock.id;

    // Check if fade is enabled
    const isFaded = data.faded || false;
    const baseOpacity = isFaded ? 0.25 : 1;

    clockEl.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      width: ${size}px;
      height: ${size + 40}px;
      pointer-events: auto;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      opacity: ${baseOpacity};
      transition: opacity 0.2s ease;
    `;

    // Add hover handlers for fade effect
    if (isFaded) {
      clockEl.addEventListener('mouseenter', () => {
        clockEl.style.opacity = '1';
      });
      clockEl.addEventListener('mouseleave', () => {
        clockEl.style.opacity = '0.25';
      });
    }

    // Create image element
    const svgPath = ProgressClock.getSVGPath(data.segments, data.filled);
    const img = document.createElement('img');
    img.src = svgPath;
    img.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      display: block;
    `;

    // Create name text
    const nameEl = document.createElement('div');
    nameEl.textContent = clock.name;
    nameEl.style.cssText = `
      color: white;
      font-family: Signika, sans-serif;
      font-size: 16px;
      text-align: center;
      text-shadow: 0 0 3px black, 0 0 3px black, 0 0 3px black;
      user-select: none;
    `;

    clockEl.appendChild(img);
    clockEl.appendChild(nameEl);

    // Add event listeners
    this._attachEventListeners(clockEl, clock);

    // Add to container
    this.container.appendChild(clockEl);
    this.clockElements.set(clock.id, clockEl);
  }

  /**
   * Attach event listeners to a clock element
   */
  _attachEventListeners(element, clock) {
    const clockId = clock.id; // Store ID, not the object, to avoid stale references
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let elementStartX = 0;
    let elementStartY = 0;
    let clickTimeout = null;
    let clickCount = 0;

    // Mouse down: start potential drag
    element.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only left mouse button

      const clock = game.journal.get(clockId);
      if (!clock || !clock.testUserPermission(game.user, 'OWNER')) {
        return;
      }

      isDragging = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      elementStartX = element.offsetLeft;
      elementStartY = element.offsetTop;

      element.style.opacity = '0.7';
      element.style.cursor = 'grabbing';

      e.preventDefault();
    });

    // Mouse move: drag
    const onMouseMove = (e) => {
      if (dragStartX === 0) return;

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      // If moved more than 5px, consider it a drag
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging = true;
        element.style.left = (elementStartX + dx) + 'px';
        element.style.top = (elementStartY + dy) + 'px';
      }
    };

    // Mouse up: end drag or handle click
    const onMouseUp = async (e) => {
      if (dragStartX === 0) return;

      const clock = game.journal.get(clockId);
      if (!clock) return;

      if (isDragging) {
        // Save new position
        const sceneId = canvas.scene.id;
        const data = clock.flags.vagabond.progressClock;
        const order = data.positions?.[sceneId]?.order || 0;

        await clock.update({
          [`flags.vagabond.progressClock.positions.${sceneId}`]: {
            x: element.offsetLeft,
            y: element.offsetTop,
            order: order
          }
        });
      } else {
        // Handle click
        clickCount++;

        if (clickCount === 1) {
          // Wait to see if it's a double click
          clickTimeout = setTimeout(async () => {
            // Single click: increment (or decrement if shift held)
            const clock = game.journal.get(clockId);
            if (!clock || !clock.testUserPermission(game.user, 'OWNER')) {
              if (clock) ui.notifications.warn(game.i18n.localize('VAGABOND.ProgressClock.NoPermission'));
              clickCount = 0;
              return;
            }

            const data = clock.flags.vagabond.progressClock;
            let filled;
            if (e.shiftKey) {
              // Shift + left click: decrement
              filled = Math.max(data.filled - 1, 0);
            } else {
              // Left click: increment
              filled = Math.min(data.filled + 1, data.segments);
            }
            await clock.update({ 'flags.vagabond.progressClock.filled': filled });
            clickCount = 0;
          }, 300);
        } else if (clickCount === 2) {
          // Double click: configure
          clearTimeout(clickTimeout);
          clickCount = 0;
          const clock = game.journal.get(clockId);
          if (clock) new ProgressClockConfig(clock).render(true);
        }
      }

      element.style.opacity = '1';
      element.style.cursor = 'pointer';
      isDragging = false;
      dragStartX = 0;
      dragStartY = 0;
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Right click: show context menu
    element.addEventListener('contextmenu', (e) => {
      e.preventDefault();

      const clock = game.journal.get(clockId);
      if (!clock || !clock.testUserPermission(game.user, 'OWNER')) {
        if (clock) ui.notifications.warn(game.i18n.localize('VAGABOND.ProgressClock.NoPermission'));
        return;
      }

      this._showContextMenu(e, clock, element);
    });

    // Store cleanup function
    element._cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (clickTimeout) clearTimeout(clickTimeout);
    };
  }

  /**
   * Show context menu for a clock
   */
  _showContextMenu(event, clock, element) {
    if (!clock.testUserPermission(game.user, 'OWNER')) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.ProgressClock.NoPermission'));
      return;
    }

    // Remove any existing context menu
    const existingMenu = document.querySelector('.progress-clock-context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }

    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'progress-clock-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${event.clientX}px;
      top: ${event.clientY}px;
      background: #000;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 4px 0;
      z-index: 10000;
      min-width: 150px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5);
    `;

    // Get current fade state
    const data = clock.flags.vagabond.progressClock;
    const isFaded = data.faded || false;

    // Fade option
    const fadeOption = this._createMenuOption(
      isFaded ? '✓ Fade' : 'Fade',
      'fas fa-eye-slash',
      async () => {
        await clock.update({ 'flags.vagabond.progressClock.faded': !isFaded });
        menu.remove();
      }
    );

    // Configure option
    const configOption = this._createMenuOption('Configure', 'fas fa-cog', () => {
      new ProgressClockConfig(clock).render(true);
      menu.remove();
    });

    // Delete option
    const deleteOption = this._createMenuOption('Delete', 'fas fa-trash', async () => {
      const confirm = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('VAGABOND.ProgressClock.Delete') },
        content: `<p>Are you sure you want to delete "${clock.name}"?</p>`,
        rejectClose: false,
        modal: true
      });

      if (confirm) {
        await clock.delete();
      }
      menu.remove();
    });

    menu.appendChild(fadeOption);
    menu.appendChild(configOption);
    menu.appendChild(deleteOption);
    document.body.appendChild(menu);

    // Close menu when clicking outside
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  /**
   * Create a context menu option
   */
  _createMenuOption(label, icon, onClick) {
    const option = document.createElement('div');
    option.style.cssText = `
      padding: 8px 12px;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: Signika, sans-serif;
      font-size: 14px;
    `;

    option.innerHTML = `<i class="${icon}"></i> ${label}`;

    option.addEventListener('mouseenter', () => {
      option.style.background = '#333';
    });

    option.addEventListener('mouseleave', () => {
      option.style.background = 'transparent';
    });

    option.addEventListener('click', onClick);

    return option;
  }

  /**
   * Refresh a specific clock's image and name (lightweight update)
   */
  async refreshClock(clockId) {
    const element = this.clockElements.get(clockId);
    if (!element) return;

    // Verify element is still in DOM
    if (!element.isConnected) {
      this.clockElements.delete(clockId);
      return;
    }

    // Find the clock document
    const clock = game.journal.get(clockId);
    if (!clock) return;

    const data = clock.flags.vagabond.progressClock;

    // Update the image with cache busting
    const svgPath = ProgressClock.getSVGPath(data.segments, data.filled);
    const img = element.querySelector('img');
    if (img) {
      // Add timestamp to force reload and avoid caching issues
      img.src = `${svgPath}?t=${Date.now()}`;
    }

    // Update the name
    const nameEl = element.querySelector('div');
    if (nameEl) {
      nameEl.textContent = clock.name;
    }
  }

  /**
   * Remove a clock element
   */
  removeClock(clockId) {
    // Remove from Map
    const element = this.clockElements.get(clockId);
    if (element) {
      if (element._cleanup) {
        element._cleanup();
      }
      element.remove();
      this.clockElements.delete(clockId);
    }

    // Also check DOM directly in case element wasn't in Map
    const domElement = document.getElementById(`progress-clock-${clockId}`);
    if (domElement) {
      if (domElement._cleanup) {
        domElement._cleanup();
      }
      domElement.remove();
    }

    // Also check by data attribute
    const dataElement = this.container?.querySelector(`[data-clock-id="${clockId}"]`);
    if (dataElement && dataElement !== domElement) {
      if (dataElement._cleanup) {
        dataElement._cleanup();
      }
      dataElement.remove();
    }
  }

  /**
   * Clear all clocks
   */
  clear() {
    // Properly clean up all clock elements
    for (const [clockId, element] of this.clockElements.entries()) {
      if (element._cleanup) {
        element._cleanup();
      }
      element.remove();
    }
    this.clockElements.clear();

    // Also clear container innerHTML as a safety measure
    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * Destroy the overlay
   */
  destroy() {
    this.clear();

    // Disconnect observer
    if (this._sidebarObserver) {
      this._sidebarObserver.disconnect();
      this._sidebarObserver = null;
    }

    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
