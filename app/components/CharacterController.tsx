'use client';

import { useEffect, useRef } from 'react';
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const lastTerrainHeightRef = useRef<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const movingRef = useRef<boolean>(false);
  // Add Cannon.js body reference
  const characterBodyRef = useRef<CANNON.Body | null>(null);
  // Track last ground state for debugging
  const lastGroundStateRef = useRef<boolean>(true);

  const idleCounter = useRef(0);
  const isStationary = useRef(false);

  // This useEffect is necessary for THREE.js integration and physics
  useEffect(() => {
    if (!scene || !world) return;

    // Initialize references that need THREE
    velocityRef.current = new THREE.Vector3(0, 0, 0);
    characterPositionRef.current = new THREE.Vector3(0, 10, 5);

    // Create physics body for the character
    const characterBody = new CANNON.Body({
      mass: 5, // kg
      position: new CANNON.Vec3(0, 10, 0), // Start higher to prevent falling through floor
      shape: new CANNON.Sphere(1), // Simple sphere collider
      material: new CANNON.Material("characterMaterial"),
      fixedRotation: true, // Don't rotate character with physics
      linearDamping: 0.9, // Add damping to make movement feel better
      collisionFilterGroup: 1, // Character's collision group
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

      // Skip physics update if delta is too large (e.g., after tab switch)
      if (delta > 0.1) return;

      // Ensure the character body is awake every frame
      characterBodyRef.current.wakeUp();

      // Convert the keysRef to the expected type for typescript
      const keys = keysRef as React.MutableRefObject<{
        w: boolean;
        a: boolean;
        s: boolean;
        d: boolean;
        ' ': boolean;
      }>;

      // Check if character is moving or in air
      const isMoving = keys.current.w || keys.current.a || keys.current.s || keys.current.d;
      
      // Performance optimization: Reduce update frequency when idle
      if (!isMoving && onGroundRef.current) {
        idleCounter.current++;
        isStationary.current = true;
        
        // Only perform full updates periodically when idle (every 5th frame)
        if (idleCounter.current % 5 !== 0) {
          // Just update the model position and skip expensive physics
          if (characterRef.current && characterBodyRef.current) {
            characterRef.current.position.copy(
              new THREE.Vector3(
                characterBodyRef.current.position.x,
                characterBodyRef.current.position.y,
                characterBodyRef.current.position.z
              )
            );
          }
          return;
        }
      } else {
        isStationary.current = false;
        idleCounter.current = 0;
      }

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
        lastGroundStateRef.current = onGroundRef.current;
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

        // Apply rotation to the model - only when needed
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
      } else {
        // Stop horizontal movement when no keys are pressed
        characterBodyRef.current.velocity.x = 0;
        characterBodyRef.current.velocity.z = 0;
      }

      // Jump if space is pressed and character is on the ground
      if (keys.current[' '] && onGroundRef.current) {
        characterBodyRef.current.velocity.y = 6; // Reduced from 10 to 6
        onGroundRef.current = false; // Immediately set ground state to false
        
        // Add a small upward impulse for more responsive jumping
        characterBodyRef.current.applyImpulse(
          new CANNON.Vec3(0, 25, 0), // Reduced from 50 to 25
          characterBodyRef.current.position // Apply at center of mass
        );
      }
      
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

      // Update the character model position - only when visible
      if (characterRef.current && characterRef.current.visible) {
        characterRef.current.position.copy(characterPositionRef.current);
        characterRef.current.position.y -= 0.5; // Lower it slightly for visual alignment
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
  }, [scene, keysRef, registerUpdate, camera, onPositionUpdate, world]);

  // Character model component
  return (
    <Character
      scene={scene}
      position={characterPositionRef.current || new THREE.Vector3(0, 5, 5)}
      scale={new THREE.Vector3(1.2, 1.2, 1.2)}
      registerUpdate={registerUpdate}
      onModelLoaded={(group) => {
        characterRef.current = group;
      }}
    />
  );
} 