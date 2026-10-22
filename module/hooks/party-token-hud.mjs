
/**
 * Token HUD: Gather / Release buttons on party tokens.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerPartyTokenHudHooks() {

  /* -------------------------------------------- */
  /* Token HUD — Party Gather / Release           */
  /* -------------------------------------------- */

  /**
   * Compute spread positions for released party members.
   * Returns {x, y} pixel offsets relative to the party token, radiating outward ring by ring.
   */
  function _partyReleaseOffsets(count, gridSize) {
    const offsets = [];
    for (let ring = 1; offsets.length < count; ring++) {
      for (let dx = -ring; dx <= ring && offsets.length < count; dx++) {
        for (let dy = -ring; dy <= ring && offsets.length < count; dy++) {
          if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
            offsets.push({ x: dx * gridSize, y: dy * gridSize });
          }
        }
      }
    }
    return offsets;
  }

  async function _gatherParty(token, actor) {
    const members = actor.system.members ?? [];
    if (!members.length) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Actor.Party.TokenHUD.NoMembers'));
      return false;
    }

    const { x: px, y: py } = token.document;

    // Collect all member tokens currently on the scene
    const memberTokens = [];
    const gatheredUuids = [];
    for (const memberUuid of members) {
      const memberActor = await fromUuid(memberUuid);
      if (!memberActor) continue;
      for (const mt of canvas.tokens.placeables.filter(t => t.document.actorId === memberActor.id)) {
        memberTokens.push(mt);
        gatheredUuids.push(memberUuid);
      }
    }

    if (!memberTokens.length) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Actor.Party.TokenHUD.NoTokens'));
      return false;
    }

    // Warn about unlinked tokens before any movement — their delta data (HP, conditions, etc.)
    // will be preserved via the saved token snapshot, but the user should know.
    const unlinkedNames = memberTokens.filter(mt => !mt.document.actorLink).map(mt => mt.name);
    if (unlinkedNames.length) {
      ui.notifications.warn(game.i18n.format('VAGABOND.Actor.Party.TokenHUD.UnlinkedWarning', { names: unlinkedNames.join(', ') }));
    }

    // Snapshot the full token document data (including delta for unlinked tokens)
    // so Release can recreate exact copies, not fresh prototypes.
    const savedTokenData = memberTokens.map(mt => {
      const { _id, ...data } = mt.document.toObject();
      return data;
    });

    // Move all tokens to the party token (triggers the animation)
    await Promise.all(memberTokens.map(mt => mt.document.update({ x: px, y: py })));

    // Wait for the movement animation to finish before deleting
    await new Promise(resolve => setTimeout(resolve, 700));

    // Delete the tokens from the scene
    await canvas.scene.deleteEmbeddedDocuments('Token', memberTokens.map(mt => mt.id));

    // Store full snapshots so Release recreates the exact same tokens
    await actor.setFlag('vagabond', 'gatheredTokenData', savedTokenData);
    await actor.setFlag('vagabond', 'partyGathered', true);

    ui.notifications.info(game.i18n.format('VAGABOND.Actor.Party.TokenHUD.GatherDone', { count: memberTokens.length }));
    return true;
  }

  async function _releaseParty(token, actor) {
    const savedTokenData = actor.getFlag('vagabond', 'gatheredTokenData') ?? [];
    if (!savedTokenData.length) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Actor.Party.TokenHUD.NoMembers'));
      return false;
    }

    const { x: px, y: py } = token.document;
    const gridSize = canvas.grid.size;
    const offsets = _partyReleaseOffsets(savedTokenData.length, gridSize);

    // Recreate each token from its full snapshot, placed at a spread position.
    // This restores everything — including delta data for unlinked tokens.
    const tokenDataArray = savedTokenData.map((data, i) => {
      const off = offsets[i] ?? { x: 0, y: 0 };
      return { ...data, x: px + off.x, y: py + off.y };
    });

    await canvas.scene.createEmbeddedDocuments('Token', tokenDataArray);

    await actor.unsetFlag('vagabond', 'gatheredTokenData');
    await actor.setFlag('vagabond', 'partyGathered', false);

    ui.notifications.info(game.i18n.localize('VAGABOND.Actor.Party.TokenHUD.ReleaseDone'));
    return true;
  }

  Hooks.on('renderTokenHUD', (hud, html) => {
    // In Foundry v13, TokenHUD is ApplicationV2: token is hud.object (not hud.token)
    const token = hud.object;
    if (token?.actor?.type !== 'party') return;

    const leftCol = html.querySelector('.col.left');
    if (!leftCol) return;

    const actor = token.actor;
    const isGathered = actor.getFlag('vagabond', 'partyGathered') ?? false;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.classList.add('control-icon', 'vagabond-party-gather-toggle');
    if (isGathered) btn.classList.add('active');
    btn.setAttribute('data-tooltip', game.i18n.localize(
      isGathered ? 'VAGABOND.Actor.Party.TokenHUD.ReleaseTooltip' : 'VAGABOND.Actor.Party.TokenHUD.GatherTooltip'
    ));
    btn.innerHTML = isGathered
      ? '<i class="fas fa-expand-arrows-alt"></i>'
      : '<i class="fas fa-compress-arrows-alt"></i>';

    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const gathered = actor.getFlag('vagabond', 'partyGathered') ?? false;
      const success = gathered ? await _releaseParty(token, actor) : await _gatherParty(token, actor);
      if (success) hud.render();
    });

    leftCol.appendChild(btn);
  });
}
