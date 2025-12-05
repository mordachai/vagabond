/**
 * Countdown Dice - Static helper class for managing countdown dice
 * Countdown dice shrink when rolling a 1: d20 → d12 → d10 → d8 → d6 → d4 → end
 */
export class CountdownDice {
  /**
   * Dice progression from largest to smallest
   */
  static DICE_PROGRESSION = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

  /**
   * Get or create the "Vagabond Clocks & Dice" folder
   * @returns {Promise<Folder>} The folder for clocks and countdown dice
   */
  static async getOrCreateFolder() {
    const folderName = "Vagabond Clocks & Dice";

    // Check if folder already exists
    let folder = game.folders.find(f => f.name === folderName && f.type === "JournalEntry");

    // Create folder if it doesn't exist
    if (!folder) {
      folder = await Folder.create({
        name: folderName,
        type: "JournalEntry",
        color: "#8b0000",
        sorting: "a"
      });
    }

    return folder;
  }

  /**
   * Create a new countdown dice as a JournalEntry
   * @param {Object} data - Countdown dice data
   * @param {string} data.name - Name of the countdown dice
   * @param {string} data.diceType - Type of dice (d4, d6, d8, d10, d12, d20)
   * @param {string} data.size - Size preset (S, M, L)
   * @param {Object} data.ownership - Ownership permissions
   * @returns {Promise<JournalEntry>}
   */
  static async create(data = {}) {
    const order = this.getNextOrder();
    const size = data.size || 'M';
    const sceneId = canvas.scene?.id;
    const folder = await this.getOrCreateFolder();

    // Calculate initial position
    const initialPosition = this.defaultPositionCoords(size, order);

    const positions = {};
    if (sceneId) {
      positions[sceneId] = {
        x: initialPosition.x,
        y: initialPosition.y,
        order: order
      };
    }

    const journalData = {
      name: data.name || 'Countdown',
      folder: folder.id,
      ownership: data.ownership || {
        default: 0,
        [game.user.id]: 3
      },
      flags: {
        vagabond: {
          countdownDice: {
            type: 'countdownDice',
            diceType: data.diceType || 'd4',
            name: data.name || 'Countdown',
            size: size,
            faded: false,
            defaultPosition: 'middle-right',
            positions: positions
          }
        }
      }
    };

    const journal = await JournalEntry.create(journalData);
    return journal;
  }

  /**
   * Get all countdown dice journal entries
   * @returns {JournalEntry[]}
   */
  static getAll() {
    return game.journal.filter(j =>
      j.flags?.vagabond?.countdownDice?.type === 'countdownDice'
    );
  }

  /**
   * Get countdown dice visible to current user
   * @returns {JournalEntry[]}
   */
  static getForCurrentUser() {
    const allDice = this.getAll();

    // GM can see all dice
    if (game.user.isGM) {
      return allDice;
    }

    // Regular users only see dice they own
    return allDice.filter(dice => {
      const ownership = dice.ownership[game.user.id];
      return ownership === 3; // OWNER permission
    });
  }

  /**
   * Get path to dice image
   * @param {string} diceType - Type of dice (d4, d6, d8, d10, d12, d20)
   * @returns {string} Path to image
   */
  static getDiceImagePath(diceType) {
    return `systems/vagabond/assets/ui/dice/${diceType}.webp`;
  }

  /**
   * Convert size preset to pixels
   * @param {string} size - Size preset (S, M, L)
   * @returns {number} Size in pixels
   */
  static getSize(size) {
    const sizes = {
      'S': 50,
      'M': 75,
      'L': 100
    };
    return sizes[size] || sizes.M;
  }

  /**
   * Calculate default position coordinates for middle-right placement
   * @param {string} size - Size preset
   * @param {number} order - Stacking order
   * @returns {Object} {x, y} coordinates
   */
  static defaultPositionCoords(size, order = 0) {
    const sidebarContent = document.getElementById('sidebar-content');
    const isSidebarExpanded = sidebarContent?.classList.contains('expanded');
    const MIN_DISTANCE_FROM_RIGHT = 350; // Minimum distance from right edge when sidebar is expanded

    // Calculate x position accounting for sidebar state
    let x = window.innerWidth - 120; // Base position from right edge

    if (isSidebarExpanded) {
      // If sidebar is expanded, ensure we stay clear of it
      x = window.innerWidth - this.getSize(size) - MIN_DISTANCE_FROM_RIGHT;
    }

    // Calculate vertical spacing: dice height + name height (~20px) + 10px margin
    const diceHeight = this.getSize(size);
    const nameHeight = 20; // Approximate height of dice name
    const spacing = diceHeight + nameHeight + 10;

    const y = (window.innerHeight / 2) + (order * spacing);

    return { x, y };
  }

  /**
   * Get next available stacking order for middle-right position
   * @returns {number} Next order number
   */
  static getNextOrder() {
    const allDice = this.getForCurrentUser();
    const sceneId = canvas.scene?.id;

    if (!sceneId) return 0;

    let maxOrder = -1;
    for (const dice of allDice) {
      const position = dice.flags.vagabond.countdownDice.positions?.[sceneId];
      if (position && position.order !== undefined) {
        maxOrder = Math.max(maxOrder, position.order);
      }
    }

    return maxOrder + 1;
  }

  /**
   * Get the next smaller dice type, or null if at d4
   * @param {string} currentDice - Current dice type (d4, d6, d8, d10, d12, d20)
   * @returns {string|null} Next smaller dice type or null if d4
   */
  static getSmallerDice(currentDice) {
    const index = this.DICE_PROGRESSION.indexOf(currentDice);

    if (index === -1) {
      console.warn(`Invalid dice type: ${currentDice}`);
      return null;
    }

    if (index === 0) {
      // Already at d4, can't go smaller
      return null;
    }

    return this.DICE_PROGRESSION[index - 1];
  }
}
