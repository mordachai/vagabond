/**
 * SPELL FX CONFIGURATION
 * Edit this file to change animations. No logic here — just data.
 *
 * scaleMode:
 *   'radius'   → distFt is a radius  → display diameter = distFt × 2 × pxPerFt
 *   'length'   → distFt is a length  → display = distFt × pxPerFt  (cone, line)
 *   'diameter' → distFt is diameter  → display = distFt × pxPerFt  (cube)
 *   'fixed'    → always native size  → touch, glyph (small local effects)
 *
 * nativePx: the pixel width/height of the source animation at 1.0 scale
 * file: path to .webm animation (JB2A or custom)
 * duration: milliseconds
 */

export const SPELL_FX = {

  // ── Cast animations (play briefly on the caster token at cast moment) ──────
  // One per school. Leave file: "" to skip cast anim for that school.
  castAnims: {
    fire:     { file: "", scale: 1.5, duration: 600 },
    cold:     { file: "", scale: 1.5, duration: 600 },
    shock:    { file: "", scale: 1.5, duration: 600 },
    acid:     { file: "", scale: 1.5, duration: 600 },
    poison:   { file: "", scale: 1.5, duration: 600 },
    blunt:    { file: "", scale: 1.5, duration: 600 },
    lava:     { file: "", scale: 1.5, duration: 600 },
    wind:     { file: "", scale: 1.5, duration: 600 },
    nature:   { file: "", scale: 1.5, duration: 600 },
    healing:  { file: "", scale: 1.5, duration: 600 },
    necrotic: { file: "", scale: 1.5, duration: 600 },
    psychic:  { file: "", scale: 1.5, duration: 600 },
    arcane:   { file: "", scale: 1.5, duration: 600 },
    shadow:   { file: "", scale: 1.5, duration: 600 },
    radiant:  { file: "", scale: 1.5, duration: 600 },
    earth:    { file: "", scale: 1.5, duration: 600 },
    defense:  { file: "", scale: 1.5, duration: 600 },
    genericlight: { file: "", scale: 1.5, duration: 600 },
    genericdark:  { file: "", scale: 1.5, duration: 600 },
  },

  // ── Area animations (play at the delivery location after cast anim) ─────────
  // Keyed by school → deliveryType. Leave file: "" to skip.
  areaAnims: {
    fire: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    cold: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    shock: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    acid: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    poison: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    blunt: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    lava: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    wind: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    nature: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    healing: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    necrotic: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    psychic: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    arcane: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    shadow: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    radiant: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    earth: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    defense: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    genericlight: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
    genericdark: {
      aura:   { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativePx: 400, scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativePx: 200, scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativePx: 600, scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativePx: 200, scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
      remote: { file: "", nativePx: 100, scaleMode: 'fixed',    duration: 800  },
    },
  },

  // ── Sounds (optional, one per school) ───────────────────────────────────────
  sounds: {
    fire:     { cast: "", impact: "", volume: 0.6 },
    cold:     { cast: "", impact: "", volume: 0.6 },
    shock:    { cast: "", impact: "", volume: 0.6 },
    acid:     { cast: "", impact: "", volume: 0.6 },
    poison:   { cast: "", impact: "", volume: 0.6 },
    blunt:    { cast: "", impact: "", volume: 0.6 },
    lava:     { cast: "", impact: "", volume: 0.6 },
    wind:     { cast: "", impact: "", volume: 0.6 },
    nature:   { cast: "", impact: "", volume: 0.6 },
    healing:  { cast: "", impact: "", volume: 0.6 },
    necrotic: { cast: "", impact: "", volume: 0.6 },
    psychic:  { cast: "", impact: "", volume: 0.6 },
    arcane:   { cast: "", impact: "", volume: 0.6 },
    shadow:   { cast: "", impact: "", volume: 0.6 },
    radiant:  { cast: "", impact: "", volume: 0.6 },
    earth:    { cast: "", impact: "", volume: 0.6 },
    defense:  { cast: "", impact: "", volume: 0.6 },
    genericlight: { cast: "", impact: "", volume: 0.6 },
    genericdark:  { cast: "", impact: "", volume: 0.6 },
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
