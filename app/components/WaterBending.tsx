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
  const MAX_WATER_DROPS = 300;
  const REQUIRED_DROPS_TO_FIRE = 45;
  const MAX_VISIBLE_SPHERES = 50;

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

      const createWaterSpear = () => {
        if (!characterPositionRef?.current) return;

        if (collectedDropsRef.current < REQUIRED_DROPS_TO_FIRE) {
          console.log('Not enough water to create a spear!');
          return;
        }

        console.log(`Creating water spear with ${collectedDropsRef.current} drops`);
        collectedDropsRef.current -= REQUIRED_DROPS_TO_FIRE;

        const spearGeometry = new THREE.CylinderGeometry(0.4, 0.1, 3.5, 16);
        const spearGroup = new THREE.Group();

        const spearMaterial = new THREE.MeshPhysicalMaterial({
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

        const spear = new THREE.Mesh(spearGeometry, spearMaterial);
        spear.castShadow = true;
        spearGroup.add(spear);

        const glowGeometry = new THREE.CylinderGeometry(0.6, 0.3, 4.0, 16);
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: 0x00BFFF,
          transparent: true,
          opacity: 0.3,
          side: THREE.BackSide,
        });

        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        spearGroup.add(glow);

        spearGroup.position.copy(characterPositionRef.current);
        spearGroup.position.y += 1.5;

        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        direction.normalize();

        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
        spearGroup.setRotationFromQuaternion(quaternion);

        scene.add(spearGroup);

        const trailGeometry = new THREE.BufferGeometry();
        const trailParticles = 30;
        const trailPositions = new Float32Array(trailParticles * 3);

        for (let i = 0; i < trailParticles; i++) {
          trailPositions[i * 3] = 0;
          trailPositions[i * 3 + 1] = 0;
          trailPositions[i * 3 + 2] = 0;
        }

        trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));

        const trailMaterial = new THREE.PointsMaterial({
          color: 0x87CEFA,
          size: 0.3,
          transparent: true,
          opacity: 0.6,
          blending: THREE.AdditiveBlending,
        });

        const trail = new THREE.Points(trailGeometry, trailMaterial);
        scene.add(trail);

        const createWaterDrops = (position: THREE.Vector3) => {
          const dropGeometry = new THREE.SphereGeometry(0.3, 16, 16);
          const dropMaterial = new THREE.MeshPhysicalMaterial({
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

          for (let i = 0; i < 10; i++) {
            const drop = new THREE.Mesh(dropGeometry, dropMaterial);
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
            scene.remove(spearGroup);
            scene.remove(trail);
            spearGeometry.dispose();
            spearMaterial.dispose();
            glowGeometry.dispose();
            glowMaterial.dispose();
            trailGeometry.dispose();
            trailMaterial.dispose();
            removeSpearUpdate();
            return;
          }

          const terrain = scene.getObjectByName('terrain');
          if (terrain) {
            const raycaster = new THREE.Raycaster();
            raycaster.set(spearGroup.position, direction);
            const intersects = raycaster.intersectObject(terrain, true);
            const distance = speed * delta;
            if (intersects.length > 0 && intersects[0].distance < distance) {
              createWaterDrops(intersects[0].point);
              scene.remove(spearGroup);
              scene.remove(trail);
              spearGeometry.dispose();
              spearMaterial.dispose();
              glowGeometry.dispose();
              glowMaterial.dispose();
              trailGeometry.dispose();
              trailMaterial.dispose();
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
          console.log('Bending started:', isBendingRef.current);
        }
      };

      const onMouseUp = (event: MouseEvent) => {
        if (event.button === 0) {
          isBendingRef.current = false;
          console.log('Bending stopped, collected drops:', collectedDropsRef.current);
        }
      };

      const onRightClick = (event: MouseEvent) => {
        if (event.button === 2) {
          event.preventDefault();
          if (collectedDropsRef.current >= REQUIRED_DROPS_TO_FIRE) {
            createWaterSpear();
            console.log('Water spear fired with right-click!');
          } else {
            console.log('Not enough water to fire a spear!');
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
        console.log('Touch bending started:', isBendingRef.current);
      });

      hammer.on('panend', () => {
        isBendingRef.current = false;
        console.log('Touch bending stopped, collected drops:', collectedDropsRef.current);
      });

      hammer.on('tap', () => {
        if (collectedDropsRef.current >= REQUIRED_DROPS_TO_FIRE) {
          createWaterSpear();
          console.log('Water spear fired with tap!');
        } else {
          console.log('Not enough water to fire a spear!');
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
                sphere.position.copy(characterPositionRef.current);
                sphere.position.x += Math.cos(angle + time * 0.5) * baseRadius;
                sphere.position.y += 1.2 + Math.sin(time + angle * 5) * 0.2;
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
          dropsToRemove.forEach(drop => {
            drop.mesh.geometry.dispose();
            (drop.mesh.material as THREE.Material).dispose();
          });
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
          drop.mesh.geometry.dispose();
          (drop.mesh.material as THREE.Material).dispose();
        });
        freeDropsRef.current = [];

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