---
description: Component size limitations following the Single Responsibility Principle
glob: "**/*.{tsx,jsx}"
---

# Component Size Rules

To ensure our components follow the Single Responsibility Principle (SRP), we enforce maximum size limitations. This helps keep components focused, maintainable, and reusable.

## Maximum Component Size

1. **Line Limit**:
   - Components must not exceed 500 lines of code
   - This includes imports, component definition, and any helper functions
   - Comments and blank lines count toward this limit

2. **Enforcement**:
   - ESLint will warn when components approach the limit (at 400 lines)
   - ESLint will error when components exceed the limit (500+ lines)

## Component Breakdown

When a component exceeds or approaches the line limit, follow these guidelines to break it down:

1. **Identify Responsibilities**:
   - Determine what distinct responsibilities the component has
   - Look for natural divisions in functionality or UI sections

2. **Extract Sub-Components**:
   - Create smaller, focused components for each responsibility
   - Extract reusable UI patterns into separate components
   - Consider creating component compositions using children props

3. **Manage State**:
   - Lift shared state to parent components when necessary
   - Use context for deeply shared state
   - Consider using reducers for complex state logic

4. **Custom Hooks**:
   - Extract complex logic into custom hooks
   - Separate data fetching/manipulation from rendering

## Examples of Component Division

1. **UI Segmentation**:
   - Split large pages into logical sections (Header, Main, Sidebar, etc.)
   - Extract repeated UI patterns into reusable components

2. **Functionality Separation**:
   - Separate form handling from form display
   - Extract complex animations or transitions into dedicated components

3. **Data and Presentation**:
   - Use container/presentational pattern where appropriate
   - Create data-fetching containers and pure presentational components

Remember: Each component should do one thing well. If you can't describe a component's purpose in a single sentence, it probably needs to be divided