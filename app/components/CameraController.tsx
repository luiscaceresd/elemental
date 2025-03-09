'use client';

import { useEffect } from 'react';
import * as THREE from 'three';

type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

interface CameraControllerProps {
  camera: THREE.Camera;
  targetRef: React.RefObject<THREE.Vector3 | null>; // Reference to the position to follow
  domElement: HTMLCanvasElement; // For mouse/touch controls
  registerUpdate: (updateFn: IdentifiableFunction) => () => void;
}

export default function CameraController({
  camera,
  targetRef,
  domElement,
  registerUpdate
}: CameraControllerProps) {
  useEffect(() => {
    if (!camera || !targetRef.current || !domElement) return;

    const setupCamera = async () => {
      const THREE = await import('three');

      // Set initial camera position
      camera.position.set(0, 10, 20);

      const updateCameraPosition = (delta: number) => {
        if (!targetRef.current) return;

        const target = targetRef.current as THREE.Vector3;

        // Define the camera offset (behind and above the player)
        const offset = new THREE.Vector3(0, 8, 15);

        // Calculate the ideal camera position relative to the player
        const idealPosition = target.clone().add(offset);

        // Smoothly interpolate to the ideal position
        camera.position.lerp(idealPosition, delta * 2);

        // Always look at the player
        camera.lookAt(target);
      };
      updateCameraPosition._id = 'cameraFollow';

      const removeUpdate = registerUpdate(updateCameraPosition);

      return () => {
        removeUpdate();
      };
    };

    const cleanup = setupCamera();

    return () => {
      cleanup.then(cleanupFn => cleanupFn && cleanupFn());
    };
  }, [camera, targetRef, domElement, registerUpdate]);

  return null; // No visual rendering, just logic
} 