import { VagabondActorSheet } from './actor-sheet.mjs';
import { prepareActiveEffectCategories } from '../helpers/effects.mjs';
import { TargetHelper } from '../helpers/target-helper.mjs';
import { VagabondDamageHelper } from '../helpers/damage-helper.mjs';
import { PartyCompactView } from '../applications/party-compact-view.mjs';

/**
 * Party/Vehicle actor sheet.
 * Three tabs: Party (member cards), Vehicle (parts + crew), Effects.
 */
export class VagabondPartySheet extends VagabondActorSheet {
  constructor(object, options) {
    super(object, options);
    this._listenerController = null;
    this._actorUpdateHookId = null;
  }

  /** @override */
  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    classes: ['vagabond', 'actor', 'party'],
    position: {
      width: 920,
      height: 700,
    },
  }, { inplace: false });

  /** @override */
  static PARTS = {
    tabs: {
      template: 'templates/generic/tab-navigation.hbs',
    },
    party: {
      template: 'systems/vagabond/templates/party/party-tab.hbs',
      scrollable: [''],
    },
    vehicle: {
      template: 'systems/vagabond/templates/party/vehicle-tab.hbs',
      scrollable: [''],
    },
    effects: {
      template: 'systems/vagabond/templates/actor/effects.hbs',
      scrollable: [''],
    },
  };

  /** @override */
  _configureRenderOptions(options) {
    super._configureRenderOptions(options);
    if (game.user.isGM) {
      options.parts = ['tabs', 'party', 'vehicle', 'effects'];
    } else {
      // Non-GM players (crew members with Owner permission) see only the Vehicle tab.
      options.parts = ['vehicle'];
      this.tabGroups['primary'] = 'vehicle';
    }
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

    // Resolve full member data for party tab cards
    context.members = await this._resolveMembers();

    // Aggregate supplies across all members
    context.supplies = this._aggregateSupplies(context.members);

    // Vehicle parts (vehiclePart items owned by this actor)
    context.vehicleParts = this.actor.items.filter(i => i.type === 'vehiclePart');

    // Cargo (container items owned by this actor)
    context.cargo = this.actor.items.filter(i => i.type === 'container');

    return context;
  }

  /**
   * Resolve all party member UUIDs into rich card data objects.
   * @returns {Promise<Object[]>}
   * @private
   */
  async _resolveMembers() {
    const uuids = this.actor.system.members ?? [];
    const results = await Promise.all(uuids.map(uuid => this._resolveMember(uuid)));
    return results.filter(Boolean);
  }

  /**
   * Resolve a single member UUID into card data.
   * @param {string} uuid
   * @returns {Promise<Object|null>}
   * @private
   */
  async _resolveMember(uuid) {
    let actor;
    try {
      actor = await fromUuid(uuid);
    } catch {
      return null;
    }
    if (!actor) return null;

    const sys = actor.system;

    // Armor: use the actor's derived armor value (includes Active Effect bonuses)
    const armor = sys.armor ?? 0;

    // Equipped items for display list
    const equippedItems = actor.items
      .filter(i => i.type === 'equipment' && (
        (i.system.equipmentType === 'weapon' && i.system.equipmentState !== 'unequipped') ||
        (i.system.equipmentType !== 'weapon' && i.system.equipped)
      ))
      .map(i => ({ id: i.id, name: i.name, img: i.img, type: i.system.equipmentType }));

    // Favorited spells
    const favoritedSpells = actor.items
      .filter(i => i.type === 'spell' && i.system.favorite)
      .map(i => ({ id: i.id, name: i.name, img: i.img }));

    // Active status effects
    const statuses = actor.effects
      .filter(e => e.statuses?.size > 0)
      .map(e => ({
        effectId: e.id,
        actorUuid: actor.uuid,
        label: e.name,
        img: e.img,
      }));

    // Fatigue
    const fatigue = sys.fatigue ?? 0;
    const fatigueMax = sys.fatigueMax ?? 5;
    const fatiguePct = fatigueMax > 0
      ? Math.clamp(Math.round((fatigue / fatigueMax) * 100), 0, 100)
      : 0;

    // HP percentage for bar fill
    const hpMax = sys.health.max || 1;
    const hpPct = Math.clamp(Math.round((sys.health.value / hpMax) * 100), 0, 100);

    // Mana percentage
    const manaMax = sys.mana?.max || 1;
    const manaPct = sys.mana?.max > 0
      ? Math.clamp(Math.round((sys.mana.current / manaMax) * 100), 0, 100)
      : 0;

    // Player linked to this character (non-GM user whose assigned character matches)
    const playerUser = game.users.find(u => !u.isGM && u.character?.id === actor.id);
    const playerName = playerUser?.name ?? null;

    // XP progress
    const xpCurrent = sys.attributes.xp ?? 0;
    const xpRequired = sys.attributes.xpRequired ?? 0;
    const xpPct = xpRequired > 0
      ? Math.clamp(Math.round((xpCurrent / xpRequired) * 100), 0, 100)
      : 0;

    return {
      uuid: actor.uuid,
      id: actor.id,
      name: actor.name,
      img: actor.img,
      playerName,
      level: sys.attributes.level?.value ?? 1,
      ancestry: sys.ancestryData?.name ?? null,
      characterClass: sys.classData?.name ?? null,
      speed: {
        base:   sys.speed?.base   ?? 0,
        crawl:  sys.speed?.crawl  ?? 0,
        travel: sys.speed?.travel ?? 0,
      },
      xp: {
        current: xpCurrent,
        required: xpRequired,
        pct: xpPct,
      },
      hp: {
        value: sys.health.value,
        max: sys.health.max,
        pct: hpPct,
      },
      fatigue,
      fatigueMax,
      fatiguePct,
      mana: {
        current: sys.mana?.current ?? 0,
        max: sys.mana?.max ?? 0,
        castingMax: sys.mana?.castingMax ?? 0,
        pct: manaPct,
        isSpellcaster: sys.attributes?.isSpellcaster ?? false,
      },
      armor,
      inventory: {
        used: sys.inventory?.occupiedSlots ?? 0,
        total: sys.inventory?.maxSlots ?? 0,
      },
      luck: {
        current: sys.currentLuck ?? 0,
        total: sys.maxLuck ?? 0,
      },
      studiedDice: sys.studiedDice ?? 0,
      saves: {
        reflex: {
          difficulty: sys.saves?.reflex?.difficulty ?? 20,
          label: sys.saves?.reflex?.label ?? game.i18n.localize('VAGABOND.Saves.Reflex.name'),
        },
        endure: {
          difficulty: sys.saves?.endure?.difficulty ?? 20,
          label: sys.saves?.endure?.label ?? game.i18n.localize('VAGABOND.Saves.Endure.name'),
        },
        will: {
          difficulty: sys.saves?.will?.difficulty ?? 20,
          label: sys.saves?.will?.label ?? game.i18n.localize('VAGABOND.Saves.Will.name'),
        },
      },
      equippedItems,
      favoritedSpells,
      statuses,
      currency: {
        gold:   sys.currency?.gold   ?? 0,
        silver: sys.currency?.silver ?? 0,
        copper: sys.currency?.copper ?? 0,
      },
      // Supply items for aggregation — raw data; totals computed separately
      _supplyRations: actor.items
        .filter(i => i.type === 'equipment' && i.system.isSupply)
        .reduce((n, i) => n + (i.system.quantity ?? 1), 0),
      _supplyBeverages: actor.items
        .filter(i => i.type === 'equipment' && i.system.isBeverage)
        .reduce((n, i) => n + (i.system.quantity ?? 1), 0),
    };
  }

  /**
   * Aggregate rations, beverages, and currency across all resolved members.
   * @param {Object[]} members
   * @returns {{ rations: number, beverages: number, currency: {gold, silver, copper} }}
   * @private
   */
  _aggregateSupplies(members) {
    return members.reduce(
      (totals, m) => ({
        rations:  totals.rations  + (m._supplyRations   ?? 0),
        beverages: totals.beverages + (m._supplyBeverages ?? 0),
        currency: {
          gold:   totals.currency.gold   + (m.currency?.gold   ?? 0),
          silver: totals.currency.silver + (m.currency?.silver ?? 0),
          copper: totals.currency.copper + (m.currency?.copper ?? 0),
        },
      }),
      { rations: 0, beverages: 0, currency: { gold: 0, silver: 0, copper: 0 } }
    );
  }

  /** @override */
  async _preparePartContext(partId, context) {
    const partContext = await super._preparePartContext(partId, context);
    switch (partId) {
      case 'party':
        partContext.tab = context.tabs[partId];
        break;
      case 'vehicle':
        partContext.tab = context.tabs[partId];
        partContext.vehicleParts = await this._resolveVehicleParts(context.vehicleParts);
        break;
    }
    return partContext;
  }

  /**
   * Resolve vehicle part items into display-ready objects with crew data.
   * @param {VagabondItem[]} parts
   * @returns {Promise<Object[]>}
   * @private
   */
  async _resolveVehicleParts(parts) {
    return Promise.all(parts.map(async (part) => {
      const crewEntries = part.system.crew ?? [];
      const crew = (await Promise.all(
        crewEntries.map(({ uuid, skill }) =>
          fromUuid(uuid).then(a => a ? { uuid: a.uuid, name: a.name, img: a.img, skill } : null)
        )
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
  _getTabs(parts) {
    const tabGroup = 'primary';
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'party';

    return parts.reduce((tabs, partId) => {
      const tab = { cssClass: '', group: tabGroup, id: '', label: '' };

      switch (partId) {
        case 'tabs':
          return tabs;
        case 'party':
          tab.id = 'party';
          tab.label = 'VAGABOND.Actor.Party.Tabs.Party';
          break;
        case 'vehicle':
          tab.id = 'vehicle';
          tab.label = 'VAGABOND.Actor.Party.Tabs.Vehicle';
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
  async _onRender(context, options) {
    await super._onRender(context, options);

    // Abort previous listeners and create new controller
    this._listenerController?.abort();
    this._listenerController = new AbortController();
    const { signal } = this._listenerController;

    // Re-register actor update hook (re-renders only the party tab)
    if (this._actorUpdateHookId) Hooks.off('updateActor', this._actorUpdateHookId);
    this._actorUpdateHookId = Hooks.on('updateActor', () => {
      this.render(false, { parts: ['party'] });
    });

    // Re-register item hooks (re-render vehicle tab when parts change)
    if (this._itemHookIds) {
      Hooks.off('createItem', this._itemHookIds.createItem);
      Hooks.off('updateItem', this._itemHookIds.updateItem);
      Hooks.off('deleteItem', this._itemHookIds.deleteItem);
    }
    const reRenderVehicle = (item) => {
      if (item.parent?.id === this.actor.id) this.render(false, { parts: ['vehicle'] });
    };
    this._itemHookIds = {
      createItem: Hooks.on('createItem', reRenderVehicle),
      updateItem: Hooks.on('updateItem', reRenderVehicle),
      deleteItem: Hooks.on('deleteItem', reRenderVehicle),
    };

    // Re-register ActiveEffect hooks so status changes on members refresh the party tab immediately.
    // Status effects fire createActiveEffect / deleteActiveEffect, not updateActor.
    if (this._effectHookIds) {
      Hooks.off('createActiveEffect', this._effectHookIds.create);
      Hooks.off('updateActiveEffect', this._effectHookIds.update);
      Hooks.off('deleteActiveEffect', this._effectHookIds.delete);
    }
    const reRenderIfMember = (effect) => {
      const parentUuid = effect.parent?.uuid;
      if (parentUuid && this.actor.system.members?.includes(parentUuid)) {
        this.render(false, { parts: ['party'] });
      }
    };
    this._effectHookIds = {
      create: Hooks.on('createActiveEffect', reRenderIfMember),
      update: Hooks.on('updateActiveEffect', reRenderIfMember),
      delete: Hooks.on('deleteActiveEffect', reRenderIfMember),
    };

    // Wire up effects tab
    this._bindEffectActions(signal);

    // Wire up member card interactions
    this._bindMemberActions(signal);

    // Wire up vehicle tab interactions
    this._bindVehicleActions(signal);
  }

  /**
   * Bind member card interactive elements.
   * @param {AbortSignal} signal
   * @private
   */
  _bindMemberActions(signal) {
    // Header info area → open actor sheet
    this.element
      .querySelectorAll('[data-action="openMemberSheet"]')
      .forEach(el => {
        el.addEventListener('click', async (e) => {
          // Don't fire if click landed on a nested interactive element
          if (e.target.closest('[data-action]:not([data-action="openMemberSheet"])') ||
              e.target.closest('button')) return;
          const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          actor?.sheet.render(true);
        }, { signal });
      });

    // Portrait → pan camera to actor's token in the current scene
    this.element
      .querySelectorAll('[data-action="panToToken"]')
      .forEach(el => {
        el.addEventListener('click', async () => {
          const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const token = canvas.tokens?.placeables.find(
            t => t.actor?.uuid === uuid || t.document.actorId === actor.id
          );
          if (!token) {
            ui.notifications.warn(`${actor.name} has no token in this scene.`);
            return;
          }
          canvas.animatePan({ x: token.center.x, y: token.center.y });
        }, { signal });
      });

    // HP bar — left click: -1 HP, right click: +1 HP
    this.element
      .querySelectorAll('[data-action="memberHpChange"]')
      .forEach(bar => {
        bar.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uuid = bar.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const newVal = Math.max(0, actor.system.health.value - 1);
          await actor.update({ 'system.health.value': newVal });
        }, { signal });
        bar.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const uuid = bar.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const newVal = Math.min(actor.system.health.max, actor.system.health.value + 1);
          await actor.update({ 'system.health.value': newVal });
        }, { signal });
      });

    // Fatigue bar — left click: +1 fatigue, right click: -1 fatigue
    this.element
      .querySelectorAll('[data-action="memberFatigueChange"]')
      .forEach(bar => {
        bar.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uuid = bar.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const newVal = Math.min(actor.system.fatigueMax ?? 5, (actor.system.fatigue ?? 0) + 1);
          await actor.update({ 'system.fatigue': newVal });
        }, { signal });
        bar.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const uuid = bar.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          const actor = await fromUuid(uuid);
          if (!actor) return;
          const newVal = Math.max(0, (actor.system.fatigue ?? 0) - 1);
          await actor.update({ 'system.fatigue': newVal });
        }, { signal });
      });

    // Equipped items / spells → open item sheet on the member actor
    this.element
      .querySelectorAll('[data-action="openMemberItem"]')
      .forEach(el => {
        el.addEventListener('click', async (e) => {
          e.stopPropagation();
          const uuid = el.closest('[data-actor-uuid]')?.dataset.actorUuid;
          const itemId = el.dataset.itemId;
          if (!uuid || !itemId) return;
          const actor = await fromUuid(uuid);
          const item = actor?.items.get(itemId);
          item?.sheet.render(true);
        }, { signal });
      });

    // Status icon → send to chat
    this.element
      .querySelectorAll('[data-action="memberStatusChat"]')
      .forEach(icon => {
        icon.addEventListener('click', async () => {
          const { actorUuid, effectId } = icon.dataset;
          const actor = await fromUuid(actorUuid);
          if (!actor) return;
          const effect = actor.effects.get(effectId);
          if (!effect) return;
          const { VagabondChatCard } = globalThis.vagabond.utils;
          await VagabondChatCard.statusEffect(actor, effect);
        }, { signal });
      });

    // Compact view button
    this.element
      .querySelectorAll('[data-action="openCompactView"]')
      .forEach(btn => {
        btn.addEventListener('click', () => PartyCompactView.open(this.actor), { signal });
      });

    // "+" button → open actor picker
    this.element
      .querySelectorAll('[data-action="openMemberPicker"]')
      .forEach(btn => {
        btn.addEventListener('click', () => this._openMemberPicker(), { signal });
      });

    // Remove button on each card
    this.element
      .querySelectorAll('[data-action="removeMember"]')
      .forEach(btn => {
        btn.addEventListener('click', async () => {
          const uuid = btn.closest('[data-actor-uuid]')?.dataset.actorUuid;
          if (!uuid) return;
          await this._removeMember(uuid);
        }, { signal });
      });
  }

  /**
   * Handle dropping an actor onto the party sheet — adds them as a member.
   * @param {DragEvent} event
   * @param {Object} data
   * @override
   */
  async _onDropActor(event, data) {
    if (!this.actor.isOwner) return false;
    const uuid = data.uuid;
    if (!uuid) return false;
    await this._addMember(uuid);
    return true;
  }

  /**
   * Add an actor UUID to the party member list.
   * @param {string} uuid
   * @private
   */
  async _addMember(uuid) {
    const members = [...(this.actor.system.members ?? [])];
    if (members.includes(uuid)) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Actor.Party.Card.AlreadyMember'));
      return;
    }
    members.push(uuid);
    await this.actor.update({ 'system.members': members });
  }

  /**
   * Remove an actor UUID from the party member list, with a confirmation dialog.
   * @param {string} uuid
   * @private
   */
  async _removeMember(uuid) {
    const actor = await fromUuid(uuid);
    const name = actor?.name ?? uuid;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('VAGABOND.Actor.Party.Card.Remove') },
      content: `<p>${game.i18n.format('VAGABOND.Actor.Party.Card.RemoveConfirm', { name })}</p>`,
    });
    if (!confirmed) return;
    const members = (this.actor.system.members ?? []).filter(u => u !== uuid);
    await this.actor.update({ 'system.members': members });
  }

  /**
   * Open a dialog to pick an actor and add them as a party member.
   * @private
   */
  async _openMemberPicker() {
    const currentMembers = new Set(this.actor.system.members ?? []);
    const available = game.actors
      .filter(a => a.type === 'character' && !currentMembers.has(a.uuid))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!available.length) {
      ui.notifications.info(game.i18n.localize('VAGABOND.Actor.Party.Card.NoAvailable'));
      return;
    }

    const options = available
      .map(a => `<option value="${a.uuid}">${a.name}</option>`)
      .join('');

    const uuid = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('VAGABOND.Actor.Party.Card.AddMember'),
        icon: 'fas fa-user-plus',
      },
      content: `<div class="form-group">
        <label>${game.i18n.localize('VAGABOND.Actor.Party.Card.PickCharacter')}</label>
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

    if (uuid) await this._addMember(uuid);
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
            console.error('Vagabond | Party sheet: error creating effect:', err);
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
            console.error(`Vagabond | Party sheet: error with ${action}:`, err);
          }
        }, { signal });
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Vehicle Tab Actions
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Bind all vehicle tab interactive elements.
   * @param {AbortSignal} signal
   * @private
   */
  _bindVehicleActions(signal) {
    // Add part
    this.element.querySelectorAll('[data-action="addPart"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await this.actor.createEmbeddedDocuments('Item', [{
          name: game.i18n.localize('VAGABOND.Actor.Party.Vehicle.NewPart'),
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
          window: { title: `${game.i18n.localize('VAGABOND.Actor.Party.Vehicle.DeletePart')}: ${item.name}` },
          content: `<p>${game.i18n.format('VAGABOND.Actor.Party.Vehicle.DeletePartConfirm', { name: item.name })}</p>`,
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

    // HP heart — left click: -1 (Shift: -10), right click: +1 (Shift: +10)
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
    // Use class selector rather than data-action to avoid ApplicationV2 interference.
    // data-part-id is set directly on the <i> element in the template.
    this.element.querySelectorAll('.part-roll-damage').forEach(icon => {
      icon.addEventListener('click', async () => {
        const partId = icon.dataset.partId;
        if (!partId) return;
        await this._rollPartDamage(partId);
      }, { signal });
    });

    // Skill selector → live difficulty display.
    // Difficulties are read directly from actor.system (the same source used by the
    // character sheet template). The async IIFE resolves immediately for local actors
    // already in the game.actors collection.
    this.element.querySelectorAll('.crew-skill-select').forEach(select => {
      // Change listener: update difficulty display and persist skill to item data.
      select.addEventListener('change', async () => {
        const skillKey = select.value;

        // Update live difficulty display.
        const span = select.closest('.part-crew-member')?.querySelector('.crew-skill-difficulty');
        if (span) span.textContent = select._skillDifficulties?.[skillKey] ?? '–';

        // Write the new skill into system.crew on the vehiclePart item.
        // render:false prevents a double re-render (the updateItem hook will re-render the vehicle tab).
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

      // Build difficulty map and set initial value asynchronously.
      (async () => {
        const crewUuid = select.dataset.actorUuid;
        if (!crewUuid) return;
        const a = await fromUuid(crewUuid);
        if (!a) return;
        const sys = a.system;
        const diffs = {};
        for (const skillKey of Object.keys(CONFIG.VAGABOND.weaponSkills)) {
          const sk = sys.weaponSkills?.[skillKey]
                  ?? sys.skills?.[skillKey]
                  ?? sys.saves?.[skillKey];
          if (sk?.difficulty !== undefined) diffs[skillKey] = sk.difficulty;
        }
        select._skillDifficulties = diffs;
        const span = select.closest('.part-crew-member')?.querySelector('.crew-skill-difficulty');
        if (span) span.textContent = diffs[select.value] ?? '–';
      })();
    });

    // Attack with part — per crew member
    this.element.querySelectorAll('[data-action="attackPart"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const partId = btn.dataset.partId;
        const crewUuid = btn.dataset.actorUuid;
        if (!partId || !crewUuid) return;
        // Read the skill selector in the same crew row
        const row = btn.closest('.part-crew-member');
        const skillKey = row?.querySelector('.crew-skill-select')?.value ?? 'melee';
        await this._attackWithPart(partId, crewUuid, skillKey);
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

    // Open cargo container item sheet
    this.element.querySelectorAll('[data-action="openCargo"]').forEach(el => {
      el.addEventListener('click', () => {
        const itemId = el.closest('[data-item-id]')?.dataset.itemId;
        if (!itemId) return;
        const item = this.actor.items.get(itemId);
        item?.sheet.render(true);
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
  }

  /**
   * Open a dialog to pick a party member and add them as crew on a vehicle part.
   * @param {string} partId
   * @private
   */
  async _openCrewPicker(partId) {
    const item = this.actor.items.get(partId);
    if (!item) return;

    const currentCrew = new Set((item.system.crew ?? []).map(e => e.uuid));
    const available = game.actors
      .filter(a => a.type === 'character' && !currentCrew.has(a.uuid))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!available.length) {
      ui.notifications.info(game.i18n.localize('VAGABOND.Actor.Party.Vehicle.NoCrewAvailable'));
      return;
    }

    const options = available.map(a => `<option value="${a.uuid}">${a.name}</option>`).join('');
    const uuid = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.localize('VAGABOND.Actor.Party.Vehicle.AddCrew'),
        icon: 'fas fa-user-plus',
      },
      content: `<div class="form-group">
        <label>${game.i18n.localize('VAGABOND.Actor.Party.Card.PickCharacter')}</label>
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
   * Remove a crew member UUID from a vehicle part.
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
   * Roll damage for a vehicle part and post a damage-only chat card.
   * Used when the player clicks the damage icon directly (no attack roll).
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
      await damageRoll.evaluate();

      const targetsAtRollTime = TargetHelper.captureCurrentTargets();

      await VagabondChatCard.createActionCard({
        actor: this.actor,
        item: part,
        title: part.name,
        subtitle: game.i18n.localize('VAGABOND.Actor.Party.Vehicle.Damage'),
        damageRoll,
        damageFormula: base,
        damageType: part.system.damageType || 'physical',
        hasDefenses: false,
        targetsAtRollTime,
      });
    } catch(err) {
      console.error('VagabondPartySheet | _rollPartDamage failed:', err);
      ui.notifications.error('Failed to roll part damage. See console for details.');
    }
  }

  /**
   * Roll a vehicle part attack for a specific crew member using a chosen weapon skill.
   * Flow: d20 + attackModifier ≥ weaponSkill.difficulty → hit → roll damage.
   * @param {string} partId        - ID of the vehiclePart item
   * @param {string} crewUuid      - UUID of the crew member actor
   * @param {string} skillKey      - Weapon skill key: 'melee' | 'brawl' | 'finesse' | 'ranged'
   * @private
   */
  async _attackWithPart(partId, crewUuid, skillKey) {
    const part = this.actor.items.get(partId);
    if (!part) return;

    const crewActor = await fromUuid(crewUuid);
    if (!crewActor) return;

    const { VagabondChatCard } = globalThis.vagabond.utils;

    // Read difficulty directly from actor.system — prepareDerivedData() has already
    // computed it (trained, stat totals, perk bonuses) and stored it on the object.
    // This is the same source used by the character sheet template for display.
    // config.weaponSkills covers weapon skills (melee/brawl/finesse/ranged)
    // AND regular skills (influence, arcana, etc.) — check all three namespaces.
    const sys = crewActor.system;
    const skill = sys.weaponSkills?.[skillKey]
               ?? sys.skills?.[skillKey]
               ?? sys.saves?.[skillKey];
    if (!skill) {
      ui.notifications.warn(`${crewActor.name} has no "${skillKey}" skill data.`);
      return;
    }

    const difficulty = skill.difficulty ?? 20;
    const attackModifier = part.system.attackModifier ?? 0;
    // critNumber is a schema-defined field, always safe to read from system directly
    const critNumber = crewActor.system.critNumber ?? 20;

    // Build attack roll formula — attackModifier shifts the roll up or down
    const rollFormula = attackModifier !== 0
      ? `1d20 + ${attackModifier}`
      : '1d20';

    const roll = new Roll(rollFormula);
    await roll.evaluate();

    // Check hit and crit using the natural d20 result
    const naturalResult = roll.dice[0]?.results?.[0]?.result ?? roll.total;
    const isCritical = naturalResult >= critNumber;
    const isHit = roll.total >= difficulty;

    // Roll damage respecting the game settings (rollDamageWithCheck, alwaysRollDamage)
    let damageRoll = null;
    if (VagabondDamageHelper.shouldRollDamage(isHit)) {
      const base = part.system.damageFormula || '1d6';
      const damageFormula = isCritical ? `(${base}) + (${base})` : base;
      damageRoll = new Roll(damageFormula);
      await damageRoll.evaluate();
    }

    // Skill label for the chat card tag
    const skillLabelKey = CONFIG.VAGABOND.weaponSkills[skillKey] ?? `VAGABOND.WeaponSkills.${skillKey}`;
    const skillLabel = game.i18n.localize(skillLabelKey);

    // Capture targeted tokens at roll time
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
    if (this._actorUpdateHookId) {
      Hooks.off('updateActor', this._actorUpdateHookId);
      this._actorUpdateHookId = null;
    }
    if (this._itemHookIds) {
      Hooks.off('createItem', this._itemHookIds.createItem);
      Hooks.off('updateItem', this._itemHookIds.updateItem);
      Hooks.off('deleteItem', this._itemHookIds.deleteItem);
      this._itemHookIds = null;
    }
    if (this._effectHookIds) {
      Hooks.off('createActiveEffect', this._effectHookIds.create);
      Hooks.off('updateActiveEffect', this._effectHookIds.update);
      Hooks.off('deleteActiveEffect', this._effectHookIds.delete);
      this._effectHookIds = null;
    }
    return super.close(options);
  }
}
