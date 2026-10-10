import { EquipmentHelper } from './equipment-helper.mjs';
import { VagabondDamagePipeline } from './damage-pipeline.mjs';

/**
 * Shared item detail "section builders".
 *
 * Single source of truth for the HTML body of an item's detail view — the
 * description, stat grid, and property blocks. Consumed by:
 *   - the character-sheet floating mini-sheet (`inventory-handler.mjs`)
 *   - the HUD inline-accordion row (`character-hud.mjs`)
 *
 * These are pure functions of an item: no `this`, no DOM, no popup chrome
 * (image/title/close button stay with each consumer). Spell "Damage Base" and
 * "Critical" are exported separately so callers can place them wherever their
 * layout needs.
 */

/**
 * Format an item's type for display (e.g. "Weapon", "Spell").
 * @param {VagabondItem} item
 * @returns {string}
 */
export function formatItemType(item) {
  const L = (k) => game.i18n.localize(k);
  if (item.type === 'equipment') {
    const key = item.system.equipmentType.charAt(0).toUpperCase() + item.system.equipmentType.slice(1);
    const path = `VAGABOND.UI.Labels.${key}`;
    const localized = L(path);
    return localized !== path ? localized : key;
  }
  const typeKey = `TYPES.Item.${item.type}`;
  const localized = L(typeKey);
  if (localized !== typeKey) return localized;
  return item.type.charAt(0).toUpperCase() + item.type.slice(1);
}

/**
 * Spell "Damage Base" line (damage type label). Empty when no/`-` damage type.
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildSpellDamageBase(item) {
  const dt = item.system.damageType;
  const dtLabel = (dt && dt !== '-' && CONFIG.VAGABOND.damageTypes?.[dt])
    ? game.i18n.localize(CONFIG.VAGABOND.damageTypes[dt])
    : '';
  if (!dtLabel) return '';
  return `
    <div class="mini-sheet-damage-base">
      <span class="mini-sheet-label">${game.i18n.localize('VAGABOND.UI.Labels.DamageBase')}</span>
      <span class="mini-sheet-damage-base-value">${dtLabel}</span>
    </div>
  `;
}

/**
 * Complete mini-sheet popup body: header (image, type, name, relic lore, spell Damage Base, close button)
 * + the shared detail sections. Used by the inventory mini-sheet and the Character Builder's Build Guide cards.
 * @param {VagabondItem} item
 * @param {object} [options]
 * @param {string} [options.description] - pre-enriched description HTML replacing the raw one
 * @returns {string}
 */
export function buildMiniSheetContent(item, { description } = {}) {
  const isSpell = item.type === 'spell';
  const isRelic = EquipmentHelper.isRelic(item);
  let html = `
      <div class="mini-sheet-header">
        <img src="${item.img}" alt="${item.name}" class="mini-sheet-image" />
        <div class="mini-sheet-title">
          <span class="mini-sheet-type">${formatItemType(item)}</span>
          <h3>${item.name}</h3>
          ${isRelic && item.system.lore ? `<div class="mini-sheet-lore">${item.system.lore}</div>` : ''}
          ${isSpell ? buildSpellDamageBase(item) : ''}
        </div>
        <button class="mini-sheet-close" type="button" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;
  if (description === undefined) return html + buildItemDetailSections(item);
  html += description ? `<div class="mini-sheet-description">${description}</div>` : '';
  html += buildStatsSection(item);
  if (EquipmentHelper.isWeapon(item) && item.system.properties?.length > 0) html += buildWeaponProperties(item);
  return html;
}

/**
 * Description block (full width). Empty when no description.
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildDescriptionSection(item) {
  if (!item.system.description) return '';
  return `<div class="mini-sheet-description">${item.system.description}</div>`;
}

/**
 * Spell "Critical" block. Empty when no crit text.
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildSpellStats(item) {
  if (!item.system.crit) return '';
  return `
    <div class="mini-sheet-properties">
      <div class="mini-sheet-label">${game.i18n.localize('VAGABOND.UI.Labels.Critical')}</div>
      <div class="mini-sheet-crit">${item.system.crit}</div>
    </div>
  `;
}

/** Localize a CONFIG map value (label or i18n key) with raw-key fallback. */
function localizeConfigValue(map, key) {
  if (!key) return '';
  const entry = map?.[key];
  return entry ? game.i18n.localize(entry) : key;
}

/**
 * Weapon stat grid (two columns).
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildWeaponStats(item) {
  const L = (k) => game.i18n.localize(`VAGABOND.UI.Labels.${k}`);
  const damageType = localizeConfigValue(CONFIG.VAGABOND.damageTypes, item.system.currentDamageType || item.system.damageType);
  const weaponSkill = localizeConfigValue(CONFIG.VAGABOND.weaponSkills, item.system.weaponSkill);
  const metal = localizeConfigValue(CONFIG.VAGABOND.metalTypes, item.system.metal);
  return `
    <div class="mini-sheet-stats">
      <div class="stat-row">
        <span class="stat-name">${L('Damage')}</span>
        <span class="stat-value">${VagabondDamagePipeline.markExplode(item.system.currentDamage || item.system.damageAmount || item.system.damage, item) || '—'} ${damageType}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">${L('Range')}</span>
        <span class="stat-value">${item.system.rangeDisplay || item.system.range || '—'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">${L('Grip')}</span>
        <span class="stat-value">${item.system.gripDisplay || item.system.grip || '—'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Weapon.FIELDS.weaponSkill.label')}</span>
        <span class="stat-value">${weaponSkill || '—'}</span>
      </div>
      ${item.system.metal && !['none', 'iron'].includes(item.system.metal) ? `
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Weapon.FIELDS.metal.label')}</span>
        <span class="stat-value">${metal}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">${L('Cost')}</span>
        <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
      </div>
      ${item.system.requiresBound ? `
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Equipment.FIELDS.bound.label')}</span>
        <span class="stat-value">${item.system.bound ? L('Yes') : L('No')}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">${L('Slots')}</span>
        <span class="stat-value">${item.system.slots ?? 0}</span>
      </div>
    </div>
  `;
}

/**
 * Armor stat grid (two columns).
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildArmorStats(item) {
  const L = (k) => game.i18n.localize(`VAGABOND.UI.Labels.${k}`);
  const metal = localizeConfigValue(CONFIG.VAGABOND.metalTypes, item.system.metal);
  return `
    <div class="mini-sheet-stats">
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Armor.FIELDS.rating.label')}</span>
        <span class="stat-value">${item.system.finalRating ?? item.system.armorRating ?? '—'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Armor.FIELDS.might.label')}</span>
        <span class="stat-value">${item.system.mightRequirement ?? '—'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Armor.FIELDS.reflexPenalty.label')}</span>
        <span class="stat-value">${item.system.finalReflexPenalty ?? item.system.reflexPenalty ?? 0}</span>
      </div>
      ${item.system.metal && !['none', 'iron'].includes(item.system.metal) ? `
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Armor.FIELDS.metal.label')}</span>
        <span class="stat-value">${metal}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">${L('Cost')}</span>
        <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
      </div>
      ${item.system.requiresBound ? `
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Equipment.FIELDS.bound.label')}</span>
        <span class="stat-value">${item.system.bound ? L('Yes') : L('No')}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">${L('Slots')}</span>
        <span class="stat-value">${item.system.slots ?? 0}</span>
      </div>
    </div>
  `;
}

/**
 * Multi-use ("uses.max > 0") pip array for template `{{#each}}` consumption —
 * mirrors the `focusPips`/`boundsPips` shape ({filled}) already used by
 * actor-sheet.mjs, plus `index` for the click handler. Empty array when the
 * item isn't multi-use (uses.max === 0).
 * @param {VagabondItem} item
 * @returns {{filled: boolean, index: number}[]}
 */
export function usesPipsArray(item) {
  const max = item.system?.uses?.max ?? 0;
  if (max <= 0) return [];
  const value = item.system.uses.value ?? 0;
  return Array.from({ length: max }, (_, i) => ({ filled: i < value, index: i }));
}

/**
 * Raw HTML pip row for the mini-sheet/HUD detail body (built via string
 * concatenation, not a template — see buildItemDetailSections). Pips carry
 * `data-action="usePip"` + `data-item-uuid`/`data-pip-index` so both hosts
 * (HUD: native AppV2 action delegation; mini-sheet: manual listener wired in
 * inventory-handler.mjs) can spend/restore a charge on click.
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildUsesPipsRow(item) {
  const pips = usesPipsArray(item);
  if (!pips.length) return '';
  const L = (k) => game.i18n.localize(`VAGABOND.UI.Labels.${k}`);
  return `
    <div class="stat-row uses-row">
      <span class="stat-name">${L('Uses')}</span>
      <span class="stat-value">
        <span class="uses-pips" data-item-uuid="${item.uuid}">
          ${pips.map(p => `<i class="fa-solid fa-circle uses-pip ${p.filled ? 'filled' : 'empty'}" data-action="usePip" data-item-uuid="${item.uuid}" data-pip-index="${p.index}"></i>`).join('')}
        </span>
      </span>
    </div>
  `;
}

/**
 * Shared click handler for `data-action="usePip"` elements built by
 * buildUsesPipsRow (HUD accordion, mini-sheet popup) or rendered directly in
 * a template with `data-item-uuid`/`data-pip-index` (item sheet, sliding-panel,
 * HUD quick-slots). `fallbackItem` covers hosts where the pip has no
 * `data-item-uuid` because it's already scoped to a known document (the item
 * sheet editing itself).
 * @param {HTMLElement} target
 * @param {VagabondItem|null} fallbackItem
 * @returns {Promise<void>}
 */
export async function onUsePipClick(target, fallbackItem = null) {
  const uuid = target.dataset.itemUuid;
  const item = uuid ? fromUuidSync(uuid) : fallbackItem;
  if (!item) return;
  await item.constructor.setUsesFromPipClick(item, Number(target.dataset.pipIndex));
}

/**
 * Gear / relic / alchemical stat grid (two columns).
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildGearStats(item) {
  const L = (k) => game.i18n.localize(`VAGABOND.UI.Labels.${k}`);
  return `
    <div class="mini-sheet-stats mini-sheet-stats--inline">
      ${item.system.quantity ? `
      <div class="stat-row">
        <span class="stat-name">${L('Quantity')}</span>
        <span class="stat-value">${item.system.quantity}</span>
      </div>
      ` : ''}
      ${buildUsesPipsRow(item)}
      <div class="stat-row">
        <span class="stat-name">${L('Cost')}</span>
        <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
      </div>
      ${item.system.requiresBound ? `
      <div class="stat-row">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.Equipment.FIELDS.bound.label')}</span>
        <span class="stat-value">${item.system.bound ? L('Yes') : L('No')}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">${L('Slots')}</span>
        <span class="stat-value">${item.system.slots ?? 0}</span>
      </div>
    </div>
  `;
}

/**
 * Weapon properties with hint descriptions (full width).
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildWeaponProperties(item) {
  const config = CONFIG.VAGABOND;
  return `
    <div class="mini-sheet-properties">
      <div class="mini-sheet-label">${game.i18n.localize('VAGABOND.UI.Labels.Properties')}</div>
      <div class="property-list">
        ${item.system.properties.map(prop => {
          const descriptionKey = config.weaponPropertyHints?.[prop] || '';
          const description = descriptionKey ? game.i18n.localize(descriptionKey) : '';
          const propLabel = localizeConfigValue(config.weaponProperties, prop);
          return `
            <div class="property-row">
              <span class="property-name">${propLabel}:</span>
              <span class="property-description">${description}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/**
 * Starter Pack: what it holds (icon, name, ×quantity) + its Starting Currency.
 * Names come from the compendium indexes (translated with the world), the uuid tail when unresolved.
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildStarterPackContents(item) {
  const rows = (item.system.items ?? []).map(entry => {
    const doc = fromUuidSync(entry.uuid);
    const name = doc?.name ?? String(entry.uuid).split('.').pop();
    const img = doc?.img ? `<img class="pack-content-img" src="${doc.img}" alt="">` : '';
    return `
      <div class="stat-row pack-content-row">
        <span class="stat-name">${img}${name}</span>
        <span class="stat-value">${entry.quantity > 1 ? `×${entry.quantity}` : ''}</span>
      </div>`;
  }).join('');
  const currency = item.system.getCurrencyString?.() ?? '';
  return `
    <div class="mini-sheet-stats mini-sheet-pack-contents">
      <div class="mini-sheet-label">${game.i18n.localize('VAGABOND.Item.StarterPack.PackContents')}</div>
      ${rows}
      ${currency ? `
      <div class="stat-row pack-content-currency">
        <span class="stat-name">${game.i18n.localize('VAGABOND.Item.StarterPack.Currency')}</span>
        <span class="stat-value">${currency}</span>
      </div>` : ''}
    </div>
  `;
}

/**
 * Type-appropriate stat grid for any item.
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildStatsSection(item) {
  if (item.type === 'spell') return buildSpellStats(item);
  if (item.type === 'starterPack') return buildStarterPackContents(item);
  if (EquipmentHelper.isWeapon(item)) return buildWeaponStats(item);
  if (EquipmentHelper.isArmor(item)) return buildArmorStats(item);
  if (EquipmentHelper.isGear(item) || EquipmentHelper.isAlchemical(item) || EquipmentHelper.isRelic(item)) {
    return buildGearStats(item);
  }
  return '';
}

/**
 * Full detail body shared by mini-sheet + HUD accordion:
 * description + stat grid + weapon properties. Header chrome (image/title/
 * close) and the spell Damage Base line are NOT included — callers add those.
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildItemDetailSections(item) {
  let html = buildDescriptionSection(item);
  html += buildStatsSection(item);
  if (EquipmentHelper.isWeapon(item) && item.system.properties?.length > 0) {
    html += buildWeaponProperties(item);
  }
  return html;
}
