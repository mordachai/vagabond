import { isTrainingComplete } from './skills-step-manager.mjs';

/**
 * Step gating — which builder tabs are revealed.
 *
 * Steps unlock one at a time in order (Ancestry → Class → Stats → Skills → Spells → Perks): a step
 * opens only once every step before it is done AND the player has reached the step right before it
 * (`state.furthestStep`, advanced by Next / tab clicks). Starting Packs and Gear are the closing pair:
 * they open together once Perks is reached, and so does the Finish button.
 *
 * Pure functions of the builder state, shared by the tab bar, tab clicks and the Finish button.
 */

export const DEFAULT_STEP_ORDER = ['ancestry', 'class', 'stats', 'skills', 'spells', 'perks', 'starting-packs', 'gear'];

/** Revealed together; the first one is the gate for the whole group. */
const CLOSING_STEPS = ['starting-packs', 'gear'];

/**
 * Whether a step's required choices are made (optional steps are always done).
 * @param {string} stepName
 * @param {object} state
 * @returns {boolean}
 */
export function isStepDone(stepName, state) {
  switch (stepName) {
    case 'ancestry':
      return !!state.selectedAncestry;
    case 'class':
      return !!state.selectedClass;
    case 'stats': {
      const stats = state.assignedStats || {};
      const statKeys = Object.keys(CONFIG.VAGABOND.stats ?? {});
      const keys = statKeys.length ? statKeys : ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck'];
      if (!keys.every(s => stats[s] !== null && stats[s] !== undefined)) return false;
      return Object.keys(state.appliedBonuses || {}).length >= (state.bonusStatsCount || 0);
    }
    case 'skills':
      return isTrainingComplete(state);
    case 'spells': {
      const spellLimit = state.spellLimit || 0;
      return spellLimit === 0 || (state.spells || []).length === spellLimit;
    }
    default:
      return true;
  }
}

/**
 * Whether a step's tab is revealed.
 * @param {string} stepName
 * @param {object} state
 * @param {string[]} [order]
 * @returns {boolean}
 */
export function isStepUnlocked(stepName, state, order = DEFAULT_STEP_ORDER) {
  // The closing pair shares the gate of its first step present in the order
  const gateStep = CLOSING_STEPS.includes(stepName)
    ? (CLOSING_STEPS.find(s => order.includes(s)) ?? stepName)
    : stepName;
  const idx = order.indexOf(gateStep);
  if (idx <= 0) return idx === 0;

  for (let i = 0; i < idx; i++) {
    if (!isStepDone(order[i], state)) return false;
  }
  // The step right before must have been reached
  return furthestIndex(state, order) >= idx - 1;
}

/**
 * Finish is available once the closing steps are revealed.
 * @param {object} state
 * @param {string[]} [order]
 * @returns {boolean}
 */
export function canFinishBuild(state, order = DEFAULT_STEP_ORDER) {
  const closing = CLOSING_STEPS.find(s => order.includes(s));
  return closing ? isStepUnlocked(closing, state, order) : order.every(s => isStepDone(s, state));
}

/**
 * The furthest step after moving to `stepName` (never moves backwards).
 * @param {object} state
 * @param {string} stepName
 * @param {string[]} [order]
 * @returns {string}
 */
export function furthestAfter(state, stepName, order = DEFAULT_STEP_ORDER) {
  return order.indexOf(stepName) > furthestIndex(state, order) ? stepName : (state.furthestStep || order[0]);
}

function furthestIndex(state, order) {
  return Math.max(0, order.indexOf(state.furthestStep), order.indexOf(state.currentStep));
}
