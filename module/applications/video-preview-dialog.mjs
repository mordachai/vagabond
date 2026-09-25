import { VagabondFXResolver } from '../helpers/fx-file-resolver.mjs';

const { api } = foundry.applications;

/**
 * Floating singleton window for previewing animation WebM files.
 * Uses a native <video> element — no Sequencer or canvas token required.
 *
 * Open via VideoPreviewDialog.open(spec) where spec is either a file spec string
 * (plain path, `a.webm | b.webm`, filesystem wildcard, or Sequencer DB path) or an
 * array of labelled groups `[{ label, spec, sound?, volume? }]` (e.g. Hit / Miss).
 * Subsequent calls swap the source. Groups with several files get prev/next variant
 * buttons. A group's sound plays together with its video as one clip: Play restarts
 * both, and a loop cycle lasts as long as the longer of the two.
 */
export class VideoPreviewDialog extends api.HandlebarsApplicationMixin(api.ApplicationV2) {
  static #instance = null;

  static DEFAULT_OPTIONS = {
    id: 'vagabond-video-preview',
    classes: ['vagabond-video-preview'],
    window: {
      title: 'Animation Preview',
      resizable: true,
    },
    position: { width: 400, height: 'auto' },
    actions: {
      replay: VideoPreviewDialog.#onReplay,
      toggleLoop: VideoPreviewDialog.#onToggleLoop,
      selectGroup: VideoPreviewDialog.#onSelectGroup,
      stepVariant: VideoPreviewDialog.#onStepVariant,
    },
  };

  static PARTS = {
    preview: {
      template: 'systems/vagabond/templates/apps/video-preview-dialog.hbs',
    },
  };

  /** @type {{label: string, files: string[]}[]} */
  #groups = [];
  #groupIdx = 0;
  #fileIdx = 0;
  #loop = false;
  #muted = false;
  #title = '';
  /** Media elements of the current cycle still playing (video and/or audio). */
  #pending = 0;

  /**
   * Open the singleton preview window, or swap the source if already open.
   * @param {string|{label: string, spec: string, sound?: string, volume?: number}[]} spec
   * @param {{title?: string}} [options]
   */
  static async open(spec, { title = '' } = {}) {
    const raw = Array.isArray(spec) ? spec : [{ label: '', spec }];
    const groups = [];
    for (const g of raw) {
      const files = await VideoPreviewDialog.resolveFiles(g.spec);
      if (files.length) groups.push({ label: g.label ?? '', files, sound: g.sound || '', volume: g.volume ?? 0.6 });
    }
    if (!groups.length) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.VideoPreview.NoFile'));
      return;
    }

    const inst = VideoPreviewDialog.#instance?.rendered
      ? VideoPreviewDialog.#instance
      : (VideoPreviewDialog.#instance = new VideoPreviewDialog());
    inst.#groups = groups;
    inst.#groupIdx = 0;
    inst.#fileIdx = 0;
    inst.#title = title;
    await inst.render({ force: true });
    inst.bringToTop?.();
  }

  /**
   * Expand a file spec into a flat list of playable file paths.
   * Handles pipe-separated lists, filesystem wildcards (via VagabondFXResolver, which
   * relays to the GM for players) and Sequencer database paths (`jb2a.x.y`, `jb2a.x.*`).
   * @param {string} spec
   * @returns {Promise<string[]>}
   */
  static async resolveFiles(spec) {
    if (typeof spec !== 'string' || !spec.trim()) return [];
    const out = [];
    for (const part of spec.split('|').map(s => s.trim()).filter(Boolean)) {
      if (VideoPreviewDialog.#isDbPath(part)) {
        out.push(...VideoPreviewDialog.#resolveDbPath(part));
        continue;
      }
      const resolved = await VagabondFXResolver.resolve(part);
      if (Array.isArray(resolved)) out.push(...resolved);
      else if (resolved) out.push(resolved);
    }
    return [...new Set(out)];
  }

  /** Sequencer DB paths are dotted with no slash and no file extension. */
  static #isDbPath(p) {
    return !/[/\\]/.test(p) && !/\.(webm|mp4|webp|png|jpe?g|gif|ogg|mp3|wav)$/i.test(p) && p.includes('.');
  }

  static #resolveDbPath(p) {
    const db = globalThis.Sequencer?.Database;
    if (!db) return [];
    const path = p.replace(/\.?\*.*$/, '');
    let entry;
    try { entry = db.getEntry(path, { softFail: true }); } catch { return []; }
    if (!entry) return [];
    const collect = (e) => {
      if (!e) return [];
      if (typeof e === 'string') return [e];
      if (Array.isArray(e)) return e.flatMap(collect);
      if (typeof e.getAllFiles === 'function') return e.getAllFiles().flatMap(collect);
      if (typeof e === 'object') return Object.values(e).flatMap(collect);
      return [];
    };
    return collect(entry);
  }

  get title() {
    return this.#title || game.i18n.localize('VAGABOND.VideoPreview.Title');
  }

  async _prepareContext(options) {
    const group = this.#groups[this.#groupIdx] ?? { files: [] };
    const file = group.files[this.#fileIdx] ?? '';
    return {
      file,
      sound: group.sound ?? '',
      muted: this.#muted,
      fileName: decodeURIComponent(file.split('/').pop() ?? ''),
      loop: this.#loop,
      groups: this.#groups.length > 1
        ? this.#groups.map((g, i) => ({ index: i, label: g.label, active: i === this.#groupIdx }))
        : [],
      // Up to 3 groups share one row; more split evenly across two rows.
      groupCols: this.#groups.length > 3 ? Math.ceil(this.#groups.length / 2) : this.#groups.length,
      hasVariants: group.files.length > 1,
      variantIndex: this.#fileIdx + 1,
      variantCount: group.files.length,
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.window?.title) this.window.title.textContent = this.title;

    const video = this.element.querySelector('.vpd-video');
    const audio = this.element.querySelector('.vpd-audio');
    if (audio) {
      audio.volume = Math.clamp(this.#groups[this.#groupIdx]?.volume ?? 0.6, 0, 1);
      audio.muted = this.#muted;
    }
    // Muting keeps the sound running silently, so the loop cycle length is unchanged.
    this.element.querySelector('.vpd-mute input')?.addEventListener('change', ev => {
      this.#muted = ev.currentTarget.checked;
      if (audio) audio.muted = this.#muted;
    });
    const onDone = () => {
      if (--this.#pending > 0) return;
      if (this.#loop) this.#playCycle();
    };
    video?.addEventListener('ended', onDone);
    audio?.addEventListener('ended', onDone);
    this.#playCycle();
  }

  async _preRender(context, options) {
    await super._preRender(context, options);
    this.#stopMedia(); // a detached <audio> keeps playing otherwise
  }

  /** Restart video + sound together from the beginning. */
  #playCycle() {
    const media = [this.element?.querySelector('.vpd-video'), this.element?.querySelector('.vpd-audio')]
      .filter(el => el && !el.error);
    this.#pending = media.length;
    for (const el of media) {
      el.currentTime = 0;
      // A missing/broken file rejects play() — count it as finished so the other one's
      // 'ended' still closes the cycle (restarts only ever come from 'ended').
      el.play().catch(() => { this.#pending--; });
    }
  }

  #stopMedia() {
    for (const el of this.element?.querySelectorAll('.vpd-video, .vpd-audio') ?? []) el.pause();
  }

  static #onReplay() {
    this.#playCycle();
  }

  static #onToggleLoop(event, target) {
    this.#loop = !this.#loop;
    target.classList.toggle('active', this.#loop);
    // Cycle already finished → start the loop now.
    if (this.#loop && this.#pending <= 0) this.#playCycle();
  }

  static #onSelectGroup(event, target) {
    const idx = Number(target.dataset.index);
    if (!Number.isInteger(idx) || idx === this.#groupIdx) return;
    this.#groupIdx = idx;
    this.#fileIdx = 0;
    this.render();
  }

  static #onStepVariant(event, target) {
    const count = this.#groups[this.#groupIdx]?.files.length ?? 0;
    if (count < 2) return;
    const dir = Number(target.dataset.dir) || 1;
    this.#fileIdx = (this.#fileIdx + dir + count) % count;
    this.render();
  }

  async close(options) {
    this.#stopMedia();
    VideoPreviewDialog.#instance = null;
    return super.close(options);
  }
}
