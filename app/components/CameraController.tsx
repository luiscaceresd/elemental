'use client';

import { useEffect, useRef } from 'react';
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
  const thetaRef = useRef(0); // Horizontal angle for camera rotation
  const lastMouseXRef = useRef(0); // Tracks last mouse X position

  useEffect(() => {
    if (!camera || !targetRef.current || !domElement) return;

    const setupCamera = async () => {
      const THREE = await import('three');

      // Set initial camera position
      camera.position.set(0, 10, 20);

      // Initialize lastMouseX to the center of the screen
      lastMouseXRef.current = window.innerWidth / 2;

      // Define the deadzone (in pixels)
      const deadzone = 1; // Adjust this value based on testing (e.g., 1-5 pixels)

      // Mouse move handler with deadzone
      const onMouseMove = (event: MouseEvent) => {
        const deltaX = event.clientX - lastMouseXRef.current;

        // Only rotate camera if movement exceeds deadzone
        if (Math.abs(deltaX) > deadzone) {
          thetaRef.current += deltaX * 0.005; // Sensitivity remains adjustable
        }

        lastMouseXRef.current = event.clientX;
      };

      // Add event listener to the canvas
      domElement.addEventListener('mousemove', onMouseMove);

      // Update camera position each frame
      const updateCameraPosition = (delta: number) => {
        if (!targetRef.current) return;
        const target = targetRef.current as THREE.Vector3;

        const distance = 15; // Distance from player
        const height = 8;    // Height above player

        // Calculate camera position based on horizontal angle (theta)
        const x = target.x + Math.sin(thetaRef.current) * distance;
        const z = target.z + Math.cos(thetaRef.current) * distance;
        const y = target.y + height;

        // Smoothly interpolate camera to the target position
        const targetPosition = new THREE.Vector3(x, y, z);
        camera.position.lerp(targetPosition, delta * 10); // Increased from 5 to 10 for smoother movement
        camera.lookAt(target); // Ensure camera always faces the player
      };
      updateCameraPosition._id = 'cameraFollow';

      // Register the update function with your game loop
      const removeUpdate = registerUpdate(updateCameraPosition);

      // Cleanup event listeners and update registration
      return () => {
        domElement.removeEventListener('mousemove', onMouseMove);
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