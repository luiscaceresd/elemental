'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon';
import WaterMeter from './WaterMeter';

// Extend the type definitions for CANNON.World to include missing methods
declare module 'cannon' {
  interface World {
    addBody(body: CANNON.Body): void;
    removeBody(body: CANNON.Body): void;
  }
}

// Remove the manual type declaration
type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

interface WaterBendingProps {
  scene: THREE.Scene;
  domElement: HTMLCanvasElement;
  registerUpdate: (updateFn: IdentifiableFunction) => () => void;
  camera: THREE.Camera;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  characterPositionRef?: React.MutableRefObject<THREE.Vector3 | null>;
  world: CANNON.World;
}

// Define a WaterSpear type for our pool
interface WaterSpear {
  spearGroup: THREE.Group;
  trail: THREE.Points;
  trailGeometry: THREE.BufferGeometry;
  body?: CANNON.Body;
  inUse: boolean;
  creationTime?: number; // When the spear was created/last used
  _updateId?: string; // ID of the update function for this spear
}

// Debug flag to show water source detection
const DEBUG_WATER_SOURCES = false;

export default function WaterBending({
  scene,
  domElement,
  registerUpdate,
  camera,
  isBendingRef,
  crosshairPositionRef,
  characterPositionRef,
  world
}: WaterBendingProps) {
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  // We'll keep the ref but just mark it as unused to avoid future errors
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mousePositionRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const bendingEffectRef = useRef<THREE.Mesh | null>(null);
  const bendingParticlesRef = useRef<THREE.Points | null>(null);
  const collectedDropsRef = useRef<number>(0);
  const waterBeltSpheresRef = useRef<THREE.Mesh[]>([]); // Back to just core spheres
  const freeDropsRef = useRef<{ mesh: THREE.Mesh; body: CANNON.Body }[]>([]);
  const [displayedDrops, setDisplayedDrops] = useState<number>(0);
  const MAX_WATER_DROPS = 450;
  const REQUIRED_DROPS_TO_FIRE = 45;
  const MAX_VISIBLE_SPHERES = 10;
  const MAX_SPEAR_LIFETIME_MS = 10000; // Maximum lifetime for a spear

  // Add refs for shared water projectile resources
  const spearGeometryRef = useRef<THREE.CylinderGeometry | null>(null);
  const spearMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const glowGeometryRef = useRef<THREE.CylinderGeometry | null>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const dropGeometryRef = useRef<THREE.SphereGeometry | null>(null);
  const dropMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const trailMaterialRef = useRef<THREE.PointsMaterial | null>(null);

  // Add a spear pool for object reuse
  const spearPoolRef = useRef<WaterSpear[]>([]);
  const SPEAR_POOL_SIZE = 50; // Increased from 20 to 50 to prevent pool exhaustion
  const activeSpearUpdatesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const updateDisplayCount = () => {
      setDisplayedDrops(collectedDropsRef.current);
      requestAnimationFrame(updateDisplayCount);
    };
    const animationId = requestAnimationFrame(updateDisplayCount);
    return () => cancelAnimationFrame(animationId);
  }, []);

  useEffect(() => {
    const setupWaterBending = async () => {
      const THREE = await import('three');
      const Hammer = (await import('hammerjs')).default;

      raycasterRef.current = new THREE.Raycaster();

      // Initialize shared resources for water projectile
      spearGeometryRef.current = new THREE.CylinderGeometry(1.2, 0.4, 6.0, 16);
      spearMaterialRef.current = new THREE.MeshPhysicalMaterial({
        color: 0x00FFFF, // Brighter cyan
        transparent: false, // Remove transparency
        opacity: 1.0,
        roughness: 0,
        metalness: 0.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0, // Remove transmission to make fully visible
        ior: 1.33,
        emissive: 0x00FFFF, // Match emissive to color
        emissiveIntensity: 2.0 // Much stronger glow
      });

      glowGeometryRef.current = new THREE.CylinderGeometry(1.5, 0.6, 6.5, 16);
      glowMaterialRef.current = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF, // White glow
        transparent: true,
        opacity: 0.8, // Stronger glow
        side: THREE.BackSide,
      });

      dropGeometryRef.current = new THREE.SphereGeometry(0.3, 16, 16);
      dropMaterialRef.current = new THREE.MeshPhysicalMaterial({
        color: 0xADD8E6,
        transparent: true,
        opacity: 0.8,
        roughness: 0.1,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0.9,
        ior: 1.33,
      });

      trailMaterialRef.current = new THREE.PointsMaterial({
        color: 0x87CEFA,
        size: 0.3,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
      });

      // Initialize the spear pool
      if (spearPoolRef.current.length === 0) {
        for (let i = 0; i < SPEAR_POOL_SIZE; i++) {
          // Create spear group with spear and glow meshes
          const spearGroup = new THREE.Group();

          // Create spear mesh using shared geometry and material
          const spear = new THREE.Mesh(spearGeometryRef.current, spearMaterialRef.current);
          spear.castShadow = true;
          spearGroup.add(spear);

          // Create glow mesh using shared geometry and material
          const glow = new THREE.Mesh(glowGeometryRef.current, glowMaterialRef.current);
          spearGroup.add(glow);
          
          // Add a debug sphere to make the spear's position more obvious
          const debugSphere = new THREE.Mesh(
            new THREE.SphereGeometry(1.0, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0.8 })
          );
          spearGroup.add(debugSphere);

          // Create trail with unique geometry but shared material
          const trailGeometry = new THREE.BufferGeometry();
          const trailParticles = 30;
          const trailPositions = new Float32Array(trailParticles * 3);

          // Initialize positions to be far away (they'll be reset when used)
          for (let j = 0; j < trailParticles; j++) {
            const j3 = j * 3;
            trailPositions[j3] = 0;
            trailPositions[j3 + 1] = -1000; // Hidden position
            trailPositions[j3 + 2] = 0;
          }

          trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
          const trail = new THREE.Points(trailGeometry, trailMaterialRef.current);

          // Add to pool (not to scene yet - will be added when used)
          spearPoolRef.current.push({
            spearGroup,
            trail,
            trailGeometry,
            inUse: false,
            creationTime: Date.now() // Set initial creation time
          });
        }
      } else {
        // Ensure all spears are marked as not in use to prevent leaks after hot reloads
        spearPoolRef.current.forEach(spear => {
          spear.inUse = false;
          spear._updateId = undefined;
        });
      }

      const glowGeometry = new THREE.SphereGeometry(0.5, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00BFFF,
        transparent: true,
        opacity: 0.0,
      });

      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
      scene.add(glowMesh);
      bendingEffectRef.current = glowMesh;

      // Core sphere geometry and material with subtle glow
      const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);
      const sphereMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x00BFFF,
        transparent: true,
        opacity: 0.8, // Fixed, subtle transparency
        roughness: 0.1,
        metalness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0.8,
        ior: 1.33,
        emissive: 0x00BFFF, // Magical blue emissive
        emissiveIntensity: 0.3, // Base intensity, subtle
      });

      // Particle system for bending effect
      const particleCount = 100;
      const particleGeometry = new THREE.BufferGeometry();
      const particlePositions = new Float32Array(particleCount * 3);

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        particlePositions[i3] = 0;
        particlePositions[i3 + 1] = -1000;
        particlePositions[i3 + 2] = 0;
      }

      particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

      const particleMaterial = new THREE.PointsMaterial({
        color: 0x87CEFA,
        size: 0.2,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
      });

      const particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);
      bendingParticlesRef.current = particles;

      const updateCrosshairPosition = () => {
        if (!camera || !raycasterRef.current) return;

        raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);

        const newPosition = raycasterRef.current.ray.origin.clone()
          .add(raycasterRef.current.ray.direction.clone().multiplyScalar(15));

        crosshairPositionRef.current.copy(newPosition);
      };

      const getSpearFromPool = (): WaterSpear | null => {
        // First try to find any spears marked as inUse but with no active update
        const potentiallyLeakedSpears = spearPoolRef.current.filter(spear => 
          spear.inUse && 
          spear._updateId && 
          !activeSpearUpdatesRef.current.has(spear._updateId)
        );
        
        if (potentiallyLeakedSpears.length > 0) {
          // Return the first leaked spear to the pool
          returnSpearToPool(potentiallyLeakedSpears[0]);
        }
        
        // Then look for a spear not in use
        const availableSpear = spearPoolRef.current.find(spear => !spear.inUse);

        if (availableSpear) {
          availableSpear.inUse = true;
          availableSpear.creationTime = Date.now(); // Track when this spear was allocated
          return availableSpear;
        }
        
        // If no available spear, attempt force cleanup of any spears that might be stuck
        // This is a safety measure to prevent pool exhaustion
        const oldestActiveSpear = findOldestActiveSpear();
        if (oldestActiveSpear) {
          returnSpearToPool(oldestActiveSpear);
          
          // Now try to get a spear again
          const recycledSpear = spearPoolRef.current.find(spear => !spear.inUse);
          if (recycledSpear) {
            recycledSpear.inUse = true;
            recycledSpear.creationTime = Date.now();
            return recycledSpear;
          }
        }

        // If all else fails, force-cleanup all spears
        forceCleanupAllSpears();
        
        // Try one more time
        const emergencySpear = spearPoolRef.current.find(spear => !spear.inUse);
        if (emergencySpear) {
          emergencySpear.inUse = true;
          emergencySpear.creationTime = Date.now();
          return emergencySpear;
        }
        
        return null;
      };
      
      const findOldestActiveSpear = (): WaterSpear | null => {
        // Find spears that have creation time stored
        const activeSpears = spearPoolRef.current.filter(spear => spear.inUse);
        if (activeSpears.length === 0) return null;
        
        // Find oldest spear based on creation time
        return activeSpears.reduce((oldest, current) => {
          // If current has no creation time, it's considered older
          if (!current.creationTime) return current;
          
          // If oldest has no creation time, current is newer
          if (!oldest.creationTime) return current;
          
          // Compare creation times
          return current.creationTime < oldest.creationTime ? current : oldest;
        }, activeSpears[0]);
      };

      const returnSpearToPool = (spear: WaterSpear) => {
        // Verify the spear exists and is from this pool
        if (!spear || !spearPoolRef.current.includes(spear)) {
          return;
        }
        
        // If the spear is not marked as in use, it's already in the pool
        if (!spear.inUse) {
          return;
        }
        
        // Remove the physics body if it exists
        if (spear.body) {
          world.removeBody(spear.body);
          spear.body = undefined;
        }
        
        // Remove from scene - use try/catch to handle potential errors
        try {
          scene.remove(spear.spearGroup);
          scene.remove(spear.trail);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_e) {
          // Continue with cleanup even if scene removal fails
        }

        // Reset trail positions to hidden
        try {
          const positions = spear.trailGeometry.attributes.position.array as Float32Array;
          for (let i = 0; i < positions.length / 3; i++) {
            positions[i * 3 + 1] = -1000; // Hide trail points
          }
          spear.trailGeometry.attributes.position.needsUpdate = true;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_e) {
          // Continue with cleanup even if trail reset fails
        }

        // If this spear has an update ID, clean it up from the active updates set
        if (spear._updateId && activeSpearUpdatesRef.current.has(spear._updateId)) {
          activeSpearUpdatesRef.current.delete(spear._updateId);
        }

        // Mark as available for reuse and clear updateId
        spear.inUse = false;
        spear._updateId = undefined;
      };

      const createWaterSpear = () => {
        if (!characterPositionRef?.current) return;

        if (collectedDropsRef.current < REQUIRED_DROPS_TO_FIRE) {
          return;
        }

        // Creating water spear
        collectedDropsRef.current -= REQUIRED_DROPS_TO_FIRE;

        // Get a spear from the pool
        const pooledSpear = getSpearFromPool();
        if (!pooledSpear) {
          return; // No spears available
        }

        const { spearGroup } = pooledSpear;

        // Position and orient the spear
        spearGroup.position.copy(characterPositionRef.current);
        spearGroup.position.y += 1.5; // Head level

        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        direction.normalize();
        
        // Position the spear in front of the character
        spearGroup.position.add(direction.clone().multiplyScalar(2)); // Start 2 units in front
        
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        spearGroup.quaternion.copy(quaternion);

        // Create a physics body for the spear
        const spearShape = new CANNON.Sphere(0.5); // Simplified collision shape
        const spearBody = new CANNON.Body({
          mass: 1, // Light but has mass
          shape: spearShape,
          position: new CANNON.Vec3(
            spearGroup.position.x,
            spearGroup.position.y,
            spearGroup.position.z
          ),
          material: new CANNON.Material("waterMaterial")
        });
        
        // Set velocity based on direction
        const speed = 15; // Speed of the spear
        spearBody.velocity.set(
          direction.x * speed,
          direction.y * speed,
          direction.z * speed
        );
        
        // Apply quaternion to body
        const threeQuat = quaternion;
        spearBody.quaternion.set(threeQuat.x, threeQuat.y, threeQuat.z, threeQuat.w);
        
        // Store the body in the pooled spear
        pooledSpear.body = spearBody;
        
        // Add the body to the physics world
        world.addBody(spearBody);

        // Add to scene
        scene.add(spearGroup);
        scene.add(pooledSpear.trail);

        // Reset trail to spear position
        const trailParticles = 30; // Same value used when creating the pool
        const positions = pooledSpear.trailGeometry.attributes.position.array as Float32Array;
        for (let i = 0; i < trailParticles; i++) {
          positions[i * 3] = spearGroup.position.x;
          positions[i * 3 + 1] = spearGroup.position.y;
          positions[i * 3 + 2] = spearGroup.position.z;
        }
        pooledSpear.trailGeometry.attributes.position.needsUpdate = true;

        const createWaterDrops = (position: THREE.Vector3) => {
          for (let i = 0; i < 10; i++) {
            // Use shared geometry and material for water drops
            const drop = new THREE.Mesh(
              dropGeometryRef.current || new THREE.SphereGeometry(0.3, 16, 16),
              dropMaterialRef.current || new THREE.MeshPhysicalMaterial({
                color: 0xADD8E6,
                transparent: true,
                opacity: 0.8,
                roughness: 0.1,
                metalness: 0.1,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1,
                transmission: 0.9,
                ior: 1.33,
              })
            );
            
            // Properly name and tag the water drop for detection
            drop.name = `water_drop_free_${Date.now()}_${i}`;
            drop.userData.isWater = true; // Explicitly mark as water
            
            // Create physics body for the water drop
            const dropShape = new CANNON.Sphere(0.3);
            const dropBody = new CANNON.Body({
              mass: 0.1, // Light mass
              shape: dropShape,
              position: new CANNON.Vec3(
                position.x + (Math.random() - 0.5) * 2,
                position.y + Math.random() * 2,
                position.z + (Math.random() - 0.5) * 2
              ),
              material: new CANNON.Material("waterDropMaterial")
            });
            
            // Set initial velocity
            dropBody.velocity.set(
              (Math.random() - 0.5) * 4,
              Math.random() * 4,
              (Math.random() - 0.5) * 4
            );
            
            // Add to physics world
            world.addBody(dropBody);
            
            // Position the mesh
            drop.position.copy(dropBody.position as unknown as THREE.Vector3);
            drop.scale.setScalar(0.5 + Math.random() * 0.5);
            drop.castShadow = true;
            drop.receiveShadow = true;
            scene.add(drop);

            // Add to free drops with physics body
            freeDropsRef.current.push({ mesh: drop, body: dropBody });
          }
        };

        const maxLifetime = 10000; // Doubled lifetime (was 5000)
        const creationTime = Date.now();

        const updateSpear: IdentifiableFunction = (
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          delta: number
        ) => {
          // Skip if body was removed
          if (!pooledSpear.body) {
            removeSpearUpdate();
            return;
          }
          
          // Update mesh position from physics body
          spearGroup.position.copy(pooledSpear.body.position as unknown as THREE.Vector3);
          spearGroup.quaternion.copy(pooledSpear.body.quaternion as unknown as THREE.Quaternion);

          if (Date.now() - creationTime > maxLifetime) {
            // Lifetime expired, return to pool
            if (pooledSpear.body) {
              world.removeBody(pooledSpear.body);
            }
            returnSpearToPool(pooledSpear);
            removeSpearUpdate();
            return;
          }

          // Check if spear is too far from character (out of bounds)
          if (characterPositionRef?.current) {
            const distanceFromCharacter = spearGroup.position.distanceTo(characterPositionRef.current);
            if (distanceFromCharacter > 100) {
              if (pooledSpear.body) {
                world.removeBody(pooledSpear.body);
              }
              returnSpearToPool(pooledSpear);
              removeSpearUpdate();
              return;
            }
          }

          // Update the trail
          const positions = pooledSpear.trailGeometry.attributes.position.array as Float32Array;

          for (let i = trailParticles - 1; i > 0; i--) {
            const i3 = i * 3;
            const prev3 = (i - 1) * 3;
            positions[i3] = positions[prev3];
            positions[i3 + 1] = positions[prev3 + 1];
            positions[i3 + 2] = positions[prev3 + 2];
          }

          positions[0] = spearGroup.position.x;
          positions[1] = spearGroup.position.y;
          positions[2] = spearGroup.position.z;

          pooledSpear.trailGeometry.attributes.position.needsUpdate = true;
        };

        // Set up collision detection for the spear
        spearBody.addEventListener('collide', (event: { type: string; body: CANNON.Body; contact: CANNON.ContactEquation; }) => {
          if (!pooledSpear.body) return; // Already handled
            
          // Get the collision point
          const contactPoint = new THREE.Vector3(
            event.contact.ri.x + pooledSpear.body.position.x,
            event.contact.ri.y + pooledSpear.body.position.y,
            event.contact.ri.z + pooledSpear.body.position.z
          );
            
          // Create water drops at the collision point
          createWaterDrops(contactPoint);
            
          // Remove the spear body and return to pool
          world.removeBody(pooledSpear.body);
          pooledSpear.body = undefined; // Clear the reference
          returnSpearToPool(pooledSpear);
          removeSpearUpdate();
        });

        const updateId = `waterSpear_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        updateSpear._id = updateId;
        pooledSpear._updateId = updateId; // Store the update ID in the spear object
        activeSpearUpdatesRef.current.add(updateId);
        
        // Store the remove function from registerUpdate
        const removeFunc = registerUpdate(updateSpear);
        const updateIdCopy = updateId; // Make a copy to avoid race conditions
        const removeSpearUpdate = () => {
          activeSpearUpdatesRef.current.delete(updateIdCopy);
          removeFunc();
          
          // Double-check the spear is actually returned to the pool
          if (pooledSpear.inUse) {
            returnSpearToPool(pooledSpear);
          }
        };
      };

      const onMouseDown = (event: MouseEvent) => {
        if (event.button === 0) {
          isBendingRef.current = true;
          updateCrosshairPosition();
        }
      };

      const onMouseUp = (event: MouseEvent) => {
        if (event.button === 0) {
          isBendingRef.current = false;
        }
      };

      const onRightClick = (event: MouseEvent) => {
        if (event.button === 2) {
          event.preventDefault();
          if (collectedDropsRef.current >= REQUIRED_DROPS_TO_FIRE) {
            createWaterSpear();
          }
        };
      };

      const getActiveSpearCount = (): number => {
        return spearPoolRef.current.filter(spear => spear.inUse).length;
      };

      const updateCrosshairOnTick: IdentifiableFunction = (delta: number) => {
        // Use delta in calculation to avoid unused parameter warning
        const effectiveDelta = Math.min(delta, 0.1); // Cap delta for stability
        if (effectiveDelta > 0) { 
          // Only update on non-zero deltas (ensures delta is used)
          updateCrosshairPosition();
          
          // Check if we have inconsistency between tracking sets
          const activeSpears = getActiveSpearCount();
          const activeUpdates = activeSpearUpdatesRef.current.size;
          
          // If we have more active spears than updates, force cleanup on each frame
          if (activeSpears > activeUpdates) {
            forceCleanupAllSpears();
          }
          
          // Periodically clean up stale spears (every ~3 seconds)
          const now = Date.now();
          // Use effectiveDelta to adjust the frequency for higher framerates
          if (now % Math.max(1000, 3000 * effectiveDelta) < 16) {
            cleanupStaleSpears();
          }
        }
      };
      
      const forceCleanupAllSpears = () => {
        // Get all active spears
        const activeSpears = spearPoolRef.current.filter(spear => spear.inUse);
        
        // Force return them all to the pool
        activeSpears.forEach(spear => {
          returnSpearToPool(spear);
        });
        
        // Double-check that the cleanup worked
        const stillActiveCount = spearPoolRef.current.filter(s => s.inUse).length;
        if (stillActiveCount > 0) {
          // Force reset the inUse flag on all spears as a last resort
          spearPoolRef.current.forEach(spear => {
            if (spear.inUse) {
              try {
                // Attempt to remove from scene if needed
                scene.remove(spear.spearGroup);
                scene.remove(spear.trail);
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              } catch (_e) {
                // Removed console.error
              }
              spear.inUse = false;
              spear._updateId = undefined;
            }
          });
        }
        
        // Clear any orphaned update IDs from the set
        const activeSpearIds = new Set(spearPoolRef.current.filter(s => s.inUse).map(s => s._updateId).filter(Boolean));
        const orphanedUpdateIds = Array.from(activeSpearUpdatesRef.current).filter(id => !activeSpearIds.has(id));
        
        if (orphanedUpdateIds.length > 0) {
          orphanedUpdateIds.forEach(id => activeSpearUpdatesRef.current.delete(id));
        }
      };
      
      const cleanupStaleSpears = () => {
        const now = Date.now();
        let cleanedCount = 0;
        
        spearPoolRef.current.forEach(spear => {
          // If spear is in use and has a creation time that's older than MAX_SPEAR_LIFETIME_MS
          if (spear.inUse && spear.creationTime && (now - spear.creationTime) > MAX_SPEAR_LIFETIME_MS) {
            returnSpearToPool(spear);
            cleanedCount++;
          }
        });
        
        // Log the cleanup result if debugging is enabled
        if (DEBUG_WATER_SOURCES && cleanedCount > 0) {
          // Removed console.log
        }
      };

      updateCrosshairOnTick._id = 'updateCrosshair';
      const removeUpdateCrosshair = registerUpdate(updateCrosshairOnTick);

      window.addEventListener('mousedown', onMouseDown, { capture: true });
      window.addEventListener('mouseup', onMouseUp, { capture: true });
      window.addEventListener('mousedown', onRightClick, { capture: true });

      const hammer = new Hammer(domElement);
      const pan = new Hammer.Pan({ threshold: 0, pointers: 1 });
      hammer.add(pan);

      hammer.on('panstart', () => {
        isBendingRef.current = true;
        updateCrosshairPosition();
      });

      hammer.on('panend', () => {
        isBendingRef.current = false;
      });

      hammer.on('tap', () => {
        if (collectedDropsRef.current >= REQUIRED_DROPS_TO_FIRE) {
          createWaterSpear();
        }
      });

      const updateBendingEffects: IdentifiableFunction = (delta: number) => {
        if (isBendingRef.current && crosshairPositionRef.current) {
          if (bendingEffectRef.current) {
            bendingEffectRef.current.position.copy(crosshairPositionRef.current);
            (bendingEffectRef.current.material as THREE.MeshBasicMaterial).opacity = 0.4;
            bendingEffectRef.current.scale.set(
              1 + Math.sin(Date.now() * 0.005) * 0.3,
              1 + Math.sin(Date.now() * 0.005) * 0.3,
              1 + Math.sin(Date.now() * 0.005) * 0.3
            );
          }

          if (bendingParticlesRef.current) {
            const positions = bendingParticlesRef.current.geometry.attributes.position.array as Float32Array;

            // Check if character is close enough to the crosshair position
            const distanceFromCharacter = characterPositionRef?.current ? 
              crosshairPositionRef.current.distanceTo(characterPositionRef.current) : Infinity;
            const characterInRange = distanceFromCharacter < 15; // Only allow collection within 15 units of character

            let nearWaterSource = false;
            const waterSourceSearchRadius = 10; // Units to search for water around the crosshair
            
            // Look for water sources in the scene - detect meshes with water-related names
            // or water materials (blue/transparent objects)
            scene.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                // Check if object name indicates it's water
                const isWaterByName = object.name.toLowerCase().includes('water') || 
                                      object.name.toLowerCase().includes('lake') || 
                                      object.name.toLowerCase().includes('river') ||
                                      object.name.toLowerCase().includes('pond');
                
                // Check if object is explicitly marked as water via userData
                const isWaterByUserData = object.userData && object.userData.isWater === true;
                
                // Check if material indicates it's water (blue and possibly transparent)
                let isWaterByMaterial = false;
                if (object.material instanceof THREE.MeshPhysicalMaterial || 
                    object.material instanceof THREE.MeshStandardMaterial) {
                  const material = object.material;
                  // Check for blue-ish color
                  if (material.color && 
                      material.color.b > 0.6 && // Increased from 0.5 to 0.6 for more accurate detection
                      material.color.b > material.color.r * 1.5 && // Must be significantly more blue than red
                      material.color.b > material.color.g * 1.5) { // Must be significantly more blue than green
                    isWaterByMaterial = true;
                  }
                }
                
                // If it appears to be water and is near the crosshair
                if ((isWaterByName || isWaterByMaterial || isWaterByUserData) && 
                    object.position.distanceTo(crosshairPositionRef.current) < waterSourceSearchRadius) {
                  nearWaterSource = true;
                  if (DEBUG_WATER_SOURCES) {
                    // Removed console.log
                  }
                }
              }
            });
            
            // Update particle positions - only spawn regular water particles when near water
            if (nearWaterSource && characterInRange) {
              for (let i = 0; i < 100; i++) {
                const i3 = i * 3;
                
                if (positions[i3 + 1] < -100 && Math.random() < 0.1) {
                  // Spawn new particles only when near water
                  const radius = 3 * Math.random();
                  const theta = Math.random() * Math.PI * 2;
                  const phi = Math.random() * Math.PI;

                  // Start particles from character position for better visual effect
                  const startPos = characterPositionRef?.current ? 
                    characterPositionRef.current.clone() : 
                    crosshairPositionRef.current.clone();
                  startPos.y += 1.5; // Start at character's head level

                  // End position at the crosshair
                  const targetPos = crosshairPositionRef.current;

                  // Interpolate between start and target based on random progress
                  const progress = Math.random();
                  const pos = startPos.clone().lerp(targetPos, progress);

                  // Add some spiral motion
                  pos.x += Math.sin(theta) * radius * (1 - progress);
                  pos.y += Math.cos(phi) * radius * (1 - progress) * 0.5;
                  pos.z += Math.cos(theta) * radius * (1 - progress);

                  positions[i3] = pos.x;
                  positions[i3 + 1] = pos.y;
                  positions[i3 + 2] = pos.z;
                } else if (positions[i3 + 1] > -100) {
                  // Move existing particles toward the crosshair
                  const dirX = crosshairPositionRef.current.x - positions[i3];
                  const dirY = crosshairPositionRef.current.y - positions[i3 + 1];
                  const dirZ = crosshairPositionRef.current.z - positions[i3 + 2];
                  const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
                  
                  if (length < 0.5) {
                    // Collect water when particles reach the crosshair
                    positions[i3 + 1] = -1000; // Hide the particle
                    if (collectedDropsRef.current < MAX_WATER_DROPS) {
                      collectedDropsRef.current += 1;
                      if (DEBUG_WATER_SOURCES) {
                        // Removed console.log
                      }
                      if (bendingEffectRef.current) {
                        const material = bendingEffectRef.current.material as THREE.MeshBasicMaterial;
                        material.opacity = 0.8; // Brief bright flash
                        setTimeout(() => {
                          if (material) material.opacity = 0.4;
                        }, 100);
                      }
                    } else if (DEBUG_WATER_SOURCES) {
                      // Removed console.log
                    }
                  } else {
                    // Move particle toward crosshair
                    positions[i3] += dirX / length * 5 * delta;
                    positions[i3 + 1] += dirY / length * 5 * delta;
                    positions[i3 + 2] += dirZ / length * 5 * delta;
                  }
                }
              }
            } else {
              // When not near water sources, hide all particles
              for (let i = 0; i < 100; i++) {
                positions[i * 3 + 1] = -1000;
              }
            }

            bendingParticlesRef.current.geometry.attributes.position.needsUpdate = true;
          }
        } else {
          if (bendingEffectRef.current) {
            (bendingEffectRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
          }

          if (bendingParticlesRef.current) {
            const positions = bendingParticlesRef.current.geometry.attributes.position.array as Float32Array;

            for (let i = 0; i < 100; i++) {
              positions[i * 3 + 1] = -1000;
            }

            bendingParticlesRef.current.geometry.attributes.position.needsUpdate = true;
          }
        }

        // Update water belt with subtle glowing spheres
        if (characterPositionRef?.current) {
          const currentDrops = collectedDropsRef.current;
          const currentSpheres = waterBeltSpheresRef.current.length;
          const waterRatio = Math.min(1, currentDrops / MAX_WATER_DROPS);
          const visibleSpheres = Math.min(currentDrops, MAX_VISIBLE_SPHERES);

          // Adjust sphere count
          if (currentDrops > 0) {
            if (currentSpheres < visibleSpheres) {
              for (let i = currentSpheres; i < visibleSpheres; i++) {
                const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial.clone());
                sphere.castShadow = true;
                scene.add(sphere);
                waterBeltSpheresRef.current.push(sphere);
              }
            } else if (currentSpheres > visibleSpheres) {
              while (waterBeltSpheresRef.current.length > visibleSpheres) {
                const sphere = waterBeltSpheresRef.current.pop();
                if (sphere) {
                  scene.remove(sphere);
                  (sphere.material as THREE.Material).dispose();
                }
              }
            }

            // Update belt appearance
            const baseRadius = 1.5 + waterRatio * 0.5;
            const time = Date.now() * 0.001;

            waterBeltSpheresRef.current.forEach((sphere, i) => {
              const totalSpheres = waterBeltSpheresRef.current.length;
              const angle = (i / totalSpheres) * Math.PI * 2;
              // Position spheres
              if (characterPositionRef.current) {
                // Copy the character's position and ensure we're tracking it properly
                const characterPos = characterPositionRef.current.clone();

                sphere.position.copy(characterPos);
                sphere.position.x += Math.cos(angle + time * 0.5) * baseRadius;
                sphere.position.y += 1.2 + Math.sin(time + angle * 5) * 0.2; // Slightly above character's feet
                sphere.position.z += Math.sin(angle + time * 0.5) * baseRadius;
              }

              // Subtle magical blue light animation
              const material = sphere.material as THREE.MeshPhysicalMaterial;
              const pulse = Math.sin(time * 1.5 + i * 0.3) * 0.2 + 0.8; // 0.6 to 1 range
              material.emissiveIntensity = 0.4 + pulse * (0.2 + waterRatio * 0.3); // Subtle glow, max 0.8
            });
          } else {
            while (waterBeltSpheresRef.current.length > 0) {
              const sphere = waterBeltSpheresRef.current.pop();
              if (sphere) {
                scene.remove(sphere);
                (sphere.material as THREE.Material).dispose();
              }
            }
          }
        }

        // Handle free water drops with physics
        const dropsToRemove: { mesh: THREE.Mesh; body: CANNON.Body }[] = [];

        for (const drop of freeDropsRef.current) {
          // Update mesh position from physics body
          drop.mesh.position.copy(drop.body.position as unknown as THREE.Vector3);
          
          // Always process free water drops when bending is active
          if (isBendingRef.current && crosshairPositionRef.current) {
            // Greatly increase the collection range for free water drops
            const characterInRange = characterPositionRef?.current 
              ? drop.mesh.position.distanceTo(characterPositionRef.current) < 30 
              : true; // If no character position, don't restrict by distance
            
            if (characterInRange) {
              // Pull the drop towards the crosshair with increased strength
              const direction = new CANNON.Vec3(
                crosshairPositionRef.current.x - drop.body.position.x,
                crosshairPositionRef.current.y - drop.body.position.y,
                crosshairPositionRef.current.z - drop.body.position.z
              );
              const distanceSq = 
                Math.pow(crosshairPositionRef.current.x - drop.body.position.x, 2) +
                Math.pow(crosshairPositionRef.current.y - drop.body.position.y, 2) +
                Math.pow(crosshairPositionRef.current.z - drop.body.position.z, 2);
              const distance = Math.sqrt(distanceSq);
              
              // Increase pull range and strengthen the pull effect
              if (distance < 30) {
                direction.normalize();
                const pullStrength = 25 * (1 - distance / 30);
                // Use normalized direction for the force
                const forceVec = new CANNON.Vec3(
                  direction.x * pullStrength * delta * drop.body.mass,
                  direction.y * pullStrength * delta * drop.body.mass,
                  direction.z * pullStrength * delta * drop.body.mass
                );
                drop.body.applyForce(forceVec, drop.body.position);
              }
              
              // Make collection easier by increasing the collection radius
              if (distance < 1.2) {
                if (collectedDropsRef.current < MAX_WATER_DROPS) {
                  collectedDropsRef.current += 1;
                  if (DEBUG_WATER_SOURCES) {
                    // Removed console.log
                  }
                  if (bendingEffectRef.current) {
                    const material = bendingEffectRef.current.material as THREE.MeshBasicMaterial;
                    material.opacity = 0.8; // Brief bright flash
                    setTimeout(() => {
                      if (material) material.opacity = 0.4;
                    }, 100);
                  }
                  scene.remove(drop.mesh);
                  world.removeBody(drop.body);
                  dropsToRemove.push(drop);
                } else {
                  // When water meter is full, just remove the drop without collecting
                  if (DEBUG_WATER_SOURCES) {
                    // Removed console.log
                  }
                  scene.remove(drop.mesh);
                  world.removeBody(drop.body);
                  dropsToRemove.push(drop);
                }
              }
            }
          }
        }

        if (dropsToRemove.length > 0) {
          freeDropsRef.current = freeDropsRef.current.filter(d => !dropsToRemove.includes(d));
        }
      };
      updateBendingEffects._id = 'bendingVisualEffects';
      const removeEffectsUpdate = registerUpdate(updateBendingEffects);

      return () => {
        if (bendingEffectRef.current) scene.remove(bendingEffectRef.current);
        if (bendingParticlesRef.current) scene.remove(bendingParticlesRef.current);

        // Cleanup water belt spheres
        waterBeltSpheresRef.current.forEach(sphere => {
          scene.remove(sphere);
          (sphere.material as THREE.Material).dispose();
        });
        waterBeltSpheresRef.current = [];
        sphereGeometry.dispose();
        sphereMaterial.dispose();

        // Clean up any physics bodies
        freeDropsRef.current.forEach(drop => {
          scene.remove(drop.mesh);
          world.removeBody(drop.body);
        });
        freeDropsRef.current = [];

        // Cleanup spear pool and physics bodies
        spearPoolRef.current.forEach(spear => {
          if (spear.inUse) {
            scene.remove(spear.spearGroup);
            scene.remove(spear.trail);
            if (spear.body) {
              world.removeBody(spear.body);
            }
            spear.inUse = false; // Mark as not in use to prevent memory leaks
          }
          // Dispose of the unique geometry (trail geometry)
          spear.trailGeometry.dispose();
        });
        
        // Dispose shared water projectile resources
        spearGeometryRef.current?.dispose();
        spearMaterialRef.current?.dispose();
        glowGeometryRef.current?.dispose();
        glowMaterialRef.current?.dispose();
        dropGeometryRef.current?.dispose();
        dropMaterialRef.current?.dispose();
        trailMaterialRef.current?.dispose();

        hammer.destroy();
        removeEffectsUpdate();
        removeUpdateCrosshair();
        window.removeEventListener('mousedown', onRightClick, { capture: true });
        window.removeEventListener('mousedown', onMouseDown, { capture: true });
        window.removeEventListener('mouseup', onMouseUp, { capture: true });
      };
    };

    const cleanup = setupWaterBending();

    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [scene, domElement, registerUpdate, camera, isBendingRef, crosshairPositionRef, characterPositionRef, world]);

  return (
    <WaterMeter
      currentWater={displayedDrops}
      maxWater={MAX_WATER_DROPS}
      requiredWater={REQUIRED_DROPS_TO_FIRE}
    />
  );
}