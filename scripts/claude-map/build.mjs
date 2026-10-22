// Generates docs/map/INDEX.md: one line per module under module/ — size, exports, and the first
// sentence of its header doc comment. Read on demand (never auto-loaded) to find where things live.
// Run: node scripts/claude-map/build.mjs   (also run by the post-commit hook)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'docs/map/INDEX.md');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith('.mjs') ? [p] : [];
  });
}

/** First sentence of the first doc comment before any code that is not an import (or a `foundry.*` destructure). */
function summary(src) {
  const head = src.replace(/^(\s*(import\b[^;]*;|const\s*\{[^}]*\}\s*=\s*foundry\.[\w.]+;|\/\/[^\n]*)\s*)*/s, '');
  const m = head.match(/^\s*\/\*\*?([\s\S]*?)\*\//);
  if (!m) return '';
  const text = m[1].split('\n')
    .map(l => l.replace(/^\s*\*\s?/, '').trim())
    .filter(l => l && !l.startsWith('@'))
    .join(' ');
  const sentence = text.match(/^.*?\.(?=\s|$)/)?.[0] ?? text;
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence;
}

function exportsOf(src) {
  const names = new Set();
  for (const m of src.matchAll(/^export\s+(?:default\s+)?(?:async\s+)?(?:class|function\*?|const|let)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const n = part.trim().split(/\s+as\s+/).pop();
      if (n) names.add(n);
    }
  }
  return [...names];
}

const files = walk(path.join(root, 'module')).sort();
const byDir = new Map();
for (const f of files) {
  const rel = path.relative(root, f).replaceAll('\\', '/');
  const dir = path.posix.dirname(rel);
  const src = fs.readFileSync(f, 'utf8');
  const lines = src.split('\n').length;
  const ex = exportsOf(src);
  const exText = ex.length > 6 ? `${ex.slice(0, 6).join(', ')} +${ex.length - 6}` : ex.join(', ');
  const row = `- \`${path.posix.basename(rel)}\` (${lines}) ${exText ? `**${exText}**` : ''}${summary(src) ? ` — ${summary(src)}` : ''}`;
  if (!byDir.has(dir)) byDir.set(dir, []);
  byDir.get(dir).push(row);
}

const parts = [
  '# Module map (generated — do not edit)',
  '',
  'One line per module: `file` (lines) **exports** — header summary. Regenerate: `node scripts/claude-map/build.mjs`.',
  'Modules without a summary have no header doc comment; add one (the header is the module\'s spec).',
];
for (const [dir, rows] of byDir) parts.push('', `## ${dir}/`, '', ...rows);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, parts.join('\n') + '\n');
console.log(`docs/map/INDEX.md: ${files.length} modules`);
