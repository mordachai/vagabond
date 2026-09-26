import { CurrencyHelper } from '../currency-helper.mjs';
import { MaterialsHelper } from '../materials-helper.mjs';
import { VagabondChatCard } from '../chat-card.mjs';
import { AlchemyHelper } from './alchemy-helper.mjs';
import { craftingConfig } from './config.mjs';

/** Any equipped item satisfying the 'alchemy' tool kind (RAW: Alchemy Tools). */
function hasAlchemyTools(actor) {
  return actor.items.some(i => i.type === 'equipment' && i.system.equipped && i.system.toolKind === 'alchemy');
}

/**
 * Alchemy: an Alchemist crafts a KNOWN formula instantly for 5s of Materials with
 * the Use Action (RAW §1 Alchemist class table; docs/crafting-plan.md §4.3). Gated
 * on the `catalyze` AE flag (Alchemy + Catalyze are both granted at L1, so in
 * practice they're always held together — see plan note under §4.3).
 */
export const AlchemyMode = {
  key: 'alchemy',
  label: 'VAGABOND.Craft.Modes.Alchemy.Label',
  icon: 'fa-solid fa-flask',
  time: 'useAction',

  available(actor) {
    return actor?.type === 'character' && !!actor.system.craft?.catalyze;
  },

  evaluate(actor, recipe) {
    const checks = [];
    checks.push({ ok: !!actor.system.craft?.catalyze, key: 'catalyze', label: 'VAGABOND.Craft.Checks.Catalyze' });

    const known = AlchemyHelper.knows(actor, recipe?.formulaUuid);
    checks.push({ ok: known, key: 'formula', label: 'VAGABOND.Craft.Checks.KnownFormula' });

    const requirement = craftingConfig().general.toolsRequirement;
    const toolsOk = requirement !== 'block' || hasAlchemyTools(actor);
    checks.push({ ok: toolsOk, key: 'tools', label: 'VAGABOND.Craft.Checks.AlchemyTools' });

    const cost = 50; // 5s, RAW-fixed regardless of the item's own value
    const materialsOk = MaterialsHelper.totalValue(actor) >= cost;
    checks.push({ ok: materialsOk, key: 'materials', label: 'VAGABOND.Craft.Checks.Materials' });

    return { ok: checks.every(c => c.ok), checks, cost: { copper: cost, materials: cost, studiedDice: 0, action: 'use' } };
  },

  async execute(actor, recipe) {
    const evaluation = AlchemyMode.evaluate(actor, recipe);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };

    const requirement = craftingConfig().general.toolsRequirement;
    if (requirement === 'warn' && !hasAlchemyTools(actor)) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Craft.Errors.noAlchemyToolsWarn'));
    }

    const source = await fromUuid(recipe.formulaUuid);
    if (!source) return { ok: false, reason: 'noActor' };

    const spend = await MaterialsHelper.spend(actor, 50);
    if (!spend.ok) return { ok: false, reason: 'materials' };

    const existing = actor.items.find(i => i.flags?.core?.sourceId === recipe.formulaUuid && i.type === 'equipment');
    let created;
    if (existing) {
      await existing.update({ 'system.quantity': (existing.system.quantity ?? 1) + 1 });
      created = existing;
    } else {
      const data = source.toObject();
      delete data._id;
      foundry.utils.setProperty(data, 'flags.core.sourceId', recipe.formulaUuid);
      [created] = await actor.createEmbeddedDocuments('Item', [data]);
    }

    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(game.i18n.localize('VAGABOND.Craft.Modes.Alchemy.Label'))
      .setSubtitle(actor.name)
      .setDescription(`<p>${game.i18n.format('VAGABOND.Craft.Alchemy.Result', {
        actor: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong>`,
        item: `<strong>${foundry.utils.escapeHTML(created.name)}</strong>`,
      })}</p>`);
    await card.send();

    return { ok: true, createdItem: created };
  },
};

/**
 * Prima Materia (L10): spend a Studied die to Craft any Alchemical Item worth
 * ≤ 10g with NO Materials — not limited to known formulas.
 */
export const PrimaMateriaMode = {
  key: 'primaMateria',
  label: 'VAGABOND.Craft.Modes.PrimaMateria.Label',
  icon: 'fa-solid fa-mortar-pestle',
  time: 'useAction',

  available(actor) {
    return actor?.type === 'character' && !!actor.system.craft?.primaMateria;
  },

  evaluate(actor, recipe) {
    const checks = [];
    checks.push({ ok: !!actor.system.craft?.primaMateria, key: 'primaMateria', label: 'VAGABOND.Craft.Checks.PrimaMateria' });
    checks.push({ ok: (actor.system.studiedDice ?? 0) > 0, key: 'studiedDice', label: 'VAGABOND.Craft.Checks.StudiedDice' });

    const source = recipe?.itemUuid ? fromUuidSync(recipe.itemUuid) : null;
    checks.push({ ok: !!source, key: 'target', label: 'VAGABOND.Craft.Checks.Target' });
    const valueOk = !source || CurrencyHelper.toCopper(source.system?.cost) <= 10000; // 10g
    checks.push({ ok: valueOk, key: 'valueCap', label: 'VAGABOND.Craft.Checks.PrimaMateriaValueCap' });

    return { ok: checks.every(c => c.ok), checks, cost: { copper: 0, materials: 0, studiedDice: 1, action: 'use' } };
  },

  async execute(actor, recipe) {
    const evaluation = PrimaMateriaMode.evaluate(actor, recipe);
    if (!evaluation.ok) return { ok: false, reason: 'checksFailed', checks: evaluation.checks };

    const source = await fromUuid(recipe.itemUuid);
    if (!source) return { ok: false, reason: 'noActor' };

    await actor.update({ 'system.studiedDice': actor.system.studiedDice - 1 });
    const data = source.toObject();
    delete data._id;
    const [created] = await actor.createEmbeddedDocuments('Item', [data]);

    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(actor)
      .setTitle(game.i18n.localize('VAGABOND.Craft.Modes.PrimaMateria.Label'))
      .setSubtitle(actor.name)
      .setDescription(`<p>${game.i18n.format('VAGABOND.Craft.Alchemy.Result', {
        actor: `<strong>${foundry.utils.escapeHTML(actor.name)}</strong>`,
        item: `<strong>${foundry.utils.escapeHTML(created.name)}</strong>`,
      })}</p>`);
    await card.send();

    return { ok: true, createdItem: created };
  },
};
