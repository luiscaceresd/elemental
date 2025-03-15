'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import WaterMeter from './WaterMeter';

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
}

// Define a WaterSpear type for our pool
interface WaterSpear {
  spearGroup: THREE.Group;
  trail: THREE.Points;
  trailGeometry: THREE.BufferGeometry;
  raycaster: THREE.Raycaster;
  inUse: boolean;
}

export default function WaterBending({
  scene,
  domElement,
  registerUpdate,
  camera,
  isBendingRef,
  crosshairPositionRef,
  characterPositionRef
}: WaterBendingProps) {
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  // We'll keep the ref but just mark it as unused to avoid future errors
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const mousePositionRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const bendingEffectRef = useRef<THREE.Mesh | null>(null);
  const bendingParticlesRef = useRef<THREE.Points | null>(null);
  const collectedDropsRef = useRef<number>(0);
  const waterBeltSpheresRef = useRef<THREE.Mesh[]>([]); // Back to just core spheres
  const freeDropsRef = useRef<{ mesh: THREE.Mesh; velocity: THREE.Vector3 }[]>([]);
  const [displayedDrops, setDisplayedDrops] = useState<number>(0);
  const MAX_WATER_DROPS = 450;
  const REQUIRED_DROPS_TO_FIRE = 45;
  const MAX_VISIBLE_SPHERES = 50;

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
  const SPEAR_POOL_SIZE = 10; // Adjust based on maximum expected simultaneous spears

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
      spearGeometryRef.current = new THREE.CylinderGeometry(0.4, 0.1, 3.5, 16);
      spearMaterialRef.current = new THREE.MeshPhysicalMaterial({
        color: 0x00BFFF,
        transparent: true,
        opacity: 0.9,
        roughness: 0.1,
        metalness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0.8,
        ior: 1.33,
        emissive: 0x0077BB,
        emissiveIntensity: 0.5
      });

      glowGeometryRef.current = new THREE.CylinderGeometry(0.6, 0.3, 4.0, 16);
      glowMaterialRef.current = new THREE.MeshBasicMaterial({
        color: 0x00BFFF,
        transparent: true,
        opacity: 0.3,
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
          raycaster: new THREE.Raycaster(),
          inUse: false
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
        // Find an available spear in the pool
        const availableSpear = spearPoolRef.current.find(spear => !spear.inUse);

        if (availableSpear) {
          availableSpear.inUse = true;
          return availableSpear;
        }

        // No spears available in the pool
        console.warn('Water spear pool exhausted. Consider increasing pool size.');
        return null;
      };

      const returnSpearToPool = (spear: WaterSpear) => {
        // Remove from scene
        scene.remove(spear.spearGroup);
        scene.remove(spear.trail);

        // Reset trail positions to hidden
        const positions = spear.trail.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < positions.length / 3; i++) {
          positions[i * 3 + 1] = -1000; // Hide trail points
        }
        spear.trail.geometry.attributes.position.needsUpdate = true;

        // Mark as available for reuse
        spear.inUse = false;
      };

      const createWaterSpear = () => {
        if (!characterPositionRef?.current) return;

        if (collectedDropsRef.current < REQUIRED_DROPS_TO_FIRE) {
          // Not enough water to create a spear
          return;
        }

        // Creating water spear
        collectedDropsRef.current -= REQUIRED_DROPS_TO_FIRE;

        // Get a spear from the pool
        const pooledSpear = getSpearFromPool();
        if (!pooledSpear) return; // No spears available

        const { spearGroup, trail, raycaster } = pooledSpear;

        // Position and orient the spear
        spearGroup.position.copy(characterPositionRef.current);
        spearGroup.position.y += 1.5;

        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        direction.normalize();

        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        spearGroup.setRotationFromQuaternion(quaternion);

        // Add to scene
        scene.add(spearGroup);
        scene.add(trail);

        // Reset trail to spear position
        const trailParticles = 30; // Same value used when creating the pool
        const positions = trail.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < trailParticles; i++) {
          positions[i * 3] = spearGroup.position.x;
          positions[i * 3 + 1] = spearGroup.position.y;
          positions[i * 3 + 2] = spearGroup.position.z;
        }
        trail.geometry.attributes.position.needsUpdate = true;

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
            drop.position.copy(position).add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 2,
                Math.random() * 2,
                (Math.random() - 0.5) * 2
              )
            );
            drop.scale.setScalar(0.5 + Math.random() * 0.5);
            drop.castShadow = true;
            drop.receiveShadow = true;
            scene.add(drop);

            const velocity = new THREE.Vector3(
              (Math.random() - 0.5) * 4,
              Math.random() * 4,
              (Math.random() - 0.5) * 4
            );
            freeDropsRef.current.push({ mesh: drop, velocity });
          }
        };

        const speed = 30;
        const maxLifetime = 5000;
        const creationTime = Date.now();

        const updateSpear: IdentifiableFunction = (delta: number) => {
          if (Date.now() - creationTime > maxLifetime) {
            // Lifetime expired, return to pool
            returnSpearToPool(pooledSpear);
            removeSpearUpdate();
            return;
          }

          const terrain = scene.getObjectByName('terrain');
          if (terrain) {
            // Use the dedicated raycaster for this spear
            raycaster.set(spearGroup.position, direction);
            const intersects = raycaster.intersectObject(terrain, true);
            const distance = speed * delta;
            if (intersects.length > 0 && intersects[0].distance < distance) {
              createWaterDrops(intersects[0].point);
              returnSpearToPool(pooledSpear);
              removeSpearUpdate();
              return;
            }
          }

          spearGroup.position.add(direction.clone().multiplyScalar(speed * delta));

          const positions = trail.geometry.attributes.position.array as Float32Array;

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

          trail.geometry.attributes.position.needsUpdate = true;

          spearGroup.rotateZ(delta * 2);
        };

        updateSpear._id = `waterSpear_${Date.now()}`;
        const removeSpearUpdate = registerUpdate(updateSpear);
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
        }
      };

      const updateCrosshairOnTick: IdentifiableFunction = (delta: number) => {
        if (delta) { /* ensure delta is used */ }
        updateCrosshairPosition();
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

            for (let i = 0; i < 100; i++) {
              const i3 = i * 3;

              if (positions[i3 + 1] < -100 && Math.random() < 0.1 && collectedDropsRef.current < MAX_WATER_DROPS) {
                const angle = Math.random() * Math.PI * 2;
                const radius = 2 + Math.random() * 4;

                positions[i3] = crosshairPositionRef.current.x + Math.cos(angle) * radius;
                positions[i3 + 1] = crosshairPositionRef.current.y;
                positions[i3 + 2] = crosshairPositionRef.current.z + Math.sin(angle) * radius;
              } else if (positions[i3 + 1] > -100) {
                const dirX = crosshairPositionRef.current.x - positions[i3];
                const dirY = crosshairPositionRef.current.y - positions[i3 + 1];
                const dirZ = crosshairPositionRef.current.z - positions[i3 + 2];

                const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

                if (length < 0.5) {
                  positions[i3 + 1] = -1000;
                  if (collectedDropsRef.current < MAX_WATER_DROPS) {
                    collectedDropsRef.current += 1;
                  }
                } else {
                  positions[i3] += dirX / length * 5 * delta;
                  positions[i3 + 1] += dirY / length * 5 * delta;
                  positions[i3 + 2] += dirZ / length * 5 * delta;
                }
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

        // Handle free water drops (unchanged)
        const dropsToRemove: { mesh: THREE.Mesh; velocity: THREE.Vector3 }[] = [];

        for (const drop of freeDropsRef.current) {
          if (isBendingRef.current && crosshairPositionRef.current) {
            const direction = crosshairPositionRef.current.clone().sub(drop.mesh.position);
            const distance = direction.length();
            if (distance < 20) {
              direction.normalize();
              const pullStrength = 15 * (1 - distance / 20);
              drop.velocity.add(direction.multiplyScalar(pullStrength * delta));
            }
          }

          drop.mesh.position.add(drop.velocity.clone().multiplyScalar(delta));
          let targetY = 0;

          // Define interface for window with getTerrainHeight
          interface WindowWithTerrain extends Window {
            getTerrainHeight?: (x: number, z: number) => number;
          }

          const winWithTerrain = window as WindowWithTerrain;
          if (typeof window !== 'undefined' && winWithTerrain.getTerrainHeight) {
            targetY = winWithTerrain.getTerrainHeight(drop.mesh.position.x, drop.mesh.position.z);
          }

          if (drop.mesh.position.y > targetY + 0.1) {
            drop.velocity.y -= 9.8 * delta;
          } else {
            drop.velocity.x *= 0.9;
            drop.velocity.z *= 0.9;
            drop.velocity.y = 0;
            drop.mesh.position.y = targetY + 0.1;
          }

          if (isBendingRef.current && crosshairPositionRef.current) {
            const distance = drop.mesh.position.distanceTo(crosshairPositionRef.current);
            if (distance < 0.8 && collectedDropsRef.current < MAX_WATER_DROPS) {
              collectedDropsRef.current += 1;
              scene.remove(drop.mesh);
              dropsToRemove.push(drop);
            }
          }
        }

        if (dropsToRemove.length > 0) {
          freeDropsRef.current = freeDropsRef.current.filter(d => !dropsToRemove.includes(d));
          // Don't dispose of shared geometries and materials
          // dropsToRemove.forEach(drop => {
          //   drop.mesh.geometry.dispose();
          //   (drop.mesh.material as THREE.Material).dispose();
          // });
        }

        // Handle water collection better
        if (isBendingRef.current &&
          bendingEffectRef.current &&
          bendingParticlesRef.current &&
          crosshairPositionRef.current) {

          // Add more particles for a better bending effect
          const positions = bendingParticlesRef.current.geometry.attributes.position.array as Float32Array;

          // Update particle positions
          for (let i = 0; i < 100; i++) {
            const i3 = i * 3;
            const radius = 3 * Math.random();
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI;

            // Start particles from character position for better visual effect
            const startPos = characterPositionRef?.current ? characterPositionRef.current.clone() : new THREE.Vector3();
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
          }

          bendingParticlesRef.current.geometry.attributes.position.needsUpdate = true;

          // Improve water collection logic
          // ENHANCEMENT: Make water collection more predictable and satisfying
          const collectChance = 0.08; // 8% chance per frame
          if (Math.random() < collectChance) {
            if (collectedDropsRef.current < MAX_WATER_DROPS) {
              collectedDropsRef.current += 1;

              // Add a visual feedback of collection - make the bending effect pulse
              if (bendingEffectRef.current) {
                const material = bendingEffectRef.current.material as THREE.MeshBasicMaterial;
                material.opacity = 0.8; // Brief bright flash
                setTimeout(() => {
                  if (material) material.opacity = 0.4;
                }, 100);
              }
            }
          }
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

        freeDropsRef.current.forEach(drop => {
          scene.remove(drop.mesh);
          // Don't dispose shared geometry and materials
        });
        freeDropsRef.current = [];

        // Cleanup spear pool
        spearPoolRef.current.forEach(spear => {
          if (spear.inUse) {
            scene.remove(spear.spearGroup);
            scene.remove(spear.trail);
          }
          // Dispose of the unique geometry (trail geometry)
          spear.trailGeometry.dispose();
        });
        spearPoolRef.current = [];

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
  }, [scene, domElement, registerUpdate, camera, isBendingRef, crosshairPositionRef, characterPositionRef]);

  return (
    <WaterMeter
      currentWater={displayedDrops}
      maxWater={MAX_WATER_DROPS}
      requiredWater={REQUIRED_DROPS_TO_FIRE}
    />
  );
}