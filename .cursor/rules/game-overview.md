# Elemental Game Overview

## Description
This rule applies to the *Elemental* project, a 3D action-adventure game inspired by *Avatar: The Last Airbender*. The game centers on mastering the four elements, starting with waterbending, and is developed using Next.js, Three.js, and TypeScript. A key requirement is mobile responsiveness, ensuring the game is playable and optimized for touch controls on mobile devices.

## Applies to
- **File Patterns**: `*` (applies to all files in the project)

## Guidelines
- **Game Concept**: 
  - Players control a character who manipulates water to solve puzzles, explore environments, and engage in combat.
  - Initial mechanics focus on waterbending: detecting, extracting, shaping, and moving water.
- **Technical Stack**:
  - **Next.js**: Manages the frontend framework, routing, and server-side logic.
  - **Three.js**: Handles 3D rendering of the game world, character, and water elements.
  - **TypeScript**: Enforces type safety throughout the codebase.
  - **Hammer.js**: Implements touch gestures for mobile controls.
- **Mobile Responsiveness**:
  - Ensure full playability on mobile devices with touch-based controls (e.g., swipe to manipulate water, tap to move the character).
  - Use responsive design (e.g., media queries, dynamic resizing) to adapt the UI and 3D scenes to various screen sizes.
  - Optimize for mobile performance with low-poly models, lightweight shaders, and efficient rendering.
- **Core Mechanics**:
  - Waterbending interactions (e.g., filling containers or creating pathways with water).
  - Character movement via touch gestures.
  - Environmental puzzles tied to water manipulation.

## Reference Files
- `@pages/index.tsx`: The main entry point for the game, initializing the Three.js scene and core setup.