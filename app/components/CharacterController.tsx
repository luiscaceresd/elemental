'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
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

// Physics constants
const MOVE_SPEED = 10;
const JUMP_FORCE = 7;
const GRAVITY = 9.8;
const FRICTION = 0.85; // Increased for quicker stopping
const STOP_THRESHOLD = 0.05; // Lower threshold to stop sooner

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
  const physicsWorldRef = useRef<CANNON.World | null>(null);
  const physicsBodyRef = useRef<CANNON.Body | null>(null);
  const physicsTouchingGroundRef = useRef(false);

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

      // Initialize CANNON.js physics world
      const world = new CANNON.World();
      world.gravity.set(0, -9.82, 0); // Standard Earth gravity
      world.defaultContactMaterial.friction = 0.1;
      world.defaultContactMaterial.restitution = 0.1;
      
      // Use a more stable solver with more iterations
      world.solver.iterations = 10;
      world.broadphase = new CANNON.NaiveBroadphase();

      // Set as current physics world
      physicsWorldRef.current = world;

      // Create ground plane for physics
      const groundShape = new CANNON.Plane();
      const groundBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: groundShape,
        collisionFilterGroup: 2, // Group 2 for ground
        collisionFilterMask: 1 | 4  // Collide with player (Group 1) and drops (Group 4)
      });
      
      // Rotate ground plane to be horizontal
      groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
      
      // Add body to world
      world.addBody(groundBody);

      // Create character physics body
      const characterShape = new CANNON.Sphere(0.5);
      physicsBodyRef.current = new CANNON.Body({
        mass: 5,
        position: new CANNON.Vec3(
          characterPositionRef.current.x,
          characterPositionRef.current.y,
          characterPositionRef.current.z
        ),
        linearDamping: 0.4, // Increased damping for better stopping
        angularDamping: 0.99, // High angular damping to prevent rolling
        allowSleep: false, // Don't allow character to sleep
        collisionFilterGroup: 1, // Group 1 for player
        collisionFilterMask: 2 // Only collide with ground (Group 2)
      });
      physicsBodyRef.current.addShape(characterShape);
      
      // Create a contact material for character-ground interaction
      const characterMaterial = new CANNON.Material('character');
      const groundMaterial = new CANNON.Material('ground');
      
      physicsBodyRef.current.material = characterMaterial;
      groundBody.material = groundMaterial;
      
      const contactMaterial = new CANNON.ContactMaterial(
        groundMaterial,
        characterMaterial,
        {
          friction: 0.0, // No friction for smooth movement
          restitution: 0.1,
          contactEquationStiffness: 1e8,
          contactEquationRelaxation: 3
        }
      );
      
      world.addContactMaterial(contactMaterial);
      
      // Add character body to world
      world.addBody(physicsBodyRef.current);
      
      // Add collision handler for ground detection
      physicsBodyRef.current.addEventListener('collide', (event) => {
        const contact = event.contact;
        
        // Check if the collision is with the bottom of the character
        if (contact.ni.y > 0.5) { // Normal pointing up means character is on top
          physicsTouchingGroundRef.current = true;
        }
      });

      // Helper functions
      const normalizeAngle = (angle: number): number => {
        return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      };

      const lerpAngle = (start: number, end: number, t: number): number => {
        // Find the shortest path for the rotation
        let diff = normalizeAngle(end) - normalizeAngle(start);
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        return start + diff * t;
      };

      const getTerrainHeight = (x: number, z: number): number => {
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
        if (!velocityRef.current || !characterPositionRef.current || 
            !physicsWorldRef.current || !physicsBodyRef.current) return;

        // Get the collider for visualization
        const collider = scene.getObjectByName('characterCollider') as THREE.Mesh;
        if (!collider) return;

        // Cap delta time to prevent large jumps
        const cappedDelta = Math.min(delta, 0.016);

        // Reset ground contact detection for this frame
        onGroundRef.current = physicsTouchingGroundRef.current;
        physicsTouchingGroundRef.current = false;

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
        const moveDirection = new THREE.Vector3(0, 0, 0);
        if (keys.current.w) moveDirection.add(cameraDirection);
        if (keys.current.s) moveDirection.sub(cameraDirection);
        if (keys.current.a) moveDirection.sub(cameraSide);
        if (keys.current.d) moveDirection.add(cameraSide);

        // Get current velocity from physics body
        const currentVelocity = physicsBodyRef.current.velocity;

        // Only normalize if we have some movement
        if (moveDirection.lengthSq() > 0) {
          moveDirection.normalize();

          // Calculate target rotation based on movement direction
          const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);

          // Apply rotation to the model
          if (characterRef.current) {
            const currentRotation = characterRef.current.rotation.y;
            const newRotation = lerpAngle(currentRotation, targetRotation, 10 * cappedDelta);
            characterRef.current.rotation.y = newRotation;
          }

          // Set movement speed and calculate target velocity
          const moveSpeed = 5; // Reduced for better control
          const targetVelocity = new CANNON.Vec3(
            moveDirection.x * moveSpeed,
            currentVelocity.y,
            moveDirection.z * moveSpeed
          );

          // Apply direct velocity control on ground for responsive movement
          if (onGroundRef.current) {
            // Direct velocity setting on ground for immediate response
            currentVelocity.x = targetVelocity.x;
            currentVelocity.z = targetVelocity.z;
          } else {
            // Use lerp in air for less control
            const lerpFactor = 0.05;
            currentVelocity.x += (targetVelocity.x - currentVelocity.x) * lerpFactor;
            currentVelocity.z += (targetVelocity.z - currentVelocity.z) * lerpFactor;
          }
        } else {
          // Slow down when no keys pressed - much stronger damping for quick stop
          if (onGroundRef.current) {
            currentVelocity.x *= 0.5; // Much stronger deceleration (was 0.95)
            currentVelocity.z *= 0.5;
            
            // Snap to zero below a threshold for immediate stop
            if (Math.abs(currentVelocity.x) < 0.1) currentVelocity.x = 0;
            if (Math.abs(currentVelocity.z) < 0.1) currentVelocity.z = 0;
          }
        }

        // Manual ground check using raycasting
        const raycastFrom = new CANNON.Vec3(
          physicsBodyRef.current.position.x,
          physicsBodyRef.current.position.y,
          physicsBodyRef.current.position.z
        );
        
        const raycastTo = new CANNON.Vec3(
          physicsBodyRef.current.position.x,
          physicsBodyRef.current.position.y - 1.05, // Slightly beyond sphere radius
          physicsBodyRef.current.position.z
        );
        
        const result = new CANNON.RaycastResult();
        physicsWorldRef.current.raycastClosest(raycastFrom, raycastTo, {}, result);
        
        // Consider on ground if either collision detected or raycast hit
        onGroundRef.current = onGroundRef.current || result.hasHit;

        // Jump if space is pressed and character is on the ground
        if (keys.current[' '] && onGroundRef.current) {
          physicsBodyRef.current.velocity.y = 2; // Reduced jump height
          onGroundRef.current = false;
        }

        // Get terrain height at character's position
        const terrainHeight = getTerrainHeight(
          physicsBodyRef.current.position.x,
          physicsBodyRef.current.position.z
        );

        // Store terrain height for next frame
        lastTerrainHeightRef.current = terrainHeight;

        // Keep character above terrain
        if (physicsBodyRef.current.position.y < terrainHeight + 1) {
          physicsBodyRef.current.position.y = terrainHeight + 1;
          physicsBodyRef.current.velocity.y = 0;
          onGroundRef.current = true;
        }

        // Step the physics simulation forward
        physicsWorldRef.current.step(cappedDelta);

        // Update THREE.js from Cannon.js
        characterPositionRef.current.copy(new THREE.Vector3(
          physicsBodyRef.current.position.x,
          physicsBodyRef.current.position.y,
          physicsBodyRef.current.position.z
        ));

        // Update collider mesh position
        collider.position.copy(characterPositionRef.current);

        // Update character model position
        if (characterRef.current) {
          characterRef.current.position.copy(characterPositionRef.current);
          characterRef.current.position.y -= 0.5; // Visual offset from physics center
          characterRef.current.visible = true;
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
        
        // Clean up physics bodies
        if (physicsWorldRef.current && physicsBodyRef.current) {
          physicsWorldRef.current.removeBody(physicsBodyRef.current);
        }
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