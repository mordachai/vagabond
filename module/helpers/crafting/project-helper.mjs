import { CurrencyHelper } from '../currency-helper.mjs';
import { MaterialsHelper } from '../materials-helper.mjs';

/**
 * A "Project" is an ordinary `equipment` item flagged `flags.vagabond.craftProject`
 * that stands in for an item being Crafted over one or more Shifts. See
 * docs/crafting-plan.md §4.4. Single choke point for creating/advancing/completing
 * Projects — `CraftModeHandler` (`crafting/craft-mode.mjs`) is the only caller.
 */
export class ProjectHelper {
  static WIP_ART = 'icons/tools/smithing/hammer-maul-steel-grey.webp';

  /** All Project items on `actor`. */
  static projectsOf(actor) {
    return (actor?.items ?? []).filter(i => !!i.flags?.vagabond?.craftProject);
  }

  /** A single Project item by id, or null if it isn't (or is no longer) a Project. */
  static get(actor, projectId) {
    const item = actor?.items?.get(projectId);
    return item?.flags?.vagabond?.craftProject ? item : null;
  }

  /**
   * Total Materials owed once `progress` of a `value`-copper Project is done. The
   * whole Project costs half its value (rounded up), paid pro rata as it's worked:
   * 30% of the job done = 30% of the Materials paid. Rounding is on the running
   * total, so small Shift increments never overpay across a long Project.
   */
  static materialsOwed(value, progress) {
    if (!(value > 0)) return 0;
    const total = Math.ceil(value / 2);
    return Math.ceil(total * Math.min(Math.max(0, progress), value) / value);
  }

  /** Materials to spend for adding `add` copper of progress on top of `progress` (with `paid` already spent). */
  static materialsFor(value, progress, paid, add) {
    return Math.max(0, this.materialsOwed(value, progress + add) - (paid || 0));
  }

  /**
   * Start a new Project for `sourceItem` (a full Item document — world, compendium,
   * or already-embedded — whose `system.cost` becomes the Project's value in copper).
   * The Project occupies the finished item's own slots (decision D8): it's a real
   * `equipment` item created with the source's own `baseSlots`/`equipmentType`.
   * @param {Actor} actor
   * @param {Item} sourceItem
   * @returns {Promise<Item>} the created Project item
   */
  static async create(actor, sourceItem) {
    const target = sourceItem.toObject();
    delete target._id;
    delete target.folder;
    delete target.sort;
    delete target.ownership;
    const value = CurrencyHelper.toCopper(sourceItem.system.cost);

    const [created] = await actor.createEmbeddedDocuments('Item', [{
      name: `${target.name} (Project)`,
      type: 'equipment',
      img: this.WIP_ART,
      system: {
        equipmentType: target.system?.equipmentType ?? 'gear',
        baseSlots: target.system?.baseSlots ?? 1,
        quantity: 1,
        description: `<p>${game.i18n.format('VAGABOND.Craft.Project.WipDescription', { name: target.name })}</p>`,
      },
      flags: {
        vagabond: {
          craftProject: {
            kind: 'item',
            target,
            value,
            progress: 0,
            materialsPaid: 0,
            ownerActorUuid: actor.uuid,
            log: [],
          },
        },
      },
    }]);
    return created;
  }

  /**
   * Start a new `relicPower` Project: crafting `powerItem` onto an already-owned
   * `hostItem` over one or more Shifts (RAW §1 Relics — "Crafting Relics: over
   * several Shifts; requires time, Materials, and for some Relics a specific
   * Material"). A lightweight tracking item (0 Slots — the host already occupies
   * its own) since nothing new enters the inventory; on completion the power
   * attaches to the EXISTING host via `RelicHelper.attachPower`, this tracker
   * deletes.
   * @param {Actor} actor
   * @param {Item} hostItem - already-owned equipment item the power will attach to
   * @param {Item} powerItem - a `relicPower`-enabled item (world/compendium)
   * @returns {Promise<{ok: boolean, reason?: string, project?: Item}>}
   */
  static async createRelicPowerProject(actor, hostItem, powerItem) {
    const { RelicHelper } = await import('../relic-helper.mjs');
    if (!RelicHelper.canAttach(hostItem, powerItem)) return { ok: false, reason: 'relicTargetMismatch' };

    const power = RelicHelper.snapshotPower(powerItem);
    const [created] = await actor.createEmbeddedDocuments('Item', [{
      name: `${hostItem.name}: ${power.name} (Project)`,
      type: 'equipment',
      img: this.WIP_ART,
      system: { equipmentType: 'gear', baseSlots: 0, quantity: 1 },
      flags: {
        vagabond: {
          craftProject: {
            kind: 'relicPower',
            hostItemId: hostItem.id,
            power,
            value: power.value,
            progress: 0,
            materialsPaid: 0,
            requiredMaterials: (powerItem.system.relicPower.requiredMaterials ?? []).map(m => ({ ...m, met: false })),
            ownerActorUuid: actor.uuid,
            log: [],
          },
        },
      },
    }]);
    return { ok: true, project: created };
  }

  /**
   * Apply `amount` copper of Shift progress to a Project, spending half of it in
   * Materials immediately (RAW: Materials worth at least half the value crafted).
   * Completes once progress reaches its value: `kind: 'item'` replaces the
   * Project with the finished item; `kind: 'relicPower'` attaches the power to
   * its host (`hostItemId`) via `RelicHelper.attachPower` and consumes any
   * `requiredMaterials` (specific materials, checked only at completion) before
   * deleting the tracker.
   * @param {Actor} actor - owner of the Project (never the helper — see
   *   `CraftingHelper.contribute` for the GM-relayed cross-actor path)
   * @param {string} projectId
   * @param {number} amount - copper to add this Shift, already capped by the caller
   *   to both the remaining Shift budget and the remaining value-to-complete
   * @param {object} [opts]
   * @param {string} [opts.actorName] - name recorded in the Project log (the actor
   *   who actually contributed the Shift — may differ from `actor` when helping)
   * @returns {Promise<{ok: boolean, reason?: string, added?: number, completedItem?: Item, hostItem?: Item, project?: Item}>}
   */
  static async addProgress(actor, projectId, amount, { actorName } = {}) {
    const project = this.get(actor, projectId);
    if (!project) return { ok: false, reason: 'noProject' };
    const data = project.flags.vagabond.craftProject;
    const remaining = data.value - data.progress;
    const add = Math.max(0, Math.min(Math.floor(amount) || 0, remaining));
    if (add <= 0) return { ok: false, reason: 'complete' };

    // NOTE: a relicPower Project's `requiredMaterials` (specific materials like
    // "1 dragon scale") are NOT enforced or consumed here — MaterialsHelper's
    // pool is copper-value based, not item-count based, and specific-Material
    // gating needs its own check. Deferred; see docs/crafting-plan.md Phase 4
    // as-built notes. The generic half-value Materials cost below still applies.
    const materialsCost = this.materialsFor(data.value, data.progress, data.materialsPaid, add);
    const spend = await MaterialsHelper.spend(actor, materialsCost);
    if (!spend.ok) return { ok: false, reason: 'materials' };

    const newProgress = data.progress + add;
    const log = [...(data.log ?? []), { ts: Date.now(), actorName: actorName ?? actor.name, added: add }];

    if (newProgress >= data.value) {
      if (data.kind === 'relicPower') {
        const hostItem = actor.items.get(data.hostItemId);
        await actor.deleteEmbeddedDocuments('Item', [projectId]);
        if (!hostItem) return { ok: true, added: add, completedItem: null };
        const { RelicHelper } = await import('../relic-helper.mjs');
        await RelicHelper.applyPowerSnapshot(hostItem, data.power);
        return { ok: true, added: add, hostItem, completedItem: hostItem };
      }
      const finished = foundry.utils.deepClone(data.target);
      delete finished._id;
      await actor.deleteEmbeddedDocuments('Item', [projectId]);
      const [created] = await actor.createEmbeddedDocuments('Item', [finished]);
      return { ok: true, added: add, completedItem: created };
    }

    await project.update({
      'flags.vagabond.craftProject.progress': newProgress,
      'flags.vagabond.craftProject.materialsPaid': (data.materialsPaid || 0) + materialsCost,
      'flags.vagabond.craftProject.log': log,
    });
    return { ok: true, added: add, project };
  }
}
