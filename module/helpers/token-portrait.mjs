/**
 * Circle-cropped token art derived from the actor portrait.
 *
 * When a portrait is copied onto the prototype token (actor created with a portrait and no token art,
 * a portrait change while the token still shows the default / our previous crop, the Character Builder's
 * Class or Guide art), the token gets a baked circular copy of the portrait instead of the square image.
 * Copies live in `assets/vagabond/tokens/` (shared across worlds) and are named from the source path, so
 * each portrait is cropped and uploaded once. Gated by the world setting `circleTokenPortrait`.
 *
 * With a dynamic token ring on, the token uses a `-ring` variant instead: the same circle shrunk to the
 * ring's inner edge on a transparent margin, so the ring shows around it (the ring draws UNDER the subject).
 * Toggling the ring swaps the variant (actor prototype in `onPreUpdate`, placed tokens via `syncTokenRing`).
 *
 * Users without upload permission relay the upload to the active GM (`vagabond.tokenPortrait.upload`).
 * Any failure (CORS-tainted remote image, no GM, no permission) falls back to the square portrait.
 */
export class TokenPortrait {
  static DIR = 'assets/vagabond/tokens';
  static QUERY = 'vagabond.tokenPortrait.upload';
  static MAX_SIZE = 1024;
  static ACTOR_TYPES = new Set(['character', 'npc']);
  /** Circle diameter in the ring variant (fits inside the ring's inner edge). Part of the file name, so a new
   *  value bakes new files instead of reusing the old ones. */
  static RING_SCALE = 0.8;

  /** In-flight crops by destination path (one render/upload per image even under parallel calls). */
  static #pending = new Map();

  /** Register the GM upload relay. Call once in `init` (all clients). */
  static registerQueries() {
    CONFIG.queries[this.QUERY] = (data, { user }) => this.#handleUploadQuery(data, user);
  }

  static enabled() {
    try { return game.settings.get('vagabond', 'circleTokenPortrait'); } catch { return false; }
  }

  /** Images we never crop: placeholders, vectors, video, and our own crops. */
  static #skip(src) {
    if (typeof src !== 'string' || !src) return true;
    if (src === CONST.DEFAULT_TOKEN || src === foundry.documents.Actor.DEFAULT_ICON) return true;
    if (src.startsWith(`${this.DIR}/`)) return true;
    const ext = src.split('?')[0].split('.').pop().toLowerCase();
    return ext === 'svg' || ext in CONST.VIDEO_FILE_EXTENSIONS;
  }

  /** Destination path of the circle crop for a portrait path (deterministic). */
  static pathFor(src) {
    let h = 0x811c9dc5;
    for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 0x01000193);
    let base = src.split('?')[0].split('/').pop().replace(/\.[^.]+$/, '');
    try { base = decodeURIComponent(base); } catch { /* keep the raw name */ }
    const slug = base.slugify({ strict: true }).slice(0, 40) || 'portrait';
    return `${this.DIR}/${slug}-${(h >>> 0).toString(36)}.webp`;
  }

  /** Is this one of our crops (plain or ring variant)? */
  static isCrop(src) {
    return typeof src === 'string' && src.startsWith(`${this.DIR}/`);
  }

  static #plainOf(src) { return src.replace(/-ring\d*\.webp$/, '.webp'); }
  static #ringOf(src) {
    return this.#plainOf(src).replace(/\.webp$/, `-ring${Math.round(this.RING_SCALE * 100)}.webp`);
  }

  /**
   * The crop variant matching a ring state (creating the ring one if needed).
   * @param {string} src      one of our crops
   * @param {boolean} ringOn  dynamic ring enabled on that token
   * @returns {Promise<string>} plain crop, ring variant, or `src` unchanged when it isn't ours
   */
  static async variantFor(src, ringOn) {
    if (!this.isCrop(src)) return src;
    const plain = this.#plainOf(src);
    if (!ringOn) return plain;
    return (await this.#ensure(this.#ringOf(src), () => this.#renderRing(plain))) ?? plain;
  }

  /**
   * Circle-cropped copy of `src`, creating it if needed.
   * @param {string} src  portrait path
   * @returns {Promise<string|null>} path of the crop, or null when it can't be made (use the original)
   */
  static async circleFor(src) {
    if (this.#skip(src)) return null;
    return this.#ensure(this.pathFor(src), () => this.#render(src));
  }

  /** Existing file at `path`, else render + upload it (one job per path even under parallel calls). */
  static #ensure(path, render) {
    if (!this.#pending.has(path)) {
      const job = this.#make(path, render).finally(() => this.#pending.delete(path));
      this.#pending.set(path, job);
    }
    return this.#pending.get(path);
  }

  static async #make(path, render) {
    try {
      const exists = foundry.utils.srcExists ?? foundry.canvas.srcExists;
      if (await exists(path)) return path;
      const blob = await render();
      if (!blob) return null;
      const name = path.split('/').pop();
      if (game.user.can('FILES_UPLOAD')) return await this.#upload(name, blob);
      const gm = game.users.activeGM;
      if (!gm) return null;
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return (await gm.query(this.QUERY, { name, dataUrl }, { timeout: 30 * 1000 })) ?? null;
    } catch (err) {
      console.warn(`Vagabond | Circle token crop failed for "${path}"`, err);
      return null;
    }
  }

  /** Draw the portrait into a circle: centered square crop (tall images favor the top, where faces are). */
  static async #render(src) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return null;
    const side = Math.min(w, h);
    const sx = (w - side) / 2;
    const sy = (h - side) * 0.25;
    const size = Math.min(side, this.MAX_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    // A tainted canvas (cross-origin image without CORS) throws here → caller falls back to the original
    return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
  }

  /** Ring variant: the plain crop shrunk to RING_SCALE, centered on a transparent canvas of the same size. */
  static async #renderRing(plain) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = plain;
    await img.decode();
    const size = img.naturalWidth;
    if (!size) return null;
    const d = size * this.RING_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (size - d) / 2, (size - d) / 2, d, d);
    return new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.9));
  }

  static async #upload(name, blob) {
    const FP = foundry.applications.apps.FilePicker.implementation ?? foundry.applications.apps.FilePicker;
    await FP.createDirectory('data', 'assets/vagabond').catch(() => {});
    await FP.createDirectory('data', this.DIR).catch(() => {});
    const file = new File([blob], name, { type: 'image/webp' });
    const res = await FP.upload('data', this.DIR, file, {}, { notify: false });
    if (res?.status === 'error' || res === false) return null;
    return res?.path ?? `${this.DIR}/${name}`;
  }

  /** GM side: only a webp named like our crops, only into our folder. */
  static async #handleUploadQuery({ name, dataUrl } = {}, user) {
    if (!game.user.isGM || !user) return null;
    if (typeof name !== 'string' || !/^[a-z0-9-]+\.webp$/.test(name)) return null;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/webp;base64,')) return null;
    const path = `${this.DIR}/${name}`;
    const exists = foundry.utils.srcExists ?? foundry.canvas.srcExists;
    if (await exists(path)) return path;
    const blob = await (await fetch(dataUrl)).blob();
    return this.#upload(name, blob);
  }

  /**
   * Actor `_preCreate`: the core copied the portrait onto a token that had no art of its own.
   * @param {Actor} actor
   * @param {object} data  raw creation data
   */
  static async onPreCreate(actor, data) {
    if (!this.enabled() || !this.ACTOR_TYPES.has(actor.type)) return;
    const given = data.prototypeToken?.texture?.src;
    if (given && given !== CONST.DEFAULT_TOKEN) return;
    if (actor.prototypeToken.texture.src !== actor.img) return;
    const circle = await this.circleFor(actor.img);
    if (circle) {
      const src = await this.variantFor(circle, actor.prototypeToken.ring.enabled);
      actor.prototypeToken.updateSource({ 'texture.src': src });
    }
  }

  /**
   * Actor `_preUpdate`. The portrait changes and the token follows it (core copy onto the default token,
   * a caller writing the same image to both, or the token still showing our crop of the old portrait);
   * then the token's crop gets the variant matching its (possibly toggled) dynamic ring.
   * @param {Actor} actor
   * @param {object} changed  mutable update diff
   */
  static async onPreUpdate(actor, changed) {
    if (actor.isToken || !this.enabled() || !this.ACTOR_TYPES.has(actor.type)) return;
    const current = actor.prototypeToken.texture.src;
    let tokenSrc = foundry.utils.getProperty(changed, 'prototypeToken.texture.src');
    const newImg = changed.img;
    if (newImg && newImg !== actor.img) {
      const follows = tokenSrc === newImg
        || (tokenSrc === undefined && this.isCrop(current) && this.#plainOf(current) === this.pathFor(actor.img ?? ''));
      if (follows) tokenSrc = (await this.circleFor(newImg)) ?? newImg;
    }
    // Only touch the token when its art or ring is part of this update (no file checks on every HP change)
    if (tokenSrc === undefined && !foundry.utils.hasProperty(changed, 'prototypeToken.ring.enabled')) return;
    const src = tokenSrc ?? current;
    const ringOn = foundry.utils.getProperty(changed, 'prototypeToken.ring.enabled') ?? actor.prototypeToken.ring.enabled;
    const finalSrc = await this.variantFor(src, ringOn);
    if (finalSrc !== current || tokenSrc !== undefined) {
      foundry.utils.setProperty(changed, 'prototypeToken.texture.src', finalSrc);
    }
  }

  /**
   * Placed token (`updateToken`, updating client): ring toggled or art changed → swap to the matching crop variant.
   * @param {TokenDocument} token
   */
  static async syncTokenRing(token) {
    // Read the stored art: the prepared `texture.src` can still hold the previous image right after an
    // actor swap (Metamorph writes actorId, then the art). Writing only if the art is unchanged after the
    // await keeps a slow variant bake from putting the old crop back over the new art.
    const from = token._source.texture.src;
    if (!this.enabled() || !this.isCrop(from)) return;
    const src = await this.variantFor(from, token.ring.enabled);
    if (src !== from && token._source.texture.src === from) await token.update({ 'texture.src': src });
  }
  /**
   * Token art this token should use: our crop variant for its ring state, the circle of its portrait
   * when the token still shows the square portrait (or the default), else null (explicit art, leave it).
   * @param {string} src     current token image
   * @param {string} img     the actor portrait
   * @param {boolean} ringOn
   */
  static async #targetFor(src, img, ringOn) {
    if (this.isCrop(src)) return this.variantFor(src, ringOn);
    if (src && src !== img && src !== CONST.DEFAULT_TOKEN) return null;
    const circle = await this.circleFor(img);
    return circle ? this.variantFor(circle, ringOn) : null;
  }

  /**
   * GM batch (macro: `game.vagabond.tokenPortrait.convertAll()`): world Characters / NPCs and their placed
   * tokens in every Scene. Already-baked tokens get the variant matching their ring (re-baked at the current
   * RING_SCALE); tokens still showing the square portrait get the circle. Explicit token art is untouched.
   * @param {object} [options]
   * @param {boolean} [options.scenes=true]  also update placed tokens
   * @returns {Promise<{actors: number, tokens: number}>}
   */
  static async convertAll({ scenes = true } = {}) {
    if (!game.user.isGM) {
      ui.notifications.warn('Only a GM can convert token art.');
      return { actors: 0, tokens: 0 };
    }
    ui.notifications.info('Vagabond | Converting token art…');
    let actors = 0, tokens = 0;
    for (const actor of game.actors) {
      if (!this.ACTOR_TYPES.has(actor.type)) continue;
      const src = actor.prototypeToken.texture.src;
      const target = await this.#targetFor(src, actor.img, actor.prototypeToken.ring.enabled);
      if (!target || target === src) continue;
      // render: false + no portrait-follow logic needed: only the token image changes
      await actor.update({ 'prototypeToken.texture.src': target }, { render: false });
      actors++;
    }
    if (scenes) {
      for (const scene of game.scenes) {
        const updates = [];
        for (const token of scene.tokens) {
          const actor = token.actor;
          if (!actor || !this.ACTOR_TYPES.has(actor.type)) continue;
          const src = token.texture.src;
          const target = await this.#targetFor(src, actor.img, token.ring.enabled);
          if (target && target !== src) updates.push({ _id: token.id, 'texture.src': target });
        }
        if (updates.length) {
          await scene.updateEmbeddedDocuments('Token', updates);
          tokens += updates.length;
        }
      }
    }
    ui.notifications.info(`Vagabond | Token art converted: ${actors} actor(s), ${tokens} placed token(s).`);
    return { actors, tokens };
  }
}
