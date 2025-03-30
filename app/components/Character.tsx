'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { AnimationMixer, AnimationAction, AnimationClip } from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

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
  scale = new THREE.Vector3(1, 1, 1), // Reset scale to 1 for GLB
  registerUpdate
}: CharacterProps) {
  const modelRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionsRef = useRef<{ [key: string]: AnimationAction }>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Check if we already have a model loaded to prevent duplicates
    if (modelRef.current) {
      return; // Don't load again if we already have a model
    }

    const loadModel = async () => {
      try {
        // Remove any existing character models from the scene
        scene.children.forEach(child => {
          if (child.name === 'characterModel') {
            scene.remove(child);
          }
        });

        // Create DRACOLoader
        const dracoLoader = new DRACOLoader();
        // Specify the path to the Draco decoder (using the default from three.js CDN)
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        // Optional: For better performance, specify that we want to use JS decoder
        dracoLoader.setDecoderConfig({ type: 'js' });

        // Create GLTFLoader and attach DRACOLoader
        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        // Load the character model
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(
            '/models/Idle.glb', // <-- Updated model path
            (gltf) => resolve(gltf),
            () => {
              // Progress tracking omitted
            },
            (error) => {
              // Log loading errors to help with debugging
              console.error('Error loading character model:', error);
              reject(error);
            }
          );
        });

        // Set up the model
        const model = gltf.scene;

        // Give the model a name for identification
        model.name = 'characterModel';

        // Position and scale the model
        model.position.copy(position);
        model.scale.copy(scale);

        // Adjust character orientation to align with movement direction
        model.rotation.y = Math.PI;

        // Ensure all materials and meshes are visible
        model.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            node.visible = true;

            // Check and fix material visibility
            if (node.material) {
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              materials.forEach(material => {
                material.visible = true;
                material.transparent = false;
                material.opacity = 1.0;
                material.needsUpdate = true;
              });
            }
          }
        });

        // Store the model in a ref for later use
        modelRef.current = model;

        // Add the model to the scene
        scene.add(model);

        // Set up animations if they exist
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;

          // Create animation actions and store them in the ref
          gltf.animations.forEach((clip: AnimationClip) => {
            const action = mixer.clipAction(clip);
            actionsRef.current[clip.name] = action;
            console.log(`Loaded animation action: ${clip.name}`); // Log loaded animations
          });

          // --- Updated Default Animation Logic ---
          // Play the first animation found in the file
          const firstAnimName = gltf.animations[0]?.name;
          if (firstAnimName && actionsRef.current[firstAnimName]) {
             console.log(`Autoplaying first animation found: ${firstAnimName}`);
             actionsRef.current[firstAnimName].play();
          } else {
             console.warn("No animations found in the loaded model.");
          }
          // --- End Updated Logic ---

        }

        // Notify parent that model is loaded
        if (onModelLoaded) {
          onModelLoaded(model);
        }

        setIsLoaded(true);
      } catch (loadError) {
        // Model loading failed - log error for debugging
        console.error('Failed to load character model:', loadError);
      }
    };

    loadModel();

    // Cleanup function
    return () => {
      if (modelRef.current) {
        scene.remove(modelRef.current);
        modelRef.current = null;

        // Also clear the mixer and actions
        mixerRef.current = null;
        actionsRef.current = {};
      }

      // Dispose of the DRACO loader when component unmounts
      const dracoLoader = new DRACOLoader();
      dracoLoader.dispose();
    };
  }, [scene, onModelLoaded, position, scale]);

  // Method to play a specific animation
  const playAnimation = (animationName: string, fadeInTime: number = 0.5) => {
    // Find the action, potentially case-insensitively or by partial match if needed
    let targetAction: AnimationAction | null = null;
    let targetName: string | null = null;

    // Try exact match first (case sensitive based on how they were stored)
    if (actionsRef.current[animationName]) {
        targetAction = actionsRef.current[animationName];
        targetName = animationName;
    } else {
        // Fallback: try finding case-insensitive or partial match
        const lowerCaseName = animationName.toLowerCase();
        const foundName = Object.keys(actionsRef.current).find(key => key.toLowerCase().includes(lowerCaseName));
        if (foundName) {
            targetAction = actionsRef.current[foundName];
            targetName = foundName;
            console.warn(`Animation "${animationName}" not found exactly, playing match: "${targetName}"`);
        }
    }

    if (!targetAction || !targetName) {
      console.warn(`Animation "${animationName}" not found.`);
      return;
    }

    // Fade out all other current animations
    Object.entries(actionsRef.current).forEach(([name, action]) => {
        // Use the found targetName for comparison
      if (name !== targetName && action.isRunning()) {
        action.fadeOut(fadeInTime);
      }
    });

    // Fade in the new animation
    targetAction.reset().fadeIn(fadeInTime).play();
  };

  // Update the animation mixer in the game loop
  useEffect(() => {
    if (!scene || !registerUpdate) return;

    // Create animation update function
    const update: IdentifiableFunction = (delta: number) => {
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
    };

    // Add identifier to the update function
    update._id = 'characterAnimation';

    // Register the update function with the game loop
    const unregisterUpdate = registerUpdate(update);

    return () => {
      // Unregister the update function when component unmounts
      unregisterUpdate();
    };
  }, [scene, isLoaded, registerUpdate]);

  // Expose the playAnimation method to parent components
  useEffect(() => {
    if (!modelRef.current) return;

    // Attach the playAnimation method to the model for external access
    const model = modelRef.current as THREE.Group & { playAnimation?: typeof playAnimation };
    model.playAnimation = playAnimation;

  }, [isLoaded]); // Depend on isLoaded to ensure modelRef.current is set

  // The component doesn't render anything directly
  return null;
}
