import { GrantedItems } from '../../../helpers/granted-items.mjs';

/**
 * Item choices in the Character Builder — `itemChoices` grant groups (pick `count` of a `pool`, e.g. Draken's
 * Breath Attack element) shown as a card picker under the selected item's description
 * (`char-builder-parts/item-choices.hbs`, action `pickGrantItem`).
 *
 * State:
 *   - `itemChoiceGroups` — `[{key, source, count}]` of the current picks' owners (sync, for step gating)
 *   - `itemChoicePicks`  — `{ [group.key]: uuid[] }`
 * Group keys are `<source>-<row>-<group>` (GrantedItems.choiceGroupsFor), so each owner replaces only its own
 * groups / picks. Ancestry groups are set when the Ancestry is picked; a Class step can reuse `setGroups`.
 * Finish turns the picks into grant entries with `GrantedItems.entriesFromPicks`.
 */

/** Every group of `source` (all sources when omitted) has its picks. */
export function isItemChoiceComplete(state, source) {
  const picks = state.itemChoicePicks ?? {};
  return (state.itemChoiceGroups ?? [])
    .filter(g => !source || g.source === source)
    .every(g => (picks[g.key] ?? []).length >= g.count);
}

/**
 * Replace the groups (and drop the picks) of `source` with those of `owner`.
 * @param {object} stateManager
 * @param {Item|null} owner
 * @param {'ancestry'|'class'} source
 * @param {{randomize?: boolean}} [opts]  pick at random (Full Random / Randomize)
 */
export function setGroups(stateManager, owner, source, { randomize = false, ...filter } = {}) {
  const state = stateManager.getCurrentState();
  const groups = owner ? GrantedItems.choiceGroupsFor(owner, filter) : [];
  const picks = Object.fromEntries(
    Object.entries(state.itemChoicePicks ?? {}).filter(([key]) => !key.startsWith(`${source}-`))
  );
  if (randomize) {
    for (const g of groups) {
      const pool = [...g.pool];
      picks[g.key] = Array.from({ length: g.count }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
  }
  const kept = (state.itemChoiceGroups ?? []).filter(g => g.source !== source);
  stateManager.updateState('itemChoiceGroups', [...kept, ...groups.map(({ key, source, count }) => ({ key, source, count }))], { skipValidation: true });
  stateManager.updateState('itemChoicePicks', picks, { skipValidation: true });
}

/**
 * Click on a card: count 1 → that card becomes the pick; count > 1 → toggles it (up to count).
 * @returns {boolean} changed
 */
export function togglePick(stateManager, key, uuid) {
  const state = stateManager.getCurrentState();
  const group = (state.itemChoiceGroups ?? []).find(g => g.key === key);
  if (!group || !uuid) return false;
  const current = [...(state.itemChoicePicks?.[key] ?? [])];
  let next;
  if (group.count === 1) next = [uuid];
  else if (current.includes(uuid)) next = current.filter(u => u !== uuid);
  else if (current.length < group.count) next = [...current, uuid];
  else return false;
  stateManager.updateState('itemChoicePicks', { ...(state.itemChoicePicks ?? {}), [key]: next }, { skipValidation: true });
  return true;
}

/**
 * Template view of an owner's groups, for the picker under each trait / feature row (`index` = row).
 * Card names drop the prefix every option shares ("Breath Attack: Fire" → "Fire"); the full name is the tooltip.
 * @returns {Promise<Array<{key, index, ownLabel, count, picked, done, options: Array<{uuid, name, short, img, icon, picked}>}>>}
 */
export async function choicesView(owner, state, filter = {}) {
  const picks = state.itemChoicePicks ?? {};
  const out = [];
  for (const g of GrantedItems.choiceGroupsFor(owner, filter)) {
    const chosen = picks[g.key] ?? [];
    const opts = await GrantedItems.choiceOptions(g);
    const prefix = sharedPrefix(opts.map(o => o.name));
    const options = opts.map(o => ({
      ...o,
      short: o.name.slice(prefix.length) || o.name,
      icon: o.damageType ? CONFIG.VAGABOND.damageTypeIcons?.[o.damageType] ?? null : null,
      picked: chosen.includes(o.uuid),
    }));
    out.push({
      key: g.key, index: g.index, ownLabel: g.ownLabel, count: g.count,
      picked: chosen.length, done: chosen.length >= g.count, options,
    });
  }
  return out;
}

/** Rows with their choice groups attached as `choices` (picker under each trait / feature). */
export function attachChoices(rows, views) {
  return (rows ?? []).map((row, index) => ({ ...row, choices: views.filter(v => v.index === index) }));
}

/** Longest common prefix of the names, cut back to a separator (": ", " - ", " (", " "); '' if none. */
function sharedPrefix(names) {
  if (names.length < 2) return '';
  let p = names[0];
  for (const n of names) while (!n.startsWith(p)) p = p.slice(0, -1);
  const cut = p.match(/^.*(?::\s*|\s-\s*|\s\(|\s)/);
  return cut ? cut[0] : '';
}
