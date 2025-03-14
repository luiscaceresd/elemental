'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

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
  isMobile?: boolean; // Whether device is mobile
}

export default function CameraController({
  camera,
  targetRef,
  domElement,
  registerUpdate,
  lockCamera = false,
  sensitivity = 0.3, // Default sensitivity
  distance = 10, // Default distance
  height = 2, // Default height
  isMobile = false
}: CameraControllerProps) {
  const controlsRef = useRef<PointerLockControls | null>(null);
  const controlObjectRef = useRef<THREE.Object3D | null>(null);
  const cameraLockedRef = useRef(lockCamera);

  // Mobile touch handling
  const cameraControlTouchId = useRef<number | null>(null);
  const previousTouchPosition = useRef<{ x: number; y: number } | null>(null);

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

      // Collection of cleanup functions
      const cleanupFunctions: (() => void)[] = [];

      if (isMobile) {
        // Set rotation order for consistency with PointerLockControls
        camera.rotation.order = 'YXZ';

        // Helper to check if touch is within joystick or jump button
        const isWithinControls = (target: EventTarget): boolean => {
          if (!(target instanceof Element)) return false;
          return !!(
            target.closest('#joystick-zone') || target.closest('#jump-button')
          );
        };

        // Touch event handlers
        const onTouchStart = (event: TouchEvent) => {
          if (cameraLockedRef.current) return;

          for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (!isWithinControls(touch.target as EventTarget) && cameraControlTouchId.current === null) {
              event.preventDefault(); // Prevent scrolling/zooming
              cameraControlTouchId.current = touch.identifier;
              previousTouchPosition.current = { x: touch.clientX, y: touch.clientY };
              break;
            }
          }
        };

        const onTouchMove = (event: TouchEvent) => {
          if (cameraLockedRef.current || cameraControlTouchId.current === null) return;

          for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === cameraControlTouchId.current) {
              event.preventDefault();

              const deltaX = touch.clientX - (previousTouchPosition.current?.x ?? touch.clientX);
              const deltaY = touch.clientY - (previousTouchPosition.current?.y ?? touch.clientY);

              // Rotate camera (yaw and pitch)
              camera.rotation.y -= deltaX * 0.002 * sensitivity;
              camera.rotation.x -= deltaY * 0.002 * sensitivity;

              // Clamp vertical rotation to prevent flipping
              camera.rotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, camera.rotation.x));

              previousTouchPosition.current = { x: touch.clientX, y: touch.clientY };
              break;
            }
          }
        };

        const onTouchEnd = (event: TouchEvent) => {
          for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (touch.identifier === cameraControlTouchId.current) {
              cameraControlTouchId.current = null;
              previousTouchPosition.current = null;
              break;
            }
          }
        };

        // Add touch event listeners
        document.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);

        cleanupFunctions.push(() => {
          document.removeEventListener('touchstart', onTouchStart);
          document.removeEventListener('touchmove', onTouchMove);
          document.removeEventListener('touchend', onTouchEnd);
        });
      } else {
        // Desktop setup with PointerLockControls
        const controls = new PointerLockControls(camera, domElement);

        // Store controls in ref for later use
        controlsRef.current = controls;

        // Set pointer speed for sensitivity
        try {
          // Use proper type casting for the controls object 
          (controls as PointerLockControls & { pointerSpeed: number }).pointerSpeed = sensitivity;
        } catch {
          // Could not set pointer speed, using default sensitivity
        }

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
            // Pointer is now locked
          } else {
            // Pointer is now unlocked
            controls.unlock();
          }
        };

        document.addEventListener('pointerlockchange', onPointerLockChange);

        cleanupFunctions.push(() => {
          domElement.removeEventListener('click', onClick);
          document.removeEventListener('pointerlockchange', onPointerLockChange);
          controls.dispose();
        });
      }

      // Configuration (using props)
      const distanceFromCharacter = distance;
      const heightOffsetFromCharacter = height;

      // Update function to position camera (same for both mobile and desktop)
      const updateCamera: IdentifiableFunction = () => {
        if (!targetRef.current) {
          return;
        }

        if (!controlObjectRef.current) {
          return;
        }

        if (cameraLockedRef.current) {
          return;
        }

        // CRITICAL FIX: Update control object position to follow character immediately
        controlObjectRef.current.position.copy(targetRef.current);

        // Get the direction the camera is facing from controls
        const direction = new THREE.Vector3(0, 0, -1);
        camera.getWorldDirection(direction);

        // We want the camera to position itself behind the character
        // Since we rotated the character to face -Z, we need to adjust our camera logic

        // Calculate camera offset based on current camera orientation
        // We need to negate the direction to position the camera behind the character
        direction.negate(); // Reverse direction to position camera behind character

        // Create a horizontal direction (for left/right positioning)
        const horizontalDir = new THREE.Vector3(direction.x, 0, direction.z);
        horizontalDir.normalize();

        // Calculate vertical angle (pitch) - clamped for better gameplay
        // Limit looking too far up or down to prevent disorientation
        const verticalAngle = Math.max(-0.6, Math.min(0.6, Math.asin(direction.y)));

        // Calculate camera offset - using a spring arm style approach
        // This is similar to how Unreal Engine handles third-person cameras
        // Increase the distance to ensure character is visible
        const horizontalDistance = (distanceFromCharacter + 2) * Math.cos(verticalAngle);

        // Add a fixed height offset to prevent top-down view
        // This ensures camera stays behind character, not directly above
        // Raise height slightly for better view of character
        const heightOffset = (heightOffsetFromCharacter + 1) + distanceFromCharacter * Math.sin(verticalAngle);

        // Calculate final offset - we're placing the camera BEHIND the character's new forward direction
        const offsetX = horizontalDir.x * horizontalDistance;
        const offsetY = heightOffset; // Fixed height plus vertical angle component
        const offsetZ = horizontalDir.z * horizontalDistance;

        const offset = new THREE.Vector3(offsetX, offsetY, offsetZ);

        // Create target position - this puts the camera behind the character
        const targetPosition = targetRef.current.clone().add(offset);

        // Smooth camera movement with lerp
        // Use a faster lerp value (0.2-0.3) for more responsive feel
        camera.position.lerp(targetPosition, 0.25);

        // Look at character (slightly above character's base)
        const lookTarget = new THREE.Vector3(
          targetRef.current.x,
          targetRef.current.y + 1.5, // Look at head level
          targetRef.current.z
        );

        // Only adjust lookAt for mobile (desktop uses PointerLockControls)
        if (isMobile) {
          // For mobile, adjust lookAt only when not actively rotating with touch
          if (cameraControlTouchId.current === null) {
            camera.lookAt(lookTarget);
          }
        }
      };

      updateCamera._id = 'pointerLockCameraUpdate';
      const removeUpdate = registerUpdate(updateCamera);
      cleanupFunctions.push(removeUpdate);

      return () => {
        cleanupFunctions.forEach(fn => fn());
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
  }, [camera, targetRef, domElement, registerUpdate, lockCamera, sensitivity, distance, height, isMobile]);

  return null;
} 