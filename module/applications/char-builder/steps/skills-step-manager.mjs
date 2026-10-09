/**
 * Skills Step Manager - one place to assign every Training owed at Level 1.
 *
 * Training sources ("pools"):
 *   - Class Training (`skillGrant.guaranteed`)      → locked, always trained
 *   - Class choice groups (`skillGrant.choices`)    → pick N from a pool
 *   - Ancestry traits / Level 1 class features      → `extraTraining` (any Skill) + `skillChoices` (restricted)
 *   - Reason (book p. 25)                           → half REASON, round up (any Skill)
 *
 * State:
 *   - `trainingPools`  = { key, guaranteed, castingSkill, pools[] } — static pool definitions, rebuilt when the
 *                        Ancestry or Class changes (`key` = trainingPoolsKey(state)). Reason is added at read time.
 *   - `skillSelections` = { [poolId]: skillKey[] } — the picks; `skills` = guaranteed + every pick.
 *   - `activeTrainingPool` / `skillFocusStat` = UI only.
 *
 * Completion is synchronous (`isTrainingComplete`) so navigation, the Next button and the validation engine
 * all read the same rule without loading documents.
 */
import { BaseStepManager } from './base-step-manager.mjs';

/** Pool definitions are valid only for the Ancestry + Class they were built from. */
export function trainingPoolsKey(state) {
  return `${state.selectedAncestry ?? ''}|${state.selectedClass ?? ''}`;
}

/** Skill keys in homebrew order (falls back to CONFIG.VAGABOND.skills). */
export function allSkillKeys() {
  const hb = CONFIG.VAGABOND.homebrew?.skills;
  return hb?.length ? hb.map(s => s.key) : Object.keys(CONFIG.VAGABOND?.skills || {});
}

/** Final value of a stat in the builder (assigned + applied bonuses + perk bonuses), or null. */
export function finalStatValue(state, key) {
  const base = state.assignedStats?.[key];
  if (base === null || base === undefined) return null;
  const bonus = Object.values(state.appliedBonuses || {})
    .filter(a => a.target === key)
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  return base + bonus + (state.perkStatBonuses?.[key] || 0);
}

/** Trainings owed by Reason: half REASON, round up. 0 until Reason is set. */
export function reasonTrainingCount(state) {
  const reason = finalStatValue(state, 'reason');
  return reason === null ? 0 : Math.ceil(Math.max(0, reason) / 2);
}

/**
 * Resolve every pool against the current picks.
 * `needed` is the count capped by the Skills the pool can still reach (a pool never demands a Skill that
 * doesn't exist or is already trained elsewhere). Returns [] when the definitions are stale.
 */
export function resolveTrainingPools(state) {
  const defs = state.trainingPools;
  if (!defs || defs.key !== trainingPoolsKey(state)) return [];

  const pools = [...defs.pools];
  const reasonCount = reasonTrainingCount(state);
  if (reasonCount > 0) pools.push({ id: 'reason', kind: 'reason', count: reasonCount, pool: null });

  const all = allSkillKeys();
  const guaranteed = new Set(defs.guaranteed);
  const selections = state.skillSelections || {};
  const taken = new Map(); // skill -> poolId
  for (const p of pools) {
    for (const s of selections[p.id] ?? []) {
      if (!guaranteed.has(s) && !taken.has(s) && (!p.pool || p.pool.includes(s))) taken.set(s, p.id);
    }
  }

  return pools.map(p => {
    const eligible = (p.pool ?? all).filter(s => all.includes(s));
    const picks = (selections[p.id] ?? []).filter(s => taken.get(s) === p.id);
    const free = eligible.filter(s => !guaranteed.has(s) && !taken.has(s)).length;
    const needed = Math.min(p.count, picks.length + free);
    return { ...p, eligible, picks, needed, full: picks.length >= needed };
  });
}

/** Every pool holds exactly what it owes (extra picks after lowering Reason count as incomplete). */
export function isTrainingComplete(state) {
  if (!state.selectedClass) return false;
  const defs = state.trainingPools;
  if (!defs || defs.key !== trainingPoolsKey(state)) return false;
  return resolveTrainingPools(state).every(p => p.picks.length === p.needed);
}

export class SkillsStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);

    this.actionHandlers = {
      'toggleTraining': this._onToggleTraining.bind(this),
      'selectTrainingPool': this._onSelectTrainingPool.bind(this),
      'focusSkillStat': this._onFocusSkillStat.bind(this),
      'randomize': this._onRandomize.bind(this)
    };

    this.requiredData = [];
  }

  get stepName() {
    return 'skills';
  }

  _getStatePaths() {
    return ['skillSelections', 'activeTrainingPool', 'skillFocusStat'];
  }

  isComplete() {
    return isTrainingComplete(this.getCurrentState());
  }

  /* ------------------------------------------------------------------ */
  /* Pool definitions                                                    */
  /* ------------------------------------------------------------------ */

  /** Build (or reuse) the static pool definitions for the current Ancestry + Class. */
  async _ensureTrainingPools() {
    const state = this.getCurrentState();
    const key = trainingPoolsKey(state);
    if (state.trainingPools?.key === key) return state.trainingPools;

    const defs = { key, guaranteed: [], castingSkill: null, pools: [] };
    const anySkill = list => (list?.length ? [...list] : null);

    const classItem = state.selectedClass ? await fromUuid(state.selectedClass).catch(() => null) : null;
    if (classItem) {
      const grant = classItem.system.skillGrant || { guaranteed: [], choices: [] };
      defs.guaranteed = [...(grant.guaranteed || [])];
      if (classItem.system.isSpellcaster && classItem.system.manaSkill) defs.castingSkill = classItem.system.manaSkill;
      (grant.choices || []).forEach((choice, i) => {
        defs.pools.push({
          id: `class-${i}`, kind: 'class', count: choice.count || 1, pool: anySkill(choice.pool),
          source: game.i18n.format('VAGABOND.CharBuilder.Skills.SourceClass', { name: classItem.name })
        });
      });
    }

    const addGrantPools = (entries, prefix, sourceKey, originName) => {
      (entries || []).forEach((entry, i) => {
        const source = game.i18n.format(sourceKey, { origin: originName, name: entry.name });
        if ((entry.extraTraining || 0) > 0) {
          defs.pools.push({ id: `${prefix}-${i}`, kind: 'grant', count: entry.extraTraining, pool: null, source });
        }
        (entry.skillChoices || []).forEach((group, g) => {
          defs.pools.push({
            id: `${prefix}-${i}-${g}`, kind: 'grant', count: group.count || 1, pool: anySkill(group.pool),
            label: group.label || '', source
          });
        });
      });
    };

    const ancestry = state.selectedAncestry ? await fromUuid(state.selectedAncestry).catch(() => null) : null;
    if (ancestry) addGrantPools(ancestry.system.traits, 'ancestry', 'VAGABOND.CharBuilder.Skills.SourceAncestry', ancestry.name);

    if (classItem) {
      // Keep the real levelFeatures index in the id so the picks survive a re-read
      const features = (classItem.system.levelFeatures || []).map((f, i) => ({ ...f, _idx: i }));
      const level1 = features.filter(f => f.level === 1);
      level1.forEach(f => addGrantPools([f], `feature-${f._idx}`, 'VAGABOND.CharBuilder.Skills.SourceClassFeature', classItem.name));
    }

    this.stateManager.updateState('trainingPools', defs, { skipValidation: true });
    return defs;
  }

  /** Drop picks that no longer fit (pool changed, Reason lowered, Skill now granted) and rebuild `skills`. */
  _trimSelections() {
    const state = this.getCurrentState();
    const resolved = resolveTrainingPools(state);
    const current = state.skillSelections || {};
    const next = {};
    for (const p of resolved) {
      const picks = p.picks.slice(0, p.needed);
      if (picks.length) next[p.id] = picks;
    }
    const same = Object.keys(next).length === Object.keys(current).length &&
      Object.entries(next).every(([id, picks]) => (current[id] ?? []).join() === picks.join());
    if (!same || !this._skillsMatch(state, next)) this._writeSelections(next);
  }

  _skillsMatch(state, selections) {
    const expected = this._combinedSkills(state, selections);
    const actual = state.skills || [];
    return expected.length === actual.length && expected.every(s => actual.includes(s));
  }

  _combinedSkills(state, selections) {
    return [...new Set([...(state.trainingPools?.guaranteed ?? []), ...Object.values(selections).flat()])];
  }

  _writeSelections(selections) {
    const state = this.getCurrentState();
    this.stateManager.updateMultiple({
      skillSelections: selections,
      skills: this._combinedSkills(state, selections)
    }, { skipValidation: true });
  }

  /** First pool still owing Training, else the given fallback. */
  _firstOpenPool(fallback = null) {
    return resolveTrainingPools(this.getCurrentState()).find(p => !p.full)?.id ?? fallback;
  }

  /* ------------------------------------------------------------------ */
  /* Context                                                             */
  /* ------------------------------------------------------------------ */

  async _prepareStepSpecificContext(state) {
    const defs = await this._ensureTrainingPools();
    this._trimSelections();
    state = this.getCurrentState();

    const resolved = resolveTrainingPools(state);
    let activeId = state.activeTrainingPool;
    if (!resolved.some(p => p.id === activeId)) {
      activeId = resolved.find(p => !p.full)?.id ?? resolved[0]?.id ?? null;
      this.updateState('activeTrainingPool', activeId, { skipValidation: true });
    }
    const active = resolved.find(p => p.id === activeId) ?? null;

    const skillDefs = CONFIG.VAGABOND.homebrew?.skills ?? [];
    const skillLabel = key => skillDefs.find(s => s.key === key)?.label ?? game.i18n.localize(CONFIG.VAGABOND.skills?.[key] ?? key);
    const listSkills = keys => keys.map(skillLabel).join(', ');
    const anyLabel = game.i18n.localize('VAGABOND.CharBuilder.Skills.AnySkill');

    // Top panel: locked Class Training first, then every pool
    const classItem = state.selectedClass ? await fromUuid(state.selectedClass).catch(() => null) : null;
    const lockedCard = defs.guaranteed.length ? {
      source: game.i18n.format('VAGABOND.CharBuilder.Skills.SourceClass', { name: classItem?.name ?? '' }),
      detail: game.i18n.format('VAGABOND.CharBuilder.Skills.ClassTraining', { skills: listSkills(defs.guaranteed) })
    } : null;

    const reasonValue = finalStatValue(state, 'reason');
    const poolCards = resolved.map(p => {
      let source = p.source;
      let detail;
      if (p.kind === 'reason') {
        source = game.i18n.localize('VAGABOND.CharBuilder.Skills.SourceReason');
        detail = game.i18n.format('VAGABOND.CharBuilder.Skills.ReasonRule', { value: reasonValue ?? 0 });
      } else {
        detail = p.label || (p.pool
          ? game.i18n.format('VAGABOND.CharBuilder.Skills.ChooseFrom', { skills: listSkills(p.pool) })
          : anyLabel);
      }
      return { id: p.id, source, detail, used: p.picks.length, needed: p.needed, full: p.full, active: p.id === activeId };
    });

    // Difficulties: one preview actor untrained, one fully trained
    const [untrained, trained] = await Promise.all([this._previewActor(state, false), this._previewActor(state, true)]);

    const picked = new Set(resolved.flatMap(p => p.picks));
    const guaranteed = new Set(defs.guaranteed);
    const focus = state.skillFocusStat ?? null;

    const statDefs = CONFIG.VAGABOND.homebrew?.stats ?? [];
    // Grouped by Stat (column flow keeps each Stat's Skills together); Skills on an unknown Stat go last
    const ordered = [
      ...statDefs.flatMap(st => skillDefs.filter(s => s.stat === st.key)),
      ...skillDefs.filter(s => !statDefs.some(st => st.key === s.stat))
    ];
    const skills = ordered.map(s => {
      const isLocked = guaranteed.has(s.key);
      const isTrained = isLocked || picked.has(s.key);
      return {
        key: s.key,
        label: s.label,
        hint: s.hint,
        isTrained,
        isLocked,
        isCasting: s.key === defs.castingSkill,
        lockLabel: isLocked ? game.i18n.localize('TYPES.Item.class') : null,
        isOutOfPool: !isTrained && !!active && !active.eligible.includes(s.key),
        isUnfocused: !!focus && focus !== s.stat,
        value: isTrained ? trained?.system.skills?.[s.key]?.difficulty : untrained?.system.skills?.[s.key]?.difficulty,
        trainedValue: isTrained ? null : trained?.system.skills?.[s.key]?.difficulty
      };
    });

    const trainingStats = statDefs.map(st => {
      const own = skills.filter(s => skillDefs.find(d => d.key === s.key)?.stat === st.key);
      return {
        key: st.key,
        label: st.label,
        value: finalStatValue(state, st.key) ?? '—',
        total: own.length,
        focused: focus === st.key
      };
    });

    const remaining = resolved.reduce((sum, p) => sum + Math.max(0, p.needed - p.picks.length), 0);

    return {
      skillTraining: {
        lockedCard,
        pools: poolCards,
        skills,
        rows: Math.ceil(skills.length / 2),
        stats: trainingStats,
        remaining,
        allAssigned: remaining === 0 && resolved.every(p => p.picks.length === p.needed)
      },
      hasSelection: true,
      showRandomButton: resolved.length > 0,
      useTripleColumn: false
    };
  }

  /** Throwaway actor with the builder stats (+ Ancestry/Class items) to read Skill difficulties. */
  async _previewActor(state, allTrained) {
    try {
      const stats = Object.fromEntries((CONFIG.VAGABOND.homebrew?.stats ?? []).map(s => [s.key, { value: finalStatValue(state, s.key) ?? 0 }]));
      const skills = Object.fromEntries((CONFIG.VAGABOND.homebrew?.skills ?? []).map(s => [s.key, { trained: allTrained, stat: s.stat, bonus: 0 }]));
      const uuids = [state.selectedAncestry, state.selectedClass].filter(Boolean);
      const items = (await Promise.all(uuids.map(u => fromUuid(u).catch(() => null)))).filter(Boolean).map(i => i.toObject());
      const actor = new Actor.implementation({ name: 'Preview', type: 'character', system: { stats, skills }, items });
      actor.prepareData();
      return actor;
    } catch (error) {
      console.warn('Vagabond | CharBuilder - Skills preview actor failed:', error);
      return null;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  async _onToggleTraining(event, target) {
    const skill = target.value ?? target.dataset.skill;
    if (!skill) return;
    await this._ensureTrainingPools();
    const state = this.getCurrentState();
    if ((state.trainingPools?.guaranteed ?? []).includes(skill)) return;

    const resolved = resolveTrainingPools(state);
    const selections = foundry.utils.deepClone(state.skillSelections || {});

    // Uncheck: refund whichever pool paid for it
    const owner = resolved.find(p => p.picks.includes(skill));
    if (owner) {
      selections[owner.id] = (selections[owner.id] ?? []).filter(s => s !== skill);
      this._writeSelections(selections);
      this.updateState('activeTrainingPool', owner.id, { skipValidation: true });
      return;
    }

    // Check: the selected pool if it can take it, else the first pool with room that can
    const fits = p => !p.full && p.eligible.includes(skill);
    const active = resolved.find(p => p.id === state.activeTrainingPool);
    const pool = (active && fits(active)) ? active : resolved.find(fits);
    if (!pool) {
      target.checked = false;
      const label = (CONFIG.VAGABOND.homebrew?.skills ?? []).find(s => s.key === skill)?.label ?? skill;
      ui.notifications.warn(game.i18n.format('VAGABOND.CharBuilder.Skills.NoRoom', { skill: label }));
      return;
    }

    selections[pool.id] = [...(selections[pool.id] ?? []), skill];
    this._writeSelections(selections);
    if (pool.picks.length + 1 >= pool.needed) {
      this.updateState('activeTrainingPool', this._firstOpenPool(pool.id), { skipValidation: true });
    }
  }

  async _onSelectTrainingPool(event, target) {
    const id = target.dataset.pool;
    if (id) this.updateState('activeTrainingPool', id, { skipValidation: true });
  }

  async _onFocusSkillStat(event, target) {
    const stat = target.dataset.stat;
    const current = this.getCurrentState().skillFocusStat;
    this.updateState('skillFocusStat', current === stat ? null : stat, { skipValidation: true });
  }

  async _onRandomize() {
    await this.randomize();
  }

  /** Fill every pool with random eligible Skills (keeps nothing from before). */
  async randomize() {
    await this._ensureTrainingPools();
    this._writeSelections({});
    const selections = {};
    for (const p of resolveTrainingPools(this.getCurrentState())) {
      const taken = new Set([...(this.getCurrentState().trainingPools?.guaranteed ?? []), ...Object.values(selections).flat()]);
      const free = p.eligible.filter(s => !taken.has(s)).sort(() => Math.random() - 0.5);
      selections[p.id] = free.slice(0, p.count);
    }
    this._writeSelections(selections);
    this._trimSelections();
  }

  _onReset() {
    this._writeSelections({});
  }

  async _onActivate() {
    await this._ensureTrainingPools();
  }
}
