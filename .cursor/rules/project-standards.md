---
description: General coding standards for the elemental game project
glob: "**/*.{ts,tsx,js,jsx}"
---

# Elemental Game Project Standards

When working on any code in this project, follow these general standards:

## General Code Style

1. **TypeScript**:
   - Use proper TypeScript types for all variables, parameters, and return values
   - Avoid `any` types when possible, use proper interfaces and type definitions
   - Use type assertions only when necessary

2. **Formatting**:
   - Use consistent indentation (2 spaces)
   - Use semicolons at the end of statements
   - Follow single quotes for strings

3. **Naming Conventions**:
   - Use PascalCase for components, interfaces, and types
   - Use camelCase for variables, functions, and methods
   - Use descriptive names that convey purpose

## Imports and Dependencies

1. **Import Order**:
   - React and React-related imports first
   - Third-party libraries next
   - Project modules last
   - CSS/SCSS imports at the end

2. **Package Management**:
   - Always use pnpm for package management
   - Include proper types for all dependencies
   - Create custom type definitions when official types aren't available

## Error Handling

1. **Client-Side Errors**:
   - Handle potential errors in asynchronous operations
   - Implement fallbacks for failed asset loading
   - Provide user feedback for errors

2. **Type Safety**:
   - Use null checks before accessing potentially undefined values
   - Use optional chaining (`?.`) and nullish coalescing (`??`) operators
   - Add appropriate type guards

## Documentation

1. **Code Comments**:
   - Add comments for complex logic
   - Document non-obvious behavior
   - Use JSDoc style for function documentation

2. **Project Documentation**:
   - Keep README up to date
   - Document architecture decisions
   - Update documentation when making significant changes

## Performance

1. **Rendering Optimization**:
   - Avoid unnecessary re-renders
   - Use memoization for expensive calculations
   - Implement virtualization for long lists

2. **Asset Management**:
   - Optimize assets for web delivery
   - Implement lazy loading for non-critical assets
   - Consider code splitting for large components

3. **State Management**:
   - Keep state as local as possible
   - Use context for truly global state
   - Consider using reducers for complex state logic

@file:../README.md 