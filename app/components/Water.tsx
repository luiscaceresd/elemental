'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface WaterProps {
  position: THREE.Vector3; // Initial position of the water
  scene: THREE.Scene;     // The Three.js scene to add the water to
}

export default function Water({ position, scene }: WaterProps) {
  const waterRef = useRef<THREE.Mesh | null>(null);

  useEffect(() => {
    // Dynamic import for client-side only libraries
    const setupWater = async () => {
      const THREE = await import('three');

      // Create a blue sphere to represent water
      const geometry = new THREE.SphereGeometry(1, 32, 32);

      // Create a shiny blue material for water with some transparency
      const material = new THREE.MeshPhysicalMaterial({
        color: 0x1E90FF,  // DodgerBlue color
        transparent: true,
        opacity: 0.8,
        roughness: 0.1,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1
      });

      const water = new THREE.Mesh(geometry, material);
      water.position.copy(position);
      water.userData.isWater = true; // Mark this object as water for later identification
      scene.add(water);
      waterRef.current = water;

      // Cleanup on component unmount
      return () => {
        scene.remove(water);
        geometry.dispose();
        material.dispose();
      };
    };

    const cleanup = setupWater();

    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [position, scene]);

  return null; // This is a Three.js object, so no DOM element is rendered
} 