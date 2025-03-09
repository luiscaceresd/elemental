# Studio Ghibli Art Style for Your Game

## Description
This rule ensures that the visual design of your game reflects the whimsical, natural, and enchanting art style inspired by Studio Ghibli. It applies to all visual elements, including characters, environments, lighting, and animations, to create a cohesive and immersive experience.

## Applies to
- **File Patterns**: `**/*.{tsx,ts,js,jsx}` (applies to all code files, as the art style will influence how visual elements are implemented in code)

## Guidelines

### 1. Color Palette
- Use **soft, natural, and muted tones** (e.g., gentle greens, warm browns, pale blues).
- Avoid harsh neon or overly saturated colors.
- Include occasional **pops of vibrant color** for focal points (e.g., a bright red flower in a lush forest).

### 2. Character Design
- Design characters with **simple, rounded shapes** for a friendly, approachable look.
- Use **large, emotive eyes** to convey feelings vividly.
- Ensure character animations are **smooth and natural**, with fluid movements that feel lifelike.

### 3. Environment Design
- Create **lush, detailed environments** with intricate plants, animals, and whimsical architecture.
- Blend **realistic and fantastical elements** (e.g., towering trees with glowing leaves, cozy villages in rolling hills).
- Add small details like swaying grass, fluttering birds, or rippling water to make the world feel **alive**.

### 4. Lighting and Shadows
- Use **soft, diffused lighting** (e.g., sunlight filtering through trees, warm sunset glow).
- Add **gentle shadows** and subtle effects to create depth without harsh contrasts.
- Avoid stark lighting or deep shadows to maintain a dreamy, harmonious atmosphere.

### 5. Animation Style
- Prioritize **fluid motion** using techniques like tweening or easing for natural movements.
- Pay attention to **small details** in animations (e.g., hair blowing in the wind, subtle facial expressions).

### 6. Sound Design (Non-Visual)
- While not visual, sound is integral. Use **ambient noises** (e.g., rustling leaves, distant water) and a **gentle, melodic soundtrack** to enhance the mood.

## Instructions for AI
- When generating or suggesting code for visual elements (e.g., shaders, materials, animations), prioritize the above guidelines.
- For character models, suggest designs with rounded, expressive features.
- For environments, suggest adding small, animated details to bring the scene to life.
- When assisting with lighting, recommend soft, warm light sources and subtle shadow effects.
- If suggesting animations, ensure they are smooth and incorporate easing for natural motion.

## Reference Files
- `@components/Character.tsx`: Ensure character models and animations align with the described style.
- `@components/Environment.tsx`: Apply environment design guidelines here (create this file if it doesn’t exist).
- `@components/GameCanvas.tsx`: Use this as the central component to enforce the art style across the scene.