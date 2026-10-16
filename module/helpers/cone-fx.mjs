/**
 * ConeFx — a fixed-length cone clip from a Being toward its targets.
 *
 * Automated Animations' range menu stretches its clip to each target, so a 15' Breath
 * Attack reached Beings across the map. AA entries call this through the "FX Macros"
 * pack macro (Macro section, "Run macro only"), API `game.vagabond.fx.cone(...)`.
 */
export class ConeFx {

  /**
   * Play one cone from the source's edge, aimed at the targets' centroid.
   * No targets = aimed where the token faces.
   * @param {object} opts
   * @param {Token|TokenDocument} opts.source  the Being exhaling
   * @param {Token[]} [opts.targets]
   * @param {string} opts.file  file path or Sequencer DB key (e.g. jb2a.breath_weapons.fire.cone.orange.01)
   * @param {number} [opts.length=15]  cone length in scene units (feet)
   * @param {number} [opts.width]  cone width in scene units; omit to keep the clip's aspect
   * @param {number|string} [opts.color]  recolor: a number = hue shift in degrees (e.g. 255 turns
   *   the orange fire breath purple), a "#rrggbb" string = tint
   * @param {boolean} [opts.belowTokens=false]
   * @returns {Promise<void>}
   */
  /**
   * Sequencer DB keys ending in a distance (`jb2a.template_cone_5e....30ft`) are range sets
   * ({"15ft": …, "30ft": …}) that Sequencer only resolves with stretchTo; a sized effect
   * gets the whole set and fails (`inSrc.toLowerCase is not a function`). Pick the file:
   * the key's own distance, else the smallest one that covers `length`, else the largest.
   * @private
   */
  static _fileFor(key, length) {
    const db = globalThis.Sequencer?.Database;
    // A file path (has a folder) goes to Sequencer as is
    if (!db || key.includes('/') || !db.entryExists(key)) return key;
    let entry = db.getEntry(key, { softFail: true });
    if (Array.isArray(entry)) entry = entry[0];
    const set = entry?.file;
    if (!set || typeof set !== 'object' || Array.isArray(set)) return key;
    const ranges = Object.keys(set)
      .map(k => ({ k, ft: parseInt(k, 10) }))
      .filter(r => Number.isFinite(r.ft))
      .sort((a, b) => a.ft - b.ft);
    if (!ranges.length) return key;
    const own = key.match(/\.(\d+ft)$/)?.[1];
    const pick = (own && set[own]) ? own : (ranges.find(r => r.ft >= length) ?? ranges.at(-1)).k;
    const path = set[pick];
    return Array.isArray(path) ? path[0] : path;
  }

  static async cone({ source, targets = [], file, length = 15, width, color, belowTokens = false } = {}) {
    if (typeof Sequence === 'undefined' || !game.modules.get('sequencer')?.active) return;
    const token = source?.object ?? source;
    if (!token || !file) return;

    const center = t => t.center ?? { x: t.x, y: t.y };
    const src = center(token);
    const aimed = targets.map(t => t?.object ?? t).filter(t => t && t !== token);
    let angle;
    if (aimed.length) {
      const aim = {
        x: aimed.reduce((s, t) => s + center(t).x, 0) / aimed.length,
        y: aimed.reduce((s, t) => s + center(t).y, 0) / aimed.length,
      };
      angle = Math.atan2(aim.y - src.y, aim.x - src.x);
    } else {
      // Token rotation 0 = facing down (south)
      angle = Math.toRadians((token.document?.rotation ?? 0) + 90);
    }

    // Start at the token's edge so the cone's length is measured from the Being
    const edge = (token.w ?? canvas.grid.size) / 2;
    const start = { x: src.x + Math.cos(angle) * edge, y: src.y + Math.sin(angle) * edge };
    const unit = canvas.scene.grid.distance || 5;
    const size = { width: (Number(length) || 15) / unit };
    if (Number(width) > 0) size.height = Number(width) / unit;

    try {
      const eff = new Sequence()
        .effect()
        .file(this._fileFor(String(file).trim(), Number(length) || 15))
        .atLocation(start)
        .anchor({ x: 0, y: 0.5 })
        .rotate(-Math.toDegrees(angle))
        .size(size, { gridUnits: true })
        .belowTokens(!!belowTokens);
      const recolor = String(color ?? '').trim();
      if (/^#[0-9a-f]{6}$/i.test(recolor)) eff.tint(recolor);
      else if (recolor && Number.isFinite(Number(recolor))) eff.filter('ColorMatrix', { hue: Number(recolor) });
      eff.play();
    } catch (err) {
      console.warn('Vagabond | ConeFx error (non-fatal):', err);
    }
  }
}
