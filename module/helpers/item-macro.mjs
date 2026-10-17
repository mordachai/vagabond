/**
 * Executable item/spell/NPC-action macros.
 *
 * A "macro slot" lives on item.system.macro / .hitMacro, spell.system.macro / .hitMacro,
 * or actor.system.actions[n].macro / .hitMacro. Each slot can reference a Macro
 * document by UUID (preferred) or hold an inline script `command`. A chat-card
 * button runs the slot with { actor, item, token, targets, speaker, isCritical } in scope.
 *
 * runAsGM: when set, a non-GM clicking the button relays execution to the active GM
 * (User#query `vagabond.runItemMacro`, see registerMacroQueries), so the macro runs with
 * GM permissions (needed for module APIs that mutate the world). The player waits for the
 * answer and sees the GM-side warnings (`macroNotify`) and errors.
 */

import { FocusLink } from './focus-link.mjs';

/**
 * Built-in handlers a macro slot can call as `system:<name>` instead of a script. Unlike script
 * macros they need no MACRO_SCRIPT permission and receive the FULL scope (`actor`, `item`,
 * `token`, `targets`, `speaker`, plus any button extraScope) as one object.
 */
const _handlers = new Map();

/**
 * @param {string} name  e.g. 'bard.virtuoso'
 * @param {(scope: object) => *} fn
 */
export function registerMacroHandler(name, fn) {
  _handlers.set(name, fn);
}

/** Cast gates of built-in Spell hit macros: `system:<name>` → (ctx) => error message | null. */
const _castGates = new Map();

/**
 * A Spell whose hit macro is `system:<name>` runs `fn` before its Cast is rolled or paid for. A returned
 * message blocks the Cast (warning toast). ctx = { actor, spell, state, tokens } (tokens = the Cast's Targets).
 * @param {string} name  e.g. 'spell.raise'
 * @param {(ctx: object) => (string|null)} fn
 */
export function registerCastGate(name, fn) {
  _castGates.set(name, fn);
}

/** Run the cast gate of `spell`'s hit macro, if any. @returns {string|null} the blocking message */
export function castGateMessage(ctx) {
  const command = String(ctx.spell?.system?.hitMacro?.command ?? '').trim();
  if (!command.startsWith('system:')) return null;
  const fn = _castGates.get(command.slice('system:'.length).trim());
  return fn ? (fn(ctx) || null) : null;
}

/**
 * Font Awesome classes from an author-typed icon (`music`, `fa-music` or `fa-solid fa-music`).
 * @param {string} raw
 * @param {string} [fallback]
 * @returns {string}
 */
export function faIconClasses(raw, fallback = 'fa-solid fa-scroll') {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  if (/\bfa-(solid|regular|light|thin|duotone|brands)\b/.test(s)) return s;
  return `fa-solid ${s.startsWith('fa-') ? s : `fa-${s}`}`;
}

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
    // `slot` is a path into item.system: 'macro' / 'hitMacro' or e.g. 'levelFeatures.3.action'
    cfg = (item && d.slot) ? (foundry.utils.getProperty(item.system, d.slot) ?? null) : null;
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
  // Targets picked in the Cast dialog are final: an empty pick never falls back to the user's targets
  const picked = !!d.extraScope?.targetsPicked;
  if (Array.isArray(d.targetTokenIds) && (d.targetTokenIds.length || picked)) {
    const scene = d.sceneId ? game.scenes.get(d.sceneId) : canvas.scene;
    // Prefer live placeables on the active canvas; else the scene's token docs.
    if (scene && canvas.scene?.id === scene.id) {
      const tokens = d.targetTokenIds.map(id => canvas.tokens?.get(id)).filter(Boolean);
      if (tokens.length) return tokens;
    }
    if (scene) {
      return d.targetTokenIds.map(id => scene.tokens.get(id)?.object ?? scene.tokens.get(id)).filter(Boolean);
    }
    if (picked) return [];
  }
  return Array.from(game.user.targets);
}

/**
 * Resolve and execute a macro slot locally on this client.
 * @param {object} d  descriptor: { itemUuid?, actorId?, actionIndex?, slot, targetTokenIds?, sceneId?, isCritical? }
 * @returns {Promise<*>}
 */
export async function executeItemMacro(d) {
  const result = await _executeItemMacro(d);
  // Lets features react to a Spell/item macro button being used (Wizard Archwizard clean-up)
  Hooks.callAll('vagabond.itemMacroExecuted', { itemUuid: d.itemUuid ?? null, slot: d.slot ?? null });
  return result;
}

async function _executeItemMacro(d) {
  // A Focus-held Spell Cast (scope `focusHeld`): every effect its hit macro creates ends with the Focus
  if (d.extraScope?.focusHeld === true && d.slot === 'hitMacro') {
    const { item, actor } = await _resolveSlot(d);
    if (item?.type === 'spell' && actor) {
      return FocusLink.capture(FocusLink.stamp(actor, item, true), () => _runItemMacro(d));
    }
  }
  return _runItemMacro(d);
}

async function _runItemMacro(d) {
  const { cfg, item, actor } = await _resolveSlot(d);
  if (!cfg) {
    macroNotify('warn', 'Macro configuration not found.');
    return;
  }

  const token = actor?.getActiveTokens?.()?.[0] ?? null;
  const targets = _resolveTargets(d);
  const isCritical = d.isCritical ?? false;
  // Name captured on the button so it survives the source item being consumed
  // (light sources etc.). When the real item is gone, expose a minimal stub so
  // stored inline commands that read `item.name` still resolve.
  const itemName = item?.name ?? d.itemName ?? null;
  const scopeItem = item ?? (itemName ? { name: itemName } : null);
  // extraScope: arbitrary per-cast data threaded from the chat-card button
  // (e.g. a spell's chosen damageDice / manaSpent). Spread last so callers
  // cannot clobber the core scope keys.
  const extraScope = (d.extraScope && typeof d.extraScope === 'object') ? d.extraScope : {};
  const scope = { actor, item: scopeItem, token, targets, isCritical, itemName, speaker: ChatMessage.getSpeaker({ actor }), ...extraScope };
  // Target picker Objects travel as uuids; macros get the Items
  if (Array.isArray(extraScope.targetObjects)) {
    scope.targetObjects = (await Promise.all(extraScope.targetObjects.map(u => (typeof u === 'string' ? fromUuid(u) : u)))).filter(Boolean);
  }

  // `system:<name>` → built-in handler (no script permission needed, full scope as one object)
  if (!cfg.uuid && typeof cfg.command === 'string' && cfg.command.trim().startsWith('system:')) {
    const name = cfg.command.trim().slice('system:'.length).trim();
    const fn = _handlers.get(name);
    if (!fn) {
      macroNotify('warn', `Unknown built-in action "${name}".`);
      return;
    }
    return fn(scope);
  }

  if (cfg.uuid) {
    const macro = await fromUuid(cfg.uuid);
    if (!macro) {
      macroNotify('warn', 'Linked macro not found.');
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
  macroNotify('warn', 'This macro slot has no macro linked and no inline command.');
}

/* -------------------------------------------- */
/*  runAsGM relay (User#query)                  */
/* -------------------------------------------- */

const MACRO_QUERY = 'vagabond.runItemMacro';

/** Notes collected while the GM runs a relayed macro (sent back to the requester), else null. */
let _relayNotes = null;
/** Relayed macros run one at a time, so their notes never mix. */
let _relayChain = Promise.resolve();

/**
 * Warn / inform from inside a macro or built-in handler. Toasts locally and, while the GM runs a
 * relayed macro, also reaches the player who clicked (a plain `ui.notifications` call on the GM
 * would only show on the GM's screen).
 * @param {'info'|'warn'|'error'} level
 * @param {string} message
 */
export function macroNotify(level, message) {
  ui.notifications[level]?.(message);
  _relayNotes?.push({ level, message });
}

/** GM side of the relay. Called once from init. */
export function registerMacroQueries() {
  CONFIG.queries[MACRO_QUERY] = (data) => {
    const run = _relayChain.then(async () => {
      const notes = [];
      _relayNotes = notes;
      try {
        await executeItemMacro(data);
        return { notes };
      } catch (err) {
        console.error('VAGABOND | GM-relayed macro execution failed:', err);
        return { notes, error: err?.message ?? String(err) };
      } finally {
        _relayNotes = null;
      }
    });
    _relayChain = run.catch(() => {});
    return run;
  };
}

/**
 * Entry point for a chat-button click. Runs locally, or relays to the GM when
 * the slot is flagged runAsGM and the clicker is not a GM. The relay waits for the GM's answer, so the
 * player sees the GM's warnings and any failure (a GM that doesn't answer, an error in the macro).
 * @param {object} d  descriptor (see executeItemMacro) plus { runAsGM }
 */
export async function runMacroFromButton(d) {
  if (d.runAsGM && !game.user.isGM) {
    const gm = game.users.activeGM;
    if (!gm) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Macro.NoGM'));
      return;
    }
    const payload = {
      itemUuid: d.itemUuid ?? null,
      itemName: d.itemName ?? null,
      actorUuid: d.actorUuid ?? null,
      actionIndex: d.actionIndex ?? null,
      slot: d.slot,
      command: d.command ?? null,
      targetTokenIds: d.targetTokenIds ?? [],
      sceneId: d.sceneId ?? null,
      isCritical: d.isCritical ?? false,
      extraScope: d.extraScope ?? null,
    };
    let result;
    try {
      result = await gm.query(MACRO_QUERY, payload, { timeout: 60 * 1000 });
    } catch (err) {
      console.error(`VAGABOND | GM relay to ${gm.name} failed:`, err);
      ui.notifications.error(game.i18n.format('VAGABOND.Macro.RelayFailed', { gm: gm.name }));
      return;
    }
    for (const n of result?.notes ?? []) ui.notifications[n.level]?.(n.message);
    if (result?.error) ui.notifications.error(game.i18n.format('VAGABOND.Macro.RelayError', { error: result.error }));
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
export function buildMacroButtonHTML({ cfg, slot, actorUuid, itemUuid, itemName, actionIndex, fallbackLabel, isCritical = false, extraScope = null }) {
  if (!cfg?.enabled) return '';
  if (!cfg.uuid && !cfg.command) return '';
  const label = cfg.label || fallbackLabel;
  const safe = foundry.utils.escapeHTML?.(label) ?? label;
  // Embed the inline command (base64) so the button still works if the source
  // item is consumed/deleted before it is clicked (e.g. last torch in a stack).
  const cmdB64 = cfg.command ? btoa(unescape(encodeURIComponent(cfg.command))) : '';
  // Per-cast scope data (e.g. spell damageDice / manaSpent) — base64 JSON so it
  // survives in a data attribute and is exposed to the macro scope on click.
  const scopeB64 = (extraScope && Object.keys(extraScope).length)
    ? btoa(unescape(encodeURIComponent(JSON.stringify(extraScope))))
    : '';
  const safeName = itemName ? (foundry.utils.escapeHTML?.(itemName) ?? itemName) : '';
  const attrs = [
    `data-action="executeItemMacro"`,
    `data-macro-slot="${slot}"`,
    actorUuid ? `data-actor-uuid="${actorUuid}"` : '',
    itemUuid ? `data-item-uuid="${itemUuid}"` : '',
    safeName ? `data-item-name="${safeName}"` : '',
    (actionIndex != null) ? `data-action-index="${actionIndex}"` : '',
    cfg.runAsGM ? `data-run-as-gm="true"` : '',
    isCritical ? `data-is-critical="true"` : '',
    cmdB64 ? `data-command-b64="${cmdB64}"` : '',
    scopeB64 ? `data-extra-scope-b64="${scopeB64}"` : '',
  ].filter(Boolean).join(' ');
  // Tile variant (`cfg.img`): picture on top, name below (Grit status mosaic)
  if (cfg.img) {
    const src = foundry.utils.escapeHTML?.(cfg.img) ?? cfg.img;
    return `<button class="vagabond-macro-button" ${attrs} style="display:flex;flex-direction:column;align-items:center;gap:3px;height:auto;line-height:normal;padding:4px;min-width:0;">
            <img src="${src}" width="50" height="50" style="width:50px;height:50px;border:0;object-fit:contain;">
            <span style="max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:0.85em;">${safe}</span>
          </button>`;
  }
  return `<button class="vagabond-macro-button" ${attrs}>
            <i class="${faIconClasses(cfg.icon)}"></i> ${safe}${cfg.runAsGM ? ' <i class="fa-solid fa-user-shield vagabond-macro-gm" title="Runs as GM"></i>' : ''}
          </button>`;
}
