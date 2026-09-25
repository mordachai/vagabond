import { CurrencyHelper } from './currency-helper.mjs';

/**
 * Shop pricing pipeline — the single place a shop price is computed.
 *
 * Buy:  base (item cost, or material-swapped cost) → shop markup → per-item override
 *       → sale → relationship → Presence → haggle → round to copper (min 1c unless base 0).
 * Sell: base × shop buyRatio → relationship (inverse) → haggle → round down.
 *
 * Mutable hook `vagabond.preShopPrice(item, ctx, result)` fires before rounding;
 * `result.breakdown` feeds the price tooltip.
 */
export class ShopPricing {
  /**
   * Per-item shop flags (`flags.vagabond.shop`) of an Item or item data.
   * @param {Item|object} item
   * @returns {object}
   */
  static itemFlags(item) {
    return item?.flags?.vagabond?.shop ?? {};
  }

  /**
   * Base value of one unit, in copper. Materials swap the cost multiplier via
   * `CONFIG.VAGABOND.metalData` (relics and containers ignore materials).
   * @param {Item} item
   * @param {string|null} [material]
   * @returns {number}
   */
  static baseCopper(item, material = null) {
    const sys = item?.system ?? {};
    const materialApplies = material && item?.type === 'equipment' && sys.equipmentType !== 'relic'
      && material !== sys.metal;
    if (materialApplies) {
      const multiplier = CONFIG.VAGABOND.metalData?.[material]?.multiplier ?? 1;
      const EquipmentModel = CONFIG.Item.dataModels.equipment;
      return CurrencyHelper.toCopper(EquipmentModel._applyCostMultiplier(CurrencyHelper.normalize(sys.baseCost), multiplier));
    }
    return CurrencyHelper.toCopper(sys.cost ?? sys.baseCost);
  }

  /**
   * @param {Item} item
   * @param {object} [ctx]
   * @param {Actor|null} [ctx.shop]      the shop actor
   * @param {Actor|null} [ctx.buyer]     the trading character (buyer or seller)
   * @param {'buy'|'sell'} [ctx.mode]
   * @param {string|null} [ctx.material] material key for a Smithy swap (buy only)
   * @param {number} [ctx.haggle]        haggle % in the trader's favor
   * @param {number} [ctx.qty]
   * @returns {{unit:number, copper:number, qty:number, breakdown:Array<{key:string,label:string,pct?:number,copper:number}>}}
   */
  static price(item, ctx = {}) {
    const { shop = null, buyer = null, mode = 'buy', material = null, haggle = 0 } = ctx;
    const qty = Math.max(1, Math.floor(ctx.qty ?? 1));
    const sys = shop?.system ?? null;
    const flags = this.itemFlags(item);
    const breakdown = [];

    const base = this.baseCopper(item, mode === 'buy' ? material : null);
    let value = base;
    breakdown.push({ key: 'base', label: 'VAGABOND.Shop.Price.Base', copper: value });

    const applyPct = (key, label, pct) => {
      if (!pct) return;
      value = Math.max(0, value * (1 + pct / 100));
      breakdown.push({ key, label, pct, copper: value });
    };

    const relationPct = (sys && buyer) ? sys.relationPct(sys.relationshipOf(buyer)) : 0;

    if (mode === 'buy') {
      applyPct('markup', 'VAGABOND.Shop.Price.Markup', sys?.pricing?.markup ?? 0);
      if (Number.isFinite(flags.priceOverride) && flags.priceOverride >= 0) {
        value = flags.priceOverride;
        breakdown.push({ key: 'override', label: 'VAGABOND.Shop.Price.Override', copper: value });
      }
      if (flags.onSale) applyPct('sale', 'VAGABOND.Shop.Price.Sale', -(sys?.pricing?.saleDiscount ?? 0));
      applyPct('relationship', 'VAGABOND.Shop.Price.Relationship', relationPct);
      if (sys?.pricing?.presenceEnabled && buyer) {
        const stat = buyer.system?.stats?.[sys.pricing.presenceStat];
        const points = Math.max(0, stat?.total ?? stat?.value ?? 0);
        // Presence discount capped at 90% so an item is never free by Presence alone
        applyPct('presence', 'VAGABOND.Shop.Price.Presence', -Math.min(90, points * sys.pricing.presencePctPerPoint));
      }
      applyPct('haggle', 'VAGABOND.Shop.Price.Haggle', -haggle);
    } else {
      const ratio = sys?.pricing?.buyRatio ?? 0.5;
      value *= ratio;
      breakdown.push({ key: 'buyRatio', label: 'VAGABOND.Shop.Price.BuyRatio', pct: Math.round(ratio * 100), copper: value });
      // A disliked seller gets paid less, a liked one more (inverse of the buy adjustment)
      applyPct('relationship', 'VAGABOND.Shop.Price.Relationship', -relationPct);
      applyPct('haggle', 'VAGABOND.Shop.Price.Haggle', haggle);
    }

    const result = { unit: value, copper: 0, qty, breakdown };
    Hooks.callAll('vagabond.preShopPrice', item, { ...ctx, qty }, result);

    let unit = Math.max(0, Number(result.unit) || 0);
    unit = mode === 'buy' ? Math.round(unit) : Math.floor(unit);
    // Never free by rounding/discounts — only a 0 base cost or an explicit 0 override is free
    const overridden = breakdown.some(b => b.key === 'override');
    if (mode === 'buy' && (overridden ? flags.priceOverride > 0 : base > 0)) unit = Math.max(1, unit);
    result.unit = unit;
    result.copper = unit * qty;
    return result;
  }
}
