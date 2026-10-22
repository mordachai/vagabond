import { VagabondActiveEffect } from '../documents/active-effect.mjs';

/**
 * Active Effect config sheet: attribute-key autocomplete and status datalists.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerActiveEffectConfigHooks() {
  /* -------------------------------------------- */

  /**
   * Inject attribute choices into the ActiveEffect configuration form.
   * This provides autocomplete for the "Attribute Key" field.
   */
  Hooks.on('renderActiveEffectConfig', (app, html, data) => {
    // Get attribute choices from the VagabondActiveEffect class
    const choices = VagabondActiveEffect.getAttributeChoices();

    // Create a unique datalist ID for this form
    const datalistId = `ae-attribute-choices-${app.document.id}`;

    // Convert html to HTMLElement if it's not already (handle both v11 and v13)
    const element = html instanceof HTMLElement ? html : html[0];
    if (!element) return;

    // Find all attribute key input fields (there can be multiple effect changes)
    const keyInputs = element.querySelectorAll('input[name*=".key"]');

    keyInputs.forEach(keyInput => {
      // Add datalist reference to the input
      keyInput.setAttribute('list', datalistId);
      keyInput.setAttribute('autocomplete', 'off');

      // Add a helpful title/placeholder
      if (!keyInput.getAttribute('placeholder')) {
        keyInput.setAttribute('placeholder', 'Start typing to see suggestions...');
      }
    });

    // Check if datalist already exists (to avoid duplicates)
    if (element.querySelector(`#${datalistId}`)) return;

    // Create the datalist element
    const datalist = document.createElement('datalist');
    datalist.id = datalistId;

    // Add all choices as options
    for (const [key, label] of Object.entries(choices)) {
      const option = document.createElement('option');
      option.value = key;
      option.label = label;
      option.textContent = label;
      datalist.appendChild(option);
    }

    // Append the datalist to the form
    const form = element.querySelector('form');
    if (form) {
      form.appendChild(datalist);
    } else {
      element.appendChild(datalist);
    }

    // Update the first attribute key hint to indicate autocomplete is available
    const firstKeyInput = element.querySelector('input[name="changes.0.key"]');
    if (firstKeyInput) {
      const formGroup = firstKeyInput.closest('.form-group');
      if (formGroup) {
        const hint = formGroup.querySelector('.hint, .notes');
        if (hint && !hint.dataset.updated) {
          hint.textContent = 'Start typing to see autocomplete suggestions for available system variables.';
          hint.dataset.updated = 'true';
        }
      }
    }
  });
}
