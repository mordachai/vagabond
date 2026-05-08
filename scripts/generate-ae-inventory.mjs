/**
 * Generate a human-readable markdown inventory of every effect in the
 * active-effects compendium source. Useful for PR review and for
 * documenting the canonical AE catalog.
 *
 * Usage: node scripts/generate-ae-inventory.mjs
 */
import fs from 'fs';
import path from 'path';

const SRC = 'packs/_source/active-effect';
const OUT = 'docs/active-effects-inventory.md';

if (!fs.existsSync('docs')) fs.mkdirSync('docs', { recursive: true });

const folders = fs.readdirSync(SRC).filter(d => fs.statSync(path.join(SRC, d)).isDirectory());

const byCategory = {};
for (const folder of folders) {
  const folderJsonPath = path.join(SRC, folder, '_Folder.json');
  let folderName = folder;
  if (fs.existsSync(folderJsonPath)) {
    folderName = JSON.parse(fs.readFileSync(folderJsonPath, 'utf8')).name;
  }

  const files = fs.readdirSync(path.join(SRC, folder))
    .filter(f => f.endsWith('.json') && f !== '_Folder.json');

  const entries = [];
  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(SRC, folder, file), 'utf8'));
    const changes = doc.system?.changes ?? [];
    const summary = changes.map(c => {
      const sym = c.type === 'override' ? '=' : c.type === 'add' ? '+' : c.type;
      return '`' + c.key + '` ' + sym + ' ' + c.value;
    }).join('; ');
    entries.push({
      name: doc.name,
      id: doc._id,
      canonical: doc.flags?.vagabond?.canonicalId || '',
      automation: doc.flags?.vagabond?.automation || '',
      statuses: (doc.statuses ?? []).join(', '),
      changes: summary || '_(no changes — see description)_',
      description: (doc.description || '').replace(/<[^>]+>/g, '').trim(),
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  byCategory[folderName] = entries;
}

const total = Object.values(byCategory).reduce((s, e) => s + e.length, 0);
const lines = [];
lines.push('# vagabond.active-effects — Inventory');
lines.push('');
lines.push(`**${total} entries across ${Object.keys(byCategory).length} folders.** Generated from \`packs/_source/active-effect/\`. Each row shows: name, canonical-slug flag (\`flags.vagabond.canonicalId\` — readable lookup key), the stable 16-char Foundry \`_id\`, automation level (status conditions only — from VCE registry), status-icon links, mechanical \`system.changes\`, and the in-system description.`);
lines.push('');
lines.push('Modules can resolve any entry by either:');
lines.push('- **UUID:** `Compendium.vagabond.active-effects.ActiveEffect.<_id>` (use with `fromUuid()`)');
lines.push('- **Canonical slug:** `pack.find(e => e.flags?.vagabond?.canonicalId === "vulnerable")` (survives GM-duplicated packs)');
lines.push('');
lines.push('---');

const order = ['⚡ Status Conditions', '🟢 Buffs & Bonuses', '🔴 Debuffs & Penalties', '⚔️ Weapon Enhancements', '🛡️ Armor Properties', '💎 Material Bonuses', '✨ Relic Powers', '📘 Class Features', '📦 Miscellaneous'];
for (const folderName of order) {
  const entries = byCategory[folderName];
  if (!entries || entries.length === 0) continue;
  lines.push('');
  lines.push(`## ${folderName} — ${entries.length} entries`);
  lines.push('');
  const hasAuto = entries.some(e => e.automation);
  if (hasAuto) {
    lines.push('| Name | Canonical ID | Stable `_id` | Automation | Statuses | Mechanics | Description |');
    lines.push('|---|---|---|---|---|---|---|');
  } else {
    lines.push('| Name | Canonical ID | Stable `_id` | Statuses | Mechanics | Description |');
    lines.push('|---|---|---|---|---|---|');
  }
  for (const e of entries) {
    const cells = hasAuto
      ? [e.name, '`'+e.canonical+'`', '`'+e.id+'`', e.automation || '—', e.statuses || '—', e.changes, e.description || '—']
      : [e.name, '`'+e.canonical+'`', '`'+e.id+'`', e.statuses || '—', e.changes, e.description || '—'];
    lines.push('| ' + cells.map(s => String(s).replace(/\|/g, '\\|')).join(' | ') + ' |');
  }
}

fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');
console.log(`Wrote ${OUT} (${lines.join('\n').length} bytes, ${total} entries)`);
