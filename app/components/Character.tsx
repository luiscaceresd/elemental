'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useGLTFModel } from '../hooks/useGLTFModel';

// Add a type for identifiable functions as used in other components
type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

interface CharacterProps {
  scene: THREE.Scene;
  onModelLoaded?: (model: THREE.Group) => void;
  position?: THREE.Vector3;
  scale?: THREE.Vector3;
  registerUpdate?: (updateFn: IdentifiableFunction) => () => void;
}

export default function Character({
  scene,
  onModelLoaded,
  position = new THREE.Vector3(0, 0, 0),
  scale = new THREE.Vector3(1, 1, 1),
  registerUpdate
}: CharacterProps) {
  const modelRef = useRef<THREE.Group | null>(null);
  
  // Load character model using the new hook
  const { mixer, actions, animations } = useGLTFModel({
    scene,
    modelPath: '/models/character.glb',
    position,
    scale,
    rotation: new THREE.Euler(0, Math.PI, 0), // Face forward (180° Y rotation)
    name: 'characterModel',
    onLoaded: (loadedModel) => {
      // Store the model in a ref for later use
      modelRef.current = loadedModel;
      
      // Notify parent that model is loaded
      if (onModelLoaded) {
        onModelLoaded(loadedModel);
      }
      
      // Play default animation if available
      if (actions['idle']) {
        actions['idle'].play();
      } else if (animations.length > 0) {
        // If no 'idle' animation, play the first available animation
        const firstAnimName = animations[0].name;
        actions[firstAnimName].play();
      }
    }
  });

  // Method to play a specific animation - wrap in useCallback
  const playAnimation = useCallback((animationName: string, fadeInTime: number = 0.5) => {
    if (!actions[animationName]) {
      // Animation not found
      return;
    }

    // Fade out all current animations
    Object.values(actions).forEach(action => {
      if (action.isRunning()) {
        action.fadeOut(fadeInTime);
      }
    });

    // Fade in the new animation
    const action = actions[animationName];
    action.reset().fadeIn(fadeInTime).play();
  }, [actions]);

  // Update the animation mixer in the game loop
  useEffect(() => {
    if (!scene || !registerUpdate || !mixer) return;

    // For animation throttling
    let lastUpdateTime = 0;
    const frameSkip = 1; // Update every other frame
    let frameCount = 0;

    // Create animation update function with throttling
    const update: IdentifiableFunction = (delta: number) => {
      // Skip update if delta is too large (tab switching, etc)
      if (delta > 0.1) return;
      
      // Throttle animation updates to improve performance
      frameCount++;
      if (frameCount % frameSkip !== 0) {
        return; // Skip this frame
      }

      // Only update animation at 30fps instead of 60fps
      const currentTime = Date.now();
      if (currentTime - lastUpdateTime < 33) { // ~30fps (33ms between frames)
        return;
      }
      
      lastUpdateTime = currentTime;
      mixer.update(delta);
    };

    // Add identifier to the update function
    update._id = 'characterAnimation';

    // Register the update function with the game loop
    const unregisterUpdate = registerUpdate(update);

    return () => {
      // Unregister the update function when component unmounts
      unregisterUpdate();
    };
  }, [scene, mixer, registerUpdate]);

  // Expose the playAnimation method to parent components
  useEffect(() => {
    if (!modelRef.current) return;

    // Attach the playAnimation method to the model for external access
    const model = modelRef.current as THREE.Group & { playAnimation?: typeof playAnimation };
    model.playAnimation = playAnimation;
  }, [playAnimation]); // Include playAnimation in dependencies

  // The component doesn't render anything directly
  return null;
}
