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

// Physics constants - prefix with underscore to indicate they are used indirectly via TS-ignore
const _MOVE_SPEED = 10;
const JUMP_FORCE = 5;
const GRAVITY = 30;
const _FRICTION = 0.85;
const _STOP_THRESHOLD = 0.05;

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
      const colliderGeometry = new THREE.SphereGeometry(0.5, 16, 16); // Match physics body radius
      const colliderMaterial = new THREE.MeshBasicMaterial({
        visible: false  // Make it invisible
      });

      const collider = new THREE.Mesh(colliderGeometry, colliderMaterial);
      collider.position.copy(characterPositionRef.current);
      collider.visible = false;
      collider.name = 'characterCollider';
      scene.add(collider);

      // Initialize CANNON.js physics world with stronger settings
      const world = new CANNON.World();
      world.gravity.set(0, -GRAVITY, 0); // Use stronger gravity constant
      world.defaultContactMaterial.friction = 0.1;
      world.defaultContactMaterial.restitution = 0.0;
      
      // Use a more stable solver with more iterations
      // @ts-expect-error - Property exists at runtime but not in type definition
      world.solver.iterations = 20; // More iterations for stability
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
        linearDamping: 0.4,
        angularDamping: 0.99,
        allowSleep: false,
        fixedRotation: true,
        collisionFilterGroup: 1,
        collisionFilterMask: 2
      });
      physicsBodyRef.current.addShape(characterShape);
      
      // Create a contact material for character-ground interaction
      const characterMaterial = new CANNON.Material('character');
      const groundMaterial = new CANNON.Material('ground');
      
      physicsBodyRef.current.material = characterMaterial;
      groundBody.material = groundMaterial;
      
      // Create contact material between character and ground
      const contactMaterial = new CANNON.ContactMaterial(
        characterMaterial, 
        groundMaterial,
        {
          friction: 0.1,
          restitution: 0.0,
          contactEquationStiffness: 1e6,
          contactEquationRelaxation: 3
        }
      );
      physicsWorldRef.current.addContactMaterial(contactMaterial);
      
      // Add character body to world
      world.addBody(physicsBodyRef.current);
      
      // Add collision handler for ground detection
      physicsBodyRef.current.addEventListener('collide', (event: { type: string; body: CANNON.Body; contact: CANNON.ContactEquation }) => {
        const contact = event.contact;
        
        // Check if collision is with ground
        if (contact.bi.id === groundBody.id || contact.bj.id === groundBody.id) {
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

        // Direct ground check at the start of each frame
        const position = physicsBodyRef.current.position;
        const currentTerrainHeight = getTerrainHeight(position.x, position.z);
        
        // If character is below ground level, immediately correct
        if (position.y < currentTerrainHeight + 0.5) {
          position.y = currentTerrainHeight + 0.5;
          physicsBodyRef.current.velocity.y = 0;
          onGroundRef.current = true;
        } else {
          // Apply extra gravity force when in air
          physicsBodyRef.current.force.y -= physicsBodyRef.current.mass * GRAVITY * 1.5;
        }

        // Reset ground contact detection for this frame
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

        // Enhanced ground detection with longer ray
        const raycastFrom = new CANNON.Vec3(
          physicsBodyRef.current.position.x,
          physicsBodyRef.current.position.y,
          physicsBodyRef.current.position.z
        );
        
        const raycastTo = new CANNON.Vec3(
          physicsBodyRef.current.position.x,
          physicsBodyRef.current.position.y - 1.0,
          physicsBodyRef.current.position.z
        );
        
        const result = new CANNON.RaycastResult();
        physicsWorldRef.current.raycastClosest(raycastFrom, raycastTo, {}, result);
        
        // Combine both collision and raycast for ground detection
        onGroundRef.current = physicsTouchingGroundRef.current || result.hasHit;

        // Jump if space is pressed and character is on the ground
        if (keys.current[' '] && onGroundRef.current) {
          physicsBodyRef.current.velocity.y = JUMP_FORCE;
          onGroundRef.current = false;
        }

        // Get terrain height at character's position
        const terrainHeight = getTerrainHeight(
          physicsBodyRef.current.position.x,
          physicsBodyRef.current.position.z
        );

        // Store terrain height for next frame
        lastTerrainHeightRef.current = terrainHeight;

        // Force character to stay above terrain with exact height
        const minHeight = terrainHeight + 0.5;
        if (physicsBodyRef.current.position.y < minHeight) {
          physicsBodyRef.current.position.y = minHeight;
          physicsBodyRef.current.velocity.y = Math.max(0, physicsBodyRef.current.velocity.y);
          onGroundRef.current = true;
        }

        // Apply constant downward force to ensure grounding
        if (!onGroundRef.current) {
          physicsBodyRef.current.force.y -= 200;
        }

        // Step the physics simulation forward
        physicsWorldRef.current.step(cappedDelta);

        // CRITICAL: Final ground check after physics step
        // This guarantees the character stays on the ground
        const finalPosition = physicsBodyRef.current.position;
        const finalTerrainHeight = getTerrainHeight(finalPosition.x, finalPosition.z);
        
        // If character ended up below ground level after physics, correct position
        if (finalPosition.y < finalTerrainHeight + 0.5) {
          finalPosition.y = finalTerrainHeight + 0.5;
          physicsBodyRef.current.velocity.y = 0;
          onGroundRef.current = true;
        }

        // Update THREE.js from Cannon.js
        characterPositionRef.current.copy(new THREE.Vector3(
          physicsBodyRef.current.position.x,
          physicsBodyRef.current.position.y,
          physicsBodyRef.current.position.z
        ));

        // Update collider mesh position
        collider.position.copy(characterPositionRef.current);

        // Update character model position - ensure perfect alignment with physics body
        if (characterRef.current) {
          // Position character model at exactly the physics body position
          characterRef.current.position.copy(characterPositionRef.current);
          
          // Apply offset to align feet with ground
          characterRef.current.position.y -= 0.5;
          
          // Make sure character is visible
          characterRef.current.visible = true;
          
          // Ensure all child meshes are visible
          characterRef.current.traverse((node) => {
            if (node instanceof THREE.Mesh) {
              node.visible = true;
              if (node.material) {
                if (Array.isArray(node.material)) {
                  node.material.forEach(mat => {
                    mat.visible = true;
                    mat.needsUpdate = true;
                  });
                } else {
                  node.material.visible = true;
                  node.material.needsUpdate = true;
                }
              }
            }
          });
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