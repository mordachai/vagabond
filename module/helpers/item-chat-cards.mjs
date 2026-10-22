import { VagabondChatCard } from './chat-card.mjs';
import { buildMacroButtonHTML } from './item-macro.mjs';
import { VagabondTextParser } from './text-parser.mjs';
import { FeatureRules } from './feature-rules.mjs';
import { VagabondDamageHelper } from './damage-helper.mjs';
import { VagabondDamagePipeline } from './damage-pipeline.mjs';
import { AnimationBridge } from './animation-bridge.mjs';

/**
 * Chat cards for NPC actions and item uses (gear, features, alchemicals, plain feature data).
 * Built on the VagabondChatCard builder / createActionCard.
 */
export class ItemChatCards {
  /**
   * Build macro buttons for an NPC action (no item — references actor + action index).
   * NPCs have no attack roll, so both slots render on the action/use card.
   * @param {Actor} actor
   * @param {object} action     the action data object
   * @param {number} actionIndex
   * @returns {string[]}
   * @private
   */
  static _buildNpcMacroButtons(actor, action, actionIndex) {
    if (!actor?.id || !action) return [];
    const fb = game.i18n.localize('VAGABOND.Item.Macro.RunDefault');
    return [
      buildMacroButtonHTML({ cfg: action.macro, slot: 'macro', actorUuid: actor.uuid, actionIndex, fallbackLabel: fb }),
      buildMacroButtonHTML({ cfg: action.hitMacro, slot: 'hitMacro', actorUuid: actor.uuid, actionIndex, fallbackLabel: fb }),
    ].filter(Boolean);
  }

  static async npcAction(actor, action, actionIndex, targetsAtRollTime = []) {
    const tags = [];
    
    // 1. NPC Subtitle (The Actor Name)
    const subtitle = actor.name;

    // 2. Parse Traits (Tags)
    // Checks if traits exist as a String ("Undead, Flying") or Array
    // NOTE: Tags are plain text, not enriched HTML, so don't parse countdown dice here
    if (action.traits) {
        const traitList = Array.isArray(action.traits)
            ? action.traits
            : action.traits.split(',').map(t => t.trim());

        traitList.forEach(t => {
            if (t) tags.push({ label: t, cssClass: 'tag-property' });
        });
    }

    // 3. Parse Range (if it exists on NPC actions)
    // NOTE: Tags are plain text, not enriched HTML
    if (action.range) {
         tags.push({ label: action.range, cssClass: 'tag-range' });
    }

    // 4. Parse Note (display before Recharge)
    // NOTE: Tags are plain text, not enriched HTML
    if (action.note) {
        tags.push({ label: action.note, cssClass: 'tag-standard' });
    }

    // 5. Recharge Mechanic (display after Note)
    // NOTE: Tags are plain text, not enriched HTML
    if (action.recharge) {
        tags.push({ label: `Recharge ${action.recharge}`, icon: 'fas fa-rotate', cssClass: 'tag-standard' });
    }

    // 6. Description Enrichment with countdown dice parsing
    let description = '';
    if (action.description) {
      // Parse countdown dice and regular dice rolls first
      const parsedDescription = VagabondTextParser.parseAll(action.description);
      description = await foundry.applications.ux.TextEditor.enrichHTML(parsedDescription, {
        async: true, secrets: actor.isOwner, relativeTo: actor
      });
    }

    // 7. Extra Info (common in 5e-style NPC blocks) with countdown dice parsing
    if (action.extraInfo) {
      const parsedExtraInfo = VagabondTextParser.parseAll(action.extraInfo);
      const extra = await foundry.applications.ux.TextEditor.enrichHTML(parsedExtraInfo, { async: true });
      description += `<hr class="action-divider"><div class="action-extra-info">${extra}</div>`;
    }

    // 8. Damage Buttons & Save Buttons
    const footerActions = [];

    // Normalize attack type for the helpers
    const attackType = VagabondChatCard.normalizeAttackType(action.attackType);

    // 7b. Commanded Beings (Raise): an action is a Check with the caster's Cast Skill while the caster
    // Focuses on the Cast; a miss deals no damage. Not Focusing: no command, the card says so.
    let commandCheck = null;
    if (!(actor.system.abilities ?? []).includes(action)) {
        const first = targetsAtRollTime[0];
        const target = first ? game.scenes.get(first.sceneId)?.tokens.get(first.tokenId)?.actor ?? null : null;
        // FeatureRules `npcActionCheck` → {check} rolled, or {tag} only (Raise: not commanded)
        const command = await FeatureRules.first('npcActionCheck', actor, target, attackType);
        commandCheck = command?.check ?? null;
        if (commandCheck) tags.unshift({ label: commandCheck.label, cssClass: 'tag-skill' });
        else if (command?.tag) tags.push(command.tag);
    }
    const commandMissed = !!commandCheck && !commandCheck.isHit;

    // Pre-compute save types required by on-hit statuses (used in both branches below)
    const allActionStatuses = [...(action.causedStatuses ?? []), ...(action.critCausedStatuses ?? [])];
    const reminderStatusSaveTypes = new Set(
      allActionStatuses.filter(e => e.saveType && e.saveType !== 'none').map(e => e.saveType)
    );
    if (reminderStatusSaveTypes.has('any')) {
      for (const save of VagabondDamageHelper.getConfiguredSaves()) reminderStatusSaveTypes.add(save.key);
    }

    const preferFlat     = game.settings.get('vagabond', 'npcUseFlatDamage');
    const rollWithCheck  = game.settings.get('vagabond', 'rollDamageWithCheck');
    const hasDamage      = !!(action.flatDamage || action.rollDamage) && !commandMissed;

    // Show damage buttons even for "-" (typeless damage)
    if (hasDamage) {
        const rawType   = action.damageType || 'physical';
        const dTypeLabel = rawType === '-' ? '' : (game.i18n.localize(CONFIG.VAGABOND.damageTypes[rawType]) || rawType);

        if (!rollWithCheck) {
            // Manual mode — show whichever button(s) the setting allows.
            const showFlat = action.flatDamage && (preferFlat || !action.rollDamage);
            const showRoll = action.rollDamage && (!preferFlat || !action.flatDamage);

            if (showFlat) {
                footerActions.push(VagabondDamageHelper.createNPCDamageButton(
                    actor.uuid, actionIndex, action.flatDamage, 'flat', rawType, dTypeLabel, attackType, targetsAtRollTime
                ));
            }
            if (showRoll) {
                footerActions.push(VagabondDamageHelper.createNPCDamageButton(
                    actor.uuid, actionIndex, action.rollDamage, 'roll', rawType, dTypeLabel, attackType, targetsAtRollTime
                ));
            }
        }
        // rollWithCheck ON → no buttons; damage fires automatically below.
        // Manual mode: saves and defending options appear on the damage card (postNPCActionDamage).
    } else if (!commandMissed) {
        // No damage — this card IS the only card, so save reminder buttons must live here.
        footerActions.push(VagabondDamageHelper.createSaveReminderButtons(
          attackType, targetsAtRollTime, actor.uuid, null, actionIndex, reminderStatusSaveTypes
        ));
    }

    // 8b. Executable macro buttons for this NPC action
    this._buildNpcMacroButtons(actor, action, actionIndex).forEach(b => footerActions.push(b));

    // 9. Auto-roll damage when "Roll Damage With Check" is ON. NPC actions have no attack
    // check, so damage is rolled up front and folded into the SAME card as the action
    // (name, traits, description, targets, damage, saves) — one card, not two.
    let damageRoll = null;
    const rawType = action.damageType || 'physical';
    if (hasDamage && rollWithCheck) {
        let finalDamage;
        if (preferFlat && action.flatDamage) {
            // Flat damage - authored value stays pure, no bonus fields apply (Frightened still
            // costs its per-die penalty, counted from the action's dice)
            finalDamage = VagabondDamagePipeline.flatDamageAfterDiePenalty(actor,
                parseInt(action.flatDamage) + FeatureRules.sum('npcDamageBonus', actor), action.rollDamage);
        } else if (action.rollDamage) {
            // Rolled damage through the unified pipeline (same as the manual damage button)
            damageRoll = await VagabondDamagePipeline.rollDamage({
                actor,
                actionIndex,
                baseFormula: action.rollDamage,
                sourceType: 'npc',
                damageType: rawType,
                targets: targetsAtRollTime,
                weaponLinked: !!action.weaponId,
            });
            finalDamage = damageRoll?.total ?? 0;
        } else {
            finalDamage = VagabondDamagePipeline.flatDamageAfterDiePenalty(actor,
                parseInt(action.flatDamage) + FeatureRules.sum('npcDamageBonus', actor), action.rollDamage);
        }

        // Flat damage has no Roll — the card builder wants one to read total/formula from
        if (!damageRoll) {
            damageRoll = new Roll(`${finalDamage}`);
            await damageRoll.evaluate();
        }
    }

    // 10. Create the card. Manual mode: damage buttons only (saves + defending appear on the
    // damage card the button posts). Auto mode: damage, saves and defending are right here.
    await VagabondChatCard.createActionCard({
        actor,
        title: action.name || 'NPC Action',
        subtitle,
        tags,
        description,
        footerActions,
        damageRoll,
        damageType: rawType,
        attackType,
        actionIndex,
        hasDefenses: !!damageRoll,
        targetsAtRollTime,
        rollData: commandCheck ? {
            roll: commandCheck.roll, difficulty: commandCheck.difficulty,
            isHit: commandCheck.isHit, isCritical: commandCheck.isCritical,
        } : undefined,
        extraFlags: AnimationBridge.FLAGS,
    });
    // Automated Animations: NPCs auto-hit, so the animation plays with the damage — here when it was
    // rolled with the card (or there is none), else from the damage button (postNPCActionDamage).
    // A missed command Check (Raise) plays the miss variant.
    if (!(hasDamage && !rollWithCheck)) {
        AnimationBridge.play({ actor, item: AnimationBridge.npcActionItem(actor, action), targets: targetsAtRollTime, hit: !commandMissed });
    }
  }

  /**
   * Generic item use adapter for gear, features, and other items
   * @param {VagabondActor} actor - Actor using the item
   * @param {Item|Object} item - Item document or data object
   * @returns {Promise<ChatMessage>}
   */
  static async itemUse(actor, item, targetsAtRollTime = []) {
    let description = '';

    // ROBUST CHECK:
    // If it's a full Item, description is in item.system.description.
    // If it's a plain Data Object (from Class/Ancestry), it's likely just item.description.
    let rawDescription = item.system?.description || item.description || '';

    // Format description for countdown dice if the item has a formatDescription method
    if (rawDescription && item.system?.formatDescription) {
      rawDescription = item.system.formatDescription(rawDescription);
    }

    if (rawDescription) {
      description = await foundry.applications.ux.TextEditor.enrichHTML(rawDescription, {
        async: true, secrets: actor.isOwner, relativeTo: item
      });
    }

    // Build tags and critical text for spells
    const tags = [];
    let critText = null;

    if (item.type === 'spell' && item.system) {
      // Build spell tags
      tags.push(...this._buildSpellTags(item));

      // Format crit text if it exists
      if (item.system.crit) {
        critText = item.system.formatDescription ? item.system.formatDescription(item.system.crit) : item.system.crit;
      }
    }

    // Build metadata for equipment items (including relic lore)
    const metadata = [];
    if (item.type === 'equipment' && item.system) {
      // Add relic lore to metadata if present
      if (item.system.equipmentType === 'relic' && item.system.lore) {
        const loreLabel = game.i18n.localize('VAGABOND.Relic.Lore');
        metadata.push({
          label: loreLabel !== 'VAGABOND.Relic.Lore' ? loreLabel : 'Lore',
          value: await foundry.applications.ux.TextEditor.enrichHTML(item.system.lore, {
            async: true,
            relativeTo: item
          }),
          type: 'text',
          enriched: true
        });
      }

      // Add relic-specific properties to metadata
      if (item.system.equipmentType === 'relic' && item.system.properties && item.system.properties.length > 0) {
        const propsLabel = game.i18n.localize('VAGABOND.Relic.Properties');
        metadata.push({
          label: propsLabel !== 'VAGABOND.Relic.Properties' ? propsLabel : 'Properties',
          value: item.system.properties.join(', '),
          type: 'tags'
        });
      }

      // Add detailed stats to description for non-relic equipment items
      // For relics, we put lore in metadata instead of description
      if (item.system.equipmentType !== 'relic') {
        description += this._buildItemStatsHTML(item);
      }
    }

    // Determine if this is a real item or just data
    // Real items have a UUID or id. Data objects might not.
    const isRealItem = !!item.id || !!item.uuid;

    // Check if item has damage/healing effects that need buttons
    const footerActions = [];
    if (item.type === 'equipment' && item.system?.damageAmount && item.system?.damageType && item.system.damageType !== '-') {
      const damageType = item.system.damageType;
      const damageAmount = item.system.damageAmount;
      const damageTypeLabel = this._getDamageTypeLabel(damageType);

      // Determine if it's restorative (healing/recover/recharge) or harmful
      const isRestorative = VagabondDamagePipeline.isRestorativeDamageType(damageType);
      const attackType = isRestorative ? 'none' : 'melee'; // Default attack type for non-restorative items

      footerActions.push(
        VagabondDamageHelper.createItemDamageButton(
          actor.uuid,
          item.id,
          damageAmount,
          damageType,
          damageTypeLabel,
          attackType,
          targetsAtRollTime
        )
      );
    }

    // Build title and subtitle with enhanced metadata
    let title = item.name || "Feature";
    let subtitle = actor.name;

    // For perks, add prerequisite information as a tag
    if (item.type === 'perk' && item.system?.getPrerequisiteString) {
      const prereqString = item.system.getPrerequisiteString();
      if (prereqString) {
        tags.push({ label: `Prereq: ${prereqString}`, cssClass: 'tag-prerequisite' });
      }
    }

    return VagabondChatCard.createActionCard({
        actor,
        // Only pass 'item' if it's a real document, otherwise null prevents linking errors
        item: isRealItem ? item : null,
        title,
        subtitle,
        cardType: 'item-use',
        tags,
        description,
        crit: critText,
        targetsAtRollTime,
        footerActions,
        metadata // Pass metadata for relic lore
    });
  }

  /**
   * Build detailed stats HTML for equipment items (similar to mini-sheet)
   * @param {VagabondItem} item - The equipment item
   * @returns {string} HTML stats
   * @private
   */
  static _buildItemStatsHTML(item) {
    const sys = item.system;
    const equipType = sys.equipmentType;

    // Universal stats
    const stats = [];

    const i18n = k => game.i18n.localize(k);

    // Type-specific stats
    if (equipType === 'weapon') {
      if (sys.currentDamage) stats.push({ label: i18n('VAGABOND.UI.Labels.Damage'), value: `${VagabondDamagePipeline.markExplode(sys.currentDamage, item)} ${this._getDamageTypeLabel(sys.currentDamageType)}` });
      if (sys.rangeDisplay) stats.push({ label: i18n('VAGABOND.UI.Labels.Range'), value: sys.rangeDisplay });
      if (sys.gripDisplay) stats.push({ label: i18n('VAGABOND.UI.Labels.Grip'), value: sys.gripDisplay });
      if (sys.weaponSkill) {
        const skillKey = CONFIG.VAGABOND?.weaponSkills?.[sys.weaponSkill];
        stats.push({ label: i18n('VAGABOND.UI.Labels.Skill'), value: skillKey ? i18n(skillKey) : sys.weaponSkill });
      }
    } else if (equipType === 'armor') {
      if (sys.finalRating) stats.push({ label: i18n('VAGABOND.Item.Armor.FIELDS.rating.label'), value: sys.finalRating });
      if (sys.mightRequirement) stats.push({ label: i18n('VAGABOND.Item.Armor.FIELDS.might.label'), value: sys.mightRequirement });
      if (sys.finalReflexPenalty) stats.push({ label: i18n('VAGABOND.Item.Armor.FIELDS.reflexPenalty.label'), value: sys.finalReflexPenalty });
      if (sys.immunities && sys.immunities.length > 0) {
        const labels = sys.immunities.map(id => this._getDamageTypeLabel(id));
        stats.push({ label: i18n('VAGABOND.Status.DamageImmunities'), value: labels.join(', ') });
      }
    } else if (equipType === 'alchemical') {
      if (sys.alchemicalType) {
        const typeKey = CONFIG.VAGABOND?.alchemicalTypes?.[sys.alchemicalType];
        stats.push({ label: i18n('VAGABOND.UI.Labels.TypeLabel'), value: typeKey ? i18n(typeKey) : sys.alchemicalType });
      }
      if (sys.damageAmount && sys.damageType !== '-') {
        stats.push({ label: i18n('VAGABOND.UI.Labels.Damage'), value: `${VagabondDamagePipeline.markExplode(sys.damageAmount, item)} ${this._getDamageTypeLabel(sys.damageType)}` });
      }
    } else if (equipType === 'gear') {
      if (sys.gearCategory) stats.push({ label: i18n('VAGABOND.UI.Labels.Category'), value: sys.gearCategory });
      if (sys.damageAmount && sys.damageType !== '-') {
        stats.push({ label: i18n('VAGABOND.UI.Labels.Damage'), value: `${VagabondDamagePipeline.markExplode(sys.damageAmount, item)} ${this._getDamageTypeLabel(sys.damageType)}` });
      }
    } else if (equipType === 'relic') {
      // Relic lore is now handled in metadata, not stats
    }

    // Universal equipment stats
    if (sys.metalDisplay && sys.metal !== 'none' && sys.metal !== 'iron') {
      stats.push({ label: i18n('VAGABOND.Item.Weapon.FIELDS.metal.label'), value: sys.metalDisplay });
    }
    if (sys.costDisplay) stats.push({ label: i18n('VAGABOND.UI.Labels.Cost'), value: sys.costDisplay });
    if (sys.slots) stats.push({ label: i18n('VAGABOND.UI.Labels.Slots'), value: sys.slots });
    if (sys.quantity && sys.quantity > 1) stats.push({ label: i18n('VAGABOND.UI.Labels.Quantity'), value: sys.quantity });

    // Drop blank/placeholder rows ('-', empty, 0) so empty items don't show stub labels
    const isBlankStat = v => {
      if (v === undefined || v === null) return true;
      const s = String(v).trim();
      return s === '' || s === '-';
    };
    const visibleStats = stats.filter(stat => !isBlankStat(stat.value));

    // No stats → render nothing (avoids an empty stats box)
    let html = '';
    if (visibleStats.length > 0) {
      html += '<div class="item-stats-grid">';
      visibleStats.forEach(stat => {
        html += `<div class="stat-row"><span class="stat-label">${stat.label}:</span> <span class="stat-value">${stat.value}</span></div>`;
      });
      html += '</div>';
    }

    // Add properties for weapons
    if (equipType === 'weapon' && sys.properties && sys.properties.length > 0) {
      const configKeys = Object.keys(CONFIG.VAGABOND?.weaponProperties ?? {});
      html += '<div class="item-properties">';
      html += `<strong>${i18n('VAGABOND.UI.Labels.Properties')}:</strong> `;
      html += sys.properties.map(prop => {
        const realKey = configKeys.find(k => k.toLowerCase() === prop.toLowerCase()) || prop;
        const label = i18n(CONFIG.VAGABOND?.weaponProperties?.[realKey] ?? `VAGABOND.Weapon.Property.${realKey}`);
        return `<span class="property-tag">${label}</span>`;
      }).join(', ');
      html += '</div>';
    }

    return html;
  }

  /**
   * Build metadata tags for spell items (similar to spellCast method)
   * @param {VagabondItem} item - The spell item
   * @returns {Array} Array of tag objects
   * @private
   */
  static _buildSpellTags(item) {
    const sys = item.system;
    const tags = [];

    // Damage Type Tag (icon and name only, no dice - damage is always 1d6 unless mana spent)
    const dType = sys.damageType;

    // Show damage type with icon if type exists
    if (dType && dType !== '-') {
      const icon = CONFIG.VAGABOND?.damageTypeIcons?.[dType] || 'fas fa-burst';
      const damageTypeLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[dType]) || dType;
      tags.push({ label: damageTypeLabel, icon, cssClass: 'tag-damage' });
    }

    // Delivery Tag
    if (sys.deliveryType && sys.deliveryType !== '-') {
      const deliveryLabel = game.i18n.localize(CONFIG.VAGABOND.deliveryTypes[sys.deliveryType]) || sys.deliveryType;
      tags.push({ label: deliveryLabel, cssClass: 'tag-delivery' });
    }

    // Mana Cost Tag
    if (sys.manaCost) {
      tags.push({
        label: `${sys.manaCost}`,
        icon: 'fas fa-star-christmas',
        cssClass: 'tag-mana'
      });
    }

    return tags;
  }

  /**
   * Get damage type label
   * @param {string} damageType - The damage type key
   * @returns {string} Localized damage type label
   * @private
   */
  static _getDamageTypeLabel(damageType) {
    if (!damageType || damageType === '-') return '';
    return game.i18n.localize(CONFIG.VAGABOND.damageTypes[damageType]) || damageType;
  }

  static async gearUse(actor, item, targetsAtRollTime = []) {
    return this.itemUse(actor, item, targetsAtRollTime);
  }

  static async featureDataUse(actor, featureData, sourceItem, type) {
    let description = '';

    // Get the description from featureData
    let rawDescription = featureData.description || featureData.enrichedDescription || '';

    if (rawDescription) {
      description = await foundry.applications.ux.TextEditor.enrichHTML(rawDescription, {
        async: true, secrets: actor.isOwner, relativeTo: sourceItem
      });
    }

    // Build metadata tags based on type
    const tags = [];
    
    if (type === 'feature') {
      // Features: Add level and class info as tags
      const level = featureData.level || 1;
      const className = sourceItem?.name || "Class";
      tags.push({ label: `${className} - Level ${level}`, cssClass: 'tag-feature-info' });
    } else if (type === 'trait') {
      // Traits: Add ancestry info as tag
      const ancestryName = sourceItem?.name || "Ancestry";
      tags.push({ label: `${ancestryName} Trait`, cssClass: 'tag-trait-info' });
    }

    // Create the chat card directly to have full control over the image
    const card = new VagabondChatCard()
      .setType('item-use')
      .setActor(actor)
      .setTitle(featureData.name || "Feature")
      .setSubtitle(actor.name);

    // Override the icon with the source item's image (class for features, ancestry for traits)
    if (sourceItem?.img) {
      card.data.icon = sourceItem.img;
    }

    // Set the description
    if (description) {
      card.setDescription(description);
    }

    // Add the metadata tags
    card.data.standardTags = tags;

    return card.send();
  }
}
