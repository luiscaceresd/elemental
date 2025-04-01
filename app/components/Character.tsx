'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { AnimationMixer, AnimationAction, AnimationClip } from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import React from 'react';

type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string;
};

interface CharacterProps {
  scene: THREE.Scene;
  onModelLoaded?: (model: THREE.Group) => void;
  position?: THREE.Vector3;
  scale?: THREE.Vector3;
  registerUpdate?: (updateFn: IdentifiableFunction) => () => void;
}

function Character({
  scene,
  onModelLoaded,
  position = new THREE.Vector3(0, 0, 0),
  scale = new THREE.Vector3(5, 5, 5),
  registerUpdate,
}: Omit<CharacterProps, 'gameState'>) {
  console.log('Character Render: Received scale prop:', scale?.x, scale?.y, scale?.z);
  const modelRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionsRef = useRef<{ [key: string]: AnimationAction }>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const initialLoadedRef = useRef(false); // Track if we've already loaded the model
  const instanceIdRef = useRef(Math.random().toString(36).substring(7)); // Stable instance ID

  // Handle model loading - only depend on scene to prevent recreation
  useEffect(() => {
    // Early exit if we already have a loaded model
    if (initialLoadedRef.current && modelRef.current) {
      console.log(`Character.tsx useEffect - Already loaded, returning. Instance: ${instanceIdRef.current}`);
      return;
    }

    console.log(`Character.tsx useEffect START - Instance: ${instanceIdRef.current}`);

    const loadModel = async () => {
      try {
        scene.children.forEach((child) => {
          if (child.name === 'characterModel') {
            scene.remove(child);
          }
        });

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        dracoLoader.setDecoderConfig({ type: 'js' });

        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        const gltf = await new Promise<GLTF>((resolve, reject) => {
          loader.load(
            '/models/character.glb', // Your combined animation model
            (gltf) => resolve(gltf),
            () => { /* Progress */ },
            (error) => { console.error('Error loading model:', error); reject(error); }
          );
        });

        const model = gltf.scene;
        model.name = 'characterModel';
        model.position.copy(position);
        model.scale.copy(scale);
        model.rotation.y = Math.PI;

        model.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            node.visible = true;
            if (node.material) {
              const materials = Array.isArray(node.material) ? node.material : [node.material];
              materials.forEach((material) => {
                material.visible = true;
                material.transparent = false;
                material.opacity = 1.0;
                material.needsUpdate = true;
              });
            }
          }
        });

        // Save model reference before adding to scene
        modelRef.current = model;
        
        // Add model to scene
        scene.add(model);

        // Setup animation mixer once
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        actionsRef.current = {};

        if (gltf.animations && gltf.animations.length > 0) {
          gltf.animations.forEach((clip: AnimationClip) => {
            const name = clip.name.toLowerCase();
            const action = mixer.clipAction(clip);
            actionsRef.current[name] = action;
            console.log(`Loaded animation action: ${name}`);
          });
        }

        console.log('Available animation actions:', Object.keys(actionsRef.current));

        if (actionsRef.current.idle) {
          actionsRef.current.idle.play();
          console.log('Autoplaying default animation: "idle"');
        } else if (Object.keys(actionsRef.current).length > 0) {
          const firstActionName = Object.keys(actionsRef.current)[0];
          actionsRef.current[firstActionName].play();
          console.warn(`Could not find 'idle'. Using fallback action as default: "${firstActionName}".`);
        } else {
          console.warn('No animations available to autoplay.');
        }

        // Mark as loaded before calling onModelLoaded
        initialLoadedRef.current = true;
        setIsLoaded(true);

        // Attach playAnimation method to model
        const typedModel = model as THREE.Group & { playAnimation?: typeof playAnimation };
        typedModel.playAnimation = playAnimation;

        if (onModelLoaded) {
          console.log(`Character.tsx - Calling onModelLoaded. Instance: ${instanceIdRef.current}, UUID: ${model.uuid}`);
          onModelLoaded(model);
        }
      } catch (loadError) {
        console.error('Failed during model loading:', loadError);
      }
    };

    loadModel();

    // This cleanup only runs when unmounting
    return () => {
      if (modelRef.current) {
        console.log(`Character.tsx FINAL CLEANUP - Removing model UUID: ${modelRef.current.uuid}`);
        scene.remove(modelRef.current);
        modelRef.current = null;
        mixerRef.current = null;
        actionsRef.current = {};
        initialLoadedRef.current = false;
      }
      const dracoLoader = new DRACOLoader();
      dracoLoader.dispose();
    };
  }, [scene]); // Only depend on scene

  // Stable playAnimation function that doesn't get recreated on rerenders
  const playAnimation = useCallback((animationName: string, fadeInTime: number = 0.5) => {
    const lowerCaseName = animationName.toLowerCase();
    const targetAction = actionsRef.current[lowerCaseName];

    console.log(`Character.tsx: playAnimation called with: "${animationName}" (checking for key "${lowerCaseName}")`);

    if (!targetAction) {
      console.warn(`Character.tsx: Animation action with key "${lowerCaseName}" not found. Available:`, Object.keys(actionsRef.current));
      return;
    }

    console.log(`Character.tsx: Target action "${lowerCaseName}" current timeScale: ${targetAction.timeScale}`);

    Object.entries(actionsRef.current).forEach(([name, action]) => {
      if (name !== lowerCaseName && action.isRunning()) {
        console.log(`Character.tsx: Fading out action: ${name}`);
        action.fadeOut(fadeInTime);
      }
    });

    console.log(`Character.tsx: Fading in action: ${lowerCaseName}`);
    targetAction.reset().fadeIn(fadeInTime).play();
    console.log(`Character.tsx: Action "${lowerCaseName}" play() called.`);
  }, []); // No dependencies to ensure stability

  // Setup animation update loop
  useEffect(() => {
    if (!scene || !registerUpdate || !isLoaded) return;

    const update: IdentifiableFunction = (delta: number) => {
      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }
    };

    update._id = 'characterAnimation';
    const unregisterUpdate = registerUpdate(update);

    return () => {
      unregisterUpdate();
    };
  }, [scene, isLoaded, registerUpdate]);

  // Handle position updates without recreating the model
  useEffect(() => {
    if (modelRef.current && position) {
      modelRef.current.position.copy(position);
    }
  }, [position]);

  // Handle scale updates without recreating the model
  useEffect(() => {
    if (modelRef.current && scale) {
      console.log('Character.tsx: Scale useEffect - Applying new scale:', scale.x, scale.y, scale.z);
      modelRef.current.scale.copy(scale);
    }
  }, [scale]);

  return null;
}

// Use React.memo to prevent unnecessary re-renders
export default React.memo(Character);