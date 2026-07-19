/**
 * Custom tooltip controller for the floating HUDs (character + NPC).
 *
 * Native Foundry `data-tooltip` (game.tooltip / TooltipManager) only exposes one
 * timing knob (TOOLTIP_ACTIVATION_MS, 500ms) used for both show-delay and the
 * mouseleave-hide-delay, and has no "auto-dismiss while still hovering" concept.
 * The HUDs pack many tooltip-bearing elements close together, so instant/sticky
 * tooltips felt overwhelming. This binds `[data-hud-tip]`/`[data-hud-tip-html]`
 * elements (renamed from `data-tooltip` in the HUD templates) to game.tooltip
 * with our own show delay and a forced auto-hide timeout, without touching the
 * global TooltipManager. `-html` variant is for tooltips that embed markup
 * (e.g. a mouse-click icon) rather than plain localized text.
 */

const SHOW_MS = 600;
const HIDE_MS = 3500;
const SELECTOR = '[data-hud-tip], [data-hud-tip-html]';

/**
 * Delegate hover listeners for `[data-hud-tip]` elements within `root`.
 * @param {HTMLElement} root
 * @param {AbortSignal} signal  Same signal the caller's _onRender AbortController uses.
 */
export function bindHudTooltips(root, signal) {
  let showTimeout = null;
  let hideTimeout = null;
  let activeEl = null;

  const clearShow = () => { window.clearTimeout(showTimeout); showTimeout = null; };
  const clearHide = () => { window.clearTimeout(hideTimeout); hideTimeout = null; };

  const hide = () => {
    clearHide();
    if (activeEl) game.tooltip.deactivate();
    activeEl = null;
  };

  root.addEventListener('pointerenter', (event) => {
    const el = event.target.closest?.(SELECTOR);
    if (!el || !root.contains(el)) return;
    if (activeEl === el) return;

    clearShow();
    clearHide();
    activeEl = null;

    showTimeout = window.setTimeout(() => {
      showTimeout = null;
      activeEl = el;
      if (el.dataset.hudTipHtml) game.tooltip.activate(el, { html: el.dataset.hudTipHtml });
      else game.tooltip.activate(el, { text: el.dataset.hudTip });
      hideTimeout = window.setTimeout(hide, HIDE_MS);
    }, SHOW_MS);
  }, { capture: true, signal });

  root.addEventListener('pointerleave', (event) => {
    const el = event.target.closest?.(SELECTOR);
    if (!el) return;
    if (el === activeEl) hide();
    else clearShow();
  }, { capture: true, signal });
}
