/**
 * GM relay — the ONE way a client asks the active GM to do what it may not do itself
 * (write a document it doesn't own, create a journal, upload a file …).
 *
 * Built on Foundry queries (`CONFIG.queries` + `User#query`): the caller can await the
 * handler's answer, GM-side errors come back to it, and when this user IS the active GM the
 * handler simply runs here (a socket emit never reaches its own sender).
 *
 *   GMRelay.register(name, handler, { queue })  handler(data, user) — call on every client (init / ready)
 *   await GMRelay.run(name, data, { timeout })  the GM handler's answer; throws (`GMRelay.isNoGM(err)`) when no GM
 *   GMRelay.send(name, data)                    fire-and-forget: failures are logged and toasted (reportFailure)
 *   GMRelay.serialize(queue, fn)                run fn after the earlier jobs of that queue
 *   isActiveGM()                                this user is the active GM (world-side reactions run once)
 *
 * Handlers sharing a `queue` run one at a time, so live-data checks stay valid until their writes land.
 * Never relay from inside a handler of the same queue (it would wait on itself).
 * Messages to every client (sounds, "show to players") are broadcasts: `socket-helper.mjs`.
 * Dependency-free: anything may import it.
 */

/** This user is the active GM — the one client that runs world-side reactions. */
export function isActiveGM() {
  return !!game.users?.activeGM?.isSelf;
}

const NO_GM = 'vagabond.noGM';

export class GMRelay {
  static #handlers = new Map();
  static #queues = new Map();
  static #lastNoGMToast = 0;

  /**
   * Register a GM-side handler. Synchronous; call on every client.
   * @param {string} name  query name, `vagabond.<subject>.<verb>` for the system's own
   * @param {(data: object, user: User) => any} handler  answer must be JSON-serializable
   * @param {{queue?: string}} [opts]  serialize with every handler of that queue
   */
  static register(name, handler, { queue = null } = {}) {
    const run = queue ? (data, user) => this.serialize(queue, () => handler(data, user)) : handler;
    this.#handlers.set(name, run);
    CONFIG.queries[name] = (data, { user }) => run(data, user);
  }

  static has(name) {
    return this.#handlers.has(name);
  }

  /** Run `fn` after the earlier jobs of `queue` (a failed job never blocks the next). */
  static serialize(queue, fn) {
    const prev = this.#queues.get(queue) ?? Promise.resolve();
    const run = prev.then(() => fn());
    this.#queues.set(queue, run.catch(() => {}));
    return run;
  }

  /**
   * Run a registered handler on the active GM (here when this user is it) and return its answer.
   * `local: true` runs it here as this user whatever the GM (caller already holds the permissions).
   * @returns {Promise<any>}
   * @throws when no GM is connected (`GMRelay.isNoGM(err)`), on a GM-side error or a timeout
   */
  static async run(name, data = {}, { timeout = 30 * 1000, local = false } = {}) {
    const handler = this.#handlers.get(name);
    if (!handler) throw new Error(`GMRelay: no handler "${name}"`);
    if (local) return handler(data, game.user);
    const gm = game.users.activeGM;
    if (!gm) throw Object.assign(new Error('No GM connected'), { code: NO_GM });
    if (gm.isSelf) return handler(data, game.user);
    return gm.query(name, data, { timeout });
  }

  static isNoGM(err) {
    return err?.code === NO_GM;
  }

  /** Fire-and-forget {@link run}; failures go to {@link reportFailure}. */
  static send(name, data = {}) {
    this.run(name, data).catch(err => this.reportFailure(name, err));
  }

  /** Generic failure report: no GM → one warning (not one per call), else console + toast. Returns null. */
  static reportFailure(name, err) {
    if (this.isNoGM(err)) {
      if (Date.now() - this.#lastNoGMToast > 2000) ui.notifications.warn(game.i18n.localize('VAGABOND.GMRelay.NoGM'));
      this.#lastNoGMToast = Date.now();
    } else {
      console.error(`Vagabond | GM relay "${name}" failed`, err);
      ui.notifications.error(game.i18n.localize('VAGABOND.GMRelay.Failed'));
    }
    return null;
  }
}
