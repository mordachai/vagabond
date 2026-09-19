import { StatusHelper } from './status-helper.mjs';

/** Legacy numeric perk `choiceConfig.effectMode` (v13 ACTIVE_EFFECT_MODES order) → v14 change type. */
const LEGACY_MODE_TYPES = ['custom', 'multiply', 'add', 'downgrade', 'upgrade', 'override'];

/**
 * Convert a legacy numeric effect mode to the v14 string change type.
 * @param {number|string} mode
 * @returns {string}
 */
export function effectModeToChangeType(mode) {
  if (typeof mode === 'string' && Number.isNaN(Number(mode))) return mode; // already a type
  return LEGACY_MODE_TYPES[Number(mode)] ?? 'add';
}

/**
 * Prepare the data structure for Active Effects which are currently embedded in an Actor or Item.
 * @param {ActiveEffect[]} effects    A collection or generator of Active Effect documents to prepare sheet data for
 * @return {object}                   Data for rendering
 */
export function prepareActiveEffectCategories(effects) {
  // Define effect header categories
  const categories = {
    temporary: {
      type: 'temporary',
      label: game.i18n.localize('VAGABOND.Effect.Temporary'),
      effects: [],
    },
    passive: {
      type: 'passive',
      label: game.i18n.localize('VAGABOND.Effect.Passive'),
      effects: [],
    },
    inactive: {
      type: 'inactive',
      label: game.i18n.localize('VAGABOND.Effect.Inactive'),
      effects: [],
    },
  };

  // Iterate over active effects, classifying them into categories
  for (const e of effects) {
    if (e.disabled) {
      categories.inactive.effects.push(e);
    } else if (e.isTemporary) {
      categories.temporary.effects.push(e);
    } else {
      categories.passive.effects.push(e);
    }
  }

  // Sort each category
  for (const c of Object.values(categories)) {
    c.effects.sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }
  
  return categories;
}

// ---------------------------------------------------------------------------
// Actor sheet effects list (Active / Inactive switch-row layout)
// ---------------------------------------------------------------------------

/**
 * Is this effect a status condition applied to an actor (burning, prone, …)?
 * Only effects living directly on the actor whose status id is a registered
 * CONFIG.statusEffects entry qualify — item-granted effects never do.
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function isStatusEffect(effect) {
  if (!effect?.statuses?.size) return false;
  if (effect.parent?.documentName !== 'Actor') return false;
  const defs = CONFIG.statusEffects ?? [];
  return [...effect.statuses].some((id) => defs.some((s) => s.id === id));
}

/** Lowercase, strip a trailing "(…)" qualifier: "Hulking (Orc Trait)" → "hulking". */
const normalizeName = (name) => String(name ?? '').replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();

/**
 * Description an item-owned effect inherits when it has none of its own (effects created
 * before seeding existed, or left blank). Ancestry traits / class features live in arrays on the
 * item, so the entry matching the effect's name is used rather than the whole item text.
 * @param {ActiveEffect} effect
 * @returns {string}
 */
function inheritedDescription(effect) {
  const item = effect.parent?.documentName === 'Item' ? effect.parent : null;
  if (!item) return '';

  const entries = item.type === 'ancestry' ? item.system?.traits
    : item.type === 'class' ? item.system?.levelFeatures
      : null;
  if (entries) {
    const target = normalizeName(effect.name);
    const match = entries.find((e) => {
      const n = normalizeName(e?.name);
      return n && (n === target || target.includes(n));
    });
    return match?.description ?? '';
  }
  const description = item.system?.description;
  return typeof description === 'string' ? description : '';
}

/**
 * Icon to show for an effect: its own, unless it is blank / Foundry's default aura, in which case
 * the owning item's icon (so perk/trait/relic effects look like their source).
 * @param {ActiveEffect} effect
 * @returns {string}
 */
export function effectDisplayImg(effect) {
  const fallback = foundry.documents.ActiveEffect.implementation?.DEFAULT_ICON ?? 'icons/svg/aura.svg';
  if (effect.img && effect.img !== fallback) return effect.img;
  const item = effect.parent?.documentName === 'Item' ? effect.parent : null;
  return item?.img || effect.img;
}

/**
 * Resolve the human-readable description of an effect.
 * Priority: live flanking text > localized StatusConditionDescriptions > the effect's own
 * description > CONFIG.statusEffects default > the owning item's text (item-owned effects). A trailing "[automation note]" is split out.
 * @param {ActiveEffect} effect
 * @returns {{ description: string, automation: string }}
 */
export function resolveEffectDescription(effect) {
  let full = '';
  const statusId = effect.statuses?.first?.() ?? effect.flags?.core?.statusId;

  // Flanking/Flanked carry a per-application description naming the actual tokens involved
  if (effect.flags?.vagabond?.flankInfo && effect.description) full = effect.description;

  // The effect's own `description` is English (copied from CONFIG.statusEffects when Foundry
  // creates the status), so the localized entry must be checked first.
  if (!full && statusId) {
    const key = `VAGABOND.StatusConditionDescriptions.${statusId.charAt(0).toUpperCase()}${statusId.slice(1)}`;
    const localized = game.i18n.localize(key);
    if (localized !== key) full = localized;
  }
  if (!full) {
    if (effect.description) full = effect.description;
    else if (statusId) full = CONFIG.statusEffects?.find((s) => s.id === statusId)?.description ?? '';
  }
  // Item-owned effect with no text of its own → inherit from the owning item / trait
  if (!full) full = inheritedDescription(effect);

  const match = full.match(/\[(.*?)\]$/);
  if (!match) return { description: full, automation: '' };
  return { description: full.replace(/\s*\[.*?\]$/, '').trim(), automation: match[1] };
}

/**
 * Why (if at all) an effect is currently not applying.
 * @param {ActiveEffect} effect
 * @returns {'onUse'|'unequipped'|'expired'|null}
 */
function suppressionOf(effect) {
  const vagabond = effect.system?.suppressionReason;
  if (vagabond) return vagabond;
  return effect.duration?.expired ? 'expired' : null;
}

/**
 * Build the render model for one effect row.
 * @param {ActiveEffect} effect
 * @param {Actor} actor
 * @param {boolean} editable
 * @param {Set<string>} [open]  Ids of rows whose description is expanded
 * @returns {Promise<object>}
 */
async function buildEffectRow(effect, actor, editable, open) {
  const TextEditor = foundry.applications.ux.TextEditor.implementation;
  const isItemEffect = effect.parent?.documentName === 'Item';
  const isStatus = isStatusEffect(effect);
  const suppression = suppressionOf(effect);
  const { description, automation } = resolveEffectDescription(effect);

  // Origin pill: owning item for item effects; a resolvable origin for actor effects
  let origin = '';
  if (isItemEffect) origin = effect.parent.name;
  else if (!isStatus && effect.origin && effect.origin !== actor.uuid) {
    const name = effect.sourceName;
    if (name && name !== game.i18n.localize('COMMON.None') && name !== game.i18n.localize('COMMON.Unknown')) origin = name;
  }

  let descriptionHtml = '';
  if (description) {
    descriptionHtml = isStatus
      ? foundry.utils.escapeHTML(description)
      : await TextEditor.enrichHTML(description, { secrets: actor.isOwner, relativeTo: effect });
  }

  return {
    id: effect.id,
    uuid: effect.uuid,
    parentId: effect.parent?.id,
    img: effectDisplayImg(effect),
    name: effect.name,
    origin,
    description: descriptionHtml,
    automation,
    duration: effect.isTemporary ? effect.duration?.label ?? '' : '',
    isItemEffect,
    isStatus,
    disabled: effect.disabled,
    open: !!open?.has(effect.id),
    suppression,
    // The switch mirrors "is this effect applying right now"
    on: effect.active,
    // Suppressed effects can't be flipped from the list — equip the item / edit the duration instead
    canToggle: editable && !suppression,
    // Item-owned effects belong to the item: disable-able here, deletable only on the item
    canDelete: editable && !isItemEffect,
    // Only the actor's own effects can be dragged (core drag reads actor.effects)
    draggable: !isItemEffect && editable,
    sort: effect.sort ?? 0,
  };
}

/**
 * Every effect an actor's effect list shows: its own effects, transferring item effects, and
 * item effects set to "on-use" (listed even though they don't transfer, so they read as suppressed).
 * @param {Actor} actor
 * @returns {ActiveEffect[]}
 */
function collectListedEffects(actor) {
  const effects = [...actor.effects];
  for (const item of actor.items) {
    for (const effect of item.effects) {
      const onUse = (effect.flags?.vagabond?.applicationMode ?? 'permanent') === 'on-use';
      if (effect.transfer || onUse) effects.push(effect);
    }
  }
  return effects;
}

/**
 * Flip an effect on/off — the shared behavior behind every effect switch (sheet row, HUD menu).
 * Status conditions turn OFF by being removed (with their linked countdown dice) — they cannot sit
 * disabled; every other effect toggles its `disabled` flag.
 * @param {Actor} actor
 * @param {ActiveEffect} effect
 * @returns {Promise<void>}
 */
export async function toggleActorEffect(actor, effect) {
  if (isStatusEffect(effect) && !effect.disabled) {
    await StatusHelper.removeStatus(actor, effect.statuses.first());
    return;
  }
  await effect.update({ disabled: !effect.disabled });
}

/**
 * Lightweight synchronous effect list for compact switch UIs (HUD context menu).
 * Status conditions are left out — the HUD already shows them as icons with their own remove menu.
 * @param {Actor} actor
 * @returns {{effect: ActiveEffect, name: string, img: string, on: boolean, canToggle: boolean}[]}
 */
export function listEffectSwitches(actor) {
  return collectListedEffects(actor)
    .filter((e) => !isStatusEffect(e))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((effect) => ({
      effect,
      name: effect.name,
      img: effectDisplayImg(effect),
      on: effect.active,
      canToggle: actor.isOwner && !suppressionOf(effect),
    }));
}

/**
 * ContextMenuHelper entries for the HUD portrait menu: divider, "Active Effects:" header, then one
 * switch row per effect. Empty when the actor has no listable effects (no orphan divider).
 * @param {Actor} actor
 * @returns {object[]}
 */
export function buildEffectMenuItems(actor) {
  const rows = listEffectSwitches(actor);
  if (!rows.length) return [];
  return [
    { divider: true },
    { header: true, icon: 'fas fa-wand-sparkles', label: `${game.i18n.localize('VAGABOND.Hud.Menu.ActiveEffects')}:` },
    ...rows.map((row) => ({
      label: foundry.utils.escapeHTML(row.name),
      img: row.img,
      toggle: {
        value: row.on,
        disabled: !row.canToggle,
        // Confirm from the document itself: a suppressed/expired effect may not end up "active"
        onChange: async () => {
          await toggleActorEffect(actor, row.effect);
          return row.effect.active;
        },
      },
    })),
  ];
}

/**
 * Prepare the Active / Inactive effect lists for an actor sheet.
 * Sources: the actor's own effects, transferring item effects, and any item effect set to
 * "on-use" (listed even when it does not transfer, so it is visible as suppressed).
 * @param {Actor} actor
 * @param {object} [options]
 * @param {boolean} [options.editable]  Whether the viewer may modify effects
 * @param {Set<string>} [options.open]  Ids of rows whose description is expanded (sheet-held state)
 * @returns {Promise<{active: object[], inactive: object[], total: number, editable: boolean}>}
 */
export async function prepareEffectsView(actor, { editable = actor.isOwner, open } = {}) {
  const effects = collectListedEffects(actor);

  const rows = await Promise.all(effects.map((e) => buildEffectRow(e, actor, editable, open)));
  rows.sort((a, b) => a.sort - b.sort);

  return {
    active: rows.filter((r) => r.on),
    inactive: rows.filter((r) => !r.on),
    total: rows.length,
    editable,
  };
}

/**
 * Creation data that pre-fills a new effect from the item it will live on: the item's icon
 * and description (a snapshot — edit the effect to diverge), plus its name for the first effect.
 * Saves re-entering image/text for perks, traits, relics, weapons, etc.
 * @param {Item} item
 * @param {object} [options]
 * @param {boolean} [options.name=true]  Also seed the name from the item
 * @returns {{name?: string, img: string, description?: string}}
 */
export function effectSeedFromItem(item, { name = true } = {}) {
  const seed = { img: item.img };
  if (name) seed.name = item.name;
  const description = item.system?.description;
  if (typeof description === 'string' && description.trim()) seed.description = description;
  return seed;
}
