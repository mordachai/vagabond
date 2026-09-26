import { MaterialsHelper } from '../materials-helper.mjs';
import { ProjectHelper } from './project-helper.mjs';
import { RelicHelper } from '../relic-helper.mjs';

/**
 * Relic Forge: craft a relic Power onto an already-owned host item over one or
 * more Shifts (RAW §1 Relics; docs/crafting-plan.md §4.3). Shaped exactly like
 * `craft` — one `recipe` is one Shift-portion of value, continuing an existing
 * `projectId` or starting a new one from `hostItemId` + `powerUuid`. Posts no
 * chat card of its own; `workShift` (which also drives `craft`) posts the summary.
 */
export const RelicForgeMode = {
  key: 'relicForge',
  label: 'VAGABOND.Craft.Modes.RelicForge.Label',
  icon: 'fa-solid fa-gem',
  time: 'shift',

  available(actor) {
    return actor?.type === 'character';
  },

  evaluate(actor, recipe) {
    const checks = [];
    const amount = Math.max(0, Math.floor(Number(recipe?.amount) || 0));
    checks.push({ ok: amount > 0, key: 'amount', label: 'VAGABOND.Craft.Checks.Amount' });

    let value = 0;
    let progress = 0;
    let paid = 0;
    let targetOk = true;
    if (recipe?.projectId) {
      const project = ProjectHelper.get(actor, recipe.projectId);
      targetOk = !!project && project.flags.vagabond.craftProject.kind === 'relicPower';
      if (targetOk) ({ value, progress, materialsPaid: paid } = project.flags.vagabond.craftProject);
    } else if (recipe?.hostItemId && recipe?.powerUuid) {
      const hostItem = actor.items.get(recipe.hostItemId);
      const powerItem = fromUuidSync(recipe.powerUuid);
      targetOk = !!hostItem && !!powerItem && RelicHelper.canAttach(hostItem, powerItem);
      if (targetOk) value = RelicHelper.snapshotPower(powerItem).value;
    } else {
      targetOk = false;
    }
    checks.push({ ok: targetOk, key: 'target', label: 'VAGABOND.Craft.Checks.RelicTarget' });

    const add = Math.min(amount, Math.max(0, value - progress));
    const materialsCost = ProjectHelper.materialsFor(value, progress, paid, add);
    const materialsOk = MaterialsHelper.totalValue(actor) >= materialsCost;
    checks.push({ ok: materialsOk, key: 'materials', label: 'VAGABOND.Craft.Checks.Materials' });

    const ok = checks.every(c => c.ok);
    return { ok, checks, cost: { copper: materialsCost, materials: materialsCost, studiedDice: 0, action: null } };
  },

  async execute(actor, recipe) {
    const evaluation = RelicForgeMode.evaluate(actor, recipe);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };

    const amount = Math.max(0, Math.floor(Number(recipe.amount) || 0));

    let projectId = recipe.projectId;
    if (!projectId) {
      const hostItem = actor.items.get(recipe.hostItemId);
      const powerItem = await fromUuid(recipe.powerUuid);
      const started = await ProjectHelper.createRelicPowerProject(actor, hostItem, powerItem);
      if (!started.ok) return started;
      projectId = started.project.id;
    }

    const result = await ProjectHelper.addProgress(actor, projectId, amount, { actorName: recipe.actorName });
    if (!result.ok) return { ok: false, reason: result.reason };
    return { ok: true, added: result.added, completedItem: result.completedItem ?? null, hostItem: result.hostItem ?? null, projectId };
  },
};
