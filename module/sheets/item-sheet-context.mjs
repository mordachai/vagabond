import { GrantsHandlers } from './item-sheet-grants.mjs';
import { VagabondDamagePipeline } from '../helpers/damage-pipeline.mjs';
import { levelTableCap } from '../helpers/homebrew-config.mjs';

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
    return entry;
  }

  /** Ancestry details: description + traits with their grants. */
  static async ancestry(sheet, context) {
    context.enrichedDescription = await ItemSheetContext.enrich(sheet, sheet.item.system.description);
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
