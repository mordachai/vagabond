/**
 * Shared HP-heart clicker for Vehicle Part cards (`.part-hp-clicker` inside a
 * `[data-part-id]` card — templates/construct/construct-part-card.hbs and
 * templates/party/vehicle-part-card.hbs).
 *
 * Left click −1, right click +1; Shift makes the step 10. Wired by whatever
 * sheet hosts the card, so any new host only has to call this once per render:
 *
 *   bindPartHpClickers(this.element, this.actor, signal);
 *
 * Parts are `vehiclePart` items owned by `actor`.
 */

const STEP = 1;
const SHIFT_STEP = 10;

/**
 * @param {HTMLElement} root       Element containing the part cards.
 * @param {Actor} actor            Actor that owns the part items.
 * @param {AbortSignal} signal     Same signal the host's _onRender controller uses.
 */
export function bindPartHpClickers(root, actor, signal) {
  const change = async (icon, direction, event) => {
    const partId = icon.closest('[data-part-id]')?.dataset.partId;
    const part = partId ? actor.items.get(partId) : null;
    if (!part) return;
    const { value, max } = part.system.health;
    const next = Math.clamp(value + direction * (event.shiftKey ? SHIFT_STEP : STEP), 0, max);
    if (next !== value) await part.update({ 'system.health.value': next });
  };

  for (const icon of root.querySelectorAll('.part-hp-clicker')) {
    icon.addEventListener('click', (event) => change(icon, -1, event), { signal });
    icon.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      change(icon, +1, event);
    }, { signal });
  }
}
