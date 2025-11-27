import { ProgressClock } from '../documents/progress-clock.mjs';
import { ProgressClockSprite } from './progress-clock-sprite.mjs';

/**
 * Canvas Layer for rendering Progress Clocks
 * Extends InterfaceCanvasGroup to render as fixed UI overlay (not part of world canvas)
 */
export class ProgressClockLayer extends foundry.canvas.groups.InterfaceCanvasGroup {
  /**
   * Map of clock sprites by journal ID
   * @type {Map<string, ProgressClockSprite>}
   */
  sprites = new Map();

  /**
   * @override
   */
  static groupName = 'progressClocks';

  /**
   * @override
   */
  static tearDownChildren = true;

  /**
   * Draw the interface group
   * @override
   */
  async draw(options) {
    console.log('ProgressClockLayer draw called');
    console.log('ProgressClockLayer parent:', this.parent);
    console.log('ProgressClockLayer position:', this.x, this.y);
    console.log('ProgressClockLayer transform:', this.transform);
    await this.drawClocks();
  }

  /**
   * Draw all progress clocks for the current scene
   */
  async drawClocks() {
    // Clear existing sprites
    this.clearClocks();

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

    // Create sprites for each clock
    for (const [position, posClocks] of clocksByPosition.entries()) {
      // Sort by order
      posClocks.sort((a, b) => {
        const sceneId = canvas.scene.id;
        const orderA = a.flags.vagabond.progressClock.positions?.[sceneId]?.order ?? 0;
        const orderB = b.flags.vagabond.progressClock.positions?.[sceneId]?.order ?? 0;
        return orderA - orderB;
      });

      // Create sprite for each clock
      for (let i = 0; i < posClocks.length; i++) {
        const clock = posClocks[i];
        await this.createClockSprite(clock, i);
      }
    }
  }

  /**
   * Create a sprite for a single clock
   * @param {JournalEntry} clock - The clock journal
   * @param {number} order - Stacking order
   */
  async createClockSprite(clock, order = 0) {
    // Create sprite
    const sprite = new ProgressClockSprite(clock, this);
    await sprite.load();

    // Get position (scene-specific or default)
    const sceneId = canvas.scene.id;
    const data = clock.flags.vagabond.progressClock;
    let position;

    if (data.positions && data.positions[sceneId]) {
      // Use scene-specific position
      position = data.positions[sceneId];
      sprite.x = position.x;
      sprite.y = position.y;
    } else {
      // Calculate default position
      const coords = ProgressClock.defaultPositionCoords(
        data.defaultPosition,
        data.size,
        order
      );
      sprite.x = coords.x;
      sprite.y = coords.y;
    }

    console.log(`Clock sprite positioned at: ${sprite.x}, ${sprite.y}`);

    // Add to layer
    this.addChild(sprite);
    this.sprites.set(clock.id, sprite);

    return sprite;
  }

  /**
   * Refresh a specific clock sprite
   * @param {string} clockId - The clock journal ID
   */
  async refreshClock(clockId) {
    const sprite = this.sprites.get(clockId);
    if (sprite) {
      await sprite.refresh();
    }
  }

  /**
   * Remove a clock sprite
   * @param {string} clockId - The clock journal ID
   */
  removeClock(clockId) {
    const sprite = this.sprites.get(clockId);
    if (sprite) {
      sprite.destroy();
      this.sprites.delete(clockId);
    }
  }

  /**
   * Clear all clock sprites
   */
  clearClocks() {
    for (const sprite of this.sprites.values()) {
      sprite.destroy();
    }
    this.sprites.clear();
    this.removeChildren();
  }

  /**
   * @override
   */
  async tearDown(options) {
    console.log('ProgressClockLayer tearDown called');
    this.clearClocks();
  }
}