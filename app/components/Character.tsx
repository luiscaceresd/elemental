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
  scale = new THREE.Vector3(1, 1, 1),
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
            '/models/character.glb',
            (gltf) => resolve(gltf),
            (progress) => {
              // Optional: You can log or handle progress here
              console.log(`Loading model: ${Math.round(progress.loaded / progress.total * 100)}%`);
            },
            (error) => reject(error)
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
        // In standard ThreeJS, forward direction is -Z
        // But our movement is calculated relative to the camera direction
        // We rotate 180 degrees to face the character forward properly
        model.rotation.y = Math.PI;

        console.log('Character model orientation set to align with movement direction');

        // Ensure all materials and meshes are visible
        let meshCount = 0;
        model.traverse((node) => {
          if (node instanceof THREE.Mesh) {
            meshCount++;
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

        console.log(`Character model has ${meshCount} visible meshes`);

        // Log the model hierarchy for debugging
        console.log('Character model hierarchy:', model);

        // Store the model in a ref for later use
        modelRef.current = model;

        // Add the model to the scene
        scene.add(model);

        // Set up animations if they exist
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;

          console.log('Available animations:', gltf.animations.map(a => a.name));

          // Create animation actions and store them in the ref
          gltf.animations.forEach((clip: AnimationClip) => {
            const action = mixer.clipAction(clip);
            actionsRef.current[clip.name] = action;
          });

          // Play the idle animation by default if it exists
          if (actionsRef.current['idle']) {
            actionsRef.current['idle'].play();
          } else if (gltf.animations.length > 0) {
            // If no 'idle' animation, play the first available animation
            const firstAnimName = gltf.animations[0].name;
            actionsRef.current[firstAnimName].play();
            console.log(`Playing animation: ${firstAnimName}`);
          }
        }

        // Notify parent that model is loaded
        if (onModelLoaded) {
          onModelLoaded(model);
        }

        setIsLoaded(true);
        console.log('Character model loaded successfully');
      } catch (error) {
        console.error('Error loading character model:', error);
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
    if (!mixerRef.current || !actionsRef.current[animationName]) {
      console.warn(`Animation ${animationName} not found`);
      return;
    }

    // Fade out all current animations
    Object.values(actionsRef.current).forEach(action => {
      if (action.isRunning()) {
        action.fadeOut(fadeInTime);
      }
    });

    // Fade in the new animation
    const action = actionsRef.current[animationName];
    action.reset().fadeIn(fadeInTime).play();
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

    // No dependencies needed, as this should run only once after model is loaded
  }, []);  // Empty dependency array is acceptable here

  // The component doesn't render anything directly
  return null;
}
