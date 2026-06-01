/**
 * Progress Clock helper class for managing clock journals
 * Clocks are stored as JournalEntry documents with custom flags
 */
export class ProgressClock {
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
   * Create a new progress clock
   * @param {Object} data - Clock configuration data
   * @param {string} data.name - Clock name (default: "New Clock")
   * @param {number} data.segments - Number of segments (4, 6, 8, 10, or 12)
   * @param {string} data.size - Size preset ("S", "M", "L") or custom pixel value
   * @param {string} data.defaultPosition - Corner position ("top-right", "top-left", etc.)
   * @param {Object} data.ownership - Ownership configuration
   * @returns {Promise<JournalEntry>} The created clock journal
   */
  static async create(data = {}) {
    const defaultPosition = game.settings.get('vagabond', 'defaultClockPosition') || 'top-right';
    const folder = await this.getOrCreateFolder();

    const journalData = {
      name: data.name || "New Clock",
      folder: folder.id,
      flags: {
        vagabond: {
          progressClock: {
            type: "progressClock",
            // Stable cross-reference key for macros, formulas (@clocks.<handle>.value), and sheets
            handle: data.handle || this.slugify(data.name || "New Clock"),
            // kind: "clock" (segmented pie) or "tracker" (static bg, free counter)
            kind: data.kind || "clock",
            segments: data.segments || 4,
            // Clocks start full (GMs mostly tick down); trackers start at zero
            filled: data.kind === "tracker"
              ? (data.filled ?? 0)
              : (data.filled ?? (data.segments || 4)),
            defaultPosition: data.defaultPosition || defaultPosition,
            size: data.size || "M",
            faded: data.faded || false,
            // Scene attachment: null = global (all scenes), else only that scene
            sceneId: data.sceneId || null,
            hidden: false,
            // Optional generic data binding (see resolveSource/syncBound). Absent ⇒ manual.
            source: data.source || { mode: "manual", ref: "", valuePath: "", maxPath: "", expr: "", syncMax: true },
            positions: {}
          }
        }
      }
    };

    if (data.ownership) {
      journalData.ownership = data.ownership;
    }

    const journal = await JournalEntry.create(journalData);

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
   * @param {string} sceneId - Scene ID to filter by (defaults to current scene)
   * @returns {JournalEntry[]} Clocks that have been positioned on this scene
   */
  static getForScene(sceneId) {
    if (!sceneId) sceneId = canvas.scene?.id;
    if (!sceneId) return [];

    return this.getAll().filter(clock => {
      const data = clock.flags.vagabond.progressClock;

      // Check permissions - user must have at least LIMITED (can view) permission
      // This replaces the old "visible" flag - if user has permission, they can see it
      if (!clock.testUserPermission(game.user, 'LIMITED')) return false;

      // Hidden clocks are removed from view but remain in the Journal sidebar
      if (data.hidden) return false;

      // Scene attachment: blank/null = global (all scenes); otherwise show only on its scene
      if (data.sceneId && data.sceneId !== sceneId) return false;

      return true;
    });
  }

  /**
   * Get the SVG path for a clock with specific segments and filled amount
   * @param {number} segments - Number of segments (4, 6, 8, 10, or 12)
   * @param {number} filled - Number of filled segments
   * @returns {string} Path to SVG file
   */
  static getSVGPath(segments, filled) {
    return `systems/vagabond/assets/ui/clocks/${segments}clock_${filled}.svg`;
  }

  /**
   * Get the SVG path for a tracker (static background, value-independent)
   * @returns {string} Path to the tracker SVG file
   */
  static getTrackerSVGPath() {
    return `systems/vagabond/assets/ui/clocks/tracker.svg`;
  }

  /**
   * Convert size preset to pixel value
   * @param {string|number} size - Size preset ("S", "M", "L") or pixel value
   * @returns {number} Size in pixels
   */
  static getClockSize(size) {
    if (typeof size === 'number') return size;
    const sizeMap = CONFIG.VAGABOND.clockSizes;
    return sizeMap[size] || sizeMap.M;
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
    const padding = 40; // Padding from screen edge

    // Calculate horizontal offset based on order
    const horizontalOffset = order * (pixelSize + margin);

    // Use screen dimensions, not canvas dimensions (for fixed UI positioning)
    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;

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

  /* -------------------------------------------- */
  /*  Cross-Reference: Handles, Read & Write API  */
  /* -------------------------------------------- */

  /**
   * Convert a name into a stable slug handle (lowercase, dash-separated).
   * @param {string} name - Source string
   * @returns {string} Slugified handle (e.g. "The Doom Clock" → "the-doom-clock")
   */
  static slugify(name) {
    // Underscores (not hyphens): handles are used in roll formulas as
    // @clocks.<handle>.value, and "-" would be parsed as subtraction.
    return String(name ?? "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "clock";
  }

  /**
   * Read the progressClock flag block from a journal.
   * @param {JournalEntry} journal
   * @returns {Object|null}
   * @private
   */
  static _flags(journal) {
    return journal?.flags?.vagabond?.progressClock ?? null;
  }

  /**
   * Resolve a clock reference to its JournalEntry.
   * Resolution order: explicit handle → journal id → exact name → name-slug fallback.
   * The name-slug fallback lets legacy clocks (created before handles existed) resolve too.
   * @param {string|JournalEntry} ref - Handle, journal id, name, or the JournalEntry itself
   * @returns {JournalEntry|null}
   */
  static get(ref) {
    if (!ref) return null;
    if (ref instanceof JournalEntry) return ref;
    const clocks = this.getAll();

    // 1. explicit handle
    let hit = clocks.find(c => this._flags(c)?.handle === ref);
    if (hit) return hit;

    // 2. journal id
    hit = clocks.find(c => c.id === ref);
    if (hit) return hit;

    // 3. exact name
    hit = clocks.find(c => c.name === ref);
    if (hit) return hit;

    // 4. name-slug fallback (legacy clocks without a handle)
    const slug = this.slugify(ref);
    return clocks.find(c => this.slugify(c.name) === slug) ?? null;
  }

  /**
   * Read a clock's current data snapshot.
   * @param {string|JournalEntry} ref
   * @returns {{name:string, handle:string, kind:string, value:number, filled:number, max:number, segments:number, pct:number}|null}
   */
  static read(ref) {
    const journal = this.get(ref);
    const data = this._flags(journal);
    if (!data) return null;
    const segments = data.segments ?? 0;
    const filled = data.filled ?? 0;
    return {
      name: journal.name,
      handle: data.handle ?? this.slugify(journal.name),
      kind: data.kind ?? "clock",
      value: filled,
      filled,
      max: segments,
      segments,
      pct: segments > 0 ? filled / segments : 0
    };
  }

  /**
   * Convenience: read only the current value (filled segments).
   * @param {string|JournalEntry} ref
   * @returns {number|null}
   */
  static value(ref) {
    return this.read(ref)?.value ?? null;
  }

  /**
   * Build a map of every clock keyed by handle, for injection into roll data.
   * Enables @clocks.<handle>.value in bonus formulas and roll-builder.
   * @returns {Object<string, {value:number, filled:number, max:number, segments:number, pct:number}>}
   */
  static rollDataMap() {
    const map = {};
    // getRollData() can run during early data prep, before game.journal exists
    if (!game?.journal) return map;
    for (const journal of this.getAll()) {
      const data = this._flags(journal);
      if (!data) continue;
      const handle = data.handle ?? this.slugify(journal.name);
      const segments = data.segments ?? 0;
      const filled = data.filled ?? 0;
      map[handle] = {
        value: filled,
        filled,
        max: segments,
        segments,
        pct: segments > 0 ? filled / segments : 0
      };
    }
    return map;
  }

  /**
   * Guard write operations to GMs only.
   * @returns {boolean} true if the current user may write
   * @private
   */
  static _assertGM() {
    if (game.user?.isGM) return true;
    ui.notifications?.warn("Only the GM can modify progress clocks.");
    return false;
  }

  /**
   * Set a clock's filled value (GM only). Clamped to 0..segments.
   * @param {string|JournalEntry} ref
   * @param {number} n
   * @returns {Promise<JournalEntry|null>}
   */
  static async set(ref, n) {
    if (!this._assertGM()) return null;
    const journal = this.get(ref);
    const data = this._flags(journal);
    if (!data) {
      ui.notifications?.warn(`No progress clock found for "${ref}".`);
      return null;
    }
    const n2 = Math.round(Number(n) || 0);
    // Trackers are unbounded (free counter); clocks clamp to [0, segments]
    const value = data.kind === "tracker" ? n2 : Math.clamp(n2, 0, data.segments ?? 0);
    await journal.update({ "flags.vagabond.progressClock.filled": value });
    return journal;
  }

  /**
   * Add (or subtract, with negative delta) segments to a clock (GM only).
   * @param {string|JournalEntry} ref
   * @param {number} [delta=1]
   * @returns {Promise<JournalEntry|null>}
   */
  static async tick(ref, delta = 1) {
    const current = this.value(ref);
    if (current === null) {
      ui.notifications?.warn(`No progress clock found for "${ref}".`);
      return null;
    }
    return this.set(ref, current + delta);
  }

  /**
   * Fill a clock completely (GM only).
   * @param {string|JournalEntry} ref
   * @returns {Promise<JournalEntry|null>}
   */
  static async fill(ref) {
    const data = this._flags(this.get(ref));
    if (!data) return null;
    return this.set(ref, data.segments ?? 0);
  }

  /**
   * Empty a clock to zero (GM only).
   * @param {string|JournalEntry} ref
   * @returns {Promise<JournalEntry|null>}
   */
  static async empty(ref) {
    return this.set(ref, 0);
  }

  /**
   * Reset a clock to its kind default: trackers → 0, clocks → full (GM only).
   * @param {string|JournalEntry} ref
   * @returns {Promise<JournalEntry|null>}
   */
  static async reset(ref) {
    const data = this._flags(this.get(ref));
    if (!data) return null;
    return this.set(ref, data.kind === "tracker" ? 0 : (data.segments ?? 0));
  }

  /* -------------------------------------------- */
  /*  Generic Data Binding (source → clock)       */
  /* -------------------------------------------- */

  /**
   * Resolve a clock's bound source to a current { value, max } snapshot.
   * Modes: "manual" (no binding), "path" (read a dot-path off a linked document),
   * "expr" (evaluate a roll formula that may reference @clocks.<handle>.value).
   * Returns null when there is no usable binding (manual, dangling ref, missing path…),
   * which simply means "leave this clock alone".
   * @param {JournalEntry} journal
   * @returns {{value:number, max:number}|null}
   */
  static resolveSource(journal) {
    const pc = this._flags(journal);
    const src = pc?.source;
    if (!src || !src.mode || src.mode === "manual") return null;

    // Formula mode: evaluate with the clocks roll-data map injected.
    if (src.mode === "expr") {
      if (!src.expr) return null;
      try {
        const formula = Roll.replaceFormulaData(src.expr, { clocks: this.rollDataMap() });
        const total = Roll.safeEval(formula);
        return Number.isFinite(total) ? { value: Number(total), max: pc.segments ?? 0 } : null;
      } catch {
        return null;
      }
    }

    // Path mode: read a dot-path off any linked document.
    if (src.mode === "path") {
      if (!src.ref || !src.valuePath) return null;
      const doc = fromUuidSync(src.ref);
      if (!doc) return null;
      // A TokenDocument binds to its (delta-applied) actor so "system.*" works for
      // unlinked tokens too. Everything else (Actor, Item, JournalEntry) reads itself.
      const target = doc.documentName === "Token" ? doc.actor : doc;
      if (!target) return null;

      const value = foundry.utils.getProperty(target, src.valuePath);
      if (value === undefined || value === null) return null;
      const max = src.maxPath
        ? Number(foundry.utils.getProperty(target, src.maxPath))
        : (pc.segments ?? 0);

      return { value: Number(value), max };
    }

    return null;
  }

  /**
   * Sync every bound clock from its source (GM-only, primary GM only to avoid
   * duplicate writes when several GMs are connected). Idempotent: skips writes
   * when nothing changed. Triggered by the binding hooks below.
   * @returns {Promise<void>}
   */
  static async syncBound() {
    if (!game?.ready) return;
    // Only the primary active GM performs writes; others just redraw from the update.
    if (game.user !== game.users?.activeGM) return;

    for (const journal of this.getAll()) {
      const resolved = this.resolveSource(journal);
      if (!resolved) continue;
      const pc = this._flags(journal);

      // Resize segments to match the source max when syncMax is enabled.
      if (pc.source?.syncMax && Number.isFinite(resolved.max) && resolved.max > 0
          && resolved.max !== pc.segments) {
        await journal.update({ "flags.vagabond.progressClock.segments": resolved.max });
      }

      // Only write when the value actually changed (set() clamps + redraws via hook).
      if (Number.isFinite(resolved.value) && resolved.value !== pc.filled) {
        await this.set(pc.handle, resolved.value);
      }
    }
  }

  /**
   * Register the reactive binding hooks once. Called at module load. A single
   * debounced fan-in covers every bound clock because bindings are just property
   * reads — no per-source-type wiring. set()/journal.update fire updateJournalEntry
   * (handled in vagabond.mjs to redraw the overlay), never updateActor/updateItem,
   * so syncing can't feed back into these hooks.
   */
  static registerBindingHooks() {
    if (this.#hooksRegistered) return;
    this.#hooksRegistered = true;
    const sync = foundry.utils.debounce(() => this.syncBound(), 100);
    Hooks.on("updateActor", sync);   // actor system.* paths, token-bound actor delta
    Hooks.on("updateToken", sync);   // token swap / actorLink change
    Hooks.on("updateItem", sync);    // item-bound paths, quantity edits
    Hooks.on("createItem", sync);
    Hooks.on("deleteItem", sync);
    Hooks.on("canvasReady", sync);   // resync on scene load
    Hooks.on("ready", sync);         // initial sync on world load
  }

  static #hooksRegistered = false;
}

// Self-register binding hooks at import time (vagabond.mjs imports this module).
ProgressClock.registerBindingHooks();
