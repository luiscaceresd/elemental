'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import Hammer from 'hammerjs';

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
}

export default function WaterBending({ scene, domElement, registerUpdate, camera, isBendingRef, crosshairPositionRef }: WaterBendingProps) {
  const raycasterRef = useRef<THREE.Raycaster | null>(null);
  const mousePositionRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const bendingEffectRef = useRef<THREE.Mesh | null>(null);
  const bendingParticlesRef = useRef<THREE.Points | null>(null);

  // This useEffect is necessary for THREE.js integration, Hammer.js setup, and mouse handling
  useEffect(() => {
    // Dynamic import for client-side only libraries
    const setupWaterBending = async () => {
      // Dynamically import THREE and Hammer.js
      const THREE = await import('three');
      const Hammer = (await import('hammerjs')).default;

      // Initialize raycaster for mouse position in 3D space
      raycasterRef.current = new THREE.Raycaster();

      // Create visual indicator for bending - follows crosshair
      const glowGeometry = new THREE.SphereGeometry(0.5, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x00BFFF, // Deep sky blue
        transparent: true,
        opacity: 0.0, // Start invisible
      });

      const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
      scene.add(glowMesh);
      bendingEffectRef.current = glowMesh;

      // Create particle system for water bending effect
      const particleCount = 100;
      const particleGeometry = new THREE.BufferGeometry();
      const particlePositions = new Float32Array(particleCount * 3);

      // Initialize particles off-screen
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        particlePositions[i3] = 0;
        particlePositions[i3 + 1] = -1000; // Off-screen
        particlePositions[i3 + 2] = 0;
      }

      particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

      const particleMaterial = new THREE.PointsMaterial({
        color: 0x87CEFA, // Light sky blue
        size: 0.2,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
      });

      const particles = new THREE.Points(particleGeometry, particleMaterial);
      scene.add(particles);
      bendingParticlesRef.current = particles;

      // Function to update crosshair position from mouse/touch input
      const updateCrosshairPosition = (clientX: number, clientY: number) => {
        if (!camera || !raycasterRef.current) return;

        // Convert to normalized device coordinates (-1 to +1)
        const normalizedX = (clientX / window.innerWidth) * 2 - 1;
        const normalizedY = -(clientY / window.innerHeight) * 2 + 1;

        mousePositionRef.current.set(normalizedX, normalizedY);

        // Update the raycaster with normalized mouse coordinates
        raycasterRef.current.setFromCamera(mousePositionRef.current, camera);

        // Calculate the point 15 units along the ray for the crosshair position
        const newPosition = raycasterRef.current.ray.origin.clone()
          .add(raycasterRef.current.ray.direction.clone().multiplyScalar(15));

        crosshairPositionRef.current.copy(newPosition);

        console.log('Crosshair position updated:', crosshairPositionRef.current); // Debug log
      };

      // Mouse event handlers
      const onMouseDown = (event: MouseEvent) => {
        if (event.button === 0) { // Left button
          isBendingRef.current = true;
          updateCrosshairPosition(event.clientX, event.clientY);
          console.log('Bending started:', isBendingRef.current); // Debug log
        }
      };

      const onMouseUp = (event: MouseEvent) => {
        if (event.button === 0) { // Left button
          isBendingRef.current = false;
          console.log('Bending stopped:', isBendingRef.current); // Debug log
        }
      };

      const onMouseMove = (event: MouseEvent) => {
        updateCrosshairPosition(event.clientX, event.clientY);
      };

      // Add event listeners to window for maximum capture
      window.addEventListener('mousedown', onMouseDown, { capture: true });
      window.addEventListener('mouseup', onMouseUp, { capture: true });
      window.addEventListener('mousemove', onMouseMove, { capture: true });

      // Set up Hammer.js for touch input for mobile support
      const hammer = new Hammer(domElement);
      const pan = new Hammer.Pan({ threshold: 0, pointers: 1 });
      hammer.add(pan);

      hammer.on('panstart', (event) => {
        isBendingRef.current = true;
        updateCrosshairPosition(event.center.x, event.center.y);
        console.log('Touch bending started:', isBendingRef.current); // Debug log
      });

      hammer.on('panend', () => {
        isBendingRef.current = false;
        console.log('Touch bending stopped:', isBendingRef.current); // Debug log
      });

      hammer.on('pan', (event) => {
        updateCrosshairPosition(event.center.x, event.center.y);
      });

      // Visual effect update for bending
      const updateBendingEffects: IdentifiableFunction = (delta: number) => {
        if (isBendingRef.current && crosshairPositionRef.current) {
          // Update glow position and make it visible
          if (bendingEffectRef.current) {
            bendingEffectRef.current.position.copy(crosshairPositionRef.current);
            (bendingEffectRef.current.material as THREE.MeshBasicMaterial).opacity = 0.4;
            bendingEffectRef.current.scale.set(
              1 + Math.sin(Date.now() * 0.005) * 0.3,
              1 + Math.sin(Date.now() * 0.005) * 0.3,
              1 + Math.sin(Date.now() * 0.005) * 0.3
            );
          }

          // Update particles to flow toward crosshair
          if (bendingParticlesRef.current) {
            const positions = bendingParticlesRef.current.geometry.attributes.position.array as Float32Array;

            for (let i = 0; i < 100; i++) {
              const i3 = i * 3;

              // Randomly activate some particles when bending
              if (positions[i3 + 1] < -100 && Math.random() < 0.1) {
                // Position particles in a spiral around the crosshair
                const angle = Math.random() * Math.PI * 2;
                const radius = 2 + Math.random() * 4;

                positions[i3] = crosshairPositionRef.current.x + Math.cos(angle) * radius;
                positions[i3 + 1] = crosshairPositionRef.current.y;
                positions[i3 + 2] = crosshairPositionRef.current.z + Math.sin(angle) * radius;
              } else if (positions[i3 + 1] > -100) {
                // Move existing particles toward crosshair
                const dirX = crosshairPositionRef.current.x - positions[i3];
                const dirY = crosshairPositionRef.current.y - positions[i3 + 1];
                const dirZ = crosshairPositionRef.current.z - positions[i3 + 2];

                const length = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);

                if (length < 0.5) {
                  // Particle reached crosshair, deactivate it
                  positions[i3 + 1] = -1000;
                } else {
                  // Move particle toward crosshair
                  positions[i3] += dirX / length * 5 * delta;
                  positions[i3 + 1] += dirY / length * 5 * delta;
                  positions[i3 + 2] += dirZ / length * 5 * delta;
                }
              }
            }

            bendingParticlesRef.current.geometry.attributes.position.needsUpdate = true;
          }

          // Log bending state periodically
          if (Math.random() < 0.01) {
            console.log('Still bending:', isBendingRef.current, 'at', crosshairPositionRef.current);
          }
        } else {
          // Hide effects when not bending
          if (bendingEffectRef.current) {
            (bendingEffectRef.current.material as THREE.MeshBasicMaterial).opacity = 0;
          }

          // Move all particles off-screen
          if (bendingParticlesRef.current) {
            const positions = bendingParticlesRef.current.geometry.attributes.position.array as Float32Array;

            for (let i = 0; i < 100; i++) {
              positions[i * 3 + 1] = -1000;
            }

            bendingParticlesRef.current.geometry.attributes.position.needsUpdate = true;
          }
        }
      };
      updateBendingEffects._id = 'bendingVisualEffects';
      const removeEffectsUpdate = registerUpdate(updateBendingEffects);

      // Cleanup
      return () => {
        if (bendingEffectRef.current) scene.remove(bendingEffectRef.current);
        if (bendingParticlesRef.current) scene.remove(bendingParticlesRef.current);
        hammer.destroy();
        removeEffectsUpdate();
        window.removeEventListener('mousedown', onMouseDown, { capture: true });
        window.removeEventListener('mouseup', onMouseUp, { capture: true });
        window.removeEventListener('mousemove', onMouseMove, { capture: true });
      };
    };

    const cleanup = setupWaterBending();

    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [scene, domElement, registerUpdate, camera, isBendingRef, crosshairPositionRef]);

  return null; // No DOM rendering, just Three.js logic
} 