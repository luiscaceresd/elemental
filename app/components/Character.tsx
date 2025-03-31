'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { AnimationMixer, AnimationAction, AnimationClip } from 'three';
import { GLTF } from 'three/examples/jsm/loaders/GLTFLoader';

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

export default function Character({
  scene,
  onModelLoaded,
  position = new THREE.Vector3(0, 0, 0),
  scale = new THREE.Vector3(1, 1, 1),
  registerUpdate,
}: CharacterProps) {
  const modelRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<AnimationMixer | null>(null);
  const actionsRef = useRef<{ [key: string]: AnimationAction }>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const instanceId = Math.random().toString(36).substring(7);
    console.log(`Character.tsx useEffect START - Instance: ${instanceId}`);

    if (modelRef.current) {
      console.log(`Character.tsx useEffect - Already loaded, returning. Instance: ${instanceId}`);
      return;
    }

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

        modelRef.current = model;
        scene.add(model);

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

        if (onModelLoaded) {
          console.log(`Character.tsx - Calling onModelLoaded. Instance: ${instanceId}, UUID: ${model.uuid}`);
          onModelLoaded(model);
        }
        setIsLoaded(true);
      } catch (loadError) {
        console.error('Failed during model loading:', loadError);
      }
    };

    loadModel();

    return () => {
      const currentModelUUID = modelRef.current?.uuid;
      console.log(`Character.tsx useEffect CLEANUP - Instance: ${instanceId}, Model UUID: ${currentModelUUID}`);
      if (modelRef.current) {
        console.log(`Character.tsx CLEANUP - Removing model UUID: ${modelRef.current.uuid}`);
        scene.remove(modelRef.current);
        modelRef.current = null;
        mixerRef.current = null;
        actionsRef.current = {};
      }
      const dracoLoader = new DRACOLoader();
      dracoLoader.dispose();
    };
  }, [scene, onModelLoaded, position, scale, registerUpdate]);

  const playAnimation = (animationName: string, fadeInTime: number = 0.5) => {
    const lowerCaseName = animationName.toLowerCase();
    const targetAction = actionsRef.current[lowerCaseName];

    console.log(`playAnimation called with: "${animationName}" (checking for key "${lowerCaseName}")`);

    if (!targetAction) {
      console.warn(`Animation action with key "${lowerCaseName}" not found in actionsRef. Available keys:`, Object.keys(actionsRef.current));
      return;
    }

    Object.entries(actionsRef.current).forEach(([name, action]) => {
      if (name !== lowerCaseName && action.isRunning()) {
        console.log(`Fading out action: ${name}`);
        action.fadeOut(fadeInTime);
      }
    });

    console.log(`Fading in action: ${lowerCaseName}`);
    targetAction.reset().fadeIn(fadeInTime).play();
  };

  useEffect(() => {
    if (!scene || !registerUpdate) return;

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

  useEffect(() => {
    if (!modelRef.current) return;

    const model = modelRef.current as THREE.Group & { playAnimation?: typeof playAnimation };
    model.playAnimation = playAnimation;
  }, [isLoaded]);

  return null;
}