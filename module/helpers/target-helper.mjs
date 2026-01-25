/**
 * Helper class for managing target capture and resolution
 * Consolidates repeated target handling patterns across the system
 */
export class TargetHelper {
  /**
   * Captures current user targets as serializable data
   * @returns {Array<Object>} Array of target data objects
   */
  static captureCurrentTargets() {
    return Array.from(game.user.targets).map((token) => ({
      tokenId: token.id,
      sceneId: token.scene.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.document.texture.src,
    }));
  }

  /**
   * Resolves stored target data back to token references
   * @param {Array<Object>} targets - Stored target data
   * @returns {Array<Token>} Array of resolved tokens
   */
  static resolveTargets(targets) {
    if (!targets || !Array.isArray(targets)) {
      return [];
    }

    const resolvedTargets = [];

    for (const targetData of targets) {
      // Find the scene
      const scene = game.scenes.get(targetData.sceneId);
      if (!scene) {
        console.warn(`TargetHelper: Scene ${targetData.sceneId} not found for target ${targetData.tokenId}`);
        continue;
      }

      // Find the token in the scene
      const token = scene.tokens.get(targetData.tokenId);
      if (!token) {
        console.warn(`TargetHelper: Token ${targetData.tokenId} not found in scene ${targetData.sceneId}`);
        continue;
      }

      // Get the token object (for canvas operations)
      const tokenObject = token.object;
      if (tokenObject) {
        resolvedTargets.push(tokenObject);
      }
    }

    return resolvedTargets;
  }

  /**
   * Validates if targets are still valid (exist and are accessible)
   * @param {Array<Object>} targets - Stored target data
   * @returns {Object} Validation result with valid/invalid targets
   */
  static validateTargets(targets) {
    if (!targets || !Array.isArray(targets)) {
      return { valid: [], invalid: [], warnings: [] };
    }

    const valid = [];
    const invalid = [];
    const warnings = [];

    for (const targetData of targets) {
      // Check if scene exists
      const scene = game.scenes.get(targetData.sceneId);
      if (!scene) {
        invalid.push(targetData);
        warnings.push(`Scene ${targetData.sceneId} no longer exists`);
        continue;
      }

      // Check if token exists in scene
      const token = scene.tokens.get(targetData.tokenId);
      if (!token) {
        invalid.push(targetData);
        warnings.push(`Token ${targetData.actorName} no longer exists in scene`);
        continue;
      }

      // Check if we're in a different scene
      if (scene.id !== game.scenes.current?.id) {
        warnings.push(`Target ${targetData.actorName} is in a different scene`);
      }

      valid.push(targetData);
    }

    return { valid, invalid, warnings };
  }

  /**
   * Gets display names for targets (for UI purposes)
   * @param {Array<Object>} targets - Stored target data
   * @returns {Array<string>} Array of display names
   */
  static getTargetNames(targets) {
    if (!targets || !Array.isArray(targets)) {
      return [];
    }

    return targets.map(target => target.actorName || 'Unknown Target');
  }

  /**
   * Checks if any targets are in different scenes than current
   * @param {Array<Object>} targets - Stored target data
   * @returns {boolean} True if cross-scene targets exist
   */
  static hasCrossSceneTargets(targets) {
    if (!targets || !Array.isArray(targets) || !game.scenes.current) {
      return false;
    }

    return targets.some(target => target.sceneId !== game.scenes.current.id);
  }
}