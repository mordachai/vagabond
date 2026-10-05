/**
 * Currency math — the single choke point for all g/s/c arithmetic (shop, party
 * treasury transfers, rest lodging, char builder budgets, crafting). The ONLY place
 * the exchange ratio lives is `RATES` below — the book's Silver Standard
 * (1g = 100s, 1s = 100c, so 1g = 10,000c). Never write `gold * 100`, `/ 100`, etc.
 * anywhere else — call toCopper/toSilver/fromCopper or read `RATES`.
 *
 * A "wallet" is a plain `{ gold, silver, copper }` object (e.g. `actor.system.currency`).
 * Every method returns NEW objects; nothing mutates its input.
 */
export class CurrencyHelper {
  /** Copper value of one coin of each denomination. */
  static RATES = Object.freeze({ gold: 10000, silver: 100, copper: 1 });

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
   * Total value of a wallet in silver (may be fractional — copper is a hundredth of silver).
   * For silver-denominated budgets (char builder, wealth readouts); never hand-roll this.
   * @param {object} wallet
   * @returns {number}
   */
  static toSilver(wallet) {
    return this.toCopper(wallet) / this.RATES.silver;
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

  /**
   * Trade a wallet up: exchange coins into the largest denominations of the same total
   * (copper → silver → gold). Total value is unchanged.
   * @param {object} wallet
   * @returns {{gold:number, silver:number, copper:number}}
   */
  static consolidate(wallet) {
    return this.fromCopper(this.toCopper(wallet));
  }

  /** Alias of {@link add} — receiving money into a wallet. */
  static receive(wallet, copper) {
    return this.add(wallet, copper);
  }

  /**
   * One-time migration: copper amounts persisted before the ratio was corrected from
   * 1s = 10c to the book's 1s = 100c are ×10 too small. Wallets / cost objects are
   * per-denomination and unaffected; only stored raw-copper numbers need rescaling:
   * `craftMaterial.value`, craftProject `value/progress/materialsPaid/power.value`,
   * `relic.powers[].value`, shop `priceOverride`, and the `craftingConfig.valuePerShift`
   * world setting. Idempotent via the hidden `copperScaleMigrated` world setting.
   */
  static async migrateCopperScale() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'copperScaleMigrated')) return;

    const F = 10;
    const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };
    const candidates = [
      ...game.items,
      ...game.actors.contents.flatMap(safeItems),
      ...game.scenes.contents.flatMap((s) => s.tokens.contents.filter((t) => !t.actorLink && t.actor)
        .flatMap((t) => safeItems(t.actor))),
    ];

    for (const item of candidates) {
      try {
        const update = {};
        const cm = item.system?.craftMaterial;
        if (cm?.enabled && cm.value > 0) update['system.craftMaterial.value'] = cm.value * F;

        const powers = item.system?.relic?.powers;
        if (powers?.some((p) => p?.value > 0)) {
          update['system.relic.powers'] = powers.map((p) => (p?.value > 0 ? { ...p, value: p.value * F } : p));
        }

        const proj = item.flags?.vagabond?.craftProject;
        if (proj) {
          for (const k of ['value', 'progress', 'materialsPaid']) {
            if (proj[k] > 0) update[`flags.vagabond.craftProject.${k}`] = proj[k] * F;
          }
          if (proj.power?.value > 0) update['flags.vagabond.craftProject.power.value'] = proj.power.value * F;
        }

        const po = item.flags?.vagabond?.shop?.priceOverride;
        if (Number.isFinite(po) && po > 0) update['flags.vagabond.shop.priceOverride'] = po * F;

        if (Object.keys(update).length) await item.update(update);
      } catch (err) {
        console.warn(`vagabond | migrateCopperScale: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }

    // Stored GM overrides of the Value-per-Shift table (defaults already use RATES).
    try {
      const stored = game.settings.get('vagabond', 'craftingConfig');
      const table = stored?.general?.valuePerShift;
      if (table && Object.keys(table).length) {
        const scaled = Object.fromEntries(Object.entries(table).map(([k, v]) => [k, (Number(v) || 0) * F]));
        await game.settings.set('vagabond', 'craftingConfig',
          foundry.utils.mergeObject(stored, { general: { valuePerShift: scaled } }, { inplace: false }));
      }
    } catch (err) {
      console.warn('vagabond | migrateCopperScale: craftingConfig skipped', err);
    }

    await game.settings.set('vagabond', 'copperScaleMigrated', true);
  }
}
