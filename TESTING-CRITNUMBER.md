# Testing Critical Hit Number (critNumber)

This guide explains how to test the `system.critNumber` feature that controls when rolls are considered critical hits.

## What is critNumber?

The `critNumber` field determines the threshold for critical hits. By default, it's **20** (only natural 20s are crits). When you lower it, more rolls become critical hits.

- `critNumber = 20` → Only rolls of 20 are crits (default)
- `critNumber = 19` → Rolls of 19-20 are crits
- `critNumber = 10` → Rolls of 10-20 are crits
- `critNumber = 1` → ALL rolls are crits (for testing)

## Where to Find the Crit Number Field

1. Open a **Character** sheet (not NPC)
2. Look at the **sliding panel** on the right side
3. In the **speed stats row** (below the character image), you'll see:
   - Speed
   - Crawl
   - Travel
   - Current Luck
   - **Crit Number** ← This is the new field

## How to Test

### Method 1: Visual Testing (Recommended)

1. **Set critNumber to 1** (all rolls will crit)
   - In the Crit Number field, change from 20 to 1
   - Click elsewhere to save

2. **Make a weapon attack:**
   - Click on an equipped weapon in the sliding panel
   - Look at the chat message
   - **Expected:** You should see `(CRITICAL!)` in gold text next to the damage

3. **Cast a damaging spell:**
   - Click on a favorited spell's name to cast it
   - Look at the chat message
   - **Expected:** You should see `(CRITICAL!)` in gold text
   - **Expected:** If the spell has a crit description, it shows as "Critical Effect: [description]"

4. **Set critNumber back to 20** when done testing

### Method 2: Console Verification

1. Open the browser console (F12)
2. Type this command:
```javascript
game.actors.getName("Your Character Name").system.critNumber
```
3. It should return the number you set (10, 1, etc.)

### Method 3: Make Multiple Rolls

1. Set `critNumber` to `10`
2. Make **10+ weapon attacks or spell casts**
3. You should see critical hits appearing on rolls of 10 or higher
4. Look for the gold `(CRITICAL!)` text in chat messages

## What You Should See on a Critical Hit

### Weapon Attacks
When `isCritical` is true AND damage is rolled:
```
[Weapon Name] Attack
Weapon Skill: Melee (Difficulty 12)
Attack Roll: 18 - SUCCESS!
Damage: 8 (CRITICAL!) ← Gold text here
```

### Spell Casts
When `isCritical` is true AND damage is rolled:
```
[Spell Name]
Damage: 3d6 Fire (CRITICAL!) ← Gold text here
Delivery: Sphere (10-foot radius)
Mana Cost: 5
Roll: 19 vs DC 12
Result: SUCCESS
```

If the spell also has a crit description:
```
Critical Effect: Target must make an Endure save or be stunned ← Shows spell's crit text
```

## Common Issues

### "I set it to 10 but don't see crits"
- **Solution:** You need to actually **roll 10 or higher** to see a crit
- If your rolls are 8, 9, 6, etc., you won't see crits yet
- Try setting it to **1** to guarantee crits on every roll

### "I can't find the Crit Number field"
- Make sure you're on a **Character** sheet (not NPC)
- The field is in the **sliding panel** (right side)
- It's in the bottom row with Speed/Crawl/Travel/Luck

### "The field shows 20 even though I changed it"
- Click elsewhere after typing to trigger the save
- Refresh the sheet
- Check the console: `game.actors.getName("Name").system.critNumber`

### "It works for weapons but not spells" (or vice versa)
- This shouldn't happen - they use the same code
- Try refreshing the page
- Check the console for errors (F12)

## Using Active Effects

You can also modify critNumber with Active Effects (for perks/features):

```javascript
{
  "key": "system.critNumber",
  "mode": CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
  "value": 19
}
```

This is how you'd implement a "Keen Edge" perk that crits on 19-20.

## Verification Checklist

- [ ] Crit Number field appears on character sheet (sliding panel)
- [ ] Can change the value (try setting to 1)
- [ ] Weapon attacks show `(CRITICAL!)` on high rolls
- [ ] Spell casts show `(CRITICAL!)` on high rolls
- [ ] Spell crit descriptions appear when spell has `crit` field
- [ ] Setting to 20 makes only nat 20s crit
- [ ] Setting to 1 makes ALL rolls crit

## Technical Details

The critical check is:
```javascript
const critNumber = actor.system.critNumber || 20;
const isCritical = roll.total >= critNumber;
```

This means:
- Uses `actor.system.critNumber` if it exists
- Falls back to 20 if undefined
- Critical if `roll.total >= critNumber` (not just equals!)

## Files Modified

- `module/data/actor-character.mjs` - Added critNumber field
- `module/documents/item.mjs` - Weapon attacks use critNumber
- `module/sheets/actor-sheet.mjs` - Spell casts use critNumber
- `templates/actor/sliding-panel.hbs` - Added UI field for critNumber
