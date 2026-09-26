import { CurrencyHelper } from '../currency-helper.mjs';
import { MaterialsHelper } from '../materials-helper.mjs';
import { ProjectHelper } from './project-helper.mjs';

/**
 * The general `craft` mode (RAW "Craft (downtime)", docs/crafting-plan.md §1/§4.3).
 * One `recipe` = one Shift-portion of value applied to either an existing Project
 * (`recipe.projectId`) or a brand-new one (`recipe.sourceItemUuid`) — `amount` is
 * already capped to both the remaining Shift budget and the remaining value by the
 * caller (`CraftingHelper.workShift`). This mode posts no chat card of its own;
 * `workShift` posts one summary per Shift (plan §4.7 step 3).
 */
export const CraftMode = {
  key: 'craft',
  label: 'VAGABOND.Craft.Modes.Craft.Label',
  icon: 'fa-solid fa-hammer',
  time: 'shift',

  available(actor) {
    return actor?.type === 'character';
  },

  // Synchronous (per `CraftingHelper.evaluate`'s contract — it doesn't await mode
  // entries), so a `sourceItemUuid` target is resolved with `fromUuidSync`, not
  // `fromUuid`. That only returns a document already in this client's cache
  // (world items, or a compendium doc that's been indexed/fetched already) — true
  // for every path the Workbench uses (drag-and-drop always hands over a resolved
  // document first).
  evaluate(actor, recipe) {
    const checks = [];
    const amount = Math.max(0, Math.floor(Number(recipe?.amount) || 0));
    checks.push({ ok: amount > 0, key: 'amount', label: 'VAGABOND.Craft.Checks.Amount' });

    // Materials are owed pro rata to progress (ProjectHelper.materialsOwed), so the
    // check needs the Project's full value/progress/paid, not just the Shift amount.
    let value = 0;
    let progress = 0;
    let paid = 0;
    let targetOk = true;
    if (recipe?.projectId) {
      const project = ProjectHelper.get(actor, recipe.projectId);
      targetOk = !!project;
      if (project) ({ value, progress, materialsPaid: paid } = project.flags.vagabond.craftProject);
    } else if (recipe?.sourceItemUuid) {
      const source = fromUuidSync(recipe.sourceItemUuid);
      targetOk = !!source;
      if (source) value = CurrencyHelper.toCopper(source.system?.cost);
    } else {
      targetOk = false;
    }
    checks.push({ ok: targetOk, key: 'target', label: 'VAGABOND.Craft.Checks.Target' });

    const add = Math.min(amount, Math.max(0, value - progress));
    const materialsCost = ProjectHelper.materialsFor(value, progress, paid, add);
    const materialsOk = MaterialsHelper.totalValue(actor) >= materialsCost;
    checks.push({ ok: materialsOk, key: 'materials', label: 'VAGABOND.Craft.Checks.Materials' });

    const ok = checks.every(c => c.ok);
    return { ok, checks, cost: { copper: materialsCost, materials: materialsCost, studiedDice: 0, action: null } };
  },

  async execute(actor, recipe) {
    const evaluation = CraftMode.evaluate(actor, recipe);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };

    const amount = Math.max(0, Math.floor(Number(recipe.amount) || 0));

    let projectId = recipe.projectId;
    if (!projectId) {
      const source = await fromUuid(recipe.sourceItemUuid);
      if (!source) return { ok: false, reason: 'noActor' };
      const project = await ProjectHelper.create(actor, source);
      projectId = project.id;
    }

    const result = await ProjectHelper.addProgress(actor, projectId, amount, { actorName: recipe.actorName });
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, added: result.added, completedItem: result.completedItem ?? null, projectId };
  },
};
