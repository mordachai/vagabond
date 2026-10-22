import { migrateAlpha3Statuses, migrateAlpha3Backpacks, migrateAlpha3Rations, migrateAlpha3DefensePerks, migrateAlpha3ClassPerks, migrateAlpha3Perks, migrateAlpha3Ancestries, migrateLifeNoFreeDie, migrateVehementMagic, migrateAlpha3Classes, migrateClassFeatureScaleKeys, migrateClassFeatureActions, migrateClassFeatureEffects } from '../helpers/alpha3-migrations.mjs';
import { BardHelper } from '../helpers/bard-helper.mjs';
import { migrateFighterClass, migrateDruidClass, migrateGunslingerClass, migrateHunterClass, migrateLuminaryClass, migrateMagusClass, migrateMerchantClass, migratePugilistClass, migrateRevelatorClass, migrateRogueClass, migrateSorcererClass, migrateVanguardClass, migrateWitchClass, migrateWizardClass, migrateAncestries } from '../helpers/class-migrations.mjs';
import { ConjureHelper } from '../helpers/conjure-helper.mjs';
import { AlchemyHelper } from '../helpers/crafting/alchemy-helper.mjs';
import { CurrencyHelper } from '../helpers/currency-helper.mjs';
import { DancerHelper } from '../helpers/dancer-helper.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { VagabondFXResolver } from '../helpers/fx-file-resolver.mjs';
import { LightSource } from '../helpers/light-source.mjs';
import { MaterialsHelper } from '../helpers/materials-helper.mjs';
import { RageHelper } from '../helpers/rage-helper.mjs';
import { RaiseHelper } from '../helpers/raise-helper.mjs';
import { RelicHelper } from '../helpers/relic-helper.mjs';
import { loadJB2ADefaults } from '../helpers/sequencer-config.mjs';
import { VagabondSpellSequencer } from '../helpers/spell-sequencer.mjs';
import { SpellSurface } from '../helpers/spell-surface.mjs';
import { SpellTrackerHelper } from '../helpers/spell-tracker-helper.mjs';
import { TradeHelper } from '../helpers/trade-helper.mjs';

/**
 * Ready-time startup: FX defaults, light-source driver, world migrations (active GM), sweeps.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerReadyStartup() {
  Hooks.once('ready', function () {
    if (VagabondSpellSequencer.isAvailable() && VagabondSpellSequencer.isJB2AAvailable()) {
      loadJB2ADefaults();
    }
    VagabondSpellSequencer.warmConfigFiles();
    // This device's FX toggle on the User, so other casters' FX reach (or skip) this client
    VagabondSpellSequencer.syncViewerFlag();
    // GM pre-expands every configured wildcard FX path into the shared world-setting cache
    // so player clients can play those animations without FILES_BROWSE permission.
    VagabondFXResolver.resolveAllConfigured();
    // Light-source realtime burn-down driver (GM-only writes; refresh-safe).
    LightSource.startDriver();
    // One-time fix for items placed before the runAsGM compendium fix.
    LightSource.migrateRunAsGM();
    // One-time: Keen/Vicious tags → On Use Only effects on the weapon.
    EquipmentHelper.migrateWeaponPropertyEffects();
    // One-time: copies of Breath Attacks (and other pack items) take the Can't be Scrapped switch.
    EquipmentHelper.migrateNoScrap();
    // One-time: Barbarian class items get the book-revision effect set (per-behavior switches).
    const classRuns = [RageHelper.migrateBarbarianClass()];
    // Idempotent: hand-switch helper effects stay switchable now that other class effects are locked features.
    RageHelper.flagSwitchableEffects();
    // Idempotent: Aggressor auto/manual twins stop double-counting when both are on.
    RageHelper.syncAggressorTwins();
    // One-time: Alchemist class items get the book-revision effect set (per-behavior switches).
    classRuns.push(AlchemyHelper.migrateAlchemistClass());
    // One-time: Bard class items get the book-revision features + Enjoy the Silence effect.
    classRuns.push(BardHelper.migrateBardClass());
    // One-time: Dancer class items get the book-revision features + Footloose / Don't Stop Me Now effects.
    classRuns.push(DancerHelper.migrateDancerClass());
    // One-time: Fighter / Druid class items get the book-revision features + effects.
    classRuns.push(migrateFighterClass());
    classRuns.push(migrateDruidClass());
    // One-time: Gunslinger / Hunter class items get the book-revision features + effects.
    classRuns.push(migrateGunslingerClass());
    classRuns.push(migrateHunterClass());
    classRuns.push(migrateLuminaryClass());
    classRuns.push(migrateMagusClass());
    classRuns.push(migrateMerchantClass());
    classRuns.push(migratePugilistClass());
    classRuns.push(migrateRevelatorClass());
    classRuns.push(migrateRogueClass());
    classRuns.push(migrateSorcererClass());
    classRuns.push(migrateVanguardClass());
    classRuns.push(migrateWitchClass());
    classRuns.push(migrateWizardClass());
    // One-time: ancestry items get the book text, grants and effects (Dwarf also gets the Tough Perk).
    migrateAncestries();
    // One-time: stored copper amounts ×10 (ratio corrected to the book's 1s = 100c).
    CurrencyHelper.migrateCopperScale();
    // One-time: party actors hold no items any more (old party containers / Stash) — delete leftovers.
    TradeHelper.purgePartyItems().catch((err) => console.error('Vagabond | Party item purge failed', err));
    // One-time: the old 1g-per-item Materials split → one bundle per actor.
    MaterialsHelper.migrateBundles().catch((err) => console.error('Vagabond | Materials merge failed', err));
    // One-time: status effects already on actors get the Alpha 3 changes.
    migrateAlpha3Statuses();
    // One-time: Backpacks become 1 Slot held / +3 Slots worn.
    migrateAlpha3Backpacks();
    // One-time: "Rations (1 day)" copies become "Ration 1d" (name + icon from the gear pack).
    migrateAlpha3Rations();
    // One-time: Patience / Protector perks on actors get the Defense-property text + effect.
    migrateAlpha3DefensePerks();
    // One-time: Dusted Knuckle / Quick Draw perks on actors get the Alpha 3 text (+ Dusted Knuckle effects).
    migrateAlpha3ClassPerks();
    // One-time: Alpha 3 Perks §3 text / prerequisites (+ Skirmisher effects) on world perk copies.
    migrateAlpha3Perks();
    // One-time: Human trait Knack -> Aptitude.
    migrateAlpha3Ancestries();
    // One-time: Life copies pay Mana for every healing die (no free first die).
    migrateLifeNoFreeDie();
    // One-time: Vehement Magic copies get their spell-damage Explode effect.
    migrateVehementMagic();
    // One-time: buff Spell copies (Bless, Ward, Tempo…) get the Tracker hit macro.
    SpellTrackerHelper.migrateWorldSpells();
    // One-time: Hold / Control / Zap / Cure / Hymn copies get their book-checked handlers; live Trackers show their rule.
    SpellTrackerHelper.migrateStatusSpells();
    // One-time: Spells whose Effect stands alone (Burn, Frostburn…) drop requiresDamage (Damage / Effect split).
    SpellTrackerHelper.migrateSpellEffectEntries();
    // One-time: Spell copies get the pack's Target Beings / Objects switches (Cast dialog Target picker).
    SpellTrackerHelper.migrateSpellTargetSwitches();
    // One-time: Spell copies get the pack's Focus switches (Focus on Cast, Crit: No Focus).
    SpellTrackerHelper.migrateSpellFocusOnCast();
    // One-time: Spell copies get the pack's Focus Mana (Ward / Polymorph / Beast) and Ward Upcast switch.
    SpellTrackerHelper.migrateSpellFocusUpkeep();
    // One-time: Adhere / Apoplex / Goop / Frostburn / Gas copies get the book-checked status entries (Frostburning).
    SpellTrackerHelper.migrateSpellStatusEntries();
    // One-time: named Relic copies (Dyrnwyn, Elven Chain…) become their weapon / armor with attached Relics.
    RelicHelper.migrateNamedRelics();
    // One-time: Raise copies get the system:spell.raise hit macro.
    RaiseHelper.migrateWorldSpells();
    // One-time: Beast / Forge copies get their Conjure rules + the system:spell.conjure hit macro.
    ConjureHelper.migrateWorldSpells();
    // One-time: Surface Spell copies get their surface rules + the system:spell.surface hit macro.
    SpellSurface.migrateWorldSpells();
    // One-time: class items get the Alpha 3 deltas (runs after every earlier class migration settled).
    // Then: class items get the scaling-chain ids (scaleKey) the sheet / HUD collapse features on.
    // Then: feature buttons added to the pack later (Alchemist Mix) reach existing class copies.
    Promise.allSettled(classRuns).then(() => migrateAlpha3Classes()).then(() => migrateClassFeatureScaleKeys())
      .then(() => migrateClassFeatureActions()).then(() => migrateClassFeatureEffects());
  });
}
