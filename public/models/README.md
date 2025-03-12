# Mixamo Character Models using FBX Format

This directory is where you should place your character models from Mixamo using the FBX format.

## How to Add a Mixamo Character in FBX Format

1. Go to [Mixamo](https://www.mixamo.com/) and create a free account
2. Choose a character (like Y Bot, X Bot, or any other character)
3. Download the character with animations using these settings:
   - Format: **FBX (.fbx)**
   - Skin: **With Skin**
   - Animation: **With Animation** 
   - Frame Rate: **30 fps** (recommended)
   - FBX export options: check "Mesh" and "Animation" options

4. Download separate animations for your character:
   - **Idle** (like "Idle" or "Breathing Idle")
   - **Walking** (like "Walking" or "Standard Walk")
   - **Running** (like "Running" or "Standard Run")
   - **Jump** (like "Jump" or "Standing Jump")

5. Rename the downloaded files appropriately:
   - Main character with idle: `character.fbx`
   - Additional animations: `walking.fbx`, `running.fbx`, `jumping.fbx`

6. Place all downloaded `.fbx` files in this `/public/models/` directory

## Important FBX Considerations

1. **File Size**: FBX files are typically larger than GLB files
2. **Multiple Files**: Mixamo FBX workflow often involves separate files for different animations
3. **Scale**: FBX models from Mixamo are often much larger than their GLB counterparts

## Animations in FBX

FBX models from Mixamo typically work in one of two ways:

1. **Single FBX file with an embedded animation** - The main character file includes one animation (like idle)
2. **Separate FBX files for additional animations** - You'll download additional files for walking, running, etc.

The updated Character component automatically attempts to load separate animation files if needed.

## Code Structure for FBX Models

```typescript
// Main character model
const character = await loader.loadAsync('/models/character.fbx');

// Create the animation mixer
const mixer = new THREE.AnimationMixer(character);

// If your model has animations built-in
if (character.animations && character.animations.length > 0) {
  const idleAction = mixer.clipAction(character.animations[0]);
  idleAction.play();
}

// Load additional animation files if needed
const walkingFbx = await loader.loadAsync('/models/walking.fbx');
if (walkingFbx.animations && walkingFbx.animations.length > 0) {
  const walkAction = mixer.clipAction(walkingFbx.animations[0]);
  // Store for later use
}
```

## Tips for FBX Models

1. **Scale**: FBX models from Mixamo are usually very large and need scaling:
   ```typescript
   character.scale.set(0.01, 0.01, 0.01);
   ```

2. **Rotation**: Adjust the model rotation if needed:
   ```typescript
   character.rotation.y = Math.PI; // Rotate 180 degrees
   ```

3. **Animation Mixing**: FBX models support animation mixing just like GLB:
   ```typescript
   // Cross-fade between animations
   walkAction.crossFadeFrom(idleAction, 0.5, true);
   ```

4. **Troubleshooting**: If animations don't work correctly:
   - Check the console for errors
   - Make sure the model and animation formats match
   - Try downloading the model again with different settings
   - Try using the "No Skin" option if having issues

5. **Performance**: FBX files can be larger, so consider performance optimization:
   - Reduce polygon count in character models
   - Use lower frame rates for animations (24fps instead of 30fps)
   - Consider converting to GLB for production if file size is an issue 