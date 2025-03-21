'use client';

import { useEffect, useRef, forwardRef } from 'react';
import * as THREE from 'three';
import { WaterBendingMain, WaterBendingHandle } from './water/WaterBendingMain';

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
export const WaterBending = forwardRef<WaterBendingHandle, WaterBendingProps>(({ 
  scene, 
  domElement, 
  registerUpdate, 
  camera,
  isBendingRef,
  crosshairPositionRef,
  characterPositionRef
}, ref) => {
  // Create a local ref for imperative calls if ref is not provided
  const localRef = useRef<WaterBendingHandle | null>(null);
  
  // Use the forwarded ref if provided, otherwise use local ref
  const actualRef = ref || localRef;

  useEffect(() => {
    // Expose water bending functionality to the window for other components
    const waterBendingMainRef = (actualRef as React.RefObject<WaterBendingHandle>).current;
    if (waterBendingMainRef && waterBendingMainRef.collectionSystem) {
      (window as any).waterBendingSystem = {
        createWaterDrop: waterBendingMainRef.collectionSystem.createWaterDrop
      };
    }
    
    return () => {
      (window as any).waterBendingSystem = undefined;
    };
  }, [actualRef]);

  // Render the water bending functionality
  return (
    <WaterBendingMain 
      camera={camera}
      scene={scene}
      domElement={domElement}
      registerUpdate={registerUpdate}
      isBendingRef={isBendingRef}
      crosshairPositionRef={crosshairPositionRef}
      characterPositionRef={characterPositionRef}
      ref={actualRef}
    />
  );
});