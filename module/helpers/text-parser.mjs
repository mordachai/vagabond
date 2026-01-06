/**
 * Text Parser - Centralized utility for parsing special text patterns
 * Handles countdown dice triggers and other special formatting
 */
export class VagabondTextParser {
  /**
   * Parse countdown dice patterns in text
   * Converts "Cdx" or "cdx" patterns to clickable spans for countdown dice creation
   *
   * Examples:
   * - "Cd6" → clickable span that creates a d6 countdown dice
   * - "This spell lasts Cd8 rounds" → "This spell lasts [clickable Cd8] rounds"
   *
   * @param {string} text - The text to parse
   * @returns {string} Text with countdown dice patterns converted to clickable spans
   */
  static parseCountdownDice(text) {
    if (!text) return '';

    // Replace countdown dice patterns with clickable spans
    // Matches: Cd4, Cd6, cd8, CD10, etc. (case-insensitive)
    const countdownPattern = /C(d\d+)/gi;

    const formattedText = text.replace(countdownPattern, (match, diceNotation) => {
      // Extract just the number (4, 6, 8, etc.)
      const diceSize = diceNotation.match(/\d+/)[0];

      // Return clickable span with data attributes for the handler
      // match is the full match "Cd6", "CD4", etc.
      return `<span class="countdown-dice-trigger" data-action="createCountdownFromRecharge" data-dice-size="${diceSize}">${match}</span>`;
    });

    return formattedText;
  }

  /**
   * Parse dice roll patterns in text (excluding countdown dice)
   * Converts dice notation like "d4", "2d6", "3d8+2" to roll links "[[/r 2d6]]"
   * Excludes patterns preceded by 'C' or 'c' (countdown dice)
   *
   * @param {string} text - The text to parse
   * @returns {string} Text with dice notation converted to roll links
   */
  static parseDiceRolls(text) {
    if (!text) return '';

    // Check if already contains roll links
    if (text.includes('[[/r')) return text;

    // Skip if this is a countdown dice pattern
    const countdownPattern = /^Cd(\d+)$/i;
    if (countdownPattern.test(text.trim())) {
      return text;
    }

    // Match dice patterns like: d4, d6, 2d8, 3d6+2, etc.
    // Uses negative lookbehind to exclude patterns preceded by 'C' or 'c'
    const dicePattern = /(?<![Cc])(\d*)d(\d+)(?:\+\d+)?/gi;

    const formattedText = text.replace(dicePattern, (match) => {
      // Skip if this is inside a span tag (already processed as countdown dice)
      if (match.includes('span')) return match;
      return `[[/r ${match}]]`;
    });

    return formattedText;
  }

  /**
   * Parse both countdown dice and regular dice rolls in text
   * Applies countdown dice parsing first, then dice roll parsing
   *
   * @param {string} text - The text to parse
   * @returns {string} Fully formatted text with both patterns converted
   */
  static parseAll(text) {
    if (!text) return '';

    // First parse countdown dice (these take priority)
    let formatted = this.parseCountdownDice(text);

    // Then parse regular dice rolls
    formatted = this.parseDiceRolls(formatted);

    return formatted;
  }
}
