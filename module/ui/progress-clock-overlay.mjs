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
        const saved = data.positions[sceneId];
        element.style.left = (saved.xRatio !== undefined ? Math.round(saved.xRatio * window.innerWidth) : saved.x) + 'px';
        element.style.top = (saved.yRatio !== undefined ? Math.round(saved.yRatio * window.innerHeight) : saved.y) + 'px';
      }
      // Otherwise, don't move the clock at all
    }
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
      for (const posClocks of clocksByPosition.values()) {
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
    // Trackers use a static background + pip ring; clocks swap segmented art
    const isTracker = data.kind === 'tracker';

    // Get position
    const sceneId = canvas.scene?.id;
    let position;

    if (sceneId && data.positions?.[sceneId]) {
      // Use scene-specific position, resolving ratios to this client's screen size
      const saved = data.positions[sceneId];
      position = {
        x: saved.xRatio !== undefined ? Math.round(saved.xRatio * window.innerWidth) : saved.x,
        y: saved.yRatio !== undefined ? Math.round(saved.yRatio * window.innerHeight) : saved.y,
      };
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
      pointer-events: auto;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
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

    // ---- Tunable layout constants (test these to taste) ----
    const BTN_HEIGHT_RATIO = 0.45;        // side button height relative to clock size
    const BTN_ASPECT = 80.26 / 151.78;    // arrow SVG width / height (~0.529)
    const BTN_OVERLAP = 0.25;              // fraction of button tucked behind the clock (higher = more interior)
    const NUMBER_RATIO = isTracker ? 0.35 : 0.4; // center number font-size relative to clock size
    const btnH = size * BTN_HEIGHT_RATIO;
    const btnW = btnH * BTN_ASPECT;
    const btnPeek = btnW * (1 - BTN_OVERLAP); // px sticking out past the clock edge

    const canOperate = clock.testUserPermission(game.user, 'OWNER');

    // Stage: holds the layered buttons + clock image + center number
    const stage = document.createElement('div');
    stage.className = 'pc-stage';
    stage.style.cssText = `
      position: relative;
      width: ${size}px;
      height: ${size}px;
    `;

    // Side buttons (behind the clock — only for owners who can operate)
    if (canOperate) {
      const makeBtn = (side, delta, src) => {
        const btn = document.createElement('img');
        btn.className = `pc-btn-${side}`;
        btn.src = `systems/vagabond/assets/ui/clocks/${src}`;
        btn.dataset.delta = String(delta);
        // Cosmetic styles live in _progress-clock.scss; only dynamic geometry is inline
        btn.style.cssText = `
          top: 50%;
          ${side === 'left' ? 'left' : 'right'}: ${-btnPeek}px;
          transform: translateY(-50%);
          width: ${btnW}px;
          height: ${btnH}px;
        `;
        btn.addEventListener('mousedown', (e) => e.stopPropagation());
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this._onButtonClick(clock.id, delta);
        });
        return btn;
      };
      stage.appendChild(makeBtn('left', -1, 'clock_left_bt.svg'));
      stage.appendChild(makeBtn('right', +1, 'clock_right_bt.svg'));
    }

    // Clock image (in front of the buttons)
    // Trackers use a static background; clocks swap art per filled value
    const svgPath = isTracker
      ? ProgressClock.getTrackerSVGPath()
      : ProgressClock.getSVGPath(data.segments, data.filled);
    const img = document.createElement('img');
    img.className = 'pc-clock-img';
    img.src = svgPath;
    img.style.cssText = `
      position: relative;
      width: ${size}px;
      height: ${size}px;
      display: block;
      z-index: 2;
    `;

    // Center number — current filled value
    const numberEl = document.createElement('div');
    numberEl.className = 'pc-number';
    numberEl.textContent = data.filled;
    // Cosmetic styles live in _progress-clock.scss; only dynamic font-size is inline
    numberEl.style.cssText = `font-size: ${Math.round(size * NUMBER_RATIO)}px;`;

    stage.appendChild(img);
    stage.appendChild(numberEl);

    // Tracker pip ring (green = positive clockwise, red = negative CCW)
    if (isTracker) this._renderTrackerPips(stage, size, data.filled);

    // Create name text
    const nameEl = document.createElement('div');
    nameEl.className = 'pc-name';
    nameEl.textContent = clock.name;
    // Cosmetic styles live in _progress-clock.scss (.progress-clock .pc-name)

    clockEl.appendChild(nameEl);
    clockEl.appendChild(stage);

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
    const onMouseUp = async () => {
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
            xRatio: element.offsetLeft / window.innerWidth,
            yRatio: element.offsetTop / window.innerHeight,
            order: order
          }
        });
      } else {
        // Single click no longer operates the clock — use the side buttons.
        // Double click still opens the config dialog.
        clickCount++;

        if (clickCount === 1) {
          clickTimeout = setTimeout(() => { clickCount = 0; }, 300);
        } else if (clickCount === 2) {
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

      this._showContextMenu(e, clock);
    });

    // Store cleanup function
    element._cleanup = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (clickTimeout) clearTimeout(clickTimeout);
    };
  }

  /**
   * Handle a side-button click: change filled by delta (left = -1, right = +1)
   * @param {string} clockId - The clock journal ID
   * @param {number} delta - Amount to change filled by
   */
  async _onButtonClick(clockId, delta) {
    const clock = game.journal.get(clockId);
    if (!clock) return;
    if (!clock.testUserPermission(game.user, 'OWNER')) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.ProgressClock.NoPermission'));
      return;
    }

    const data = clock.flags.vagabond.progressClock;
    // Trackers are unbounded (negatives allowed); clocks wrap around [0, segments]
    const filled = data.kind === 'tracker'
      ? data.filled + delta
      : (data.filled + delta + (data.segments + 1)) % (data.segments + 1);
    if (filled === data.filled) return; // no-op (segments === 0)

    await clock.update({ 'flags.vagabond.progressClock.filled': filled });
  }

  /**
   * Render the tracker pip ring into a stage element as radial tick traces.
   * Green traces fan clockwise from top (12 o'clock) for positive values; red
   * traces fan counter-clockwise for negatives. Only one side is ever populated
   * (value is a single number), so each may use the full 360°.
   *
   * Dynamic: trace count = |value|. Up to THRESHOLD (30) traces march around from
   * the top at a fixed spacing; beyond that they distribute evenly over the full
   * ring and shrink to keep fitting. Only lit traces are drawn.
   * @param {HTMLElement} stage - The .pc-stage element
   * @param {number} size - Clock pixel size
   * @param {number} value - Current tracker value (may be negative)
   */
  _renderTrackerPips(stage, size, value) {
    // Clear any existing pip layer
    const old = stage.querySelector('.pc-pips');
    if (old) old.remove();

    const layer = document.createElement('div');
    layer.className = 'pc-pips';
    stage.appendChild(layer);

    const positive = Math.max(0, value);
    const negative = Math.max(0, -value);
    if (!positive && !negative) return; // zero — empty ring

    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.38;                       // trace ring radius (white band)
    const BASE_W = Math.max(2, size * 0.045);   // tangential width of a trace (~4.5px at M)
    const TICK_LEN = size * 0.1;                // radial length of a trace (constant)
    const TOP = -Math.PI / 2;                   // 12 o'clock
    const FULL = Math.PI * 2;                    // whole ring available per side
    const THRESHOLD = 36;                        // stay full-size until this many traces

    // Below threshold: march around from the top at fixed spacing.
    // At/after threshold (or once a full ring would fill): even distribution + shrink.
    const layout = (count) => {
      const desiredStep = (BASE_W * 1.5) / R;   // trace width + gap, in radians
      if (count <= THRESHOLD && count * desiredStep <= FULL) {
        return { step: desiredStep, w: BASE_W };
      }
      const step = FULL / count;
      const w = Math.max(1.2, Math.min(BASE_W, (step * R) / 1.2));
      return { step, w };
    };

    const addSide = (count, dir, cls) => {
      if (count <= 0) return;
      const { step, w } = layout(count);
      for (let i = 1; i <= count; i++) {
        const theta = TOP + dir * i * step;
        const x = cx + R * Math.cos(theta);
        const y = cy + R * Math.sin(theta);
        const deg = (theta * 180) / Math.PI - 90; // align long axis radially
        const tick = document.createElement('div');
        tick.className = `pc-pip ${cls}`;
        tick.style.cssText =
          `width:${w}px;height:${TICK_LEN}px;left:${x}px;top:${y}px;` +
          `transform:translate(-50%,-50%) rotate(${deg}deg);`;
        layer.appendChild(tick);
      }
    };

    addSide(positive, +1, 'positive'); // clockwise → right side
    addSide(negative, -1, 'negative'); // counter-clockwise → left side
  }

  /**
   * Show context menu for a clock
   */
  _showContextMenu(event, clock) {
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

    // Hide option — removes from view but keeps the journal in the sidebar
    const hideOption = this._createMenuOption('Hide', 'fas fa-box-archive', async () => {
      await clock.update({ 'flags.vagabond.progressClock.hidden': true });
      ui.notifications.info(game.i18n.localize('VAGABOND.ProgressClock.HiddenHint'));
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
    menu.appendChild(hideOption);
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

    // Update the clock image with cache busting.
    // Trackers keep a static background; only clocks swap art per filled value.
    const svgPath = data.kind === 'tracker'
      ? ProgressClock.getTrackerSVGPath()
      : ProgressClock.getSVGPath(data.segments, data.filled);
    const img = element.querySelector('.pc-clock-img');
    if (img) {
      // Add timestamp to force reload and avoid caching issues
      img.src = `${svgPath}?t=${Date.now()}`;
    }

    // Update the center number
    const numberEl = element.querySelector('.pc-number');
    if (numberEl) {
      numberEl.textContent = data.filled;
    }

    // Rebuild the tracker pip ring for the new value
    if (data.kind === 'tracker') {
      const stage = element.querySelector('.pc-stage');
      if (stage) this._renderTrackerPips(stage, ProgressClock.getClockSize(data.size), data.filled);
    }

    // Update the name
    const nameEl = element.querySelector('.pc-name');
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
    for (const element of this.clockElements.values()) {
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
