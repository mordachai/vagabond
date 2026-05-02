/**
 * Socket relay for Vagabond system.
 *
 * Non-owner players cannot call actor.update() or JournalEntry.create() directly —
 * Foundry's server validates permissions and silently drops the write.
 * These helpers route privileged operations through the GM client via game.socket.
 *
 * Usage:
 *   registerSocket()       — call once in the ready hook (all clients)
 *   emitSocket(action, payload) — send an action to the GM client
 *   registerSocketAction(action, handler) — register a handler (GM executes)
 *
 * External modules can register their own actions:
 *   game.vagabond.socket.register('myAction', async (payload) => { ... });
 */

const SOCKET = 'system.vagabond';
const _handlers = {};

/**
 * Register the socket listener. Must be called in the ready hook on all clients.
 * Only the GM client actually executes received actions.
 */
export function registerSocket() {
  game.socket.on(SOCKET, ({ action, payload }) => {
    if (!game.user.isGM) return;
    _handlers[action]?.(payload);
  });
}

/**
 * Emit an action to be handled by the GM client.
 * @param {string} action
 * @param {object} payload
 */
export function emitSocket(action, payload) {
  game.socket.emit(SOCKET, { action, payload });
}

/**
 * Register a handler for a socket action (executed on GM client only).
 * @param {string} action
 * @param {function} handler  async (payload) => void
 */
export function registerSocketAction(action, handler) {
  _handlers[action] = handler;
}
