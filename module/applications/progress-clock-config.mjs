import { ProgressClock } from '../documents/progress-clock.mjs';

const { api } = foundry.applications;

/**
 * Configuration dialog for Progress Clocks
 * Uses ApplicationV2 with HandlebarsApplicationMixin (V13 pattern)
 */
export class ProgressClockConfig extends api.HandlebarsApplicationMixin(
  api.ApplicationV2
) {
  constructor(clockJournal, options = {}) {
    super(options);
    this.#clockJournal = clockJournal;
  }

  #clockJournal;

  static DEFAULT_OPTIONS = {
    id: "progress-clock-config-{id}",
    classes: ["vagabond", "progress-clock-config"],
    window: {
      title: "VAGABOND.ProgressClock.ConfigDialog.Title",
      icon: "fas fa-cog",
      resizable: false
    },
    position: {
      width: 500,
      height: "auto"
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true
    }
  };

  static PARTS = {
    form: {
      template: "systems/vagabond/templates/clocks/config.hbs"
    }
  };

  get title() {
    if (!this.#clockJournal) {
      return game.i18n.localize('VAGABOND.ProgressClock.Create');
    }
    return `Configure: ${this.#clockJournal.name}`;
  }

  /**
   * Attach event listeners after rendering
   * @override
   */
  _onRender(context, options) {
    super._onRender(context, options);

    // Attach form submit handler
    const form = this.element.querySelector('form');
    if (form) {
      form.addEventListener('submit', this._onFormSubmit.bind(this));
    }

    // Sync individual permissions when default permission changes
    const defaultPermissionSelect = this.element.querySelector('select[name="ownership.default"]');
    if (defaultPermissionSelect) {
      defaultPermissionSelect.addEventListener('change', (event) => {
        const newDefaultLevel = event.target.value;

        // Update all individual player permission dropdowns to match
        const individualSelects = this.element.querySelectorAll('select[name^="ownership.users."]');
        individualSelects.forEach(select => {
          select.value = newDefaultLevel;
        });
      });
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Handle creating new clock
    if (!this.#clockJournal) {
      const defaultPosition = game.settings.get('vagabond', 'defaultClockPosition') || 'top-right';
      context.clock = {
        id: null,
        name: 'New Clock',
        segments: 4,
        size: 'M',
        customSize: '',
        defaultPosition: defaultPosition
      };
      context.isNew = true;
    } else {
      const data = this.#clockJournal.flags.vagabond.progressClock;

      context.clock = {
        id: this.#clockJournal.id,
        name: this.#clockJournal.name,
        segments: data.segments,
        size: data.size,
        customSize: typeof data.size === 'number' ? data.size : '',
        defaultPosition: data.defaultPosition
      };
      context.isNew = false;
    }

    context.segmentOptions = [4, 6, 8, 10, 12];
    context.sizeOptions = CONFIG.VAGABOND.clockSizes;
    context.positionOptions = CONFIG.VAGABOND.clockPositions;

    // Ownership configuration
    if (!this.#clockJournal) {
      // Default ownership for new clocks
      const defaultLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
      context.ownership = {
        users: game.users.map(user => ({
          user: user,
          level: defaultLevel, // Initialize to match default
          name: user.name,
          isGM: user.isGM
        })),
        defaultLevel: defaultLevel
      };
    } else {
      // Existing clock - get saved default level
      const defaultLevel = this.#clockJournal.ownership.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
      context.ownership = {
        users: game.users.map(user => ({
          user: user,
          // Use individual override if exists, otherwise use default
          level: this.#clockJournal.ownership[user.id] ?? defaultLevel,
          name: user.name,
          isGM: user.isGM
        })),
        defaultLevel: defaultLevel
      };
    }

    return context;
  }

  /**
   * Handle form submission
   */
  async _onFormSubmit(event) {
    try {
      // Prevent default form submission
      event.preventDefault();
      event.stopPropagation();

      // Use native FormData and expand it manually
      const formData = new FormData(event.target);
      const formObject = {};

      for (const [key, value] of formData.entries()) {
        formObject[key] = value;
      }

      const expandedData = foundry.utils.expandObject(formObject);

      // Determine final size value
      let finalSize = expandedData.size;
      if (finalSize === 'custom' && expandedData.customSize) {
        finalSize = parseInt(expandedData.customSize);
      }

      // Build ownership object
      const defaultLevel = parseInt(expandedData.ownership.default);
      const ownership = { default: defaultLevel };

      // Get all non-GM users
      const players = game.users.filter(u => !u.isGM);

      // Set all players to the default level first
      for (const player of players) {
        ownership[player.id] = defaultLevel;
      }

      // Then apply individual overrides from the details section
      if (expandedData.ownership?.users) {
        for (const [userId, level] of Object.entries(expandedData.ownership.users)) {
          ownership[userId] = parseInt(level);
        }
      }

      // Ensure creator is always OWNER (only for new clocks)
      if (!this.#clockJournal) {
        ownership[game.user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
      }

      // Check if creating new clock or updating existing
      if (!this.#clockJournal) {
        // Create new clock
        await ProgressClock.create({
          name: expandedData.name,
          segments: parseInt(expandedData.segments),
          size: finalSize,
          defaultPosition: expandedData.defaultPosition,
          ownership: ownership
        });
      } else {
        // Update the journal
        await this.#clockJournal.update({
          name: expandedData.name,
          ownership: ownership,
          "flags.vagabond.progressClock.segments": parseInt(expandedData.segments),
          "flags.vagabond.progressClock.size": finalSize,
          "flags.vagabond.progressClock.defaultPosition": expandedData.defaultPosition
        });
      }

      // Close the dialog
      await this.close();
    } catch (error) {
      console.error('Error in _onSubmitForm:', error);
    }
  }
}
