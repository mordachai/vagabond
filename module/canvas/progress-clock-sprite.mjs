import { ProgressClock } from '../documents/progress-clock.mjs';
import { ProgressClockConfig } from '../applications/progress-clock-config.mjs';

/**
 * PIXI Sprite Container for rendering a single Progress Clock on the canvas
 * Extends PIXI.Container to hold both the clock SVG sprite and name text
 */
export class ProgressClockSprite extends PIXI.Container {
  /**
   * @param {JournalEntry} clock - The clock journal document
   * @param {ProgressClockLayer} layer - Parent layer reference
   */
  constructor(clock, layer) {
    super();

    this.clock = clock;
    this.layer = layer;
    this.dragging = false;
    this.dragStart = null;

    // Make container interactive
    this.eventMode = 'static';
    this.cursor = 'pointer';

    // Initialize sprites
    this.clockSprite = new PIXI.Sprite();
    this.nameText = new PIXI.Text('', {
      fontFamily: 'Signika',
      fontSize: 16,
      fill: 0xFFFFFF,
      stroke: 0x000000,
      strokeThickness: 3,
      align: 'center'
    });

    this.addChild(this.clockSprite);
    this.addChild(this.nameText);

    // Set up event listeners
    this._setupEventListeners();
  }

  /**
   * Load and render the clock sprite
   */
  async load() {
    const data = this.clock.flags.vagabond.progressClock;
    const size = ProgressClock.getClockSize(data.size);

    // Load SVG texture
    const svgPath = ProgressClock.getSVGPath(data.segments, data.filled);
    const texture = await PIXI.Texture.from(svgPath);

    // Set sprite properties
    this.clockSprite.texture = texture;
    this.clockSprite.width = size;
    this.clockSprite.height = size;
    this.clockSprite.anchor.set(0.5, 0.5);

    // Position name text below clock
    this.nameText.text = this.clock.name;
    this.nameText.anchor.set(0.5, 0);
    this.nameText.x = 0;
    this.nameText.y = size / 2 + 10;

    // Set hitArea for better click detection
    this.hitArea = new PIXI.Rectangle(-size / 2, -size / 2, size, size + 40);
  }

  /**
   * Refresh the clock sprite (e.g., after progress update)
   */
  async refresh() {
    await this.load();
  }

  /**
   * Set up event listeners for interactions
   * @private
   */
  _setupEventListeners() {
    // Left click: increment
    this.on('click', this._onClickLeft.bind(this));

    // Right click: decrement
    this.on('rightclick', this._onClickRight.bind(this));

    // Double click: open config
    this.on('dblclick', this._onDoubleClick.bind(this));

    // Drag events
    this.on('pointerdown', this._onDragStart.bind(this));
    this.on('pointerup', this._onDragEnd.bind(this));
    this.on('pointerupoutside', this._onDragEnd.bind(this));
    this.on('pointermove', this._onDragMove.bind(this));
  }

  /**
   * Handle left click - increment progress
   * @param {PIXI.FederatedPointerEvent} event
   * @private
   */
  _onClickLeft(event) {
    // Only OWNER can increment
    if (!this.clock.testUserPermission(game.user, 'OWNER')) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.ProgressClock.NoPermission'));
      return;
    }

    const data = this.clock.flags.vagabond.progressClock;
    const filled = Math.min(data.filled + 1, data.segments);

    this.clock.update({ 'flags.vagabond.progressClock.filled': filled });
  }

  /**
   * Handle right click - decrement progress
   * @param {PIXI.FederatedPointerEvent} event
   * @private
   */
  _onClickRight(event) {
    event.preventDefault();
    event.stopPropagation();

    // Only OWNER can decrement
    if (!this.clock.testUserPermission(game.user, 'OWNER')) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.ProgressClock.NoPermission'));
      return;
    }

    const data = this.clock.flags.vagabond.progressClock;
    const filled = Math.max(data.filled - 1, 0);

    this.clock.update({ 'flags.vagabond.progressClock.filled': filled });
  }

  /**
   * Handle double click - open configuration dialog
   * @param {PIXI.FederatedPointerEvent} event
   * @private
   */
  _onDoubleClick(event) {
    event.preventDefault();
    event.stopPropagation();

    // Only OWNER can configure
    if (!this.clock.testUserPermission(game.user, 'OWNER')) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.ProgressClock.NoPermission'));
      return;
    }

    // Open config dialog
    new ProgressClockConfig(this.clock).render(true);
  }

  /**
   * Handle drag start
   * @param {PIXI.FederatedPointerEvent} event
   * @private
   */
  _onDragStart(event) {
    // Only OWNER can drag
    if (!this.clock.testUserPermission(game.user, 'OWNER')) return;

    this.dragging = true;
    this.dragStart = {
      x: this.x,
      y: this.y,
      eventX: event.global.x,
      eventY: event.global.y
    };
    this.alpha = 0.7;
  }

  /**
   * Handle drag move
   * @param {PIXI.FederatedPointerEvent} event
   * @private
   */
  _onDragMove(event) {
    if (!this.dragging) return;

    const dx = event.global.x - this.dragStart.eventX;
    const dy = event.global.y - this.dragStart.eventY;

    this.x = this.dragStart.x + dx;
    this.y = this.dragStart.y + dy;
  }

  /**
   * Handle drag end - save position
   * @param {PIXI.FederatedPointerEvent} event
   * @private
   */
  async _onDragEnd(event) {
    if (!this.dragging) return;

    this.dragging = false;
    this.alpha = 1.0;

    // Save position to clock document
    const sceneId = canvas.scene.id;
    const order = this.clock.flags.vagabond.progressClock.positions?.[sceneId]?.order || 0;

    await this.clock.update({
      [`flags.vagabond.progressClock.positions.${sceneId}`]: {
        x: this.x,
        y: this.y,
        order: order
      }
    });
  }

  /**
   * Destroy the sprite and clean up
   */
  destroy(options) {
    this.removeAllListeners();
    super.destroy(options);
  }
}
