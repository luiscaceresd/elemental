'use client';

import { useRef, useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { WaterBendingMain } from './water/WaterBendingMain';

interface WaterBendingProps {
  player: {
    position: THREE.Vector3;
    rotation: THREE.Euler;
  };
}

/**
 * Main water bending component
 * This acts as a wrapper for the refactored WaterBendingMain component
 * which contains the core water bending functionality
 */
export function WaterBending({ player }: WaterBendingProps) {
  const { camera, scene } = useThree();
  
  // Environment objects (would be populated in a real implementation)
  const environmentObjects = useRef<THREE.Object3D[]>([]);
  
  // Render the water bending functionality
  return (
    <WaterBendingMain
      camera={camera}
      player={player}
      scene={scene}
      environmentObjects={environmentObjects.current}
    />
  );
}