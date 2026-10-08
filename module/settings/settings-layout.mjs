/**
 * Settings Hub layout — which setting shows up in which subject and section.
 * Pure data: storage lives in `register-settings.mjs`, rendering in
 * `applications/settings-hub.mjs`. Adding a setting to the UI = one row here.
 *
 * Subject: { id, icon, group, sections[] } — name/hint/desc come from
 *   `VAGABOND.SettingsHub.Subjects.<id>.name|hint|desc`. A subject with no
 *   `client` section is GM-only (its Foundry menu button is restricted).
 * Section: { id, scope: 'world'|'client', note?, rows[] } — title from
 *   `VAGABOND.SettingsHub.Sections.<id>`; note is an i18n key.
 *
 * Row kinds (default kind = 'setting'):
 *   { key }                       A registered setting. Widget, label and hint are
 *                                 inferred from the registration (Boolean → checkbox,
 *                                 choices → select, range → slider, Number → number,
 *                                 String → text). Overrides: label, hint, widget,
 *                                 min, max, step, format ('pct'|'percent'|'px'|'x'|'s'),
 *                                 mono (formula text field).
 *   { key, path }                 One field of an Object setting (e.g. hudDisplayPrefs.fontScale).
 *   dep / depNot / depInvert      Row is disabled unless `dep` (key or key.path) is truthy
 *                                 (or !== depNot, or falsy with depInvert).
 *   { kind: 'override', key, of, flag? }
 *                                 Per-player override of a world default `of`. Without
 *                                 `flag`, `key` holds 'inherit' while following the table;
 *                                 with `flag`, that Boolean setting means "follow the table"
 *                                 and `key` holds the player's own value.
 *   { kind: 'launcher', app, icon, label, hint }
 *                                 Button opening one of the big standalone config windows
 *                                 (see SettingsHub LAUNCHERS).
 *   { kind: 'action', action, icon, label, hint, button }
 *   { kind: 'factions' }          Faction name + color pairs.
 */
export const SETTINGS_SUBJECTS = [
  {
    id: 'rules', icon: 'fa-scale-balanced', group: 'game',
    sections: [
      { id: 'rolls', scope: 'world', rows: [
        { key: 'rollDamageWithCheck' },
        { key: 'alwaysRollDamage', dep: 'rollDamageWithCheck' },
        { key: 'npcUseFlatDamage' },
        { key: 'autoApplySaveDamage' },
      ]},
      { id: 'defense', scope: 'world', rows: [
        { key: 'defenseWithBothWeapons' },
      ]},
      { id: 'equipment', scope: 'world', rows: [
        { key: 'lightSourceHandMode' },
      ]},
      { id: 'automation', scope: 'world', rows: [
        { key: 'automationMode' },
      ]},
    ],
  },
  {
    id: 'magic', icon: 'fa-wand-magic-sparkles', group: 'game',
    sections: [
      { id: 'casting', scope: 'world', rows: [
        { key: 'trinketCastRequirement' },
        { key: 'trinketCastMode', dep: 'trinketCastRequirement', depNot: 'off' },
        { key: 'spellManaOnCastFail' },
        { key: 'imbueUpfrontMana' },
      ]},
      { id: 'areas', scope: 'world', note: 'VAGABOND.SettingsHub.Notes.areas', rows: [
        { key: 'regionHighlightMode' },
        { key: 'regionBorderMode' },
        { key: 'regionUseTextures' },
        { key: 'regionTextureAlpha', format: 'pct', dep: 'regionUseTextures' },
        { kind: 'action', action: 'forcePush', icon: 'fa-users-gear',
          label: 'VAGABOND.SpellSettings.ForceTitle', hint: 'VAGABOND.SpellSettings.ForceHint', button: 'VAGABOND.SpellSettings.ForceButton' },
      ]},
      { id: 'artwork', scope: 'world', rows: [
        { key: 'regionTextureHideFill', dep: 'regionUseTextures' },
        { key: 'regionTextureAnimate', dep: 'regionUseTextures' },
        { key: 'regionTextureSpinSpeed', widget: 'range', min: 0, max: 0.05, step: 0.001, dep: 'regionTextureAnimate' },
        { key: 'regionTextureScrollSpeed', widget: 'range', min: -5, max: 5, step: 0.5, dep: 'regionTextureAnimate' },
      ]},
      { id: 'castDialog', scope: 'client', rows: [
        { key: 'useSpellCastDialog' },
        { key: 'hideCastRings', dep: 'useSpellCastDialog' },
        { key: 'spellCastDialogDarkness', format: 'percent', dep: 'useSpellCastDialog' },
        { key: 'spellCastDialogBlur', format: 'px', dep: 'useSpellCastDialog' },
      ]},
      { id: 'areaDisplay', scope: 'client', rows: [
        { kind: 'override', key: 'regionBorderModeUser', of: 'regionBorderMode' },
        { kind: 'override', key: 'regionTextureAlphaUser', of: 'regionTextureAlpha', flag: 'regionTextureAlphaUseGM', format: 'pct' },
      ]},
    ],
  },
  {
    id: 'combat', icon: 'fa-shield-halved', group: 'game',
    sections: [
      { id: 'initiative', scope: 'world', rows: [
        { key: 'hideInitiativeRoll' },
        { key: 'initiativeFormula', mono: true },
        { key: 'npcInitiativeFormula', mono: true },
        { key: 'useActivationPoints' },
        { key: 'defaultActivationPoints', min: 1, max: 10, step: 1, dep: 'useActivationPoints' },
      ]},
      { id: 'factions', scope: 'world', rows: [
        { kind: 'factions' },
      ]},
      { id: 'carousel', scope: 'world', rows: [
        { key: 'combatCarouselEnabled' },
        { key: 'combatCarouselCardSelectBehavior', dep: 'combatCarouselEnabled' },
        { key: 'combatCarouselPortraitSize', dep: 'combatCarouselEnabled' },
        { key: 'combatCarouselRevealOtherFactionStats', dep: 'combatCarouselEnabled' },
        { key: 'combatCarouselAutoHideDefault', dep: 'combatCarouselEnabled' },
        { key: 'combatCarouselDimIdleDefault', dep: 'combatCarouselEnabled' },
      ]},
      { id: 'carouselMine', scope: 'client', rows: [
        { kind: 'override', key: 'combatCarouselAutoHide', of: 'combatCarouselAutoHideDefault' },
        { kind: 'override', key: 'combatCarouselDimIdle', of: 'combatCarouselDimIdleDefault' },
      ]},
      { id: 'npcs', scope: 'world', rows: [
        { key: 'revealNpcRecharge' },
      ]},
    ],
  },
  {
    id: 'statuses', icon: 'fa-bolt', group: 'game',
    sections: [
      { id: 'conditions', scope: 'world', rows: [
        { key: 'statusEffectsMode' },
      ]},
      { id: 'statusDisplay', scope: 'world', rows: [
        { key: 'tokenStatusDisplay' },
        { key: 'statusRingEffects' },
      ]},
    ],
  },
  {
    id: 'fx', icon: 'fa-film', group: 'presentation',
    sections: [
      { id: 'fxWorld', scope: 'world', rows: [
        { key: 'useAnimations' },
        { key: 'useItemAnimations' },
        { kind: 'launcher', app: 'sequencerFx', icon: 'fa-folder-open',
          label: 'VAGABOND.Settings.sequencerFxConfig.name', hint: 'VAGABOND.Settings.sequencerFxConfig.hint' },
        { kind: 'launcher', app: 'dsnDamage', icon: 'fa-dice-d20',
          label: 'VAGABOND.Settings.dsnDamageAppearance.name', hint: 'VAGABOND.Settings.dsnDamageAppearance.hint' },
      ]},
      { id: 'fxMine', scope: 'client', rows: [
        { key: 'useSequencerFX' },
      ]},
    ],
  },
  {
    id: 'interface', icon: 'fa-display', group: 'presentation',
    sections: [
      { id: 'hud', scope: 'client', rows: [
        { key: 'hudDisabled' },
        { key: 'hudAutoOpenOnSelect', dep: 'hudDisabled', depInvert: true },
        { key: 'hudAlwaysOnForMainChar', dep: 'hudDisabled', depInvert: true },
        { key: 'hudIdleFadePrefs', path: 'enabled', widget: 'checkbox',
          label: 'VAGABOND.Settings.hudDisplayConfig.idleFade', hint: 'VAGABOND.Settings.hudDisplayConfig.idleFadeHint',
          dep: 'hudDisabled', depInvert: true },
        { key: 'hudIdleFadePrefs', path: 'delay', widget: 'range', min: 2, max: 60, step: 1, format: 's',
          label: 'VAGABOND.Settings.hudDisplayConfig.idleDelay', dep: 'hudIdleFadePrefs.enabled' },
        { key: 'hudIdleFadePrefs', path: 'opacity', widget: 'range', min: 0.05, max: 0.9, step: 0.05, format: 'pct',
          label: 'VAGABOND.Settings.hudDisplayConfig.idleOpacity', dep: 'hudIdleFadePrefs.enabled' },
      ]},
      { id: 'hudLook', scope: 'client', rows: [
        { key: 'hudDisplayPrefs', path: 'darkBg', widget: 'checkbox',
          label: 'VAGABOND.Settings.hudDisplayConfig.darkBg', hint: 'VAGABOND.Settings.hudDisplayConfig.darkBgHint' },
        { key: 'hudDisplayPrefs', path: 'blur', widget: 'checkbox',
          label: 'VAGABOND.Settings.hudDisplayConfig.blur', hint: 'VAGABOND.Settings.hudDisplayConfig.blurHint' },
        { key: 'hudDisplayPrefs', path: 'fontScale', widget: 'range', min: 0.8, max: 1.6, step: 0.1, format: 'pct',
          label: 'VAGABOND.Settings.hudDisplayConfig.fontScale', hint: 'VAGABOND.Settings.hudDisplayConfig.fontScaleHint' },
      ]},
      { id: 'chatClocks', scope: 'client', rows: [
        { key: 'chatCardIconStyle' },
        { key: 'defaultClockPosition' },
      ]},
    ],
  },
  {
    id: 'economy', icon: 'fa-coins', group: 'world',
    sections: [
      { id: 'shops', scope: 'world', rows: [
        { key: 'shopsEnabled' },
        { key: 'shopChatMode', dep: 'shopsEnabled' },
      ]},
      { id: 'crafting', scope: 'world', rows: [
        { kind: 'launcher', app: 'crafting', icon: 'fa-hammer',
          label: 'VAGABOND.Settings.craftingSettings.name', hint: 'VAGABOND.Settings.craftingSettings.hint' },
      ]},
    ],
  },
  {
    id: 'content', icon: 'fa-book', group: 'world',
    sections: [
      { id: 'homebrew', scope: 'world', rows: [
        { kind: 'launcher', app: 'homebrew', icon: 'fa-flask',
          label: 'VAGABOND.Settings.homebrewSettings.name', hint: 'VAGABOND.Settings.homebrewSettings.hint' },
      ]},
      { id: 'builder', scope: 'world', rows: [
        { kind: 'launcher', app: 'compendiums', icon: 'fa-book-open',
          label: 'VAGABOND.Settings.compendiumSettings.name', hint: 'VAGABOND.Settings.compendiumSettings.hint' },
      ]},
    ],
  },
];

/** Nav groups, in order. Label: `VAGABOND.SettingsHub.Groups.<id>`. */
export const SETTINGS_GROUPS = ['game', 'presentation', 'world'];
