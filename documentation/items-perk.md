# Vagabond — AI Item Creation Guide: Perks

Use this document to prompt an AI assistant to generate perk items for the Vagabond Foundry VTT system. Perks are character upgrades gained through level-up or class grants — passive traits, active abilities, and special training.

---

## How to Use

Tell the AI:

> "Create a Vagabond perk named [NAME]. It requires [prerequisites]. Its effect is [description]. It provides [Active Effect details if any]."

---

## Perk Anatomy

A perk has:
1. **Description** — what it does (flavor + rules)
2. **Prerequisites** — conditions the character must meet to take the perk
3. **Choice Config** — optional; if the perk requires a player to pick something (a skill, stat, spell)
4. **Active Effects** — the mechanical bonus (added in Foundry's sheet after import)

---

## Valid Values

### Stat Keys
`might`, `dexterity`, `awareness`, `reason`, `presence`, `luck`

### Skill Keys
`arcana`, `craft`, `medicine`, `brawl`, `finesse`, `melee`, `ranged`, `sneak`, `detect`, `mysticism`, `survival`, `influence`, `leadership`, `performance`

### Save Keys (also valid as prerequisite skills)
`reflex`, `endure`, `will`

### Resource Types (for resource prerequisites)
`maxMana`, `manaPerCast`, `wealth`, `inventorySlots`, `speed`, `maxHP`, `currentLuck`

### Choice Types (for choice-based perks)
`skill`, `weaponSkill`, `stat`, `spell`

---

## Prerequisites Reference

Prerequisites restrict who can take the perk. Types:

| Field | What it checks |
|-------|----------------|
| `stats[]` | Each: `{ stat: "might", value: 5 }` — character must have stat ≥ value |
| `statOrGroups[]` | Each: `{ stats: [...], value: N }` — must meet ANY ONE stat in the group |
| `trainedSkills[]` | Array of skill keys — must be trained in ALL listed skills |
| `trainedSkillOrGroups[]` | Each: `{ skills: [...] }` — must be trained in AT LEAST ONE skill in each group |
| `spells[]` | Array of spell names — must know all listed spells |
| `spellOrGroups[]` | Each: `{ spells: [...] }` — must know at least one spell in each group |
| `hasAnySpell` | `true` — character must know at least one spell |
| `resources[]` | Each: `{ resource: "maxMana", value: 50 }` — derived resource must meet minimum |
| `resourceOrGroups[]` | Each: `{ resources: [...] }` — must meet at least one resource in group |

---

## Complete JSON Model

```json
{
  "name": "Iron Discipline",
  "type": "perk",
  "img": "icons/skills/melee/shield-block-steel-blue.webp",
  "system": {
    "description": "<p>Years of training have hardened your body against fatigue and pain.</p><p><strong>Effect:</strong> Your maximum Fatigue increases by 1. (Active Effect: +1 to max fatigue)</p>",
    "prerequisites": {
      "stats": [
        { "stat": "might", "value": 4 }
      ],
      "statOrGroups": [],
      "trainedSkills": [],
      "trainedSkillOrGroups": [],
      "spells": [],
      "spellOrGroups": [],
      "hasAnySpell": false,
      "resources": [],
      "resourceOrGroups": []
    },
    "choiceConfig": {
      "type": "",
      "selected": "",
      "targetField": "",
      "effectMode": 2,
      "effectValue": ""
    }
  }
}
```

---

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Perk name |
| `img` | string | Icon path |
| `description` | HTML string | Flavor text and rules |
| `prerequisites.stats` | array | Required stat minimums (all must be met) |
| `prerequisites.statOrGroups` | array | OR groups of stat requirements |
| `prerequisites.trainedSkills` | string[] | Skills that must be trained (all) |
| `prerequisites.trainedSkillOrGroups` | array | OR groups of skill training |
| `prerequisites.spells` | string[] | Spell names the character must know |
| `prerequisites.spellOrGroups` | array | OR groups of spell requirements |
| `prerequisites.hasAnySpell` | boolean | Must know at least one spell |
| `prerequisites.resources` | array | Derived resource minimums |
| `prerequisites.resourceOrGroups` | array | OR groups of resource requirements |
| `choiceConfig.type` | string | Choice type: `"skill"`, `"weaponSkill"`, `"stat"`, `"spell"`, or `""` for no choice |
| `choiceConfig.selected` | string | Stores the player's chosen option (blank = not yet chosen) |
| `choiceConfig.targetField` | string | Active Effect key template: `"system.skills.{choice}.trained"` |
| `choiceConfig.effectMode` | integer | Active Effect mode: `2` = OVERRIDE, `0` = CUSTOM, `1` = MULTIPLY, `4` = ADD |
| `choiceConfig.effectValue` | string | Value set by the Active Effect: `"true"`, `"1"`, etc. |

---

## Choice-Based Perks

Some perks let the player choose a skill, stat, or spell. When added to a character, a dialog appears. The choice is stored in `choiceConfig.selected` and an Active Effect is created automatically.

### Example: New Training (choose any skill)
```json
{
  "name": "New Training",
  "type": "perk",
  "img": "icons/skills/trades/academics-study-reading-yellow.webp",
  "system": {
    "description": "<p>You have dedicated yourself to mastering a new discipline.</p><p><strong>Effect:</strong> You become trained in a skill of your choice.</p>",
    "prerequisites": {
      "stats": [],
      "statOrGroups": [],
      "trainedSkills": [],
      "trainedSkillOrGroups": [],
      "spells": [],
      "spellOrGroups": [],
      "hasAnySpell": false,
      "resources": [],
      "resourceOrGroups": []
    },
    "choiceConfig": {
      "type": "skill",
      "selected": "",
      "targetField": "system.skills.{choice}.trained",
      "effectMode": 2,
      "effectValue": "true"
    }
  }
}
```

### Example: Advancement (choose a stat to increase)
```json
{
  "name": "Advancement",
  "type": "perk",
  "img": "icons/magic/control/buff-flight-wings-blue.webp",
  "system": {
    "description": "<p>Through dedication and experience, you have grown stronger in body or mind.</p><p><strong>Effect:</strong> Increase one stat of your choice by +1.</p>",
    "prerequisites": {
      "stats": [],
      "statOrGroups": [],
      "trainedSkills": [],
      "trainedSkillOrGroups": [],
      "spells": [],
      "spellOrGroups": [],
      "hasAnySpell": false,
      "resources": [],
      "resourceOrGroups": []
    },
    "choiceConfig": {
      "type": "stat",
      "selected": "",
      "targetField": "system.stats.{choice}.bonus",
      "effectMode": 4,
      "effectValue": "1"
    }
  }
}
```

---

## Quick Examples

### Arcane Initiate (requires any spell + trained Arcana)
```json
{
  "name": "Arcane Initiate",
  "type": "perk",
  "img": "icons/magic/symbols/rune-triangle-pentagon-blue.webp",
  "system": {
    "description": "<p>Your formal study of the arcane arts has expanded your magical capacity.</p><p><strong>Effect:</strong> +10 Max Mana. (Add as Active Effect after import.)</p>",
    "prerequisites": {
      "stats": [],
      "statOrGroups": [],
      "trainedSkills": ["arcana"],
      "trainedSkillOrGroups": [],
      "spells": [],
      "spellOrGroups": [],
      "hasAnySpell": true,
      "resources": [],
      "resourceOrGroups": []
    },
    "choiceConfig": {
      "type": "",
      "selected": "",
      "targetField": "",
      "effectMode": 2,
      "effectValue": ""
    }
  }
}
```

### Combat Expert (requires Might 5 OR Dexterity 5, trained Melee)
```json
{
  "name": "Combat Expert",
  "type": "perk",
  "img": "icons/skills/melee/sword-shield-stylized-yellow.webp",
  "system": {
    "description": "<p>Your battlefield experience gives you an edge against dangerous foes.</p><p><strong>Effect:</strong> You may reroll 1s on weapon damage dice once per roll.</p>",
    "prerequisites": {
      "stats": [],
      "statOrGroups": [
        { "stats": [{ "stat": "might", "value": 5 }, { "stat": "dexterity", "value": 5 }] }
      ],
      "trainedSkills": ["melee"],
      "trainedSkillOrGroups": [],
      "spells": [],
      "spellOrGroups": [],
      "hasAnySpell": false,
      "resources": [],
      "resourceOrGroups": []
    },
    "choiceConfig": {
      "type": "",
      "selected": "",
      "targetField": "",
      "effectMode": 2,
      "effectValue": ""
    }
  }
}
```

---

## AI Prompt Template

```
You are creating a perk item for the Vagabond tabletop RPG system in Foundry VTT.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Perk details:
- Name: [NAME]
- Description: [FLAVOR TEXT + MECHANICAL EFFECT — HTML OK]
- Prerequisites:
  - Required stats (all must be met): [e.g., "Might 4, Dexterity 3"]
  - Stat OR groups (meet any one): [e.g., "Might 5 OR Dexterity 5"]
  - Required trained skills (all): [e.g., "melee, survival"]
  - Skill OR groups (trained in at least one): [e.g., "melee OR brawl"]
  - Must have any spell: [yes / no]
  - Resource requirements: [e.g., "maxMana 50"]
- Is a choice-based perk: [yes / no]
  - If yes: Choice type: [skill / weaponSkill / stat / spell]
- Active Effects (describe the bonus to add manually in Foundry after import)

Use the full JSON template from the Vagabond perk documentation.
Valid stat keys: might, dexterity, awareness, reason, presence, luck
Valid skill keys: arcana, craft, medicine, brawl, finesse, melee, ranged, sneak, detect, mysticism, survival, influence, leadership, performance
```
