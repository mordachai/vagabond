# Spell Cast Dialog — Message API

The Vagabond spell cast dialog (`SpellCastDialog`, the SVG magic-circle overlay) has a
message area directly below the **Cast** button. Any module can push messages into it —
soft reminders, warnings, or hard blocks that stop the cast.

This is the supported integration point. Do **not** monkey-patch `_validate` or
`_prepareContext` — use the hook described here.

- Dialog: [`module/applications/spell-cast-dialog.mjs`](../module/applications/spell-cast-dialog.mjs)
- Template: [`templates/apps/spell-cast-dialog.hbs`](../templates/apps/spell-cast-dialog.hbs) (`.vsc-messages` region)
- Styles: [`src/scss/apps/_spell-cast-dialog.scss`](../src/scss/apps/_spell-cast-dialog.scss) (`.vsc-error`, `.vsc-message--*`)

## The hook

```js
Hooks.callAll('vagabond.spellCastMessages', dialog, messages, context);
```

Fired by `SpellCastDialog._buildMessages()` on **every render** of the dialog — i.e. on
open and after every state change (dice/range/mana bumps, delivery pick, Focus/Fx
toggle). Listen with `Hooks.on` and **mutate the `messages` array in place**.

### Arguments

| Arg | Type | Notes |
|-----|------|-------|
| `dialog` | `SpellCastDialog` | The live dialog instance. `dialog.actor` / `dialog.spell` are not public — read identity from `context` instead. |
| `messages` | `Array<Message>` | Mutable. Push your entries here. The built-in validation message (if any) is already in it. |
| `context` | `object` | Read-only snapshot — see below. |

### `context` snapshot

| Field | Type | Meaning |
|-------|------|---------|
| `actor` | `Actor` | The casting actor. |
| `spell` | `Item` | The spell being cast. |
| `state` | `object` | Cloned dialog state: `{ damageDice, deliveryType, deliveryIncrease, useFx, focusOn, previewActive, manaOverrideDelta }`. |
| `finalMana` | `number` | Total mana the cast will cost after all modifiers/overrides. |
| `costs` | `object` | Cost breakdown: `{ damageCost, fxCost, deliveryBaseCost, deliveryIncreaseCost, totalCost }`. |

### Message shape

```js
{
  text: string,                          // required, non-empty — shown verbatim
  type?: 'error' | 'warning' | 'info',   // default 'error'; controls colour only
  blocking?: boolean,                    // default false; true prevents casting
}
```

- Entries with a missing/empty `text` are dropped (a bad module can't break render).
- `type` only changes the pill colour:
  - `error` — damage-type accent (matches the built-in validation pill)
  - `warning` — amber
  - `info` — cyan
- `blocking: true` makes `_onCast` refuse to fire and re-render with the message shown.
  Use it for hard rule gates. Non-blocking messages are display-only.

The built-in mana/delivery validation message is always pushed first as
`{ type: 'error', blocking: true }`.

## Examples

### Soft reminder (does not block)

```js
Hooks.on('vagabond.spellCastMessages', (dialog, messages, { spell }) => {
  if (spell.name === 'Imbue') {
    messages.push({ text: 'Imbue benefits from Focus.', type: 'info' });
  }
});
```

### Hard block — Imbue requires Focus outside combat

```js
Hooks.on('vagabond.spellCastMessages', (dialog, messages, { actor, spell, state }) => {
  if (spell.name !== 'Imbue') return;
  const inCombat = game.combat?.started && game.combat.combatants.some(c => c.actorId === actor.id);
  if (!inCombat && !state.focusOn) {
    messages.push({
      text: `${actor.name}: Imbue requires Focus when cast outside of combat.`,
      type: 'warning',
      blocking: true,
    });
  }
});
```

While the condition holds the message shows and the Cast button does nothing. The moment
the player toggles Focus (or enters combat), the dialog re-renders, the hook re-runs, the
message clears, and casting is allowed — no further wiring needed.

### React to cost / loadout

```js
Hooks.on('vagabond.spellCastMessages', (dialog, messages, { finalMana, costs }) => {
  if (costs.fxCost > 0) messages.push({ text: '+1 mana for FX.', type: 'info' });
  if (finalMana >= 8)   messages.push({ text: 'High-cost cast.', type: 'warning' });
});
```

## Notes & gotchas

- **Mutate, don't return.** The hook is fired with `Hooks.callAll`; return values are
  ignored. Push into the `messages` array.
- **Runs on every render.** Keep listeners cheap and side-effect-free. Don't call
  `actor.update()` or `render()` from inside the hook — you'll cause render loops.
- **Order = push order.** The validation message is first; your messages follow in the
  order modules register/push.
- **Don't store the array.** It's rebuilt each render. Re-derive from `context` every time.
- **Throwing is contained.** Exceptions are caught and logged (`Vagabond | spellCastMessages hook failed`); a throwing module won't break the dialog, but its messages for that render are lost.
- **Identity check.** If multiple spell systems share the hook, gate on `spell.type`,
  `spell.system`, flags, or `spell.name` early and `return` to stay out of others' way.
