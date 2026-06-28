import { ProgressClock } from '../documents/progress-clock.mjs';

/**
 * Light Source automation for light-emitting items (torches, candles, lanterns,
 * sunrods, …). On Use, an item's inline macro calls {@link LightSource.use},
 * which applies a token light and — for timed items — spawns a burn-down timer.
 *
 * Timer modes (chosen in a dialog at use time):
 *  - `realtime` : a *tracker* progress clock counting up from `-durationMin` → 0
 *                 in real wall-clock minutes. Refresh-safe: the remaining value
 *                 is recomputed from a stored start timestamp, so a page reload
 *                 (or GM relog) does not lose time. At 0 the clock is deleted.
 *  - `hour`     : a 6-segment progress clock (rules: 1 Hour = 6 Scenes). GM ticks
 *                 it down; at 0 the clock is deleted.
 *  - `quarter`  : a 4-segment progress clock (¼ day / 1 Shift).
 *
 * Manual items (`durationMin == null`, e.g. Sunrod, Tindertwig) skip the dialog:
 * the light is applied and only the "Douse Light" hotbar macro turns it off.
 *
 * Douse == delete the timer clock; the `deleteJournalEntry` hook in vagabond.mjs
 * then restores the token's previous light from `flags.vagabond.prevLight`.
 * Manual items have no clock, so {@link LightSource.douse} restores the light
 * directly.
 *
 * Privileged writes (JournalEntry create/delete, non-owned token.update) are
 * relayed to the active GM via the system socket (see socket-helper.mjs and the
 * `lightApply` / `lightDouse` / `lightSpawnClock` / `lightDeleteClock` actions
 * registered in vagabond.mjs).
 */
export class LightSource {
  /** Real-time driver handle (set by {@link LightSource.startDriver}). */
  static #driver = null;

  /* --------------------------------------------------------------------- */
  /*  Entry point (called from item inline macros)                         */
  /* --------------------------------------------------------------------- */

  /**
   * @param {object} o
   * @param {Actor}  o.actor
   * @param {Item}   [o.item]
   * @param {Token|TokenDocument} [o.token]
   * @param {object} o.light                  Foundry token light config (partial OK)
   * @param {number|null} [o.durationMin=60]  Realtime burn minutes; `null` = manual-only
   */
  static async use({ actor, item, token, light, durationMin = 60 } = {}) {
    const tdoc = this._resolveTokenDoc(token, actor);
    if (!tdoc) return ui.notifications.warn('Vagabond | No token on the canvas to light.');
    if (!light) return ui.notifications.warn('Vagabond | This item has no light configuration.');

    // Manual-only items: apply light, no timer, no dialog.
    if (durationMin == null) {
      await this._applyLight(tdoc, light);
      ui.notifications.info(`${item?.name ?? 'Light'} lit — douse it manually.`);
      return;
    }

    const choice = await this._promptMode(item?.name ?? 'Light Source', durationMin);
    if (!choice || choice === 'cancel') return;

    await this._applyLight(tdoc, light);

    const meta = { name: `${item?.name ?? 'Light'} (${tdoc.name})`, tokenUuid: tdoc.uuid };
    if (choice === 'realtime') {
      await this._spawnClock({ ...meta, mode: 'realtime', kind: 'tracker', segments: 0,
        filled: -durationMin, durationMin, startTime: Date.now() });
    } else if (choice === 'hour') {
      await this._spawnClock({ ...meta, mode: 'clock', kind: 'clock', segments: 6, filled: 6 });
    } else if (choice === 'quarter') {
      await this._spawnClock({ ...meta, mode: 'clock', kind: 'clock', segments: 4, filled: 4 });
    } else if (choice === 'lit') {
      // Lit only — no timer clock; douse manually with the hotbar macro.
      ui.notifications.info(`${item?.name ?? 'Light'} lit — douse it manually.`);
    }
  }

  /* --------------------------------------------------------------------- */
  /*  Douse (public — used by the hotbar macro and manual items)           */
  /* --------------------------------------------------------------------- */

  /**
   * Extinguish a token's light: delete any timer clock bound to it (the delete
   * hook restores the light) and restore `prevLight` directly (covers manual
   * items that have no clock). Idempotent.
   * @param {Token|TokenDocument|Actor|string} target
   */
  static async douse(target) {
    const tdoc = this._resolveTokenDoc(target) ?? this._resolveTokenDoc(null, target);
    if (!tdoc) return ui.notifications.warn('Vagabond | No token to douse.');

    const clocks = ProgressClock.getAll().filter(
      j => j.getFlag('vagabond', 'lightSource')?.tokenUuid === tdoc.uuid
    );
    for (const j of clocks) await this._deleteClock(j.id);

    await this._restoreLight(tdoc);
  }

  /* --------------------------------------------------------------------- */
  /*  Real-time driver (GM only)                                           */
  /* --------------------------------------------------------------------- */

  /** Start the once-per-minute realtime tick (idempotent). Call in the ready hook. */
  static startDriver() {
    if (this.#driver) return;
    this.#driver = setInterval(() => this.tickRealtime(), 60_000);
    this.tickRealtime(); // immediate recompute on load (refresh-safe)
  }

  /**
   * Recompute every realtime light clock from its stored start timestamp.
   * Only the active GM writes, to avoid duplicate updates with multiple GMs.
   */
  static async tickRealtime() {
    if (game.user !== game.users.activeGM) return;
    for (const j of ProgressClock.getAll()) {
      const ls = j.getFlag('vagabond', 'lightSource');
      if (ls?.mode !== 'realtime') continue;

      const elapsed = Math.floor((Date.now() - (ls.startTime ?? 0)) / 60_000);
      if (elapsed >= ls.durationMin) { await j.delete(); continue; } // burned out → douse via delete hook

      const filled = Math.min(0, elapsed - ls.durationMin); // -durationMin … 0
      const cur = foundry.utils.getProperty(j, 'flags.vagabond.progressClock.filled');
      if (filled !== cur) await j.update({ 'flags.vagabond.progressClock.filled': filled });
    }
  }

  /* --------------------------------------------------------------------- */
  /*  Internals                                                            */
  /* --------------------------------------------------------------------- */

  /**
   * Resolve a Token / TokenDocument / Actor / uuid into a TokenDocument.
   * @param {Token|TokenDocument|Actor|string} ref
   * @param {Actor} [actor]  fallback when ref is null (use the actor's token)
   * @returns {TokenDocument|null}
   */
  static _resolveTokenDoc(ref, actor) {
    if (ref?.documentName === 'Token') return ref;                 // TokenDocument
    if (ref?.document?.documentName === 'Token') return ref.document; // Token placeable
    if (ref?.documentName === 'Actor') actor = ref;
    if (typeof ref === 'string') {
      const doc = fromUuidSync?.(ref);
      if (doc?.documentName === 'Token') return doc;
    }
    return actor?.token ?? actor?.getActiveTokens?.(true)?.[0]?.document ?? null;
  }

  /**
   * Burn-down mode dialog. Four choice cards (icon + label + hint) in a grid;
   * Cancel sits alone in the footer. Resolves to the action string (or 'cancel').
   * Cards are custom HTML wired after render; Cancel is the lone footer button.
   */
  static _promptMode(name, durationMin) {
    const { DialogV2 } = foundry.applications.api;
    const opts = [
      { action: 'lit',      icon: 'fas fa-fire',      top: 'No Clock', hint: 'Lit only' },
      { action: 'realtime', icon: 'fas fa-stopwatch', top: 'Realtime', hint: `${durationMin} min` },
      { action: 'hour',     icon: 'fas fa-clock',     top: '1 Hour',   hint: '6 scenes' },
      { action: 'quarter',  icon: 'fas fa-moon-stars',top: '1 Shift',  hint: '¼ Day' },
    ];
    const cards = opts.map((o) => `
      <div class="vbd-choice-item">
        <button type="button" class="vbd-choice-card" data-mode="${o.action}">
          <span class="vbd-choice-icon"><i class="${o.icon}"></i></span>
          <span class="vbd-choice-label">${o.top}</span>
        </button>
        <span class="vbd-choice-sub">${o.hint}</span>
      </div>`).join('');
    const content = `
      <div class="vbd-choice">
        <div class="vbd-choice-prompt">Make a Progress Clock?</div>
        <div class="vbd-choice-grid">${cards}</div>
      </div>`;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (val) => { if (settled) return; settled = true; resolve(val); };
      const dlg = new DialogV2({
        window: { title: `Ignite: ${name}`, icon: 'fas fa-fire' },
        classes: ['vagabond', 'vbd-choice-dialog'],
        position: { width: 600 },
        content,
        buttons: [{
          action: 'cancel',
          label: 'Cancel',
          icon: 'fas fa-xmark',
          callback: () => finish('cancel'),
        }],
        rejectClose: false,
      });
      // The `close` option callback is NOT invoked for a hand-built DialogV2
      // (only `.wait()` wires it), so resolve from the click handlers instead and
      // patch close() to settle as cancel when dismissed via X / Esc.
      const origClose = dlg.close.bind(dlg);
      dlg.close = (...args) => { finish('cancel'); return origClose(...args); };

      // Wire the card buttons after the DOM exists (the `render` option is also
      // not reliably invoked for a hand-built DialogV2). `dlg.element` is set
      // once render() resolves.
      Promise.resolve(dlg.render({ force: true })).then(() => {
        for (const btn of dlg.element?.querySelectorAll('.vbd-choice-card') ?? []) {
          btn.addEventListener('click', () => { finish(btn.dataset.mode); dlg.close(); });
        }
      });
    });
  }

  /**
   * Apply a light to a token, snapshotting the current light to `prevLight`
   * (only if none is saved yet, so relighting before dousing keeps the true
   * "off" state). Relays to the GM when the user does not own the token.
   */
  static async _applyLight(tdoc, light) {
    if (tdoc.isOwner) {
      const update = { light };
      if (tdoc.getFlag('vagabond', 'prevLight') === undefined) {
        update['flags.vagabond.prevLight'] = foundry.utils.deepClone(
          tdoc.light?.toObject?.() ?? tdoc.light ?? {}
        );
      }
      await tdoc.update(update);
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('lightApply', { tokenUuid: tdoc.uuid, light });
    }
  }

  /** Restore a token's `prevLight` and clear the flag. Relays to the GM if needed. No-op when unset. */
  static async _restoreLight(tdoc) {
    if (tdoc.getFlag('vagabond', 'prevLight') === undefined) return;
    if (tdoc.isOwner) {
      await tdoc.update({ light: tdoc.getFlag('vagabond', 'prevLight') });
      await tdoc.unsetFlag('vagabond', 'prevLight');
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('lightDouse', { tokenUuid: tdoc.uuid });
    }
  }

  /** Create a timer clock (relays to the GM for non-GMs). */
  static async _spawnClock(meta) {
    if (game.user.isGM) {
      await this._createClockGM(meta);
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('lightSpawnClock', meta);
    }
  }

  /** GM-side: build the progress clock and tag it with the lightSource flag block. */
  static async _createClockGM(meta) {
    const journal = await ProgressClock.create({
      name: meta.name,
      kind: meta.kind,
      segments: meta.segments || 4,
      filled: meta.filled,
      size: 'S',
    });
    await journal.setFlag('vagabond', 'lightSource', {
      mode: meta.mode,
      tokenUuid: meta.tokenUuid,
      durationMin: meta.durationMin ?? null,
      startTime: meta.startTime ?? null,
    });
  }

  /** Delete a clock by id (relays to the GM for non-GMs). */
  static async _deleteClock(id) {
    if (game.user.isGM) {
      await game.journal.get(id)?.delete();
    } else {
      const { emitSocket } = await import('./socket-helper.mjs');
      emitSocket('lightDeleteClock', { id });
    }
  }
}
