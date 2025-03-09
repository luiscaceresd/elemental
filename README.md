# Elemental Game

A 3D game built with Next.js, Three.js, and React where players can manipulate elemental powers.

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
