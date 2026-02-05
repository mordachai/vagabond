/**
 * Compendium Settings Dialog (ApplicationV2)
 *
 * Allows GMs to select which Item compendiums should be available in the Character Builder.
 */

export class CompendiumSettings extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: 'compendium-settings',
    classes: ['vagabond', 'compendium-settings'],
    tag: 'form',
    window: {
      title: 'Character Builder Compendium Settings',
      icon: 'fas fa-books',
      resizable: true
    },
    position: {
      width: 800,
      height: 'auto'
    },
    form: {
      handler: CompendiumSettings.#onSubmit,
      closeOnSubmit: true
    },
    actions: {
      reset: CompendiumSettings.#onReset,
      toggleUseAll: CompendiumSettings.#onToggleUseAll,
      selectAll: CompendiumSettings.#onSelectAll,
      deselectAll: CompendiumSettings.#onDeselectAll,
      selectSystem: CompendiumSettings.#onSelectSystem,
      selectWorld: CompendiumSettings.#onSelectWorld,
      selectModules: CompendiumSettings.#onSelectModules
    }
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/apps/compendium-settings.hbs'
    }
  };

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    // Get all Item compendiums
    const itemCompendiums = Array.from(game.packs)
      .filter(pack => pack.documentName === 'Item')
      .map(pack => ({
        id: pack.collection,
        title: pack.title || pack.collection,
        source: this.#getPackageLabel(pack),
        packageType: pack.metadata.packageType,
        packageName: pack.metadata.packageName || pack.metadata.id,
        indexed: pack.indexed,
        size: pack.index?.size || 0
      }))
      .sort((a, b) => {
        // Sort by: system first, then world, then modules, then alphabetically
        const sourceOrder = { system: 0, world: 1, module: 2 };
        const sourceCompare = sourceOrder[a.packageType] - sourceOrder[b.packageType];
        if (sourceCompare !== 0) return sourceCompare;
        return a.title.localeCompare(b.title);
      });

    // Get current setting
    const currentSettings = game.settings.get('vagabond', 'characterBuilderCompendiums');
    const selectedCompendiums = currentSettings.enabled || [];
    const useAllCompendiums = currentSettings.useAll !== false; // Default to true

    // Debug log
    console.log('Compendium Settings Loaded:', {
      useAll: currentSettings.useAll,
      useAllCompendiums: useAllCompendiums,
      selectedCompendiums: selectedCompendiums,
      selectedCount: selectedCompendiums.length
    });

    // Mark which are selected
    for (const pack of itemCompendiums) {
      pack.selected = useAllCompendiums || selectedCompendiums.includes(pack.id);
    }

    // Group by source
    const grouped = {
      system: itemCompendiums.filter(p => p.packageType === 'system'),
      world: itemCompendiums.filter(p => p.packageType === 'world'),
      module: itemCompendiums.filter(p => !['system', 'world'].includes(p.packageType))
    };

    context.compendiums = itemCompendiums;
    context.grouped = grouped;
    context.useAllCompendiums = useAllCompendiums;
    context.totalCompendiums = itemCompendiums.length;
    context.systemCount = grouped.system.length;
    context.worldCount = grouped.world.length;
    context.moduleCount = grouped.module.length;
    context.selectedCount = useAllCompendiums ? itemCompendiums.length : selectedCompendiums.length;

    return context;
  }

  #getPackageLabel(pack) {
    const type = pack.metadata.packageType;
    const name = pack.metadata.packageName || pack.metadata.id;

    if (type === 'system') return name;
    if (type === 'world') return 'World';
    return name;
  }

  /* -------------------------------------------- */
  /*  Lifecycle Methods                           */
  /* -------------------------------------------- */

  _onRender(context, options) {
    super._onRender(context, options);

    // Attach change listeners to individual checkboxes
    const form = this.element;
    const useAllCheckbox = form.querySelector('#use-all-compendiums');
    const checkboxes = form.querySelectorAll('.compendium-checkbox');

    // Only add listeners if Use All is not checked
    if (!useAllCheckbox.checked) {
      checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
          CompendiumSettings.#updateSelectedCount(form);
        });
      });
    }
  }

  /* -------------------------------------------- */
  /*  Event Handlers                              */
  /* -------------------------------------------- */

  static async #onSubmit(event, form, formData) {
    // Debug: log raw form data
    console.log('Raw formData.object:', formData.object);

    // Check if "use all" is enabled (convert to proper boolean)
    const useAll = !!formData.object.useAll;

    // Manually extract compendium selections (don't use expandObject - it breaks with dots in IDs)
    const selectedCompendiums = [];
    for (const [key, value] of Object.entries(formData.object)) {
      // Match pattern: compendiums[id]
      const match = key.match(/^compendiums\[(.+)\]$/);
      if (match && value) {
        selectedCompendiums.push(match[1]);
      }
    }

    // Save the setting
    const setting = {
      useAll: useAll,
      enabled: selectedCompendiums
    };

    console.log('Compendium Settings Saved:', setting);

    await game.settings.set('vagabond', 'characterBuilderCompendiums', setting);

    // Clear character builder cache so it reloads compendiums with new settings
    // Find any open character builder instances and clear their caches
    for (const app of Object.values(ui.windows)) {
      if (app.constructor.name === 'VagabondCharBuilder' && app.dataService) {
        app.dataService.clearCache();
        console.log('Character Builder cache cleared for app:', app.id);

        // Also re-render the character builder to show updated compendiums
        app.render(false);
      }
    }

    ui.notifications.info('Compendium settings saved! Character builder will use these compendiums.');
  }

  static async #onReset(event, target) {
    const confirmed = await Dialog.confirm({
      title: 'Reset to Default?',
      content: '<p>This will reset compendium settings to default (use all compendiums).</p>',
      yes: () => true,
      no: () => false
    });

    if (confirmed) {
      await game.settings.set('vagabond', 'characterBuilderCompendiums', {
        useAll: true,
        enabled: []
      });

      // Get the application instance from the target
      const app = ui.windows[this.DEFAULT_OPTIONS.id];
      if (app) {
        app.render();
      }

      ui.notifications.info('Compendium settings reset to default.');
    }
  }

  static #onToggleUseAll(event, target) {
    const form = target.closest('form');
    const useAll = target.checked;
    const checkboxes = form.querySelectorAll('.compendium-checkbox');

    // Disable/enable individual checkboxes
    checkboxes.forEach(cb => {
      cb.disabled = useAll;
      if (useAll) {
        cb.checked = true;
      }
    });

    // Add change listeners to individual checkboxes if they don't have them
    if (!useAll) {
      checkboxes.forEach(cb => {
        if (!cb.dataset.hasListener) {
          cb.addEventListener('change', () => {
            CompendiumSettings.#updateSelectedCount(form);
          });
          cb.dataset.hasListener = 'true';
        }
      });
    }

    // Update selected count
    CompendiumSettings.#updateSelectedCount(form);
  }

  static #onSelectAll(event, target) {
    const form = target.closest('form');
    const useAllCheckbox = form.querySelector('#use-all-compendiums');
    const checkboxes = form.querySelectorAll('.compendium-checkbox');

    useAllCheckbox.checked = false;
    checkboxes.forEach(cb => {
      cb.disabled = false;
      cb.checked = true;
    });

    CompendiumSettings.#updateSelectedCount(form);
  }

  static #onDeselectAll(event, target) {
    const form = target.closest('form');
    const useAllCheckbox = form.querySelector('#use-all-compendiums');
    const checkboxes = form.querySelectorAll('.compendium-checkbox');

    useAllCheckbox.checked = false;
    checkboxes.forEach(cb => {
      cb.disabled = false;
      cb.checked = false;
    });

    CompendiumSettings.#updateSelectedCount(form);
  }

  static #onSelectSystem(event, target) {
    const form = target.closest('form');
    const checkboxes = form.querySelectorAll('.compendium-checkbox[data-source="system"]');

    checkboxes.forEach(cb => cb.checked = true);
    CompendiumSettings.#updateSelectedCount(form);
  }

  static #onSelectWorld(event, target) {
    const form = target.closest('form');
    const checkboxes = form.querySelectorAll('.compendium-checkbox[data-source="world"]');

    checkboxes.forEach(cb => cb.checked = true);
    CompendiumSettings.#updateSelectedCount(form);
  }

  static #onSelectModules(event, target) {
    const form = target.closest('form');
    const checkboxes = form.querySelectorAll('.compendium-checkbox[data-source="module"]');

    checkboxes.forEach(cb => cb.checked = true);
    CompendiumSettings.#updateSelectedCount(form);
  }

  static #updateSelectedCount(form) {
    const useAll = form.querySelector('#use-all-compendiums').checked;
    const total = form.querySelectorAll('.compendium-checkbox').length;
    const selected = useAll ? total : form.querySelectorAll('.compendium-checkbox:checked').length;

    const counter = form.querySelector('.selected-count');
    if (counter) {
      counter.textContent = `${selected} / ${total} compendiums selected`;
    }
  }
}
