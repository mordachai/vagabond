import { VagabondChatCard } from './chat-card.mjs';

/**
 * Canvas Loot integration: re-skins its drop / throw / pickup / place chat messages as Vagabond
 * cards through the `canvas-loot.preChatMessage` hook. Optional module — the listener is inert
 * when Canvas Loot is absent. The hook is NOT awaited, so the card is rendered synchronously
 * from a template compiled ahead of time.
 */

const CARD_TEMPLATE = 'systems/vagabond/templates/chat/chat-card.hbs';
const FLAG_SCOPE = 'canvas-loot';

const EVENTS = {
  place: { icon: 'fa-solid fa-location-dot', key: 'Placed' },
  drop: { icon: 'fa-solid fa-hand-holding', key: 'Dropped' },
  throw: { icon: 'fa-solid fa-person-running', key: 'Threw' },
  pickup: { icon: 'fa-solid fa-hand-back-fist', key: 'PickedUp' }
};

let compiledCard = null;

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ''));

function onPreChatMessage(messageData) {
  if (!compiledCard) return; // template not ready yet: leave Canvas Loot's own card
  const flags = messageData?.flags?.[FLAG_SCOPE];
  const meta = EVENTS[flags?.event];
  if (!meta || !flags.item) return;

  const { actorName, item, tileUuid } = flags;
  const verb = game.i18n.localize(`VAGABOND.CanvasLoot.${meta.key}`);
  const qty = Number(item.quantity) > 1 ? ` ×${Number(item.quantity)}` : '';
  const distance = (flags.event === 'throw' && flags.distance != null)
    ? ` ${esc(`${flags.distance} ${flags.units ?? ''}`.trim())}`
    : '';

  const card = new VagabondChatCard()
    .setType('generic')
    .setTitle(`${item.name}${qty}`)
    .setDescription(`<p><strong>${esc(actorName)}</strong> ${esc(verb)} <strong>${esc(item.name)}</strong>${distance}</p>`);
  card.data.icon = item.img;
  card.data.standardTags = [{ icon: meta.icon, label: verb, title: verb }];
  // Bare marker: Canvas Loot pans to and pings the loot when this element is clicked.
  if (tileUuid) {
    card.data.standardTags.push({
      icon: 'fa-solid fa-location-crosshairs',
      label: game.i18n.localize('VAGABOND.CanvasLoot.Show'),
      title: game.i18n.localize('VAGABOND.CanvasLoot.ShowTooltip'),
      extraAttributes: 'data-canvas-loot-show style="cursor: pointer;"'
    });
  }

  messageData.content = card.renderSync(compiledCard);
}

export function registerCanvasLootChat() {
  Hooks.on('canvas-loot.preChatMessage', onPreChatMessage);
  Hooks.once('ready', () => {
    foundry.applications.handlebars.getTemplate(CARD_TEMPLATE)
      .then((fn) => { compiledCard = fn; })
      .catch((err) => console.warn('Vagabond | Canvas Loot card template failed to compile', err));
  });
}
