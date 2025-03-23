import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

interface InputOptions {
  camera?: THREE.Camera;
  cameraDistance?: number;
  damping?: number;
  canvas?: HTMLCanvasElement;
}

export interface InputState {
  isClicking: boolean;
  isCharging: boolean;
  clickPosition: THREE.Vector2;
  chargeStartTime: number | null;
  chargePosition: THREE.Vector2 | null;
  chargeLevel: number;
}

export interface InputActions {
  onStartCharging: () => void;
  onCancelCharging: () => void;
  onShoot: (direction: THREE.Vector3) => void;
  onMove: (position: THREE.Vector3) => void;
}

export interface InputSystem {
  update: (delta: number) => void;
  getInputState: () => InputState;
  getRaycastDirection: () => THREE.Vector3 | null;
  cleanup: () => void;
}

/**
 * Hook to handle mouse and touch input for water bending
 */
export function useWaterBendingInput(
  actions: InputActions,
  options: InputOptions = {}
): InputSystem {
  const {
    camera,
    cameraDistance = 5,
    damping = 0.1,
    canvas
  } = options;
  
  // Input state
  const [inputState, setInputState] = useState<InputState>({
    isClicking: false,
    isCharging: false,
    clickPosition: new THREE.Vector2(),
    chargeStartTime: null,
    chargePosition: null,
    chargeLevel: 0
  });

  // Use refs to track current state in event handlers without dependencies
  const inputStateRef = useRef<InputState>(inputState);
  // Store click position as a separate ref to avoid triggering renders on mouse move
  const clickPositionRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  useEffect(() => {
    inputStateRef.current = inputState;
  }, [inputState]);
  
  // Raycaster for 3D position calculation
  const raycaster = useRef(new THREE.Raycaster());
  const rayDirection = useRef<THREE.Vector3 | null>(null);
  const targetElement = useRef<HTMLElement | null>(null);
  
  /**
   * Update the ray direction based on cursor position
   */
  const updateRayDirection = useCallback((x: number, y: number) => {
    if (!camera) {
      rayDirection.current = null;
      return;
    }
    
    // Update raycaster
    raycaster.current.setFromCamera(new THREE.Vector2(x, y), camera);
    
    // Get ray direction
    rayDirection.current = raycaster.current.ray.direction.clone();
  }, [camera]);
  
  /**
   * Get player position (estimated from camera)
   */
  const getPlayerPosition = useCallback(() => {
    if (!camera) {
      return new THREE.Vector3(0, 0, 0);
    }
    
    // Calculate player position based on camera
    const position = camera.position.clone();
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    
    // Player is in front of the camera
    position.add(direction.multiplyScalar(cameraDistance));
    
    return position;
  }, [camera, cameraDistance]);
  
  // Initialize event handlers
  useEffect(() => {
    // Determine target element for events
    targetElement.current = canvas || document.body;
    
    // Add event listeners
    const element = targetElement.current;
    
    const handleMouseDown = (e: MouseEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update refs directly to avoid renders
      clickPositionRef.current.set(x, y);
      
      // Perform single state update with all changes
      setInputState(prev => ({
        ...prev,
        isClicking: true,
        isCharging: true,
        clickPosition: new THREE.Vector2(x, y),
        chargeStartTime: Date.now(),
        chargePosition: new THREE.Vector2(x, y)
      }));
      
      // Start charging
      actions.onStartCharging();
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      // Use the ref to check current state
      if (!inputStateRef.current.isClicking) return;
      
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update ref directly without triggering state update
      clickPositionRef.current.set(x, y);
      
      // Calculate world ray and perform move action
      updateRayDirection(x, y);
      if (rayDirection.current) {
        const playerPosition = getPlayerPosition();
        actions.onMove(playerPosition);
      }
      
      // DO NOT update state here to avoid infinite loops
      // State will be updated in the update function
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      // Use the ref to check current state
      if (!inputStateRef.current.isClicking) return;
      
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update ref
      clickPositionRef.current.set(x, y);
      
      // If we were charging, shoot first
      if (inputStateRef.current.isCharging) {
        // Calculate direction and shoot
        updateRayDirection(x, y);
        
        if (rayDirection.current) {
          actions.onShoot(rayDirection.current);
        }
      }
      
      // Reset state in a single update
      setInputState(prev => ({
        ...prev,
        isClicking: false,
        isCharging: false,
        chargeStartTime: null,
        chargePosition: null,
        chargeLevel: 0,
        clickPosition: new THREE.Vector2(x, y)
      }));
    };
    
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      
      const touch = e.touches[0];
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update ref directly
      clickPositionRef.current.set(x, y);
      
      // Set state in single update
      setInputState(prev => ({
        ...prev,
        isClicking: true,
        isCharging: true,
        clickPosition: new THREE.Vector2(x, y),
        chargeStartTime: Date.now(),
        chargePosition: new THREE.Vector2(x, y)
      }));
      
      // Start charging
      actions.onStartCharging();
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0 || !inputStateRef.current.isClicking) return;
      
      const touch = e.touches[0];
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update ref directly without state update
      clickPositionRef.current.set(x, y);
      
      // Calculate world ray and perform move action
      updateRayDirection(x, y);
      if (rayDirection.current) {
        const playerPosition = getPlayerPosition();
        actions.onMove(playerPosition);
      }
      
      // DO NOT update state here to avoid infinite loops
    };
    
    const handleTouchEnd = (e: TouchEvent) => {
      if (!inputStateRef.current.isClicking) return;
      
      // Use last known position from ref
      const x = clickPositionRef.current.x;
      const y = clickPositionRef.current.y;
      
      // If we were charging, shoot first
      if (inputStateRef.current.isCharging) {
        // Calculate direction and shoot
        updateRayDirection(x, y);
        
        if (rayDirection.current) {
          actions.onShoot(rayDirection.current);
        }
      }
      
      // Reset state in a single update
      setInputState(prev => ({
        ...prev,
        isClicking: false,
        isCharging: false,
        chargeStartTime: null,
        chargePosition: null,
        chargeLevel: 0
      }));
    };
    
    const handleCancel = () => {
      // Cancel charging
      if (inputStateRef.current.isCharging) {
        actions.onCancelCharging();
        
        // Reset state
        setInputState(prev => ({
          ...prev,
          isClicking: false,
          isCharging: false,
          chargeStartTime: null,
          chargePosition: null,
          chargeLevel: 0
        }));
      }
    };
    
    // Add event listeners
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleCancel);
    
    element.addEventListener('touchstart', handleTouchStart);
    element.addEventListener('touchmove', handleTouchMove);
    element.addEventListener('touchend', handleTouchEnd);
    element.addEventListener('touchcancel', handleCancel);
    
    // Cleanup
    return () => {
      element.removeEventListener('mousedown', handleMouseDown);
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseup', handleMouseUp);
      element.removeEventListener('mouseleave', handleCancel);
      
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleCancel);
    };
  }, [actions, canvas, updateRayDirection, getPlayerPosition]);
  
  /**
   * Update input state (called in animation frame)
   */
  const update = useCallback((delta: number) => {
    // Use a local variable to track if we need to update state
    let needsStateUpdate = false;
    const stateUpdates = {} as Partial<InputState>;
    
    // Only update clickPosition from ref when needed (once per frame max)
    if (inputStateRef.current.isClicking && 
        (clickPositionRef.current.x !== inputStateRef.current.clickPosition.x || 
         clickPositionRef.current.y !== inputStateRef.current.clickPosition.y)) {
      
      // Just update the ref without triggering a state update for position
      // This avoids re-renders just for mouse position changes
      inputStateRef.current.clickPosition = clickPositionRef.current.clone();
    }
    
    // Update charge level if charging
    if (inputStateRef.current.isCharging && inputStateRef.current.chargeStartTime) {
      const chargeTime = Date.now() - inputStateRef.current.chargeStartTime;
      const maxChargeTime = 2000; // 2 seconds to full charge
      
      const newChargeLevel = Math.min(chargeTime / maxChargeTime, 1);
      
      // Only update if the value has changed significantly to reduce renders
      if (Math.abs(newChargeLevel - inputStateRef.current.chargeLevel) > 0.05) {
        needsStateUpdate = true;
        stateUpdates.chargeLevel = newChargeLevel;
        
        // Update the ref immediately
        inputStateRef.current.chargeLevel = newChargeLevel;
      }
    }
    
    // Only trigger React state update if something meaningful changed
    if (needsStateUpdate) {
      // Batch the React state update using rAF to avoid update loops
      requestAnimationFrame(() => {
        // Double-check we're not causing an update cycle
        if (!inputStateRef.current.isCharging && stateUpdates.chargeLevel) {
          // Don't update charge level if we're no longer charging
          delete stateUpdates.chargeLevel;
        }
        
        // Only update if we still have changes to make
        if (Object.keys(stateUpdates).length > 0) {
          setInputState(prev => ({
            ...prev,
            ...stateUpdates
          }));
        }
      });
    }
    
    // Update rayDirection if mouse position has changed
    if (inputStateRef.current.isClicking) {
      updateRayDirection(clickPositionRef.current.x, clickPositionRef.current.y);
    }
    
    // Return the current state from the ref for immediate use
    return inputStateRef.current;
  }, [updateRayDirection]);
  
  /**
   * Get current input state
   */
  const getInputState = useCallback(() => {
    return inputState;
  }, [inputState]);
  
  /**
   * Get current ray direction
   */
  const getRaycastDirection = useCallback(() => {
    return rayDirection.current;
  }, []);
  
  /**
   * Cleanup resources
   */
  const cleanup = useCallback(() => {
    // Nothing special to clean up here
  }, []);
  
  return {
    update,
    getInputState,
    getRaycastDirection,
    cleanup
  };
} 