/**
 * Per-user HUD display preferences (accessibility).
 *
 * Lets each player tune their own HUD look without touching anyone else's:
 *  - dark background behind the body bar,
 *  - background blur,
 *  - font scaling (text only — layout/portrait sizes are unchanged).
 *
 * Stored client-side in the `hudDisplayPrefs` setting and applied to a live HUD
 * element. Shared by {@link VagabondCharacterHud} and {@link VagabondNPCHud}.
 */

/** Default prefs == the current look (so existing users see no change). */
export const HUD_DISPLAY_DEFAULTS = Object.freeze({
  darkBg: false,
  blur: false,
  fontScale: 1,
});

/** Read the current user's HUD display prefs, merged over defaults. */
export function getHudDisplayPrefs() {
  const stored = game.settings.get('vagabond', 'hudDisplayPrefs') ?? {};
  return { ...HUD_DISPLAY_DEFAULTS, ...stored };
}

/**
 * Compute the HUD name-underline health bar: a fill width (%) and a colour that
 * shifts green → yellow → orange as HP drops. Shared by both HUDs.
 *
 * Colour stops: 100% `#88c655` → 50% `#dcd555` → 25% `#f3922f` → 10% `#d23e34`.
 * Values between stops are linearly interpolated; below 10% stays red.
 * @param {number} value  Current HP.
 * @param {number} max    Max HP.
 * @returns {{ pct: number, color: string }}
 */
export function getHudHealthBar(value, max) {
  const m = Number(max) || 0;
  if (m <= 0) return { pct: 0, color: '#88c655' };
  const pct = Math.max(0, Math.min(100, (Number(value) || 0) / m * 100));

  const stops = [
    { p: 10, c: [0xd2, 0x3e, 0x34] }, // red
    { p: 25, c: [0xf3, 0x92, 0x2f] }, // orange
    { p: 50, c: [0xdc, 0xd5, 0x55] }, // yellow
    { p: 100, c: [0x88, 0xc6, 0x55] }, // green
  ];
  const last = stops[stops.length - 1];
  let color;
  if (pct <= stops[0].p) color = stops[0].c;
  else if (pct >= last.p) color = last.c;
  else {
    const hi = stops.find(s => s.p >= pct);
    const lo = stops[stops.indexOf(hi) - 1];
    const t = (pct - lo.p) / (hi.p - lo.p);
    color = lo.c.map((ch, i) => Math.round(ch + (hi.c[i] - ch) * t));
  }
  const hex = '#' + color.map(ch => ch.toString(16).padStart(2, '0')).join('');
  return { pct, color: hex };
}

/**
 * Apply the current user's HUD display prefs to a rendered HUD root element.
 * Toggles the bg/blur modifier classes and sets the `--vh-font-scale` variable.
 * @param {HTMLElement} element  The HUD's root element (`.vbd-hud`).
 */
export function applyHudDisplayPrefs(element) {
  if (!element) return;
  const prefs = getHudDisplayPrefs();
  element.classList.toggle('vbd-hud--bg-dark', !!prefs.darkBg);
  element.classList.toggle('vbd-hud--blur', !!prefs.blur);
  const scale = Number(prefs.fontScale) || 1;
  element.style.setProperty('--vh-font-scale', String(scale));
}
