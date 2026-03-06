# Vagabond — AI Item Creation Guide: Ancestries

Use this document to prompt an AI assistant to generate ancestry items for the Vagabond Foundry VTT system. Ancestries define a character's biological heritage — species, folk, or origin — and grant traits that shape their capabilities.

---

## How to Use

Tell the AI:

> "Create a Vagabond ancestry named [NAME]. It is a [size] [being type]. It has [N] traits: [describe each trait's name and effect]."

---

## Valid Values

| Field | Valid Options |
|-------|--------------|
| `size` | `small`, `medium`, `large`, `huge`, `giant`, `colossal` |
| `ancestryType` (being type) | `Humanlike`, `Fae`, `Cryptid`, `Artificials`, `Beasts`, `Outers`, `Primordials`, `Undead` |

### Trait Grant Fields

Each trait in the `traits` array can grant any combination of:

| Field | Type | Description |
|-------|------|-------------|
| `statBonusPoints` | integer | Number of stat points the player distributes freely |
| `extraTraining` | integer | Number of additional skill trainings granted |
| `skillChoices` | array | Restricted skill pools (player picks from a defined set) |
| `spellAmount` | integer | Number of spells granted |
| `requiredSpells` | string[] | Specific spell names granted automatically |
| `perkAmount` | integer | Number of perks granted |
| `allowedPerks` | string[] | Specific perk names granted automatically |

### skillChoices Format
```json
"skillChoices": [
  {
    "count": 1,
    "pool": ["melee", "brawl", "finesse"],
    "label": "Choose a combat skill"
  }
]
```

---

## Complete JSON Model

```json
{
  "name": "Stonewarden",
  "type": "ancestry",
  "img": "icons/creatures/humanoids/humanoid-dwarf-bearded.webp",
  "system": {
    "description": "<p>The Stonewardens are a people of the deep mountains — stocky, stubborn, and enduring. Born into clans that trace their lineage back to the first miners who found gold at the world's core.</p>",
    "size": "medium",
    "ancestryType": "Humanlike",
    "traits": [
      {
        "name": "Granite Constitution",
        "description": "<p>Your body is dense and resistant to punishment. You recover from injuries faster than most.</p><p><strong>Effect:</strong> +1 to Endure saves. Gain 1 additional HP per level.</p>",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "spellAmount": 0,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": []
      },
      {
        "name": "Mountain's Gift",
        "description": "<p>Your people have worked stone and metal for generations. You are skilled in craft and survival underground.</p><p><strong>Effect:</strong> You are trained in Craft. Choose one additional skill from the following list.</p>",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [
          {
            "count": 1,
            "pool": ["detect", "survival", "medicine"],
            "label": "Choose a survival skill"
          }
        ],
        "spellAmount": 0,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": ["New Training (Craft)"]
      },
      {
        "name": "Born of Stone",
        "description": "<p>You were shaped by the pressures of deep earth. Distribute +1 to any two stats of your choice.</p>",
        "statBonusPoints": 2,
        "extraTraining": 0,
        "skillChoices": [],
        "spellAmount": 0,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": []
      }
    ]
  }
}
```

---

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Ancestry name |
| `img` | string | Icon path |
| `description` | HTML string | Lore and flavor text for the ancestry overall |
| `size` | string | Default body size |
| `ancestryType` | string | Being type category |
| `traits` | array | List of traits this ancestry grants |
| `traits[].name` | string | Trait name |
| `traits[].description` | HTML string | Trait rules and flavor |
| `traits[].statBonusPoints` | integer | Free stat points the player assigns |
| `traits[].extraTraining` | integer | Free skill training choices (unrestricted) |
| `traits[].skillChoices` | array | Restricted skill choice groups |
| `traits[].skillChoices[].count` | integer | How many skills to pick from the pool |
| `traits[].skillChoices[].pool` | string[] | Allowed skill keys |
| `traits[].skillChoices[].label` | string | UI label for the choice |
| `traits[].spellAmount` | integer | Number of spells to choose |
| `traits[].requiredSpells` | string[] | Specific spells granted (by name) |
| `traits[].perkAmount` | integer | Number of perks to choose |
| `traits[].allowedPerks` | string[] | Specific perks granted (by name) |

---

## Quick Examples

### Sylvan Fox (Fae, small, innate magic)
```json
{
  "name": "Sylvan Fox",
  "type": "ancestry",
  "img": "icons/creatures/mammals/fox-sitting-green.webp",
  "system": {
    "description": "<p>Fox-folk born of ancient Fae pacts. Quick, clever, and attuned to wild magic.</p>",
    "size": "small",
    "ancestryType": "Fae",
    "traits": [
      {
        "name": "Fae Cunning",
        "description": "<p>Your Fae heritage gives you sharp instincts and an uncanny ability to sense magic.</p><p><strong>Effect:</strong> Gain training in Detect and Mysticism.</p>",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "spellAmount": 0,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": ["New Training (Detect)", "New Training (Mysticism)"]
      },
      {
        "name": "Wild Gift",
        "description": "<p>You carry a spark of natural magic. Choose one spell to start with.</p>",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "spellAmount": 1,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": []
      },
      {
        "name": "Quick Limbs",
        "description": "<p>Distribute +1 point to any stat. You are naturally quick.</p>",
        "statBonusPoints": 1,
        "extraTraining": 0,
        "skillChoices": [],
        "spellAmount": 0,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": []
      }
    ]
  }
}
```

### Ironclad (Artificials, medium, no magic)
```json
{
  "name": "Ironclad",
  "type": "ancestry",
  "img": "icons/creatures/magical/construct-golem-clay-tan.webp",
  "system": {
    "description": "<p>Living constructs built for labor and war. They do not tire, do not feel hunger, and do not dream.</p>",
    "size": "medium",
    "ancestryType": "Artificials",
    "traits": [
      {
        "name": "Constructed Body",
        "description": "<p>You do not need to eat, drink, or breathe. You are immune to poison.</p><p><strong>Effect:</strong> Immunity to poison damage. Add as an Active Effect after import.</p>",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [],
        "spellAmount": 0,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": []
      },
      {
        "name": "Purpose-Built",
        "description": "<p>Every Ironclad is built with a function in mind. Choose one skill you were designed for.</p>",
        "statBonusPoints": 0,
        "extraTraining": 0,
        "skillChoices": [
          {
            "count": 1,
            "pool": ["craft", "melee", "brawl", "survival", "detect"],
            "label": "Choose your built-in function"
          }
        ],
        "spellAmount": 0,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": []
      },
      {
        "name": "Iron Frame",
        "description": "<p>Your body was forged for durability. Distribute +2 to Might or Endurance.</p>",
        "statBonusPoints": 2,
        "extraTraining": 0,
        "skillChoices": [],
        "spellAmount": 0,
        "requiredSpells": [],
        "perkAmount": 0,
        "allowedPerks": []
      }
    ]
  }
}
```

---

## AI Prompt Template

```
You are creating an ancestry item for the Vagabond tabletop RPG system in Foundry VTT.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Ancestry details:
- Name: [NAME]
- Lore/Description: [FLAVOR TEXT — HTML OK]
- Size: [small / medium / large / huge / giant / colossal]
- Being Type: [Humanlike / Fae / Cryptid / Artificials / Beasts / Outers / Primordials / Undead]
- Traits (list each one):
  - Trait Name: [NAME]
  - Trait Description: [RULES + FLAVOR — HTML OK]
  - Stat Bonus Points: [integer, or 0]
  - Extra Training (unrestricted): [integer, or 0]
  - Skill Choice Groups: [define pool and count, or none]
  - Spells Granted: [count and/or specific spell names, or 0]
  - Perks Granted: [count and/or specific perk names, or 0]

Use the full JSON template from the Vagabond ancestry documentation.
Valid sizes: small, medium, large, huge, giant, colossal
Valid being types: Humanlike, Fae, Cryptid, Artificials, Beasts, Outers, Primordials, Undead
Valid skill keys: arcana, craft, medicine, brawl, finesse, melee, ranged, sneak, detect, mysticism, survival, influence, leadership, performance
```
