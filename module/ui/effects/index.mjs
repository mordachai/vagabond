/**
 * Dynamic token ring effects registry.
 *
 * Add a new effect: create `module/ui/effects/<id>.mjs` exporting a descriptor
 * ({ id, bit, label, region, state, helpers?, apply }), then import it and add it to
 * EFFECTS below. The shader, status map, effect-bit patching and status wiring are all
 * derived automatically. See `_builder.mjs` for the descriptor contract and the three
 * ring surfaces (bands / frame / background).
 *
 * Effect bits: core uses up to 0x20; ours start at 0x40 and double per effect.
 */

import { buildRingShaderClass, buildStatusMap, installStatusRingEffects as _install } from './_builder.mjs';
import focusing from './focusing.mjs';
import burning from './burning.mjs';
import sickened from './sickened.mjs';
import charmed from './charmed.mjs';

const EFFECTS = [focusing, burning, sickened, charmed];

/** The custom shader class assigned to ring configs (grit-metal + patched core rings). */
export const VagabondTokenRingShader = buildRingShaderClass(EFFECTS);

/** status id → { bit, label, region }. Used for getRingEffects + the effects-label registration. */
export const STATUS_RING_EFFECTS = buildStatusMap(EFFECTS);

/** Install bit patching + getRingEffects override + status-change refresh. Call once in `init`. */
export function installStatusRingEffects() {
  return _install(STATUS_RING_EFFECTS);
}
