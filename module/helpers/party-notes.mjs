import { isActiveGM } from './gm-relay.mjs';

/**
 * Party Notes journals. ONE journal per Character (whatever party it is in) and ONE GM journal per party,
 * found by the journal's own flags (`flags.vagabond.isPartyNote / noteType / characterId / partyId`) — never by
 * a party flag, so a Character in two parties (or removed and re-added) keeps its journal. New note content goes
 * in as a page of that journal. Creation is deduplicated in flight: overlapping sheet renders used to create a
 * journal each.
 */
export class PartyNotes {
  static #pending = new Map();

  static #key(noteType, id) { return `${noteType}:${id}`; }

  static #matches(j, noteType, id) {
    const v = j.flags?.vagabond;
    if (!v?.isPartyNote || v.noteType !== noteType) return false;
    return noteType === 'gm' ? v.partyId === id : v.characterId === id;
  }

  /** Existing journal: `gm` keyed by party id, `personal` by Character id. */
  static find(noteType, id) {
    return game.journal.find(j => this.#matches(j, noteType, id)) ?? null;
  }

  /**
   * Ownership for a note journal / page. Personal = OWNER for the Character's owners; GM = NONE default.
   * Both the journal and its pages get it: the server checks the PAGE's own ownership on update.
   */
  static ownership(noteType, characterId) {
    const ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE };
    const actor = noteType === 'personal' ? game.actors.get(characterId) : null;
    if (actor) {
      for (const user of game.users) {
        if (actor.getUserLevel(user) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
          ownership[user.id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        }
      }
    }
    return ownership;
  }

  /** GM only: pages missing the Character owners' OWNER level get it (no-op when already right). */
  static async repairPageOwnership(journal, characterId) {
    const required = this.ownership('personal', characterId);
    for (const page of journal.pages) {
      const needsFix = Object.entries(required).some(
        ([uid, level]) => (page.ownership?.[uid] ?? page.ownership?.default ?? 0) < level
      );
      if (needsFix) await page.update({ ownership: { ...(page.ownership ?? {}), ...required } });
    }
  }

  /** Top-level "Party Notes" folder (stays out of the Vagabond System root: players open it often). */
  static async folder() {
    return game.folders.find(f => f.type === 'JournalEntry' && f.flags?.vagabond?.isPartyNotesFolder)
      ?? Folder.implementation.create({
        name: 'Party Notes', type: 'JournalEntry',
        flags: { vagabond: { isPartyNotesFolder: true } },
      });
  }

  /**
   * The note journal, created when missing (GM only; players get null until a GM made it).
   * @param {'gm'|'personal'} noteType
   * @param {Actor} party       The party actor (GM notes key + name)
   * @param {string|null} characterId
   */
  static async resolve(noteType, party, characterId = null) {
    const id = noteType === 'gm' ? party.id : characterId;
    const existing = this.find(noteType, id);
    if (existing) {
      if (game.user.isGM && noteType === 'personal') await this.repairPageOwnership(existing, characterId);
      return existing;
    }
    if (!game.user.isGM) return null;
    const key = this.#key(noteType, id);
    if (!this.#pending.has(key)) {
      this.#pending.set(key, this.#create(noteType, party, characterId).finally(() => this.#pending.delete(key)));
    }
    return this.#pending.get(key);
  }

  static async #create(noteType, party, characterId) {
    const ownership = this.ownership(noteType, characterId);
    const folder = await this.folder();
    const name = noteType === 'gm'
      ? `[GM] ${party.name} — Notes`
      : `[Personal] ${game.actors.get(characterId)?.name ?? characterId} — Notes`;
    return JournalEntry.implementation.create({
      name, ownership, folder: folder?.id ?? null,
      flags: { vagabond: {
        isPartyNote: true, noteType,
        partyId: noteType === 'gm' ? party.id : null,
        characterId: noteType === 'personal' ? characterId : null,
      } },
      pages: [{
        name: 'Notes', type: 'text', ownership: { ...ownership },
        text: { content: '', format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML },
      }],
    });
  }

  /* -------------------------------------------- */

  static #text(j) {
    return j.pages.contents.reduce((n, p) => n + (p.text?.content ?? '').trim().length, 0);
  }

  /**
   * Active GM, every load: duplicates of one note (same Character, or same party's GM notes) merge into one.
   * Keeper = the one with the most text (oldest on a tie); the others' non-empty pages are appended to the
   * same-named page (or added as pages), then deleted. Empty notes of deleted Characters / parties go too.
   * Old per-party `flags.vagabond.notes` pointers are dropped (lookup is by journal flag now).
   */
  static async cleanup() {
    if (!isActiveGM()) return;
    const groups = new Map();
    for (const j of game.journal) {
      const v = j.flags?.vagabond;
      if (!v?.isPartyNote) continue;
      const id = v.noteType === 'gm' ? v.partyId : v.characterId;
      if (!id) continue;
      const key = this.#key(v.noteType, id);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(j);
    }

    let merged = 0;
    for (const [key, list] of groups) {
      const [noteType, id] = key.split(':');
      const owner = game.actors.get(id);
      if (!owner) {
        const empty = list.filter(j => !this.#text(j)).map(j => j.id);
        if (empty.length) await JournalEntry.implementation.deleteDocuments(empty);
        continue;
      }
      if (list.length < 2) continue;
      list.sort((a, b) => (this.#text(b) - this.#text(a)) || ((a._stats?.createdTime ?? 0) - (b._stats?.createdTime ?? 0)));
      const [keeper, ...dupes] = list;
      for (const dupe of dupes) {
        for (const page of dupe.pages) {
          const content = (page.text?.content ?? '').trim();
          if (!content) continue;
          const target = keeper.pages.find(p => p.name === page.name && p.type === 'text');
          if (target) {
            const current = target.text?.content ?? '';
            if (!current.includes(content)) {
              await target.update({ 'text.content': current ? `${current}<hr>${content}` : content });
            }
          } else {
            await keeper.createEmbeddedDocuments('JournalEntryPage', [page.toObject()]);
          }
        }
      }
      await JournalEntry.implementation.deleteDocuments(dupes.map(j => j.id));
      merged += dupes.length;
    }

    for (const party of game.actors.filter(a => a.type === 'party' && a.flags?.vagabond?.notes)) {
      await party.unsetFlag('vagabond', 'notes');
    }
    if (merged) console.log(`vagabond | Party Notes: merged ${merged} duplicate journal(s)`);
  }

  static registerHooks() {
    Hooks.once('ready', () => { this.cleanup(); });
    // Title follows the actor's name (lookup is by id, the title is display only)
    Hooks.on('updateActor', (actor, changes) => {
      if (!('name' in changes) || !isActiveGM()) return;
      const journal = actor.type === 'party' ? this.find('gm', actor.id)
        : actor.type === 'character' ? this.find('personal', actor.id) : null;
      if (!journal) return;
      const name = actor.type === 'party' ? `[GM] ${actor.name} — Notes` : `[Personal] ${actor.name} — Notes`;
      if (journal.name !== name) journal.update({ name });
    });
  }
}
