# Vagabond Character Builder - Refactored Architecture

## Overview

The Vagabond Character Builder has been refactored from a monolithic 2600+ line class into a modular, maintainable architecture. This refactoring improves code organization, performance, and maintainability while preserving all existing functionality.

## Architecture

### Directory Structure

```
char-builder/
├── core/
│   └── character-builder.mjs          # Main orchestrator (735 lines)
├── state/
│   ├── state-manager.mjs              # Centralized state management
│   └── validation-engine.mjs          # Validation logic
├── services/
│   ├── data-service.mjs               # Data access coordinator
│   ├── compendium-loader.mjs          # Compendium loading with caching
│   └── item-processor.mjs             # Data transformation
├── ui/
│   ├── ui-components.mjs              # UI orchestrator
│   ├── preview-component.mjs          # Character preview generation
│   └── context-component.mjs          # Context preparation
├── steps/
│   ├── base-step-manager.mjs          # Base class for all steps
│   ├── ancestry-step-manager.mjs      # Ancestry selection
│   ├── class-step-manager.mjs         # Class selection
│   ├── stats-step-manager.mjs         # Stat assignment
│   ├── spells-step-manager.mjs        # Spell selection
│   ├── perks-step-manager.mjs         # Perk selection
│   ├── starting-packs-step-manager.mjs# Starting pack selection
│   └── gear-step-manager.mjs          # Gear selection
├── config/
│   ├── configuration-system.mjs       # Configuration loader
│   ├── steps.json                     # Step definitions
│   ├── stats.json                     # Stat arrays
│   ├── validation.json                # Validation rules
│   ├── randomization.json             # Randomization config
│   └── ui.json                        # UI layout settings
└── index.mjs                          # Module exports
```

## Key Components

### 1. Core Builder (`core/character-builder.mjs`)

The main orchestrator that coordinates all components. Responsibilities:
- Initialize all subsystems (state, data, UI, steps)
- Handle navigation between steps
- Delegate actions to appropriate step managers
- Coordinate rendering

**Key Methods:**
- `_prepareContext()` - Prepare rendering context
- `_delegateToStepManager()` - Route actions to current step
- `getCurrentStepManager()` - Get active step manager
- `_onFinish()` - Complete character creation

### 2. State Management

#### State Manager (`state/state-manager.mjs`)
Centralized state management with validation.

**Key Methods:**
- `getCurrentState()` - Get current builder state
- `updateState(path, value, options)` - Update single state property
- `updateMultiple(updates, options)` - Update multiple properties atomically

**State Structure:**
```javascript
{
  currentStep: 'ancestry',
  selectedAncestry: null,
  selectedClass: null,
  assignedStats: {},
  skills: [],
  perks: [],
  classPerks: [],
  spells: [],
  selectedStartingPack: null,
  gear: [],
  previewUuid: null,
  selectedArrayId: null,
  unassignedValues: [],
  selectedValue: null,
  lastClassForPerks: null
}
```

#### Validation Engine (`state/validation-engine.mjs`)
Rule-based validation system with caching.

**Key Methods:**
- `validateStepCompletion(stepName, state)` - Check if step is complete
- `validatePrerequisites(stepName, state)` - Check step prerequisites
- `validateState(state)` - Validate entire state

### 3. Data Services

#### Data Service (`services/data-service.mjs`)
Coordinates data loading and access with intelligent caching.

**Key Methods:**
- `ensureDataLoaded(dataTypes)` - Load data on demand
- `getAncestry(id)`, `getClass(id)`, etc. - Get specific items
- `getFilteredItems(type, filters)` - Get filtered lists
- `clearCache()` - Clear all cached data

#### Compendium Loader (`services/compendium-loader.mjs`)
Handles compendium access with retry logic.

#### Item Processor (`services/item-processor.mjs`)
Transforms raw data into builder-ready format.

### 4. UI Components

#### UI Components Orchestrator (`ui/ui-components.mjs`)
Coordinates context preparation and rendering.

**Key Methods:**
- `prepareContext(state, currentStep)` - Build complete render context
- `updatePreview(state)` - Refresh character preview

#### Preview Component (`ui/preview-component.mjs`)
Generates character preview with change detection.

#### Context Component (`ui/context-component.mjs`)
Prepares base context for rendering.

### 5. Step Managers

Each step has a dedicated manager extending `BaseStepManager`.

#### Base Step Manager (`steps/base-step-manager.mjs`)
Foundation for all step managers.

**Key Methods:**
- `handleAction(action, event, target)` - Route user actions
- `validatePrerequisites()` - Check if step can be accessed
- `isComplete()` - Check if step is complete
- `prepareStepContext(state)` - Prepare step-specific context
- `randomize()` - Randomize step selections

**Subclass Implementation Pattern:**
```javascript
export class ExampleStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);

    // Define action handlers
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'randomize': this._onRandomize.bind(this)
    };

    // Define required data
    this.requiredData = ['examples'];
  }

  get stepName() {
    return 'example';
  }

  async _onSelectOption(event, target) {
    // Handle selection
  }

  async _prepareStepSpecificContext(state) {
    // Return step-specific context
  }
}
```

### 6. Configuration System

Externalizes hardcoded values into JSON configuration files.

**Configuration Files:**
- `steps.json` - Step order, prerequisites, completion criteria
- `stats.json` - Stat arrays, calculation rules
- `validation.json` - Validation rules, prerequisites
- `randomization.json` - Randomization weights
- `ui.json` - UI layout parameters

## Migration from Monolithic Version

The old monolithic implementation has been archived at:
`kiro-extras/archived-implementations/char-builder-monolithic.mjs`

### Key Changes

1. **State Management**: Direct `this.builderData` access → `this.stateManager.updateState()`
2. **Actions**: Monolithic action handlers → Step manager delegation
3. **Data Access**: Direct compendium calls → `this.dataService.ensureDataLoaded()`
4. **Validation**: Inline validation → `this.validationEngine.validate*()`
5. **Configuration**: Hardcoded values → External JSON files

### Backward Compatibility

The core builder maintains backward compatibility through:
- Legacy `builderData` getter/setter (maps to state manager)
- Legacy `currentStep` getter/setter
- Preserved method signatures for `_onFinish()`, `_onDismissBuilder()`, etc.

## Performance Improvements

1. **Intelligent Caching**: Compendium data cached on first load
2. **Change Detection**: Preview only regenerates on actual state changes
3. **Validation Caching**: Validation results cached with smart invalidation
4. **Batch Loading**: Related data loaded in parallel

## Testing

Tests are located in `.kiro/specs/vagabond-character-builder-refactor/`:
- `requirements.md` - Detailed requirements
- `design.md` - Architecture design document
- `tasks.md` - Implementation task list

## Future Enhancements

Potential areas for improvement:
1. Implement property-based testing suite
2. Add performance benchmarks
3. Extend configuration system with hot-reloading
4. Implement undo/redo for state changes
5. Add telemetry for step completion times

## Usage

Import the character builder:
```javascript
import { VagabondCharBuilder } from './module/applications/char-builder/index.mjs';

// Create and render builder
const builder = new VagabondCharBuilder(actor);
builder.render(true);
```

Access specific components:
```javascript
import {
  CharacterBuilderStateManager,
  ValidationEngine,
  CharacterBuilderDataService,
  AncestryStepManager
} from './module/applications/char-builder/index.mjs';
```

## Troubleshooting

### Common Issues

**Issue**: Actions not responding
- **Solution**: Check that step manager has action handler defined in `actionHandlers` object

**Issue**: Validation errors
- **Solution**: Verify configuration files are valid JSON and match expected schema

**Issue**: Data not loading
- **Solution**: Check compendium access and ensure `requiredData` is defined in step manager

**Issue**: State changes not persisting
- **Solution**: Ensure using `this.stateManager.updateState()` not direct assignment

## Development

### Adding a New Step

1. Create step manager in `steps/`:
```javascript
export class NewStepManager extends BaseStepManager {
  get stepName() { return 'newstep'; }
  // ... implement required methods
}
```

2. Add to step imports in `core/character-builder.mjs`

3. Add to step managers initialization

4. Update configuration files:
   - Add step definition to `config/steps.json`
   - Add validation rules to `config/validation.json`

### Modifying Configuration

Edit JSON files in `config/` directory. Changes take effect on next builder instantiation.

### Extending Validation

Add validation rules in `config/validation.json` or extend `ValidationEngine` class for complex logic.

## Contributors

See `.kiro/specs/vagabond-character-builder-refactor/` for complete refactoring documentation.
