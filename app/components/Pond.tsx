'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface PondProps {
  position: THREE.Vector3;
  size: number; // Diameter of the pond
  depth: number;
  scene: THREE.Scene;
  isBendingRef: React.MutableRefObject<boolean>;
  crosshairPositionRef: React.MutableRefObject<THREE.Vector3>;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
}

export default function Pond({
  position,
  size,
  depth,
  scene,
  isBendingRef,
  crosshairPositionRef,
  registerUpdate,
}: PondProps) {
  const dropsRef = useRef<THREE.Mesh[]>([]);
  const velocitiesRef = useRef<THREE.Vector3[]>([]);
  const dropCount = 300; // Increased for better pond coverage

  useEffect(() => {
    const setupPond = async () => {
      const THREE = await import('three');

      // Water drop geometry and material - shared for performance
      const dropGeometry = new THREE.SphereGeometry(0.5, 16, 16);
      const dropMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xADD8E6, // Light blue water
        transparent: true,
        opacity: 0.8,
        roughness: 0.1,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        transmission: 0.9, // Glass-like effect
        ior: 1.33, // Index of refraction for water
      });

      // Create individual water drops
      const drops: THREE.Mesh[] = [];
      const velocities: THREE.Vector3[] = [];
      const radius = size / 2;

      for (let i = 0; i < dropCount; i++) {
        const drop = new THREE.Mesh(dropGeometry, dropMaterial);

        // Position the drop within the pond area
        const angle = Math.random() * Math.PI * 2;
        const distanceFromCenter = Math.random() * radius;
        const x = position.x + Math.cos(angle) * distanceFromCenter;
        const z = position.z + Math.sin(angle) * distanceFromCenter;

        // Get terrain height at this position
        let terrainY = 0;
        if (typeof window !== 'undefined' && (window as any).getTerrainHeight) {
          terrainY = (window as any).getTerrainHeight(x, z);
        }

        // Make sure drops start lower in the depression
        const y = terrainY + Math.random() * depth * 0.2; // Lower multiplier to keep drops near bottom

        drop.position.set(x, y, z);

        // Random initial scale
        const scale = 0.5 + Math.random() * 0.5;
        drop.scale.set(scale, scale, scale);

        // Enable shadows
        drop.castShadow = true;
        drop.receiveShadow = true;

        scene.add(drop);
        drops.push(drop);

        // Add a small random initial velocity
        velocities.push(new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05
        ));
      }

      dropsRef.current = drops;
      velocitiesRef.current = velocities;

      // Update function for bending and merging
      const updatePond = (delta: number) => {
        if (delta > 0.1) return; // Skip large deltas

        console.log('Bending state:', isBendingRef.current); // Debug log

        const activeDrops = drops.filter(drop => drop.visible);

        // Process each drop
        for (let i = 0; i < drops.length; i++) {
          if (!drops[i].visible) continue;

          // Handle water bending
          if (isBendingRef.current && crosshairPositionRef.current) {
            const direction = crosshairPositionRef.current.clone().sub(drops[i].position);
            const distance = direction.length();

            if (distance < 30) { // Increased range for better responsiveness
              direction.normalize();
              const pullStrength = 15 * (1 - distance / 30); // Stronger pull
              velocitiesRef.current[i].add(direction.multiplyScalar(pullStrength * delta));
            }
          }

          // Apply velocity
          drops[i].position.add(velocitiesRef.current[i].clone().multiplyScalar(delta));

          // Apply gravity when not bending - water should settle at bottom of depression
          if (!isBendingRef.current) {
            let targetY = 0;
            if (typeof window !== 'undefined' && (window as any).getTerrainHeight) {
              targetY = (window as any).getTerrainHeight(drops[i].position.x, drops[i].position.z);
            }

            // Apply stronger gravity
            if (drops[i].position.y > targetY + 0.1) {
              velocitiesRef.current[i].y -= 9.8 * delta; // Earth gravity
            } else {
              // At rest on ground, dampen horizontal movement
              velocitiesRef.current[i].x *= 0.9;
              velocitiesRef.current[i].z *= 0.9;
              velocitiesRef.current[i].y = 0;

              // Ensure drops stay above terrain
              drops[i].position.y = Math.max(targetY + 0.1, drops[i].position.y);
            }
          }

          // Apply damping to velocities
          velocitiesRef.current[i].multiplyScalar(0.95);
        }

        // Check for merging
        for (let i = 0; i < drops.length; i++) {
          if (!drops[i].visible) continue;

          for (let j = i + 1; j < drops.length; j++) {
            if (!drops[j].visible) continue;

            const distance = drops[i].position.distanceTo(drops[j].position);
            const combinedRadius = drops[i].scale.x + drops[j].scale.x;

            // If drops are close enough, merge them
            if (distance < combinedRadius * 0.5) {
              // Get the volume (proportional to r³) of each drop
              const volumeI = Math.pow(drops[i].scale.x, 3);
              const volumeJ = Math.pow(drops[j].scale.x, 3);
              const totalVolume = volumeI + volumeJ;

              // New radius is proportional to cube root of volume
              const newScale = Math.pow(totalVolume, 1 / 3);

              // Larger drop absorbs smaller one and increases in size
              if (volumeI >= volumeJ) {
                // Drop i absorbs drop j
                drops[i].scale.set(newScale, newScale, newScale);

                // Weight velocity by mass (volume)
                velocitiesRef.current[i].multiplyScalar(volumeI / totalVolume)
                  .add(velocitiesRef.current[j].clone().multiplyScalar(volumeJ / totalVolume));

                // Move merged drop to weighted position
                drops[i].position.lerp(drops[j].position, volumeJ / totalVolume);

                // Hide the absorbed drop
                drops[j].visible = false;
              } else {
                // Drop j absorbs drop i
                drops[j].scale.set(newScale, newScale, newScale);

                // Weight velocity by mass
                velocitiesRef.current[j].multiplyScalar(volumeJ / totalVolume)
                  .add(velocitiesRef.current[i].clone().multiplyScalar(volumeI / totalVolume));

                // Move merged drop to weighted position
                drops[j].position.lerp(drops[i].position, volumeI / totalVolume);

                // Hide the absorbed drop
                drops[i].visible = false;
                break; // Break since drop i is no longer active
              }
            }
          }
        }

        // Occasionally respawn absorbed drops
        if (Math.random() < 0.01) {
          for (let i = 0; i < drops.length; i++) {
            if (!drops[i].visible) {
              // Respawn at a random location in the pond
              const angle = Math.random() * Math.PI * 2;
              const distanceFromCenter = Math.random() * radius;
              const x = position.x + Math.cos(angle) * distanceFromCenter;
              const z = position.z + Math.sin(angle) * distanceFromCenter;

              let terrainY = 0;
              if (typeof window !== 'undefined' && (window as any).getTerrainHeight) {
                terrainY = (window as any).getTerrainHeight(x, z);
              }

              drops[i].position.set(x, terrainY + 0.1, z);
              drops[i].scale.set(0.3, 0.3, 0.3); // Start small
              drops[i].visible = true;

              velocitiesRef.current[i].set(
                (Math.random() - 0.5) * 0.1,
                0,
                (Math.random() - 0.5) * 0.1
              );

              break; // Only respawn one drop per frame
            }
          }
        }
      };

      const update = updatePond as ((delta: number) => void) & { _id?: string };
      update._id = `pond_${position.x}_${position.z}`;
      const removeUpdate = registerUpdate(update);

      return () => {
        drops.forEach(drop => scene.remove(drop));
        dropGeometry.dispose();
        dropMaterial.dispose();
        removeUpdate();
      };
    };

    const cleanup = setupPond();
    return () => cleanup.then(cleanupFn => cleanupFn && cleanupFn());
  }, [position, size, depth, scene, isBendingRef, crosshairPositionRef, registerUpdate]);

  return null;
} 