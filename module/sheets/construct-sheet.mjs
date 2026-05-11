import { VagabondActorSheet } from './actor-sheet.mjs';
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { TargetHelper } from '../helpers/target-helper.mjs';
import { VagabondDamageHelper } from '../helpers/damage-helper.mjs';
import { VagabondDiceAppearance } from '../helpers/dice-appearance.mjs';

/**
 * Construct actor sheet.
 * Two tabs: Construct (parts + crew + hold), Effects.
 */
export class VagabondConstructSheet extends VagabondActorSheet {
  constructor(object, options) {
    super(object, options);
    this._listenerController = null;
    this._itemHookIds = null;
  }

  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: ['vagabond', 'actor', 'construct'],
    position: {
      width: 820,
      height: 700,
    },
  }, { inplace: false });

  /** @override */
  static PARTS = {
    tabs: {
      template: 'templates/generic/tab-navigation.hbs',
    },
    construct: {
      template: 'systems/vagabond/templates/construct/construct-tab.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/vagabond/templates/actor/effects.hbs',
      scrollable: [''],
    },
  };

  /** @override */
  _getTabs(parts) {
    const tabGroup = 'primary';
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'construct';

    return parts.reduce((tabs, partId) => {
      const tab = { cssClass: '', group: tabGroup, id: '', label: '' };

      switch (partId) {
        case 'tabs':
          return tabs;
        case 'construct':
          tab.id = 'construct';
          tab.label = 'VAGABOND.Actor.Construct.Tabs.Construct';
          break;
        case 'effects':
          tab.id = 'effects';
          tab.label = 'VAGABOND.Actor.Tabs.Effects';
          break;
        default:
          return tabs;
      }

      if (this.tabGroups[tabGroup] === tab.id) tab.cssClass = 'active';
      tabs[partId] = tab;
      return tabs;
    }, {});
  }

  /** @override */
  async _prepareContext(options) {
    const context = {
      actor: this.actor,
      system: this.actor.system,
      flags: this.actor.flags,
      config: CONFIG.VAGABOND,
      editable: this.isEditable,
      owner: this.actor.isOwner,
      limited: this.actor.limited,
      fields: this.document.schema.fields,
      systemFields: this.document.system.schema.fields,
    };

    context.tabs = this._getTabs(options.parts);
    context.effects = prepareActiveEffectCategories(this.actor.effects);

    // Raw items — resolved per-part in _preparePartContext
    context.constructParts = this.actor.items.filter(i => i.type === 'vehiclePart');
    context.hold = this.actor.items.filter(i => i.type === 'container');

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context) {
    const partContext = await super._preparePartContext(partId, context);
    if (partId === 'construct') {
      partContext.tab = context.tabs.construct;
      partContext.constructParts = await this._resolveConstructParts(context.constructParts);
    }
    return partContext;
  }

  /**
   * Resolve construct part items into display-ready objects with crew data.
   * @param {VagabondItem[]} parts
   * @returns {Promise<Object[]>}
   * @private
   */
  async _resolveConstructParts(parts) {
    return Promise.all(parts.map(async (part) => {
      const crewEntries = part.system.crew ?? [];
      const crew = (await Promise.all(
        crewEntries.map(async ({ uuid, skill }) => {
          let a;
          try { a = await fromUuid(uuid); } catch { return null; }
          if (!a) return null;
          return {
            uuid: a.uuid,
            name: a.name,
            img: a.img,
            isCharacter: a.type === 'character',
            skill,
          };
        })
      )).filter(Boolean);

      const hpMax = part.system.health.max || 1;
      const hpPct = Math.clamp(
        Math.round((part.system.health.value / hpMax) * 100), 0, 100
      );

      return {
        id: part.id,
        name: part.name,
        img: part.img,
        health: {
          value: part.system.health.value,
          max: part.system.health.max,
          pct: hpPct,
        },
        armor: part.system.armor,
        attackModifier: part.system.attackModifier,
        damageFormula: part.system.damageFormula,
        damageType: part.system.damageType,
        crew,
      };
    }));
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Abort previous listeners and create new controller
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    const { signal } = this._listenerController;

    // Re-register item hooks (re-render construct tab when parts/hold change)
    if (this._itemHookIds) {
      Hooks.off('createItem', this._itemHookIds.createItem);
      Hooks.off('updateItem', this._itemHookIds.updateItem);
      Hooks.off('deleteItem', this._itemHookIds.deleteItem);
    }
    const reRenderConstruct = (item) => {
      if (item.parent?.id === this.actor.id) this.render(false, { parts: ['construct'] });
    };
    this._itemHookIds = {
      createItem: Hooks.on('createItem', reRenderConstruct),
      updateItem: Hooks.on('updateItem', reRenderConstruct),
      deleteItem: Hooks.on('deleteItem', reRenderConstruct),
    };

    this._bindEffectActions(signal);
    this._bindConstructActions(signal);
  }

  /**
   * Bind effects tab action buttons.
   * @param {AbortSignal} signal
   * @private
   */
  _bindEffectActions(signal) {
    this.element
      .querySelectorAll('[data-action="createDoc"][data-document-class="ActiveEffect"]')
      .forEach(button => {
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            await this.constructor._createDoc.call(this, event, button);
            await this.render(false, { parts: ['effects'] });
          } catch (err) {
            console.error('Vagabond | Construct sheet: error creating effect:', err);
          }
        }, { signal });
      });

    this.element
      .querySelectorAll('[data-action="viewDoc"], [data-action="deleteDoc"], [data-action="toggleEffect"]')
      .forEach(button => {
        const action = button.dataset.action;
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          try {
            const doc = this.constructor._getEmbeddedDocument(button, this.actor);
            switch (action) {
              case 'viewDoc':
                if (doc) doc.sheet.render(true);
                break;
              case 'deleteDoc': {
                if (!doc) break;
                const confirmed = await foundry.applications.api.DialogV2.confirm({
                  window: { title: `Delete ${doc.name}?` },
                  content: `<p>Are you sure you want to delete ${doc.name}?</p>`,
                });
                if (confirmed) await doc.delete();
                await this.render(false, { parts: ['effects'] });
                break;
              }
              case 'toggleEffect':
                if (doc) await doc.update({ disabled: !doc.disabled });
                await this.render(false, { parts: ['effects'] });
                break;
            }
          } catch (err) {
            console.error(`Vagabond | Construct sheet: error with ${action}:`, err);
          }
        }, { signal });
      });
  }

  /**
   * Bind all construct tab interactive elements.
   * @param {AbortSignal} signal
   * @private
   */
  _bindConstructActions(signal) {
    // Add part
    this.element.querySelectorAll('[data-action="addPart"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.actor.createEmbeddedDocuments('Item', [{
          name: game.i18n.localize('VAGABOND.Actor.Construct.NewPart'),
          type: 'vehiclePart',
        }]);
      }, { signal });
    });

    // Edit part (open item sheet)
    this.element.querySelectorAll('[data-action="editPart"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const partId = btn.closest('[data-part-id]')?.dataset.partId;
        if (!partId) return;
        const item = this.actor.items.get(partId);
        item?.sheet.render(true);
      }, { signal });
    });

    // Delete part
    this.element.querySelectorAll('[data-action="deletePart"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const partId = btn.closest('[data-part-id]')?.dataset.partId;
        if (!partId) return;
        const item = this.actor.items.get(partId);
        if (!item) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: `${game.i18n.localize('VAGABOND.Actor.Construct.DeletePart')}: ${item.name}` },
          content: `<p>${game.i18n.format('VAGABOND.Actor.Construct.DeletePartConfirm', { name: item.name })}</p>`,
        });
        if (confirmed) await item.delete();
      }, { signal });
    });

    // Inline part field editing (HP, armor, attackModifier, damageFormula, damageType)
    this.element.querySelectorAll('[data-part-field]').forEach(input => {
      input.addEventListener('change', async () => {
        const partId = input.closest('[data-part-id]')?.dataset.partId;
        const field = input.dataset.partField;
        if (!partId || !field) return;
        const item = this.actor.items.get(partId);
        if (!item) return;
        const value = input.type === 'number' ? Number(input.value) : input.value;
        await item.update({ [field]: value });
      }, { signal });
    });

    // HP clicker — left click: -1 (Shift: -10), right click: +1 (Shift: +10)
    this.element.querySelectorAll('.part-hp-clicker').forEach(icon => {
      icon.addEventListener('click', async (e) => {
        const partId = icon.closest('[data-part-id]')?.dataset.partId;
        if (!partId) return;
        const item = this.actor.items.get(partId);
        if (!item) return;
        const delta = e.shiftKey ? -10 : -1;
        const newVal = Math.max(0, item.system.health.value + delta);
        await item.update({ 'system.health.value': newVal });
      }, { signal });
      icon.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const partId = icon.closest('[data-part-id]')?.dataset.partId;
        if (!partId) return;
        const item = this.actor.items.get(partId);
        if (!item) return;
        const delta = e.shiftKey ? 10 : 1;
        const newVal = Math.min(item.system.health.max, item.system.health.value + delta);
        await item.update({ 'system.health.value': newVal });
      }, { signal });
    });

    // Roll part damage directly (damage-only card, no attack roll)
    this.element.querySelectorAll('.part-roll-damage').forEach(icon => {
      icon.addEventListener('click', async () => {
        const partId = icon.dataset.partId;
        if (!partId) return;
        await this._rollPartDamage(partId);
      }, { signal });
    });

    // Skill selector → live difficulty display + persist skill
    this.element.querySelectorAll('.crew-skill-select').forEach(select => {
      select.addEventListener('change', async () => {
        const skillKey = select.value;
        const span = select.closest('.part-crew-member')?.querySelector('.crew-skill-difficulty');
        if (span) span.textContent = select._skillDifficulties?.[skillKey] ?? '–';

        const partId = select.dataset.partId;
        const crewUuid = select.dataset.actorUuid;
        const part = this.actor.items.get(partId);
        if (part && crewUuid) {
          const crew = foundry.utils.deepClone(part.system.crew ?? []);
          const entry = crew.find(e => e.uuid === crewUuid);
          if (entry) {
            entry.skill = skillKey;
            await part.update({ 'system.crew': crew }, { render: false });
          }
        }
      }, { signal });

      // Async: build difficulty map and set initial display value
      (async () => {
        const crewUuid = select.dataset.actorUuid;
        if (!crewUuid) return;
        const a = await fromUuid(crewUuid);
        if (!a) return;
        const sys = a.system;
        const diffs = {};
        for (const skillKey of Object.keys(CONFIG.VAGABOND.weaponSkills)) {
          const sk = sys.skills?.[skillKey] ?? sys.saves?.[skillKey];
          if (sk?.difficulty !== undefined) diffs[skillKey] = sk.difficulty;
        }
        select._skillDifficulties = diffs;
        const span = select.closest('.part-crew-member')?.querySelector('.crew-skill-difficulty');
        if (span) span.textContent = diffs[select.value] ?? '–';
      })();
    });

    // Attack with part — per crew member
    // Characters: uses skill difficulty + attack roll; NPCs: rolls damage only
    this.element.querySelectorAll('[data-action="attackPart"]').forEach(btn => {
      btn.addEventListener('click', async (event) => {
        const partId = btn.dataset.partId;
        const crewUuid = btn.dataset.actorUuid;
        if (!partId || !crewUuid) return;
        const crewActor = await fromUuid(crewUuid);
        if (!crewActor) return;

        if (crewActor.type === 'character') {
          const row = btn.closest('.part-crew-member');
          const skillKey = row?.querySelector('.crew-skill-select')?.value ?? 'melee';
          const { VagabondRollBuilder } = await import('../helpers/roll-builder.mjs');
          const systemFavorHinder = crewActor.system.favorHinder || 'none';
          const favorHinder = VagabondRollBuilder.calculateEffectiveFavorHinder(
            systemFavorHinder,
            event.shiftKey,
            event.ctrlKey
          );
          await this._attackWithPart(partId, crewActor, skillKey, favorHinder);
        } else {
          // NPC crew: roll damage only, no attack roll
          await this._npcAttackWithPart(partId, crewActor);
        }
      }, { signal });
    });

    // Add crew member to a part
    this.element.querySelectorAll('[data-action="addCrew"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const partId = btn.dataset.partId;
        if (!partId) return;
        await this._openCrewPicker(partId);
      }, { signal });
    });

    // Remove crew member from a part
    this.element.querySelectorAll('[data-action="removeCrew"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const partId = btn.dataset.partId;
        const uuid = btn.dataset.actorUuid;
        if (!partId || !uuid) return;
        await this._removeCrewMember(partId, uuid);
      }, { signal });
    });

    // Open hold container item sheet
    this.element.querySelectorAll('[data-action="openHold"]').forEach(el => {
      el.addEventListener('click', () => {
        const itemId = el.closest('[data-item-id]')?.dataset.itemId;
        if (!itemId) return;
        const item = this.actor.items.get(itemId);
        item?.sheet.render(true);
      }, { signal });
    });

    // Add a new container to hold
    this.element.querySelectorAll('[data-action="addHold"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.actor.createEmbeddedDocuments('Item', [{
          name: game.i18n.localize('VAGABOND.Actor.Construct.NewContainer'),
          type: 'container',
        }]);
      }, { signal });
    });

    // Delete a hold container (with confirmation)
    this.element.querySelectorAll('[data-action="deleteHold"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = btn.closest('[data-item-id]')?.dataset.itemId;
        if (!itemId) return;
        const item = this.actor.items.get(itemId);
        if (!item) return;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: `${game.i18n.localize('VAGABOND.Actor.Construct.DeleteHold')}: ${item.name}` },
          content: `<p>${game.i18n.format('VAGABOND.Actor.Construct.DeleteHoldConfirm', { name: item.name })}</p>`,
        });
        if (confirmed) await item.delete();
      }, { signal });
    });
  }

  /**
   * Open a dialog to pick an actor (character or NPC) and add them as crew on a part.
   * @param {string} partId
   * @private
   */
  async _openCrewPicker(partId) {
    const item = this.actor.items.get(partId);
    if (!item) return;

    const currentCrew = new Set((item.system.crew ?? []).map(e => e.uuid));
    const available = game.actors
      .filter(a => (a.type === 'character' || a.type === 'npc') && !currentCrew.has(a.uuid))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!available.length) {
      ui.notifications.info(game.i18n.localize('VAGABOND.Actor.Construct.NoCrewAvailable'));
      return;
    }

    const options = available.map(a => {
      const typeLabel = a.type === 'npc'
        ? game.i18n.localize('TYPES.Actor.npc')
        : game.i18n.localize('TYPES.Actor.character');
      return `<option value="${a.uuid}">[${typeLabel}] ${a.name}</option>`;
    }).join('');

    const uuid = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('VAGABOND.Actor.Construct.AddCrew'),
        icon: 'fas fa-user-plus',
      },
      content: `<div class="form-group">
        <label>${game.i18n.localize('VAGABOND.Actor.Construct.PickCrew')}</label>
        <select name="actor-uuid" autofocus>${options}</select>
      </div>`,
      buttons: [{
        action: 'add',
        label: game.i18n.localize('VAGABOND.Actor.Party.Card.Add'),
        icon: 'fas fa-plus',
        callback: (_ev, _btn, dialog) => dialog.element.querySelector('[name="actor-uuid"]').value,
      }],
      close: () => null,
    });

    if (uuid) {
      const crew = foundry.utils.deepClone(item.system.crew ?? []);
      if (!crew.some(e => e.uuid === uuid)) {
        crew.push({ uuid, skill: 'melee' });
        await item.update({ 'system.crew': crew });
      }
    }
  }

  /**
   * Remove a crew member UUID from a construct part.
   * @param {string} partId
   * @param {string} uuid
   * @private
   */
  async _removeCrewMember(partId, uuid) {
    const item = this.actor.items.get(partId);
    if (!item) return;
    const crew = (item.system.crew ?? []).filter(e => e.uuid !== uuid);
    await item.update({ 'system.crew': crew });
  }

  /**
   * Roll damage for a construct part (no attack roll — damage-only chat card).
   * @param {string} partId
   * @private
   */
  async _rollPartDamage(partId) {
    try {
      const part = this.actor.items.get(partId);
      if (!part) return;

      const { VagabondChatCard } = globalThis.vagabond.utils;
      const base = part.system.damageFormula || '1d6';
      const damageRoll = new Roll(base);
      VagabondDiceAppearance.applyDamageColorset(damageRoll, part.system.damageType);
      await damageRoll.evaluate();

      const targetsAtRollTime = TargetHelper.captureCurrentTargets();

      await VagabondChatCard.createActionCard({
        actor: this.actor,
        item: part,
        title: part.name,
        subtitle: game.i18n.localize('VAGABOND.Actor.Construct.Damage'),
        damageRoll,
        damageFormula: base,
        damageType: part.system.damageType || 'physical',
        hasDefenses: false,
        targetsAtRollTime,
      });
    } catch (err) {
      console.error('VagabondConstructSheet | _rollPartDamage failed:', err);
      ui.notifications.error('Failed to roll part damage. See console for details.');
    }
  }

  /**
   * NPC crew attack: rolls damage only without an attack roll.
   * @param {string} partId
   * @param {Actor} crewActor
   * @private
   */
  async _npcAttackWithPart(partId, crewActor) {
    try {
      const part = this.actor.items.get(partId);
      if (!part) return;

      const { VagabondChatCard } = globalThis.vagabond.utils;
      const base = part.system.damageFormula || '1d6';
      const damageRoll = new Roll(base);
      VagabondDiceAppearance.applyDamageColorset(damageRoll, part.system.damageType);
      await damageRoll.evaluate();

      const targetsAtRollTime = TargetHelper.captureCurrentTargets();

      await VagabondChatCard.createActionCard({
        actor: crewActor,
        item: part,
        title: part.name,
        subtitle: crewActor.name,
        damageRoll,
        damageFormula: base,
        damageType: part.system.damageType || 'physical',
        hasDefenses: false,
        targetsAtRollTime,
      });
    } catch (err) {
      console.error('VagabondConstructSheet | _npcAttackWithPart failed:', err);
      ui.notifications.error('Failed to roll NPC part damage. See console for details.');
    }
  }

  /**
   * Character crew attack: d20 + attackModifier ≥ skill difficulty → hit → roll damage.
   * @param {string} partId
   * @param {Actor} crewActor
   * @param {string} skillKey
   * @param {string} favorHinder
   * @private
   */
  async _attackWithPart(partId, crewActor, skillKey, favorHinder = 'none') {
    const part = this.actor.items.get(partId);
    if (!part) return;

    const { VagabondChatCard } = globalThis.vagabond.utils;

    const sys = crewActor.system;
    const skill = sys.skills?.[skillKey] ?? sys.saves?.[skillKey];
    if (!skill) {
      ui.notifications.warn(`${crewActor.name} has no "${skillKey}" skill data.`);
      return;
    }

    const difficulty = skill.difficulty ?? 20;
    const attackModifier = part.system.attackModifier ?? 0;
    const critNumber = crewActor.system.critNumber ?? 20;

    const { VagabondRollBuilder } = await import('../helpers/roll-builder.mjs');
    const baseFormula = attackModifier !== 0 ? `1d20 + ${attackModifier}` : '1d20';
    const roll = await VagabondRollBuilder.buildAndEvaluateD20(crewActor, favorHinder, baseFormula);

    const naturalResult = roll.dice[0]?.results?.[0]?.result ?? roll.total;
    const isCritical = naturalResult >= critNumber;
    const isHit = roll.total >= difficulty;

    let damageRoll = null;
    if (VagabondDamageHelper.shouldRollDamage(isHit)) {
      const base = part.system.damageFormula || '1d6';
      const damageFormula = isCritical ? `(${base}) + (${base})` : base;
      damageRoll = new Roll(damageFormula);
      VagabondDiceAppearance.applyDamageColorset(damageRoll, part.system.damageType);
      await damageRoll.evaluate();
    }

    const skillLabelKey = CONFIG.VAGABOND.weaponSkills[skillKey] ?? `VAGABOND.WeaponSkills.${skillKey}`;
    const skillLabel = game.i18n.localize(skillLabelKey);

    const targetsAtRollTime = TargetHelper.captureCurrentTargets();

    await VagabondChatCard.createActionCard({
      actor: crewActor,
      item: part,
      title: part.name,
      subtitle: `${crewActor.name} · ${skillLabel}`,
      rollData: { roll, difficulty, isHit, isCritical },
      damageRoll,
      damageFormula: part.system.damageFormula || '1d6',
      damageType: part.system.damageType || 'physical',
      tags: [{ label: skillLabel, cssClass: 'tag-skill' }],
      hasDefenses: true,
      attackType: 'melee',
      targetsAtRollTime,
    });
  }

  /** @override */
  async close(options) {
    this._listenerController?.abort();
    this._listenerController = null;
    if (this._itemHookIds) {
      Hooks.off('createItem', this._itemHookIds.createItem);
      Hooks.off('updateItem', this._itemHookIds.updateItem);
      Hooks.off('deleteItem', this._itemHookIds.deleteItem);
      this._itemHookIds = null;
    }
    return super.close(options);
  }
}
