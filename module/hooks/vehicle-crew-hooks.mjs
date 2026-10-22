
/**
 * Vehicle crew: keep vehicle ownership in sync with the party.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerVehicleCrewHooks() {
  /* -------------------------------------------- */

  /**
   * Recalculate which non-GM users should have Owner permission on a party actor
   * based on who is currently assigned as crew across all vehicle parts.
   * Grants Owner to players whose character is crew, revokes from those who are not.
   * Only runs on the GM client.
   */
  async function syncVehicleCrewPermissions(partyActor) {
    if (!game.user.isGM) return;

    // Collect all crew actor UUIDs across every vehiclePart owned by this actor
    const allCrewUuids = new Set();
    for (const part of partyActor.items.filter(i => i.type === 'vehiclePart')) {
      for (const { uuid } of (part.system.crew ?? [])) {
        allCrewUuids.add(uuid);
      }
    }

    // Resolve each UUID → find the non-GM user whose character matches
    const crewUserIds = new Set();
    for (const uuid of allCrewUuids) {
      try {
        const actor = await fromUuid(uuid);
        if (!actor) continue;
        const user = game.users.find(u => !u.isGM && u.character?.id === actor.id);
        if (user) crewUserIds.add(user.id);
      } catch { /* UUID no longer valid — skip */ }
    }

    const ownerLevel = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
    const noneLevel  = CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE;
    const current    = partyActor.ownership ?? {};
    const updates    = {};

    // Grant Owner to current crew users who don't already have it
    for (const userId of crewUserIds) {
      if (current[userId] !== ownerLevel) updates[userId] = ownerLevel;
    }

    // Revoke Owner from non-GM users no longer in the crew
    for (const [userId, level] of Object.entries(current)) {
      if (userId === 'default') continue;
      const user = game.users.get(userId);
      if (!user || user.isGM) continue;
      if (level === ownerLevel && !crewUserIds.has(userId)) updates[userId] = noneLevel;
    }

    if (Object.keys(updates).length > 0) await partyActor.updateOwnership(updates);
  }

  function _getPartyParent(item) {
    const parent = item.parent;
    return parent?.type === 'party' ? parent : null;
  }

  Hooks.on('createItem', (item) => {
    if (item.type !== 'vehiclePart') return;
    const party = _getPartyParent(item);
    if (party) syncVehicleCrewPermissions(party);
  });

  Hooks.on('updateItem', (item) => {
    if (item.type !== 'vehiclePart') return;
    const party = _getPartyParent(item);
    if (party) syncVehicleCrewPermissions(party);
  });

  Hooks.on('deleteItem', (item) => {
    if (item.type !== 'vehiclePart') return;
    const party = _getPartyParent(item);
    if (party) syncVehicleCrewPermissions(party);
  });
}
