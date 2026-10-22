import { CoinTransferDialog } from '../applications/coin-transfer-dialog.mjs';
import { ItemDisguiseApp } from '../applications/item-disguise-app.mjs';
import { ShopApp } from '../applications/shop-app.mjs';
import { WorkbenchApp } from '../applications/workbench-app.mjs';
import { VagabondActor } from '../documents/actor.mjs';
import { CountdownDice } from '../documents/countdown-dice.mjs';
import { ProgressClock } from '../documents/progress-clock.mjs';
import { AlchemyLab } from '../helpers/alchemy-lab.mjs';
import { BardHelper } from '../helpers/bard-helper.mjs';
import { VagabondChatCard } from '../helpers/chat-card.mjs';
import { ConeFx } from '../helpers/cone-fx.mjs';
import { ConjureHelper } from '../helpers/conjure-helper.mjs';
import { CraftingHelper } from '../helpers/crafting-helper.mjs';
import { CrystalHelper } from '../helpers/crystal-helper.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { VagabondDamageHelper } from '../helpers/damage-helper.mjs';
import { DancerHelper } from '../helpers/dancer-helper.mjs';
import { DruidHelper } from '../helpers/druid-helper.mjs';
import { FeatureAction } from '../helpers/feature-action.mjs';
import { FighterHelper } from '../helpers/fighter-helper.mjs';
import { FocusLink } from '../helpers/focus-link.mjs';
import { VagabondFXResolver } from '../helpers/fx-file-resolver.mjs';
import { GunslingerHelper } from '../helpers/gunslinger-helper.mjs';
import { HunterHelper } from '../helpers/hunter-helper.mjs';
import { ItemDisguise } from '../helpers/item-disguise.mjs';
import { registerMacroHandler, registerCastGate, executeItemMacro } from '../helpers/item-macro.mjs';
import { ItemNameTokens } from '../helpers/item-name-tokens.mjs';
import { LightSource } from '../helpers/light-source.mjs';
import { RaiseHelper } from '../helpers/raise-helper.mjs';
import { RelicHelper } from '../helpers/relic-helper.mjs';
import { RevelatorHelper } from '../helpers/revelator-helper.mjs';
import { VagabondRollBuilder } from '../helpers/roll-builder.mjs';
import { ShopPricing } from '../helpers/shop-pricing.mjs';
import { ShopTransactions } from '../helpers/shop-transactions.mjs';
import { registerSocket, registerSocketAction, emitSocket } from '../helpers/socket-helper.mjs';
import { SorcererHelper } from '../helpers/sorcerer-helper.mjs';
import { VagabondSpellSequencer } from '../helpers/spell-sequencer.mjs';
import { SpellSurface } from '../helpers/spell-surface.mjs';
import { SpellTrackerHelper } from '../helpers/spell-tracker-helper.mjs';
import { StatusHelper } from '../helpers/status-helper.mjs';
import { TokenPortrait } from '../helpers/token-portrait.mjs';
import { TradeHelper } from '../helpers/trade-helper.mjs';
import { WitchHelper } from '../helpers/witch-helper.mjs';
import { WizardHelper } from '../helpers/wizard-helper.mjs';

/**
 * Socket relay: built-in GM-side socket actions (registered on ready).
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerSocketActions() {
  /*  Socket Relay                                */
  /* -------------------------------------------- */

  Hooks.once('ready', function () {
    registerSocket();

    // Built-in socket actions — executed on GM client only
    registerSocketAction('applyDamage', async ({ actorUuid, newHp }) => {
      const actor = await fromUuid(actorUuid);
      if (!actor) return;
      await actor.update({ 'system.health.value': newHp });
    });

    // Generic relay for cross-actor field writes (heal/recover/recharge targeting
    // an actor the clicking user doesn't own, party-sheet HP/fatigue bars, etc).
    registerSocketAction('updateActorField', async ({ actorUuid, field, value }) => {
      const actor = await fromUuid(actorUuid);
      if (!actor) return;
      await actor.update({ [field]: value });
    });

    registerSocketAction('applyStatus', async ({ actorUuid, statusId, active, description, focusLink }) => {
      const actor = await fromUuid(actorUuid);
      if (!actor) return;
      if (active && !actor.statuses?.has(statusId)) {
        await actor.toggleStatusEffect(statusId, { active: true });
        // Effect of a Focus-held Spell Cast: ends with that Focus
        if (focusLink) await FocusLink.stampStatus(actor, statusId, focusLink);
      } else if (!active) {
        await actor.toggleStatusEffect(statusId, { active: false });
        return;
      }
      // Optional per-application description (Flanking/Flanked live text).
      if (description) {
        const eff = actor.effects.find(e => e.statuses?.has(statusId));
        if (eff && eff.description !== description) {
          await eff.update({ description, 'flags.vagabond.flankInfo': true });
        }
      }
    });

    registerSocketAction('createCountdownDie', async (data) => {
      await CountdownDice.create(data);
    });

    registerSocketAction('deleteCountdownDie', async ({ id }) => {
      const dice = game.journal.get(id);
      if (dice) await dice.delete();
    });

    registerSocketAction('createProgressClock', async (data) => {
      await ProgressClock.create(data);
    });

    // Combat Carousel / sidebar Combat Tracker — players may drag-reorder cards or
    // rows within their own (friendly) faction group; Combatant writes route
    // through the GM since a player rarely owns every actor in that group.
    registerSocketAction('reorderCombatants', async ({ combatId, updates }) => {
      const combat = game.combats.get(combatId);
      if (!combat) return;
      await combat.updateEmbeddedDocuments('Combatant', updates);
    });

    // Bard Virtuoso — players route the benefit copy onto Group members through the GM.
    registerSocketAction('virtuosoApply', (payload) => BardHelper.apply(payload));
    // Catalyze / Mix open the Alchemy lab (sheet tab) at that station; no lab (no Formula grants) = warning.
    const openLab = (scope, station) => (AlchemyLab.hasLab(scope.actor)
      ? AlchemyLab.openSheet(scope.actor, station)
      : ui.notifications.warn(game.i18n.format('VAGABOND.AlchemyLab.NoLab', { name: scope.actor?.name ?? '' })));
    registerMacroHandler('alchemist.catalyze', (scope) => openLab(scope, 'catalyze'));
    registerMacroHandler('alchemist.mix', (scope) => openLab(scope, 'mix'));
    registerMacroHandler('bard.virtuoso', (scope) => BardHelper.virtuoso(scope));
    registerMacroHandler('bard.perform', (scope) => BardHelper.perform(scope));
    registerMacroHandler('dancer.stepUp', (scope) => DancerHelper.stepUp(scope));
    registerMacroHandler('fighter.momentum', (scope) => FighterHelper.momentum(scope));
    registerMacroHandler('druid.polymorph', (scope) => DruidHelper.polymorph(scope));
    registerMacroHandler('druid.forceOfNature', (scope) => DruidHelper.forceOfNature(scope));
    registerMacroHandler('gunslinger.deadeye', (scope) => GunslingerHelper.deadeye(scope));
    registerMacroHandler('gunslinger.grit', (scope) => GunslingerHelper.grit(scope));
    registerMacroHandler('gunslinger.gritRemove', (scope) => GunslingerHelper.gritRemove(scope));
    registerMacroHandler('gunslinger.highNoon', (scope) => GunslingerHelper.highNoon(scope));
    registerMacroHandler('hunter.mark', (scope) => HunterHelper.mark(scope));
    registerMacroHandler('revelator.layOnHands', (scope) => RevelatorHelper.layOnHands(scope));
    registerMacroHandler('sorcerer.overpowered', (scope) => SorcererHelper.overpowered(scope));
    registerMacroHandler('witch.hex', (scope) => WitchHelper.hex(scope));
    registerMacroHandler('wizard.extracurricular', (scope) => WizardHelper.extracurricular(scope));
    registerMacroHandler('wizard.extracurricularSpell', (scope) => WizardHelper.extracurricularSpell(scope));
    registerMacroHandler('wizard.archwizard', (scope) => WizardHelper.archwizard(scope));
    // Buff Spells' hit macros: system:spell.status.<trackerId>
    SpellTrackerHelper.registerMacroHandlers(registerMacroHandler);
    // Raise: system:spell.raise + its cast gate (corpses, Being types, HD)
    RaiseHelper.registerMacroHandlers(registerMacroHandler, registerCastGate);
    // Conjure Spells (Beast, Forge): system:spell.conjure opens the Conjure picker
    ConjureHelper.registerMacroHandlers(registerMacroHandler, registerCastGate);
    // Spell Surfaces (Goop, Erupt, Sprout, Adhere, Terraform, Fog, Gas): system:spell.surface leaves the area on the map
    SpellSurface.register(registerMacroHandler);

    // Live state of feature buttons: glow while the effect is on, end it from the sheet / HUD
    // (right-click; Momentum is a pure toggle so a left click ends it too).
    FeatureAction.registerState('gunslinger.deadeye', {
      isActive: (actor) => GunslingerHelper.stacks(actor) > 0,
      count: (actor) => GunslingerHelper.stacks(actor),
      end: (actor) => GunslingerHelper.end(actor),
    });
    FeatureAction.registerState('fighter.momentum', {
      isActive: (actor) => !!FighterHelper.momentumEffect(actor)?.active,
      end: (actor) => FighterHelper.endMomentum(actor),
      toggle: true,
    });
    FeatureAction.registerState('hunter.mark', {
      isActive: (actor) => !!HunterHelper.markEffect(actor),
      end: (actor) => HunterHelper.dropMark(actor),
    });
    FeatureAction.registerState('wizard.archwizard', {
      isActive: (actor) => WizardHelper.hasArchwizardCopy(actor),
      end: (actor) => WizardHelper.endArchwizard(actor),
      toggle: true,
    });
    FeatureAction.registerState('witch.hex', {
      isActive: (actor) => !!WitchHelper.hexEffect(actor),
      end: (actor) => WitchHelper.dropHex(actor),
    });

    registerSocketAction('grantLuck', async ({ actorUuid, amount }) => {
      const actor = await fromUuid(actorUuid);
      if (!actor) return;
      // Luck Pool has no cap (maxLuck = Rest reset value only).
      const currentLuck = actor.system.currentLuck ?? 0;
      const newLuck = Math.max(0, currentLuck + amount);
      await actor.update({ 'system.currentLuck': newLuck });
    });

    // Imbue relay — caster writes/clears the imbue payload on a weapon they don't own
    // (another player's equipped weapon, or the wielder's weapon at delivery time).
    registerSocketAction('imbueUpdateWeapon', async ({ weaponUuid, data }) => {
      const weapon = await fromUuid(weaponUuid);
      if (!weapon) return;
      await weapon.update({ 'system.imbuedSpell': data });
    });

    // Legacy socket relay (clients on older code); current clients use the `vagabond.runItemMacro` query.
    registerSocketAction('runItemMacro', async (payload) => {
      try {
        await executeItemMacro(payload);
      } catch (err) {
        console.error('VAGABOND | GM-relayed macro execution failed:', err);
      }
    });

    // Light source relays — non-owners route privileged token/clock writes to the GM.
    registerSocketAction('lightApply', async ({ tokenUuid, light }) => {
      const tdoc = await fromUuid(tokenUuid);
      if (!tdoc) return;
      const wanted = LightSource._sightForLight(light);
      const update = {
        light,
        sight: { enabled: true, range: Math.max(tdoc.sight?.range ?? 0, wanted.range) },
      };
      if (tdoc.getFlag('vagabond', 'prevLight') === undefined) {
        update['flags.vagabond.prevLight'] = foundry.utils.deepClone(tdoc.light?.toObject?.() ?? tdoc.light ?? {});
        update['flags.vagabond.prevSight'] = foundry.utils.deepClone(tdoc.sight?.toObject?.() ?? tdoc.sight ?? {});
      }
      await tdoc.update(update);
    });
    registerSocketAction('lightDouse', async ({ tokenUuid }) => {
      const tdoc = await fromUuid(tokenUuid);
      if (!tdoc || tdoc.getFlag('vagabond', 'prevLight') === undefined) return;
      await tdoc.update({
        light: tdoc.getFlag('vagabond', 'prevLight'),
        sight: tdoc.getFlag('vagabond', 'prevSight') ?? tdoc.sight,
      });
      await tdoc.unsetFlag('vagabond', 'prevLight');
      if (tdoc.getFlag('vagabond', 'prevSight') !== undefined) await tdoc.unsetFlag('vagabond', 'prevSight');
    });
    registerSocketAction('lightSpawnClock', async (meta) => {
      await LightSource._createClockGM(meta);
    });
    registerSocketAction('lightDeleteClock', async ({ id }) => {
      await game.journal.get(id)?.delete();
    });

    // Positional spell-cast sound — broadcast (not GM-relayed) so every client computes
    // its own distance/wall-based volume from its own listener tokens and plays a plain
    // one-shot sound locally. Keeps audio timing in line with the locally-rendered FX.
    // GM "Show to Players": every targeted client opens the store window.
    registerSocketAction('shopShow', (data) => ShopApp.onShowSocket(data), { gmOnly: false });

    registerSocketAction('spellSoundPlay', (data) => {
      VagabondSpellSequencer._renderLocalPositionalSound(data);
    }, { gmOnly: false });

    // Sequencer FX wildcard resolution (GM resolves, players request via socket).
    VagabondFXResolver.registerSocket();

    // Public API for external modules
    game.vagabond = {
      version: game.system.version,
      // Progress clock cross-reference API: game.vagabond.clocks.value('doom'),
      // .set/.tick/.fill/.empty/.reset (GM only), .read(), .get(), .getAll()
      clocks: ProgressClock,
      // Circle token art: game.vagabond.tokenPortrait.convertAll() (GM) re-bakes / converts every token
      tokenPortrait: TokenPortrait,
      // Live item names: `{value}` / `{cost}` / `{qty}` / `{slots}` / `{uses}` in a stored name;
      // game.vagabond.itemNameTokens.register('key', item => text) adds a token
      itemNameTokens: ItemNameTokens,
      // Disguised items (GM): game.vagabond.disguise.open(item) editor, .disguise(item, {name, img, description,
      // lore, effects}), .reveal(item, {announce}), .isDisguised(item)
      disguise: {
        open: (item) => ItemDisguiseApp.open(item),
        disguise: (item, shown) => ItemDisguise.disguise(item, shown),
        reveal: (item, opts) => ItemDisguise.reveal(item, opts),
        isDisguised: (item) => ItemDisguise.isDisguised(item),
      },
      // Light-source automation: game.vagabond.lightSource.use({...}) (item macros),
      // .douse(token) (hotbar "Douse Light" macro).
      lightSource: LightSource,
      // Money math (g/s/c): game.vagabond.currency.format(copper), .pay(wallet, copper), …
      currency: CurrencyHelper,
      // FX: game.vagabond.fx.cone({ source, targets, file, length }) — fixed-length cone
      // (Automated Animations macro "Cone Animation" in the FX Macros pack)
      fx: {
        cone: (opts) => ConeFx.cone(opts),
      },
      // Shops: game.vagabond.shop.open(ref), .openShop/.closeShop/.toggleOpen(ref) (GM; .show = openShop),
      // .isOpen(ref), .setAllOpen(bool),
      // .buy({ shop, buyer, itemId, qty }), .buyCart({ shop, buyer, party?, lines }),
      // .sell({ shop, seller, itemId, qty }), .partyTransfer({ party, actor, copper }), .price(item, ctx)
      shop: {
        open: (ref, options) => ShopApp.open(ref, options),
        show: (ref) => ShopApp.show(ref), // alias of openShop
        // GM open/close (hotbar macros): openShop pushes the store window to players; closing shuts it
        openShop: (ref) => ShopApp.openShop(ref),
        closeShop: (ref) => ShopApp.closeShop(ref),
        toggleOpen: (ref) => ShopApp.toggleOpen(ref),
        isOpen: (ref) => ShopApp.isOpen(ref),
        setAllOpen: (open) => ShopApp.setAllOpen(open),
        buy: (args) => ShopTransactions.buy(args),
        buyCart: (args) => ShopTransactions.buyCart(args),
        sell: (args) => ShopTransactions.sell(args),
        partyTransfer: (args) => ShopTransactions.partyTransfer(args),
        price: (item, ctx) => ShopPricing.price(item, ctx),
        transactions: ShopTransactions,
        pricing: ShopPricing,
      },
      // Free trade: game.vagabond.trade.moveItem({source, dest, qty}), .moveCoins({from, to, copper}),
      // .coins(holder) opens the coin split dialog; .helper = TradeHelper (canTake / canGive).
      trade: {
        moveItem: (args) => TradeHelper.moveItem(args),
        moveCoins: (args) => TradeHelper.moveCoins(args),
        coins: (holder, opts) => CoinTransferDialog.open(holder, opts),
        helper: TradeHelper,
      },
      // Raise: game.vagabond.raise.cleanup() (GM) puts spent Undead corpses back and deletes their Undead Army copies
      raise: {
        cleanup: () => RaiseHelper.cleanup(),
      },
      // Conjure: game.vagabond.conjure.helper = ConjureHelper (rules / candidates / place)
      conjure: {
        helper: ConjureHelper,
      },
      // Crafting: game.vagabond.craft.config(), .valuePerShift(actor),
      // .evaluate/.execute/.request(actor, modeKey, recipe, opts), .workShift(actor,
      // allocations), .open(actor) opens the Workbench.
      craft: {
        config: () => CraftingHelper.config(),
        valuePerShift: (actor) => CraftingHelper.valuePerShift(actor),
        evaluate: (actor, modeKey, recipe, opts) => CraftingHelper.evaluate(actor, modeKey, recipe, opts),
        execute: (actor, modeKey, recipe, opts) => CraftingHelper.execute(actor, modeKey, recipe, opts),
        request: (actor, modeKey, recipe, opts) => CraftingHelper.request(actor, modeKey, recipe, opts),
        workShift: (actor, allocations) => CraftingHelper.workShift(actor, allocations),
        open: (actor) => WorkbenchApp.open(actor),
        // Combine (GM ritual, decision — docs/crafting-plan.md §4.11): not a
        // craftModes entry (no Shift/Materials, GM judgement only) — call directly.
        combine: (baseHost, otherHost, opts) => RelicHelper.combine(baseHost, otherHost, opts),
        // Disguised items (GM, ItemDisguise): kept names for macros; see game.vagabond.disguise
        disguiseRelic: (item, shown) => ItemDisguise.disguise(item, shown),
        revealRelic: (item, opts) => ItemDisguise.reveal(item, opts),
        // Mana Crystals (variant, off by default): socket mechanics only — see
        // CrystalHelper's own doc comment for what's deferred.
        socketCrystal: (hostItem, crystalItem, slotIndex) => CrystalHelper.socket(hostItem, crystalItem, slotIndex),
        unsocketCrystal: (hostItem, slotIndex) => CrystalHelper.unsocket(hostItem, slotIndex),
        endQuest: (actor) => CrystalHelper.endQuest(actor),
        helper: CraftingHelper,
        relicHelper: RelicHelper,
        crystalHelper: CrystalHelper,
      },
      api: {
        VagabondChatCard,
        VagabondDamageHelper,
        StatusHelper,
        BardHelper,
        DancerHelper,
        FighterHelper,
        DruidHelper,
        GunslingerHelper,
        HunterHelper,
        VagabondRollBuilder,
        // Stable read-only derived snapshot for modules/macros:
        // game.vagabond.api.readActor(actorOrTokenOrUuidOrId)
        readActor: VagabondActor.read,
      },
      socket: {
        emit: emitSocket,
        register: registerSocketAction,
      },
    };
  });
}
