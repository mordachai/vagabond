import { CurrencyHelper } from './currency-helper.mjs';

/**
 * Live values in item names: `{token}` in an item's stored name is replaced when the
 * item is prepared (`VagabondItem#prepareData`), so every place that shows `item.name`
 * (sheet, inventory, HUD, chat) sees the current value. The stored name keeps the token
 * (`item._source.name`; the item sheet edits that one), so translations keep it too.
 *
 * `Materials ({value})` → `Materials (2g 50s)`. Unknown tokens stay as typed.
 * Modules/macros add their own with {@link ItemNameTokens.register}.
 */
export class ItemNameTokens {
  static #PATTERN = /\{(\w+)\}/g;

  /** token → (item) => string|number|null (null = leave the token as typed) */
  static #tokens = {
    // Materials bundle: its spendable worth; any other item: its cost
    value: (item) => {
      const cm = item.system?.craftMaterial;
      if (cm?.enabled) return CurrencyHelper.format(cm.value ?? 0);
      return item.system?.cost ? CurrencyHelper.format(CurrencyHelper.toCopper(item.system.cost)) : null;
    },
    cost: (item) => (item.system?.cost ? CurrencyHelper.format(CurrencyHelper.toCopper(item.system.cost)) : null),
    qty: (item) => item.system?.quantity ?? null,
    slots: (item) => item.system?.slots ?? null,
    uses: (item) => {
      const uses = item.system?.uses;
      return uses?.max > 0 ? `${uses.value}/${uses.max}` : null;
    },
  };

  /** Add (or replace) a `{key}` token. `fn(item)` returns the text, or null to leave it as typed. */
  static register(key, fn) {
    this.#tokens[key] = fn;
  }

  /** Does this (stored) name carry at least one token? */
  static has(name) {
    return typeof name === 'string' && /\{\w+\}/.test(name);
  }

  /**
   * Name shown for an item: stored name with its tokens filled in. A generic Materials
   * bundle without a token always shows its worth — stored name minus a trailing
   * "(1g)"-style note, plus ` (<value>)` — so no stored name ever has to be rewritten
   * (name-agnostic: translated names work).
   */
  static display(item) {
    const name = item?._source?.name;
    if (this.has(name)) return this.resolve(item, name);
    const cm = item?.system?.craftMaterial;
    if (cm?.enabled && (cm.key ?? '') === '' && typeof name === 'string') {
      return `${name.replace(/\s*\([^)]*\)\s*$/, '')} (${CurrencyHelper.format(cm.value ?? 0)})`;
    }
    return name;
  }

  /** The item's stored name with its tokens filled in. */
  static resolve(item, name = item?._source?.name) {
    if (!this.has(name)) return name;
    return name.replace(this.#PATTERN, (match, key) => {
      let value = null;
      try { value = this.#tokens[key]?.(item); } catch { value = null; }
      return (value === null || value === undefined) ? match : String(value);
    });
  }
}
