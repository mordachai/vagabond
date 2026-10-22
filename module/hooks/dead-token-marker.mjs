import { RaiseHelper } from '../helpers/raise-helper.mjs';

/**
 * Dead / spent-Raise skull marker drawn on tokens.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerDeadTokenMarker() {
  const _DEAD_SKULL_SRC = '/icons/svg/skull.svg';
  const _DEAD_BLEED_SRC = '/icons/skills/wounds/injury-triple-slash-bleed.webp';

  async function _refreshDeadSkull(token) {
    const hasDead = token.actor?.statuses?.has('dead') ?? false;

    // Single source of truth for sizes/offsets — edit bleedOffsetY to shift bleed vertically
    const skullSize = token.w * 0.65;
    const bleedSize = token.w * 1.0;
    const cx = token.w / 2;
    const cy = token.h / 2;
    const bleedOffsetX = -0;
    const bleedOffsetY = -5;

    if (!hasDead) {
      if (token._vagabondDeadSkull && !token._vagabondDeadSkull.destroyed) token._vagabondDeadSkull.destroy();
      if (token._vagabondDeadBleed && !token._vagabondDeadBleed.destroyed) token._vagabondDeadBleed.destroy();
      if (token._vagabondDeadBleedMask && !token._vagabondDeadBleedMask.destroyed) token._vagabondDeadBleedMask.destroy();
      token._vagabondDeadSkull = null;
      token._vagabondDeadBleed = null;
      token._vagabondDeadBleedMask = null;
      return;
    }

    // Raise: a corpse that already rose once (can't be raised again) gets a black skull
    const skullTint = RaiseHelper.isSpent(token.document) ? 0x000000 : 0xFFFFFF;

    // Reposition only if sprite already exists
    if (token._vagabondDeadSkull && !token._vagabondDeadSkull.destroyed) {
      token._vagabondDeadSkull.tint = skullTint;
      token._vagabondDeadSkull.width = skullSize;
      token._vagabondDeadSkull.height = skullSize;
      token._vagabondDeadSkull.position.set(cx, cy);
      if (token._vagabondDeadBleed && !token._vagabondDeadBleed.destroyed) {
        token._vagabondDeadBleed.width = bleedSize;
        token._vagabondDeadBleed.height = bleedSize;
        token._vagabondDeadBleed.position.set(cx + bleedOffsetX, cy + bleedOffsetY);
      }
      return;
    }

    // Create new skull sprite
    const [skullTex, bleedTex] = await Promise.all([
      foundry.canvas.loadTexture(_DEAD_SKULL_SRC),
      foundry.canvas.loadTexture(_DEAD_BLEED_SRC),
    ]);
    if (!skullTex || token.destroyed) return;

    // Skull added first = renders below bleed
    const skull = new PIXI.Sprite(skullTex);
    skull.width = skullSize;
    skull.height = skullSize;
    skull.anchor.set(0.5);
    skull.position.set(cx, cy);
    skull.alpha = 0.85;
    skull.tint = skullTint;
    skull.eventMode = 'none';
    token.addChild(skull);
    token._vagabondDeadSkull = skull;

    // Bleeding overlay — normal blend, red channel drives alpha so black pixels are transparent
    if (bleedTex) {
      const bleed = new PIXI.Sprite(bleedTex);
      bleed.width = bleedSize;
      bleed.height = bleedSize;
      bleed.anchor.set(0.5);
      bleed.position.set(cx, cy + bleedOffsetY);
      bleed.alpha = 1.0;
      bleed.eventMode = 'none';
      // Alpha = red channel: black (R=0) → transparent, red/orange (R>0) → opaque.
      const f = new PIXI.ColorMatrixFilter();
      f.matrix = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        1, 0, 0, 0, 0,
      ];
      bleed.filters = [f];

      token.addChild(bleed);

      token._vagabondDeadBleed = bleed;
      token._vagabondDeadBleedMask = null;
    }
  }

  // Draw skull when token first renders
  Hooks.on('drawToken', (token) => { _refreshDeadSkull(token); });

  // Reposition on token refresh (movement, resize, etc.) — _refreshDeadSkull handles this path
  Hooks.on('refreshToken', (token) => {
    if (!token._vagabondDeadSkull || token._vagabondDeadSkull.destroyed) return;
    _refreshDeadSkull(token);
  });

  // Raise: the token went back to its corpse / was flagged spent — re-tint the skull
  Hooks.on('updateToken', (doc, changes) => {
    if (!('actorId' in changes) && !foundry.utils.hasProperty(changes, 'flags.vagabond.raiseSpent')) return;
    if (doc.object) _refreshDeadSkull(doc.object);
  });


  // Dead AE created — add skull (HP→0 path or manual HUD toggle)
  Hooks.on('createActiveEffect', (effect) => {
    if (!effect.statuses?.has('dead')) return;
    for (const token of effect.parent?.getActiveTokens() ?? []) {
      _refreshDeadSkull(token);
    }
  });

  // Dead AE deleted — remove skull
  Hooks.on('deleteActiveEffect', (effect) => {
    if (!effect.statuses?.has('dead')) return;
    for (const token of effect.parent?.getActiveTokens() ?? []) {
      _refreshDeadSkull(token);
    }
  });
}
