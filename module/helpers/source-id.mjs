/**
 * Compendium doc id an Item / Effect copy was made from (`_stats.compendiumSource`, legacy
 * `flags.core.sourceId`), or ''.
 *
 * Match copies by THIS, never by `name`: translated (Babele) worlds rename every Class, Perk, Spell,
 * Ancestry, feature and effect, so a `name === 'Deft Hands'` test silently fails there. The name is only
 * the fallback for hand-made copies that have no source.
 */
export function sourceDocId(doc) {
  const uuid = doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? '';
  return String(uuid).split('.').pop() ?? '';
}

/** Is `doc` a copy of the compendium document `id` (by source id), or — only without a source — named `name`? */
export function isCopyOf(doc, id, name) {
  const source = sourceDocId(doc);
  return source ? source === id : (!!name && doc?.name === name);
}
