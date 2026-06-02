const { api } = foundry.applications;

/**
 * Floating singleton window for previewing animation WebM files.
 * Uses a native <video> element — no Sequencer or canvas token required.
 * Open via VideoPreviewDialog.open(filePath); subsequent calls swap the source.
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
      toggleLoop: VideoPreviewDialog.#onToggleLoop,
    },
  };

  static PARTS = {
    preview: {
      template: 'systems/vagabond/templates/apps/video-preview-dialog.hbs',
    },
  };

  #filePath = '';

  constructor(filePath, options = {}) {
    super(options);
    this.#filePath = filePath;
  }

  /** Open the singleton preview window, or swap the source if already open. */
  static open(filePath) {
    if (!filePath) return;
    if (VideoPreviewDialog.#instance?.rendered) {
      VideoPreviewDialog.#instance.#filePath = filePath;
      VideoPreviewDialog.#instance.render({ force: true });
      VideoPreviewDialog.#instance.bringToTop?.();
      return;
    }
    VideoPreviewDialog.#instance = new VideoPreviewDialog(filePath);
    VideoPreviewDialog.#instance.render({ force: true });
  }

  async _prepareContext(options) {
    return { file: this.#filePath };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector('.vpd-video')?.play().catch(() => {});
  }

  static #onToggleLoop(event, target) {
    const video = this.element.querySelector('.vpd-video');
    if (!video) return;
    video.loop = !video.loop;
    target.classList.toggle('active', video.loop);
  }

  async close(options) {
    VideoPreviewDialog.#instance = null;
    return super.close(options);
  }
}
