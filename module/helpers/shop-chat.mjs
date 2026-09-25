import { VagabondChatCard } from './chat-card.mjs';
import { CurrencyHelper } from './currency-helper.mjs';

/**
 * Chat receipts for shop transactions. Posted by the active GM right after a
 * transaction's writes land (ShopTransactions handlers). Visibility follows the
 * world setting `shopChatMode`: `public`, `private` (GMs + the trading actor's
 * owners) or `off`.
 */
export class ShopChat {
  /**
   * @param {object} tx
   * @param {'buy'|'sell'|'partyTransfer'} tx.type
   * @param {Actor|null} tx.shop
   * @param {Actor} tx.actor      the trading character (or party, when it sells)
   * @param {Item} [tx.item]
   * @param {number} [tx.qty]
   * @param {number} tx.copper    price paid / received (party transfer: signed amount)
   * @param {Actor} [tx.party]    party treasury that paid (group cart) / received
   * @param {Array<{item: Item, qty: number, copper: number}>} [tx.lines]  cart lines (buy)
   */
  static async post(tx) {
    const mode = game.settings.get('vagabond', 'shopChatMode');
    if (mode === 'off') return null;
    const { type, shop, actor, item, qty, copper, party, lines } = tx;
    const L = (key, data) => game.i18n.format(`VAGABOND.Shop.Chat.${key}`, data);
    const esc = foundry.utils.escapeHTML;
    const price = CurrencyHelper.format(Math.abs(copper));

    const card = new VagabondChatCard().setType('generic').setActor(actor);
    if (type === 'partyTransfer') {
      const deposit = copper > 0;
      card.setTitle(L(deposit ? 'DepositTitle' : 'WithdrawTitle'))
        .setSubtitle(party?.name ?? '')
        .setDescription(`<p>${L(deposit ? 'Deposit' : 'Withdraw', {
          actor: `<strong>${esc(actor.name)}</strong>`, price: `<strong>${price}</strong>`, party: esc(party?.name ?? ''),
        })}</p>`);
    } else if (type === 'buy' && (lines?.length > 1 || party)) {
      // Cart receipt: one line per item, party purchases name the treasury
      const list = lines.map(l => `<li>${l.qty > 1 ? `${l.qty}× ` : ''}${esc(l.item?.name ?? '')}`
        + ` — ${CurrencyHelper.format(l.copper)}</li>`).join('');
      card.setTitle(L('BuyTitle'))
        .setSubtitle(shop?.name ?? '')
        .setDescription(`<p>${L(party ? 'BuyLinesParty' : 'BuyLines', {
          actor: `<strong>${esc(actor.name)}</strong>`, price: `<strong>${price}</strong>`, party: esc(party?.name ?? ''),
        })}</p><ul class="shop-receipt-lines">${list}</ul>`);
      card.data.standardTags = [
        { label: price, icon: 'fas fa-coins', cssClass: '' },
        ...(shop ? [{ label: shop.name, icon: 'fas fa-store', cssClass: '' }] : []),
      ];
      card.data.icon = lines.length === 1 ? (lines[0].item?.img ?? card.data.icon) : (shop?.img ?? card.data.icon);
    } else {
      const itemName = `<strong>${qty > 1 ? `${qty}× ` : ''}${esc(item?.name ?? '')}</strong>`;
      card.setItem(item)
        .setTitle(L(type === 'buy' ? 'BuyTitle' : 'SellTitle'))
        .setSubtitle(shop?.name ?? '')
        .setDescription(`<p>${L(type === 'buy' ? 'Buy' : 'Sell', {
          actor: `<strong>${esc(actor.name)}</strong>`, item: itemName, price: `<strong>${price}</strong>`,
        })}</p>`);
      card.data.standardTags = [
        { label: price, icon: 'fas fa-coins', cssClass: '' },
        ...(shop ? [{ label: shop.name, icon: 'fas fa-store', cssClass: '' }] : []),
      ];
      // The card icon is the item, not the actor portrait
      card.data.icon = item?.img ?? card.data.icon;
    }

    if (mode === 'private') {
      const gms = game.users.filter(u => u.isGM).map(u => u.id);
      const owners = game.users.filter(u => !u.isGM && actor.testUserPermission(u, 'OWNER')).map(u => u.id);
      card.data.whisper = [...new Set([...gms, ...owners])];
    }
    return card.send();
  }
}
