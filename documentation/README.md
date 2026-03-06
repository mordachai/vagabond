# Vagabond — AI-Assisted Item Creation Documentation

This folder contains guides for using AI assistants (ChatGPT, Claude, etc.) to generate valid Foundry VTT JSON for all Vagabond item types.

Each guide includes:
- How to prompt an AI to create the item
- A complete JSON template with every field
- Field reference table explaining each property
- Valid enum values for all dropdown/choice fields
- Multiple annotated quick examples
- A copy-paste AI prompt template

---

## Guides by Item Type

| File | Item Type | Summary |
|------|-----------|---------|
| [items-weapon.md](items-weapon.md) | Weapon | Swords, bows, daggers, axes — melee/ranged/brawl/finesse |
| [items-armor.md](items-armor.md) | Armor | Light/medium/heavy protection, metal types, immunities |
| [items-gear.md](items-gear.md) | Gear | Adventuring tools, rations, containers, trade goods |
| [items-alchemical.md](items-alchemical.md) | Alchemical | Potions, poisons, explosives, oils, acids, torches |
| [items-relic.md](items-relic.md) | Relic | Magical artifacts, bound items, unique treasures |
| [items-spell.md](items-spell.md) | Spell | All spells — damage, healing, utility, sustained |
| [items-perk.md](items-perk.md) | Perk | Character upgrades with prerequisites and choices |
| [items-ancestry.md](items-ancestry.md) | Ancestry | Species/folk with traits, stat grants, skill pools |
| [items-class.md](items-class.md) | Class | Full class definitions with level features 1–10 |

---

## Quick Start

1. Open the relevant guide for your item type
2. Copy the **AI Prompt Template** from the bottom of the guide
3. Fill in your item's details
4. Paste into your AI chat
5. Import the resulting JSON into Foundry via **Item Directory → Import**

---

## General Notes

### Foundry Import
- `File → Import Data` or right-click in the Item Directory
- Paste JSON directly or load from a `.json` file
- After import, open the sheet to verify and add Active Effects

### Active Effects
Many items (relics, perks, ancestry traits, class features) derive their mechanical power from **Active Effects**. These are NOT stored in the item JSON — add them manually through the item's **Effects** tab in Foundry after importing:
- `system.stats.might.bonus` ADD `1` → +1 Might
- `system.armor` ADD `1` → +1 Armor Rating
- `system.skills.detect.trained` OVERRIDE `true` → Trained in Detect
- `system.bonuses.hpPerLevel` ADD `2` → +2 HP per level
- `system.critNumber` OVERRIDE `19` → Crits on 19–20

### Homebrew Compatibility
If your world uses Homebrew settings (custom stats, skills, or saves), replace default stat/skill key references in the JSON with your homebrew keys.

---

## Enum Reference (Quick Lookup)

### Damage Types
`-` (none), `acid`, `fire`, `shock`, `poison`, `cold`, `blunt`, `piercing`, `slashing`, `physical`, `necrotic`, `psychic`, `magical`, `healing`, `recover`, `recharge`

### Stats
`might`, `dexterity`, `awareness`, `reason`, `presence`, `luck`

### Skills
`arcana`, `craft`, `medicine`, `brawl`, `finesse`, `melee`, `ranged`, `sneak`, `detect`, `mysticism`, `survival`, `influence`, `leadership`, `performance`

### Saves
`reflex`, `endure`, `will`

### Weapon Skill (attacks)
Any skill key or save key above, plus `melee`, `brawl`, `finesse`, `ranged` most commonly.

### Range
`close`, `near`, `far`

### Grip
`1H`, `2H`, `F` (fist), `V` (versatile)

### Metal
`none`, `common`, `adamant`, `coldIron`, `silver`, `mythral`, `orichalcum`

### Weapon Properties
`Brawl`, `Brutal`, `Cleave`, `Entangle`, `Finesse`, `Keen`, `Long`, `Near`, `Ranged`, `Shield`, `Thrown`

### Armor Types
`light` (Rating 1, Might 3), `medium` (Rating 2, Might 4), `heavy` (Rating 3, Might 5)

### Alchemical Types
`acid`, `concoction`, `explosive`, `oil`, `poison`, `potion`, `torch`

### Being Types (for Ancestry)
`Humanlike`, `Fae`, `Cryptid`, `Artificials`, `Beasts`, `Outers`, `Primordials`, `Undead`

### Sizes
`small`, `medium`, `large`, `huge`, `giant`, `colossal`

### Spell Delivery Types (configured in sheet, not JSON)
`touch`, `remote`, `imbue`, `aura`, `sphere`, `cone`, `line`, `cube`, `glyph`
