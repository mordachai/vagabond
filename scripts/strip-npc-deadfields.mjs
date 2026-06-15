/**
 * Strip dead boilerplate fields from NPC source docs.
 *
 * Removes `system.cr`, `system.power`, and `system.stats` from every
 * `type: "npc"` JSON under packs/_source. These fields were removed from the
 * NPC DataModel (cr → replaced by threatLevel; power → unused resource;
 * stats → never consumed because NPCs roll actions, not items).
 *
 * Only touches docs where `type === "npc"` — characters keep their stats.
 * Idempotent: re-running on already-clean files is a no-op.
 *
 * Usage:
 *   node scripts/strip-npc-deadfields.mjs           # apply
 *   node scripts/strip-npc-deadfields.mjs --dry-run # report only, no writes
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'packs/_source';
const FIELDS = ['cr', 'power', 'stats'];
const DRY = process.argv.includes('--dry-run');

let scanned = 0;
let changed = 0;
const perField = Object.fromEntries(FIELDS.map((f) => [f, 0]));

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.json')) processFile(full);
  }
}

function processFile(file) {
  scanned++;
  let doc;
  const raw = fs.readFileSync(file, 'utf8');
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    console.warn(`SKIP (parse error): ${file} — ${err.message}`);
    return;
  }
  if (doc.type !== 'npc' || !doc.system) return;

  let touched = false;
  for (const f of FIELDS) {
    if (f in doc.system) {
      delete doc.system[f];
      perField[f]++;
      touched = true;
    }
  }
  if (!touched) return;

  changed++;
  if (!DRY) fs.writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

walk(ROOT);

console.log(`${DRY ? '[DRY RUN] ' : ''}scanned ${scanned} json, ${changed} NPC docs ${DRY ? 'would change' : 'changed'}`);
console.log('fields removed:', perField);
