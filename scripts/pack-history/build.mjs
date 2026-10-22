/**
 * Build `assets/pack-history.json` — what every compendium document field has looked like in past pack versions.
 * The world sync (`module/helpers/pack-sync.mjs`) uses it to tell "untouched but outdated" copies (value matches an
 * old pack value → update) from user edits (value never shipped → keep).
 *
 * Source: every commit that touched `packs/_source` (oldest first) + the working tree (unreleased pack edits).
 * Output, per document key (`<pack>.<Type>.<id>[.<Type>.<id>…]`, the compendium uuid tail):
 *   p: { <leaf path>: [hash, …] }  only leaves that ever had 2+ values (ABSENT = "~" when a version lacked it)
 *   f: first-seen time (s)         embedded documents only (effects, NPC items): copies older than this lack them
 *                                  because they are new, not because the user deleted them
 *
 * Usage: node scripts/pack-history/build.mjs   (npm run pack-history) — run before each release.
 */
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { ABSENT, syncFields, leaves, hashValue, keyFromSourceKey } from '../../module/helpers/pack-sync-core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = 'packs/_source';
const OUT = resolve(root, 'assets/pack-history.json');
// Shop stock is a snapshot of other packs' items; those sync through their own source
const SKIP_PACKS = new Set(['stores', 'macro-scripts', 'fx-macros']);
const git = (args, opts = {}) => execFileSync('git', args, { cwd: root, maxBuffer: 1 << 30, ...opts });

// ── versions: pack commits (oldest first) + working tree ────────────────────────────────────────────────────────
const commits = git(['log', '--reverse', '--format=%H %ct', '--', SOURCE]).toString().trim().split('\n')
  .filter(Boolean).map(l => { const [hash, t] = l.split(' '); return { hash, t: Number(t) }; });

const versions = [];
const blobShas = new Set();
for (const c of commits) {
  const files = new Map();
  for (const line of git(['ls-tree', '-r', c.hash, SOURCE]).toString().split('\n')) {
    const m = /^\d+ blob ([0-9a-f]+)\t(.+\.json)$/.exec(line);
    if (!m) continue;
    files.set(m[2], m[1]);
    blobShas.add(m[1]);
  }
  versions.push({ t: c.t, files });
}

const walk = (dir) => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : (name.endsWith('.json') ? [full] : []);
});
const worktree = new Map();
const worktreeText = new Map();
for (const full of walk(resolve(root, SOURCE))) {
  const rel = relative(root, full).replaceAll('\\', '/');
  worktree.set(rel, `wt:${rel}`);
  worktreeText.set(`wt:${rel}`, readFileSync(full, 'utf8'));
}
versions.push({ t: Math.floor(Date.now() / 1000), files: worktree });

// ── blob contents (one `git cat-file --batch` for all) ──────────────────────────────────────────────────────────
const texts = new Map(worktreeText);
{
  const shas = [...blobShas];
  const out = git(['cat-file', '--batch'], { input: shas.join('\n') + '\n' });
  let pos = 0;
  while (pos < out.length) {
    const nl = out.indexOf(10, pos);
    const [sha, , size] = out.subarray(pos, nl).toString().split(' ');
    const len = Number(size);
    texts.set(sha, out.subarray(nl + 1, nl + 1 + len).toString('utf8'));
    pos = nl + 1 + len + 1;
  }
}

// ── explode one file version into its documents (top + embedded), cached per blob ──────────────────────────────
const exploded = new Map();
function explode(path, blob) {
  if (exploded.has(blob)) return exploded.get(blob);
  const pack = path.split('/')[2];
  const docs = [];
  if (SKIP_PACKS.has(pack)) { exploded.set(blob, docs); return docs; }
  let data = null;
  try { data = JSON.parse(texts.get(blob) ?? 'null'); } catch { data = null; }
  const visit = (doc) => {
    const key = keyFromSourceKey(doc?._key);
    if (!key) return;
    const kind = key.split('.').at(-2);
    if (kind === 'Macro') return;
    const map = new Map(leaves(kind, syncFields(kind, doc)).map(([p, v]) => [p, hashValue(v)]));
    docs.push({ key: `${pack}.${key}`, map });
    for (const item of doc.items ?? []) visit(item);
    for (const effect of doc.effects ?? []) visit(effect);
  };
  if (data) visit(data);
  exploded.set(blob, docs);
  return docs;
}

// ── per document: unique leaf maps across versions + first-seen time ──────────────────────────────────────────
const docs = new Map();
for (const v of versions) {
  for (const [path, blob] of v.files) {
    for (const { key, map } of explode(path, blob)) {
      let d = docs.get(key);
      if (!d) docs.set(key, d = { first: v.t, maps: new Set() });
      d.maps.add(map);
    }
  }
}

const result = { built: new Date().toISOString(), commits: commits.length, docs: {} };
let leafCount = 0;
for (const [key, d] of docs) {
  const paths = new Set();
  for (const m of d.maps) for (const p of m.keys()) paths.add(p);
  const p = {};
  for (const path of paths) {
    const seen = new Set();
    for (const m of d.maps) seen.add(m.get(path) ?? ABSENT);
    if (seen.size > 1) { p[path] = [...seen]; leafCount++; }
  }
  const embedded = key.split('.').length > 3;
  if (!Object.keys(p).length && !embedded) continue;
  const entry = {};
  if (Object.keys(p).length) entry.p = p;
  if (embedded) entry.f = d.first;
  result.docs[key] = entry;
}

writeFileSync(OUT, JSON.stringify(result));
const kb = Math.round(statSync(OUT).size / 1024);
console.log(`pack-history: ${versions.length} versions, ${docs.size} documents, ${Object.keys(result.docs).length} kept, ${leafCount} changing fields → ${relative(root, OUT)} (${kb} KB)`);
