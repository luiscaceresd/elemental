# Elemental Game - Studio Ghibli Inspired 3D Game

A beautiful 3D game with Studio Ghibli-inspired visuals, built with Three.js and React.

## Features

### Waterbending Mechanism

The game includes a waterbending mechanic allowing you to manipulate water entities:

1. **Water Entities**: Blue spheres scattered throughout the environment that represent manipulable water
2. **Crosshair**: Centered on your screen, used to target water for bending
3. **Waterbending Control**: Hold down the left mouse button to attract nearby water toward your crosshair

#### How to Use

1. Position your crosshair near water entities (blue spheres)
2. Hold the left mouse button to activate waterbending
3. Water within range will be pulled toward your crosshair
4. Release the mouse button to stop the waterbending effect

The closer the water is to your crosshair, the stronger the pulling effect will be.

### Environment

- **Terrain**: Procedurally generated landscape with realistic color variations based on height and slope
- **Trees**: Whimsical, Ghibli-inspired trees scattered across the terrain
- **Sky**: Gradient sky with atmospheric depth
- **Water**: Both manipulable water entities and a larger water plane with realistic wave animations

### Controls

- **WASD**: Move character
- **Space**: Jump
- **Mouse**: Look around
- **Left Mouse Button**: Waterbend
- **Mobile**: On-screen joystick and jump button

## Technical Details

- **Character-Terrain Collision**: Character properly follows the contours of the terrain
- **Shader-Based Water**: Custom shaders for realistic water with wave animations
- **Atmospheric Effects**: Fog and lighting to create a Ghibli-inspired aesthetic

## Development

This project uses:
- Next.js
- Three.js for 3D rendering
- React for UI components
- TypeScript for type safety

To run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to see the result.

## Overview

This game allows players to control a character and manipulate elemental powers like water. It features:

- 3D environment using Three.js
- Responsive design for both desktop and mobile
- WASD/Arrow key movement for desktop
- Touch controls for mobile using joystick and buttons
- Realistic physics-based movement

## Development

### Installation

```bash
# Install dependencies
pnpm install

# Run development server
pnpm dev
```

### Project Structure

- `app/page.tsx` - Main entry point
- `app/components/GameWrapper.tsx` - Client component wrapper for dynamic imports
- `app/components/GameCanvas.tsx` - Main game scene manager
- `app/components/Character.tsx` - Character management
- `app/components/WaterBending.tsx` - Water element management
- `app/components/MobileControls.tsx` - Mobile-specific controls

### Documentation

For code organization and best practices:

- [React Best Practices](./docs/best-practices.md) - Guidelines for React usage, particularly on minimizing useEffect
- [Elemental Game Guidelines](./docs/elemental-game-guidelines.md) - Specific guidelines for this project

### Cursor Rules

This project uses Cursor Rules to enforce coding standards and best practices:

- `.cursor/rules/react-useEffect-rules.md` - Rules for minimizing useEffect in React components
- `.cursor/rules/threejs-game-rules.md` - Best practices for Three.js game development
- `.cursor/rules/project-standards.md` - General project coding standards

These rules are automatically applied by Cursor when working with relevant files, ensuring consistent code quality throughout the project.

## Controls

### Desktop
- `W` - Move forward
- `A` - Move left
- `S` - Move backward
- `D` - Move right
- `Space` - Jump
- Mouse Drag - Rotate camera

### Mobile
- Virtual joystick (bottom left) - Move character
- Jump button (bottom right) - Jump
- Touch and drag - Manipulate water

## Technologies

- Next.js
- React
- Three.js - 3D rendering
- Hammer.js - Touch gestures
- Nipple.js - Virtual joystick

## License

MIT
