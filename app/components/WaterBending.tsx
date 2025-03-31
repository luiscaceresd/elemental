'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon';
import Hammer from 'hammerjs';
import WaterMeter from './WaterMeter';

// Extend the type definitions for CANNON.World to include missing methods
declare module 'cannon' {
  interface World {
    addBody(body: CANNON.Body): void;
    removeBody(body: CANNON.Body): void;
  }
}

// Remove the manual type declaration
type IdentifiableFunction = ((delta: number) => void) & { _id?: string };

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

// Define a WaterDrop type for our pool
interface WaterDrop {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  inUse: boolean;
}

// Define a WaterSpear type for our pool – note the added initialVelocity property
// Update your WaterSpear interface to include hasExploded
interface WaterSpear {
  spearGroup: THREE.Group;
  trail: THREE.Points;
  trailGeometry: THREE.BufferGeometry;
  body?: CANNON.Body;
  inUse: boolean;
  creationTime?: number; // When the spear was created/last used
  hasExploded?: boolean; // NEW: tracks if the spear has exploded
  initialVelocity?: THREE.Vector3; // For bullet-like travel
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
  const _mousePositionRef = useRef<THREE.Vector2>(new THREE.Vector2()); // Renamed with underscore to indicate intentionally unused
  const bendingEffectRef = useRef<THREE.Mesh | null>(null);
  const bendingParticlesRef = useRef<THREE.Points | null>(null);
  const collectedDropsRef = useRef<number>(0);
  const waterBeltSpheresRef = useRef<THREE.Mesh[]>([]);
  const waterDropPoolRef = useRef<WaterDrop[]>([]);
  const [displayedDrops, setDisplayedDrops] = useState<number>(0);
  const MAX_WATER_DROPS = 450;
  const REQUIRED_DROPS_TO_FIRE = 45;
  const MAX_VISIBLE_SPHERES = 10;
  const WATER_DROP_POOL_SIZE = 300;

  // Shared resource refs for projectile resources
  const spearGeometryRef = useRef<THREE.CylinderGeometry | null>(null);
  const spearMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const glowGeometryRef = useRef<THREE.CylinderGeometry | null>(null);
  const glowMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const dropGeometryRef = useRef<THREE.SphereGeometry | null>(null);
  const dropMaterialRef = useRef<THREE.MeshPhysicalMaterial | null>(null);
  const trailMaterialRef = useRef<THREE.PointsMaterial | null>(null);

  // Spear pool for reuse
  const spearPoolRef = useRef<WaterSpear[]>([]);
  const SPEAR_POOL_SIZE = 50;
  const activeSpearUpdatesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const updateDisplayCount = () => {
      setDisplayedDrops(collectedDropsRef.current);
      requestAnimationFrame(updateDisplayCount);
    };
    const animationId = requestAnimationFrame(updateDisplayCount);
    return () => cancelAnimationFrame(animationId);
  }, []);

  const returnSpearToPool = useCallback((spear: WaterSpear) => {
    if (!spear || !spearPoolRef.current.includes(spear)) {
      return;
    }
    if (!spear.inUse) {
      return;
    }
    // Remove the physics body if it exists
    if (spear.body) {
      const body = spear.body;
      setTimeout(() => {
        if (body) world.removeBody(body);
      }, 50);
      spear.body = undefined;
    }
    // Remove from scene
    try {
      scene.remove(spear.spearGroup);
      scene.remove(spear.trail);
    } catch (_e) {
      // Continue with cleanup even if removal fails
    }
    // Reset the trail positions to hide them
    try {
      const positions = spear.trailGeometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length / 3; i++) {
        positions[i * 3 + 1] = -1000; // Hide trail points
      }
      spear.trailGeometry.attributes.position.needsUpdate = true;
    } catch (_e) {
      // Continue with cleanup even if removal fails
    }
    // Clean up any active update ID
    if (spear._updateId && activeSpearUpdatesRef.current.has(spear._updateId)) {
      activeSpearUpdatesRef.current.delete(spear._updateId);
    }
    // Mark the spear as available and reset explosion flag
    spear.inUse = false;
    spear._updateId = undefined;
    spear.hasExploded = false;
  }, [scene, world]);

  useEffect(() => {
    const setupWaterBending = () => {
      raycasterRef.current = new THREE.Raycaster();

      // Initialize shared resources for the projectile
      spearGeometryRef.current = new THREE.CylinderGeometry(0.4, 0.2, 4.0, 16);
      spearMaterialRef.current = new THREE.MeshPhysicalMaterial({
        color: 0x00FFFF,
        transparent: false,
        opacity: 1.0,
        roughness: 0,
        metalness: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0,
        ior: 1.33,
        emissive: 0x00FFFF,
        emissiveIntensity: 5.0
      });
      glowGeometryRef.current = new THREE.CylinderGeometry(0.6, 0.3, 4.5, 16);
      glowMaterialRef.current = new THREE.MeshBasicMaterial({
        color: 0xFFFFFF,
        transparent: true,
        opacity: 0.8,
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

      // Initialize spear pool
      if (spearPoolRef.current.length === 0) {
        for (let i = 0; i < SPEAR_POOL_SIZE; i++) {
          const spearGroup = new THREE.Group();
          const spear = new THREE.Mesh(spearGeometryRef.current, spearMaterialRef.current);
          spear.castShadow = true;
          spearGroup.add(spear);
          const glow = new THREE.Mesh(glowGeometryRef.current, glowMaterialRef.current);
          spearGroup.add(glow);
          const debugSphere = new THREE.Mesh(
            new THREE.SphereGeometry(1.0, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xFF0000, transparent: true, opacity: 0.8 })
          );
          spearGroup.add(debugSphere);
          const trailGeometry = new THREE.BufferGeometry();
          const trailParticles = 30;
          const trailPositions = new Float32Array(trailParticles * 3);
          for (let j = 0; j < trailParticles; j++) {
            const j3 = j * 3;
            trailPositions[j3] = 0;
            trailPositions[j3 + 1] = -1000;
            trailPositions[j3 + 2] = 0;
          }
          trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
          const trail = new THREE.Points(trailGeometry, trailMaterialRef.current);
          spearPoolRef.current.push({
            spearGroup,
            trail,
            trailGeometry,
            inUse: false,
            creationTime: Date.now()
          });
        }
      } else {
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

      // Core sphere geometry/material for water belt
      const sphereGeometry = new THREE.SphereGeometry(0.15, 16, 16);
      const sphereMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x00BFFF,
        transparent: true,
        opacity: 0.8,
        roughness: 0.1,
        metalness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0.8,
        ior: 1.33,
        emissive: 0x00BFFF,
        emissiveIntensity: 0.3,
      });

      // Particle system for bending effect (unchanged)
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

      // Update crosshair position from camera
      const updateCrosshairPosition = () => {
        if (!camera || !raycasterRef.current) return;
        raycasterRef.current.setFromCamera(new THREE.Vector2(0, 0), camera);
        const newPosition = raycasterRef.current.ray.origin
          .clone()
          .add(raycasterRef.current.ray.direction.clone().multiplyScalar(15));
        crosshairPositionRef.current.copy(newPosition);
      };

      // Initialize water drop pool if not already done
      if (waterDropPoolRef.current.length === 0) {
        for (let i = 0; i < WATER_DROP_POOL_SIZE; i++) {
          const dropMesh = new THREE.Mesh(dropGeometryRef.current!, dropMaterialRef.current!);
          dropMesh.visible = false;
          dropMesh.castShadow = true;
          dropMesh.receiveShadow = true;
          dropMesh.name = `water_drop_pooled_${i}`;
          dropMesh.userData.isWater = true;
          scene.add(dropMesh);
          const dropBody = new CANNON.Body({
            mass: 0.1,
            shape: new CANNON.Sphere(0.3),
            material: new CANNON.Material("waterDropMaterial")
          });
          dropBody.position.set(0, -1000, 0);
          dropBody.sleep();
          world.addBody(dropBody);
          waterDropPoolRef.current.push({
            mesh: dropMesh,
            body: dropBody,
            inUse: false
          });
        }
      }

      // Improved createWaterDrops: use the preallocated pool and adjust drop parameters
      const createWaterDrops = (position: THREE.Vector3) => {
        const dropsToActivate = 10;
        let activated = 0;
        for (const drop of waterDropPoolRef.current) {
          if (!drop.inUse && activated < dropsToActivate) {
            drop.inUse = true;
            drop.mesh.visible = true;
            // Apply a random offset around the explosion position with reduced spread
            const offset = new THREE.Vector3(
              (Math.random() - 0.5) * 2,
              Math.random() * 1.5, // reduced upward bias
              (Math.random() - 0.5) * 2
            );
            const dropPos = position.clone().add(offset);
            drop.mesh.position.copy(dropPos);
            drop.body.position.set(dropPos.x, dropPos.y, dropPos.z);
            drop.body.wakeUp();
            // Apply gentler initial velocities
            drop.body.velocity.set(
              (Math.random() - 0.5) * 4,
              Math.random() * 4 - 1, // reduced downward bias
              (Math.random() - 0.5) * 4
            );
            activated++;
          }
        }
      };

      // The updateWaterDrops function (unchanged water collection logic)
      const updateWaterDrops: IdentifiableFunction = (_delta: number) => { // Renamed to _delta
        waterDropPoolRef.current.forEach(drop => {
          if (drop.inUse) {
            drop.mesh.position.copy(drop.body.position as unknown as THREE.Vector3);
            // Recycle drop if it's too slow or below threshold
            const velocityMagnitude = Math.sqrt(
              drop.body.velocity.x * drop.body.velocity.x +
              drop.body.velocity.y * drop.body.velocity.y +
              drop.body.velocity.z * drop.body.velocity.z
            );
            if (drop.body.position.y < -10 || velocityMagnitude < 0.1) {
              drop.inUse = false;
              drop.mesh.visible = false;
              drop.body.position.set(0, -1000, 0);
              drop.body.velocity.set(0, 0, 0);
              drop.body.sleep();
            }
          }
        });
      };
      updateWaterDrops._id = 'waterDropsUpdate';
      const removeWaterDropsUpdate = registerUpdate(updateWaterDrops);

      // Create a water spear (projectile)
      const createWaterSpear = () => {
        if (!characterPositionRef?.current) return;
        if (collectedDropsRef.current < REQUIRED_DROPS_TO_FIRE) return;
        collectedDropsRef.current -= REQUIRED_DROPS_TO_FIRE;

        // Helper: explosion effect – always trigger explosion on collision/lifetime
        const createExplosionEffect = (position: THREE.Vector3) => {
          for (let i = 0; i < 5; i++) {
            const offset = new THREE.Vector3(
              (Math.random() - 0.5) * 4,
              Math.random() * 3,
              (Math.random() - 0.5) * 4
            );
            createWaterDrops(position.clone().add(offset));
          }
        };

        // Create a temporary particle system for immediate visual feedback of explosions
        const triggerExplosion = (position: THREE.Vector3) => {
          const particleCount = 50;
          const positions = new Float32Array(particleCount * 3);
          const velocities = new Float32Array(particleCount * 3);
          
          for (let i = 0; i < particleCount; i++) {
            const index = i * 3;
            // Start all particles from the center
            positions[index] = position.x;
            positions[index + 1] = position.y;
            positions[index + 2] = position.z;
            
            // Random velocity for each particle
            const speed = 5 + Math.random() * 5;
            const angle = Math.random() * Math.PI * 2;
            const elevation = Math.random() * Math.PI;
            velocities[index] = Math.sin(elevation) * Math.cos(angle) * speed;
            velocities[index + 1] = Math.cos(elevation) * speed;
            velocities[index + 2] = Math.sin(elevation) * Math.sin(angle) * speed;
          }
          
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          
          const material = new THREE.PointsMaterial({
            color: 0x00FFFF,
            size: 0.5,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
          });
          
          const explosionParticles = new THREE.Points(geometry, material);
          scene.add(explosionParticles);

          // Animate the explosion particles
          let elapsed = 0;
          const duration = 500; // milliseconds
          const updateExplosion = () => {
            elapsed += 16.67; // Approximate for 60fps
            const progress = elapsed / duration;
            
            if (progress >= 1) {
              scene.remove(explosionParticles);
              geometry.dispose();
              material.dispose();
              return;
            }
            
            // Update particle positions based on their velocities
            const positions = geometry.attributes.position.array as Float32Array;
            for (let i = 0; i < particleCount; i++) {
              const index = i * 3;
              positions[index] += velocities[index] * 0.0167; // deltaTime
              positions[index + 1] += velocities[index + 1] * 0.0167;
              positions[index + 2] += velocities[index + 2] * 0.0167;
              
              // Fade out particles
              material.opacity = 0.8 * (1 - progress);
            }
            geometry.attributes.position.needsUpdate = true;
            
            requestAnimationFrame(updateExplosion);
          };
          
          requestAnimationFrame(updateExplosion);
        };

        const pooledSpear = (() => {
          // Try to get an available spear
          const available = spearPoolRef.current.find(spear => !spear.inUse);
          if (available) {
            available.inUse = true;
            available.creationTime = Date.now();
            return available;
          }
          return null;
        })();
        if (!pooledSpear) return;

        const { spearGroup } = pooledSpear;
        spearGroup.position.copy(characterPositionRef.current);
        spearGroup.position.y += 1.5;
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        direction.normalize();
        spearGroup.position.add(direction.clone().multiplyScalar(2));
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        spearGroup.quaternion.copy(quaternion);

        // Create physics body for the spear with bullet-like behavior
        const spearShape = new CANNON.Cylinder(0.4, 0.2, 4.0, 16);
        const spearBody = new CANNON.Body({
          mass: 0.1,
          shape: spearShape,
          position: new CANNON.Vec3(
            spearGroup.position.x,
            spearGroup.position.y,
            spearGroup.position.z
          ),
          material: new CANNON.Material("waterMaterial"),
          angularDamping: 1.0,
          linearDamping: 0,
          fixedRotation: true
        });
        // Remove gravity effect on the spear by not altering its force
        spearBody.force.set(0, 0, 0);
        spearBody.updateMassProperties();
        // Set velocity based on direction with high speed
        const speed = 200;
        const velocity = direction.clone().multiplyScalar(speed);
        spearBody.velocity.set(velocity.x, velocity.y, velocity.z);
        // Store the initial velocity so we can override any deflections
        pooledSpear.initialVelocity = velocity;
        spearBody.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        pooledSpear.body = spearBody;
        world.addBody(spearBody);
        scene.add(spearGroup);
        scene.add(pooledSpear.trail);

        // Reset trail to spear's position
        const trailParticles = 30;
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

        const maxLifetime = 10000;
        const creationTime = Date.now();

        // Update function for the spear projectile
        const updateSpear: IdentifiableFunction = (delta: number) => {
          if (!pooledSpear.body) {
            removeSpearUpdate();
            return;
          }
          // Override velocity to keep it bullet-like
          if (pooledSpear.initialVelocity) {
            pooledSpear.body.velocity.set(
              pooledSpear.initialVelocity.x,
              pooledSpear.initialVelocity.y,
              pooledSpear.initialVelocity.z
            );
          }
          // Update spear's mesh to follow its physics body
          spearGroup.position.copy(pooledSpear.body.position as unknown as THREE.Vector3);
          spearGroup.quaternion.copy(pooledSpear.body.quaternion as unknown as THREE.Quaternion);

          // Explode if lifetime exceeded or if out-of-bounds
          if (Date.now() - creationTime > maxLifetime ||
             (characterPositionRef?.current && 
              spearGroup.position.distanceTo(characterPositionRef.current) > 100)) {
            if (!pooledSpear.hasExploded) {
              pooledSpear.hasExploded = true;
              // Trigger immediate visual explosion
              triggerExplosion(spearGroup.position.clone());
              // Create water drops
              createExplosionEffect(spearGroup.position.clone());
            }
            
            if (pooledSpear.body) {
              const body = pooledSpear.body;
              setTimeout(() => {
                if (body) world.removeBody(body);
              }, 50);
              pooledSpear.body = undefined;
            }
            
            setTimeout(() => {
              returnSpearToPool(pooledSpear);
              removeSpearUpdate();
            }, 50);
            return;
          }

          // Update the trail positions
          const trailParticles = 30;
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

        // Always trigger explosion on any collision
        spearBody.addEventListener('collide', (/* _event */) => { // Changed to a comment inside the parameter list 
          if (!pooledSpear.body) return;
          if (!pooledSpear.hasExploded) {
            pooledSpear.hasExploded = true;
            // Trigger immediate visual explosion
            triggerExplosion(spearGroup.position.clone());
            // Create water drops
            createExplosionEffect(spearGroup.position.clone());
          }
          
          const body = pooledSpear.body;
          setTimeout(() => {
            if (body) world.removeBody(body);
          }, 50);
          pooledSpear.body = undefined;
          
          setTimeout(() => {
            returnSpearToPool(pooledSpear);
            removeSpearUpdate();
          }, 50);
        });

        const updateId = `waterSpear_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        updateSpear._id = updateId;
        pooledSpear._updateId = updateId;
        activeSpearUpdatesRef.current.add(updateId);
        const removeSpearUpdate = () => {
          activeSpearUpdatesRef.current.delete(updateId);
          removeFunc();
          if (pooledSpear.inUse) {
            returnSpearToPool(pooledSpear);
          }
        };
        const removeFunc = registerUpdate(updateSpear);
      };

      // Input handlers
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
        }
      };

      const getActiveSpearCount = (): number => {
        return spearPoolRef.current.filter(spear => spear.inUse).length;
      };

      const updateCrosshairOnTick: IdentifiableFunction = (_delta: number) => { // Fix: renamed to _delta to show it's intentionally unused
        const effectiveDelta = Math.min(_delta, 0.1);
        if (effectiveDelta > 0) {
          updateCrosshairPosition();
          if (getActiveSpearCount() > activeSpearUpdatesRef.current.size) {
            // Force cleanup if needed
          }
        }
      };
      updateCrosshairOnTick._id = 'updateCrosshair';
      const removeUpdateCrosshair = registerUpdate(updateCrosshairOnTick);

      // (Bending effects and water belt updates remain unchanged)

      // Hammer input handling
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
            const characterInRange = distanceFromCharacter < 15;

            let nearWaterSource = false;
            const waterSourceSearchRadius = 10;
            
            // Look for water sources in the scene
            scene.traverse((object) => {
              if (object instanceof THREE.Mesh) {
                const isWaterByName = object.name.toLowerCase().includes('water') || 
                                    object.name.toLowerCase().includes('lake') || 
                                    object.name.toLowerCase().includes('river') ||
                                    object.name.toLowerCase().includes('pond');
                
                const isWaterByUserData = object.userData && object.userData.isWater === true;
                
                let isWaterByMaterial = false;
                if (object.material instanceof THREE.MeshPhysicalMaterial || 
                    object.material instanceof THREE.MeshStandardMaterial) {
                  const material = object.material;
                  if (material.color && 
                      material.color.b > 0.6 &&
                      material.color.b > material.color.r * 1.5 &&
                      material.color.b > material.color.g * 1.5) {
                    isWaterByMaterial = true;
                  }
                }
                
                if ((isWaterByName || isWaterByMaterial || isWaterByUserData) && 
                    object.position.distanceTo(crosshairPositionRef.current) < waterSourceSearchRadius) {
                  nearWaterSource = true;
                }
              }
            });
            
            // Update particle positions and handle water collection
            if (nearWaterSource && characterInRange) {
              for (let i = 0; i < 100; i++) {
                const i3 = i * 3;
                
                if (positions[i3 + 1] < -100 && Math.random() < 0.1) {
                  const radius = 3 * Math.random();
                  const theta = Math.random() * Math.PI * 2;
                  const phi = Math.random() * Math.PI;

                  const startPos = characterPositionRef?.current ? 
                    characterPositionRef.current.clone() : 
                    crosshairPositionRef.current.clone();
                  startPos.y += 1.5;

                  const targetPos = crosshairPositionRef.current;
                  const progress = Math.random();
                  const pos = startPos.clone().lerp(targetPos, progress);

                  pos.x += Math.sin(theta) * radius * (1 - progress);
                  pos.y += Math.cos(phi) * radius * (1 - progress) * 0.5;
                  pos.z += Math.cos(theta) * radius * (1 - progress);

                  positions[i3] = pos.x;
                  positions[i3 + 1] = pos.y;
                  positions[i3 + 2] = pos.z;
                } else if (positions[i3 + 1] > -100) {
                  const dirX = crosshairPositionRef.current.x - positions[i3];
                  const dirY = crosshairPositionRef.current.y - positions[i3 + 1];
                  const dirZ = crosshairPositionRef.current.z - positions[i3 + 2];
                  const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
                  
                  if (length < 0.5) {
                    positions[i3 + 1] = -1000;
                    if (collectedDropsRef.current < MAX_WATER_DROPS) {
                      collectedDropsRef.current += 1;
                      if (bendingEffectRef.current) {
                        const material = bendingEffectRef.current.material as THREE.MeshBasicMaterial;
                        material.opacity = 0.8;
                        setTimeout(() => {
                          if (material) material.opacity = 0.4;
                        }, 100);
                      }
                    }
                  } else {
                    positions[i3] += dirX / length * 5 * delta;
                    positions[i3 + 1] += dirY / length * 5 * delta;
                    positions[i3 + 2] += dirZ / length * 5 * delta;
                  }
                }
              }
            } else {
              for (let i = 0; i < 100; i++) {
                positions[i * 3 + 1] = -1000;
              }
            }

            bendingParticlesRef.current.geometry.attributes.position.needsUpdate = true;
          }

          // Update and collect water drops
          waterDropPoolRef.current.forEach(drop => {
            if (drop.inUse) {
              drop.mesh.position.copy(drop.body.position as unknown as THREE.Vector3);
              
              // Pull drop toward the crosshair with increased strength
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

              // Check distance to crosshair
              if (distance < 30) { 
                direction.normalize();
                // Increased pull strength from 25 to 50
                const pullStrength = 50 * (1 - distance / 30); // <-- INCREASED STRENGTH
                const forceVec = new CANNON.Vec3(
                  direction.x * pullStrength * delta * drop.body.mass,
                  direction.y * pullStrength * delta * drop.body.mass,
                  direction.z * pullStrength * delta * drop.body.mass
                );
                // Ensure the body is awake to receive force
                if (drop.body.sleepState === CANNON.Body.SLEEPING) {
                  drop.body.wakeUp();
                }
                drop.body.applyForce(forceVec, drop.body.position);
              }

              // Check distance to crosshair again for collection
              if (distance < 1.2) { 
                if (collectedDropsRef.current < MAX_WATER_DROPS) {
                  collectedDropsRef.current += 1;
                  if (bendingEffectRef.current) {
                    const material = bendingEffectRef.current.material as THREE.MeshBasicMaterial;
                    material.opacity = 0.8;
                    setTimeout(() => {
                      if (material) material.opacity = 0.4;
                    }, 100);
                  }
                }
                // Reset the drop
                drop.inUse = false;
                drop.mesh.visible = false;
                drop.body.position.set(0, -1000, 0);
                drop.body.velocity.set(0, 0, 0);
                drop.body.angularVelocity.set(0, 0, 0); // Also reset angular velocity
                drop.body.sleep();
              }
            }
          });
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

            const baseRadius = 1.5 + waterRatio * 0.5;
            const time = Date.now() * 0.001;

            waterBeltSpheresRef.current.forEach((sphere, i) => {
              const totalSpheres = waterBeltSpheresRef.current.length;
              const angle = (i / totalSpheres) * Math.PI * 2;
              if (characterPositionRef.current) {
                const characterPos = characterPositionRef.current.clone();
                sphere.position.copy(characterPos);
                sphere.position.x += Math.cos(angle + time * 0.5) * baseRadius;
                sphere.position.y += 1.2 + Math.sin(time + angle * 5) * 0.2;
                sphere.position.z += Math.sin(angle + time * 0.5) * baseRadius;
              }

              const material = sphere.material as THREE.MeshPhysicalMaterial;
              const pulse = Math.sin(time * 1.5 + i * 0.3) * 0.2 + 0.8;
              material.emissiveIntensity = 0.4 + pulse * (0.2 + waterRatio * 0.3);
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
      };
      updateBendingEffects._id = 'bendingVisualEffects';
      const removeEffectsUpdate = registerUpdate(updateBendingEffects);

      // Add event listeners
      window.addEventListener('mousedown', onMouseDown, { capture: true });
      window.addEventListener('mouseup', onMouseUp, { capture: true });
      window.addEventListener('mousedown', onRightClick, { capture: true });

      return () => {
        // Cleanup (removing objects, disposing geometries/materials, and event listeners)
        if (bendingEffectRef.current) scene.remove(bendingEffectRef.current);
        if (bendingParticlesRef.current) scene.remove(bendingParticlesRef.current);
        waterBeltSpheresRef.current.forEach(sphere => {
          scene.remove(sphere);
          (sphere.material as THREE.Material).dispose();
        });
        waterBeltSpheresRef.current = [];
        sphereGeometry.dispose();
        sphereMaterial.dispose();
        waterDropPoolRef.current.forEach(drop => {
          scene.remove(drop.mesh);
          world.removeBody(drop.body);
          drop.mesh.geometry.dispose();
          (drop.mesh.material as THREE.Material).dispose();
        });
        waterDropPoolRef.current = [];
        spearPoolRef.current.forEach(spear => {
          if (spear.inUse) {
            scene.remove(spear.spearGroup);
            scene.remove(spear.trail);
            if (spear.body) {
              world.removeBody(spear.body);
            }
            spear.inUse = false;
          }
          spear.trailGeometry.dispose();
        });
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
        removeWaterDropsUpdate();
        window.removeEventListener('mousedown', onRightClick, { capture: true });
        window.removeEventListener('mousedown', onMouseDown, { capture: true });
        window.removeEventListener('mouseup', onMouseUp, { capture: true });
      };
    };

    const cleanupFn = setupWaterBending();
    return () => {
      if (cleanupFn) {
        cleanupFn();
      }
    };
  }, [scene, domElement, registerUpdate, camera, isBendingRef, crosshairPositionRef, characterPositionRef, world, returnSpearToPool]);

  return (
    <WaterMeter
      currentWater={displayedDrops}
      maxWater={MAX_WATER_DROPS}
      requiredWater={REQUIRED_DROPS_TO_FIRE}
    />
  );
}
