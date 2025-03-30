'use client';

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { AnimationMixer, AnimationAction, AnimationClip } from 'three';

type IdentifiableFunction = ((delta: number) => void) & { _id?: string };

interface UseFBXModelProps {
  scene: THREE.Scene;
  baseModelPath: string;
  animationPaths: string[];
  position?: THREE.Vector3;
  scale?: THREE.Vector3;
  onModelLoaded?: (model: THREE.Group) => void;
  registerUpdate?: (updateFn: IdentifiableFunction) => () => void;
  modelName?: string; // Optional name for the model group
}

export function useFBXModel({
  scene,
  baseModelPath,
  animationPaths,
  position = new THREE.Vector3(0, 0, 0),
  scale = new THREE.Vector3(1, 1, 1),
  onModelLoaded,
  registerUpdate,
  modelName = 'fbxModel' // Default model name
}: UseFBXModelProps) {
  const modelRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionsRef = useRef<{ [key: string]: AnimationAction }>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const unregisterUpdateRef = useRef<(() => void) | null>(null); // Store unregister function

  useEffect(() => {
    // Prevent re-loading if already loaded
    if (modelRef.current) return;

    let isMounted = true; // Track mount status for async operations
    const loader = new FBXLoader();
    let tempModel: THREE.Group | null = null; // Temporary model reference for cleanup

    const loadAnimation = async (path: string, mixer: AnimationMixer): Promise<[string, AnimationClip] | null> => {
      try {
        const animGltf = await loader.loadAsync(path);
        if (animGltf.animations && animGltf.animations.length > 0) {
          const clip = animGltf.animations[0];
          // Extract name from path (e.g., /models/running.fbx -> running)
          const name = path.split('/').pop()?.split('.')[0]?.toLowerCase() || `anim_${Date.now()}`;
          return [name, clip];
        }
      } catch (error) {
        console.error(`Failed to load animation: ${path}`, error);
      }
      return null;
    };

    const loadAll = async () => {
      try {
        // Load the base model (geometry + potentially base animation like idle)
        const baseGltf = await loader.loadAsync(baseModelPath);
        if (!isMounted) return; // Check mount status after async load

        tempModel = baseGltf; // Assign to tempModel for potential cleanup
        modelRef.current = baseGltf;
        baseGltf.name = modelName;
        baseGltf.position.copy(position);
        baseGltf.scale.copy(scale);
        baseGltf.rotation.y = Math.PI; // Face forward

        // Enable shadows for all meshes
        baseGltf.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        scene.add(baseGltf);

        // Setup mixer
        const mixer = new THREE.AnimationMixer(baseGltf);
        mixerRef.current = mixer;

        // Add base model's animations (e.g., the idle animation in Idle.fbx)
        baseGltf.animations.forEach(clip => {
            const name = clip.name.toLowerCase() || baseModelPath.split('/').pop()?.split('.')[0]?.toLowerCase() || 'base_anim';
             if (!actionsRef.current[name]) { // Avoid overwriting if name collision
                 actionsRef.current[name] = mixer.clipAction(clip);
                 console.log(`Loaded base animation: ${name}`);
             }
        });


        // Load additional animations concurrently
        const loadedAnimations = await Promise.all(
            animationPaths.map(path => loadAnimation(path, mixer))
        );

        if (!isMounted) return; // Check mount status after async load

        // Add loaded animations to actions ref
        loadedAnimations.forEach(result => {
          if (result) {
            const [name, clip] = result;
            if (!actionsRef.current[name]) { // Avoid overwriting if name collision
                 actionsRef.current[name] = mixer.clipAction(clip);
                 console.log(`Loaded additional animation: ${name}`);
            } else {
                console.warn(`Animation name collision: "${name}" from ${baseModelPath} might be overwritten by an external animation file.`)
            }
          }
        });


        // Play 'idle' or the first available animation
        const idleAction = Object.keys(actionsRef.current).find(name => name.includes('idle'));
        if (idleAction && actionsRef.current[idleAction]) {
          actionsRef.current[idleAction].play();
          console.log(`Autoplaying animation: ${idleAction}`)
        } else if (Object.keys(actionsRef.current).length > 0) {
          const firstAnimName = Object.keys(actionsRef.current)[0];
          actionsRef.current[firstAnimName].play();
          console.log(`Autoplaying first animation: ${firstAnimName}`)
        } else {
           console.warn("No animations found or loaded for the character.");
        }


        // Register mixer update loop
        if (registerUpdate) {
          const updateMixer: IdentifiableFunction = (delta) => mixer.update(delta);
          updateMixer._id = `${modelName}Animation`;
          unregisterUpdateRef.current = registerUpdate(updateMixer); // Store unregister function
        }

        setIsLoaded(true);
        if (onModelLoaded) {
          onModelLoaded(baseGltf);
        }

      } catch (error) {
        console.error('Error loading FBX model or animations:', error);
        // Ensure partial cleanup if base model loaded but animations failed
        if (tempModel) {
            scene.remove(tempModel);
        }
      }
    };

    loadAll();

    // Cleanup function
    return () => {
      isMounted = false; // Mark as unmounted
      if (unregisterUpdateRef.current) {
        unregisterUpdateRef.current(); // Call the stored unregister function
        unregisterUpdateRef.current = null;
      }
      if (modelRef.current) {
        scene.remove(modelRef.current);
        // Proper disposal (optional but good practice)
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
    };
  }, [scene, baseModelPath, animationPaths, position, scale, registerUpdate, onModelLoaded, modelName]); // Ensure all dependencies are listed


  // Method to play a specific animation
   const playAnimation = (animationName: string, fadeInTime: number = 0.3) => {
       const lowerCaseAnimName = animationName.toLowerCase();
       const action = actionsRef.current[lowerCaseAnimName];

       if (!action) {
           console.warn(`Animation "${lowerCaseAnimName}" not found.`);
           // Try finding a partial match if full name fails
            const partialMatch = Object.keys(actionsRef.current).find(key => key.includes(lowerCaseAnimName));
            if (partialMatch) {
                console.warn(`Playing closest match: "${partialMatch}"`);
                playAnimation(partialMatch, fadeInTime); // Recursive call with the found name
            }
           return;
       }

       if (!mixerRef.current) return; // Mixer must exist

       // Fade out all other actions
       Object.entries(actionsRef.current).forEach(([name, otherAction]) => {
           if (name !== lowerCaseAnimName && otherAction.isRunning()) {
               otherAction.fadeOut(fadeInTime);
           }
       });

       // Fade in and play the target action
       action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(fadeInTime).play();
   };


  return { modelRef, mixerRef, actionsRef, isLoaded, playAnimation };
} 