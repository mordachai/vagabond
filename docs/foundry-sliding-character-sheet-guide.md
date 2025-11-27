# Sliding Character Sheet Implementation Guide for Foundry VTT v13

## Overview

This guide details how to implement a unique 3-layer sliding character sheet interface in Foundry VTT v13. The system creates an organic, paper-like experience where users can slide supplementary sheets (Skills and Equipment) to the left and right while keeping the main character sheet always visible and accessible.

## Core Concept

### Visual Design
- **Main Sheet**: Always visible, centered, contains primary character information
- **Skills Sheet**: Positioned slightly left with counter-clockwise rotation, slides left when accessed
- **Equipment Sheet**: Positioned slightly right with clockwise rotation, slides right when accessed

### Interaction Model
- **20px Click Zones**: Dedicated strips on each sliding sheet that trigger the slide animation
- **Content Interaction**: All character data (stats, skills, equipment) remains fully interactive
- **Organic Animations**: Natural paper-like rotations and smooth transitions

## Technical Architecture

### 1. ApplicationV2 Structure

```javascript
// character-sheet.js
export class SlidingCharacterSheet extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {
        id: "sliding-character-sheet-{id}",
        classes: ["sliding-character-sheet"],
        tag: "form",
        resizable: false,
        minimizable: true,
        window: {
            title: "Character Sheet",
            icon: "fas fa-user"
        },
        position: {
            width: 400,
            height: 500
        },
        actions: {
            slideSkills: this._onSlideSkills,
            slideEquipment: this._onSlideEquipment,
            updateField: this._onUpdateField
        }
    };

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.skillsSlid = false;
        this.equipmentSlid = false;
    }

    get title() {
        return `${this.actor.name} - Character Sheet`;
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        return {
            ...context,
            actor: this.actor,
            system: this.actor.system,
            skillsSlid: this.skillsSlid,
            equipmentSlid: this.equipmentSlid,
            isOwner: this.actor.isOwner,
            isEditable: this.isEditable
        };
    }

    static PARTS = {
        main: {
            template: "systems/your-system/templates/character/main-sheet.hbs"
        },
        skills: {
            template: "systems/your-system/templates/character/skills-sheet.hbs"
        },
        equipment: {
            template: "systems/your-system/templates/character/equipment-sheet.hbs"
        }
    };

    async _renderHTML(context, options) {
        const templates = await Promise.all([
            this.constructor.PARTS.main.template,
            this.constructor.PARTS.skills.template,
            this.constructor.PARTS.equipment.template
        ].map(template => loadTemplate(template)));

        const html = `
            <div class="character-sheet-container">
                <!-- Main Sheet -->
                <div class="sheet sheet-main" data-sheet="main">
                    ${await renderTemplate(templates[0], context)}
                </div>

                <!-- Skills Sheet -->
                <div class="sheet sheet-back-1 ${context.skillsSlid ? 'slide-out' : ''}" data-sheet="skills">
                    <div class="click-zone click-zone-left" data-action="slideSkills" data-tooltip="Toggle Skills Sheet"></div>
                    ${await renderTemplate(templates[1], context)}
                </div>

                <!-- Equipment Sheet -->
                <div class="sheet sheet-back-2 ${context.equipmentSlid ? 'slide-out' : ''}" data-sheet="equipment">
                    <div class="click-zone click-zone-right" data-action="slideEquipment" data-tooltip="Toggle Equipment Sheet"></div>
                    ${await renderTemplate(templates[2], context)}
                </div>
            </div>
        `;

        return html;
    }

    _onSlideSkills(event, target) {
        this.skillsSlid = !this.skillsSlid;
        this._updateSlideState();
    }

    _onSlideEquipment(event, target) {
        this.equipmentSlid = !this.equipmentSlid;
        this._updateSlideState();
    }

    _updateSlideState() {
        const skillsSheet = this.element.querySelector('[data-sheet="skills"]');
        const equipmentSheet = this.element.querySelector('[data-sheet="equipment"]');

        skillsSheet?.classList.toggle('slide-out', this.skillsSlid);
        equipmentSheet?.classList.toggle('slide-out', this.equipmentSlid);
    }

    async _onUpdateField(event, target) {
        const field = target.dataset.field;
        const value = target.type === "checkbox" ? target.checked : target.value;
        
        await this.actor.update({
            [field]: value
        });
    }
}
```

### 2. CSS Styling

```css
/* sliding-character-sheet.css */

.sliding-character-sheet {
    background: transparent;
    border: none;
    box-shadow: none;
}

.character-sheet-container {
    position: relative;
    width: 370px;
    height: 470px;
    perspective: 1000px;
}

.sheet {
    position: absolute;
    width: 100%;
    height: 100%;
    background: #f8f6f0;
    border: 2px solid #333;
    border-radius: 6px;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.3);
    transition: transform 0.15s ease-out;
    overflow: hidden;
    cursor: default;
}

/* Initial positions with organic rotations */
.sheet-main {
    z-index: 3;
    transform: translateZ(0);
}

.sheet-back-1 {
    z-index: 2;
    transform: translateX(-8px) translateY(8px) rotate(-1.5deg);
    background: #f0f8f6;
}

.sheet-back-2 {
    z-index: 1;
    transform: translateX(16px) translateY(16px) rotate(1.5deg);
    background: #f6f0f8;
}

/* Sliding states with enhanced organic rotation */
.sheet-back-1.slide-out {
    transform: translateX(-200px) translateY(8px) rotate(-3deg);
}

.sheet-back-2.slide-out {
    transform: translateX(200px) translateY(16px) rotate(3deg);
}

/* Hover effects */
.sheet-back-1:hover:not(.slide-out) {
    transform: translateX(-12px) translateY(8px) rotate(-2deg);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.sheet-back-2:hover:not(.slide-out) {
    transform: translateX(20px) translateY(16px) rotate(2deg);
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
}

/* Click zones */
.click-zone {
    position: absolute;
    width: 20px;
    height: 100%;
    top: 0;
    cursor: pointer;
    z-index: 1;
    transition: background 0.1s ease;
}

.click-zone-left {
    left: 0;
    background: rgba(76, 175, 80, 0.2);
}

.click-zone-right {
    right: 0;
    background: rgba(156, 39, 176, 0.2);
}

.click-zone:hover {
    background: rgba(255, 255, 255, 0.5) !important;
}

/* Content styling */
.sheet-content {
    padding: 20px 15px;
    height: 100%;
    box-sizing: border-box;
}

.sheet-title {
    text-align: center;
    font-size: 14px;
    font-weight: bold;
    margin-bottom: 15px;
    color: #333;
}

/* Interactive elements */
.stat-box, .info-line, .character-portrait {
    cursor: pointer;
    transition: all 0.1s ease;
}

.stat-box:hover, .info-line:hover {
    background: #4CAF50 !important;
}

.character-portrait:hover {
    border-color: #4CAF50;
    transform: scale(1.05);
}

/* Form elements */
.sliding-character-sheet input, 
.sliding-character-sheet select, 
.sliding-character-sheet textarea {
    background: rgba(255, 255, 255, 0.8);
    border: 1px solid #ccc;
    border-radius: 3px;
    padding: 4px 8px;
    font-size: 12px;
}

.sliding-character-sheet input:focus, 
.sliding-character-sheet select:focus, 
.sliding-character-sheet textarea:focus {
    outline: none;
    border-color: #4CAF50;
    background: rgba(255, 255, 255, 0.95);
}
```

### 3. Template Structure

#### Main Sheet Template (main-sheet.hbs)
```handlebars
<div class="sheet-content">
    <div class="sheet-title">{{actor.name}}</div>
    
    <div class="character-portrait">
        <img src="{{actor.img}}" alt="{{actor.name}}" />
    </div>
    
    <div class="basic-info">
        <div class="form-group">
            <label>Level</label>
            <input type="number" name="system.level" value="{{system.level}}" 
                   data-field="system.level" data-action="updateField" />
        </div>
        
        <div class="form-group">
            <label>Class</label>
            <input type="text" name="system.class" value="{{system.class}}" 
                   data-field="system.class" data-action="updateField" />
        </div>
    </div>
    
    <div class="attributes">
        {{#each system.attributes as |attr key|}}
        <div class="attribute">
            <label>{{capitalize key}}</label>
            <input type="number" name="system.attributes.{{key}}.value" 
                   value="{{attr.value}}" 
                   data-field="system.attributes.{{key}}.value" 
                   data-action="updateField" />
        </div>
        {{/each}}
    </div>
    
    <div class="health">
        <div class="form-group">
            <label>HP</label>
            <input type="number" name="system.hp.value" value="{{system.hp.value}}" 
                   data-field="system.hp.value" data-action="updateField" />
            <span>/</span>
            <input type="number" name="system.hp.max" value="{{system.hp.max}}" 
                   data-field="system.hp.max" data-action="updateField" />
        </div>
    </div>
</div>
```

#### Skills Sheet Template (skills-sheet.hbs)
```handlebars
<div class="sheet-content">
    <div class="sheet-title">Skills & Abilities</div>
    
    <div class="skills-list">
        {{#each system.skills as |skill key|}}
        <div class="skill-item">
            <label>{{skill.name}}</label>
            <input type="number" name="system.skills.{{key}}.value" 
                   value="{{skill.value}}" min="0" max="20"
                   data-field="system.skills.{{key}}.value" 
                   data-action="updateField" />
            <span class="modifier">+{{skill.modifier}}</span>
        </div>
        {{/each}}
    </div>
    
    <div class="abilities">
        {{#each system.abilities as |ability|}}
        <div class="ability-item">
            <h4>{{ability.name}}</h4>
            <p>{{ability.description}}</p>
            {{#if ability.uses}}
            <div class="uses">
                <label>Uses</label>
                <input type="number" name="system.abilities.{{@index}}.currentUses" 
                       value="{{ability.currentUses}}" max="{{ability.maxUses}}"
                       data-field="system.abilities.{{@index}}.currentUses" 
                       data-action="updateField" />
                <span>/{{ability.maxUses}}</span>
            </div>
            {{/if}}
        </div>
        {{/each}}
    </div>
</div>
```

#### Equipment Sheet Template (equipment-sheet.hbs)
```handlebars
<div class="sheet-content">
    <div class="sheet-title">Equipment & Inventory</div>
    
    <div class="equipment-list">
        {{#each system.equipment as |item|}}
        <div class="equipment-item">
            <div class="item-name">{{item.name}}</div>
            <div class="item-quantity">
                <input type="number" name="system.equipment.{{@index}}.quantity" 
                       value="{{item.quantity}}" min="0"
                       data-field="system.equipment.{{@index}}.quantity" 
                       data-action="updateField" />
            </div>
            <div class="item-weight">{{item.weight}}lbs</div>
        </div>
        {{/each}}
    </div>
    
    <div class="inventory-summary">
        <div class="carrying-capacity">
            <label>Carrying Capacity</label>
            <span>{{system.totalWeight}}/{{system.carryingCapacity}} lbs</span>
        </div>
        
        <div class="currency">
            <div class="form-group">
                <label>Gold</label>
                <input type="number" name="system.currency.gold" 
                       value="{{system.currency.gold}}" 
                       data-field="system.currency.gold" 
                       data-action="updateField" />
            </div>
        </div>
    </div>
    
    <div class="notes">
        <label>Notes</label>
        <textarea name="system.notes" 
                  data-field="system.notes" 
                  data-action="updateField">{{system.notes}}</textarea>
    </div>
</div>
```

## Implementation Steps

### 1. System Integration

Add to your system's `module.json`:
```json
{
    "styles": [
        "styles/sliding-character-sheet.css"
    ],
    "templates": [
        "templates/character/main-sheet.hbs",
        "templates/character/skills-sheet.hbs", 
        "templates/character/equipment-sheet.hbs"
    ]
}
```

### 2. Actor Configuration

Register the character sheet in your system:
```javascript
// system.js
import { SlidingCharacterSheet } from "./apps/character-sheet.js";

Hooks.once("init", () => {
    // Register character sheet
    Actors.registerSheet("your-system", SlidingCharacterSheet, {
        types: ["character"],
        makeDefault: true,
        label: "Sliding Character Sheet"
    });
});
```

### 3. Data Model Requirements

Your actor data model should support:
```javascript
// actor-data.js
export const CharacterData = {
    level: { type: Number, initial: 1 },
    class: { type: String, initial: "" },
    
    attributes: {
        strength: { value: 10 },
        dexterity: { value: 10 },
        constitution: { value: 10 },
        intelligence: { value: 10 },
        wisdom: { value: 10 },
        charisma: { value: 10 }
    },
    
    hp: {
        value: { type: Number, initial: 10 },
        max: { type: Number, initial: 10 }
    },
    
    skills: {
        // Define your skills here
        athletics: { 
            name: "Athletics", 
            value: 0, 
            modifier: 0 
        }
        // ... more skills
    },
    
    equipment: [
        // Array of equipment items
    ],
    
    abilities: [
        // Array of special abilities
    ],
    
    currency: {
        gold: { type: Number, initial: 0 }
    },
    
    notes: { type: String, initial: "" }
};
```

## Advanced Features

### 1. State Persistence

To remember which sheets are open:
```javascript
// In your character sheet class
async _updateObject(event, formData) {
    // Save slide states to actor flags
    await this.actor.setFlag("your-system", "slideStates", {
        skills: this.skillsSlid,
        equipment: this.equipmentSlid
    });
    
    return super._updateObject(event, formData);
}

async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    // Restore slide states from flags
    const slideStates = this.actor.getFlag("your-system", "slideStates") || {};
    this.skillsSlid = slideStates.skills || false;
    this.equipmentSlid = slideStates.equipment || false;
    
    return {
        ...context,
        skillsSlid: this.skillsSlid,
        equipmentSlid: this.equipmentSlid
    };
}
```

### 2. Keyboard Navigation

Add keyboard shortcuts:
```javascript
_onKeyDown(event) {
    // Q key toggles skills sheet
    if (event.key === 'q' && !event.repeat) {
        this._onSlideSkills();
        return false;
    }
    
    // E key toggles equipment sheet  
    if (event.key === 'e' && !event.repeat) {
        this._onSlideEquipment();
        return false;
    }
    
    return super._onKeyDown(event);
}
```

### 3. Sound Effects

Add audio feedback:
```javascript
_onSlideSkills(event, target) {
    this.skillsSlid = !this.skillsSlid;
    
    // Play slide sound
    AudioHelper.play({
        src: "systems/your-system/sounds/paper-slide.ogg",
        volume: 0.3
    });
    
    this._updateSlideState();
}
```

## Best Practices

### 1. Performance Considerations
- Use CSS transforms instead of changing position properties
- Leverage GPU acceleration with `transform3d()` 
- Minimize DOM reflows by batching style changes
- Consider using `will-change: transform` for better performance

### 2. Accessibility
- Add ARIA labels to click zones
- Ensure keyboard navigation works
- Provide alternative access methods for users who can't use the sliding interface
- Test with screen readers

### 3. Responsive Design
- Test on different screen sizes
- Consider mobile/tablet interactions
- Provide fallback layouts for small screens

### 4. User Experience
- Save slide states between sessions
- Provide visual feedback for all interactions
- Consider adding subtle animations to guide user attention
- Test with actual players to refine the interface

## Troubleshooting

### Common Issues

1. **Sheets not sliding**: Check CSS transitions and transform properties
2. **Click zones not working**: Verify z-index values and event handling
3. **Content not interactive**: Ensure click event propagation is properly managed
4. **Performance issues**: Check for unnecessary DOM manipulations or heavy CSS operations

### Debug Mode

Add debug logging:
```javascript
_onSlideSkills(event, target) {
    if (game.settings.get("your-system", "debugMode")) {
        console.log("Sliding skills sheet:", this.skillsSlid ? "in" : "out");
    }
    
    this.skillsSlid = !this.skillsSlid;
    this._updateSlideState();
}
```

## Conclusion

This sliding character sheet system provides a unique and engaging way to organize character information in Foundry VTT. The organic animations and intuitive interaction model create a tactile, paper-like experience that enhances immersion while maintaining full functionality.

The modular design allows for easy customization and extension, while the ApplicationV2 foundation ensures compatibility with modern Foundry VTT practices.

Remember to test thoroughly with your players and gather feedback to refine the interface for your specific use case.
