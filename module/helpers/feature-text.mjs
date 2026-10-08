/**
 * Book text of one of the actor's class features, for chat cards.
 *
 * Feature names are translated (Babele), so a bare `f.name === 'Momentum'` finds nothing on a translated
 * class. A feature with a button is found by its action command (`system:fighter.momentum`), which no
 * translation touches; the name (exact or "Name (…)" prefix) is only the fallback for features without one.
 * A feature with neither a button nor a stable name can pass `lastAtLevel` (the last feature authored at that
 * Level) as a last resort.
 *
 * @param {Actor} actor
 * @param {{command?: string, name?: string, lastAtLevel?: number}} key
 * @returns {string} the feature description, or ''
 */
export function classFeatureText(actor, { command, name, lastAtLevel } = {}) {
  const features = actor?.items?.find(i => i.type === 'class')?.system?.levelFeatures ?? [];
  const hit = (command && features.find(f => f.action?.command === `system:${command}`))
    ?? (name && features.find(f => f.name === name || f.name.startsWith(`${name} (`)))
    ?? (lastAtLevel != null && features.filter(f => f.level === lastAtLevel).at(-1));
  return hit?.description ?? '';
}
