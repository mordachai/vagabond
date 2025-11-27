import { CountdownDice } from '../documents/countdown-dice.mjs';
import { CountdownDiceConfig } from '../applications/countdown-dice-config.mjs';

/**
 * UI Overlay for rendering countdown dice on the canvas
 */
export class CountdownDiceOverlay {
  constructor() {
    this.container = null;
    this.sidebarObserver = null;
  }

  /**
   * Initialize the overlay container
   */
  initialize() {
    // Create fixed container
    this.container = document.createElement('div');
    this.container.id = 'countdown-dice-overlay';
    this.container.className = 'countdown-dice-overlay';
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 100;
    `;

    document.body.appendChild(this.container);

    // Watch for sidebar changes
    this._setupSidebarObserver();
  }

  /**
   * Setup observer to watch for sidebar expansion/collapse
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

    this.sidebarObserver = observer;
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

    // Get all dice elements
    const diceElements = this.container?.querySelectorAll('.countdown-dice');
    if (!diceElements) return;

    diceElements.forEach(element => {
      const diceId = element.dataset.diceId;
      const dice = game.journal.get(diceId);
      if (!dice) return;

      const flags = dice.flags.vagabond.countdownDice;
      const currentLeft = parseInt(element.style.left) || 0;
      const currentTop = parseInt(element.style.top) || 0;
      const diceSize = CountdownDice.getSize(flags.size);

      // Calculate distance from right edge (accounting for dice width)
      const diceRightEdge = currentLeft + diceSize;
      const distanceFromRight = screenWidth - diceRightEdge;

      // Check if dice is within 350px of right edge and sidebar is expanded
      const isInCollisionZone = distanceFromRight < MIN_DISTANCE_FROM_RIGHT;

      if (isSidebarExpanded && isInCollisionZone) {
        // Sidebar is expanded and dice is too close to the right edge
        // Move it left ONLY (preserve vertical position)
        const maxLeft = screenWidth - diceSize - MIN_DISTANCE_FROM_RIGHT;
        element.style.left = Math.min(currentLeft, maxLeft) + 'px';
        // Keep existing vertical position
        element.style.top = currentTop + 'px';
      } else if (!isSidebarExpanded && flags.positions?.[sceneId]) {
        // Sidebar collapsed - restore saved position if it exists
        element.style.left = flags.positions[sceneId].x + 'px';
        element.style.top = flags.positions[sceneId].y + 'px';
      }
      // Otherwise, don't move the dice at all
    });
  }

  /**
   * Draw all visible countdown dice
   */
  async draw() {
    if (!this.container) return;

    // Clean up existing event listeners before clearing
    const existingDice = this.container.querySelectorAll('.countdown-dice');
    existingDice.forEach(el => {
      if (el._cleanupListeners) {
        el._cleanupListeners();
      }
    });

    // Clear existing dice
    this.container.innerHTML = '';

    // Get dice for current user
    const allDice = CountdownDice.getForCurrentUser();

    // Group by position and render
    for (const dice of allDice) {
      const order = dice.flags.vagabond.countdownDice.positions?.[canvas.scene?.id]?.order || 0;
      await this.createDiceElement(dice, order);
    }
  }

  /**
   * Create and append a dice element
   * @param {JournalEntry} dice - The dice journal entry
   * @param {number} order - Stacking order
   */
  async createDiceElement(dice, order = 0) {
    const flags = dice.flags.vagabond.countdownDice;
    const sceneId = canvas.scene?.id;

    // Get position
    let position;
    if (sceneId && flags.positions && flags.positions[sceneId]) {
      // Use saved position for this scene
      position = flags.positions[sceneId];
    } else {
      // Check if dice is already on screen (during redraw)
      const existingElement = this.container?.querySelector(`[data-dice-id="${dice.id}"]`);
      if (existingElement) {
        // Preserve current screen position during redraw
        position = {
          x: parseInt(existingElement.style.left) || 0,
          y: parseInt(existingElement.style.top) || 0,
          order: flags.positions?.[sceneId]?.order || order
        };

        // Save this position to avoid recalculating next time
        if (sceneId) {
          await dice.update({
            [`flags.vagabond.countdownDice.positions.${sceneId}`]: position
          });
        }
      } else {
        // Brand new dice - calculate default position
        position = CountdownDice.defaultPositionCoords(flags.size, order);
      }
    }

    // Get size
    const size = CountdownDice.getSize(flags.size);

    // Create container for positioning and dragging
    const container = document.createElement('div');
    container.className = 'countdown-dice';
    container.dataset.diceId = dice.id;

    if (flags.faded) {
      container.classList.add('faded');
    }

    container.style.cssText = `
      left: ${position.x}px;
      top: ${position.y}px;
      width: ${size}px;
    `;

    // Create inner wrapper for dice content
    const element = document.createElement('div');
    element.className = 'countdown-dice-content';

    // Create image
    const img = document.createElement('img');
    img.className = 'dice-image';
    img.src = CountdownDice.getDiceImagePath(flags.diceType);
    img.alt = flags.diceType;

    // Create name
    const nameDiv = document.createElement('div');
    nameDiv.className = 'dice-name';
    nameDiv.textContent = flags.name;

    element.appendChild(img);
    element.appendChild(nameDiv);
    container.appendChild(element);

    this.container.appendChild(container);

    // Attach event listeners
    this._attachEventListeners(container, element, dice);
  }

  /**
   * Attach event listeners to a dice element
   * @param {HTMLElement} container - The outer container element (for dragging)
   * @param {HTMLElement} element - The inner content element
   * @param {JournalEntry} dice - The dice journal entry
   */
  _attachEventListeners(container, element, dice) {
    const img = element.querySelector('.dice-image');
    const nameDiv = element.querySelector('.dice-name');

    // Drag and double-click functionality (matches progress clock pattern)
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let containerStartX = 0;
    let containerStartY = 0;
    let clickTimeout = null;
    let clickCount = 0;

    const onMouseDown = (e) => {
      // Only left mouse button
      if (e.button !== 0) return;

      isDragging = false;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      containerStartX = container.offsetLeft;
      containerStartY = container.offsetTop;

      container.style.opacity = '0.7';
      container.style.cursor = 'grabbing';

      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (dragStartX === 0) return;

      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;

      // If moved more than 5px, consider it a drag
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging = true;
        container.style.left = (containerStartX + dx) + 'px';
        container.style.top = (containerStartY + dy) + 'px';
      }
    };

    const onMouseUp = async (e) => {
      if (dragStartX === 0) return;

      if (isDragging) {
        // Save new position
        const sceneId = canvas.scene?.id;
        if (sceneId) {
          const order = dice.flags.vagabond.countdownDice.positions?.[sceneId]?.order || 0;

          await dice.update({
            [`flags.vagabond.countdownDice.positions.${sceneId}`]: {
              x: container.offsetLeft,
              y: container.offsetTop,
              order: order
            }
          });
        }
      } else {
        // Handle click (not a drag)
        clickCount++;

        if (clickCount === 1) {
          // Wait to see if it's a double click
          clickTimeout = setTimeout(() => {
            // Single click on image: roll dice
            if (e.target === img) {
              this._onRollDice(dice);
            }
            clickCount = 0;
          }, 300);
        } else if (clickCount === 2) {
          // Double click: show context menu
          clearTimeout(clickTimeout);
          clickCount = 0;
          this._showContextMenu(e, dice);
        }
      }

      container.style.opacity = '1';
      container.style.cursor = 'grab';
      isDragging = false;
      dragStartX = 0;
      dragStartY = 0;
    };

    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Store cleanup function on container for later removal if needed
    container._cleanupListeners = () => {
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (clickTimeout) clearTimeout(clickTimeout);
    };
  }

  /**
   * Handle rolling a dice
   * @param {JournalEntry} dice - The dice journal entry
   */
  async _onRollDice(dice) {
    const flags = dice.flags.vagabond.countdownDice;
    const diceType = flags.diceType;

    // Create roll
    const roll = new Roll(`1${diceType}`);
    await roll.evaluate();

    const rollResult = roll.total;

    // Determine outcome
    if (rollResult === 1) {
      const smallerDice = CountdownDice.getSmallerDice(diceType);

      if (smallerDice === null) {
        // d4 rolled 1 - countdown ends
        await this._postChatMessage(dice, roll, rollResult, 'ended');
        await dice.delete();
      } else {
        // Shrink dice
        await dice.update({
          'flags.vagabond.countdownDice.diceType': smallerDice,
        });
        await this._postChatMessage(dice, roll, rollResult, 'reduced', smallerDice);
      }
    } else {
      // Countdown continues
      await this._postChatMessage(dice, roll, rollResult, 'continues');
    }
  }

  /**
   * Post chat message for dice roll
   * @param {JournalEntry} dice - The dice journal entry
   * @param {Roll} roll - The roll object
   * @param {number} rollResult - The roll result
   * @param {string} status - Status: 'continues', 'reduced', or 'ended'
   * @param {string} newDiceType - New dice type (for 'reduced' status)
   */
  async _postChatMessage(dice, roll, rollResult, status, newDiceType = null) {
    const flags = dice.flags.vagabond.countdownDice;
    const currentDiceType = flags.diceType;

    let statusMessage;
    let statusClass;
    let stateMessage;

    if (status === 'continues') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Continues');
      statusClass = 'continues';
      stateMessage = `${currentDiceType} remains`;
    } else if (status === 'reduced') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Reduced');
      statusClass = 'reduced';
      stateMessage = `${currentDiceType} → ${newDiceType}`;
    } else if (status === 'ended') {
      statusMessage = game.i18n.localize('VAGABOND.CountdownDice.Chat.Ended');
      statusClass = 'ended';
      stateMessage = `${currentDiceType} countdown complete`;
    }

    const diceImagePath = CountdownDice.getDiceImagePath(currentDiceType);

    const content = `
      <div class="countdown-dice-chat">
        <div class="chat-header">
          <img src="${diceImagePath}" alt="${currentDiceType}" class="dice-icon" />
          <h4>${flags.name}</h4>
        </div>
        <div class="die-result">${rollResult}</div>
        <p><strong>${game.i18n.localize('VAGABOND.CountdownDice.Chat.CurrentState')}:</strong> ${stateMessage}</p>
        <p class="status-message ${statusClass}">${statusMessage}</p>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ alias: game.user.name }),
      content: content,
      rolls: [roll],
    });
  }

  /**
   * Show context menu for a dice
   * @param {MouseEvent} event - The context menu event
   * @param {JournalEntry} dice - The dice journal entry
   */
  _showContextMenu(event, dice) {
    // Remove any existing menu
    const existing = document.querySelector('.countdown-dice-context-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'countdown-dice-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${event.clientX}px;
      top: ${event.clientY}px;
      z-index: 10000;
      background: #1a1a1a;
      border: 1px solid #444;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      min-width: 150px;
    `;

    const flags = dice.flags.vagabond.countdownDice;
    const isFaded = flags.faded || false;

    // Fade option
    const fadeOption = this._createMenuOption(
      isFaded ? '✓ Fade' : 'Fade',
      'fas fa-eye-slash',
      async () => {
        await dice.update({ 'flags.vagabond.countdownDice.faded': !isFaded });
        menu.remove();
      }
    );

    // Configure option
    const configOption = this._createMenuOption('Configure', 'fas fa-cog', () => {
      new CountdownDiceConfig(dice).render(true);
      menu.remove();
    });

    // Delete option
    const deleteOption = this._createMenuOption('Delete', 'fas fa-trash', async () => {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize('VAGABOND.CountdownDice.Delete') },
        content: `<p>${game.i18n.localize('VAGABOND.CountdownDice.DeleteConfirm')}</p>`,
        rejectClose: false,
        modal: true
      });

      if (confirmed) {
        await dice.delete();
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
   * @param {string} label - The option label
   * @param {string} icon - The FontAwesome icon class
   * @param {Function} onClick - Click handler
   * @returns {HTMLElement}
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
   * Refresh a single dice display
   * @param {string} diceId - The dice ID
   */
  refreshDice(diceId) {
    this.draw();
  }

  /**
   * Remove a dice from display
   * @param {string} diceId - The dice ID
   */
  async removeDice(diceId) {
    // Find and remove the element
    const element = this.container?.querySelector(`[data-dice-id="${diceId}"]`);
    if (element) {
      // Clean up event listeners
      if (element._cleanupListeners) {
        element._cleanupListeners();
      }
      element.remove();
    }

    // Force a complete redraw to ensure no phantom dice remain
    // This ensures only dice with valid journal entries are displayed
    // Use a small delay to ensure the journal deletion has fully propagated
    await new Promise(resolve => setTimeout(resolve, 50));
    await this.draw();
  }
}
