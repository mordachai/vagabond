/**
 * Progress Clock helper class for managing clock journals
 * Clocks are stored as JournalEntry documents with custom flags
 */
export class ProgressClock {
  /**
   * Create a new progress clock
   * @param {Object} data - Clock configuration data
   * @param {string} data.name - Clock name (default: "New Clock")
   * @param {number} data.segments - Number of segments (4, 6, 8, 10, or 12)
   * @param {string} data.size - Size preset ("S", "M", "L") or custom pixel value
   * @param {string} data.defaultPosition - Corner position ("top-right", "top-left", etc.)
   * @returns {Promise<JournalEntry>} The created clock journal
   */
  static async create(data = {}) {
    const defaultPosition = game.settings.get('vagabond', 'defaultClockPosition') || 'top-right';

    const journal = await JournalEntry.create({
      name: data.name || "New Clock",
      flags: {
        vagabond: {
          progressClock: {
            type: "progressClock",
            segments: data.segments || 4,
            filled: 0,
            defaultPosition: data.defaultPosition || defaultPosition,
            size: data.size || "M",
            visible: data.visible !== undefined ? data.visible : true,
            positions: {}
          }
        }
      }
    });

    return journal;
  }

  /**
   * Get all progress clock journals
   * @returns {JournalEntry[]} Array of clock journals
   */
  static getAll() {
    return game.journal.filter(j =>
      j.flags?.vagabond?.progressClock?.type === "progressClock"
    );
  }

  /**
   * Get clocks for a specific scene
   * @param {string} sceneId - Scene ID to filter by
   * @returns {JournalEntry[]} Clocks that have been positioned on this scene
   */
  static getForScene(sceneId) {
    return this.getAll().filter(clock => {
      const positions = clock.flags.vagabond.progressClock.positions;
      return positions && positions[sceneId];
    });
  }

  /**
   * Calculate default position coordinates for a clock
   * @param {string} position - Corner position ("top-right", "top-left", "bottom-right", "bottom-left")
   * @param {number|string} size - Clock size (pixels or preset "S"/"M"/"L")
   * @param {number} order - Stacking order (for horizontal layout)
   * @returns {Object} {x, y} coordinates in canvas pixels
   */
  static defaultPositionCoords(position, size, order = 0) {
    // Convert size to pixels
    const sizeMap = CONFIG.VAGABOND.clockSizes;
    const pixelSize = typeof size === 'number' ? size : (sizeMap[size] || sizeMap.M);

    const margin = 20; // Spacing between clocks
    const padding = 40; // Padding from canvas edge

    // Calculate horizontal offset based on order
    const horizontalOffset = order * (pixelSize + margin);

    const canvasWidth = canvas.dimensions.width;
    const canvasHeight = canvas.dimensions.height;

    switch (position) {
      case 'top-right':
        return {
          x: canvasWidth - pixelSize - padding - horizontalOffset,
          y: padding
        };
      case 'top-left':
        return {
          x: padding + horizontalOffset,
          y: padding
        };
      case 'bottom-right':
        return {
          x: canvasWidth - pixelSize - padding - horizontalOffset,
          y: canvasHeight - pixelSize - padding
        };
      case 'bottom-left':
        return {
          x: padding + horizontalOffset,
          y: canvasHeight - pixelSize - padding
        };
      default:
        return {
          x: canvasWidth - pixelSize - padding - horizontalOffset,
          y: padding
        };
    }
  }

  /**
   * Get the next available order number for a given position
   * @param {string} position - Corner position
   * @returns {number} Next order number
   */
  static getNextOrder(position) {
    const clocks = this.getAll();
    const clocksInPosition = clocks.filter(c =>
      c.flags.vagabond.progressClock.defaultPosition === position
    );

    if (clocksInPosition.length === 0) return 0;

    // Find highest order in current scene
    const sceneId = canvas.scene?.id;
    if (!sceneId) return clocksInPosition.length;

    const maxOrder = clocksInPosition.reduce((max, clock) => {
      const pos = clock.flags.vagabond.progressClock.positions?.[sceneId];
      return pos && pos.order !== undefined ? Math.max(max, pos.order) : max;
    }, -1);

    return maxOrder + 1;
  }
}
