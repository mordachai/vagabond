import { CurrencyHelper } from './currency-helper.mjs';
import { VagabondChatCard } from './chat-card.mjs';
import { CraftMode } from './crafting/craft-mode.mjs';
import { ScrapMode } from './crafting/scrap-mode.mjs';
import { AlchemyMode, PrimaMateriaMode } from './crafting/alchemy-mode.mjs';
import { RelicForgeMode } from './crafting/relic-forge-mode.mjs';
import { MixMode } from './crafting/mix-mode.mjs';
import { ProjectHelper } from './crafting/project-helper.mjs';
import { CRAFTING_DEFAULTS, craftingConfig } from './crafting/config.mjs';

export { CRAFTING_DEFAULTS };

/**
 * Pure rules engine for the crafting system, exposed as `game.vagabond.craft`.
 * `CraftingHelper` only dispatches into `CONFIG.VAGABOND.craftModes` entries —
 * mode-specific rules live in their own files under `module/helpers/crafting/`
 * (added starting Phase 1+). See docs/crafting-plan.md §4.2.
 */
export class CraftingHelper {
  static QUERIES = Object.freeze({
    execute: 'vagabond.craft.execute',
  });

  /** Populate `CONFIG.VAGABOND.craftModes`. Call once in `init` (all clients). */
  static registerModes() {
    CONFIG.VAGABOND.craftModes.craft = CraftMode;
    CONFIG.VAGABOND.craftModes.scrap = ScrapMode;
    CONFIG.VAGABOND.craftModes.alchemy = AlchemyMode;
    CONFIG.VAGABOND.craftModes.primaMateria = PrimaMateriaMode;
    CONFIG.VAGABOND.craftModes.relicForge = RelicForgeMode;
    CONFIG.VAGABOND.craftModes.mix = MixMode;
  }

  /** Register query handlers. Call once in `init` (all clients). */
  static registerQueries() {
    CONFIG.queries[this.QUERIES.execute] = (data, { user }) =>
      this.#serialize(() => this.#handleExecuteQuery(data, user));
  }

  /** Merged `craftingConfig` world setting over {@link CRAFTING_DEFAULTS}. Never read the raw setting elsewhere. */
  static config() {
    return craftingConfig();
  }

  /**
   * Copper value an actor can Craft per Shift, from their Craft skill difficulty
   * and the configured value-per-shift table. 0 if the actor has no Craft skill.
   * @param {Actor} actor
   */
  static valuePerShift(actor) {
    const difficulty = actor?.system?.skills?.craft?.difficulty;
    if (typeof difficulty !== 'number') return 0;
    return this.valuePerShiftForDifficulty(difficulty);
  }

  /** Copper for a raw Craft difficulty value, banded per the configured table. */
  static valuePerShiftForDifficulty(difficulty) {
    const table = this.config().general.valuePerShift;
    const bands = Object.entries(table).map(([range, copper]) => {
      const [a, b] = range.split('-').map(Number);
      return { max: a, min: Number.isFinite(b) ? b : a, copper: Number(copper) || 0 };
    }).sort((x, y) => y.max - x.max);
    if (!bands.length) return 0;
    for (const band of bands) {
      if (difficulty >= band.min && difficulty <= band.max) return band.copper;
    }
    // Out of table range: worse than the hardest band → its rate; better than
    // the easiest band → its rate.
    return difficulty > bands[0].max ? bands[0].copper : bands[bands.length - 1].copper;
  }

  /**
   * Evaluate whether `actor` can perform `modeKey` with `recipe` right now, without
   * spending anything. Drives every Workbench button/checklist state.
   * @returns {{ok: boolean, checks: Array<{ok: boolean, key: string, label: string, reason?: string}>, cost: {copper: number, materials: number, studiedDice: number, action: string|null}}}
   */
  static evaluate(actor, modeKey, recipe, opts = {}) {
    const mode = CONFIG.VAGABOND.craftModes[modeKey];
    if (!mode) {
      return {
        ok: false,
        checks: [{ ok: false, key: 'mode', label: 'VAGABOND.Craft.Checks.Mode', reason: 'unknownMode' }],
        cost: { copper: 0, materials: 0, studiedDice: 0, action: null },
      };
    }
    return mode.evaluate(actor, recipe, opts);
  }

  /**
   * Re-evaluate, pay, apply, and post a chat card for `modeKey`. Fires
   * `vagabond.preCraft` (mutable ctx, cancellable) / `vagabond.postCraft`.
   * @returns {Promise<{ok: boolean, reason?: string, checks?: object[]}>}
   */
  static async execute(actor, modeKey, recipe, opts = {}) {
    const evaluation = this.evaluate(actor, modeKey, recipe, opts);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };
    const mode = CONFIG.VAGABOND.craftModes[modeKey];
    if (!mode?.execute) return { ok: false, reason: 'unknownMode' };

    const ctx = { actor, modeKey, recipe, opts, evaluation };
    if (Hooks.call('vagabond.preCraft', ctx) === false) return { ok: false, reason: 'cancelled' };

    const result = await mode.execute(ctx.actor, ctx.recipe, ctx.opts);
    Hooks.callAll('vagabond.postCraft', { ...ctx, result });
    return result;
  }

  /**
   * Entry point for UI/macro calls: runs `execute()` directly, unless the
   * `approval` setting requires a GM chat sign-off and the caller isn't a GM —
   * then it posts a request card and waits for Approve/Deny.
   */
  static async request(actor, modeKey, recipe, opts = {}) {
    if (this.config().general.approval !== 'chat' || game.user.isGM) {
      return this.execute(actor, modeKey, recipe, opts);
    }
    return this.#postApprovalRequest(actor, modeKey, recipe, opts);
  }

  /** Localized text for a failure reason. */
  static reasonLabel(reason) {
    return game.i18n.localize(`VAGABOND.Craft.Errors.${reason ?? 'error'}`);
  }

  /**
   * "Work a Shift": spend `actor`'s Value/Shift budget across one or more `craft`
   * allocations, then post a single summary chat card (plan §4.7). Unlike
   * `request()`, this always runs directly (no GM-approval gate) —
   * approval-gated crafting and the Shift engine don't currently compose; see
   * docs/crafting-plan.md Phase 2 as-built notes.
   * @param {Actor} actor
   * @param {Array<{projectId?: string, sourceItemUuid?: string, amount: number}>} allocations
   * @returns {Promise<{ok: boolean, reason?: string, budget?: number, spent?: number, results?: object[]}>}
   */
  static async workShift(actor, allocations = []) {
    const budget = this.valuePerShift(actor);
    const spent = allocations.reduce((sum, a) => sum + (Math.max(0, Math.floor(Number(a.amount) || 0))), 0);
    if (spent <= 0) return { ok: false, reason: 'amount' };
    if (spent > budget) return { ok: false, reason: 'budget' };

    const results = [];
    for (const allocation of allocations) {
      const result = await this.execute(actor, 'craft', { ...allocation, actorName: actor.name });
      results.push({ allocation, result });
    }

    await this.#postShiftSummary(actor, budget, spent, results);
    return { ok: true, budget, spent, results };
  }

  /**
   * Resolve a pending approval card (GM-only click). Re-validates and runs
   * `execute()` locally on approve; just marks the card denied on deny.
   */
  static async resolveApproval(messageId, approve) {
    const message = game.messages.get(messageId);
    const req = message?.flags?.vagabond?.craftRequest;
    if (!req || req.status !== 'pending') return;
    const actor = req.actorUuid ? await fromUuid(req.actorUuid) : null;

    let resultText;
    if (!approve) {
      resultText = game.i18n.localize('VAGABOND.Craft.Approval.Denied');
    } else if (!actor) {
      resultText = `${game.i18n.localize('VAGABOND.Craft.Approval.Failed')} (${this.reasonLabel('noActor')})`;
    } else {
      const result = await this.execute(actor, req.modeKey, req.recipe, req.opts);
      resultText = result.ok
        ? game.i18n.localize('VAGABOND.Craft.Approval.Approved')
        : `${game.i18n.localize('VAGABOND.Craft.Approval.Failed')} (${this.reasonLabel(result.reason)})`;
    }

    const newContent = message.content.replace(
      /<div class="gm-only vagabond-craft-approval-buttons">[\s\S]*?<\/div>/,
      `<p class="vagabond-craft-approval-result">${resultText}</p>`,
    );
    await message.update({
      content: newContent,
      'flags.vagabond.craftRequest.status': approve ? 'approved' : 'denied',
    });
  }

  /* -------------------------------------------- */
  /*  Internals                                   */
  /* -------------------------------------------- */

  static async #postApprovalRequest(actor, modeKey, recipe, opts) {
    const mode = CONFIG.VAGABOND.craftModes[modeKey];
    const modeLabel = mode?.label ? game.i18n.localize(mode.label) : modeKey;
    const evaluation = this.evaluate(actor, modeKey, recipe, opts);
    const costLabel = evaluation.cost?.copper ? CurrencyHelper.format(evaluation.cost.copper) : '—';

    const card = new VagabondChatCard().setActor(actor).setType('craftRequest')
      .setTitle(game.i18n.localize('VAGABOND.Craft.Approval.Title'))
      .setSubtitle(modeLabel)
      .setDescription(`<p>${game.i18n.format('VAGABOND.Craft.Approval.Description', {
        actor: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong>`,
        mode: modeLabel,
        cost: `<strong>${costLabel}</strong>`,
      })}</p>`);
    card.addFooterAction(`
      <div class="gm-only vagabond-craft-approval-buttons">
        <button type="button" class="vagabond-craft-approve-button"><i class="fas fa-check"></i> ${game.i18n.localize('VAGABOND.Craft.Approval.Approve')}</button>
        <button type="button" class="vagabond-craft-deny-button"><i class="fas fa-xmark"></i> ${game.i18n.localize('VAGABOND.Craft.Approval.Deny')}</button>
      </div>
    `);

    const content = await card.render();
    return ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor }),
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      flags: {
        vagabond: {
          actorId: actor.uuid,
          craftRequest: { actorUuid: actor.uuid, modeKey, recipe, opts, status: 'pending' },
        },
      },
    });
  }

  static async #handleExecuteQuery({ actorUuid, modeKey, recipe, opts }, user) {
    const actor = await fromUuid(actorUuid);
    if (!actor) return { ok: false, reason: 'noActor' };
    if (!user.isGM && !actor.testUserPermission(user, 'OWNER')) return { ok: false, reason: 'permission' };
    return this.execute(actor, modeKey, recipe, opts);
  }

  static async #postShiftSummary(actor, budget, spent, results) {
    const lines = await Promise.all(results.map(async ({ allocation, result }) => {
      if (!result.ok) {
        const failedCheck = result.reason === 'checksFailed' ? result.checks?.find(c => !c.ok) : null;
        const reason = failedCheck ? game.i18n.localize(failedCheck.label) : this.reasonLabel(result.reason);
        return `<li>${game.i18n.format('VAGABOND.Craft.Shift.LineFailed', {
          amount: CurrencyHelper.format(allocation.amount), reason,
        })}</li>`;
      }
      if (result.completedItem) {
        return `<li>${game.i18n.format('VAGABOND.Craft.Shift.LineCompleted', {
          item: `<strong>${foundry.utils.escapeHTML(result.completedItem.name)}</strong>`,
        })}</li>`;
      }
      const project = ProjectHelper.get(actor, result.projectId);
      const data = project?.flags?.vagabond?.craftProject;
      return `<li>${game.i18n.format('VAGABOND.Craft.Shift.LineProgress', {
        item: `<strong>${foundry.utils.escapeHTML(project?.flags?.vagabond?.craftProject?.target?.name ?? '')}</strong>`,
        progress: CurrencyHelper.format(data?.progress ?? 0),
        value: CurrencyHelper.format(data?.value ?? 0),
      })}</li>`;
    }));
    const wasted = budget - spent;

    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(game.i18n.localize('VAGABOND.Craft.Shift.Title'))
      .setSubtitle(actor.name)
      .setDescription(`
        <p>${game.i18n.format('VAGABOND.Craft.Shift.Summary', {
          actor: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong>`,
          spent: `<strong>${CurrencyHelper.format(spent)}</strong>`,
          budget: `<strong>${CurrencyHelper.format(budget)}</strong>`,
        })}</p>
        <ul>${lines.join('')}</ul>
        ${wasted > 0 ? `<p><em>${game.i18n.format('VAGABOND.Craft.Shift.Wasted', { value: CurrencyHelper.format(wasted) })}</em></p>` : ''}
      `);
    await card.send();
  }

  static #queue = Promise.resolve();

  /** Run GM-relayed handlers one at a time (mirrors ShopTransactions). */
  static #serialize(fn) {
    const run = this.#queue.then(() => fn());
    this.#queue = run.catch(() => {});
    return run;
  }
}
