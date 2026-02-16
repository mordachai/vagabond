import { ProgressClock } from '../documents/progress-clock.mjs';

const { api } = foundry.applications;

/**
 * Delete dialog for Progress Clocks
 * Shows list of all clocks with delete buttons
 * Uses ApplicationV2 with HandlebarsApplicationMixin (V13 pattern)
 */
export class ProgressClockDeleteDialog extends api.HandlebarsApplicationMixin(
  api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "progress-clock-delete-dialog",
    classes: ["vagabond", "progress-clock-delete"],
    tag: "div",
    window: {
      title: "VAGABOND.ProgressClock.DeleteDialog.Title",
      icon: "fas fa-trash",
      resizable: false
    },
    position: {
      width: 400,
      height: "auto"
    },
    actions: {
      deleteClock: ProgressClockDeleteDialog._onDelete
    }
  };

  static PARTS = {
    content: {
      template: "systems/vagabond/templates/clocks/delete-dialog.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get all clocks and prepare display data
    context.clocks = ProgressClock.getAll().map(clock => {
      const data = clock.flags.vagabond.progressClock;
      return {
        id: clock.id,
        name: clock.name,
        segments: data.segments,
        filled: data.filled
      };
    });

    return context;
  }

  /**
   * Handle delete button click
   */
  static async _onDelete(event, target) {
    const clockId = target.dataset.clockId;
    const clock = game.journal.get(clockId);

    if (!clock) {
      ui.notifications.error(game.i18n.localize("VAGABOND.ProgressClock.DeleteDialog.NotFound"));
      return;
    }

    // Confirm deletion
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("VAGABOND.ProgressClock.DeleteDialog.ConfirmTitle") },
      content: game.i18n.format("VAGABOND.ProgressClock.DeleteDialog.ConfirmMessage", {
        name: clock.name
      })
    });

    if (!confirmed) return;

    // Delete the clock
    await clock.delete();

    // Refresh the dialog to show updated list
    this.render();
  }
}
