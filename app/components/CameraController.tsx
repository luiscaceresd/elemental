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
        
        // Set initial orientation for mobile to match PC experience
        camera.rotation.x = 0.1; // Slight downward tilt to match PC
        camera.rotation.y = 0; // Initial forward direction
        camera.userData.hasBeenRotatedByUser = false; // Allow for automatic orientation

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

              // Skip tiny movements (less than 1px) to reduce jitter
              if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
                return;
              }

              // Rotate camera (yaw and pitch) with increased sensitivity
              // Increased from 0.002 to 0.005 for more responsive rotation
              camera.rotation.y -= deltaX * 0.005 * sensitivity;
              camera.rotation.x -= deltaY * 0.005 * sensitivity;

              // Clamp vertical rotation to prevent flipping
              camera.rotation.x = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, camera.rotation.x));

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

        // Mark the camera as rotated when user manually moves it
        const enhancedTouchMove = (event: TouchEvent) => {
          onTouchMove(event);
          
          // Mark the camera as having been manually rotated
          if (cameraControlTouchId.current !== null) {
            camera.userData.hasBeenRotatedByUser = true;
          }
        };

        // Replace the original touch move handler with enhanced one
        document.removeEventListener('touchmove', onTouchMove);
        document.addEventListener('touchmove', enhancedTouchMove, { passive: false });
        
        // Update cleanup to remove the correct handler
        cleanupFunctions.push(() => {
          document.removeEventListener('touchstart', onTouchStart);
          document.removeEventListener('touchmove', enhancedTouchMove);
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
        // Early returns with null checks combined for efficiency
        if (!targetRef.current || !controlObjectRef.current || cameraLockedRef.current) {
          return;
        }

        // Skip updates if nothing has changed
        const targetPosition = targetRef.current;
        
        // Cache frequently accessed values
        const cam = camera as THREE.PerspectiveCamera;
        
        // CRITICAL FIX: Update control object position to follow character immediately
        controlObjectRef.current.position.copy(targetPosition);

        // Calculate direction only once and reuse
        const direction = new THREE.Vector3(0, 0, -1);
        cam.getWorldDirection(direction);
        direction.negate(); // Reverse direction to position camera behind character

        // Create a horizontal direction (for left/right positioning) - only calculate once
        const horizontalDir = new THREE.Vector3(direction.x, 0, direction.z);
        // Only normalize if needed (optimization)
        if (horizontalDir.lengthSq() > 0.01) {
          horizontalDir.normalize();
        }

        // Calculate vertical angle (pitch) - clamped for better gameplay
        // Avoid expensive asin call if possible
        const verticalAngle = Math.max(-0.6, Math.min(0.6, Math.asin(direction.y)));

        // Precalculate values used multiple times
        const cosVerticalAngle = Math.cos(verticalAngle);
        const sinVerticalAngle = Math.sin(verticalAngle);

        // Calculate camera offset with fewer operations
        const horizontalDistance = (distanceFromCharacter + 2) * cosVerticalAngle;
        const heightOffset = (heightOffsetFromCharacter + 1) + distanceFromCharacter * sinVerticalAngle;
        
        // Mobile requires slightly higher camera position to avoid looking at the ground
        const adjustedHeightOffset = isMobile ? heightOffset + 1 : heightOffset;

        // Calculate final offset with fewer vector operations
        const offsetX = horizontalDir.x * horizontalDistance;
        const offsetY = adjustedHeightOffset;
        const offsetZ = horizontalDir.z * horizontalDistance;

        // Create target position - this puts the camera behind the character
        // Reuse vector objects to reduce garbage collection
        const targetCamPosition = _vec3.set(
          targetPosition.x + offsetX,
          targetPosition.y + offsetY,
          targetPosition.z + offsetZ
        );

        // Smooth camera movement with lerp - use faster movement for better response
        // Only lerp if the distance is significant enough to avoid jitter
        const distSquared = cam.position.distanceToSquared(targetCamPosition);
        if (distSquared > 0.01) {
          cam.position.lerp(targetCamPosition, 0.25);
        }

        // Only handle lookAt for mobile when necessary
        if (isMobile) {
          // Only set initial orientation if camera has never been rotated by user
          const hasNeverBeenManuallyRotated = !cam.userData.hasBeenRotatedByUser;
          if (hasNeverBeenManuallyRotated) {
            // Use the cached lookTarget to reduce object creation
            _lookTarget.set(
              targetPosition.x,
              targetPosition.y + 1.5, // Look at head level
              targetPosition.z - 5 // Look forward instead of directly at character
            );
            cam.lookAt(_lookTarget);
            
            // Initialize with a slight downward tilt (less than before)
            cam.rotation.x = 0.1; // Slight downward tilt, much less than default
          }
        }
      };

      // Create reusable vector objects to reduce garbage collection
      const _vec3 = new THREE.Vector3();
      const _lookTarget = new THREE.Vector3();

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