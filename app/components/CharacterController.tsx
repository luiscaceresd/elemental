'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon';
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
  world: CANNON.World; // Add Cannon.js world
}

export default function CharacterController({
  scene,
  keysRef,
  registerUpdate,
  camera,
  onPositionUpdate,
  world
}: CharacterControllerProps) {
  const characterRef = useRef<THREE.Group | null>(null);
  const velocityRef = useRef<THREE.Vector3 | null>(null);
  const onGroundRef = useRef(true);
  // Create a ref to store character position for external components to access
  const characterPositionRef = useRef<THREE.Vector3 | null>(null);
  const lastTerrainHeightRef = useRef<number>(0);
  const movingRef = useRef<boolean>(false);
  // Add Cannon.js body reference
  const characterBodyRef = useRef<CANNON.Body | null>(null);
  // Track last ground state for debugging
  const lastGroundStateRef = useRef<boolean>(true);
  const currentAnimationRef = useRef<string | null>(null);

  // --- Add State/Memo for Stable Props ---
  // Restore useMemo for production build stability
  const characterScale = useMemo(() => new THREE.Vector3(1.2, 1.2, 1.2), []); 
  // console.log('CharacterController Render: characterScale =', characterScale.x, characterScale.y, characterScale.z); // Keep commented for build
  // Use state for the initial position to ensure a stable reference if ref is null
  const [initialPosition] = useState(() => new THREE.Vector3(0, 1, 5));
  // ------------------------------------

  // This useEffect is necessary for THREE.js integration and physics
  useEffect(() => {
    // Import Three.js dynamically
    const setupCharacter = async () => {
      const THREE = await import('three');

      // Initialize references that need THREE
      velocityRef.current = new THREE.Vector3(0, 0, 0);
       // Use the state variable for initial physics position
      characterPositionRef.current = initialPosition.clone();

      // Remove any existing colliders to prevent duplicates
      const existingCollider = scene.getObjectByName('characterCollider');
      if (existingCollider) {
        scene.remove(existingCollider);
      }

      // Create a Cannon.js body for the character
      const characterShape = new CANNON.Sphere(1); // Matches the size of the previous collider
      const characterBody = new CANNON.Body({
        mass: 5, // Character has mass (dynamic object)
        shape: characterShape,
        // position: new CANNON.Vec3(0, 3, 5), // Initial position - start a bit higher to ensure it doesn't spawn inside the ground
        position: new CANNON.Vec3(initialPosition.x, initialPosition.y + 2, initialPosition.z), // Adjust initial physics pos based on state
        material: new CANNON.Material("characterMaterial"),
        linearDamping: 0, // No damping for frictionless movement
        angularDamping: 0.99, // Prevent excessive rotation
        fixedRotation: true, // Prevent character from rotating when moving
        allowSleep: false, // Prevent the body from sleeping to ensure continuous updates
        sleepSpeedLimit: 1000, // Set an extremely high sleep speed limit
        collisionFilterGroup: 1, // Character collision group
        collisionFilterMask: 1 // Character collides with group 1 (which includes the ground)
      });
      
      // Increase collision detection accuracy
      characterBody.collisionResponse = true; // Full collision response
      
      // Prevent the body from sleeping explicitly
      characterBody.wakeUp();
      
      // Add the body to the physics world
      world.addBody(characterBody);
      characterBodyRef.current = characterBody;

      // Create a contact material for character-ground interaction
      const groundMaterial = new CANNON.Material("groundMaterial");
      const characterGroundContact = new CANNON.ContactMaterial(
        groundMaterial,
        characterBody.material,
        {
          friction: 0, // No friction for debugging
          restitution: 0.1, // Reduced bounce
          contactEquationStiffness: 1e8, // Increase to prevent sinking
          contactEquationRelaxation: 3 // Adjusted for better stability
        }
      );
      world.addContactMaterial(characterGroundContact);

      // Ground detection using collision events
      characterBody.addEventListener('collide', (
        _event: { type: string; body: CANNON.Body; contact: CANNON.ContactEquation; }
      ) => {
        // Check if collision is with the ground (could check material or position)
        const contact = _event.contact;
        
        // If contact normal points upward, we're on the ground (lowered threshold)
        if (contact.ni.y > 0.2) { // Reduced threshold from 0.5 to 0.2
          onGroundRef.current = true;
        }
      });
      
      // Explicitly set initial ground state to true since we start on the ground
      onGroundRef.current = true;

      // Physics constants - removing unused friction variable
      
      // Define the update function for physics-based movement
      const update: IdentifiableFunction = (delta: number) => {
        if (!characterBodyRef.current || !characterPositionRef.current) return;

        // Ensure the character body is awake every frame
        characterBodyRef.current.wakeUp();

        // Alternative ground detection: check if character is close to y=0 (ground plane)
        // This handles cases where collision detection might not work perfectly
        const characterHeight = characterBodyRef.current.position.y;
        const characterRadius = 1; // Same as the sphere radius
        const groundThreshold = characterRadius + 0.1; // Small buffer
        
        if (characterHeight <= groundThreshold) {
          // We are definitely on the ground if we're very close to y=0
          onGroundRef.current = true;
          
          // If character is too close to ground, push it up slightly to prevent sinking
          if (characterHeight < characterRadius * 0.9) {
            characterBodyRef.current.position.y = characterRadius;
          }
        }
        
        // Debug ground state when it changes
        if (lastGroundStateRef.current !== onGroundRef.current) {
          // Removed console.log
          lastGroundStateRef.current = onGroundRef.current;
        }

        // Convert the keysRef to the expected type for typescript
        const keys = keysRef as React.MutableRefObject<{
          w: boolean;
          a: boolean;
          s: boolean;
          d: boolean;
          ' ': boolean;
        }>;

        // Debug movement - only when keys are pressed
        const isMoving = keys.current.w || keys.current.a || keys.current.s || keys.current.d;
        if (isMoving && Math.floor(Date.now() / 500) % 2 === 0) {
          // Removed console.log
        }

        // Get camera direction for movement relative to camera
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);
        cameraDirection.y = 0; // Keep movement on the x-z plane
        cameraDirection.normalize();

        // Create a vector perpendicular to camera direction for strafing
        const cameraSide = new THREE.Vector3(-cameraDirection.z, 0, cameraDirection.x);

        // Calculate the desired movement direction based on keys
        const moveDirection = new THREE.Vector3(0, 0, 0);
        if (keys.current.w) moveDirection.add(cameraDirection);
        if (keys.current.s) moveDirection.sub(cameraDirection);
        if (keys.current.a) moveDirection.sub(cameraSide);
        if (keys.current.d) moveDirection.add(cameraSide);

        // Only normalize if we have some movement
        if (moveDirection.lengthSq() > 0) {
          moveDirection.normalize();

          // Calculate target rotation based on movement direction
          const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);

          // Apply rotation to the model
          if (characterRef.current) {
            const currentRotation = characterRef.current.rotation.y;
            const newRotation = lerpAngle(currentRotation, targetRotation, 10 * delta);
            characterRef.current.rotation.y = newRotation;
          }

          // Apply movement using direct velocity control
          // Set horizontal velocity directly for precise control
          const speed = 25; // Increased speed from 15 to 25 for faster movement
          characterBodyRef.current.velocity.x = moveDirection.x * speed;
          characterBodyRef.current.velocity.z = moveDirection.z * speed;
          // Leave the y velocity unchanged to preserve gravity/jumping
          
          // Debug movement was moved to a periodic check above to avoid spam
        } else {
          // Stop horizontal movement when no keys are pressed
          characterBodyRef.current.velocity.x = 0;
          characterBodyRef.current.velocity.z = 0;
        }

        // Jump if space is pressed and character is on the ground
        if (keys.current[' '] && onGroundRef.current) {
          characterBodyRef.current.velocity.y = 5; // Reduced from 6 to 5
          onGroundRef.current = false; // Immediately set ground state to false
          
          // Add a small upward impulse for more responsive jumping
          characterBodyRef.current.applyImpulse(
            new CANNON.Vec3(0, 15, 0), // Reduced from 25 to 15
            characterBodyRef.current.position // Apply at center of mass
          );
          
          // Removed console.log
        }
        
        // --- Animation State Machine ---
        let nextAnimation = 'idle'; // Default to idle
        const characterBody = characterBodyRef.current; // Alias for easier access
        
        if (!onGroundRef.current) {
            nextAnimation = 'jumping';
        } else if (isMoving) {
            // Calculate horizontal speed
            const speed = new THREE.Vector3(characterBody.velocity.x, 0, characterBody.velocity.z).length();
            if (speed > 15) { // Adjust threshold as needed for running
                nextAnimation = 'running';
            } else {
                nextAnimation = 'walking';
            }
        }
        
        // Check if the character model exists and has the playAnimation method
        const characterModel = characterRef.current as (THREE.Group & { playAnimation?: (name: string, fade: number) => void }) | null;

        if (characterModel?.playAnimation && nextAnimation !== currentAnimationRef.current) {
            console.log(`Switching animation from ${currentAnimationRef.current} to ${nextAnimation}`);
            characterModel.playAnimation(nextAnimation, 0.3); // Play with fade
            currentAnimationRef.current = nextAnimation;
        }
        // --- End Animation State Machine ---

        // Reset ground state when falling
        if (characterBodyRef.current.velocity.y < -1) {
          onGroundRef.current = false;
        }

        // Get the character position from the physics body
        const bodyPosition = characterBodyRef.current.position;
        characterPositionRef.current.set(
          bodyPosition.x,
          bodyPosition.y,
          bodyPosition.z
        );

        // Update the character model position
        if (characterRef.current) {
          characterRef.current.position.copy(characterPositionRef.current);
          characterRef.current.position.y -= 1; // <-- UNCOMMENT this offset
          characterRef.current.visible = true;
        }

        // Call the position update callback if it exists
        if (onPositionUpdate) {
          onPositionUpdate(characterPositionRef.current);
        }
      };

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

      // Register the update function
      update._id = 'characterController';
      const unregisterUpdate = registerUpdate(update);

      // Return the cleanup function
      return () => {
        unregisterUpdate();
        if (characterBodyRef.current) {
          world.remove(characterBodyRef.current);
        }
      };
    };

    setupCharacter();
  }, [scene, keysRef, registerUpdate, camera, onPositionUpdate, world, initialPosition]);

  // --- Wrap handleModelLoaded in useCallback ---
  const handleModelLoaded = useCallback((model: THREE.Group) => {
    // Log the UUID of the model received by the controller
    console.log(`CharacterController handleModelLoaded: Received model UUID: ${model.uuid}`);
    characterRef.current = model;

    // If we already have a position, update the model
    if (characterPositionRef.current) {
      console.log(`CharacterController handleModelLoaded: Applying initial position/scale to UUID: ${model.uuid}`);
      model.position.copy(characterPositionRef.current);
      // model.position.y -= 0.5; // Keep commented out

      // Use the stable scale vector
      model.scale.copy(characterScale);

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
    } else {
       console.log(`CharacterController handleModelLoaded: No initial characterPositionRef for UUID: ${model.uuid}`);
    }
     // Add dependencies for useCallback
  }, [characterScale]); // Add characterScale to dependencies
  // ------------------------------------------

  return (
    <Character
      scene={scene}
      onModelLoaded={handleModelLoaded} // Pass the memoized callback
      // Pass stable position reference (ref should be set by the time Character mounts ideally)
      position={characterPositionRef.current ?? initialPosition}
      scale={characterScale} // Pass the stable scale vector
      registerUpdate={registerUpdate}
    />
  );
} 