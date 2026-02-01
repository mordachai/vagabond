/**
 * Character Builder Module Exports
 * Main entry point for the refactored character builder components
 */

// Core Builder
export { VagabondCharBuilder } from './core/character-builder.mjs';

// State Management
export { CharacterBuilderStateManager } from './state/state-manager.mjs';
export { ValidationEngine } from './state/validation-engine.mjs';

// Data Services
export { CharacterBuilderDataService } from './services/data-service.mjs';
export { CompendiumLoader } from './services/compendium-loader.mjs';
export { ItemProcessor } from './services/item-processor.mjs';

// UI Components
export { CharacterBuilderUIComponents } from './ui/ui-components.mjs';
export { PreviewComponent } from './ui/preview-component.mjs';
export { ContextComponent } from './ui/context-component.mjs';

// Step Managers
export { BaseStepManager } from './steps/base-step-manager.mjs';
export { AncestryStepManager } from './steps/ancestry-step-manager.mjs';
export { ClassStepManager } from './steps/class-step-manager.mjs';
export { StatsStepManager } from './steps/stats-step-manager.mjs';
export { SpellsStepManager } from './steps/spells-step-manager.mjs';
export { PerksStepManager } from './steps/perks-step-manager.mjs';
export { StartingPacksStepManager } from './steps/starting-packs-step-manager.mjs';
export { GearStepManager } from './steps/gear-step-manager.mjs';

// Configuration System
export { ConfigurationSystem } from './config/configuration-system.mjs';