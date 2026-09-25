/**
 * Currency math — the single choke point for all g/s/c arithmetic (shop, party
 * treasury transfers, future loot). RAW: 1g = 100s, 1s = 10c — the same
 * conversion `VagabondEquipment._applyCostMultiplier` uses.
 *
 * A "wallet" is a plain `{ gold, silver, copper }` object (e.g. `actor.system.currency`).
 * Every method returns NEW objects; nothing mutates its input.
 */
export class CurrencyHelper {
  /** Copper value of one coin of each denomination. */
  static RATES = Object.freeze({ gold: 1000, silver: 10, copper: 1 });

  /** Denominations, largest first. */
  static DENOMINATIONS = Object.freeze(['gold', 'silver', 'copper']);

  /** i18n keys for each denomination's abbreviation (never hardcode g/s/c). */
  static ABBR_KEYS = Object.freeze({
    gold: 'VAGABOND.Currency.Gold.abbr',
    silver: 'VAGABOND.Currency.Silver.abbr',
    copper: 'VAGABOND.Currency.Copper.abbr',
  });

  /**
   * Normalize anything wallet-like into `{ gold, silver, copper }` non-negative integers.
   * @param {object} [wallet]
   * @returns {{gold:number, silver:number, copper:number}}
   */
  static normalize(wallet) {
    const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
    return { gold: n(wallet?.gold), silver: n(wallet?.silver), copper: n(wallet?.copper) };
  }

  /**
   * The wallet an actor carries (`system.currency`), or null if its type has none.
   * @param {Actor} actor
   */
  static walletOf(actor) {
    const c = actor?.system?.currency;
    return c ? this.normalize(c) : null;
  }

  /**
   * Total value of a wallet in copper.
   * @param {object} wallet
   * @returns {number}
   */
  static toCopper(wallet) {
    const w = this.normalize(wallet);
    return w.gold * this.RATES.gold + w.silver * this.RATES.silver + w.copper;
  }

  /**
   * Split a copper amount into the largest coins.
   * @param {number} copper
   * @returns {{gold:number, silver:number, copper:number}}
   */
  static fromCopper(copper) {
    let rest = Math.max(0, Math.floor(Number(copper) || 0));
    const gold = Math.floor(rest / this.RATES.gold); rest -= gold * this.RATES.gold;
    const silver = Math.floor(rest / this.RATES.silver); rest -= silver * this.RATES.silver;
    return { gold, silver, copper: rest };
  }

  /**
   * Human-readable price, e.g. "1g 5s 3c". Zero → "0c".
   * @param {number|object} value  copper amount or a wallet
   * @returns {string}
   */
  static format(value) {
    const w = typeof value === 'number' ? this.fromCopper(value) : this.normalize(value);
    const parts = [];
    for (const d of this.DENOMINATIONS) {
      if (w[d] > 0) parts.push(`${w[d]}${game.i18n.localize(this.ABBR_KEYS[d])}`);
    }
    return parts.length ? parts.join(' ') : `0${game.i18n.localize(this.ABBR_KEYS.copper)}`;
  }

  /**
   * Whether a wallet holds at least `copper` in total value.
   * @param {object} wallet
   * @param {number} copper
   */
  static canAfford(wallet, copper) {
    return this.toCopper(wallet) >= Math.max(0, Math.floor(copper));
  }

  /**
   * Pay `cost` copper out of a wallet, making change automatically.
   * Spends the smallest coins first and breaks a larger coin only when the smaller
   * ones run out; change from a broken coin comes back in the largest coins below it.
   * Coins that weren't touched are left as they are (no consolidation).
   * @param {object} wallet
   * @param {number} cost  copper
   * @returns {{gold:number, silver:number, copper:number}|null}  new wallet, or null if short
   */
  static pay(wallet, cost) {
    const w = this.normalize(wallet);
    let remaining = Math.max(0, Math.floor(Number(cost) || 0));
    if (this.toCopper(w) < remaining) return null;

    let change = 0;
    for (const d of ['copper', 'silver', 'gold']) {
      if (remaining <= 0) break;
      const rate = this.RATES[d];
      const coins = Math.min(w[d], Math.ceil(remaining / rate));
      w[d] -= coins;
      const paid = coins * rate;
      if (paid > remaining) change += paid - remaining;
      remaining = Math.max(0, remaining - paid);
    }
    return change > 0 ? this.add(w, change) : w;
  }

  /**
   * Add copper to a wallet, as the largest coins of that amount.
   * @param {object} wallet
   * @param {number} copper
   * @returns {{gold:number, silver:number, copper:number}}
   */
  static add(wallet, copper) {
    const w = this.normalize(wallet);
    const inc = this.fromCopper(copper);
    return { gold: w.gold + inc.gold, silver: w.silver + inc.silver, copper: w.copper + inc.copper };
  }

  /** Alias of {@link add} — receiving money into a wallet. */
  static receive(wallet, copper) {
    return this.add(wallet, copper);
  }
}
