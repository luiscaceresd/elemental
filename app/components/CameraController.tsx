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
  lockCamera?: boolean; // Optional prop to lock camera if needed
  sensitivity?: number; // Sensitivity for mouse movement (0.1 to 1.0)
  distance?: number; // Distance behind character
  height?: number; // Height above character
}

export default function CameraController({
  camera,
  targetRef,
  domElement,
  registerUpdate,
  lockCamera = false,
  sensitivity = 0.3, // Default sensitivity
  distance = 10, // Default distance
  height = 2 // Default height
}: CameraControllerProps) {
  const controlsRef = useRef<any>(null);
  const controlObjectRef = useRef<THREE.Object3D | null>(null);
  const cameraLockedRef = useRef(lockCamera);

  // Update camera locked status when prop changes
  useEffect(() => {
    cameraLockedRef.current = lockCamera;
  }, [lockCamera]);

  useEffect(() => {
    if (!camera || !targetRef.current || !domElement) return;

    const setupCamera = async () => {
      const THREE = await import('three');
      const { PointerLockControls } = await import('three/examples/jsm/controls/PointerLockControls.js');

      // Create a control object to manage rotation
      const controlObject = new THREE.Object3D();
      if (targetRef.current) {
        controlObject.position.copy(targetRef.current);
      }
      controlObjectRef.current = controlObject;

      // Initialize PointerLockControls with the camera
      const controls = new PointerLockControls(camera, domElement);

      // Try to access and modify internal pointer speed property
      try {
        // Using any type to bypass TypeScript's property checking
        const controlsAny = controls as any;
        controlsAny.pointerSpeed = sensitivity;
      } catch (e) {
        console.warn('Could not set pointer speed, using default sensitivity');
      }

      controlsRef.current = controls;

      // Configuration (using props)
      const distanceFromCharacter = distance;
      const heightOffsetFromCharacter = height;

      // Request pointer lock on click
      const onClick = () => {
        if (!cameraLockedRef.current) {
          controls.lock();
        }
      };
      domElement.addEventListener('click', onClick);

      // Handle pointer lock state changes
      const onPointerLockChange = () => {
        if (document.pointerLockElement === domElement) {
          console.log('Pointer locked');
        } else {
          console.log('Pointer unlocked');
          // Ensure controls are unlocked when pointer lock is exited
          if (controlsRef.current) {
            controlsRef.current.unlock();
          }
        }
      };
      document.addEventListener('pointerlockchange', onPointerLockChange);

      // Update function to position camera
      const updateCamera: IdentifiableFunction = (delta: number) => {
        if (!targetRef.current || !controlObjectRef.current || cameraLockedRef.current) return;

        // Update control object position to follow character
        controlObjectRef.current.position.copy(targetRef.current);

        // Get the direction the camera is facing from controls
        const direction = new THREE.Vector3(0, 0, -1);
        camera.getWorldDirection(direction);
        direction.negate(); // Reverse direction to position camera behind character

        // Create a horizontal direction (for left/right positioning)
        const horizontalDir = new THREE.Vector3(direction.x, 0, direction.z);
        horizontalDir.normalize();

        // Calculate vertical angle (pitch) - clamped for better gameplay
        // Limit looking too far up or down to prevent disorientation
        const verticalAngle = Math.max(-0.6, Math.min(0.6, Math.asin(direction.y)));

        // Calculate camera offset - using a spring arm style approach
        // This is similar to how Unreal Engine handles third-person cameras
        const horizontalDistance = distanceFromCharacter * Math.cos(verticalAngle);

        // Add a fixed height offset to prevent top-down view
        // This ensures camera stays behind character, not directly above
        const heightOffset = heightOffsetFromCharacter + distanceFromCharacter * Math.sin(verticalAngle);

        // Calculate final offset
        const offsetX = horizontalDir.x * horizontalDistance;
        const offsetY = heightOffset; // Fixed height plus vertical angle component
        const offsetZ = horizontalDir.z * horizontalDistance;

        const offset = new THREE.Vector3(offsetX, offsetY, offsetZ);

        // Position camera behind character based on camera direction
        camera.position.copy(targetRef.current).add(offset);

        // Look at character from current camera position
        // We don't override the camera's orientation here - otherwise controls won't work
        // Instead, we just position the camera in the right spot
      };
      updateCamera._id = 'pointerLockCameraUpdate';
      const removeUpdate = registerUpdate(updateCamera);

      return () => {
        domElement.removeEventListener('click', onClick);
        document.removeEventListener('pointerlockchange', onPointerLockChange);
        if (controlsRef.current) {
          controlsRef.current.dispose();
        }
        removeUpdate();
      };
    };

    const cleanup = setupCamera();

    return () => {
      if (cleanup) {
        cleanup.then(cleanupFn => {
          if (cleanupFn) cleanupFn();
        });
      }
    };
  }, [camera, targetRef, domElement, registerUpdate]);

  return null;
} 