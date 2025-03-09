'use client';

import { useEffect } from 'react';
import * as THREE from 'three';

interface TreeProps {
  position: THREE.Vector3;
  scene: THREE.Scene;
}

export default function Tree({ position, scene }: TreeProps) {
  useEffect(() => {
    const setupTree = async () => {
      const THREE = await import('three');

      const treeGroup = new THREE.Group();

      // Curved trunk
      const points = [];
      for (let i = 0; i < 10; i++) {
        points.push(new THREE.Vector3(
          Math.sin(i * 0.2) * 0.5,
          i * 0.5,
          Math.cos(i * 0.3) * 0.5
        ));
      }
      const curve = new THREE.CatmullRomCurve3(points);
      const trunkGeometry = new THREE.TubeGeometry(curve, 20, 0.2, 8, false);
      const trunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
      const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
      treeGroup.add(trunk);

      // Fluffy leaves
      const leafGeometry = new THREE.IcosahedronGeometry(1, 0);
      const leafMaterial = new THREE.MeshPhongMaterial({ color: 0x228B22 });
      for (let i = 0; i < 5; i++) {
        const leaf = new THREE.Mesh(leafGeometry, leafMaterial);
        leaf.position.set(
          Math.random() * 2 - 1,
          5 + Math.random() * 2,
          Math.random() * 2 - 1
        );
        leaf.scale.setScalar(1 + Math.random() * 0.5);
        treeGroup.add(leaf);
      }

      treeGroup.position.copy(position);
      scene.add(treeGroup);

      // Return cleanup function
      return () => {
        scene.remove(treeGroup);
        trunkGeometry.dispose();
        trunkMaterial.dispose();
        leafGeometry.dispose();
        leafMaterial.dispose();
      };
    };

    // Initialize tree
    const cleanup = setupTree();

    // Cleanup on unmount
    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      });
    };
  }, [position, scene]);

  return null;
} 