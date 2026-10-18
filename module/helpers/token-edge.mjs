/**
 * Vagabond measures areas from the caster's edge, not its center (a 15' Line covers the 3 spaces beyond the token).
 * Dependency-free so templates (measure-templates) and FX (spell-sequencer) share it.
 */

/**
 * Point where a ray from the token's center at `angle` (radians) leaves the token's footprint.
 * @param {Token} token
 * @param {number} angle
 * @returns {{x:number, y:number}}
 */
export function tokenEdgePoint(token, angle) {
  const size = canvas.grid?.size ?? 100;
  const c = token.center;
  const hw = Math.max(1, token.document?.width ?? 1) * size / 2;
  const hh = Math.max(1, token.document?.height ?? 1) * size / 2;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  const t = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Half of the token's larger side in pixels (Aura radius = distance + this). */
export function tokenHalfSize(token) {
  const size = canvas.grid?.size ?? 100;
  return Math.max(1, token.document?.width ?? 1, token.document?.height ?? 1) * size / 2;
}
