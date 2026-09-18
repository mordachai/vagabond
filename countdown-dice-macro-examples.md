# Countdown Dice — Macro Examples

Countdown dice can be scripted from macros, item macros, hotbar buttons, and hooked to actors/actions/rolls. No single `game.vagabond.countdownDice` façade exists (unlike clocks); you drive the `CountdownDice` class + a few helper patterns directly. This doc covers create/roll/link/trigger recipes.

> Countdown dice are `JournalEntry` docs with `flags.vagabond.countdownDice.*`, drawn as HTML overlays (`d20→d12→d10→d8→d6→d4→end`, shrinks on rolling a 1). Class lives at `module/documents/countdown-dice.mjs`.

---

## Two globals — don't confuse them

| Global | Contains | Countdown-relevant |
|---|---|---|
| `game.vagabond` | Public API: `clocks`, `lightSource`, `api`, `socket` | **nothing for dice** |
| `globalThis.vagabond` (bare `vagabond` works too) | `documents`, `applications`, `ui`, `utils`, `models` | `vagabond.documents.CountdownDice` (class), `vagabond.ui.countdownDiceOverlay` (live instance) |

All examples below use the second one.

---

## API cheat sheet

`const { CountdownDice } = vagabond.documents;`

| Call | Notes |
|---|---|
| `CountdownDice.create(data)` | GM writes directly; non-GM auto-relays via socket (`createCountdownDie`). Returns the journal (GM) or `null` (player — fire-and-forget). |
| `CountdownDice.getAll()` | Every countdown-dice journal, all types (incl. recharge/status dice). |
| `CountdownDice.getForCurrentUser()` | Filtered to what this user should see (hides recharge dice, respects ownership). |
| `CountdownDice.getDiceImagePath(diceType)` | `systems/vagabond/assets/ui/dice/d6.webp` etc. |
| `CountdownDice.getSmallerDice(diceType)` | Next step down, or `null` at `d4`. |
| `CountdownDice.DICE_PROGRESSION` | `['d4','d6','d8','d10','d12','d20']` |

### `create(data)` fields

```js
await CountdownDice.create({
  name: 'Poison',                 // display name
  diceType: 'd8',                 // d4|d6|d8|d10|d12|d20 — starting size
  size: 'M',                      // S|M|L overlay size
  ownership: { default: 0, [game.user.id]: 3 }, // 0=GM-only visible (default)

  // --- tick-damage linking (optional) ---
  linkedActorUuid: actor.uuid,
  linkedStatusId: 'poisoned',     // status to remove when die ends (see cleanup below)
  tickDamageEnabled: true,
  tickDamageFormula: '1d4',       // blank = use the die roll itself as damage
  tickDamageType: 'poison',

  // --- NPC action recharge linking (optional, mutually distinct use-case) ---
  linkedRechargeActorUuid: actor.uuid,
  linkedRechargeActionIndex: 2,   // index into actor.system.actions
});
```

No `game.vagabond.clocks`-style `.value(ref)`/`.set(ref,n)` exists for dice — there's no stable `handle`, and dice aren't meant to be set to arbitrary values (only rolled/shrunk). Track the journal by `.id` or `.uuid` instead.

---

## Rolling a die from a macro

### Option A — reuse the real roll handler (recommended)

This is the exact code the on-screen click runs: animates, posts the chat card, shrinks/deletes on a 1, fires tick damage, and appends the NPC-recharge note. Only requires OWNER permission on the journal (same as clicking it).

```js
const dice = game.journal.get('JournalEntryIdHere'); // or find by name/flag, see below
if (!dice) return ui.notifications.error('Die not found.');
await vagabond.ui.countdownDiceOverlay._onRollDice(dice);
```

Finding the die by what it's linked to, instead of a hardcoded id:

```js
const dice = CountdownDice.getAll().find(j =>
  j.flags.vagabond.countdownDice.linkedRechargeActorUuid === actor.uuid &&
  j.flags.vagabond.countdownDice.linkedRechargeActionIndex === 2
);
```

### Option B — headless roll (no chat card, e.g. batch GM automation)

```js
const flags = dice.flags.vagabond.countdownDice;
const roll = await new Roll(`1${flags.diceType}`).evaluate();

if (roll.total === 1) {
  const smaller = CountdownDice.getSmallerDice(flags.diceType);
  if (smaller === null) await dice.delete();               // countdown ended
  else await dice.update({ 'flags.vagabond.countdownDice.diceType': smaller });
} else {
  console.log(`${dice.name}: ${flags.diceType} continues (rolled ${roll.total})`);
}
```

Use Option A whenever you want the normal chat feedback + tick-damage/recharge automation; use B only for silent bulk operations (e.g. a GM "advance all dice one step" end-of-session macro).

---

## Example 1 — Tick-damage die linked to an actor (poison/burning-style)

This is the same pattern `StatusHelper._createStatusCountdown` uses for on-hit statuses — reusable for a custom trap, hazard, or item effect outside the normal status-application flow.

```js
// GM macro, or item macro with {actor, token} in scope
const target = game.user.targets.first()?.actor ?? actor;
if (!target) return ui.notifications.warn('Target a token first.');

await CountdownDice.create({
  name: `${target.name}: Bleeding`,
  diceType: 'd6',
  linkedActorUuid: target.uuid,
  linkedStatusId: 'bleeding',      // must match a real status id if you want cleanup below to work
  tickDamageEnabled: true,
  tickDamageFormula: '',           // blank → damage = the die roll each tick
  tickDamageType: 'bleed',
});
```

Every roll (via Option A) now deals damage to `target` automatically (respects `autoApplySaveDamage` setting), same as the built-in status system.

**Cleanup when you remove the status early** (mirrors the combat-rules convention — deleting a status without deleting its die leaves an orphaned overlay):

```js
const orphans = CountdownDice.getAll().filter(j =>
  j.flags.vagabond.countdownDice.linkedActorUuid === target.uuid &&
  j.flags.vagabond.countdownDice.linkedStatusId === 'bleeding'
);
await Promise.all(orphans.map(j => j.delete()));
```

---

## Example 2 — NPC action recharge die (manual trigger, not sheet click)

Sheets auto-create these when a `Cd6`-style recharge action is used (see `actor-sheet.mjs`). To start one from a macro/hotbar (e.g. "start boss ultimate cooldown" button a GM presses on demand):

```js
const actor = game.actors.get('NpcActorIdHere');
const actionIndex = 2; // actor.system.actions[2]
const action = actor.system.actions[actionIndex];

const journal = await CountdownDice.create({
  name: `${actor.name}: ${action.name}`,
  diceType: 'd6',                          // matches the action's "Cd6" recharge string
  linkedRechargeActorUuid: actor.uuid,
  linkedRechargeActionIndex: actionIndex,
});

const actions = foundry.utils.deepClone(actor.system.actions);
actions[actionIndex].rechargeCountdownId = journal.id;
await actor.update({ 'system.actions': actions });
```

When this die hits 0 (rolled via Option A), the recharge note auto-appends to chat and the action becomes usable again — no extra wiring needed, that's handled by the existing `linkedRechargeActorUuid` hook path.

---

## Example 3 — Item macro: countdown tied to an item's duration/charges

Per the system's Item Macro System, an item's macro slot runs with `{actor, item, token, targets, speaker}` in scope. A torch/potion/trap item can spin up its own die on use:

```js
// Item macro (onUse or a manual "Use" button macro)
const existing = CountdownDice.getAll().find(j =>
  j.getFlag('vagabond', 'sourceItemUuid') === item.uuid
);
if (existing) return ui.notifications.warn(`${item.name} is already ticking down.`);

const journal = await CountdownDice.create({
  name: `${item.name} (${actor.name})`,
  diceType: 'd10',
  linkedActorUuid: actor.uuid, // optional: only if you also want tick damage
});
// stash a free-form link back to the item — CountdownDice.create() doesn't
// have a dedicated field for this, so tag it after creation
await journal.setFlag('vagabond', 'sourceItemUuid', item.uuid);
```

Then have the item's `deleteJournalEntry`-side cleanup (or a small world hook) react when that specific journal is deleted, e.g. to auto-consume the item — same idiom the light-source system uses (`flags.vagabond.lightSource.itemUuid` + `deleteJournalEntry` hook in `vagabond.mjs`).

---

## Example 4 — Roll-linked trigger (tick a die off an arbitrary roll)

Nothing built-in ties countdown dice to "any roll" — you hook chat messages yourself and roll/tick the linked die when a matching roll comes through. Example: a "Bloodlust" die that shrinks every time its owner lands a crit.

```js
// World script / small module init — persistent, not a one-shot macro
Hooks.on('createChatMessage', async (message) => {
  if (!game.user.isGM) return; // GM drives the automation
  const rollData = message.rolls?.[0];
  if (!rollData) return;

  const actorId = message.speaker?.actor;
  if (!actorId) return;

  const isCrit = message.getFlag('vagabond', 'isCritical'); // set by the system's own roll cards
  if (!isCrit) return;

  const die = CountdownDice.getAll().find(j =>
    j.flags.vagabond.countdownDice.linkedActorUuid === game.actors.get(actorId)?.uuid &&
    j.getFlag('vagabond', 'bloodlust') === true
  );
  if (die) await vagabond.ui.countdownDiceOverlay._onRollDice(die);
});
```

Swap the condition (`isCrit`, a specific weapon skill, a failed save, whatever) for your own trigger. Register this in a tiny module/`ready` hook if it needs to survive reloads — a macro run once registers nothing lasting (same caveat as the realtime HP-bar pattern in the clock doc).

---

## Example 5 — Ammo container: rolls on every ranged attack, deletes itself when empty

Concrete build of the pattern in Example 4: a die represents "shots left" in a quiver/box of bullets. Every ranged attack by the owner rolls it; when it counts down to nothing, the ammo container item is deleted automatically.

There's a purpose-built hook for this — `vagabond.postD20Roll` fires exactly once per attack roll (before damage), with `{ actor, item, rollKey, rollType, roll, difficulty, isSuccess, isCritical }`. `rollType === 'weapon'` + `rollKey` (the weapon skill used) tells you melee vs ranged via `VagabondChatCard.attackTypeForWeaponSkill(rollKey)` — no chat-message guessing needed, and it fires client-side for whoever rolled, so the die only needs `OWNER` for that player (or the GM).

### Part 1 — Setup macro (run once per ammo container)

Select the owner's token, have the ammo item ready, then run:

```js
const token = canvas.tokens.controlled[0];
if (!token) return ui.notifications.warn('Select the weapon owner\'s token first.');
const actor = token.actor;

// Adjust the filter to however you name/flag ammo containers (e.g. system.isSupply,
// a specific item name, or a dialog prompt — kept simple here).
const ammoItem = actor.items.find(i => i.name === 'Box of Bullets');
if (!ammoItem) return ui.notifications.error(`No "Box of Bullets" item found on ${actor.name}.`);

const { CountdownDice } = vagabond.documents;
const already = CountdownDice.getAll().find(j => j.getFlag('vagabond', 'ammoLinkActorUuid') === actor.uuid);
if (already) return ui.notifications.warn(`${actor.name} already has an active ammo countdown (${already.name}).`);

// Mirror the actor's OWNER-level users onto the die so the player who rolls
// attacks can also roll the ammo die (rolling requires journal OWNER).
const ownership = { default: 0 }; // GM always sees regardless
for (const [userId, level] of Object.entries(actor.ownership)) {
  if (level >= 3) ownership[userId] = 3;
}

const journal = await CountdownDice.create({
  name: `${ammoItem.name} (${actor.name})`,
  diceType: 'd20',   // bigger die = more shots before it runs dry — tune to the container size
  size: 'S',
  ownership,
});
await journal.setFlag('vagabond', 'ammoLinkActorUuid', actor.uuid);
await journal.setFlag('vagabond', 'ammoContainerItemUuid', ammoItem.uuid);

ui.notifications.info(`${ammoItem.name} is now tracked — rolls a ${journal.flags.vagabond.countdownDice.diceType} on every ranged attack.`);
```

### Part 2 — Persistent hooks (put in a small module's `ready`/`init`, not a one-shot macro)

```js
const { CountdownDice } = vagabond.documents;

// Roll the linked ammo die whenever its owner lands (or misses — ammo is
// still spent) a ranged weapon attack.
Hooks.on('vagabond.postD20Roll', async (ctx) => {
  if (ctx.rollType !== 'weapon') return;
  const { VagabondChatCard } = game.vagabond.api;
  if (VagabondChatCard.attackTypeForWeaponSkill(ctx.rollKey) !== 'ranged') return;

  const die = CountdownDice.getAll().find(j =>
    j.getFlag('vagabond', 'ammoLinkActorUuid') === ctx.actor.uuid
  );
  if (!die) return; // this actor has no ammo tracker running

  if (!die.testUserPermission(game.user, 'OWNER')) return; // silently skip if this client can't roll it
  await vagabond.ui.countdownDiceOverlay._onRollDice(die);
});

// When the die finally rolls a 1 on d4 (countdown ends → journal deleted),
// delete the ammo container it was tracking.
Hooks.on('deleteJournalEntry', async (journal) => {
  const ammoItemUuid = journal.getFlag('vagabond', 'ammoContainerItemUuid');
  if (!ammoItemUuid) return;
  if (!game.user.isGM) return; // one deletion only, not one per connected client

  const item = await fromUuid(ammoItemUuid);
  if (!item) return;
  const name = item.name;
  await item.delete();
  ui.notifications.info(`${name} is empty and has been removed.`);
});
```

Notes specific to this recipe:

- **One ammo tracker per actor at a time** — the lookup keys off `ammoLinkActorUuid`, so swapping weapon types mid-campaign means deleting/recreating the tracker (or extending the flag to also store a weapon/skill filter if you need multiple simultaneous ammo pools).
- **Miss still spends ammo** — `postD20Roll` fires regardless of hit/miss, matching "you fired the shot" logic. If you want misses to be free, add `if (!ctx.isSuccess) return;` (or check `ctx.isCritical`/whatever fits your rules) before rolling the die.
- **Thrown weapons** count as ranged too, since `attackTypeForWeaponSkill` looks at the actual skill used for that roll, not just the weapon's default.
- **Why the `OWNER` check before rolling**: `postD20Roll` fires on whichever client performed the attack. If a player without `OWNER` on the die somehow triggers it (shouldn't happen given the ownership mirroring in Part 1, but defends against manual edits), they just silently can't tick it — no error spam.

---

## Formulas / Active Effects — not supported (workaround)

Unlike clocks (`@clocks.<handle>.value`), countdown dice are **not** injected into `actor.getRollData()` / `item.getRollData()`. There's no `@countdown.*`.

If you need a die's current size or "is it active" in a formula/AE, mirror it into a `ProgressClock` tracker alongside the die and read `@clocks.<handle>.value` instead:

```js
// after creating/rolling the die
const sizeIndex = CountdownDice.DICE_PROGRESSION.indexOf(flags.diceType); // 0(d4)..5(d20)
await game.vagabond.clocks.set('bloodlust_mirror', sizeIndex);
```

---

## Permissions summary

| Action | Requirement |
|---|---|
| `CountdownDice.create()` | Any user — GM writes directly, player relays via socket automatically |
| Rolling (`_onRollDice` / manual roll+update) | Journal `OWNER` permission (rolling mutates/deletes it) |
| Tick damage application | GM only (`game.user.isGM` guard inside `_onRollDice`) |
| Recharge-note chat text | No extra guard — follows whoever rolls |

Default `ownership: { default: 0 }` = GM-only visible. Add `[game.user.id]: 3` (or a specific player's id) to let a player see/roll their own linked die, same as status-countdown dice already do.

---

## Notes

- **No stable `handle`** like clocks — track dice by `.id`/`.uuid`, or by the `linkedActorUuid`/`linkedRechargeActorUuid`/custom flags you set on creation, per the patterns above.
- **Deleting ≠ cleanup.** Deleting a linked die does not remove the actor's status effect or reset `rechargeCountdownId` — that's handled by the existing `deleteJournalEntry` hook in `vagabond.mjs` for the two built-in link types (`linkedActorUuid`+`linkedStatusId`, `linkedRechargeActorUuid`+`linkedRechargeActionIndex`). Custom link fields (Example 3) need your own cleanup hook.
- **`getForCurrentUser()` hides recharge dice** by design (`!linkedRechargeActorUuid` filter) — use `getAll()` when searching for one.
- **Animation timing:** Option A waits ~2.5s (Dice So Nice) before shrinking/deleting the journal — don't assume the die's `diceType` has updated immediately after calling it; `await` returns once the roll+chat-card posts, not once the shrink/delete completes.
