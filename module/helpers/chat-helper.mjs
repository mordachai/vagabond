/**
 * Helper class for posting rolls and messages to chat
 */
export class VagabondChatHelper {
  /**
   * Version-safe roll/message mode read.
   * v14 deprecates `core.rollMode` in favor of `core.messageMode`
   * (removed in v16). v13 only has `core.rollMode`.
   * @returns {string} The current roll/message mode
   */
  static getRollMode() {
    if (game.settings.settings.has('core.messageMode')) {
      return game.settings.get('core', 'messageMode');
    }
    return game.settings.get('core', 'rollMode');
  }

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
      rollMode: VagabondChatHelper.getRollMode(),
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
