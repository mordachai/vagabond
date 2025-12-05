/**
 * Helper class for posting rolls and messages to chat
 */
export class VagabondChatHelper {
  /**
   * Post a roll to chat
   * @param {VagabondActor} actor - The actor making the roll
   * @param {Roll} roll - The Roll object to post
   * @param {string} flavor - Flavor text for the roll
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async postRoll(actor, roll, flavor) {
    return roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavor,
      rollMode: game.settings.get('core', 'rollMode'),
    });
  }

  /**
   * Post a message to chat (for non-roll content like spell descriptions)
   * @param {VagabondActor} actor - The actor posting the message
   * @param {string} content - HTML content for the message
   * @returns {Promise<ChatMessage>} The created chat message
   */
  static async postMessage(actor, content) {
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: content,
      style: CONST.CHAT_MESSAGE_STYLES.OTHER,
    });
  }
}
