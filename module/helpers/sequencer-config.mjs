/**
 * SPELL FX CONFIGURATION
 * Edit this file to change animations. No logic here — just data.
 *
 * scaleMode:
 *   'radius'   → distFt is a radius  → display diameter = distFt × 2 × pxPerFt
 *   'length'   → distFt is a length  → display = distFt × pxPerFt  (cone, line)
 *   'diameter' → distFt is diameter  → display = distFt × pxPerFt  (cube)
 *   'fixed'    → always native size  → touch, glyph (small local effects)
 *   'chain'    → beam hops caster→T1→T2→T3 sequentially
 *   'multiray' → beams fan from caster to all targets simultaneously
 *
 * file: path to .webm animation (JB2A or custom).
 * Dimensions (nativeW/nativeH) and duration are read automatically from the video file at play time.
 * For JB2A Sequencer database paths, dimensions are parsed from the filename (_WxH.ext convention).
 */

export const SPELL_FX = {

  // ── Cast animations (play briefly on the caster token at cast moment) ──────
  // One per school. Leave file: "" to skip cast anim for that school.
  castAnims: {
    fire:     { file: "", scale: 1.5, sound: "", volume: 0.6 },
    cold:     { file: "", scale: 1.5, sound: "", volume: 0.6 },
    shock:    { file: "", scale: 1.5, sound: "", volume: 0.6 },
    acid:     { file: "", scale: 1.5, sound: "", volume: 0.6 },
    poison:   { file: "", scale: 1.5, sound: "", volume: 0.6 },
    blunt:    { file: "", scale: 1.5, sound: "", volume: 0.6 },
    lava:     { file: "", scale: 1.5, sound: "", volume: 0.6 },
    wind:     { file: "", scale: 1.5, sound: "", volume: 0.6 },
    nature:   { file: "", scale: 1.5, sound: "", volume: 0.6 },
    healing:  { file: "", scale: 1.5, sound: "", volume: 0.6 },
    necrotic: { file: "", scale: 1.5, sound: "", volume: 0.6 },
    psychic:  { file: "", scale: 1.5, sound: "", volume: 0.6 },
    arcane:   { file: "", scale: 1.5, sound: "", volume: 0.6 },
    shadow:   { file: "", scale: 1.5, sound: "", volume: 0.6 },
    radiant:  { file: "", scale: 1.5, sound: "", volume: 0.6 },
    earth:    { file: "", scale: 1.5, sound: "", volume: 0.6 },
    defense:  { file: "", scale: 1.5, sound: "", volume: 0.6 },
    genericlight: { file: "", scale: 1.5, sound: "", volume: 0.6 },
    genericdark:  { file: "", scale: 1.5, sound: "", volume: 0.6 },
  },

  // ── Area animations (play at the delivery location after cast anim) ─────────
  // Keyed by school → deliveryType. Leave file: "" to skip.
  areaAnims: {
    fire: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    cold: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    shock: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    acid: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    poison: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    blunt: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    lava: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    wind: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    nature: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    healing: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    necrotic: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    psychic: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    arcane: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    shadow: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    radiant: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    earth: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    defense: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    genericlight: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
    genericdark: {
      aura:   { file: "", scaleMode: 'radius', sound: "" },
      cone:   { file: "", scaleMode: 'length', sound: "" },
      sphere: { file: "", scaleMode: 'radius', sound: "" },
      line:   { file: "", scaleMode: 'length', sound: "" },
      cube:   { file: "", scaleMode: 'diameter', sound: "" },
      glyph:  { file: "", scaleMode: 'fixed', sound: "" },
      touch:  { file: "", scaleMode: 'fixed', sound: "" },
      imbue:  { file: "", scaleMode: 'chain', sound: "" },
      remote: { file: "", scaleMode: 'fixed', sound: "" },
    },
  },

};

// ── JB2A defaults ─────────────────────────────────────────────────────────────
// Loaded once at ready time when both Sequencer + JB2A are present.
// Access via getJB2ADefaults(); mutate via loadJB2ADefaults().

let _jb2aDefaults = null;

/** Return the cached JB2A defaults, or null if not yet loaded. */
export function getJB2ADefaults() {
  return _jb2aDefaults;
}

/**
 * Fetch JB2A defaults from the bundled JSON config file and cache them.
 * Safe to call multiple times — subsequent calls are no-ops once loaded.
 */
export async function loadJB2ADefaults() {
  if (_jb2aDefaults) return; // already loaded
  try {
    const resp = await fetch('systems/vagabond/assets/config/vagabond-default-spell-fx-config.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    _jb2aDefaults = await resp.json();
  } catch (err) {
    console.warn('Vagabond | Failed to load JB2A spell FX defaults:', err);
    _jb2aDefaults = null;
  }
}

