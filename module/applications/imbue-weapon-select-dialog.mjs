const { api } = foundry.applications;

/**
 * Card-picker dialog for choosing which equipped weapon to imbue per target,
 * matching the visual language of ProgressClockConfig's clock/size cards.
 * One column per target (token image + name), weapon cards below, click to select.
 */
export class ImbueWeaponSelectDialog extends api.HandlebarsApplicationMixin(
  api.ApplicationV2
) {
  constructor(entries, resolve, options = {}) {
    super(options);
    this.#entries = entries;
    this.#resolve = resolve;
  }

  #entries;
  #resolve;
  #resolved = false;

  static DEFAULT_OPTIONS = {
    id: 'imbue-weapon-select-{id}',
    classes: ['vagabond', 'imbue-weapon-select'],
    window: {
      title: 'VAGABOND.Status.Imbue.SelectWeapon',
      icon: 'fa-solid fa-wand-sparkles',
      resizable: false,
    },
    position: {
      width: 'auto',
      height: 'auto',
    },
  };

  static PARTS = {
    form: {
      template: 'systems/vagabond/templates/imbue/weapon-select.hbs',
    },
  };

  /**
   * @param {Array<{targetActor: Actor, weapons: Item[]}>} entries
   * @returns {Promise<Array<{targetActor: Actor, weapon: Item}>>}
   */
  static async prompt(entries) {
    return new Promise((resolve) => {
      new ImbueWeaponSelectDialog(entries, resolve).render(true);
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    context.columns = this.#entries.map(({ targetActor, weapons }, index) => ({
      index,
      actorName: targetActor.name,
      tokenImg: targetActor.token?.texture?.src ?? targetActor.prototypeToken?.texture?.src ?? targetActor.img,
      weapons: weapons.map((w, idx) => ({
        id: w.id,
        name: w.name,
        img: w.img,
        selected: idx === 0,
      })),
    }));

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    this.element.querySelectorAll('.iws-column').forEach((column) => {
      const hiddenInput = column.querySelector('input[type="hidden"]');
      const cards = column.querySelectorAll('.iws-card');
      cards.forEach((card) => {
        card.addEventListener('click', () => {
          cards.forEach((c) => c.classList.remove('is-selected'));
          card.classList.add('is-selected');
          if (hiddenInput) hiddenInput.value = card.dataset.weaponId;
        });
      });
    });

    this.element.querySelector('.iws-confirm')?.addEventListener('click', () => this._onConfirm());
    this.element.querySelector('.iws-cancel')?.addEventListener('click', () => this.close());
  }

  _onConfirm() {
    const columns = this.element.querySelectorAll('.iws-column');
    const assignments = [];
    this.#entries.forEach(({ targetActor, weapons }, index) => {
      const hiddenInput = columns[index]?.querySelector('input[type="hidden"]');
      const weaponId = hiddenInput?.value;
      const weapon = weapons.find((w) => w.id === weaponId) ?? weapons[0];
      if (weapon) assignments.push({ targetActor, weapon });
    });
    this.#resolved = true;
    this.#resolve(assignments);
    this.close();
  }

  async close(options) {
    if (!this.#resolved) {
      this.#resolved = true;
      this.#resolve([]);
    }
    return super.close(options);
  }
}
