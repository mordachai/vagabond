# Vagabond — AI Item Creation Guide: Classes

Use this document to prompt an AI assistant to generate class items for the Vagabond Foundry VTT system. Classes define a character's role, progression, and access to skills, spells, and perks across 10 levels.

---

## How to Use

Tell the AI:

> "Create a Vagabond class named [NAME]. It uses the [stat] stat for casting. Key stats are [stats]. It grants training in [skills]. Describe level features for levels 1–10."

---

## Class Anatomy

A class defines:
- **Spellcasting** — whether it can cast spells, which stat governs mana, and which skill is used to cast
- **Key Stats** — the 2–3 stats that define the class fantasy
- **Guaranteed Skills** — skills every member of this class is trained in
- **Skill Choices** — optional pools where players pick additional trainings
- **Level Features** — what the class grants at each level (stat points, perks, spells, training)
- **Level Spells** — automatic spells granted at specific levels (for caster classes)

---

## Valid Values

### Stats
`might`, `dexterity`, `awareness`, `reason`, `presence`, `luck`

### Skills
`arcana`, `craft`, `medicine`, `brawl`, `finesse`, `melee`, `ranged`, `sneak`, `detect`, `mysticism`, `survival`, `influence`, `leadership`, `performance`

### levelFeatures Event Types
Each entry in `levelFeatures` fires at a specific level and grants:
| Field | Type | Description |
|-------|------|-------------|
| `level` | integer | Which level triggers this |
| `label` | string | Display label |
| `statBonusPoints` | integer | Free stat points the player assigns |
| `extraTraining` | integer | Unrestricted skill training choices |
| `skillChoices` | array | Restricted choice groups |
| `perkAmount` | integer | Number of perks to choose |
| `allowedPerks` | string[] | Specific perks forced at this level |
| `spellAmount` | integer | Number of spells to learn |
| `requiredSpells` | string[] | Specific spells granted automatically |

---

## Complete JSON Model

```json
{
  "name": "Warden",
  "type": "class",
  "img": "icons/skills/trades/woodcutting-logging-blue.webp",
  "system": {
    "description": "<p>Wardens are guardians of the wild places — rangers, survivalists, and hunters who move as easily through trackless forests as city streets. They blend martial skill with nature magic.</p>",
    "isSpellcaster": true,
    "manaMultiplier": 5,
    "manaSkill": "mysticism",
    "castingStat": "awareness",
    "keyStats": ["dexterity", "awareness"],
    "skillGrant": {
      "guaranteed": ["survival", "detect"],
      "choices": [
        {
          "count": 1,
          "pool": ["ranged", "melee", "finesse"],
          "label": "Choose a combat skill"
        },
        {
          "count": 1,
          "pool": ["mysticism", "medicine", "craft"],
          "label": "Choose a utility skill"
        }
      ]
    },
    "levelFeatures": [
      {
        "level": 1,
        "label": "Warden Training",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 2,
        "requiredSpells": []
      },
      {
        "level": 2,
        "label": "Warden Advancement",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 0,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 3,
        "label": "Warden Perk",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 1,
        "requiredSpells": []
      },
      {
        "level": 4,
        "label": "Warden Advancement",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 0,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 5,
        "label": "Warden Mastery",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 1,
        "requiredSpells": []
      },
      {
        "level": 6,
        "label": "Warden Advancement",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 0,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 7,
        "label": "Warden Perk",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 1,
        "requiredSpells": []
      },
      {
        "level": 8,
        "label": "Warden Advancement",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 0,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 9,
        "label": "Warden Perk",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 1,
        "requiredSpells": []
      },
      {
        "level": 10,
        "label": "Warden Pinnacle",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 1,
        "requiredSpells": []
      }
    ],
    "levelSpells": []
  }
}
```

---

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Class name |
| `img` | string | Icon path |
| `description` | HTML string | Flavor text and class overview |
| `isSpellcaster` | boolean | Whether this class uses mana and spells |
| `manaMultiplier` | integer | Mana per casting skill level (e.g., 5 = 5 mana per skill level) |
| `manaSkill` | string | Skill used for mana pool size |
| `castingStat` | string | Stat that governs casting checks |
| `keyStats` | string[] | 1–3 stats that define the class |
| `skillGrant.guaranteed` | string[] | Skills every character of this class gets |
| `skillGrant.choices` | array | Restricted skill choice groups |
| `skillGrant.choices[].count` | integer | How many skills to pick |
| `skillGrant.choices[].pool` | string[] | Allowed skill keys |
| `skillGrant.choices[].label` | string | UI label for this group |
| `levelFeatures` | array | Events that fire at each level |
| `levelFeatures[].level` | integer | Trigger level (1–10) |
| `levelFeatures[].label` | string | Display name for this event |
| `levelFeatures[].statBonusPoints` | integer | Free stat points to assign |
| `levelFeatures[].extraTraining` | integer | Unrestricted skill training |
| `levelFeatures[].skillChoices` | array | Restricted skill picks at level-up |
| `levelFeatures[].perkAmount` | integer | Number of perks to choose |
| `levelFeatures[].allowedPerks` | string[] | Specific forced perks |
| `levelFeatures[].spellAmount` | integer | Spells to choose |
| `levelFeatures[].requiredSpells` | string[] | Specific forced spells |
| `levelSpells` | array | Spells granted automatically at specific levels |

---

## Non-Caster Example

### Brute (martial, no spells)
```json
{
  "name": "Brute",
  "type": "class",
  "img": "icons/skills/melee/blade-tip-orange.webp",
  "system": {
    "description": "<p>Brutes are warriors who rely on overwhelming force. No magic, no tricks — just raw power applied at close range.</p>",
    "isSpellcaster": false,
    "manaMultiplier": 0,
    "manaSkill": "arcana",
    "castingStat": "reason",
    "keyStats": ["might"],
    "skillGrant": {
      "guaranteed": ["melee", "brawl"],
      "choices": [
        {
          "count": 1,
          "pool": ["survival", "medicine", "craft", "influence"],
          "label": "Choose a secondary skill"
        }
      ]
    },
    "levelFeatures": [
      {
        "level": 1,
        "label": "Brute Training",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 2,
        "label": "Brute Advancement",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 0,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 3,
        "label": "Brute Perk",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 4,
        "label": "Brute Advancement",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 0,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 5,
        "label": "Brute Mastery",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 6,
        "label": "Brute Advancement",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 0,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 7,
        "label": "Brute Perk",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 8,
        "label": "Brute Advancement",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 0,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 9,
        "label": "Brute Perk",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      },
      {
        "level": 10,
        "label": "Brute Pinnacle",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "perkAmount": 1,
        "allowedPerks": [],
        "spellAmount": 0,
        "requiredSpells": []
      }
    ],
    "levelSpells": []
  }
}
```

---

## Level Progression Patterns

### Typical Martial Progression (levels 1–10)
- Level 1: 1 perk
- Even levels (2,4,6,8): +1 stat point
- Odd levels (3,5,7,9): +1 perk
- Level 10: +1 stat point + 1 perk

### Typical Caster Progression
- Same as martial, but also add spells at levels 1, 3, 5, 7, 9, 10

---

## AI Prompt Template

```
You are creating a class item for the Vagabond tabletop RPG system in Foundry VTT.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Class details:
- Name: [NAME]
- Description: [FLAVOR TEXT + CLASS OVERVIEW — HTML OK]
- Is a spellcaster: [yes / no]
  - If yes: Casting Stat: [stat], Mana Skill: [skill], Mana Multiplier: [integer, default 5]
- Key Stats: [1–3 stats, e.g., "might, dexterity"]
- Guaranteed Skills: [skills all members get]
- Skill Choice Groups: [describe any pools and pick counts]
- Level Features (describe what happens at each level 1–10):
  - Level 1: [perk? spells? training?]
  - Level 2: [stat point? perk?]
  - ... (continue for all 10 levels)
- Auto-granted spells at specific levels (levelSpells): [e.g., "level 5: Flame Wall"]

Use the full JSON template from the Vagabond class documentation.
Valid stat keys: might, dexterity, awareness, reason, presence, luck
Valid skill keys: arcana, craft, medicine, brawl, finesse, melee, ranged, sneak, detect, mysticism, survival, influence, leadership, performance
```
