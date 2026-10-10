import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { VagabondChatHelper } from '../helpers/chat-helper.mjs';
import { WorkbenchApp } from './workbench-app.mjs';
import { CraftingHelper } from '../helpers/crafting-helper.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { DowntimeHelper, SHIFTS_PER_DAY } from '../helpers/downtime-helper.mjs';
import { ProgressClock } from '../documents/progress-clock.mjs';
import { MaterialsHelper } from '../helpers/materials-helper.mjs';

const { api } = foundry.applications;

/** Foundry core art per activity (webp, not the icons/svg set). Also used for the Shift log chips. */
const ICONS = {
  craft: 'icons/skills/trades/smithing-anvil-silver-red.webp',
  study: 'icons/skills/trades/academics-book-study-runes.webp',
  forage: 'icons/skills/trades/farming-picking-basket-fruit-green.webp',
  hunt: 'icons/creatures/mammals/deer-antlers-green.webp',
  other: 'icons/consumables/drinks/alcohol-beer-mug-yellow.webp',
  rest: 'icons/sundries/survival/bedroll-brown.webp',
  breather: 'icons/sundries/survival/waterskin-leather-brown.webp',
};

const L = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

/**
 * Downtime panel (book "Downtime"): a Shift tracker (one 4-segment clock per Day) over the
 * activities — Craft, Study, Foraging, Hunting, Other — plus Rest and Breather, which are not
 * Downtime activities but live here for convenience. State is on the actor
 * (`flags.vagabond.downtime`, see DowntimeHelper); this app is one view per actor.
 */
export class DowntimeApp extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  /** @type {Map<string, DowntimeApp>} actor uuid → open panel */
  static #instances = new Map();

  /** Open (or bring forward) the panel for `actor`. */
  static open(actor) {
    let app = DowntimeApp.#instances.get(actor.uuid);
    if (!app) {
      app = new DowntimeApp(actor);
      DowntimeApp.#instances.set(actor.uuid, app);
    }
    app.render({ force: true });
    return app;
  }

  constructor(actor, options = {}) {
    super({ id: `downtime-manager-${actor.id}`, ...options });
    this.#actor = actor;
  }

  #actor;
  /** Tile whose drawer (controls + book text) is open; null = all closed. */
  #selected = null;
  /** Foraging pick: 'rations' | 'materials'. */
  #forageType = 'rations';
  #hookIds = [];
  #renderDebounce = foundry.utils.debounce(() => this.render(), 100);

  static DEFAULT_OPTIONS = {
    classes: ['vagabond', 'downtime-manager'],
    tag: 'div',
    window: {
      title: 'VAGABOND.Downtime.Title',
      icon: 'fas fa-hourglass-half',
      resizable: false,
    },
    position: { width: 560, height: 'auto' },
    actions: {
      shiftAdd: DowntimeApp.#onShiftAdd,
      shiftRemove: DowntimeApp.#onShiftRemove,
      shiftReset: DowntimeApp.#onShiftReset,
      selectTile: DowntimeApp.#onSelectTile,
      forageType: DowntimeApp.#onForageType,
      openWorkbench: DowntimeApp.#onOpenWorkbench,
      processStudy: DowntimeApp.#onStudy,
      processForage: DowntimeApp.#onForage,
      processHunt: DowntimeApp.#onHunt,
      processOther: DowntimeApp.#onOther,
      processRest: DowntimeApp.#onRest,
      processBreather: DowntimeApp.#onBreather,
    },
  };

  static PARTS = {
    form: { template: 'systems/vagabond/templates/actor/downtime-activities.hbs' },
  };

  get title() {
    return `${L('VAGABOND.Downtime.Title')} - ${this.#actor.name}`;
  }

  get actor() {
    return this.#actor;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.#actor;
    const state = DowntimeHelper.state(actor);
    const used = state.log.length;
    const left = Math.max(0, state.shifts - used);

    // One 4-segment clock per Day; filled segments = Shifts still left that Day.
    const clocks = [];
    for (let day = 0; day * SHIFTS_PER_DAY < state.shifts; day++) {
      const planned = Math.min(SHIFTS_PER_DAY, state.shifts - day * SHIFTS_PER_DAY);
      const spent = Math.clamp(used - day * SHIFTS_PER_DAY, 0, planned);
      const remaining = planned - spent;
      clocks.push({
        img: ProgressClock.getSVGPath(SHIFTS_PER_DAY, remaining),
        tooltip: L('VAGABOND.Downtime.Tracker.DayTooltip', { day: day + 1, left: remaining, planned }),
        partial: planned < SHIFTS_PER_DAY,
      });
    }

    const lodging = Object.entries(CONFIG.VAGABOND.lodgingExpenses).map(([key, l]) => ({
      key,
      label: `${L(l.label)} (${l.cost > 0 ? CurrencyHelper.format(l.cost * CurrencyHelper.RATES.silver) : L('VAGABOND.Downtime.Free')})`,
    }));

    const skills = (CONFIG.VAGABOND.homebrew?.skills ?? [])
      .filter(s => actor.system.skills?.[s.key])
      .map(s => {
        const sk = actor.system.skills[s.key];
        return { key: s.key, label: `${sk.label ?? L(s.label)} (${sk.difficulty ?? '—'})` };
      });

    // What each pane needs, shown next to its button: Survival Difficulty, Materials, coins.
    const survival = actor.system.skills?.survival;
    const valuePerShift = CraftingHelper.valuePerShift(actor);
    const have = {
      survival: {
        label: survival?.label ?? L('VAGABOND.Skills.Survival'),
        difficulty: survival?.difficulty ?? '—',
        trained: !!survival?.trained,
      },
      materials: CurrencyHelper.format(MaterialsHelper.totalValue(actor)),
      valuePerShift: valuePerShift > 0 ? CurrencyHelper.format(valuePerShift) : '—',
      coins: CurrencyHelper.format(actor.system.currency ?? {}),
    };

    const might = actor.system.stats?.might?.total ?? actor.system.stats?.might?.value ?? 0;

    const noShifts = left === 0;
    const studiedDice = actor.system.studiedDice ?? 0;
    const rations = DowntimeHelper.rationCount(actor);
    const breatherUsed = DowntimeHelper.breatherUsed(actor);
    const craftingEnabled = CraftingHelper.config().general.enabled;
    const tile = (key, titleKey, { badge = null, badgeIcon = null, badgeTooltip = '', blocked = false, zero = false } = {}) => ({
      key, icon: ICONS[key], title: L(titleKey), selected: this.#selected === key,
      badge, badgeIcon, badgeTooltip, blocked, zero,
    });
    const activityTiles = [
      tile('craft', 'VAGABOND.Downtime.Craft.Title', { blocked: !craftingEnabled }),
      tile('study', 'VAGABOND.Downtime.Study.Title', {
        badge: studiedDice, badgeIcon: 'fas fa-dice-d6', badgeTooltip: L('VAGABOND.Downtime.Study.DiceTooltip'), blocked: noShifts,
      }),
      tile('forage', 'VAGABOND.Downtime.Forage.Title', { blocked: noShifts }),
      tile('hunt', 'VAGABOND.Downtime.Hunt.Title', { blocked: noShifts }),
      tile('other', 'VAGABOND.Downtime.Other.Title', { blocked: noShifts }),
    ];
    const restTiles = [
      tile('rest', 'VAGABOND.Downtime.Rest.Title'),
      tile('breather', 'VAGABOND.Downtime.Breather.Title', {
        badge: rations, badgeIcon: 'fas fa-drumstick-bite', badgeTooltip: L('VAGABOND.Downtime.Breather.RationsTooltip'),
        blocked: breatherUsed, zero: rations === 0,
      }),
    ];

    Object.assign(context, {
      icons: ICONS,
      activityTiles,
      restTiles,
      activityOpen: activityTiles.some(t => t.selected),
      restOpen: restTiles.some(t => t.selected),
      sel: this.#selected ? { [this.#selected]: true } : {},
      tracker: {
        shifts: state.shifts,
        used,
        left,
        clocks,
        canAdd: state.shifts < DowntimeHelper.MAX_SHIFTS,
        canRemove: state.shifts > Math.max(1, used),
        canReset: used > 0 || state.breatherAt >= 0,
        log: state.log.map((e, i) => ({
          img: ICONS[e.key] ?? ICONS.other,
          tooltip: `${L('VAGABOND.Downtime.Tracker.ShiftN', { n: i + 1 })}: ${L(`VAGABOND.Downtime.${e.key[0].toUpperCase()}${e.key.slice(1)}.Title`)}`,
        })),
      },
      noShifts,
      craftingEnabled,
      studiedDice,
      forageType: this.#forageType,
      skills,
      defaultSkill: skills.find(s => s.key === 'influence')?.key ?? skills[0]?.key,
      lodging,
      have,
      might,
      rations,
      breatherUsed,
    });
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.#hookIds.length) return;
    const actorId = this.#actor.id;
    const onItem = (item) => { if (item.parent?.id === actorId) this.#renderDebounce(); };
    this.#hookIds = [
      ['updateActor', Hooks.on('updateActor', (a) => { if (a.id === actorId) this.#renderDebounce(); })],
      ['createItem', Hooks.on('createItem', onItem)],
      ['updateItem', Hooks.on('updateItem', onItem)],
      ['deleteItem', Hooks.on('deleteItem', onItem)],
    ];
  }

  /** @override */
  async close(options) {
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
    DowntimeApp.#instances.delete(this.#actor.uuid);
    return super.close(options);
  }

  /* -------------------------------------------- */
  /* Shift tracker                                */
  /* -------------------------------------------- */

  static async #onShiftAdd() {
    await DowntimeHelper.setShifts(this.#actor, DowntimeHelper.state(this.#actor).shifts + 1);
  }

  static async #onShiftRemove() {
    await DowntimeHelper.setShifts(this.#actor, DowntimeHelper.state(this.#actor).shifts - 1);
  }

  static async #onShiftReset() {
    await DowntimeHelper.reset(this.#actor);
  }

  /**
   * Tile click: open its drawer (controls + book text) under its mosaic, or close it when
   * clicked again. Done in place (no re-render) so the drawer animates; one drawer at a time.
   */
  static #onSelectTile(event, target) {
    const key = target.dataset.key;
    this.#selected = this.#selected === key ? null : key;
    const root = this.element;
    for (const t of root.querySelectorAll('.dt-tile')) t.classList.toggle('is-selected', t.dataset.key === this.#selected);
    for (const p of root.querySelectorAll('.dt-pane')) p.classList.toggle('is-active', p.dataset.pane === this.#selected);
    for (const d of root.querySelectorAll('.dt-drawer')) {
      d.classList.toggle('is-open', !!d.querySelector(`.dt-pane[data-pane="${this.#selected}"]`));
    }
    // Re-fit the window while the drawer grows / shrinks, and once it settles.
    const refit = () => this.setPosition({ height: 'auto' });
    refit();
    root.querySelectorAll('.dt-drawer').forEach(d => d.addEventListener('transitionend', refit, { once: true }));
  }

  static #onForageType(event, target) {
    this.#forageType = target.dataset.value;
    for (const btn of target.parentElement.querySelectorAll('[data-action="forageType"]')) {
      btn.classList.toggle('is-selected', btn === target);
    }
  }

  /** A Shift activity can't start once the planned Shifts are spent (add one with +). */
  #requireShift() {
    if (DowntimeHelper.shiftsLeft(this.#actor) > 0) return true;
    ui.notifications.warn(L('VAGABOND.Downtime.Tracker.NoShiftsLeft'));
    return false;
  }

  /** Generic result card, with optional rolls attached for Dice So Nice / the roll tooltip. */
  async #postCard(titleKey, icon, html, rolls = []) {
    const card = new VagabondChatCard()
      .setType('generic')
      .setActor(this.#actor)
      .setTitle(L(titleKey))
      .setSubtitle(this.#actor.name)
      .setDescription(`<p><i class="${icon}"></i> ${html}</p>`);
    if (!rolls.length) return card.send();
    return ChatMessage.create({
      content: await card.render(),
      speaker: ChatMessage.getSpeaker({ actor: this.#actor }),
      rolls,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
      rollMode: VagabondChatHelper.getRollMode(),
    });
  }

  /* -------------------------------------------- */
  /* Activities (each takes a Shift)              */
  /* -------------------------------------------- */

  /** Craft: the Workbench works the Shift (and logs it here through DowntimeHelper). */
  static #onOpenWorkbench() {
    WorkbenchApp.open(this.#actor);
  }

  static async #onStudy() {
    if (!this.#requireShift()) return;
    const actor = this.#actor;
    const dice = (actor.system.studiedDice ?? 0) + 1;
    await actor.update({ 'system.studiedDice': dice });
    await DowntimeHelper.spendShift(actor, 'study');
    await this.#postCard('VAGABOND.Downtime.Study.Title', 'fas fa-book-open',
      L('VAGABOND.Downtime.Study.Result', { name: actor.name, dice }));
  }

  static async #onForage(event) {
    if (!this.#requireShift()) return;
    const actor = this.#actor;
    const check = await DowntimeHelper.rollSkillCheck(actor, 'survival', { event });
    if (!check) return;
    await DowntimeHelper.spendShift(actor, 'forage');
    if (!check.isSuccess) {
      return this.#postCard('VAGABOND.Downtime.Forage.Title', 'fas fa-leaf', L('VAGABOND.Downtime.Forage.Fail', { name: actor.name }));
    }

    const mult = check.isCritical ? 2 : 1;
    const roll = await new Roll('1d6').evaluate();
    let text;
    if (this.#forageType === 'materials') {
      const silver = roll.total * 5 * mult;
      await DowntimeHelper.grantMaterials(actor, silver);
      text = L('VAGABOND.Downtime.Forage.FoundMaterials', { name: actor.name, value: CurrencyHelper.format(silver * CurrencyHelper.RATES.silver) });
    } else {
      const n = roll.total * mult;
      await DowntimeHelper.grantRations(actor, n);
      text = L('VAGABOND.Downtime.Forage.FoundRations', { name: actor.name, n });
    }
    if (check.isCritical) text += ` <em>${L('VAGABOND.Downtime.CritDouble')}</em>`;
    return this.#postCard('VAGABOND.Downtime.Forage.Title', 'fas fa-leaf', text, [roll]);
  }

  static async #onHunt(event) {
    if (!this.#requireShift()) return;
    const actor = this.#actor;
    const check = await DowntimeHelper.rollSkillCheck(actor, 'survival', { event });
    if (!check) return;
    await DowntimeHelper.spendShift(actor, 'hunt');
    if (!check.isSuccess) {
      return this.#postCard('VAGABOND.Downtime.Hunt.Title', 'fas fa-paw', L('VAGABOND.Downtime.Hunt.Fail', { name: actor.name }));
    }

    const table = CONFIG.VAGABOND.wildGame;
    const rolls = [];
    let beast;
    if (check.isCritical) {
      // "On a Crit, choose which Beast you find."
      const key = await api.DialogV2.wait({
        window: { title: L('VAGABOND.Downtime.Hunt.ChooseTitle') },
        content: `<p>${L('VAGABOND.Downtime.Hunt.ChooseHint')}</p>`,
        buttons: table.map((b, i) => ({ action: b.key, label: L(b.label), default: i === 0 })),
        rejectClose: false,
      });
      beast = table.find(b => b.key === key) ?? table[0];
    } else {
      const tableRoll = await new Roll(`1d${table.length}`).evaluate();
      rolls.push(tableRoll);
      beast = table[tableRoll.total - 1];
    }
    const qtyRoll = await new Roll(beast.qty).evaluate();
    rolls.push(qtyRoll);

    const per = DowntimeHelper.harvestYield(beast);
    const name = L(beast.label) + (beast.prey ? ` (${L('VAGABOND.Downtime.Hunt.Prey')})` : '');
    const text = `${L('VAGABOND.Downtime.Hunt.Found', { name: actor.name, qty: qtyRoll.total, beast: name })}</p>
      <ul>
        <li>${L('VAGABOND.Downtime.Hunt.YieldRations', { n: per.rations })}</li>
        <li>${L('VAGABOND.Downtime.Hunt.YieldMaterials', { value: CurrencyHelper.format(per.materialsSilver * CurrencyHelper.RATES.silver) })}</li>
      </ul>
      <p><em>${L('VAGABOND.Downtime.Hunt.HarvestNote')}</em>`;
    return this.#postCard('VAGABOND.Downtime.Hunt.Title', 'fas fa-paw', text, rolls);
  }

  /** Other Activities: spend wealth, Skill Check with +1 per 10g invested. */
  static async #onOther(event) {
    if (!this.#requireShift()) return;
    const actor = this.#actor;
    const skillKey = this.element.querySelector('[name="otherSkill"]')?.value;
    const gold = Math.max(0, Math.floor(Number(this.element.querySelector('[name="otherGold"]')?.value) || 0));
    if (!skillKey) return;

    if (gold > 0) {
      const wallet = CurrencyHelper.pay(actor.system.currency, gold * CurrencyHelper.RATES.gold);
      if (!wallet) {
        ui.notifications.warn(L('VAGABOND.Downtime.NotEnoughMoney', {
          cost: CurrencyHelper.format(gold * CurrencyHelper.RATES.gold),
          have: CurrencyHelper.format(actor.system.currency),
        }));
        return;
      }
      await actor.update({ 'system.currency.gold': wallet.gold, 'system.currency.silver': wallet.silver, 'system.currency.copper': wallet.copper });
    }

    const bonus = Math.floor(gold / 10);
    const tags = gold > 0
      ? [{ label: L('VAGABOND.Downtime.Other.InvestedTag', { value: CurrencyHelper.format(gold * CurrencyHelper.RATES.gold), bonus }), icon: 'fas fa-coins' }]
      : [];
    const check = await DowntimeHelper.rollSkillCheck(actor, skillKey, { bonus, event, tags });
    if (!check) return;
    await DowntimeHelper.spendShift(actor, 'other');
  }

  /* -------------------------------------------- */
  /* Rest & Breather (not Downtime activities)    */
  /* -------------------------------------------- */

  static async #onRest() {
    const actor = this.#actor;
    const lodgingKey = this.element.querySelector('[name="lodgingType"]')?.value ?? 'none';
    const lodging = CONFIG.VAGABOND.lodgingExpenses[lodgingKey];

    // Lodging cost is in silver; CurrencyHelper works in copper and makes change.
    const costCopper = lodging.cost * CurrencyHelper.RATES.silver;
    const wallet = CurrencyHelper.pay(actor.system.currency, costCopper);
    if (!wallet) {
      ui.notifications.warn(L('VAGABOND.Downtime.NotEnoughMoney', {
        cost: CurrencyHelper.format(costCopper), have: CurrencyHelper.format(actor.system.currency),
      }));
      return;
    }

    const sys = actor.system;
    const hp = sys.health.value, maxHP = sys.health.max;
    const mana = sys.mana.current, maxMana = sys.mana.max;
    const luck = sys.currentLuck, luckStat = sys.maxLuck ?? 0; // Rest resets the pool to the Luck Stat
    const fatigue = sys.fatigue || 0;

    const updates = {
      'system.health.value': maxHP,
      'system.mana.current': maxMana,
      'system.currentLuck': luckStat,
      'flags.vagabond.forceOfNatureUsed': false,
      'system.currency.gold': wallet.gold,
      'system.currency.silver': wallet.silver,
      'system.currency.copper': wallet.copper,
    };
    const lines = [];
    // "If your HP is already at your Max, the Rest instead removes 1 Fatigue."
    if (hp >= maxHP && fatigue > 0) {
      updates['system.fatigue'] = fatigue - 1;
      lines.push(`${L('VAGABOND.Downtime.Rest.Fatigue')}: ${fatigue} → ${fatigue - 1}`);
    } else {
      lines.push(`${L('VAGABOND.Downtime.Rest.HP')}: ${hp} → ${maxHP}`);
    }
    if (maxMana > 0) lines.push(`${L('VAGABOND.Downtime.Rest.Mana')}: ${mana} → ${maxMana}`);
    lines.push(`${L('VAGABOND.Downtime.Rest.Luck')}: ${luck} → ${luckStat}`);

    await actor.update(updates);
    await DowntimeHelper.spendShift(actor, 'rest');

    await this.#postCard('VAGABOND.Downtime.Rest.Title', 'fas fa-bed', `${L('VAGABOND.Downtime.Rest.Result', {
      name: actor.name,
      lodging: L(lodging.label),
      cost: lodging.cost > 0 ? CurrencyHelper.format(costCopper) : L('VAGABOND.Downtime.Free'),
    })}</p><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul><p>`);
  }

  /** "Once per Shift, you can eat a ration and drink some water to regain HP equal to your Might." */
  static async #onBreather() {
    const actor = this.#actor;
    if (DowntimeHelper.breatherUsed(actor)) {
      ui.notifications.warn(L('VAGABOND.Downtime.Breather.AlreadyUsed'));
      return;
    }
    const might = actor.system.stats?.might?.total ?? actor.system.stats?.might?.value ?? 0;
    const hp = actor.system.health.value;
    const newHP = Math.min(actor.system.health.max, hp + might);

    const ration = DowntimeHelper.rationItem(actor);
    if (ration) await CONFIG.Item.documentClass._consumeCharge(ration);

    await actor.update({ 'system.health.value': newHP });
    await DowntimeHelper.markBreather(actor);

    let text = L('VAGABOND.Downtime.Breather.Result', { name: actor.name, n: newHP - hp, from: hp, to: newHP });
    text += ` <em>${L(ration ? 'VAGABOND.Downtime.Breather.RationEaten' : 'VAGABOND.Downtime.Breather.NoRation')}</em>`;
    await this.#postCard('VAGABOND.Downtime.Breather.Title', 'fas fa-heart', text);
  }
}
