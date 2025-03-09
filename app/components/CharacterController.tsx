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

  // This useEffect is necessary for THREE.js integration and physics
  useEffect(() => {
    // Import Three.js dynamically
    const setupCharacter = async () => {
      const THREE = await import('three');

      // Initialize references that need THREE
      velocityRef.current = new THREE.Vector3(0, 0, 0);
      characterPositionRef.current = new THREE.Vector3(0, 1, 5);

      // Create the character mesh
      const character = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xFF6347 }) // Tomato color
      );

      // Set initial position
      character.position.copy(characterPositionRef.current);
      scene.add(character);
      characterRef.current = character;

      // Physics constants
      const moveSpeed = 20;
      const jumpForce = 15;
      const gravity = 30;
      const friction = 0.9;

      // Set up a simple ground detection ray
      const raycaster = new THREE.Raycaster();
      const downDirection = new THREE.Vector3(0, -1, 0);

      // Define the update function for physics-based movement
      const update: IdentifiableFunction = (delta: number) => {
        if (!character || !velocityRef.current || !characterPositionRef.current) return;

        // Apply friction to slow down when not pressing movement keys
        velocityRef.current.x *= friction;
        velocityRef.current.z *= friction;

        // Get the camera's forward and right directions (in the horizontal plane)
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Keep movement in horizontal plane
        cameraDirection.normalize();

        // Right is perpendicular to forward in the horizontal plane
        const cameraRight = new THREE.Vector3(
          cameraDirection.z,
          0,
          -cameraDirection.x
        ).normalize();

        // Calculate move direction based on WASD input
        const moveDirection = new THREE.Vector3(0, 0, 0);

        // Get keys state
        const keys = (keysRef as any).current;

        if (keys.w) {
          moveDirection.add(cameraDirection);
        }
        if (keys.s) {
          moveDirection.sub(cameraDirection);
        }
        if (keys.a) {
          moveDirection.sub(cameraRight);
        }
        if (keys.d) {
          moveDirection.add(cameraRight);
        }

        // Normalize if we're moving in a direction
        if (moveDirection.lengthSq() > 0) {
          moveDirection.normalize();
          moveDirection.multiplyScalar(moveSpeed * delta);
          velocityRef.current.add(moveDirection);
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

        // Update position based on velocity
        character.position.x += velocityRef.current.x * delta;
        character.position.y += velocityRef.current.y * delta;
        character.position.z += velocityRef.current.z * delta;

        // Prevent falling through the ground
        if (character.position.y < 1) {
          character.position.y = 1;
          velocityRef.current.y = 0;
          onGroundRef.current = true;
        }

        // Rotate character to face movement direction
        if (moveDirection.lengthSq() > 0) {
          character.lookAt(
            character.position.x + moveDirection.x,
            character.position.y,
            character.position.z + moveDirection.z
          );
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