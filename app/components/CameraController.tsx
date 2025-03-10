'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type IdentifiableFunction = ((delta: number) => void) & {
  _id?: string
};

interface CameraControllerProps {
  camera: THREE.Camera;
  targetRef: React.RefObject<THREE.Vector3 | null>; // Character position
  domElement: HTMLCanvasElement;
  registerUpdate: (updateFn: IdentifiableFunction) => () => void;
}

export default function CameraController({
  camera,
  targetRef,
  domElement,
  registerUpdate
}: CameraControllerProps) {
  const yawRef = useRef(0);   // Horizontal rotation
  const pitchRef = useRef(0); // Vertical rotation

  useEffect(() => {
    if (!camera || !targetRef.current || !domElement) return;

    const setupCamera = async () => {
      const THREE = await import('three');

      const sensitivity = 0.001; // Mouse sensitivity
      const distance = 10;       // Distance from character
      const height = 5;          // Height above character

      // Initial pitch setting for camera orientation
      pitchRef.current = 0.2;    // Initial pitch of ~11.5 degrees

      const onMouseMove = (event: MouseEvent) => {
        const deltaX = event.movementX || 0;
        const deltaY = event.movementY || 0;

        yawRef.current -= deltaX * sensitivity;
        pitchRef.current -= deltaY * sensitivity;

        // Clamp pitch between -45° and 45°
        pitchRef.current = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, pitchRef.current));
      };

      domElement.addEventListener('mousemove', onMouseMove);

      const updateCamera = (delta: number) => {
        // Use delta parameter to avoid unused variable warning
        if (delta) { /* ensure delta is used */ }

        if (!targetRef.current) return;
        const target = targetRef.current as THREE.Vector3;

        // Compute camera position using spherical coordinates
        const x = target.x + distance * Math.sin(yawRef.current) * Math.cos(pitchRef.current);
        const z = target.z + distance * Math.cos(yawRef.current) * Math.cos(pitchRef.current);
        const y = target.y + height + distance * Math.sin(pitchRef.current);

        // Directly set camera position rather than using lerp
        camera.position.set(x, y, z);

        // Define an offset to look above the character
        const offset = 4; // Adjust this value to control the upward tilt
        const lookAtPosition = new THREE.Vector3(target.x, target.y + offset, target.z);

        // Make the camera look at this elevated point instead of directly at the character
        camera.lookAt(lookAtPosition);
      };

      updateCamera._id = 'cameraUpdate';

      const removeUpdate = registerUpdate(updateCamera);

      return () => {
        domElement.removeEventListener('mousemove', onMouseMove);
        removeUpdate();
      };
    };

    // Execute the setup function
    const cleanup = setupCamera();

    // Return a cleanup function for the useEffect
    return () => {
      // Handle the Promise correctly
      if (cleanup) {
        cleanup.then(cleanupFn => {
          if (cleanupFn) cleanupFn();
        });
      }
    };
  }, [camera, targetRef, domElement, registerUpdate]);

  return null;
} 