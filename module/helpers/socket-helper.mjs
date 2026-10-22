/**
 * Broadcasts for Vagabond: a message every OTHER client acts on (positional spell sounds,
 * "Show to Players" shop windows). Nothing here runs on the GM for a player — privileged
 * writes go through the GM relay (`gm-relay.mjs`, `GMRelay.send` / `GMRelay.run`).
 *
 *   registerSocket()                      — call once in the ready hook (all clients)
 *   emitSocket(action, payload)           — send to every other client (never back to the sender)
 *   registerSocketAction(action, handler) — handler(payload) runs on each receiving client
 */

const SOCKET = 'system.vagabond';
const _handlers = {};

/** Register the socket listener. Must be called in the ready hook on all clients. */
export function registerSocket() {
  game.socket.on(SOCKET, ({ action, payload }) => {
    _handlers[action]?.(payload);
  });
}

/**
 * Broadcast an action to every other connected client.
 * @param {string} action
 * @param {object} payload
 */
export function emitSocket(action, payload) {
  game.socket.emit(SOCKET, { action, payload });
}

/**
 * Register a handler for a broadcast action.
 * @param {string} action
 * @param {function} handler  (payload) => void
 */
export function registerSocketAction(action, handler) {
  _handlers[action] = handler;
}
