/**
 * NPC senses → Foundry token vision / detection modes.
 *
 * Pure data helper (no Foundry globals at module scope) so the compendium
 * conversion script and the runtime sync share one mapping.
 *
 * Range: omitted senses use `range: null`, which Foundry treats as unlimited.
 * A numeric range is only applied when the NPC's `sensesNote` gives one
 * (e.g. "Seismicsense 60'").
 */

/** Sense key → rulebook-label used when reading ranges back out of `sensesNote`. */
const SENSE_LABELS = {
  allsight: 'Allsight',
  blindsight: 'Blindsight',
  darksight: 'Darksight',
  echolocation: 'Echolocation',
  seismicsense: 'Seismicsense',
  telepathy: 'Telepathy',
};

/**
 * Sense key → Foundry detection mode ids. Darksight is the vision mode instead,
 * Telepathy has no Foundry equivalent.
 * - blindsight / echolocation: custom modes registered in the init hook (vagabond.mjs) — Sense All
 *   detection that respects walls and is not sight-type, so it works while Blinded
 * - See Invisibility: line-of-sight based, reveals Invisible tokens (Allsight)
 * - Feel Tremor: every grounded token at its elevation, skips Flying tokens (Seismicsense)
 * Sense All / Sense Invisibility are deliberately unused: they ignore walls.
 */
export const SENSE_DETECTION = {
  allsight: ['seeInvisibility'],
  blindsight: ['blindsight'],
  echolocation: ['echolocation'],
  seismicsense: ['feelTremor'],
  darksight: [],
  telepathy: [],
};

/** Detection modes this mapping owns (the only ones sync adds or removes). */
export const MANAGED_DETECTION_MODES = ['seeInvisibility', 'blindsight', 'echolocation', 'feelTremor'];

/** Modes earlier versions of this mapping wrote (Sense/See All were replaced by the custom modes); cleaned up on sync. */
const LEGACY_MANAGED_MODES = ['senseAll', 'seeAll'];

/**
 * Range for one sense from its note qualifier ("Seismicsense 60'", "... 60 feet").
 * @returns {number|null} feet, or null for unlimited
 */
function noteRange(key, note) {
  const match = String(note ?? '').match(new RegExp(`${SENSE_LABELS[key]}\\s*(\\d+(?:\\.\\d+)?)\\s*(?:'|ft|feet)`, 'i'));
  return match ? Number(match[1]) : null;
}

/**
 * Build the token data an NPC's senses imply.
 * @param {string[]} senses     keys of CONFIG.VAGABOND.senses
 * @param {string} [sensesNote] free-text qualifiers
 * @returns {{sight: object, detectionModes: object}|null} null when no sense maps to Foundry
 */
export function buildTokenSenseData(senses = [], sensesNote = '') {
  const darksight = senses.includes('darksight');
  const detectionModes = {};

  for (const key of senses) {
    const range = noteRange(key, sensesNote);
    for (const mode of SENSE_DETECTION[key] ?? []) {
      const existing = detectionModes[mode];
      // Two senses feeding one mode: unlimited (null) wins, else the larger range
      const merged = existing
        ? (existing.range === null || range === null ? null : Math.max(existing.range, range))
        : range;
      detectionModes[mode] = { enabled: true, range: merged };
    }
  }

  if (!darksight && !Object.keys(detectionModes).length) return null;

  return {
    sight: {
      enabled: true,
      // Darksight = see in darkness at unlimited range; otherwise normal sight (lit areas only)
      range: darksight ? noteRange('darksight', sensesNote) : 0,
      visionMode: darksight ? 'darkvision' : 'basic',
    },
    detectionModes,
  };
}

export class NpcSenses {
  /**
   * Flat update object for one token-shaped target (actor prototypeToken or a TokenDocument).
   * @param {string} prefix        '' for a TokenDocument, 'prototypeToken.' for the actor
   * @param {object} currentModes  that target's current detectionModes
   */
  static #buildUpdate(prefix, currentModes, data) {
    const update = {};
    update[`${prefix}sight.enabled`] = !!data;
    update[`${prefix}sight.range`] = data ? data.sight.range : 0;
    update[`${prefix}sight.visionMode`] = data ? data.sight.visionMode : 'basic';
    for (const mode of [...MANAGED_DETECTION_MODES, ...LEGACY_MANAGED_MODES]) {
      if (data?.detectionModes[mode]) update[`${prefix}detectionModes.${mode}`] = data.detectionModes[mode];
      else if (currentModes && mode in currentModes) update[`${prefix}detectionModes.-=${mode}`] = null;
    }
    return update;
  }

  /**
   * Push an NPC's senses onto its prototype token and its placed linked tokens.
   * Call from one GM client only.
   * @param {Actor} actor
   */
  static async syncActorTokens(actor) {
    const data = buildTokenSenseData(actor.system.senses ?? [], actor.system.sensesNote ?? '');
    await actor.update(this.#buildUpdate('prototypeToken.', actor.prototypeToken.detectionModes, data));
    for (const token of actor.getActiveTokens(false, true)) {
      if (!token.actorLink) continue;
      await token.update(this.#buildUpdate('', token._source.detectionModes, data));
    }
  }
}
