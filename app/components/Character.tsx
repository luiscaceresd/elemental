'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Add a type for functions with an identifier to match GameCanvas
type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

interface CharacterProps {
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
}

export default function Character({ scene, keysRef, registerUpdate, camera }: CharacterProps) {
  const characterRef = useRef<THREE.Mesh | null>(null);
  const velocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const onGroundRef = useRef(true);

  // This useEffect is necessary for THREE.js integration and cleanup
  useEffect(() => {
    // Import Three.js dynamically
    const setupCharacter = async () => {
      const THREE = await import('three');

      // Create the character mesh
      const character = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xFF6347 }) // Tomato color
      );
      character.position.set(0, 1, 5);
      scene.add(character);
      characterRef.current = character;

      // Physics constants
      const moveSpeed = 10;
      const jumpForce = 15;
      const gravity = 30;
      const friction = 0.9;

      // Set up a simple ground detection ray
      const raycaster = new THREE.Raycaster();
      const downDirection = new THREE.Vector3(0, -1, 0);

      // Define the update function for physics-based movement
      const update: IdentifiableFunction = (delta: number) => {
        if (!character) return;

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

        // Use type assertion without MutableRefObject
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

        // Check if we're on the ground
        raycaster.set(character.position.clone(), downDirection);
        const intersects = raycaster.intersectObjects(scene.children, false);
        onGroundRef.current = intersects.length > 0 && intersects[0].distance < 1.1;

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
      };

      // Add identifier
      update._id = 'characterUpdate';

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
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [scene, registerUpdate, keysRef, camera]);

  return null; // No DOM rendering, just Three.js logic
} 