# Development Setup

This guide covers everything needed to work on the Vagabond system codebase.

## Prerequisites

- **Node.js** v18 or later — [nodejs.org](https://nodejs.org)
- **npm** — comes with Node
- **Foundry VTT** v14 (minimum v13) — required to run the system; not needed for editing CSS or compendium source files

## Install dependencies

```bash
npm install
```

This installs two dev tools:

| Package | Purpose |
|---|---|
| `sass` | Compiles `src/scss/` → `css/vagabond.css` |
| `@foundryvtt/foundryvtt-cli` | Packs and unpacks compendium databases |

## SCSS / CSS

The stylesheet lives in [`src/scss/`](src/scss/) and compiles to `css/vagabond.css`. **Never edit the compiled file** — it is overwritten on every build.

```bash
npm run watch   # Watch for changes and recompile (use during active development)
npm run build   # Compile once
```

Foundry hot-reloads `.css` files automatically, so changes appear in the browser without a full page reload as long as `npm run watch` is running.

## Compendium Packs

Compendium data is stored as LevelDB databases (`packs/*/`) at runtime, but the **source of truth for editing is the JSON files** in `packs/_source/`. The LevelDB directories are build artifacts and are not tracked in git.

### Directory layout

```
packs/
  _source/              ← edit these (tracked in git)
    ancestries/
      Orc_4b55ZN5hVR3goYRZ.json
      Human_kYLA215krVXIgmnd.json
      ...
    classes/
    weapons/
    ...
  ancestries/           ← LevelDB binary (not tracked, rebuilt from _source)
  classes/
  items/
    alchemical-items/
    armor/
    ...
  characters/
    bestiary/
    humanlike/
    active-effects/
```

### Scripts

```bash
npm run unpack   # Extract all LevelDB databases → JSON files in packs/_source/
npm run pack     # Rebuild all LevelDB databases from packs/_source/
```

### Typical workflows

**Editing content in the JSON source directly:**
1. Edit files in `packs/_source/<packname>/`
2. `npm run pack`
3. Reload Foundry (F5 or `/reload` in the console)

**Editing content in Foundry's UI, then committing:**
1. Make changes in Foundry's compendium editor
2. Stop Foundry (so the LevelDB is not locked)
3. `npm run unpack` — pulls your changes into `packs/_source/`
4. Commit the changed JSON files

### IDs and cross-module references

Each document has an `_id` field (e.g. `4b55ZN5hVR3goYRZ`) stored inside its JSON file. This is the stable key used by Foundry for compendium references (`Compendium.vagabond.ancestries.Item.4b55ZN5hVR3goYRZ`). External modules such as art packs that reference these IDs will continue to work correctly as long as you **never change the `_id` field** in the JSON. The filename (which also includes the ID) is just a label — renaming the file has no effect.

## Foundry IDE Symlinks (optional)

For IDE type checking and autocomplete against Foundry's internal APIs, you can create symlinks to your Foundry installation:

1. Create `foundry-config.yaml` at the project root (this file is gitignored):
   ```yaml
   installPath: /path/to/your/foundry/installation
   ```
2. Run:
   ```bash
   npm run createSymlinks
   ```
   This creates `foundry/client` and `foundry/common` symlinks, which a `jsconfig.json` can point to for type resolution.

## No JS build step

JavaScript is authored as ES modules in `module/` and loaded directly by Foundry — there is no bundler or transpilation step. Foundry hot-reloads `.hbs`, `.html`, `.json`, and `.css` files automatically. JavaScript changes require a full page reload.

## Running the system

Place (or symlink) this repository folder into your Foundry data directory:

```
<foundry-data>/Data/systems/vagabond/
```

Then launch Foundry and select the Vagabond system when creating a world.

If you use the `createSymlinks` approach above, the system is already in the right place relative to the data directory — no extra step needed.
