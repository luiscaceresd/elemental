---
description: Game physics standards using CannonJS for the elemental game project
glob: "**/*.{ts,tsx,js,jsx}"
---

# Game Physics Rules

The project uses CannonJS for all physics simulations. This ensures consistent physics behavior across the game.

## CannonJS Implementation

1. **Physics Setup**:
   - Use CannonJS for all physics calculations
   - Initialize physics world with appropriate gravity and settings
   - Match physics world units to match game world scale

2. **Physics Bodies**:
   - Create appropriate physics bodies for game objects
   - Use simple collision shapes where possible (sphere, box, cylinder)
   - Use compound shapes for more complex objects
   - Set mass, friction, and restitution appropriately for different materials

3. **Physics Integration**:
   - Sync Three.js objects with Cannon.js bodies each frame
   - Handle position and rotation updates properly
   - Implement proper timestep handling to avoid physics instabilities

4. **Performance Considerations**:
   - Use sleep states for inactive objects
   - Implement broadphase collision detection appropriately
   - Consider using worker threads for physics calculations if necessary
   - Optimize collision shapes to balance accuracy with performance

## Physics Features

1. **Constraints and Joints**:
   - Use CannonJS constraints for connected objects
   - Implement appropriate joint types (hinge, point-to-point, etc.)
   - Set limits and motors for joints when needed

2. **Forces and Impulses**:
   - Apply forces for continuous effects (wind, gravity fields)
   - Use impulses for instantaneous effects (explosions, impacts)
   - Implement custom force fields as needed

3. **Collision Detection and Response**:
   - Set up proper collision groups and masks
   - Implement collision callbacks for game events
   - Use collision filtering to optimize performance

## Testing Physics

1. **Physics Tests**:
   - Write tests for physics interactions
   - Verify consistent behavior across different scenarios
   - Test edge cases and extreme conditions

2. **Debugging Tools**:
   - Implement visual debugging for physics bodies
   - Create tools to visualize forces and collisions
   - Log physics performance metrics

Remember: Physics should enhance gameplay while feeling natural. Tune parameters for gameplay feel rather than perfect physical accuracy when necessary
