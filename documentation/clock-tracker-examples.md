# Progress Clock & Tracker — Examples

Recipes for clocks and trackers beyond the built-in Realtimer. Two featured: a **party rations tracker** and a **token HP health bar** (realtime, GM-only).

> Clocks and trackers are `JournalEntry` docs with `flags.vagabond.progressClock.*`, drawn as HTML overlays. The whole API lives on `game.vagabond.clocks` (the `ProgressClock` class).

---

## Clock vs Tracker

| | **clock** | **tracker** |
|---|---|---|
| Look | segmented pie (4/6/8/10/12 wedges) | static background, free counter |
| Starts at | full (segments) | 0 |
| Value bounds | clamped `[0, segments]` | unbounded |
| `reset()` | → full | → 0 |

Pick `kind: 'tracker'` for resource counters (rations, HP, ammo). Pick `kind: 'clock'` for filling-toward-doom dials.

---

## API cheat sheet

`game.vagabond.clocks` **is** the `ProgressClock` class.

### Create

```js
await ProgressClock.create({
  name: 'Party Rations',
  kind: 'tracker',          // 'clock' (default) | 'tracker'
  segments: 14,             // max / number of wedges
  filled: 14,               // current value (clocks default to full, trackers to 0)
  handle: 'rations',        // stable ref. Auto-slugged from name if omitted (underscores, not hyphens)
  size: 'M',                // 'S' | 'L' | 'M' | pixel number
  defaultPosition: 'top-right', // top-left | top-right | bottom-left | bottom-right
  sceneId: null,            // null = show on ALL scenes; else only that scene id
  ownership: { default: 0 } // 0=NONE (GM-only) | 1=LIMITED | 2=OBSERVER | 3=OWNER
});
```

> No `color` option — appearance comes from the segment SVGs / size. Visibility comes from `ownership`.

`kind` matters for `reset()`: tracker → 0, clock → full.

### Read (any user)

| Call | Returns |
|---|---|
| `ProgressClock.value(ref)` | current number (the `filled` value) |
| `ProgressClock.read(ref)` | `{ name, handle, kind, value, filled, max, segments, pct }` |
| `ProgressClock.get(ref)` | the `JournalEntry` |
| `ProgressClock.getAll()` | all clock journals |

`ref` resolves: handle → journal id → exact name → name-slug.

### Write (GM only, clocks clamped `[0, segments]`; trackers unbounded)

| Call | Effect |
|---|---|
| `ProgressClock.set(ref, n)` | set exact value |
| `ProgressClock.tick(ref, d=1)` | add `d` (negative to subtract) |
| `ProgressClock.fill(ref)` | value = segments |
| `ProgressClock.empty(ref)` | value = 0 |
| `ProgressClock.reset(ref)` | tracker→0, clock→full |

### Formulas / Active Effects

`@clocks.<handle>.value` (also `.pct`, `.max`, `.segments`, `.filled`) — works in any bonus `ArrayField` formula, AE value, or `Roll`.

### Templates

```hbs
{{clockValue "rations"}}          {{!-- value --}}
{{clockValue "rations" "pct"}}    {{!-- percent --}}
```

---

## Example 1 — Party Rations Tracker

> **Note:** the system already tracks rations natively in the **Party Sheet** via the gear item's "Counts as rations" checkbox (`system.isSupply`). It sums `quantity` across every party member's equipment (party-sheet.mjs `_resolveMembers` + `_aggregateSupplies`). This example only matters if you also want an **on-canvas overlay** mirroring that total.

### Setup (run once, GM)

```js
await game.vagabond.clocks.create({
  name: 'Party Rations',
  kind: 'tracker',
  segments: 14,   // 14 days of food = the max
  filled: 14,     // start full
  handle: 'rations',
  ownership: { default: 2 } // OBSERVER: players can see the count
});
```

### Mirror the native party total (bridge macro)

Reads the same `isSupply` flag the Party Sheet uses, sums across party members, pushes to the clock:

```js
const party = game.actors.find(a => a.type === 'party'); // or pick a specific one
const memberActors = party.system.members
  .map(uuid => fromUuidSync(uuid))
  .filter(a => a && a.type === 'character');

let rations = 0;
for (const a of memberActors)
  for (const i of a.items)
    if (i.type === 'equipment' && i.system.isSupply)
      rations += i.system.quantity ?? 1;

await game.vagabond.clocks.set('rations', rations);
```

### Live auto — recompute when inventory changes (world script / module)

```js
const recountRations = foundry.utils.debounce(() => {
  if (!game.user.isGM) return;
  if (!game.vagabond.clocks.get('rations')) return;
  const party = game.actors.find(a => a.type === 'party');
  if (!party) return;
  let total = 0;
  for (const uuid of party.system.members) {
    const a = fromUuidSync(uuid);
    if (!a || a.type !== 'character') continue;
    for (const i of a.items)
      if (i.type === 'equipment' && i.system.isSupply)
        total += i.system.quantity ?? 1;
  }
  game.vagabond.clocks.set('rations', total);
}, 200);

Hooks.on('createItem', recountRations);
Hooks.on('deleteItem', recountRations);
Hooks.on('updateItem', recountRations); // catches quantity edits
```

### Manual tick (no native sync)

```js
await game.vagabond.clocks.tick('rations', -1); // eat one
await game.vagabond.clocks.tick('rations', 6);  // restock
```

### Use rations count in a formula

`@clocks.rations.value` works in any bonus field / AE value. e.g. morale-penalty AE that fires only when empty:

```text
-1 * (@clocks.rations.filled ? 0 : 1)
```

---

## Example 2 — Token HP Health Bar (realtime, GM-only)

> **✅ Now built-in — no macro needed.** The system has a generic **Linked Value** binding (see `docs/clock-bound-sources-design.md`). Open a clock's config dialog → **Linked Value** → "Linked document field" → drag a token in → set value path `system.health.value`, max path `system.health.max` → set Player Permissions to **None** for GM-only. It updates live. The manual macros below are kept only as a scripting reference / fallback.

### Built-in way (recommended)

1. Create a tracker (`kind: tracker`), Player Permissions = **None** (GM-only).
2. Config dialog → **Linked Value** → mode **Linked document field**.
3. Drag the token (or actor) onto the drop zone.
4. Value path `system.health.value`, max path `system.health.max`, tick "Resize segments to match max path".
5. Save. Damage/heal now drives the bar in realtime, GM-only.

> Token drop binds to the token's delta-applied actor, so `system.*` is correct for unlinked tokens too. Any path works — `system.mana.current`, `system.fatigue`, etc.

### Manual macro way (legacy / scripting reference)

Bind to the **token**, not the base actor id — unlinked tokens share their base actor id and would collide. Store the token uuid in a flag, resolve HP from the token's (delta-applied) actor each fire. Create it **GM-only** (`ownership.default = 0` / NONE) so players never see the bar; the GM always does.

> **Must be persistent.** Register the hooks in a tiny module (`init`/`ready`) or a script re-run on every `ready`. A macro run once registers nothing lasting.

### 1. Create a bar bound to the selected token (macro)

```js
globalThis.createTokenHpBar = async function () {
  const token = canvas.tokens.controlled[0];
  if (!token) return ui.notifications.warn('Select a token first.');
  const hp = token.actor?.system?.health;
  if (!hp) return ui.notifications.error('No system.health on token actor.');

  const handle = `hp_tok_${token.id}`;        // per-token unique (NOT base actor id)
  await game.vagabond.clocks.create({
    name: `${token.name} HP`,
    kind: 'tracker',
    segments: hp.max,
    filled: hp.value,
    handle,
    ownership: { default: 0 }                 // 0 = NONE → GM-only (GM always sees)
  });
  // stash token uuid so the sync hook can resolve it
  await game.vagabond.clocks.get(handle)
    .setFlag('vagabond', 'hpTokenUuid', token.document.uuid);
};
```

Run it: select token, execute `createTokenHpBar()`.

### 2. Live sync — paste into a world script / module init hook

```js
function syncHpBars() {
  if (!game.user.isGM) return;                // writes GM-only
  for (const journal of game.vagabond.clocks.getAll()) {
    const tokenUuid = journal.getFlag('vagabond', 'hpTokenUuid');
    if (!tokenUuid) continue;
    const tokenDoc = fromUuidSync(tokenUuid);
    const hp = tokenDoc?.actor?.system?.health;
    if (!hp) continue;

    const pc = journal.flags.vagabond.progressClock;
    if (pc.segments !== hp.max)               // max HP changed → resize
      journal.update({ 'flags.vagabond.progressClock.segments': hp.max });
    game.vagabond.clocks.set(pc.handle, hp.value);
  }
}
const syncHpBarsDebounced = foundry.utils.debounce(syncHpBars, 100);

Hooks.on('updateActor', syncHpBarsDebounced);  // linked tokens + unlinked synthetic actor
Hooks.on('updateToken', syncHpBarsDebounced);  // token swap / actorLink / bar edits
Hooks.on('canvasReady', syncHpBarsDebounced);  // resync on scene load
```

Any damage/heal on that token now redraws the bar for the GM (`updateJournalEntry` hook handles the redraw). Players see nothing — `ownership.default = 0`.

### Ownership levels

| value | const | who sees |
|---|---|---|
| 0 | NONE | GM only |
| 1 | LIMITED | viewers |
| 2 | OBSERVER | players can watch |
| 3 | OWNER | players can drag/edit |

GM always sees regardless of `default`. To flip an existing bar GM-only: `journal.update({ 'ownership.default': 0 })`, or set it in the clock config dialog.

### Why a one-shot recompute is not realtime

| Problem | Fix |
|---|---|
| Recompute ran once — no listener | register hooks in a persistent module / `ready` |
| Bound to `hp_${actor.id}` — unlinked tokens collide | per-token `hp_tok_${token.id}` + `hpTokenUuid` flag |
| Only `updateActor` — misses unlinked delta / token edits | also `updateToken` + `canvasReady` |
| HP read from base actor — stale for unlinked | read `fromUuidSync(tokenUuid).actor.system.health` |

### Show HP percent in a chat/template

```hbs
Boss: {{clockValue "hp_tok_abcd1234" "pct"}}% HP
```

---

## Bonus mini-examples

### Doom Clock (fills toward catastrophe)

```js
await game.vagabond.clocks.create({
  name: 'The Ritual', kind: 'clock', segments: 6, filled: 0, handle: 'ritual'
});
// advance one wedge when players fail
await game.vagabond.clocks.tick('ritual', 1);
// fully drawn?
if (game.vagabond.clocks.read('ritual').filled === game.vagabond.clocks.read('ritual').max)
  ui.notifications.warn('Ritual complete!');
```

### Alarm / Suspicion meter (gate an AE)

Tracker `suspicion`, segments 4. AE on guards, detection bonus `value`:

```text
@clocks.suspicion.value
```

### Reset between sessions

```js
game.vagabond.clocks.reset('rations');   // tracker → 0
game.vagabond.clocks.reset('ritual');    // clock → full
```

---

## Notes

- **Hide vs delete:** hiding (overlay context menu) sets `flags.vagabond.progressClock.hidden = true` — removes from *everyone's* canvas, keeps journal in sidebar. Restore = drag journal from sidebar onto canvas (GM/OWNER only).
- **Per-user visibility:** independent of `hidden`, set by `ownership`. `default: 0` = GM-only; `default: 2` (OBSERVER) lets players watch.
- **Handles use underscores**, never hyphens (`-` parses as subtraction in roll formulas). Auto-slugged from name if omitted.
- **Writes are GM-only** (`_assertGM`). Player macros can `read`/`value` but not `set`/`tick`.
- **Native rations:** the Party Sheet already aggregates `system.isSupply` (rations) and `system.isBeverage` (water) × quantity across members — Example 1's clock is only an optional canvas mirror.
