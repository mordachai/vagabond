import {
  ABSENT, syncFields, isPlainObject, isEntryArray, joinPath, isIgnored, canon, hashValue, keyFromUuid, leaves,
} from './pack-sync-core.mjs';
import { EffectChoices } from './effect-choices.mjs';

/**
 * Pack sync — bring world copies of compendium documents up to the installed packs WITHOUT undoing the GM's edits.
 *
 * For every copy linked to a system compendium (`_stats.compendiumSource`): Items directory, every actor's items,
 * unlinked tokens on every scene, container contents, and the statblock of Bestiary / Humanlike / Mount actors.
 * Each field (`pack-sync-core.mjs` leaves; arrays of objects entry by entry) is compared with the current pack and
 * with `assets/pack-history.json` (every value the field had in past packs, built by `npm run pack-history`):
 *   copy = pack                  → nothing
 *   copy = an OLD pack value     → untouched but outdated → updated
 *   copy = a value never shipped → the GM's edit → kept (reported only when the pack changed that field)
 * Per-copy state (quantity, equip, uses, coating…, `IGNORE`) is never touched. Pack effects / NPC items the copy
 * lacks are added only when they are newer than the copy (else the GM removed them, or an Effect Choice pick did).
 * Effects match by id, then `flags.vagabond.effectKey`, then name; their on/off switch is never touched.
 *
 * Runs after every system update (`runSystemMigrations`; updating = migrating, no opt-out, no back-compat) and from the
 * Settings Hub. The result is stored in `packSyncReport` and shown by `PackSyncReport` (by actor → section, links,
 * dismiss) so the GM can check what changed.
 */
export class PackSync {
  static HISTORY = 'systems/vagabond/assets/pack-history.json';

  /** Packs whose ACTOR fields (statblock) sync too; other Actor packs (Build Guides, Stores) sync items only. */
  static STATBLOCK_PACKS = new Set(['bestiary', 'humanlike', 'mounts-vehicles']);

  /** Report section order (actor → "menus"). */
  static SECTIONS = ['statblock', 'ancestry', 'class', 'perk', 'spell', 'weapon', 'armor', 'gear', 'alchemical', 'relic', 'container', 'other'];

  static #history = null;

  static async history() {
    if (!PackSync.#history) {
      const res = await fetch(PackSync.HISTORY);
      PackSync.#history = res.ok ? (await res.json()).docs ?? {} : {};
    }
    return PackSync.#history;
  }

  /**
   * Sync the world for real and store the report for the GM (new groups first; groups of an earlier report that
   * were not dismissed stay). Used after a system update and by the Settings Hub "Update now".
   * @returns {Promise<object>} the new report
   */
  static async runAndStore() {
    const report = await PackSync.run({ apply: true });
    const old = game.settings.get('vagabond', 'packSyncReport');
    const ids = new Set(report.groups.map(g => g.id));
    const groups = [...report.groups, ...(old?.groups ?? []).filter(g => !ids.has(g.id))];
    await game.settings.set('vagabond', 'packSyncReport', groups.length ? { ...report, groups } : {});
    return report;
  }

  /**
   * Sync the world.
   * @param {{apply?: boolean}} [opts]  apply=false: compute the report only, write nothing
   * @returns {Promise<object>} report `{version, date, dryRun, totals, groups}`
   */
  static async run({ apply = true } = {}) {
    const run = new SyncRun(await PackSync.history(), apply);
    await run.buildIndex();

    for (const item of game.items) {
      await run.syncItemDoc(item, run.group('items', { label: game.i18n.localize('VAGABOND.PackSync.ItemsDirectory'), icon: 'fa-solid fa-suitcase' }));
    }
    for (const actor of game.actors) {
      await run.syncActor(actor, run.group(`actor:${actor.uuid}`, { label: actor.name, img: actor.img, uuid: actor.uuid }));
    }
    for (const scene of game.scenes) {
      for (const token of scene.tokens) {
        if (token.actorLink || !token.actor) continue;
        const group = run.group(`token:${token.uuid}`, {
          label: token.name, img: token.texture?.src, uuid: token.actor.uuid, sub: scene.name,
        });
        await run.syncActor(token.actor, group, { token: true });
      }
    }
    return run.finish();
  }
}

/** One sync pass: merge state + report under construction. */
class SyncRun {
  constructor(history, apply) {
    this.H = history;
    this.apply = apply;
    this.groups = new Map();
    this.sources = new Map();
    this.totals = { updated: 0, kept: 0, added: 0, choices: 0 };
  }

  group(id, info) {
    if (!this.groups.has(id)) this.groups.set(id, { id, ...info, sections: {} });
    return this.groups.get(id);
  }

  async source(uuid) {
    if (!this.sources.has(uuid)) this.sources.set(uuid, await fromUuid(uuid).catch(() => null));
    return this.sources.get(uuid);
  }

  /** Pack source uuid of a copy, when it points at this system's compendiums. */
  static sourceOf(data) {
    const uuid = data?._stats?.compendiumSource ?? data?.flags?.core?.sourceId ?? null;
    return keyFromUuid(uuid, game.system.id) ? uuid : null;
  }

  /**
   * Index of the system's Item packs, for copies made without a source stamp (Character Builder starting gear,
   * Build Guide gear, older builder copies): by `_id` (the builder kept pack ids) and by a strict fingerprint
   * type + image + name (current pack name, so Babele-translated copies match too). Used only when unique.
   */
  async buildIndex() {
    this.byId = new Map();
    this.byPrint = new Map();
    for (const pack of game.packs) {
      if (pack.metadata.packageName !== game.system.id || pack.documentName !== 'Item') continue;
      const index = await pack.getIndex({ fields: ['img', 'type'] });
      for (const e of index) {
        const uuid = e.uuid ?? pack.getUuid(e._id);
        this.byId.set(e._id, { uuid, type: e.type });
        const print = `${e.type}|${e.img}|${canon(e.name)}`;
        this.byPrint.set(print, this.byPrint.has(print) ? null : uuid);
      }
    }
  }

  /** `{uuid, stamped}`: the copy's pack source; `stamped` false when found by the id / fingerprint fallback. */
  resolveSource(data) {
    const uuid = SyncRun.sourceOf(data);
    if (uuid) return { uuid, stamped: true };
    const byId = this.byId.get(data?._id);
    if (byId && byId.type === data.type) return { uuid: byId.uuid, stamped: false };
    const print = this.byPrint.get(`${data?.type}|${data?.img}|${canon(data?.name)}`);
    return print ? { uuid: print, stamped: false } : { uuid: null, stamped: true };
  }

  // ── documents ─────────────────────────────────────────────────────────────────────────────────────────────────

  /** A world / embedded Item linked to an Item of a pack. */
  async syncItemDoc(item, group, { packDoc = null } = {}) {
    const src = packDoc ? { uuid: null, stamped: true } : this.resolveSource(item._source);
    const pack = packDoc ?? (src.uuid ? await this.source(src.uuid) : null);
    if (pack?.documentName === 'Item') {
      const copy = item.toObject();
      const result = this.mergeItem(copy, pack.toObject(), keyFromUuid(pack.uuid, game.system.id), pack, item.uuid);
      // Found by the fallback: stamp the source so later syncs (and source-id lookups) find it directly
      if (!src.stamped) result.fields['_stats.compendiumSource'] = pack.uuid;
      if (this.apply) await this.#writeItem(item, copy, result);
      this.report(group, item, result);
    }
    if (item.type === 'container') await this.syncContainer(item, group);
  }

  /** Contents of a container (`system.items` snapshots). */
  async syncContainer(container, group) {
    const entries = foundry.utils.deepClone(container._source.system?.items ?? []);
    let changed = false;
    for (const entry of entries) {
      const src = this.resolveSource(entry);
      const pack = src.uuid ? await this.source(src.uuid) : null;
      if (pack?.documentName !== 'Item') continue;
      const result = this.mergeItem(entry, pack.toObject(), keyFromUuid(pack.uuid, game.system.id), pack, null);
      if (!src.stamped) { foundry.utils.setProperty(entry, '_stats.compendiumSource', pack.uuid); changed = true; }
      if (!result.changes.length && !result.effectOps.create.length && !result.effectOps.update.length) {
        if (result.kept.length) this.report(group, container, result, { name: `${container.name} › ${entry.name}`, img: entry.img });
        continue;
      }
      foundry.utils.mergeObject(entry, result.fields);
      const effects = entry.effects ?? (entry.effects = []);
      for (const u of result.effectOps.update) foundry.utils.mergeObject(effects.find(e => e._id === u._id) ?? {}, u);
      effects.push(...result.effectOps.create);
      changed = true;
      this.report(group, container, result, { name: `${container.name} › ${entry.name}`, img: entry.img });
    }
    if (changed && this.apply) await container.update({ 'system.items': entries }, { vagabondPackSync: true });
  }

  /** An actor: statblock (statblock packs only) + its items. */
  async syncActor(actor, group, { token = false } = {}) {
    const packUuid = SyncRun.sourceOf(actor._source);
    const packKey = packUuid ? keyFromUuid(packUuid, game.system.id) : null;
    const pack = packKey && PackSync.STATBLOCK_PACKS.has(packKey.split('.')[0]) ? await this.source(packUuid) : null;
    const packActor = pack?.documentName === 'Actor' ? pack : null;
    // Synthetic token actors: only what the token overrides (the rest is the world actor, already synced)
    const own = token ? new Set((actor.token?.delta?._source?.items ?? []).map(i => i._id)) : null;

    if (packActor && (!token || actor.token?.delta?._source?.system)) {
      const copy = actor.toObject();
      const fields = syncFields('Actor', copy);
      const m = new Merge(this.H[packKey]?.p ?? {}, 'Actor', packActor);
      const merged = m.merge(fields, syncFields('Actor', packActor.toObject()), '');
      const diff = foundry.utils.diffObject(fields, merged);
      if (this.apply && !foundry.utils.isEmpty(diff)) await actor.update(diff, { vagabondPackSync: true });
      this.report(group, actor, { changes: m.changes, kept: m.kept, effectLines: [] }, { section: 'statblock' });
    }

    for (const item of actor.items) {
      if (own && !own.has(item.id)) continue;
      // Statblock items: the pack actor's own item (same id) unless the item names another source
      const packItem = !SyncRun.sourceOf(item._source) ? packActor?.items.get(item.id) : null;
      await this.syncItemDoc(item, group, packItem ? { packDoc: packItem } : {});
    }

    // Statblock items added to the pack after this copy was made
    if (packActor && !token) {
      const created = actor._source._stats?.createdTime ?? 0;
      const add = packActor.items.filter(pi => !actor.items.has(pi.id)
        && (this.H[`${packKey}.Item.${pi.id}`]?.f ?? 0) * 1000 > created);
      if (add.length) {
        if (this.apply) await actor.createEmbeddedDocuments('Item', add.map(i => i.toObject()), { keepId: true, vagabondPackSync: true });
        for (const pi of add) {
          this.line(group, actor, PackSync.sectionOf(pi), { name: pi.name, img: pi.img, uuid: `${actor.uuid}.Item.${pi.id}` },
            'added', game.i18n.localize('VAGABOND.PackSync.NewInPack'));
          this.totals.added++;
        }
      }
    }

    // Ancestry whose Effect Choice is still open (e.g. Draconic Resilience reached an older Draken copy)
    if (actor.type === 'character') {
      for (const item of actor.items.filter(i => i.type === 'ancestry')) {
        for (const g of EffectChoices.openGroups(item)) {
          this.line(group, item, 'ancestry', null, 'choice', game.i18n.format('VAGABOND.PackSync.ChoiceNeeded', { name: g.label }));
          this.totals.choices++;
        }
      }
    }
  }

  // ── merging ───────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Merge an item copy (plain data) with its pack version.
   * @returns {{fields: object, changes, kept, effectOps: {update: object[], create: object[]}, effectLines}}
   */
  mergeItem(copy, packData, key, packDoc, copyUuid) {
    const fields = syncFields('Item', copy);
    const m = new Merge(this.H[key]?.p ?? {}, 'Item', packDoc);
    const merged = m.merge(fields, syncFields('Item', packData), '');
    const effectOps = { update: [], create: [] };
    const effectLines = [];

    const copyEffects = copy.effects ?? [];
    const used = new Set();
    const created = copy._stats?.createdTime ?? 0;
    for (const pe of packData.effects ?? []) {
      const ce = copyEffects.find(e => !used.has(e._id) && e._id === pe._id)
        ?? copyEffects.find(e => !used.has(e._id) && pe.flags?.vagabond?.effectKey && e.flags?.vagabond?.effectKey === pe.flags.vagabond.effectKey)
        ?? copyEffects.find(e => !used.has(e._id) && canon(e.name) === canon(pe.name));
      const fxKey = `${key}.ActiveEffect.${pe._id}`;
      if (!ce) {
        // New in the pack since this copy was made → add; older → the GM (or an Effect Choice pick) removed it
        if ((this.H[fxKey]?.f ?? 0) * 1000 > created) {
          const data = foundry.utils.deepClone(pe);
          data.origin = copyUuid ?? null;
          effectOps.create.push(data);
          effectLines.push(['added', game.i18n.format('VAGABOND.PackSync.EffectAdded', { name: pe.name })]);
        }
        continue;
      }
      used.add(ce._id);
      const packEffect = packDoc.effects?.get(pe._id) ?? null;
      const em = new Merge(this.H[fxKey]?.p ?? {}, 'ActiveEffect', packEffect, `${game.i18n.localize('VAGABOND.PackSync.Effect')}: ${ce.name}`);
      const before = syncFields('ActiveEffect', ce);
      const after = em.merge(before, syncFields('ActiveEffect', pe), '');
      const diff = foundry.utils.diffObject(before, after);
      if (!foundry.utils.isEmpty(diff)) effectOps.update.push({ _id: ce._id, ...diff });
      m.changes.push(...em.changes);
      m.kept.push(...em.kept);
    }
    return { fields: foundry.utils.diffObject(fields, merged), changes: m.changes, kept: m.kept, effectOps, effectLines };
  }

  async #writeItem(item, copy, result) {
    if (!foundry.utils.isEmpty(result.fields)) await item.update(result.fields, { vagabondPackSync: true });
    if (result.effectOps.update.length) await item.updateEmbeddedDocuments('ActiveEffect', result.effectOps.update, { vagabondPackSync: true });
    if (result.effectOps.create.length) await item.createEmbeddedDocuments('ActiveEffect', result.effectOps.create, { keepId: true, vagabondPackSync: true });
  }

  // ── report ────────────────────────────────────────────────────────────────────────────────────────────────────

  report(group, doc, result, { section = null, name = null, img = null } = {}) {
    const sec = section ?? PackSync.sectionOf(doc);
    const info = { name: name ?? doc.name, img: img ?? doc.img, uuid: doc.uuid };
    for (const c of result.changes) { this.line(group, doc, sec, info, 'change', c); this.totals.updated++; }
    for (const [kind, text] of result.effectLines ?? []) { this.line(group, doc, sec, info, kind, text); this.totals.added++; }
    for (const k of result.kept) { this.line(group, doc, sec, info, 'kept', k); this.totals.kept++; }
  }

  /**
   * One report line. `payload` = a text, or a merge record `{label, from, to}` (before / after values as readable
   * text: for 'kept', `from` is the GM's value and `to` the compendium's).
   */
  line(group, doc, section, info, kind, payload) {
    const sec = group.sections[section] ??= { id: section, entries: [] };
    const uuid = info?.uuid ?? doc.uuid;
    let entry = sec.entries.find(e => e.uuid === uuid && e.name === (info?.name ?? doc.name));
    if (!entry) sec.entries.push(entry = { uuid, name: info?.name ?? doc.name, img: info?.img ?? doc.img, lines: [] });
    entry.lines.push(typeof payload === 'string'
      ? { kind, text: payload }
      : { kind, text: payload.label, from: payload.from, to: payload.to });
  }

  finish() {
    const groups = [...this.groups.values()]
      .map(g => ({
        ...g,
        sections: PackSync.SECTIONS.filter(s => g.sections[s]).map(s => g.sections[s]),
      }))
      .filter(g => g.sections.length);
    return {
      version: game.system.version,
      date: Date.now(),
      dryRun: !this.apply,
      totals: this.totals,
      groups,
    };
  }
}

/** Field-by-field merge of one document's compared fields. */
class Merge {
  /**
   * @param {object} hist      history paths of this document (`{path: [hash…]}`)
   * @param {string} kind      'Item' | 'Actor' | 'ActiveEffect'
   * @param {Document|null} labelDoc  pack document (schema labels, defaults)
   * @param {string} [prefix]  label prefix (effects)
   */
  constructor(hist, kind, labelDoc, prefix = '') {
    this.hist = hist;
    this.kind = kind;
    this.doc = labelDoc;
    this.prefix = prefix;
    this.changes = [];
    this.kept = [];
    this.root = null;
  }

  merge(copy, pack, path) {
    if (!path) this.root = pack;
    if (path && isIgnored(this.kind, path)) return copy;
    if (pack === undefined) return copy;

    if (isPlainObject(pack) && (copy === undefined || isPlainObject(copy))) {
      const out = copy ? { ...copy } : {};
      for (const k of Object.keys(pack)) out[k] = this.merge(copy?.[k], pack[k], joinPath(path, k));
      return out;
    }

    if (Array.isArray(pack) && Array.isArray(copy) && (isEntryArray(pack) || isEntryArray(copy))) {
      const out = [];
      for (let i = 0; i < Math.max(pack.length, copy.length); i++) {
        const p = joinPath(path, i);
        if (i < pack.length && i < copy.length) out.push(this.merge(copy[i], pack[i], p));
        else if (i < pack.length) {
          out.push(foundry.utils.deepClone(pack[i]));
          this.changes.push({ label: `${this.label(p)} (${game.i18n.localize('VAGABOND.PackSync.EntryAdded')})`, from: null, to: Merge.text(pack[i]) });
        } else if (leaves(this.kind, copy[i], p).every(([lp, v]) => this.untouched(v, lp))) {
          this.changes.push({ label: `${this.label(p, copy[i])} (${game.i18n.localize('VAGABOND.PackSync.EntryRemoved')})`, from: Merge.text(copy[i]), to: null });
        } else out.push(copy[i]);
      }
      return out;
    }

    if (canon(copy) === canon(pack)) return copy;
    // Lines whose readable text is the same on both sides (markup-only change) are applied but not reported
    if (copy === undefined || this.untouched(copy, path)) {
      const rec = this.record(path, copy, pack);
      if (rec.from !== rec.to) this.changes.push(rec);
      return foundry.utils.deepClone(pack);
    }
    if (this.hist[path]) {
      const rec = this.record(path, copy, pack);
      if (rec.from !== rec.to) this.kept.push(rec);
    }
    return copy;
  }

  /** Copy value is an old pack value (or the default of a field older packs did not have). */
  untouched(value, path) {
    const h = this.hist[path];
    if (!h) return false;
    if (h.includes(hashValue(value))) return true;
    return h.includes(ABSENT) && canon(value) === canon(this.defaultAt(path));
  }

  /** Schema initial value of a `system.*` path (array entries walk into the element field). */
  defaultAt(path) {
    if (!path.startsWith('system.')) return undefined;
    let field = this.doc?.system?.schema ?? null;
    for (const seg of path.slice(7).split('.')) {
      if (!field) return undefined;
      if (field instanceof foundry.data.fields.ArrayField) {
        field = field.element;
        if (/^\d+$/.test(seg)) continue;
      }
      field = field?.fields?.[seg] ?? null;
    }
    try { return field?.getInitialValue?.({}); } catch { return undefined; }
  }

  /** "Traits › Draconic Resilience › Description" from a leaf path. */
  label(path, entryHint = null) {
    const parts = this.prefix ? [this.prefix] : [];
    const L = (k) => game.i18n.localize(k);
    const TOP = { name: L('VAGABOND.PackSync.Field.Name'), img: L('VAGABOND.PackSync.Field.Image'), description: L('VAGABOND.PackSync.Field.Description') };
    let node = this.root;
    let field = null;
    const segs = path.split('.');
    segs.forEach((seg, i) => {
      if (/^\d+$/.test(seg)) {
        const entry = node?.[Number(seg)] ?? (i === segs.length - 1 ? entryHint : null);
        parts.push(entry?.name || entry?.label || entry?.key || `#${Number(seg) + 1}`);
        node = entry;
        if (field instanceof foundry.data.fields.ArrayField) field = field.element;
        return;
      }
      if (i === 0 && seg === 'system') { node = node?.system; field = this.doc?.system?.schema ?? null; return; }
      if (i === 0 && seg === 'flags') { node = node?.flags; return; }
      if (i === 1 && segs[0] === 'flags') { node = node?.[seg]; return; }
      node = node?.[seg];
      field = field?.fields?.[seg] ?? null;
      const label = (i === 0 && TOP[seg]) || (field?.label && L(field.label)) || Merge.humanize(seg);
      parts.push(label);
    });
    return parts.join(' › ');
  }

  /** Report record of one field: label + before / after as readable text. */
  record(path, from, to) {
    return { label: this.label(path), from: Merge.text(from), to: Merge.text(to) };
  }

  static humanize(seg) {
    const s = seg.replace(/([a-z])([A-Z0-9])/g, '$1 $2');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Longest value text kept in the report (the world setting holds every line). */
  static TEXT_MAX = 2000;

  /**
   * A value as readable report text: HTML → its text (DOMParser: nothing runs, nothing loads), lists joined,
   * an entry (trait, feature, action…) as "key: value" pairs; '—' for empty; null when the field did not exist.
   */
  static text(v) {
    if (v === undefined) return null;
    let s;
    if (v === null || v === '') s = '—';
    else if (Array.isArray(v)) s = v.length ? v.map(x => (x !== null && typeof x === 'object' ? Merge.text(x) : String(x))).join(', ') : '—';
    else if (typeof v === 'object') {
      s = Object.entries(v)
        .filter(([, x]) => x !== null && x !== '' && x !== undefined && !(Array.isArray(x) && !x.length) && typeof x !== 'object')
        .map(([k, x]) => `${Merge.humanize(k)}: ${Merge.text(x)}`).join(' · ') || '—';
    } else {
      s = String(v);
      if (s.includes('<')) s = new DOMParser().parseFromString(s, 'text/html').body.textContent ?? s;
      s = s.replace(/\s+/g, ' ').trim() || '—';
    }
    return s.length > Merge.TEXT_MAX ? `${s.slice(0, Merge.TEXT_MAX)}…` : s;
  }
}

/** Report section of an item / actor. */
PackSync.sectionOf = (doc) => {
  if (doc?.documentName === 'Actor') return 'statblock';
  const type = doc?.type;
  if (['ancestry', 'class', 'perk', 'spell', 'container'].includes(type)) return type;
  if (type === 'equipment') {
    const t = doc.system?.equipmentType;
    return ['weapon', 'armor', 'gear', 'alchemical', 'relic'].includes(t) ? t : 'gear';
  }
  return 'other';
};
