/**
 * Executable item/spell/NPC-action macros.
 *
 * A "macro slot" lives on item.system.macro / .hitMacro, spell.system.macro / .hitMacro,
 * or actor.system.actions[n].macro / .hitMacro. Each slot can reference a Macro
 * document by UUID (preferred) or hold an inline script `command`. A chat-card
 * button runs the slot with { actor, item, token, targets, speaker, isCritical } in scope.
 *
 * runAsGM: when set, a non-GM clicking the button relays execution to the GM
 * client via the system socket (see vagabond.mjs 'runItemMacro' handler), so the
 * macro runs with GM permissions (needed for module APIs that mutate the world).
 */

import { emitSocket } from './socket-helper.mjs';

/**
 * Resolve the macro-slot config object from a descriptor.
 * @param {object} d
 * @returns {Promise<{cfg: object|null, item: Item|null, actor: Actor|null}>}
 */
async function _resolveSlot(d) {
  let item = null;
  let actor = null;
  let cfg = null;

  const resolveActor = async () => {
    if (d.actorUuid) return await fromUuid(d.actorUuid);
    if (d.actorId) return game.actors.get(d.actorId);
    return null;
  };

  if (d.itemUuid) {
    item = await fromUuid(d.itemUuid);
    actor = item?.actor ?? await resolveActor();
    cfg = item?.system?.[d.slot] ?? null;
  } else {
    actor = await resolveActor();
    const action = (d.actionIndex != null) ? actor?.system?.actions?.[d.actionIndex] : null;
    cfg = action?.[d.slot] ?? null;
  }
  // Fallback: the source was consumed/deleted but the button carried its inline
  // command — run that so the button still works (light sources etc.).
  if (!cfg && d.command) cfg = { enabled: true, command: d.command };
  return { cfg, item, actor };
}

/**
 * Reconstruct target token placeables from a snapshot, falling back to the
 * current user's targets.
 * @param {object} d
 * @returns {Token[]}
 */
function _resolveTargets(d) {
  if (Array.isArray(d.targetTokenIds) && d.targetTokenIds.length) {
    const scene = d.sceneId ? game.scenes.get(d.sceneId) : canvas.scene;
    // Prefer live placeables on the active canvas; else the scene's token docs.
    if (scene && canvas.scene?.id === scene.id) {
      const tokens = d.targetTokenIds.map(id => canvas.tokens?.get(id)).filter(Boolean);
      if (tokens.length) return tokens;
    }
    if (scene) {
      return d.targetTokenIds.map(id => scene.tokens.get(id)?.object ?? scene.tokens.get(id)).filter(Boolean);
    }
  }
  return Array.from(game.user.targets);
}

/**
 * Resolve and execute a macro slot locally on this client.
 * @param {object} d  descriptor: { itemUuid?, actorId?, actionIndex?, slot, targetTokenIds?, sceneId?, isCritical? }
 * @returns {Promise<*>}
 */
export async function executeItemMacro(d) {
  const { cfg, item, actor } = await _resolveSlot(d);
  if (!cfg) {
    ui.notifications.warn('Macro configuration not found.');
    return;
  }

  const token = actor?.getActiveTokens?.(true)?.[0] ?? null;
  const targets = _resolveTargets(d);
  const isCritical = d.isCritical ?? false;
  const scope = { actor, item, token, targets, isCritical, speaker: ChatMessage.getSpeaker({ actor }) };

  if (cfg.uuid) {
    const macro = await fromUuid(cfg.uuid);
    if (!macro) {
      ui.notifications.warn('Linked macro not found.');
      return;
    }
    return macro.execute(scope);
  }
  if (cfg.command) {
    const tmp = new Macro({
      name: `${item?.name ?? actor?.name ?? 'Item'} (${d.slot})`,
      type: 'script',
      scope: 'global',
      command: cfg.command,
      author: game.user.id,
    });
    return tmp.execute(scope);
  }
  ui.notifications.warn('This macro slot has no macro linked and no inline command.');
}

/**
 * Entry point for a chat-button click. Runs locally, or relays to the GM when
 * the slot is flagged runAsGM and the clicker is not a GM.
 * @param {object} d  descriptor (see executeItemMacro) plus { runAsGM }
 */
export async function runMacroFromButton(d) {
  if (d.runAsGM && !game.user.isGM) {
    if (!game.users.activeGM) {
      ui.notifications.warn('No GM is connected to run this macro.');
      return;
    }
    emitSocket('runItemMacro', {
      itemUuid: d.itemUuid ?? null,
      actorUuid: d.actorUuid ?? null,
      actionIndex: d.actionIndex ?? null,
      slot: d.slot,
      command: d.command ?? null,
      targetTokenIds: d.targetTokenIds ?? [],
      sceneId: d.sceneId ?? null,
      isCritical: d.isCritical ?? false,
    });
    return;
  }
  return executeItemMacro(d);
}

/**
 * Build a chat-card button for a macro slot.
 * @param {object} opts
 * @param {object} opts.cfg          the slot config (enabled/uuid/command/label/runAsGM)
 * @param {string} opts.slot         'macro' | 'hitMacro'
 * @param {string} [opts.actorUuid]
 * @param {string} [opts.itemUuid]
 * @param {number} [opts.actionIndex]
 * @param {string} opts.fallbackLabel
 * @param {boolean} [opts.isCritical]  carried on the button so the macro scope exposes `isCritical`
 * @returns {string} button HTML, or '' when the slot is empty/disabled
 */
export function buildMacroButtonHTML({ cfg, slot, actorUuid, itemUuid, actionIndex, fallbackLabel, isCritical = false }) {
  if (!cfg?.enabled) return '';
  if (!cfg.uuid && !cfg.command) return '';
  const label = cfg.label || fallbackLabel;
  const safe = foundry.utils.escapeHTML?.(label) ?? label;
  // Embed the inline command (base64) so the button still works if the source
  // item is consumed/deleted before it is clicked (e.g. last torch in a stack).
  const cmdB64 = cfg.command ? btoa(unescape(encodeURIComponent(cfg.command))) : '';
  const attrs = [
    `data-action="executeItemMacro"`,
    `data-macro-slot="${slot}"`,
    actorUuid ? `data-actor-uuid="${actorUuid}"` : '',
    itemUuid ? `data-item-uuid="${itemUuid}"` : '',
    (actionIndex != null) ? `data-action-index="${actionIndex}"` : '',
    cfg.runAsGM ? `data-run-as-gm="true"` : '',
    isCritical ? `data-is-critical="true"` : '',
    cmdB64 ? `data-command-b64="${cmdB64}"` : '',
  ].filter(Boolean).join(' ');
  return `<button class="vagabond-macro-button" ${attrs}>
            <i class="fa-solid fa-scroll"></i> ${safe}${cfg.runAsGM ? ' <i class="fa-solid fa-user-shield vagabond-macro-gm" title="Runs as GM"></i>' : ''}
          </button>`;
}
