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
    const instanceId = Math.random().toString(36).substring(7); // Unique ID for this instance run
    console.log(`Character.tsx useEffect START - Instance: ${instanceId}`);

    // Check if we already have a model loaded to prevent duplicates
    if (modelRef.current) {
      console.log(`Character.tsx useEffect - Already loaded, returning. Instance: ${instanceId}`);
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

        // --- Load Base Model (Idle.glb) ---
        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(
            '/models/idle.glb', // Base model path
            (gltf) => resolve(gltf),
            () => { /* Progress */ },
            (error) => { console.error('Error loading base model:', error); reject(error); }
          );
        });

        // --- Setup Base Model ---
        const model = gltf.scene;
        model.name = 'characterModel';
        model.position.copy(position);
        model.scale.copy(scale);
        model.rotation.y = Math.PI;
        model.traverse((node) => { /* Cast/receive shadow, visibility etc. */
             if (node instanceof THREE.Mesh) {
               node.castShadow = true;
               node.receiveShadow = true;
               node.visible = true;
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
        modelRef.current = model;
        scene.add(model);

        // Inside loading logic, *after* model is created:
        console.log(`Character.tsx - Model Loaded. Instance: ${instanceId}, UUID: ${model.uuid}`);

        // --- Setup Animation Mixer ---
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        actionsRef.current = {}; // Clear previous actions

        // --- Load Embedded Animations (from Idle.glb) ---
        let baseModelDefaultAnimName: string | null = null;
        if (gltf.animations && gltf.animations.length > 0) {
            gltf.animations.forEach((clip: AnimationClip, index: number) => {
                const action = mixer.clipAction(clip);
                actionsRef.current[clip.name] = action; // Store using original clip name
                console.log(`Loaded embedded animation action: ${clip.name}`);
                if (index === 0) {
                    baseModelDefaultAnimName = clip.name; // Store the name of the first embedded animation
                }
            });
        }

        // --- Load External Animations ---
        const externalAnimationPaths = [
            '/models/walking.glb',
            '/models/running.glb',
            '/models/jumping.glb'
        ];

        const loadAnimation = async (path: string): Promise<[string, AnimationClip] | null> => {
            try {
                const animGltf = await loader.loadAsync(path);
                if (animGltf.animations && animGltf.animations.length > 0) {
                    const clip = animGltf.animations[0];
                    // Extract name from path (e.g., walking.glb -> walking)
                    const name = path.split('/').pop()?.split('.')[0]?.toLowerCase() || clip.name; // Fallback to clip name
                    return [name, clip];
                }
                console.warn(`No animation clip found in ${path}`);
            } catch (error) {
                console.error(`Failed to load animation from ${path}:`, error);
            }
            return null;
        };

        const loadedAnimations = await Promise.all(externalAnimationPaths.map(loadAnimation));

        // Add external animations to actionsRef
        loadedAnimations.forEach(result => {
            if (result) {
                const [name, clip] = result;
                // Store using the derived name (walking, running, jumping)
                // Check for conflicts with embedded animations
                if (!actionsRef.current[name]) {
                    actionsRef.current[name] = mixer.clipAction(clip);
                    console.log(`Loaded external animation action: ${name}`);
                } else {
                     console.warn(`External animation name "${name}" conflicts with an existing action. Skipping.`);
                }
            }
        });

        // --- Autoplay Default Animation ---
        console.log("Available animation actions:", Object.keys(actionsRef.current));
        let actionToPlay: string | null = null;
        const idleActionName = Object.keys(actionsRef.current).find(name => name.toLowerCase().includes('idle') || name === baseModelDefaultAnimName); // Try 'idle' or the base model's anim

        if (idleActionName) {
            actionToPlay = idleActionName;
            console.log(`Found idle/base animation action: "${actionToPlay}". Setting as default.`);
        } else if (Object.keys(actionsRef.current).length > 0) {
            actionToPlay = Object.keys(actionsRef.current)[0];
             console.log(`Could not find idle/base animation. Using first available action as default: "${actionToPlay}".`);
        }

        if (actionToPlay && actionsRef.current[actionToPlay]) {
            actionsRef.current[actionToPlay].play();
             console.log(`Autoplaying default animation: "${actionToPlay}"`);
        } else {
            console.warn("No animations available to autoplay.");
        }
        // --- End Autoplay Logic ---


        // --- Final Setup ---
        if (onModelLoaded) {
          console.log(`Character.tsx - Calling onModelLoaded. Instance: ${instanceId}, UUID: ${model.uuid}`);
          onModelLoaded(model);
        }
        setIsLoaded(true);

      } catch (loadError) {
        console.error('Failed during model or animation loading:', loadError);
      }
    };

    loadModel();

    // Cleanup function
    return () => {
      // Use the specific instanceId captured by this useEffect closure
      const currentModelUUID = modelRef.current?.uuid;
      console.log(`Character.tsx useEffect CLEANUP - Instance: ${instanceId}, Model UUID: ${currentModelUUID}`);
      if (modelRef.current) {
        console.log(`Character.tsx CLEANUP - Removing model UUID: ${modelRef.current.uuid}`);
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
  }, [scene, onModelLoaded, position, scale, registerUpdate]);

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
