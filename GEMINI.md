# Vagabond (Foundry VTT System)

## Project Overview

This is the source code for the **Vagabond** RPG system implementation for **Foundry VTT**. It adapts Indestructoboy's (Taron Pounds) Vagabond RPG system, featuring custom character sheets, a downtime manager, dynamic spellcasting, and integrated progress clocks/countdown dice.

**Technologies:**
*   **Platform:** Foundry VTT (v13)
*   **Language:** JavaScript (ES Modules, `.mjs`)
*   **Styling:** SCSS (compiled to CSS)
*   **Templating:** Handlebars
*   **Data Storage:** LevelDB (Compendium Packs)

## Architecture

The system follows the standard Foundry VTT package structure with a clean separation of concerns:

*   **`module/`**: Contains the core JavaScript logic.
    *   **`vagabond.mjs`**: Main entry point. Handles initialization, settings registration, and hook setup.
    *   **`documents/`**: Extends Foundry's native Document classes (`Actor`, `Item`, `ActiveEffect`, etc.).
    *   **`sheets/`**: Application classes for Actor and Item sheets.
    *   **`applications/`**: Custom UI apps (Char Builder, Downtime Manager, etc.).
    *   **`data/`**: DataModel definitions (Foundry V10+ data architecture).
    *   **`helpers/`**: Utility classes (Damage calculation, Chat cards, Dice appearance).
    *   **`ui/`**: Canvas overlays (Progress Clocks, Countdown Dice).
*   **`packs/`**: Compendium data packs (Ancestries, Classes, Spells, Items, Bestiary).
*   **`templates/`**: Handlebars HTML templates for sheets and apps.
*   **`css/`** & **`src/scss/`**: Compiled CSS and source SCSS files.
*   **`system.json`**: The system manifest file defining metadata and entry points.

## Building and Development

This project uses **Node.js** primarily for compiling SCSS and managing development environment links.

### Prerequisites
*   Node.js and npm
*   Foundry VTT (v13 recommended)

### Key Commands

| Command | Description |
| :--- | :--- |
| `npm run build` | Compiles `src/scss/vagabond.scss` to `css/vagabond.css`. |
| `npm run watch` | Watches `src/scss` for changes and recompiles automatically. |
| `npm run createSymlinks` | Links core Foundry VTT client files to a local `foundry/` directory (requires `foundry-config.yaml`). |

### Configuration

To use the `createSymlinks` script, creating a `foundry-config.yaml` file in the root is likely required, pointing to your local Foundry installation.

## Development Conventions

*   **ES Modules:** The project strictly uses `.mjs` for JavaScript files.
*   **Global API:** The system exposes its API via `globalThis.vagabond` for use by macros and other modules.
*   **Template Preloading:** Handlebars partials are manually registered in `module/vagabond.mjs` during the `init` hook.
*   **Content Protection:** The system includes a "Secure Content Manager" in `vagabond.mjs` that gates compendium content behind trivia questions from the physical book (unless unlocked via setting or "vagabond_override").
*   **Data Models:** The system leverages Foundry's DataModel architecture (defined in `module/data/`).

## Key Features & Files

*   **Content Unlocking:** `module/vagabond.mjs` (Look for `CHALLENGES` constant).
*   **Character Builder:** `module/applications/char-builder/`
*   **Progress Clocks:** `module/documents/progress-clock.mjs` & `module/ui/progress-clock-overlay.mjs`
*   **Downtime Manager:** `module/applications/downtime-app.mjs`
