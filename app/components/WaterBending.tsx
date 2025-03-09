'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import Hammer from 'hammerjs';

interface WaterBendingProps {
  scene: THREE.Scene;
  domElement: HTMLCanvasElement;
}

export default function WaterBending({ scene, domElement }: WaterBendingProps) {
  const waterRef = useRef<THREE.Mesh | null>(null);

  // This useEffect is necessary for THREE.js integration and Hammer.js setup
  useEffect(() => {
    // Dynamic import for client-side only libraries
    const setupWaterBending = async () => {
      // Dynamically import THREE and Hammer.js
      const THREE = await import('three');
      const Hammer = (await import('hammerjs')).default;

      // Create the water mesh
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0x1E90FF, transparent: true, opacity: 0.7 }) // DodgerBlue color
      );
      water.position.set(0, 0.1, 0);
      water.rotation.x = -Math.PI / 2; // Lay flat on the ground
      scene.add(water);
      waterRef.current = water;

      // Set up Hammer.js for touch/mouse input
      const hammer = new Hammer(domElement);

      // Enable pan recognition
      const pan = new Hammer.Pan({ threshold: 0, pointers: 1 });
      hammer.add(pan);

      let initialPosition = new THREE.Vector3();

      hammer.on('panstart', () => {
        if (water) {
          initialPosition = water.position.clone();
        }
      });

      hammer.on('pan', (event) => {
        const deltaX = event.deltaX * 0.01;
        const deltaZ = event.deltaY * 0.01;
        if (water) {
          water.position.x = initialPosition.x + deltaX;
          water.position.z = initialPosition.z + deltaZ;
        }
      });

      // Optional: do something when pan ends
      hammer.on('panend', () => {
        console.log('Pan ended, water position:', water.position);
      });

      // Cleanup
      return () => {
        scene.remove(water);
        hammer.destroy();
      };
    };

    const cleanup = setupWaterBending();

    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [scene, domElement]);

  return null; // No DOM rendering, just Three.js logic
} 