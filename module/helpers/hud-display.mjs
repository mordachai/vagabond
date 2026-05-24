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
