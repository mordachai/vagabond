import { EquipmentHelper } from './equipment-helper.mjs';

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
  if (item.type === 'equipment') {
    return item.system.equipmentType.charAt(0).toUpperCase() + item.system.equipmentType.slice(1);
  }
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
      <div class="mini-sheet-label">Critical</div>
      <div class="mini-sheet-crit">${item.system.crit}</div>
    </div>
  `;
}

/**
 * Weapon stat grid (two columns).
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildWeaponStats(item) {
  const damageType = item.system.currentDamageType || item.system.damageType || '';
  return `
    <div class="mini-sheet-stats">
      <div class="stat-row">
        <span class="stat-name">Damage</span>
        <span class="stat-value">${item.system.currentDamage || item.system.damage || '—'} ${damageType}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">Range</span>
        <span class="stat-value">${item.system.rangeDisplay || item.system.range || '—'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">Grip</span>
        <span class="stat-value">${item.system.gripDisplay || item.system.grip || '—'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">Weapon Skill</span>
        <span class="stat-value">${item.system.weaponSkill || '—'}</span>
      </div>
      ${item.system.metal && item.system.metal !== 'common' ? `
      <div class="stat-row">
        <span class="stat-name">Metal</span>
        <span class="stat-value">${item.system.metal}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">Cost</span>
        <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
      </div>
      ${item.system.requiresBound ? `
      <div class="stat-row">
        <span class="stat-name">Bound</span>
        <span class="stat-value">${item.system.bound ? 'Yes' : 'No'}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">Slots</span>
        <span class="stat-value">${item.system.slots || 1}</span>
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
  return `
    <div class="mini-sheet-stats">
      <div class="stat-row">
        <span class="stat-name">Armor Rating</span>
        <span class="stat-value">${item.system.finalRating || item.system.rating || '—'}</span>
      </div>
      <div class="stat-row">
        <span class="stat-name">Type</span>
        <span class="stat-value">${item.system.armorType || '—'}</span>
      </div>
      ${item.system.metal && item.system.metal !== 'common' ? `
      <div class="stat-row">
        <span class="stat-name">Metal</span>
        <span class="stat-value">${item.system.metal}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">Cost</span>
        <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
      </div>
      ${item.system.requiresBound ? `
      <div class="stat-row">
        <span class="stat-name">Bound</span>
        <span class="stat-value">${item.system.bound ? 'Yes' : 'No'}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">Slots</span>
        <span class="stat-value">${item.system.slots || 1}</span>
      </div>
    </div>
  `;
}

/**
 * Gear / relic / alchemical stat grid (two columns).
 * @param {VagabondItem} item
 * @returns {string}
 */
export function buildGearStats(item) {
  return `
    <div class="mini-sheet-stats mini-sheet-stats--inline">
      ${item.system.quantity ? `
      <div class="stat-row">
        <span class="stat-name">Quantity</span>
        <span class="stat-value">${item.system.quantity}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">Cost</span>
        <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
      </div>
      ${item.system.requiresBound ? `
      <div class="stat-row">
        <span class="stat-name">Bound</span>
        <span class="stat-value">${item.system.bound ? 'Yes' : 'No'}</span>
      </div>
      ` : ''}
      <div class="stat-row">
        <span class="stat-name">Slots</span>
        <span class="stat-value">${item.system.slots || 1}</span>
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
      <div class="mini-sheet-label">Properties</div>
      <div class="property-list">
        ${item.system.properties.map(prop => {
          const descriptionKey = config.weaponPropertyHints?.[prop] || '';
          const description = descriptionKey ? game.i18n.localize(descriptionKey) : '';
          return `
            <div class="property-row">
              <span class="property-name">${prop}:</span>
              <span class="property-description">${description}</span>
            </div>
          `;
        }).join('')}
      </div>
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
