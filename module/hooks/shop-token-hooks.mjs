import { ShopApp } from '../applications/shop-app.mjs';
import { VAGABOND } from '../helpers/config.mjs';
import { NpcFlying } from '../helpers/npc-flying.mjs';
import { NpcSenses } from '../helpers/npc-senses.mjs';
import { TokenPortrait } from '../helpers/token-portrait.mjs';

/**
 * New-actor token defaults (party/construct/shop) + shop token rules, ready sweep, padlock marker, Token HUD buttons.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerShopTokenHooks() {

  // Party and construct actors default to neutral disposition (not hostile)
  Hooks.on('preCreateActor', (actor, _data, _options, _userId) => {
    if (actor.type === 'party' || actor.type === 'construct') {
      actor.updateSource({ 'prototypeToken.disposition': CONST.TOKEN_DISPOSITIONS.NEUTRAL });
    }
    // Shops: one shared stock/purse, so tokens stay linked to the actor
    // Neutral, always show the name, players can always see it (the `system.open` flag gates trading)
    if (actor.type === 'shop') {
      actor.updateSource({
        ...Object.fromEntries(Object.entries(shopTokenRules()).map(([k, v]) => [`prototypeToken.${k}`, v])),
        'ownership.default': Math.max(actor.ownership?.default ?? 0, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER),
      });
    }
  });

  /* -------------------------------------------- */
  /*  Shop tokens                                 */
  /* -------------------------------------------- */

  // Shop tokens: forced neutral, name always visible to everyone, linked (one shared stock/purse).
  // Built lazily — CONST isn't guaranteed at module evaluation.
  const shopTokenRules = () => ({
    disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL,
    displayName: CONST.TOKEN_DISPLAY_MODES.ALWAYS,
    actorLink: true,
  });
  const SHOP_SWEEP = { vagabondShopSweep: true }; // options flag: lets the ready sweep past the guards below

  Hooks.on('preCreateToken', (token) => {
    if (token.actor?.type === 'shop') token.updateSource(shopTokenRules());
  });

  // Circle token art: ring toggled on a placed token → swap to the matching crop variant (ring / plain)
  Hooks.on('updateToken', (token, changes, options, userId) => {
    if (userId !== game.user.id) return;
    if (!foundry.utils.hasProperty(changes, 'ring.enabled') && !foundry.utils.hasProperty(changes, 'texture.src')) return;
    TokenPortrait.syncTokenRing(token).catch(err => console.warn('Vagabond | Token ring art swap failed', err));
  });

  // A GM can't flip a shop token hostile / hide its name / unlink it
  Hooks.on('preUpdateToken', (token, changes, options) => {
    if (token.actor?.type !== 'shop' || options.vagabondShopSweep) return;
    for (const key of Object.keys(shopTokenRules())) delete changes[key];
  });
  Hooks.on('preUpdateActor', (actor, changes, options) => {
    if (actor.type !== 'shop' || options.vagabondShopSweep) return;
    for (const key of Object.keys(shopTokenRules())) delete changes.prototypeToken?.[key];
  });

  // Existing shops: heal ownership + token settings once the GM is ready (idempotent, active GM only)
  Hooks.once('ready', async () => {
    if (game.user !== game.users.activeGM) return;
    try {
      const OBSERVER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
      const rules = shopTokenRules();
      for (const shop of game.actors.filter(a => a.type === 'shop')) {
        const update = {};
        if ((shop.ownership?.default ?? 0) < OBSERVER) update['ownership.default'] = OBSERVER;
        for (const [key, value] of Object.entries(rules)) {
          if (shop.prototypeToken[key] !== value) update[`prototypeToken.${key}`] = value;
        }
        if (Object.keys(update).length) await shop.update(update, SHOP_SWEEP);
      }
      for (const scene of game.scenes) {
        const updates = scene.tokens
          .filter(t => t.actor?.type === 'shop' && Object.entries(rules).some(([k, v]) => t[k] !== v))
          .map(t => ({ _id: t.id, ...rules }));
        if (updates.length) await scene.updateEmbeddedDocuments('Token', updates, SHOP_SWEEP);
      }
      // Shops never fight: drop any shop combatants left over from before the block
      for (const combat of game.combats) {
        const ids = combat.combatants.filter(c => c.actor?.type === 'shop').map(c => c.id);
        if (ids.length) await combat.deleteEmbeddedDocuments('Combatant', ids);
      }
    } catch (err) {
      console.error('Vagabond | Shop token sweep failed', err);
    }
  });

  // Closed-shop marker: an 85%-size, 90%-opacity padlock on the token (visible to everyone)
  const _SHOP_LOCK_SRC = 'icons/svg/padlock.svg';

  async function _refreshShopLock(token) {
    const closed = token.actor?.type === 'shop' && !token.actor.system.open;
    const existing = token._vagabondShopLock;
    if (!closed) {
      if (existing && !existing.destroyed) existing.destroy();
      token._vagabondShopLock = null;
      return;
    }
    const size = Math.min(token.w, token.h) * 0.85;
    if (existing && !existing.destroyed) {
      existing.width = size;
      existing.height = size;
      existing.position.set(token.w / 2, token.h / 2);
      return;
    }
    if (token._vagabondShopLockLoading) return;
    token._vagabondShopLockLoading = true;
    try {
      const tex = await foundry.canvas.loadTexture(_SHOP_LOCK_SRC);
      if (!tex || token.destroyed || token._vagabondShopLock?.destroyed === false) return;
      if (token.actor?.type !== 'shop' || token.actor.system.open) return;
      const lock = new PIXI.Sprite(tex);
      lock.anchor.set(0.5);
      lock.width = size;
      lock.height = size;
      lock.position.set(token.w / 2, token.h / 2);
      lock.alpha = 0.9;
      lock.eventMode = 'none';
      token.addChild(lock);
      token._vagabondShopLock = lock;
    } finally {
      token._vagabondShopLockLoading = false;
    }
  }

  Hooks.on('drawToken', (token) => { _refreshShopLock(token); });
  Hooks.on('refreshToken', (token) => {
    if (token.actor?.type === 'shop') _refreshShopLock(token);
  });
  Hooks.on('updateActor', (actor, changes) => {
    if (actor.type !== 'shop' || !foundry.utils.hasProperty(changes, 'system.open')) return;
    for (const token of actor.getActiveTokens(true)) _refreshShopLock(token);
  });

  // NPC senses → token vision / detection modes (prototype token + placed linked tokens).
  // Single active GM only, so multi-GM sessions don't double-write.
  Hooks.on('updateActor', (actor, changes) => {
    if (actor.type !== 'npc' || !game.users.activeGM?.isSelf) return;
    if (!foundry.utils.hasProperty(changes, 'system.senses')
      && !foundry.utils.hasProperty(changes, 'system.sensesNote')) return;
    NpcSenses.syncActorTokens(actor);
  });

  // Fly-only NPCs (base Speed 0) and flyingByDefault NPCs (birds, insects) get the Flying status automatically.
  // Single active GM only; sync() is idempotent, so the canvasReady sweep also catches
  // NPCs placed/edited before this existed.
  Hooks.on('createToken', (token) => {
    if (!game.users.activeGM?.isSelf || token.actor?.type !== 'npc') return;
    NpcFlying.sync(token.actor);
  });
  Hooks.on('updateActor', (actor, changes) => {
    if (actor.type !== 'npc' || !game.users.activeGM?.isSelf) return;
    if (!['system.speed', 'system.speedTypes', 'system.flyingByDefault']
      .some((path) => foundry.utils.hasProperty(changes, path))) return;
    NpcFlying.sync(actor);
  });
  Hooks.on('canvasReady', () => {
    if (game.users.activeGM?.isSelf) NpcFlying.sweep();
  });

  // Token HUD status palette: book Statuses and Trackers under their own headings
  // (CONFIG.statusEffects is already ordered book-first in init; Foundry-default mode is left alone).
  Hooks.on('renderTokenHUD', (hud, html) => {
    const palette = html.querySelector('.palette.status-effects');
    if (!palette || !CONFIG.statusEffects.some(s => s.id === 'vulnerable')) return;
    const icons = [...palette.querySelectorAll('.effect-control[data-status-id]')];
    const heading = (key) => {
      const el = document.createElement('div');
      el.className = 'vagabond-status-heading';
      el.textContent = game.i18n.localize(key);
      return el;
    };
    // Foundry sorts the palette by name on its own, so regroup here: book Statuses, then Trackers
    // (each keeps the palette's alphabetical order).
    const book = icons.filter(i => VAGABOND.bookStatusIds.has(i.dataset.statusId));
    const trackers = icons.filter(i => !VAGABOND.bookStatusIds.has(i.dataset.statusId));
    // Only head the groups when both are shown
    if (!book.length || !trackers.length) return;
    palette.append(heading('VAGABOND.StatusGroups.Statuses'), ...book,
      heading('VAGABOND.StatusGroups.Trackers'), ...trackers);
  });

  // Shop token HUD: hide the combat toggle, add an open/close switch for the GM
  Hooks.on('renderTokenHUD', (hud, html) => {
    const token = hud.object;
    const actor = token?.actor;
    if (actor?.type !== 'shop') return;
    html.querySelector('[data-action="combat"]')?.remove();
    if (!game.user.isGM) return;
    const leftCol = html.querySelector('.col.left');
    if (!leftCol) return;

    const isOpen = !!actor.system.open;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('control-icon', 'vagabond-shop-open-toggle');
    if (isOpen) btn.classList.add('active');
    btn.setAttribute('data-tooltip', game.i18n.localize(isOpen ? 'VAGABOND.Shop.App.CloseShop' : 'VAGABOND.Shop.App.OpenShop'));
    btn.innerHTML = `<i class="fas ${isOpen ? 'fa-lock-open' : 'fa-lock'}"></i>`;
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      await ShopApp.toggleOpen(actor);
      hud.render();
    });
    leftCol.appendChild(btn);
  });
}
