import { VagabondCharacterHud } from '../applications/character-hud.mjs';
import { VagabondNPCHud } from '../applications/npc-hud.mjs';
import { CombatCarousel } from '../applications/combat-carousel.mjs';
import { hubMenu } from '../applications/settings-hub.mjs';
import { RegionTextureOverlay } from '../ui/region-texture-overlay.mjs';
import { TokenStatusPanel } from '../ui/token-status-panel.mjs';
import { VagabondSpellSequencer } from '../helpers/spell-sequencer.mjs';
import { VagabondFXResolver } from '../helpers/fx-file-resolver.mjs';

/**
 * Register every Vagabond game setting and the Settings Hub menu buttons.
 *
 * Nothing here is `config: true` — Foundry's settings tab shows a single button
 * opening the Settings Hub (`applications/settings-hub.mjs`), whose sidebar holds
 * the subjects (Rules, Magic, Combat & Encounters, …). Which setting appears in
 * which subject/section is declared in `settings-layout.mjs`; this file only
 * registers storage (grouped below in the same subject order for readability).
 *
 * Setting KEYS are a persistence contract — never rename one without a migration.
 *
 * @param {object} deps  Callbacks owned by vagabond.mjs.
 * @param {Function} deps.refreshClockDependents       Re-prepare actors + re-render sheets.
 * @param {Function} deps.applyTokenEffectVisibility   Re-apply token status icon visibility.
 */
export function registerGameSettings({ refreshClockDependents, applyTokenEffectVisibility }) {
  // Re-render every open ApplicationV2 instance (actor sheets, open spell cast
  // dialogs, etc). Used as the onChange handler for client display settings
  // that affect what's drawn, so users see changes immediately without reload.
  const reRenderAllApps = () => {
    try {
      const insts = foundry.applications?.instances;
      if (insts?.values) {
        for (const app of insts.values()) {
          if (app?.rendered) app.render();
        }
      }
    } catch (e) {
      console.warn('VagabondSystem | onChange re-render failed', e);
    }
  };

  // Combat tracker + Carousel redraw (faction names/colors, carousel table options).
  const refreshCombatDisplays = () => {
    ui.combat?.render();
    CombatCarousel.refresh();
  };

  // Activation points changed: reset every combatant's activations to the new
  // maximum. World setting onChange fires on every client — only the active GM writes.
  const syncActivationPoints = async () => {
    refreshCombatDisplays();
    if (!game.users.activeGM?.isSelf) return;
    const newMax = game.settings.get('vagabond', 'useActivationPoints')
      ? (game.settings.get('vagabond', 'defaultActivationPoints') || 2)
      : 1;
    for (const combat of game.combats) {
      const updates = combat.combatants.map(c => ({
        _id: c.id,
        'flags.vagabond.activations': { max: newMax, value: newMax },
      }));
      if (updates.length) await combat.updateEmbeddedDocuments('Combatant', updates);
    }
  };

  /* -------------------------------------------- */
  /*  Settings Hub button                         */
  /* -------------------------------------------- */

  // The ONLY entry in Foundry's Vagabond settings tab. Subjects live in the hub's
  // own sidebar (players get the subjects that have per-player sections).
  game.settings.registerMenu('vagabond', 'settingsHub', {
    name: 'VAGABOND.SettingsHub.Title',
    label: 'VAGABOND.SettingsHub.OpenAll',
    hint: 'VAGABOND.SettingsHub.MenuHint',
    icon: 'fas fa-gears',
    type: hubMenu(),
    restricted: false,
  });

  /* -------------------------------------------- */
  /*  Rules                                       */
  /* -------------------------------------------- */

  game.settings.register('vagabond', 'rollDamageWithCheck', {
    name: 'VAGABOND.Settings.rollDamageWithCheck.name',
    hint: 'VAGABOND.Settings.rollDamageWithCheck.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  // Roll damage even on a miss (only with rollDamageWithCheck)
  game.settings.register('vagabond', 'alwaysRollDamage', {
    name: 'VAGABOND.Settings.alwaysRollDamage.name',
    hint: 'VAGABOND.Settings.alwaysRollDamage.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: false,
  });

  game.settings.register('vagabond', 'npcUseFlatDamage', {
    name: 'VAGABOND.Settings.npcUseFlatDamage.name',
    hint: 'VAGABOND.Settings.npcUseFlatDamage.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  game.settings.register('vagabond', 'autoApplySaveDamage', {
    name: 'VAGABOND.Settings.autoApplySaveDamage.name',
    hint: 'VAGABOND.Settings.autoApplySaveDamage.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  // Defense weapon property: does a passed Defense Check reduce by EVERY equipped Defense
  // weapon's dice (RAW, on) or only the one that made the Check? Read by DefenseHelper.reductionWeapons.
  game.settings.register('vagabond', 'defenseWithBothWeapons', {
    name: 'VAGABOND.Settings.defenseWithBothWeapons.name',
    hint: 'VAGABOND.Settings.defenseWithBothWeapons.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: false,
  });

  // Light-source hand coupling: how lighting a hand-held light source (torch,
  // candle — handsRequired > 0) interacts with the 2-hand equipment limit.
  // Consumed by LightSource.use()/douse() in helpers/light-source.mjs.
  game.settings.register('vagabond', 'lightSourceHandMode', {
    name: 'VAGABOND.Settings.lightSourceHandMode.name',
    hint: 'VAGABOND.Settings.lightSourceHandMode.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      independent: 'VAGABOND.Settings.lightSourceHandMode.independent',
      autoEquip: 'VAGABOND.Settings.lightSourceHandMode.autoEquip',
      requireFreeHand: 'VAGABOND.Settings.lightSourceHandMode.requireFreeHand',
    },
    default: 'requireFreeHand',
    requiresReload: false,
  });

  // Class automation mode (auto / combat / manual) — gates every class "Auto" helper effect
  // at one choke point, see helpers/automation-mode.mjs.
  game.settings.register('vagabond', 'automationMode', {
    name: 'VAGABOND.Settings.automationMode.name',
    hint: 'VAGABOND.Settings.automationMode.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      auto: 'VAGABOND.Settings.automationMode.auto',
      combat: 'VAGABOND.Settings.automationMode.combat',
      manual: 'VAGABOND.Settings.automationMode.manual',
    },
    default: 'auto',
    requiresReload: false,
    // Re-prepare actors so the trigger fields / formulas pick the new mode up everywhere
    onChange: () => refreshClockDependents(),
  });

  /* -------------------------------------------- */
  /*  Magic                                       */
  /* -------------------------------------------- */

  // Trinket casting severity (off/warn/block); the rule itself is
  // trinketCastMode below. Gate lives in SpellHandler._trinketGateStatus.
  game.settings.register('vagabond', 'trinketCastRequirement', {
    name: 'VAGABOND.Settings.trinketCastRequirement.name',
    hint: 'VAGABOND.Settings.trinketCastRequirement.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      off: 'VAGABOND.Settings.trinketCastRequirement.off',
      warn: 'VAGABOND.Settings.trinketCastRequirement.warn',
      block: 'VAGABOND.Settings.trinketCastRequirement.block',
    },
    default: 'block',
    requiresReload: false,
  });

  // What casting requires (severity comes from the setting above):
  // openHands (RAW, default) = hands empty OR a trinket held;
  // equipped = any equipped trinket, even worn (amulet);
  // inHand = a trinket held, the other hand may hold anything;
  // handsFree = gesture casting, an equipped trinket and nothing else held.
  // Gish weapons (system.weaponAsTrinket) count as trinkets; the AE flag
  // system.castWithHandsFull falls back to 'equipped'.
  game.settings.register('vagabond', 'trinketCastMode', {
    name: 'VAGABOND.Settings.trinketCastMode.name',
    hint: 'VAGABOND.Settings.trinketCastMode.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      openHands: 'VAGABOND.Settings.trinketCastMode.openHands',
      equipped: 'VAGABOND.Settings.trinketCastMode.equipped',
      inHand: 'VAGABOND.Settings.trinketCastMode.inHand',
      handsFree: 'VAGABOND.Settings.trinketCastMode.handsFree',
    },
    default: 'openHands',
    requiresReload: false,
  });

  // Mana on a failed cast: whether a caster still pays (in full or half) when
  // the casting check fails. Imbue's weapon attack roll IS its cast check, so
  // a miss follows the same rule — see VagabondImbueHelper.resolveMissedCast.
  game.settings.register('vagabond', 'spellManaOnCastFail', {
    name: 'VAGABOND.Settings.spellManaOnCastFail.name',
    hint: 'VAGABOND.Settings.spellManaOnCastFail.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      successOnly: 'VAGABOND.Settings.spellManaOnCastFail.successOnly',
      fullOnFail: 'VAGABOND.Settings.spellManaOnCastFail.fullOnFail',
      halfOnFail: 'VAGABOND.Settings.spellManaOnCastFail.halfOnFail',
    },
    default: 'fullOnFail',
    requiresReload: false,
  });

  // Imbue delivery: pay Damage/Effect mana upfront at cast (legacy) vs deferred
  // to delivery-on-hit (RAW-correct default per GM ruling — see imbue-helper.mjs)
  game.settings.register('vagabond', 'imbueUpfrontMana', {
    name: 'VAGABOND.Settings.imbueUpfrontMana.name',
    hint: 'VAGABOND.Settings.imbueUpfrontMana.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  // ── Spell areas on the map (world) ─────────────────────────────────────────
  // Drawing style: true geometric shape vs covered grid spaces
  game.settings.register('vagabond', 'regionHighlightMode', {
    name: 'VAGABOND.Settings.regionHighlightMode.name',
    hint: 'VAGABOND.Settings.regionHighlightMode.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      'shapes': 'VAGABOND.Settings.regionHighlightMode.shapes',
      'coverage': 'VAGABOND.Settings.regionHighlightMode.coverage'
    },
    default: 'shapes',
    requiresReload: false,
  });

  // Paint seamless damage-type artwork over the area
  game.settings.register('vagabond', 'regionUseTextures', {
    name: 'VAGABOND.Settings.regionUseTextures.name',
    hint: 'VAGABOND.Settings.regionUseTextures.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: false,
  });

  // Outline treatment — GM table DEFAULT (players inherit unless they override).
  game.settings.register('vagabond', 'regionBorderMode', {
    name: 'VAGABOND.SpellSettings.DefaultBorder.name',
    hint: 'VAGABOND.SpellSettings.DefaultBorder.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      player: 'VAGABOND.SpellSettings.BorderMode.player',
      hide: 'VAGABOND.SpellSettings.BorderMode.hide',
      default: 'VAGABOND.SpellSettings.BorderMode.default'
    },
    default: 'hide',
    requiresReload: false,
    onChange: () => RegionTextureOverlay.applyPreferences(),
  });

  // Opacity — GM table DEFAULT (players inherit unless they opt out).
  game.settings.register('vagabond', 'regionTextureAlpha', {
    name: 'VAGABOND.SpellSettings.DefaultAlpha.name',
    hint: 'VAGABOND.SpellSettings.DefaultAlpha.hint',
    scope: 'world', config: false, type: Number, range: { min: 0, max: 1, step: 0.05 },
    default: 0.65, requiresReload: false,
    onChange: () => RegionTextureOverlay.applyPreferences(),
  });

  // ── Area artwork appearance (mirror CONFIG.VAGABOND.* runtime knobs) ──────
  game.settings.register('vagabond', 'regionTextureHideFill', {
    name: 'VAGABOND.SpellSettings.HideFill.name',
    hint: 'VAGABOND.SpellSettings.HideFill.hint',
    scope: 'world', config: false, type: Boolean, default: true, requiresReload: false,
    onChange: value => RegionTextureOverlay.setHideFill(value),
  });
  // Blend mode: kept in code (NORMAL default) but not shown in the hub.
  game.settings.register('vagabond', 'regionTextureBlendMode', {
    scope: 'world', config: false, type: String, default: 'NORMAL', requiresReload: false,
    onChange: value => RegionTextureOverlay.setBlendMode(value),
  });
  game.settings.register('vagabond', 'regionTextureAnimate', {
    name: 'VAGABOND.SpellSettings.Animate.name',
    hint: 'VAGABOND.SpellSettings.Animate.hint',
    scope: 'world', config: false, type: Boolean, default: true, requiresReload: false,
    onChange: value => RegionTextureOverlay.setAnimate(value),
  });
  game.settings.register('vagabond', 'regionTextureSpinSpeed', {
    name: 'VAGABOND.SpellSettings.SpinSpeed.name',
    hint: 'VAGABOND.SpellSettings.SpinSpeed.hint',
    scope: 'world', config: false, type: Number, default: 0.005, requiresReload: false,
    onChange: value => RegionTextureOverlay.setSpinSpeed(value),
  });
  game.settings.register('vagabond', 'regionTextureScrollSpeed', {
    name: 'VAGABOND.SpellSettings.ScrollSpeed.name',
    hint: 'VAGABOND.SpellSettings.ScrollSpeed.hint',
    scope: 'world', config: false, type: Number, default: 1.5, requiresReload: false,
    onChange: value => RegionTextureOverlay.setScrollSpeed(value),
  });

  // Force counter: when the GM bumps this (world setting), the onChange fires on every
  // connected client, which clears that client's personal overrides so they adopt the
  // GM table defaults. No custom socket needed — world settings broadcast to all clients.
  game.settings.register('vagabond', 'regionForcePush', {
    scope: 'world', config: false, type: Number, default: 0, requiresReload: false,
    onChange: () => {
      game.settings.set('vagabond', 'regionBorderModeUser', 'inherit');
      game.settings.set('vagabond', 'regionTextureAlphaUseGM', true);
      RegionTextureOverlay.applyPreferences();
      ui.notifications?.info(game.i18n.localize('VAGABOND.SpellSettings.ForceApplied'));
    },
  });

  // ── Spell cast dialog (per player) ─────────────────────────────────────────
  // When true, clicking a favorited spell opens the cast dialog (grid layout);
  // when false, clicking casts directly (list layout).
  game.settings.register('vagabond', 'useSpellCastDialog', {
    name: 'VAGABOND.Settings.useSpellCastDialog.name',
    hint: 'VAGABOND.Settings.useSpellCastDialog.hint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true,
    onChange: reRenderAllApps,
  });

  // Dark backdrop opacity (0–100%, increments of 5)
  game.settings.register('vagabond', 'spellCastDialogDarkness', {
    name: 'VAGABOND.Settings.spellCastDialogDarkness.name',
    hint: 'VAGABOND.Settings.spellCastDialogDarkness.hint',
    scope: 'client',
    config: false,
    type: Number,
    range: { min: 0, max: 100, step: 5 },
    default: 0,
    onChange: reRenderAllApps,
  });

  // Blur radius behind dialog (0 = no blur)
  game.settings.register('vagabond', 'spellCastDialogBlur', {
    name: 'VAGABOND.Settings.spellCastDialogBlur.name',
    hint: 'VAGABOND.Settings.spellCastDialogBlur.hint',
    scope: 'client',
    config: false,
    type: Number,
    range: { min: 0, max: 5, step: 0.5 },
    default: 1.0,
    onChange: reRenderAllApps,
  });

  // Hide outer rune rings + middle divider for a compact dialog
  game.settings.register('vagabond', 'hideCastRings', {
    name: 'VAGABOND.Settings.hideCastRings.name',
    hint: 'VAGABOND.Settings.hideCastRings.hint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
    onChange: reRenderAllApps,
  });

  // ── Spell areas (per player overrides of the table defaults) ──────────────
  // 'inherit' = use the GM table default (regionBorderMode).
  game.settings.register('vagabond', 'regionBorderModeUser', {
    name: 'VAGABOND.Settings.regionBorderMode.name',
    hint: 'VAGABOND.Settings.regionBorderMode.hint',
    scope: 'client',
    config: false,
    type: String,
    choices: {
      inherit: 'VAGABOND.SpellSettings.BorderMode.inherit',
      player: 'VAGABOND.SpellSettings.BorderMode.player',
      hide: 'VAGABOND.SpellSettings.BorderMode.hide',
      default: 'VAGABOND.SpellSettings.BorderMode.default'
    },
    default: 'inherit',
    requiresReload: false,
    onChange: () => RegionTextureOverlay.applyPreferences(),
  });
  // When true, use the GM table opacity (regionTextureAlpha); else regionTextureAlphaUser.
  game.settings.register('vagabond', 'regionTextureAlphaUseGM', {
    name: 'VAGABOND.Settings.regionTextureAlphaUseGM.name',
    hint: 'VAGABOND.Settings.regionTextureAlphaUseGM.hint',
    scope: 'client', config: false, type: Boolean, default: true, requiresReload: false,
    onChange: () => RegionTextureOverlay.applyPreferences(),
  });
  game.settings.register('vagabond', 'regionTextureAlphaUser', {
    name: 'VAGABOND.Settings.regionTextureAlpha.name',
    hint: 'VAGABOND.Settings.regionTextureAlpha.hint',
    scope: 'client', config: false, type: Number, range: { min: 0, max: 1, step: 0.05 },
    default: 0.65, requiresReload: false,
    onChange: () => RegionTextureOverlay.applyPreferences(),
  });

  /* -------------------------------------------- */
  /*  Combat & Encounters                         */
  /* -------------------------------------------- */

  game.settings.register('vagabond', 'hideInitiativeRoll', {
    name: 'VAGABOND.Settings.hideInitiativeRoll.name',
    hint: 'VAGABOND.Settings.hideInitiativeRoll.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: () => ui.combat?.render(),
  });

  game.settings.register('vagabond', 'initiativeFormula', {
    name: 'VAGABOND.Settings.initiativeFormula.name',
    hint: 'VAGABOND.Settings.initiativeFormula.hint',
    scope: 'world',
    config: false,
    type: String,
    default: '3d6 + @dexterity.value + @awareness.value',
    requiresReload: false
  });

  game.settings.register('vagabond', 'npcInitiativeFormula', {
    name: 'VAGABOND.Settings.npcInitiativeFormula.name',
    hint: 'VAGABOND.Settings.npcInitiativeFormula.hint',
    scope: 'world',
    config: false,
    type: String,
    default: '3d6 + ceil(@speed / 10)',
    requiresReload: false
  });

  game.settings.register('vagabond', 'useActivationPoints', {
    name: 'VAGABOND.Settings.useActivationPoints.name',
    hint: 'VAGABOND.Settings.useActivationPoints.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
    onChange: () => syncActivationPoints(),
  });

  game.settings.register('vagabond', 'defaultActivationPoints', {
    name: 'VAGABOND.Settings.defaultActivationPoints.name',
    hint: 'VAGABOND.Settings.defaultActivationPoints.hint',
    scope: 'world',
    config: false,
    type: Number,
    default: 2,
    requiresReload: false,
    onChange: () => syncActivationPoints(),
  });

  // Faction titles + colors (combat tracker groups and Carousel)
  const FACTIONS = [
    ['factionFriendly', 'Friendly', 'Heroes', '#7fbf7f'],
    ['factionNeutral', 'Neutral', 'Neutrals', '#dfdf7f'],
    ['factionHostile', 'Hostile', 'NPCs', '#df7f7f'],
    ['factionSecret', 'Secret', 'Secret', '#bf7fdf'],
  ];
  for (const [key, label, name, color] of FACTIONS) {
    game.settings.register('vagabond', key, {
      name: `VAGABOND.EncounterSettings.Factions.${label}`,
      scope: 'world', config: false, type: String, default: name, requiresReload: false,
      onChange: refreshCombatDisplays,
    });
    game.settings.register('vagabond', `${key}Color`, {
      name: `VAGABOND.EncounterSettings.Factions.${label}Color`,
      scope: 'world', config: false, type: String, default: color, requiresReload: false,
      onChange: refreshCombatDisplays,
    });
  }

  // Combat Carousel — master on/off switch (default ON)
  game.settings.register('vagabond', 'combatCarouselEnabled', {
    name: 'VAGABOND.EncounterSettings.Carousel.Enabled.Name',
    hint: 'VAGABOND.EncounterSettings.Carousel.Enabled.Hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: (enabled) => { if (!enabled) CombatCarousel.close(); },
  });

  game.settings.register('vagabond', 'combatCarouselPortraitSize', {
    name: 'VAGABOND.EncounterSettings.Carousel.PortraitSize.Name',
    hint: 'VAGABOND.EncounterSettings.Carousel.PortraitSize.Hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      small: 'VAGABOND.EncounterSettings.Carousel.PortraitSize.Small',
      medium: 'VAGABOND.EncounterSettings.Carousel.PortraitSize.Medium',
      large: 'VAGABOND.EncounterSettings.Carousel.PortraitSize.Large',
    },
    default: 'medium',
    requiresReload: false,
    onChange: () => CombatCarousel.refresh(),
  });

  // Left-click card behavior
  game.settings.register('vagabond', 'combatCarouselCardSelectBehavior', {
    name: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.Name',
    hint: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.Hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      none: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.None',
      pan: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.Pan',
      select: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.Select',
      selectPan: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.SelectPan',
      ping: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.Ping',
      activate: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.Activate',
      activateSelect: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.ActivateSelect',
      activatePan: 'VAGABOND.EncounterSettings.Carousel.CardSelectBehavior.ActivatePan',
    },
    default: 'none',
    requiresReload: false
  });

  // Reveal other factions' HP/Fatigue to players
  game.settings.register('vagabond', 'combatCarouselRevealOtherFactionStats', {
    name: 'VAGABOND.EncounterSettings.Carousel.RevealOtherFactionStats.Name',
    hint: 'VAGABOND.EncounterSettings.Carousel.RevealOtherFactionStats.Hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
    onChange: () => CombatCarousel.refresh(),
  });

  // Table defaults for the two per-player display prefs below. Read LIVE every
  // render (see CombatCarousel._resolveDisplayPref), not baked into a client
  // default at registration time — a plain Boolean client default is fixed the
  // moment this client's page loads, so a GM flipping the table default
  // mid-session would never visibly move any client already open.
  // World-setting changes are broadcast to every connected client by Foundry
  // core, so each onChange here also fires locally on every client — used to
  // reset that SAME feature's per-client override back to "inherit" so nobody
  // is left stuck on a stale explicit choice silently diverging from the new
  // table default. Auto-hide and dim stay fully independent.
  game.settings.register('vagabond', 'combatCarouselAutoHideDefault', {
    name: 'VAGABOND.EncounterSettings.Carousel.AutoHideDefault.Name',
    hint: 'VAGABOND.EncounterSettings.Carousel.AutoHideDefault.Hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
    onChange: () => {
      game.settings.set('vagabond', 'combatCarouselAutoHide', 'inherit');
      CombatCarousel.refresh();
    },
  });

  game.settings.register('vagabond', 'combatCarouselDimIdleDefault', {
    name: 'VAGABOND.EncounterSettings.Carousel.DimIdleDefault.Name',
    hint: 'VAGABOND.EncounterSettings.Carousel.DimIdleDefault.Hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
    onChange: () => {
      game.settings.set('vagabond', 'combatCarouselDimIdle', 'inherit');
      CombatCarousel.refresh();
    },
  });

  // Per-player auto-hide (tuck off the top of the screen, reveal on hover).
  // Tri-state: "inherit" (default) tracks the GM's table default live; "on"/
  // "off" are an explicit per-player override — reset back to "inherit"
  // whenever the GM changes the table default (see onChange above).
  game.settings.register('vagabond', 'combatCarouselAutoHide', {
    name: 'VAGABOND.EncounterSettings.Carousel.AutoHide.Name',
    hint: 'VAGABOND.EncounterSettings.Carousel.AutoHide.Hint',
    scope: 'client',
    config: false,
    type: String,
    choices: {
      inherit: 'VAGABOND.EncounterSettings.Carousel.Inherit',
      on: 'VAGABOND.EncounterSettings.Carousel.On',
      off: 'VAGABOND.EncounterSettings.Carousel.Off',
    },
    default: 'inherit',
    requiresReload: false,
    onChange: () => CombatCarousel.refresh(),
  });

  // Per-player dim-when-idle. Same tri-state/GM-default relationship as above.
  game.settings.register('vagabond', 'combatCarouselDimIdle', {
    name: 'VAGABOND.EncounterSettings.Carousel.DimIdle.Name',
    hint: 'VAGABOND.EncounterSettings.Carousel.DimIdle.Hint',
    scope: 'client',
    config: false,
    type: String,
    choices: {
      inherit: 'VAGABOND.EncounterSettings.Carousel.Inherit',
      on: 'VAGABOND.EncounterSettings.Carousel.On',
      off: 'VAGABOND.EncounterSettings.Carousel.Off',
    },
    default: 'inherit',
    requiresReload: false,
    onChange: () => CombatCarousel.refresh(),
  });

  // Last known Carousel open/closed state (hidden, per-player), so a refresh
  // restores it instead of always starting closed.
  game.settings.register('vagabond', 'combatCarouselUserOpen', {
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false
  });

  game.settings.register('vagabond', 'revealNpcRecharge', {
    name: 'VAGABOND.Settings.revealNpcRecharge.name',
    hint: 'VAGABOND.Settings.revealNpcRecharge.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  /* -------------------------------------------- */
  /*  Statuses & Tokens                           */
  /* -------------------------------------------- */

  game.settings.register('vagabond', 'statusEffectsMode', {
    name: 'VAGABOND.Settings.statusEffectsMode.name',
    hint: 'VAGABOND.Settings.statusEffectsMode.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      'vagabond': 'VAGABOND.Settings.statusEffectsMode.vagabond',
      'foundry': 'VAGABOND.Settings.statusEffectsMode.foundry'
    },
    default: 'vagabond',
    requiresReload: true
  });

  game.settings.register('vagabond', 'tokenStatusDisplay', {
    name: 'VAGABOND.Settings.tokenStatusDisplay.name',
    hint: 'VAGABOND.Settings.tokenStatusDisplay.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      'none': 'VAGABOND.Settings.tokenStatusDisplay.none',
      'tokens': 'VAGABOND.Settings.tokenStatusDisplay.tokens',
      'left': 'VAGABOND.Settings.tokenStatusDisplay.left',
      'right': 'VAGABOND.Settings.tokenStatusDisplay.right'
    },
    default: 'tokens',
    requiresReload: false,
    onChange: () => {
      applyTokenEffectVisibility();
      TokenStatusPanel.instance?.refresh();
    }
  });

  // Status-driven dynamic token ring effects (Focusing arcs, Burning flames, etc.).
  // When off, the rings still work but our custom shader/effects are never applied —
  // leaving tokens free for other animation modules. Requires reload (rebuilds ring config).
  game.settings.register('vagabond', 'statusRingEffects', {
    name: 'VAGABOND.Settings.statusRingEffects.name',
    hint: 'VAGABOND.Settings.statusRingEffects.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: true,
  });

  /* -------------------------------------------- */
  /*  Visual FX                                   */
  /* -------------------------------------------- */

  // World-level master switch for spell FX (GM)
  game.settings.register('vagabond', 'useAnimations', {
    name: 'VAGABOND.Settings.useAnimations.name',
    hint: 'VAGABOND.Settings.useAnimations.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  // World-level master switch for weapon/alchemical/relic FX
  game.settings.register('vagabond', 'useItemAnimations', {
    name: 'VAGABOND.Settings.useItemAnimations.name',
    hint: 'VAGABOND.Settings.useItemAnimations.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
  });

  // Per-device toggle for spell AND item FX
  game.settings.register('vagabond', 'useSequencerFX', {
    name: 'VAGABOND.Settings.useSequencerFX.name',
    hint: 'VAGABOND.Settings.useSequencerFX.hint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: false,
  });

  // Sequencer FX animation config (hidden data store, edited by SequencerFxConfig)
  game.settings.register('vagabond', 'sequencerFxConfig', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    requiresReload: false,
    onChange: () => { VagabondSpellSequencer.warmConfigFiles(); VagabondFXResolver.resolveAllConfigured(); },
  });

  // Resolved wildcard FX file cache (hidden) — GM pre-expands wildcard
  // file paths so player clients never need FILES_BROWSE permission.
  game.settings.register('vagabond', 'fxResolvedCache', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    requiresReload: false,
  });

  // DSN Damage Appearance config (hidden data store, edited by DsnDamageAppearanceConfig)
  game.settings.register('vagabond', 'dsnDamageAppearance', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    requiresReload: false,
  });

  /* -------------------------------------------- */
  /*  Interface (all per player)                  */
  /* -------------------------------------------- */

  // Opt this user out of the Character HUD entirely (never touches other players' HUDs).
  game.settings.register('vagabond', 'hudDisabled', {
    name: 'VAGABOND.Settings.hudDisplayConfig.disabled',
    hint: 'VAGABOND.Settings.hudDisplayConfig.disabledHint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
    onChange: () => VagabondCharacterHud.onDisabledSettingChange(),
  });

  // Auto-open the Character HUD when a token is selected. Also toggled by the
  // "Auto-open HUD" scene control (Vagabond group), which just sets this value.
  game.settings.register('vagabond', 'hudAutoOpenOnSelect', {
    name: 'VAGABOND.SettingsHub.Rows.hudAutoOpenOnSelect.name',
    hint: 'VAGABOND.SettingsHub.Rows.hudAutoOpenOnSelect.hint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true,
    onChange: () => {
      VagabondCharacterHud.syncToSelection(); // ON: open current selection; OFF: close
      ui.controls?.render();                  // swap the scene control's solid/regular icon
    },
  });

  // Keep the Character HUD permanently on screen for the user's assigned main
  // character (User Configuration → "Selected Character"). No-op when the user
  // has no main character set. The pinned HUD ignores token selection.
  game.settings.register('vagabond', 'hudAlwaysOnForMainChar', {
    name: 'VAGABOND.Settings.hudDisplayConfig.alwaysOn',
    hint: 'VAGABOND.Settings.hudDisplayConfig.alwaysOnHint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: false,
    requiresReload: false,
    onChange: () => VagabondCharacterHud.syncAlwaysOn(),
  });

  // Idle fade: dim the Character HUD after the mouse leaves it for `delay`
  // seconds, restoring full opacity on re-entry.
  game.settings.register('vagabond', 'hudIdleFadePrefs', {
    scope: 'client',
    config: false,
    type: Object,
    default: { enabled: false, delay: 10, opacity: 0.2 },
    requiresReload: false,
    onChange: () => VagabondCharacterHud.refreshIdleFade(),
  });

  // HUD look — per-user accessibility prefs (dark bg / blur / font scale).
  game.settings.register('vagabond', 'hudDisplayPrefs', {
    scope: 'client',
    config: false,
    type: Object,
    default: { darkBg: true, blur: true, fontScale: 1 },
    requiresReload: false,
    onChange: () => {
      VagabondCharacterHud.refreshDisplayPrefs?.();
      VagabondNPCHud.refreshDisplayPrefs?.();
    },
  });

  game.settings.register('vagabond', 'chatCardIconStyle', {
    name: 'VAGABOND.Settings.chatCardIconStyle.name',
    hint: 'VAGABOND.Settings.chatCardIconStyle.hint',
    scope: 'client',
    config: false,
    type: String,
    choices: {
      'item': 'VAGABOND.Settings.chatCardIconStyle.item',
      'smart': 'VAGABOND.Settings.chatCardIconStyle.smart'
    },
    default: 'item',
    requiresReload: false
  });

  game.settings.register('vagabond', 'defaultClockPosition', {
    name: 'VAGABOND.Settings.defaultClockPosition.name',
    hint: 'VAGABOND.Settings.defaultClockPosition.hint',
    scope: 'client',
    config: false,
    type: String,
    choices: {
      'top-right': 'VAGABOND.ProgressClock.Position.TopRight',
      'top-left': 'VAGABOND.ProgressClock.Position.TopLeft',
      'bottom-right': 'VAGABOND.ProgressClock.Position.BottomRight',
      'bottom-left': 'VAGABOND.ProgressClock.Position.BottomLeft'
    },
    default: 'top-right',
  });

  /* -------------------------------------------- */
  /*  Economy                                     */
  /* -------------------------------------------- */

  // Shops: enables the `shop` actor type and shop transactions (docs/shop-plan.md).
  game.settings.register('vagabond', 'shopsEnabled', {
    name: 'VAGABOND.Settings.shopsEnabled.name',
    hint: 'VAGABOND.Settings.shopsEnabled.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: true,
    requiresReload: false,
    onChange: () => ui.controls?.render(), // show/hide the GM Shops scene tool
  });

  // Shop transaction receipts in chat: everyone, GMs + the trader's owners, or none.
  game.settings.register('vagabond', 'shopChatMode', {
    name: 'VAGABOND.Settings.shopChatMode.name',
    hint: 'VAGABOND.Settings.shopChatMode.hint',
    scope: 'world',
    config: false,
    type: String,
    choices: {
      public: 'VAGABOND.Settings.shopChatMode.public',
      private: 'VAGABOND.Settings.shopChatMode.private',
      off: 'VAGABOND.Settings.shopChatMode.off',
    },
    default: 'public',
    requiresReload: false,
  });

  // Store window layout per user: card grid or compact list (toggled in the store toolbar)
  game.settings.register('vagabond', 'shopView', {
    scope: 'client',
    config: false,
    type: String,
    choices: { grid: 'grid', list: 'list' },
    default: 'grid',
  });

  // Store sidebar: tabs whose categories the user collapsed ({ tabKey: true }; default all expanded)
  game.settings.register('vagabond', 'shopCollapsedCategories', {
    scope: 'client',
    config: false,
    type: Object,
    default: {},
  });

  // Crafting Config (hidden data store) — see docs/crafting-plan.md §4.1.
  // Reads always go through CraftingHelper.config(), never game.settings.get directly.
  game.settings.register('vagabond', 'craftingConfig', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    requiresReload: false,
  });

  /* -------------------------------------------- */
  /*  Content & Homebrew                          */
  /* -------------------------------------------- */

  // Homebrew Config (hidden data store, edited by HomebrewSettingsApp)
  game.settings.register('vagabond', 'homebrewConfig', {
    scope: 'world',
    config: false,
    type: Object,
    default: {},
    requiresReload: false,
  });

  // ID of the currently active library entry (empty string = none / custom)
  // The library itself lives in assets/vagabond/homebrew/ (shared across worlds)
  game.settings.register('vagabond', 'activeHomebrewId', {
    scope: 'world',
    config: false,
    type: String,
    default: '',
    requiresReload: false,
  });

  // Character Builder compendium selection (edited by CompendiumSettings)
  game.settings.register('vagabond', 'characterBuilderCompendiums', {
    name: 'VAGABOND.Settings.compendiumSettings.name',
    scope: 'world',
    config: false,
    type: Object,
    default: {
      useAll: true,
      enabled: []
    },
    requiresReload: false
  });

  /* -------------------------------------------- */
  /*  One-time migration guards (hidden)          */
  /* -------------------------------------------- */

  // LightSource.migrateRunAsGM(): older compendium light sources shipped with
  // macro.runAsGM:true, which relayed the Ignite flow to the GM client.
  // EquipmentHelper.migrateWeaponPropertyEffects(): Keen/Vicious → On Use Only effects.
  // CurrencyHelper.migrateCopperScale(): stored raw copper ×10 after the 1s=100c fix.
  // Class / ancestry guards: class-migrations.mjs, alpha3-migrations.mjs and the
  // per-class helpers (RageHelper, AlchemyHelper, BardHelper, DancerHelper).
  const MIGRATION_GUARDS = [
    'lightSourceRunAsGMFixed', 'weaponPropertyEffectsMigrated', 'copperScaleMigrated',
    'barbarianClassMigrated', 'alchemistClassMigrated', 'bardClassMigrated', 'dancerClassMigrated',
    'fighterClassMigrated', 'druidClassMigrated', 'gunslingerClassMigrated', 'hunterClassMigrated',
    'luminaryClassMigrated', 'magusClassMigrated', 'merchantClassMigrated', 'pugilistClassMigrated',
    'revelatorClassMigrated', 'rogueClassMigrated', 'sorcererClassMigrated', 'vanguardClassMigrated',
    'witchClassMigrated', 'wizardClassMigrated', 'wizardSculptSpellMigrated', 'ancestriesMigrated',
    'alpha3StatusesMigrated', 'alpha3BackpackMigrated', 'alpha3RationsMigrated', 'alpha3DefensePerksMigrated',
    'alpha3ClassPerksMigrated', 'alpha3PerksMigrated', 'alpha3ClassesMigrated', 'alpha3AncestriesMigrated',
    'classFeatureScaleKeysMigrated',
  ];
  for (const key of MIGRATION_GUARDS) {
    game.settings.register('vagabond', key, {
      scope: 'world',
      config: false,
      type: Boolean,
      default: false,
      requiresReload: false,
    });
  }
}
