import { DruidHelper } from '../helpers/druid-helper.mjs';
import { FocusLink } from '../helpers/focus-link.mjs';

/**
 * Focusing status: mirror onto Metamorph forms; removing it by hand ends the Focus.
 * Moved out of vagabond.mjs; called once at module load, in the original order.
 */
export function registerFocusStatusHooks() {
  // Druid / Metamorph: a morphed token shows its form's statuses — mirror the original's Focusing
  // (ring animation) onto its forms, on Focus changes and when a form is taken (DruidHelper.syncFormFocus).
  const _syncFormFocus = (effect) => {
    const actor = effect.parent;
    if (!effect.statuses?.has('focusing') || !(actor instanceof Actor) || DruidHelper.mainActorOf(actor)) return;
    DruidHelper.syncFormFocus(actor).catch(err => console.warn('Vagabond | Form Focusing sync failed', err));
  };
  Hooks.on('createActiveEffect', _syncFormFocus);
  Hooks.on('deleteActiveEffect', _syncFormFocus);

  // Focusing status removed by hand (token HUD, effects list; on a form it is the original's): the Focus ends,
  // so what the Focused Casts applied goes too (FocusLink.clearFocus → Focus-dropped hooks).
  Hooks.on('deleteActiveEffect', (effect, options, userId) => {
    if (userId !== game.user.id || !effect.statuses?.has('focusing')) return;
    const actor = effect.parent;
    if (!(actor instanceof Actor)) return;
    const main = DruidHelper.mainActorOf(actor) ?? actor;
    if (!main.isOwner || !main.system.focus?.spellIds?.length) return;
    FocusLink.clearFocus(main).catch(err => console.warn('Vagabond | Ending Focus failed', err));
  });
  Hooks.on('metamorph.morph', (tokenDoc, targetActor) => {
    const main = DruidHelper.mainActorOf(targetActor);
    if (main) DruidHelper.syncFormFocus(main).catch(err => console.warn('Vagabond | Form Focusing sync failed', err));
  });
}
