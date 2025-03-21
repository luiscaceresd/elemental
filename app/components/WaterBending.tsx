'use client';

import { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { WaterBendingMain } from './water/WaterBendingMain';

interface WaterBendingProps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  domElement: HTMLCanvasElement;
  registerUpdate: (updateFn: ((delta: number) => void) & { _id?: string }) => () => void;
  isBendingRef: React.RefObject<boolean>;
  crosshairPositionRef: React.RefObject<THREE.Vector3>;
  characterPositionRef: React.RefObject<THREE.Vector3>;
}

/**
 * Main water bending component
 * This acts as a wrapper for the refactored WaterBendingMain component
 * which contains the core water bending functionality
 */
export function WaterBending({
  scene,
  camera,
  domElement,
  registerUpdate,
  characterPositionRef,
  isBendingRef,
  crosshairPositionRef
}: WaterBendingProps) {
  // Environment objects (would be populated in a real implementation)
  const environmentObjects = useRef<THREE.Object3D[]>([]);

  // Render the water bending functionality
  return (
    <WaterBendingMain
      camera={camera}
      characterPositionRef={characterPositionRef}
      isBendingRef={isBendingRef}
      crosshairPositionRef={crosshairPositionRef}
      scene={scene}
      environmentObjects={environmentObjects.current}
      registerUpdate={registerUpdate}
      domElement={domElement}
      debug={true}
    />
  );
}