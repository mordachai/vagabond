const { api } = foundry.applications;

/** Compendium update report (GM) — what `PackSync` changed in the world; details on `PackSyncReport`. */

/** Section id → label key (report "menus", PackSync.SECTIONS order). */
const SECTION_LABELS = {
  statblock: 'VAGABOND.PackSync.Section.statblock',
  ancestry: 'TYPES.Item.ancestry',
  class: 'TYPES.Item.class',
  perk: 'TYPES.Item.perk',
  spell: 'TYPES.Item.spell',
  weapon: 'VAGABOND.UI.Labels.Weapon',
  armor: 'VAGABOND.UI.Labels.Armor',
  gear: 'VAGABOND.UI.Labels.Gear',
  alchemical: 'VAGABOND.UI.Labels.Alchemical',
  relic: 'VAGABOND.UI.Labels.Relic',
  container: 'TYPES.Item.container',
  other: 'VAGABOND.PackSync.Section.other',
};

const LINE_ICONS = {
  change: 'fa-solid fa-arrow-right-arrow-left',
  added: 'fa-solid fa-plus',
  kept: 'fa-solid fa-user-pen',
  choice: 'fa-solid fa-hand-pointer',
};

/**
 * Compendium update report (GM): what `PackSync` changed in the world, grouped by actor (and the Items
 * directory / unlinked tokens), then by section. Names open the document. Each group can be dismissed once
 * checked; the stored report (world setting `packSyncReport`) is cleared when nothing is left.
 * It is an after-the-fact check: updating the system = migrating, there is nothing to approve.
 */
export class PackSyncReport extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'vagabond-pack-sync-report',
    classes: ['vagabond', 'pack-sync-report'],
    tag: 'div',
    window: {
      title: 'VAGABOND.PackSync.Title',
      icon: 'fa-solid fa-arrows-rotate',
      resizable: true,
    },
    position: { width: 640, height: 720 },
    actions: {
      openDoc: PackSyncReport.#onOpenDoc,
      dismissGroup: PackSyncReport.#onDismissGroup,
      dismissAll: PackSyncReport.#onDismissAll,
    },
  };

  static PARTS = {
    body: { template: 'systems/vagabond/templates/apps/pack-sync-report.hbs', scrollable: ['.psr-groups'] },
  };

  /** Stored report, or null when there is nothing to review. */
  static stored() {
    const r = game.settings.get('vagabond', 'packSyncReport');
    return r?.groups?.length ? r : null;
  }

  /** Open the stored report. */
  static open() {
    if (!game.user.isGM) return;
    (PackSyncReport.#instance ??= new PackSyncReport()).render({ force: true });
  }

  async _prepareContext() {
    const r = PackSyncReport.stored();
    const groups = (r?.groups ?? []).map((g) => {
      let count = 0;
      const sections = g.sections.map((s) => ({
        label: game.i18n.localize(SECTION_LABELS[s.id] ?? SECTION_LABELS.other),
        entries: s.entries.map((e) => {
          count += e.lines.length;
          return { ...e, lines: e.lines.map(PackSyncReport.#lineView) };
        }),
      }));
      return { ...g, sections, count, kept: sections.some((s) => s.entries.some((e) => e.lines.some((l) => l.kind === 'kept'))) };
    });
    return {
      empty: !groups.length,
      groups,
      version: r?.version ?? game.system.version,
      date: r?.date ? new Date(r.date).toLocaleString() : '',
      totals: r?.totals ?? { updated: 0, kept: 0, added: 0, choices: 0 },
    };
  }

  /** Short single-line values sit inline ("d6 → d8"); long ones (descriptions, entries) open as before / after. */
  static #lineView(l) {
    const has = (v) => v !== null && v !== undefined;
    const short = (v) => !has(v) || (v.length <= 60 && !v.includes('\n'));
    const values = has(l.from) || has(l.to);
    const kept = l.kind === 'kept';
    return {
      ...l,
      icon: LINE_ICONS[l.kind] ?? LINE_ICONS.change,
      inline: values && short(l.from) && short(l.to),
      expand: values && !(short(l.from) && short(l.to)),
      fromLabel: game.i18n.localize(kept ? 'VAGABOND.PackSync.Yours' : 'VAGABOND.PackSync.Before'),
      toLabel: game.i18n.localize(kept ? 'VAGABOND.PackSync.Compendium' : 'VAGABOND.PackSync.After'),
      fromText: has(l.from) ? l.from : game.i18n.localize('VAGABOND.PackSync.None'),
      toText: has(l.to) ? l.to : game.i18n.localize('VAGABOND.PackSync.None'),
    };
  }

  static async #onOpenDoc(event, target) {
    const doc = await fromUuid(target.dataset.uuid).catch(() => null);
    if (doc?.sheet) doc.sheet.render(true);
    else ui.notifications.warn(game.i18n.localize('VAGABOND.PackSync.Missing'));
  }

  static async #onDismissGroup(event, target) {
    const r = PackSyncReport.stored();
    if (!r) return;
    r.groups = r.groups.filter((g) => g.id !== target.dataset.groupId);
    await game.settings.set('vagabond', 'packSyncReport', r.groups.length ? r : {});
    if (r.groups.length) this.render();
    else this.close();
  }

  static async #onDismissAll() {
    await game.settings.set('vagabond', 'packSyncReport', {});
    this.close();
  }
}
