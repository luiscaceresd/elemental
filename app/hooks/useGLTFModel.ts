'use client';

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { AnimationMixer, AnimationAction, AnimationClip } from 'three';

type IdentifiableFunction = ((delta: number) => void) & { _id?: string };

interface UseGLTFModelProps {
  scene: THREE.Scene;
  modelPath: string;
  animationPaths?: string[]; // <-- Add optional animation paths
  decoderPath?: string;
  position?: THREE.Vector3;
  scale?: THREE.Vector3;
  onModelLoaded?: (model: THREE.Group) => void;
  registerUpdate?: (updateFn: IdentifiableFunction) => () => void;
  modelName?: string; // Optional name for the model group
}

export function useGLTFModel({
  scene,
  modelPath,
  animationPaths = [], // <-- Default to empty array
  decoderPath = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/',
  position = new THREE.Vector3(0, 0, 0),
  scale = new THREE.Vector3(1, 1, 1),
  onModelLoaded,
  registerUpdate,
  modelName = 'gltfModel' // Default model name
}: UseGLTFModelProps) {
  const modelRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionsRef = useRef<{ [key: string]: AnimationAction }>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const unregisterUpdateRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (modelRef.current) return; // Don't load if already exists

    let isMounted = true;
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(decoderPath);
    dracoLoader.setDecoderConfig({ type: 'js' }); // Use JS decoder

    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    let tempModel: THREE.Group | null = null;

    // Helper function to load a GLB just for its animation
    const loadAnimation = async (path: string, mixer: AnimationMixer): Promise<[string, AnimationClip] | null> => {
        try {
            const animGltf = await loader.loadAsync(path);
            if (animGltf.animations && animGltf.animations.length > 0) {
                const clip = animGltf.animations[0];
                // Extract name from path (e.g., /models/running.glb -> running)
                const name = path.split('/').pop()?.split('.')[0]?.toLowerCase() || `anim_${Date.now()}`;
                return [name, clip];
            } else {
                console.warn(`No animations found in GLB file: ${path}`);
            }
        } catch (error) {
            console.error(`Failed to load animation GLB: ${path}`, error);
        }
        return null;
    };

    const loadModelAndAnimations = async () => {
      try {
        // Load the base model (geometry + embedded animations)
        const gltf = await loader.loadAsync(modelPath);
        if (!isMounted) return; // Check after async load

        tempModel = gltf.scene;
        modelRef.current = gltf.scene;
        modelRef.current.name = modelName;
        modelRef.current.position.copy(position);
        modelRef.current.scale.copy(scale);
        modelRef.current.rotation.y = Math.PI; // Face forward

        // Enable shadows and visibility
        modelRef.current.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            node.visible = true;
            if (node.material) {
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              materials.forEach(material => {
                material.visible = true;
                material.transparent = false; // Ensure not transparent by default
                material.opacity = 1.0;
                material.needsUpdate = true;
              });
            }
          }
        });

        scene.add(modelRef.current);

        // Setup animations
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(modelRef.current);
          mixerRef.current = mixer;

          let baseModelDefaultAnimName: string | null = null; // Variable to store the name of the first embedded animation

          // Add animations embedded in the base model
          gltf.animations.forEach((clip: AnimationClip, index: number) => {
            const name = clip.name.toLowerCase();
            if (!actionsRef.current[name]) {
                actionsRef.current[name] = mixer.clipAction(clip);
                console.log(`Loaded embedded animation: ${name}`);
                if (index === 0) { // Store the name of the *first* embedded animation
                    baseModelDefaultAnimName = name;
                }
            }
          });

          // Load additional animations from separate GLB files
          const loadedAnimations = await Promise.all(
              animationPaths.map(path => loadAnimation(path, mixer))
          );

          if (!isMounted) return;

          // Add loaded external animations to actions ref
          loadedAnimations.forEach(result => {
            if (result) {
              const [name, clip] = result;
              if (!actionsRef.current[name]) { // Avoid overwriting
                   actionsRef.current[name] = mixer.clipAction(clip);
                   console.log(`Loaded external animation: ${name}`);
              } else {
                  console.warn(`Animation name collision: "${name}" from base model ${modelPath} conflicts with external file. External animation ignored.`)
              }
            }
          });

          console.log("Available animation actions:", Object.keys(actionsRef.current)); // Log all loaded action names

          // --- Updated Default Animation Logic ---
          let actionToPlay: string | null = null;

          // 1. Try to find an action name containing "idle"
          const idleActionName = Object.keys(actionsRef.current).find(name => name.includes('idle'));
          if (idleActionName) {
              actionToPlay = idleActionName;
              console.log(`Found action containing "idle": "${actionToPlay}". Setting as default.`);
          }
          // 2. If no "idle", try to use the first animation from the base model file
          else if (baseModelDefaultAnimName && actionsRef.current[baseModelDefaultAnimName]) {
              actionToPlay = baseModelDefaultAnimName;
              console.log(`Using first animation from base model ("${modelPath}") as default: "${actionToPlay}".`);
          }
          // 3. If neither of the above, use the very first action available as a fallback
          else if (Object.keys(actionsRef.current).length > 0) {
              actionToPlay = Object.keys(actionsRef.current)[0];
              console.log(`Could not find "idle" or base model animation. Using first available action as default: "${actionToPlay}".`);
          }

          // Play the selected default animation
          if (actionToPlay && actionsRef.current[actionToPlay]) {
              actionsRef.current[actionToPlay].play();
               console.log(`Autoplaying default animation: "${actionToPlay}"`);
          } else {
              console.warn("No animations found or loaded for the character. Cannot autoplay default.");
          }
          // --- End Updated Default Animation Logic ---
        }

        // Register update loop
        if (registerUpdate && mixerRef.current) {
            const updateMixer: IdentifiableFunction = (delta) => mixerRef.current?.update(delta);
            updateMixer._id = `${modelName}Animation`;
            unregisterUpdateRef.current = registerUpdate(updateMixer);
        }

        setIsLoaded(true);
        if (onModelLoaded) {
          onModelLoaded(modelRef.current);
        }
      } catch (error) {
        console.error(`Error loading GLTF model: ${modelPath}`, error);
        if (tempModel) scene.remove(tempModel); // Cleanup partially loaded model
      }
    };

    loadModelAndAnimations();

    // Cleanup
    return () => {
      isMounted = false;
      if (unregisterUpdateRef.current) {
          unregisterUpdateRef.current();
          unregisterUpdateRef.current = null;
      }
      if (modelRef.current) {
         scene.remove(modelRef.current);
         // Dispose resources (optional but good practice)
         modelRef.current.traverse((node) => {
            if (node instanceof THREE.Mesh) {
                node.geometry.dispose();
                 if (Array.isArray(node.material)) {
                    node.material.forEach(material => material.dispose());
                } else {
                    node.material.dispose();
                }
            }
         });
         modelRef.current = null;
      }
      mixerRef.current = null;
      actionsRef.current = {};
      setIsLoaded(false);
      dracoLoader.dispose(); // Dispose Draco loader
    };
  }, [scene, modelPath, animationPaths, decoderPath, position, scale, registerUpdate, onModelLoaded, modelName]);

  // Animation play function (consistent with FBX hook)
  const playAnimation = (animationName: string, fadeInTime: number = 0.3) => {
      console.log(`Attempting to play animation: "${animationName}"`); // Log attempt
      const lowerCaseAnimName = animationName.toLowerCase();
      const action = actionsRef.current[lowerCaseAnimName];

      if (!mixerRef.current) {
          console.warn("Mixer not available for animation playback.");
          return;
      }

      if (!action) {
          console.warn(`Animation action "${lowerCaseAnimName}" not found. Available actions:`, Object.keys(actionsRef.current));
           // Try finding a partial match if full name fails
          const partialMatch = Object.keys(actionsRef.current).find(key => key.includes(lowerCaseAnimName));
          if (partialMatch) {
              console.warn(`Playing closest match: "${partialMatch}"`);
              playAnimation(partialMatch, fadeInTime); // Recursive call with the found name
          }
          return;
      }

       console.log(`Fading out other animations and playing "${lowerCaseAnimName}"`);
       Object.entries(actionsRef.current).forEach(([name, otherAction]) => {
           if (name !== lowerCaseAnimName && otherAction.isRunning()) {
                console.log(`Fading out: ${name}`); // Log fading action
               otherAction.fadeOut(fadeInTime); // Use fadeOut() again
           }
       });

       action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fadeInTime).play(); // Use fadeIn() again
   };

  return { modelRef, mixerRef, actionsRef, isLoaded, playAnimation };
} 