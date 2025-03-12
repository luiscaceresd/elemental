'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import Character from './Character';

type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

interface CharacterControllerProps {
  scene: THREE.Scene;
  keysRef: React.Ref<{
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    ' ': boolean; // Space key
  }>;
  registerUpdate: (updateFn: IdentifiableFunction) => () => void;
  camera: THREE.Camera;
  onPositionUpdate?: (position: THREE.Vector3) => void;
}

export default function CharacterController({
  scene,
  keysRef,
  registerUpdate,
  camera,
  onPositionUpdate
}: CharacterControllerProps) {
  const characterRef = useRef<THREE.Group | null>(null);
  const velocityRef = useRef<THREE.Vector3 | null>(null);
  const onGroundRef = useRef(true);
  const characterPositionRef = useRef<THREE.Vector3 | null>(null);
  const lastTerrainHeightRef = useRef<number>(0);

  // This useEffect is necessary for THREE.js integration and physics
  useEffect(() => {
    // Import Three.js dynamically
    const setupCharacter = async () => {
      const THREE = await import('three');

      // Initialize references that need THREE
      velocityRef.current = new THREE.Vector3(0, 0, 0);
      characterPositionRef.current = new THREE.Vector3(0, 1, 5);

      // Remove any existing colliders to prevent duplicates
      const existingCollider = scene.getObjectByName('characterCollider');
      if (existingCollider) {
        scene.remove(existingCollider);
      }

      // Character is now loaded via the Character component
      // The physics collider is still needed, but can be invisible
      const colliderGeometry = new THREE.SphereGeometry(1, 16, 16);
      const colliderMaterial = new THREE.MeshBasicMaterial({
        visible: false  // Make it invisible
      });

      const collider = new THREE.Mesh(colliderGeometry, colliderMaterial);
      collider.position.copy(characterPositionRef.current);
      collider.visible = false;
      collider.name = 'characterCollider';
      scene.add(collider);

      // Physics constants
      // The following constants are commented out because they're not currently used,
      // but may be needed for future physics enhancements
      // const moveSpeed = 30;
      // const jumpForce = 15;
      // const gravity = 30;
      const friction = 0.9;
      // const rotationSpeed = 0.1; // How fast character rotates to face movement direction

      // Helper to normalize angle between -PI and PI
      const normalizeAngle = (angle: number): number => {
        return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      };

      // Helper to interpolate between angles
      const lerpAngle = (start: number, end: number, t: number): number => {
        // Find the shortest path for the rotation
        let diff = normalizeAngle(end) - normalizeAngle(start);
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        return start + diff * t;
      };

      // Helper to get terrain height using both methods
      const getTerrainHeight = (x: number, z: number): number => {
        // This function will look for a globally defined getTerrainHeight function
        // that should be set by the world component

        interface WindowWithTerrain extends Window {
          getTerrainHeight?: (x: number, z: number) => number;
        }

        const windowWithTerrain = window as WindowWithTerrain;

        if (typeof windowWithTerrain.getTerrainHeight === 'function') {
          return windowWithTerrain.getTerrainHeight(x, z);
        } else {
          // Fall back to a simple flat terrain if the world terrain isn't ready
          return 0;
        }
      };

      // Define the update function for physics-based movement
      const update: IdentifiableFunction = (delta: number) => {
        if (!velocityRef.current || !characterPositionRef.current) return;

        // Get the collider for physics calculations
        const collider = scene.getObjectByName('characterCollider') as THREE.Mesh;
        if (!collider) return;

        // Apply friction to slow down when not pressing movement keys
        velocityRef.current.x *= friction;
        velocityRef.current.z *= friction;

        // Convert the keysRef to the expected type for typescript
        const keys = keysRef as React.MutableRefObject<{
          w: boolean;
          a: boolean;
          s: boolean;
          d: boolean;
          ' ': boolean;
        }>;

        // Get camera direction for movement relative to camera
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Keep movement on the x-z plane
        cameraDirection.normalize();

        // Create a vector perpendicular to camera direction for strafing
        const cameraSide = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x);

        // Calculate the desired movement direction based on keys
        // With our character now rotated to face -Z, W should move forward in that direction
        const moveDirection = new THREE.Vector3(0, 0, 0);
        if (keys.current.w) moveDirection.add(cameraDirection);  // Forward is camera direction
        if (keys.current.s) moveDirection.sub(cameraDirection);  // Backward is opposite of camera direction
        if (keys.current.a) moveDirection.sub(cameraSide);       // Left is opposite of perpendicular
        if (keys.current.d) moveDirection.add(cameraSide);       // Right is perpendicular to camera direction

        // Only normalize if we have some movement
        if (moveDirection.lengthSq() > 0) {
          moveDirection.normalize();

          // Calculate target rotation based on movement direction
          // This determines which way the character should face
          const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);

          // Apply rotation to the model
          if (characterRef.current) {
            // Since our model is initially rotated by Math.PI to face -Z,
            // we need to add PI to our target rotation for correct alignment
            const currentRotation = characterRef.current.rotation.y;
            const newRotation = lerpAngle(currentRotation, targetRotation, 10 * delta);
            characterRef.current.rotation.y = newRotation;
          }
        }

        // Apply ground movement
        if (onGroundRef.current) {
          // Apply movement based on key presses
          if (moveDirection.lengthSq() > 0) {
            const speedFactor = 5; // Adjust for desired speed
            velocityRef.current.x = moveDirection.x * speedFactor;
            velocityRef.current.z = moveDirection.z * speedFactor;
          } else {
            // Apply friction when no keys are pressed
            velocityRef.current.x *= 0.9;
            velocityRef.current.z *= 0.9;
          }

          // Jump if space is pressed and character is on the ground
          if (keys.current[' '] && onGroundRef.current) {
            velocityRef.current.y = 8; // Jump strength
            onGroundRef.current = false;
          }
        }

        // Apply gravity
        if (!onGroundRef.current) {
          velocityRef.current.y -= 20 * delta; // Gravity
        }

        // Apply velocity to position
        characterPositionRef.current.x += velocityRef.current.x * delta;
        characterPositionRef.current.y += velocityRef.current.y * delta;
        characterPositionRef.current.z += velocityRef.current.z * delta;

        // Get terrain height at character's position
        const terrainHeight = getTerrainHeight(
          characterPositionRef.current.x,
          characterPositionRef.current.z
        );

        // Store this for the next frame
        lastTerrainHeightRef.current = terrainHeight;

        // Keep character above the terrain
        if (characterPositionRef.current.y < terrainHeight + 1) { // +1 because our character is a 1-unit radius sphere
          characterPositionRef.current.y = terrainHeight + 1;
          velocityRef.current.y = 0;
          onGroundRef.current = true;
        }

        // Update collider position
        collider.position.copy(characterPositionRef.current);

        // If we have a character model, update its position
        if (characterRef.current) {
          characterRef.current.position.copy(characterPositionRef.current);
          // Lower it a bit but not too much, to keep character visible above terrain
          characterRef.current.position.y -= 0.5;

          // Ensure model is always visible
          characterRef.current.visible = true;

          // Occasionally log position for debugging
          if (Math.random() < 0.01) {
            console.log('Character position:', characterRef.current.position);
          }
        }

        // Call the position update callback if it exists
        if (onPositionUpdate) {
          onPositionUpdate(characterPositionRef.current);
        }
      };

      // Register the update function
      update._id = 'characterController';
      const unregisterUpdate = registerUpdate(update);

      // Return the cleanup function
      return () => {
        unregisterUpdate();
        scene.remove(collider);
      };
    };

    setupCharacter();
  }, [scene, keysRef, registerUpdate, camera, onPositionUpdate]);

  // Handle character model loaded from the Character component
  const handleModelLoaded = (model: THREE.Group) => {
    characterRef.current = model;

    // If we already have a position, update the model
    if (characterPositionRef.current) {
      model.position.copy(characterPositionRef.current);
      model.position.y -= 0.5; // Reduced offset for better visibility on terrain

      // Update: We already rotated the model by Math.PI in Character.tsx,
      // so we don't need to apply an initial rotation here.
      // Removing this line since it's causing the initial opposite direction issue
      // model.rotation.y = Math.PI;

      // Adjust scale if needed - scale up slightly for better visibility
      model.scale.set(1.2, 1.2, 1.2);

      // Ensure model and all its children are visible
      model.visible = true;
      model.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.visible = true;

          // Make sure materials are properly configured for visibility
          if (node.material) {
            const material = Array.isArray(node.material)
              ? node.material[0]
              : node.material;

            if (material) {
              material.transparent = false;
              material.opacity = 1.0;
              material.visible = true;
            }
          }
        }
      });
    }
  };

  return (
    <Character
      scene={scene}
      onModelLoaded={handleModelLoaded}
      position={characterPositionRef.current || new THREE.Vector3(0, 1, 5)}
      scale={new THREE.Vector3(1.2, 1.2, 1.2)} // Increased scale for better visibility
      registerUpdate={registerUpdate}
    />
  );
} 