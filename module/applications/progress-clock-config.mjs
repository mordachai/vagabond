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
    tag: "form",
    window: {
      title: "VAGABOND.ProgressClock.ConfigDialog.Title",
      icon: "fas fa-cog",
      resizable: false
    },
    position: {
      width: 500,
      height: "auto"
    },
    actions: {
      save: ProgressClockConfig._onSave
    },
    form: {
      submitOnChange: false,
      closeOnSubmit: true,
      handler: ProgressClockConfig._onSubmit
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
        defaultPosition: defaultPosition,
        visible: true
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
        defaultPosition: data.defaultPosition,
        visible: data.visible
      };
      context.isNew = false;
    }

    context.segmentOptions = [4, 6, 8, 10, 12];
    context.sizeOptions = CONFIG.VAGABOND.clockSizes;
    context.positionOptions = CONFIG.VAGABOND.clockPositions;

    // Ownership configuration
    if (!this.#clockJournal) {
      // Default ownership for new clocks
      context.ownership = {
        users: game.users.map(user => ({
          user: user,
          level: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
          name: user.name,
          isGM: user.isGM
        })),
        defaultLevel: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER
      };
    } else {
      context.ownership = {
        users: game.users.map(user => ({
          user: user,
          level: this.#clockJournal.ownership[user.id] ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
          name: user.name,
          isGM: user.isGM
        })),
        defaultLevel: this.#clockJournal.ownership.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE
      };
    }

    return context;
  }

  /**
   * Handle form submission
   */
  static async _onSubmit(event, form, formData) {
    const expandedData = foundry.utils.expandObject(formData.object);

    // Determine final size value
    let finalSize = expandedData.size;
    if (finalSize === 'custom' && expandedData.customSize) {
      finalSize = parseInt(expandedData.customSize);
    }

    // Build ownership object
    const ownership = { default: parseInt(expandedData.ownership.default) };
    if (expandedData.ownership.users) {
      for (const [userId, level] of Object.entries(expandedData.ownership.users)) {
        ownership[userId] = parseInt(level);
      }
    }

    // Check if creating new clock or updating existing
    if (!this.#clockJournal) {
      // Create new clock
      await ProgressClock.create({
        name: expandedData.name,
        segments: parseInt(expandedData.segments),
        size: finalSize,
        defaultPosition: expandedData.defaultPosition,
        visible: expandedData.visible === true || expandedData.visible === 'on',
        ownership: ownership
      });
    } else {
      // Update the journal
      await this.#clockJournal.update({
        name: expandedData.name,
        ownership: ownership,
        "flags.vagabond.progressClock.segments": parseInt(expandedData.segments),
        "flags.vagabond.progressClock.size": finalSize,
        "flags.vagabond.progressClock.defaultPosition": expandedData.defaultPosition,
        "flags.vagabond.progressClock.visible": expandedData.visible === true || expandedData.visible === 'on'
      });
    }

    return this.close();
  }

  /**
   * Handle save button click
   */
  static async _onSave(event, target) {
    // Form submission is handled by the form handler
    const form = this.element.querySelector('form');
    form.requestSubmit();
  }
}
