'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

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
  const characterRef = useRef<THREE.Mesh | null>(null);
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

      // Create the character mesh - make it visible for third-person view
      const characterGeometry = new THREE.SphereGeometry(1, 16, 16);
      const characterMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xFF6347,  // Tomato color
        roughness: 0.7,
        metalness: 0.1
      });
      const character = new THREE.Mesh(characterGeometry, characterMaterial);

      // Set initial position
      character.position.copy(characterPositionRef.current);

      // Make sure the character is visible for third-person view
      character.visible = true;

      // Enable shadows
      character.castShadow = true;
      character.receiveShadow = true;

      scene.add(character);
      characterRef.current = character;

      // Physics constants
      const moveSpeed = 30;
      const jumpForce = 15;
      const gravity = 30;
      const friction = 0.9;

      // Set up a ground detection ray
      const raycaster = new THREE.Raycaster();
      const downDirection = new THREE.Vector3(0, -1, 0);

      // Helper to get terrain height using both methods
      const getTerrainHeight = (x: number, z: number): number => {
        let height = 0;

        // First try using the World's getTerrainHeight function
        if (typeof window !== 'undefined' && (window as any).getTerrainHeight) {
          height = (window as any).getTerrainHeight(x, z);
        }

        // Then use raycasting as a backup/verification
        const rayOrigin = new THREE.Vector3(x, 100, z); // Start high above
        raycaster.set(rayOrigin, downDirection);

        // Cast ray against terrain
        const terrainObject = scene.getObjectByName('terrain');
        if (terrainObject) {
          const intersects = raycaster.intersectObject(terrainObject, false);
          if (intersects.length > 0) {
            // Found terrain intersection point
            const raycastHeight = intersects[0].point.y;

            // Use the highest value to be safe
            height = Math.max(height, raycastHeight);
          }
        }

        // Store for debugging
        lastTerrainHeightRef.current = height;

        return height;
      };

      // Define the update function for physics-based movement
      const update: IdentifiableFunction = (delta: number) => {
        if (!character || !velocityRef.current || !characterPositionRef.current) return;

        // Apply friction to slow down when not pressing movement keys
        velocityRef.current.x *= friction;
        velocityRef.current.z *= friction;

        // Direction from character to camera (horizontal plane)
        const directionToCamera = new THREE.Vector3().subVectors(camera.position, character.position);
        directionToCamera.y = 0;
        directionToCamera.normalize();

        // Forward is opposite to camera direction
        const characterForward = directionToCamera.clone().negate();

        // Right vector: cross product of forward and up
        const characterRight = new THREE.Vector3().crossVectors(characterForward, new THREE.Vector3(0, 1, 0)).normalize();

        // Calculate move direction based on WASD input
        const moveDirection = new THREE.Vector3(0, 0, 0);

        // Get keys state
        const keys = (keysRef as any).current;

        if (keys.w) moveDirection.add(characterForward);  // Forward
        if (keys.s) moveDirection.sub(characterForward);  // Backward
        if (keys.a) moveDirection.sub(characterRight);    // Strafe left
        if (keys.d) moveDirection.add(characterRight);    // Strafe right

        // Normalize if we're moving in a direction
        if (moveDirection.lengthSq() > 0) {
          moveDirection.normalize();
          moveDirection.multiplyScalar(moveSpeed * delta);
          velocityRef.current.add(moveDirection);

          // Rotate character to face movement direction
          character.lookAt(
            character.position.x + moveDirection.x,
            character.position.y,
            character.position.z + moveDirection.z
          );
        }

        // Handle jumping
        if (keys[' '] && onGroundRef.current) {
          velocityRef.current.y = jumpForce;
          onGroundRef.current = false;
        }

        // Apply gravity if we're in the air
        if (!onGroundRef.current) {
          velocityRef.current.y -= gravity * delta;
        } else {
          velocityRef.current.y = Math.max(0, velocityRef.current.y);
        }

        // Update position based on velocity - but check terrain height at each step
        const newX = character.position.x + velocityRef.current.x * delta;
        const newZ = character.position.z + velocityRef.current.z * delta;

        // Check terrain height at proposed new position
        const terrainHeight = getTerrainHeight(newX, newZ);

        // Update horizontal position
        character.position.x = newX;
        character.position.z = newZ;

        // Apply y velocity 
        character.position.y += velocityRef.current.y * delta;

        // Debug logging occasionally (not every frame to avoid console spam)
        if (Math.random() < 0.01) {
          console.log(`Char Y: ${character.position.y.toFixed(2)}, Terrain: ${terrainHeight.toFixed(2)}, Delta: ${(character.position.y - terrainHeight).toFixed(2)}`);
        }

        // Prevent falling through the terrain with a buffer
        const characterHeight = 1; // Offset for character's height
        const minimumHeight = terrainHeight + characterHeight;

        if (character.position.y < minimumHeight) {
          character.position.y = minimumHeight;
          velocityRef.current.y = 0;
          onGroundRef.current = true;
        } else {
          // If we're above the terrain by a threshold, we're not on the ground
          onGroundRef.current = (character.position.y - minimumHeight) < 0.1;
        }

        // Update position reference and notify parent
        characterPositionRef.current.copy(character.position);
        if (onPositionUpdate) {
          onPositionUpdate(characterPositionRef.current);
        }
      };

      // Add identifier
      update._id = 'characterMovement';

      // Register the update function with the parent
      const removeUpdate = registerUpdate(update);

      // Return cleanup function
      return () => {
        if (character) {
          scene.remove(character);
        }
        removeUpdate();
      };
    };

    // Initialize character
    const cleanup = setupCharacter();

    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, [scene, registerUpdate, keysRef, camera, onPositionUpdate]);

  return null; // No DOM rendering, just Three.js logic
} 