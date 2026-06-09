/**
 * Pack or unpack all compendium databases defined in system.json.
 * Usage: node src/packs.mjs [pack|unpack]
 *
 * fvtt CLI path semantics (v3):
 *   unpack: --in <dbParentDir>  (CLI appends packName to locate the DB)
 *           --out <exactSourceDir>  (files written directly here, no append)
 *   pack:   --in <exactSourceDir>  (CLI reads files directly from here)
 *           --out <dbParentDir>  (CLI appends packName to locate/create the DB)
 */
import { execSync } from 'child_process';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const systemJson = JSON.parse(readFileSync(resolve(rootDir, 'system.json'), 'utf8'));
const action = process.argv[2];

if (!['pack', 'unpack'].includes(action)) {
  console.error('Usage: node src/packs.mjs [pack|unpack]');
  process.exit(1);
}

for (const pack of systemJson.packs) {
  // pack.path e.g. "packs/ancestries" or "packs/items/alchemical-items"
  const pathParts = pack.path.split('/');
  const dbParentDir = resolve(rootDir, pathParts.slice(0, -1).join('/'));
  const sourceDir = resolve(rootDir, 'packs/_source', pack.name);

  if (action === 'unpack') {
    mkdirSync(sourceDir, { recursive: true });
    console.log(`Unpacking ${pack.name} ...`);
    execSync(
      `npx fvtt package unpack -n "${pack.name}" --in "${dbParentDir}" --out "${sourceDir}"`,
      { stdio: 'inherit', cwd: rootDir }
    );
  } else {
    console.log(`Packing ${pack.name} ...`);
    execSync(
      `npx fvtt package pack -n "${pack.name}" --in "${sourceDir}" --out "${dbParentDir}"`,
      { stdio: 'inherit', cwd: rootDir }
    );
  }
}

console.log(`\nDone: ${action}`);
