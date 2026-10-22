import { GrantsHandlers } from './item-sheet-grants.mjs';
import { VagabondDamagePipeline } from '../helpers/damage-pipeline.mjs';
import { levelTableCap } from '../helpers/homebrew-config.mjs';
import { FeatureAction } from '../helpers/feature-action.mjs';

/**
 * Render context of VagabondItemSheet parts: text enrichment and the per-type details tabs
 * (Ancestry, Class, Perk, Starting Pack). Each builder fills `context`; `sheet` is the item sheet.
 */
export class ItemSheetContext {
  /** Enrich an item text the way every tab does (owner secrets, item roll data). */
  static enrich(sheet, text) {
    return foundry.applications.ux.TextEditor.enrichHTML(text, {
      secrets: sheet.document.isOwner,
      rollData: sheet.item.getRollData(),
      relativeTo: sheet.item,
    });
  }

  /** UUID list -> [{uuid, name, img}]; an entry that can't be resolved shows its uuid. */
  static async refs(uuids) {
    const out = [];
    for (const uuid of uuids || []) {
      if (!uuid) continue;
      try {
        const doc = await fromUuid(uuid);
        out.push({ uuid, name: doc?.name || uuid, img: doc?.img || 'icons/svg/item-bag.svg' });
      } catch (e) {
        out.push({ uuid, name: uuid, img: 'icons/svg/item-bag.svg' });
      }
    }
    return out;
  }

  /** Display data of a grant entry (Ancestry trait / Class level feature), added onto `entry`. */
  static async enrichGrants(sheet, entry) {
    entry.enrichedDescription = await ItemSheetContext.enrich(sheet, entry.description || '');
    entry.enrichedSpells = await ItemSheetContext.refs(entry.requiredSpells);
    entry.enrichedPerks = await ItemSheetContext.refs(entry.allowedPerks);
    entry.enrichedItems = await GrantsHandlers.enrichGrantedItems(entry.grantedItems);
    entry.enrichedItemChoices = await GrantsHandlers.enrichItemChoices(entry.itemChoices);
    entry.grantRows = ItemSheetContext.grantRows(entry, sheet.item);
    return entry;
  }

  /**
   * Read-view rows of what a grant entry gives (locked sheet): `[{icon, label, text?, note?, refs?, choose?}]`.
   * Call after `enrichGrants` filled the `enriched*` refs. `owner` = the Ancestry / Class (effect choices).
   */
  static grantRows(entry, owner) {
    const t = (key, data) => game.i18n.format(`VAGABOND.Grants.Summary.${key}`, data);
    const skill = (k) => game.i18n.localize(CONFIG.VAGABOND.skills?.[k] ?? k);
    const choose = (n, refs) => t(refs?.length ? 'Choose' : 'ChooseAny', { n });
    const prereqNote = { all: 'PrereqsAll', stats: 'PrereqsStats' }[entry.ignorePerkPrereqs];
    const rows = [];

    if (entry.statBonusPoints > 0) {
      rows.push({ icon: 'fa-solid fa-dumbbell', label: t('Stats'), text: t('StatPoints', { n: entry.statBonusPoints }) });
    }
    if (entry.extraTraining > 0) {
      rows.push({ icon: 'fa-solid fa-graduation-cap', label: t('Training'), text: t('ExtraTraining', { n: entry.extraTraining }) });
    }
    for (const group of entry.skillChoices || []) {
      const pool = (group.pool || []).map(skill).join(', ');
      rows.push({
        icon: 'fa-solid fa-graduation-cap',
        label: group.label || t('Training'),
        text: pool ? `${t('ChooseOf', { n: group.count })} ${pool}` : t('ChooseAny', { n: group.count }),
      });
    }
    if (entry.spellAmount > 0 || entry.enrichedSpells?.length) {
      rows.push({
        icon: 'fa-solid fa-wand-sparkles',
        label: t('Spells'),
        text: entry.spellAmount > 0 ? choose(entry.spellAmount, entry.enrichedSpells) : '',
        refs: entry.enrichedSpells,
      });
    }
    if (entry.perkAmount > 0 || entry.enrichedPerks?.length) {
      rows.push({
        icon: 'fa-solid fa-star',
        label: t('Perks'),
        text: entry.perkAmount > 0 ? choose(entry.perkAmount, entry.enrichedPerks) : '',
        note: prereqNote && t(prereqNote),
        refs: entry.enrichedPerks,
      });
    }
    if (entry.enrichedItems?.length) {
      rows.push({ icon: 'fa-solid fa-gift', label: t('Items'), refs: entry.enrichedItems });
    }
    for (const group of entry.enrichedItemChoices || []) {
      rows.push({ icon: 'fa-solid fa-gift', label: group.label || t('Items'), text: choose(group.count, group.items), refs: group.items });
    }
    // Effect choices: the owner's own effects; on a character's copy a made pick left only the chosen ones
    for (const choice of entry.effectChoices || []) {
      const effects = (choice.pool || []).map((id) => owner?.effects?.get(id)).filter(Boolean);
      if (!effects.length) continue;
      const count = Math.max(1, Math.min(choice.count || 1, effects.length));
      const open = effects.length > count;
      rows.push({
        icon: 'fa-solid fa-sparkles',
        label: choice.label || t('Effects'),
        text: open ? t('Choose', { n: count }) : '',
        refs: effects.map((e) => ({ uuid: e.uuid, name: e.name, img: e.img })),
        choose: open && owner.parent?.type === 'character' && owner.isOwner,
      });
    }
    if (entry.action?.enabled) {
      rows.push({ icon: FeatureAction.icon(entry.action), label: t('Action'), text: entry.action.label || entry.name });
    }
    return rows;
  }

  /** Ancestry details: description + traits with their grants. */
  static async ancestry(sheet, context) {
    context.enrichedDescription = await ItemSheetContext.enrich(sheet, sheet.item.system.description);
    // Effect choice pools (grants editor checkboxes): the Ancestry's own effects
    context.itemEffects = sheet.item.effects.map((e) => ({ id: e.id, name: e.name, img: e.img }));
    context.enrichedTraits = [];
    for (const trait of sheet.item.system.traits || []) {
      context.enrichedTraits.push(await ItemSheetContext.enrichGrants(sheet, { ...trait }));
    }
  }

  /** Class details: description, one group per Level (features, Spells known, max Mana), suggested packs. */
  static async classDetails(sheet, context) {
    const system = sheet.item.system;
    context.enrichedDescription = await ItemSheetContext.enrich(sheet, system.description);
    const manaMultiplier = system.manaMultiplier || 2;
    const levelSpells = new Map((system.levelSpells || []).map((ls) => [ls.level, ls.spells || 0]));
    const maxLevel = levelTableCap();
    context.levelGroups = [];
    for (let level = 1; level <= maxLevel; level++) {
      const features = system.levelFeatures
        .map((f, index) => ({ ...f, index }))
        .filter((f) => f.level === level);
      for (const feature of features) await ItemSheetContext.enrichGrants(sheet, feature);
      context.levelGroups.push({
        level,
        features,
        spells: levelSpells.get(level) || 0,
        spellsIndex: level - 1,
        maxMana: manaMultiplier * level,
      });
    }
    context.enrichedSuggestedPacks = await ItemSheetContext.refs(system.suggestedStartingPacks);
  }

  /** Perk details: description + every compendium Spell (by name) for the Spell prerequisite dropdowns. */
  static async perk(sheet, context) {
    context.enriched = { description: await ItemSheetContext.enrich(sheet, sheet.item.system.description) };
    context.availableSpells = [];
    for (const pack of game.packs) {
      if (pack.metadata.type !== 'Item') continue;
      const index = await pack.getIndex({ fields: ['type'] });
      for (const spell of index.filter((i) => i.type === 'spell')) {
        context.availableSpells.push({ uuid: spell.uuid, name: spell.name, packLabel: pack.metadata.label });
      }
    }
    context.availableSpells.sort((a, b) => a.name.localeCompare(b.name));
    context.spellPrerequisites = (sheet.item.system.prerequisites?.spells || []).map((selectedUuid, index) => ({
      index,
      selectedUuid,
      availableSpells: context.availableSpells.map((spell) => ({ ...spell, isSelected: spell.uuid === selectedUuid })),
    }));
  }

  /** Starting Pack details: description, the pack's items with a one-line stat summary, coins. */
  static async starterPack(sheet, context) {
    context.enriched = { description: await ItemSheetContext.enrich(sheet, sheet.item.system.description) };
    context.packItems = [];
    for (const packItem of sheet.item.system.items) {
      try {
        const item = await fromUuid(packItem.uuid);
        if (!item) continue;
        const { stats, description } = ItemSheetContext.#packItemSummary(item);
        context.packItems.push({
          name: item.name,
          img: item.img,
          type: item.type,
          typeName: game.i18n.localize(`TYPES.Item.${item.type}`),
          quantity: packItem.quantity,
          uuid: packItem.uuid,
          stats,
          description,
        });
      } catch (error) {
        console.warn(`Failed to load item with UUID ${packItem.uuid}:`, error);
      }
    }
    context.currencyString = sheet.item.system.getCurrencyString();
  }

  /** Stat line + kind label of one Starting Pack item. */
  static #packItemSummary(item) {
    const sys = item.system;
    if (item.type === 'spell') {
      return { stats: `Mana: ${sys.delivery?.cost || 0} • ${sys.delivery?.type || ''}`, description: 'Spell' };
    }
    if (item.type !== 'equipment') return { stats: '', description: game.i18n.localize(`TYPES.Item.${item.type}`) };

    const cost = sys.costDisplay || `0${game.i18n.localize('VAGABOND.Currency.Gold.abbr')}`;
    const slots = sys.slots ?? 0;
    const damageType = () => (sys.damageType && sys.damageType !== '-'
      ? game.i18n.localize(CONFIG.VAGABOND.damageTypes[sys.damageType])
      : '');
    switch (sys.equipmentType) {
      case 'weapon': {
        const damage = sys.grip === 'V'
          ? `${sys.damage1H || '—'} / ${sys.damage2H || '—'}`
          : (VagabondDamagePipeline.markExplode(sys.currentDamage, item) || '—');
        const grip = sys.grip ? (sys.grip === 'V' ? '1H/2H' : sys.grip) : '—';
        const skillKey = sys.weaponSkill ? CONFIG.VAGABOND.weaponSkills[sys.weaponSkill] : null;
        const skillName = skillKey ? game.i18n.localize(skillKey) : '';
        return {
          stats: `${damage} ${damageType()} • ${grip} • ${cost} • ${slots} slot${slots !== 1 ? 's' : ''}`,
          description: skillName ? `${skillName} Weapon` : 'Weapon',
        };
      }
      case 'armor':
        return {
          stats: `Armor: ${sys.finalRating ?? sys.armorRating ?? 0} • Might: ${sys.mightRequirement ?? 0} • ${cost}`,
          description: 'Armor',
        };
      case 'alchemical':
        return {
          stats: `${VagabondDamagePipeline.markExplode(sys.damageAmount, item) || '—'} ${damageType()} • ${cost}`,
          description: sys.alchemicalType ? sys.alchemicalType.titleCase() : 'Alchemical',
        };
      case 'relic':
        return { stats: `${cost} • Slots: ${slots}`, description: 'Relic' };
      default:
        return { stats: `${cost} • Slots: ${slots}`, description: sys.gearType || 'Gear' };
    }
  }
}
