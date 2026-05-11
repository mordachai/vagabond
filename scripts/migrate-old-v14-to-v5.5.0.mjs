/**
 * Migration script: old-v14 effects-compendium source JSONs → v5.5.0 active-effect compendium.
 *
 * READS:
 *   packs/_source/effects/                  — old-v14 design (188 entries in 7 folder-named subdirs)
 *   <VCE>/scripts/status-effects.mjs        — canonical 21-status registry from VCE
 *   packs/_source/active-effect/            — mordachai's 2 starter AEs (Exalted, Rage); preserved
 *
 * WRITES:
 *   packs/_source/active-effect/<folder>/<doc>.json   — migrated entries in v5.5.0 shape
 *
 * RULES:
 *   - Skip flavor-only relics (empty system.changes AND in Relic Powers folder).
 *     They live in scripts/relic-powers.mjs (Crawler Forge) with descriptions.
 *   - Keep all 19 old-v14 conditions (even the 6 status-icon-only ones — their
 *     mechanics live in code, the AE just sets the icon + description).
 *   - Add 2 missing conditions (grappling, encumbered) from VCE registry.
 *   - Sync condition descriptions with VCE registry text (more canonical).
 *   - Add flags.vagabond.automation: "fully_automated" | "partial" | "manual"
 *     to condition entries (from VCE registry).
 *   - Apply v5.5.0 shape: type:"base", duration object, _stats block,
 *     flags.vagabond.applicationMode:"permanent", _key:"!effects!<id>".
 *   - Preserve existing _id (deterministic from old-v14 generator).
 *   - Don't touch Exalted, Rage.
 */

import fs from 'fs';
import path from 'path';
import { STATUS_EFFECTS_REGISTRY } from 'file:///E:/FoundryVTTv13/data/Data/modules/vagabond-character-enhancer/scripts/status-effects.mjs';

const SRC_ROOT  = 'packs/_source/effects';
const DEST_ROOT = 'packs/_source/active-effect';

const SYSTEM_VERSION = '5.5.0';
const CORE_VERSION   = '14.361';
const NOW            = Date.now();

// Canonical category → folder display name (with emoji prefix per old-v14 style).
const FOLDER_LABELS = {
  condition:    '⚡ Status Conditions',
  buff:         '🟢 Buffs & Bonuses',
  debuff:       '🔴 Debuffs & Penalties',
  weapon:       '⚔️ Weapon Enhancements',
  armor:        '🛡️ Armor Properties',
  material:     '💎 Material Bonuses',
  relic:        '✨ Relic Powers',
  classFeature: '📘 Class Features',
  misc:         '📦 Miscellaneous',
};
const SORT_ORDER = ['condition', 'buff', 'debuff', 'weapon', 'armor', 'material', 'relic', 'classFeature', 'misc'];

// Folder ID generator: deterministic 16-char from category name.
function _folderId(cat) {
  return ('vacat' + cat).slice(0, 12).padEnd(12, '0') + 'fold';
}

// Hide token icon for non-condition categories (they're stat buffs, not visual states).
const HIDE_ICON = new Set(['buff', 'debuff', 'classFeature', 'material', 'weapon', 'armor']);

// VCE → folder/icon mapping for the 2 statuses old-v14 doesn't have.
const VCE_ONLY_NEW_CONDITIONS = ['grappling', 'encumbered'];

// Convert old-v14 entry to v5.5.0 AE document data.
function transformEntry(oldDocPath, folderName, folderId) {
  const old = JSON.parse(fs.readFileSync(oldDocPath, 'utf8'));
  const oldChanges = old.system?.changes ?? old.changes ?? [];
  const cat = old.flags?.vagabond?.category ||
              guessCategoryFromFolder(folderName) ||
              'misc';

  // Skip flavor-only relic markers — empty changes AND in Relic Powers folder.
  if (cat === 'relic' && oldChanges.length === 0) {
    return { skipped: true, reason: 'flavor-only relic (empty changes)' };
  }

  // Lift changes to v5.5.0 shape: ensure type: string, phase: "initial", priority: null.
  const changes = oldChanges.map(c => ({
    key: c.key,
    type: c.type ?? c.mode ?? 'add',
    value: typeof c.value === 'string' ? c.value : String(c.value ?? ''),
    phase: c.phase ?? 'initial',
    priority: c.priority ?? null,
  }));

  // For conditions, pull VCE description + automation.
  let description = old.description ?? '';
  // Strip leading <p> if present, will re-wrap.
  description = description.replace(/^<p>|<\/p>$/g, '').trim();
  let automation = null;
  if (cat === 'condition') {
    const slug = (old.statuses ?? [])[0] || old.name.toLowerCase();
    const vce = STATUS_EFFECTS_REGISTRY[slug];
    if (vce) {
      description = vce.description;   // VCE text is canonical
      automation = vce.automation;
    }
  }

  // Wrap description in <p> if non-empty.
  const descHtml = description ? `<p>${description}</p>` : '';

  // showIcon: numeric per V14 schema. ALWAYS=2 for visible, NEVER=0 for plumbing.
  const showIcon = HIDE_ICON.has(cat) ? 0 : 2;

  // Compose flags. canonicalId is a human-readable slug for stable module
  // lookup ("vulnerable", "barbarian-rage") regardless of GM-duplicated
  // packs whose _ids drift. Modules: pack.find(e => e.flags.vagabond.canonicalId === "vulnerable").
  const canonicalSlug = old.name
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/(?<![a-z0-9])-(?=[a-z0-9])/gi, ' minus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const flags = {
    vagabond: {
      applicationMode: 'permanent',
      canonicalId: canonicalSlug,
      ...(automation ? { automation } : {}),
    },
  };

  // Preserve old _id (16 chars, already deterministic from old-v14 generator).
  const _id = old._id;
  if (!_id || _id.length !== 16) {
    return { skipped: true, reason: `invalid _id "${_id}" on ${old.name}` };
  }

  return {
    skipped: false,
    doc: {
      name: old.name,
      _id,
      img: old.img || 'icons/svg/aura.svg',
      type: 'base',
      system: { changes },
      disabled: false,
      start: null,
      duration: { value: null, units: 'seconds', expiry: null, expired: false },
      description: descHtml,
      origin: null,
      tint: '#ffffff',
      transfer: false,
      statuses: old.statuses ?? [],
      showIcon,
      folder: folderId,
      flags,
      _stats: {
        coreVersion: CORE_VERSION,
        systemId: 'vagabond',
        systemVersion: SYSTEM_VERSION,
        createdTime: NOW,
        modifiedTime: NOW,
        lastModifiedBy: null,
        compendiumSource: null,
        duplicateSource: null,
        exportSource: null,
      },
      sort: 0,
      _key: `!effects!${_id}`,
    },
  };
}

function guessCategoryFromFolder(folderName) {
  // Check debuff BEFORE buff — "debuff" contains "buff" as substring,
  // and "Debuffs & Penalties" folder contains "Buffs". Order matters.
  const lower = folderName.toLowerCase();
  if (lower.includes('status') || lower.includes('condition')) return 'condition';
  if (lower.includes('debuff'))  return 'debuff';
  if (lower.includes('buff'))    return 'buff';
  if (lower.includes('weapon'))  return 'weapon';
  if (lower.includes('armor'))   return 'armor';
  if (lower.includes('material'))return 'material';
  if (lower.includes('relic'))   return 'relic';
  if (lower.includes('class'))   return 'classFeature';
  return 'misc';
}

// Generate a synthetic AE for VCE-only conditions (grappling, encumbered).
function synthesizeFromVCE(slug) {
  const vce = STATUS_EFFECTS_REGISTRY[slug];
  if (!vce) return null;
  // Hand-pick deterministic ID using slug pattern matching old-v14 generator.
  let h = 5381;
  for (let i = 0; i < vce.id.length; i++) h = (((h << 5) + h) + vce.id.charCodeAt(i)) | 0;
  const hash = (h >>> 0).toString(36).padStart(6, '0').slice(-6);
  const _id = (vce.id.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10).padEnd(10, '0')) + hash;
  return {
    skipped: false,
    doc: {
      name: vce.id.charAt(0).toUpperCase() + vce.id.slice(1),
      _id,
      img: vce.icon || 'icons/svg/aura.svg',
      type: 'base',
      system: { changes: [] },
      disabled: false,
      start: null,
      duration: { value: null, units: 'seconds', expiry: null, expired: false },
      description: `<p>${vce.description}</p>`,
      origin: null,
      tint: '#ffffff',
      transfer: false,
      statuses: [vce.id],
      showIcon: 2,
      folder: _folderId('condition'),
      flags: {
        vagabond: {
          applicationMode: 'permanent',
          canonicalId: vce.id,
          automation: vce.automation,
        },
      },
      _stats: {
        coreVersion: CORE_VERSION, systemId: 'vagabond', systemVersion: SYSTEM_VERSION,
        createdTime: NOW, modifiedTime: NOW, lastModifiedBy: null,
        compendiumSource: null, duplicateSource: null, exportSource: null,
      },
      sort: 0,
      _key: `!effects!${_id}`,
    },
  };
}

// Generate folder JSON to match v5.5.0 / old-v14 structure.
function makeFolderDoc(cat) {
  const id = _folderId(cat);
  return {
    name: FOLDER_LABELS[cat],
    _id: id,
    type: 'ActiveEffect',
    sorting: 'a',
    sort: (SORT_ORDER.indexOf(cat) + 1) * 100,
    flags: { vagabond: { category: cat } },
    folder: null,
    color: null,
    description: '',
    _key: `!folders!${id}`,
    _stats: {
      coreVersion: CORE_VERSION, systemId: 'vagabond', systemVersion: SYSTEM_VERSION,
      createdTime: NOW, modifiedTime: NOW, lastModifiedBy: null,
      compendiumSource: null, duplicateSource: null, exportSource: null,
    },
  };
}

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

// ── Run ────────────────────────────────────────────────────────────────────

const counts = { processed: 0, kept: 0, skipped: 0, byCategory: {} };
const seenIds = new Set();
// Track existing docs (Exalted, Rage); preserve them.
const preExisting = fs.readdirSync(DEST_ROOT)
  .filter(f => f.endsWith('.json') && !f.startsWith('_'));
for (const f of preExisting) {
  const doc = JSON.parse(fs.readFileSync(path.join(DEST_ROOT, f), 'utf8'));
  seenIds.add(doc._id);
  console.log(`PRESERVED  ${doc.name} (${doc._id})  [mordachai's starter]`);
}

// Build folder structure in dest (folders by category).
const folderDocs = SORT_ORDER.map(makeFolderDoc);
for (const fdoc of folderDocs) {
  const dir = path.join(DEST_ROOT, safeFilename(fdoc.name) + '_' + fdoc._id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '_Folder.json'), JSON.stringify(fdoc, null, 2) + '\n');
}

// Process old-v14 source.
const oldFolders = fs.readdirSync(SRC_ROOT).filter(d =>
  fs.statSync(path.join(SRC_ROOT, d)).isDirectory()
);
for (const oldFolder of oldFolders) {
  const folderJsonPath = path.join(SRC_ROOT, oldFolder, '_Folder.json');
  if (!fs.existsSync(folderJsonPath)) continue;
  const oldFolderName = JSON.parse(fs.readFileSync(folderJsonPath, 'utf8')).name;
  const cat = guessCategoryFromFolder(oldFolderName);
  const targetFolderId = _folderId(cat);
  const targetFolderDir = path.join(DEST_ROOT, safeFilename(FOLDER_LABELS[cat]) + '_' + targetFolderId);

  const files = fs.readdirSync(path.join(SRC_ROOT, oldFolder))
    .filter(f => f.endsWith('.json') && f !== '_Folder.json');

  for (const file of files) {
    counts.processed++;
    const result = transformEntry(path.join(SRC_ROOT, oldFolder, file), oldFolderName, targetFolderId);
    if (result.skipped) {
      counts.skipped++;
      console.log(`SKIP       ${file}  — ${result.reason}`);
      continue;
    }
    if (seenIds.has(result.doc._id)) {
      counts.skipped++;
      console.log(`DUP-SKIP   ${result.doc.name} (${result.doc._id})  [already exists]`);
      continue;
    }
    seenIds.add(result.doc._id);
    counts.kept++;
    counts.byCategory[cat] = (counts.byCategory[cat] || 0) + 1;
    const fname = safeFilename(result.doc.name) + '_' + result.doc._id + '.json';
    fs.writeFileSync(path.join(targetFolderDir, fname), JSON.stringify(result.doc, null, 2) + '\n');
  }
}

// Add VCE-only conditions (grappling, encumbered).
console.log();
for (const slug of VCE_ONLY_NEW_CONDITIONS) {
  const result = synthesizeFromVCE(slug);
  if (!result || result.skipped) {
    console.log(`SKIP-NEW   ${slug}  — ${result?.reason ?? 'no VCE entry'}`);
    continue;
  }
  if (seenIds.has(result.doc._id)) {
    console.log(`SKIP-NEW   ${slug}  — _id collision`);
    continue;
  }
  seenIds.add(result.doc._id);
  counts.kept++;
  counts.byCategory['condition'] = (counts.byCategory['condition'] || 0) + 1;
  const targetFolderDir = path.join(DEST_ROOT, safeFilename(FOLDER_LABELS['condition']) + '_' + _folderId('condition'));
  const fname = safeFilename(result.doc.name) + '_' + result.doc._id + '.json';
  fs.writeFileSync(path.join(targetFolderDir, fname), JSON.stringify(result.doc, null, 2) + '\n');
  console.log(`ADDED-NEW  ${result.doc.name} (${result.doc._id})  [from VCE registry]`);
}

console.log();
console.log('=== Migration summary ===');
console.log('Processed:', counts.processed);
console.log('Kept:     ', counts.kept);
console.log('Skipped:  ', counts.skipped);
console.log();
console.log('Kept by category:');
for (const cat of SORT_ORDER) {
  if (counts.byCategory[cat]) console.log(`  ${FOLDER_LABELS[cat]}: ${counts.byCategory[cat]}`);
}
console.log();
console.log('Total docs in dest (incl. preserved + folders):',
  fs.readdirSync(DEST_ROOT, { recursive: true }).filter(f => f.endsWith('.json')).length);
