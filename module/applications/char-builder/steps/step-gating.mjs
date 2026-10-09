import { isTrainingComplete } from './training-manager.mjs';

/**
 * Step gating — which builder tabs are revealed.
 *
 * Steps unlock one at a time in order (Ancestry → Class → Stats (+ Training) → Spells → Alchemy → Perks): a step
 * opens only once every step before it is done AND the player has reached the step right before it
 * (`state.furthestStep`, advanced by Next / tab clicks). Starting Packs and Gear are the closing pair:
 * they open together once Perks is reached, and so does the Finish button.
 *
 * A step can also be absent for this build: Alchemy exists only when the chosen Class grants formulae
 * (`state.formulaLimit`). Absent steps get no tab and are skipped by Next / Previous (`applicableSteps`).
 *
 * Pure functions of the builder state, shared by the tab bar, tab clicks and the Finish button.
 */

export const DEFAULT_STEP_ORDER = ['ancestry', 'class', 'stats', 'spells', 'alchemy', 'perks', 'starting-packs', 'gear'];

/** Revealed together; the first one is the gate for the whole group. */
const CLOSING_STEPS = ['starting-packs', 'gear'];

/**
 * Whether a step exists for this build (Alchemy only for a Class with formula picks).
 * @param {string} stepName
 * @param {object} state
 * @returns {boolean}
 */
export function isStepApplicable(stepName, state) {
  if (stepName === 'alchemy') return (state?.formulaLimit || 0) > 0;
  return true;
}

/**
 * The step order without the steps absent from this build.
 * @param {object} state
 * @param {string[]} [order]
 * @returns {string[]}
 */
export function applicableSteps(state, order = DEFAULT_STEP_ORDER) {
  return order.filter(s => isStepApplicable(s, state));
}

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
      if (Object.keys(state.appliedBonuses || {}).length < (state.bonusStatsCount || 0)) return false;
      return isTrainingComplete(state); // Training is assigned on the Stats step
    }
    case 'spells': {
      const spellLimit = state.spellLimit || 0;
      return spellLimit === 0 || (state.spells || []).length === spellLimit;
    }
    case 'alchemy':
      return (state.formulas || []).length >= (state.formulaLimit || 0);
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
  if (!isStepApplicable(stepName, state)) return false;
  const steps = applicableSteps(state, order);
  // The closing pair shares the gate of its first step present in the order
  const gateStep = CLOSING_STEPS.includes(stepName)
    ? (CLOSING_STEPS.find(s => steps.includes(s)) ?? stepName)
    : stepName;
  const idx = steps.indexOf(gateStep);
  if (idx <= 0) return idx === 0;

  for (let i = 0; i < idx; i++) {
    if (!isStepDone(steps[i], state)) return false;
  }
  // The step right before must have been reached (indices in `order`, so a skipped step never blocks)
  return furthestIndex(state, order) >= order.indexOf(steps[idx - 1]);
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
