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
 * nativeW / nativeH: pixel dimensions of the animation at 1.0 scale.
 *   Auto-populated from video metadata when a file is picked in the config UI.
 *   Used to compute scaleX = dist / nativeW (beams) or uniformScale = targetPx / max(nativeW, nativeH)
 *   (area effects), preserving the asset's aspect ratio in both cases.
 * file: path to .webm animation (JB2A or custom)
 * duration: milliseconds
 */

export const SPELL_FX = {

  // ── Cast animations (play briefly on the caster token at cast moment) ──────
  // One per school. Leave file: "" to skip cast anim for that school.
  castAnims: {
    fire:     { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    cold:     { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    shock:    { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    acid:     { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    poison:   { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    blunt:    { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    lava:     { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    wind:     { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    nature:   { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    healing:  { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    necrotic: { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    psychic:  { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    arcane:   { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    shadow:   { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    radiant:  { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    earth:    { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    defense:  { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    genericlight: { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
    genericdark:  { file: "", scale: 1.5, duration: 600, nativeW: 0, nativeH: 0 },
  },

  // ── Area animations (play at the delivery location after cast anim) ─────────
  // Keyed by school → deliveryType. Leave file: "" to skip.
  areaAnims: {
    fire: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    cold: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    shock: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    acid: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    poison: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    blunt: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    lava: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    wind: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    nature: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    healing: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    necrotic: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    psychic: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    arcane: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    shadow: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    radiant: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    earth: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    defense: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    genericlight: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
    genericdark: {
      aura:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      cone:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 1000 },
      sphere: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'radius',   duration: 1200 },
      line:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'length',   duration: 800  },
      cube:   { file: "", nativeW: 0, nativeH: 0,scaleMode: 'diameter', duration: 1200 },
      glyph:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 1000 },
      touch:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
      imbue:  { file: "", nativeW: 0, nativeH: 0,scaleMode: 'chain',    duration: 800  },
      remote: { file: "", nativeW: 0, nativeH: 0,scaleMode: 'fixed',    duration: 800  },
    },
  },

  // ── Sounds (optional, one per school) ───────────────────────────────────────
  // cast: plays immediately when the spell is attempted (always fires).
  // impact: plays when the area animation starts; overridden per-delivery by deliverySounds.
  // volume: shared by all sounds in this school (0–1).
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

  // ── Per-delivery sounds (optional overrides) ─────────────────────────────────
  // When a file is set, it plays instead of sounds[school].impact for that delivery.
  // Volume is always taken from sounds[school].volume.
  deliverySounds: {
    fire:     { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    cold:     { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    shock:    { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    acid:     { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    poison:   { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    blunt:    { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    lava:     { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    wind:     { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    nature:   { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    healing:  { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    necrotic: { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    psychic:  { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    arcane:   { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    shadow:   { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    radiant:  { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    earth:    { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    defense:  { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    genericlight: { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
    genericdark:  { aura: { file: "" }, cone: { file: "" }, sphere: { file: "" }, line: { file: "" }, cube: { file: "" }, glyph: { file: "" }, touch: { file: "" }, imbue: { file: "" }, remote: { file: "" } },
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
 * Dimensions (nativeW/nativeH) are extracted from JB2A filenames which
 * always end with _WxH.ext (e.g. LightningBolt_4000x200.webm).
 */
export async function loadJB2ADefaults() {
  if (_jb2aDefaults) return; // already loaded
  try {
    const resp = await fetch('systems/vagabond/assets/config/vagabond-default-spell-fx-config.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    _jb2aDefaults = await resp.json();
    _injectDimsFromFilenames(_jb2aDefaults);
  } catch (err) {
    console.warn('Vagabond | Failed to load JB2A spell FX defaults:', err);
    _jb2aDefaults = null;
  }
}

function _dimsFromPath(path) {
  const m = (path ?? '').match(/_(\d+)x(\d+)\.\w+$/i);
  return m ? { nativeW: parseInt(m[1]), nativeH: parseInt(m[2]) } : null;
}

function _injectDimsFromFilenames(cfg) {
  for (const entry of Object.values(cfg.castAnims ?? {})) {
    if (entry.file && !entry.nativeW) Object.assign(entry, _dimsFromPath(entry.file) ?? {});
  }
  for (const school of Object.values(cfg.areaAnims ?? {})) {
    for (const entry of Object.values(school)) {
      if (entry.file && !entry.nativeW) Object.assign(entry, _dimsFromPath(entry.file) ?? {});
    }
  }
}
